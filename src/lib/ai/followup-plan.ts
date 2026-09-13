import type { Dataset } from '@/lib/db/dataset'
import { approvedInstructors, gradeBandLabel } from '@/lib/db/queries'
import { regionDistance, regionName } from '@/lib/region'
import {
  MIN_AGGREGATE_RESPONSES,
  callJsonLlm,
  containsAny,
  numbersWithin,
  sanitizeText,
} from '@/lib/ai/guard'
import {
  FIELDS,
  type Field,
  type FollowupCandidate,
  type FollowupPlanDraft,
  type LectureSession,
  type SurveyResponse,
} from '@/types/domain'

/**
 * AI 후속 과정 제안 + 섭외 요청 문안 (기관·학교용) = **규칙 확정 + LLM 문장** 하이브리드 (ADR-024 기능 5).
 *
 * 주 지표(기관의 섭외 요청 발송)로 가는 가장 짧은 길이다. 수요 숫자·분야·강사 후보가 한 화면에
 * 있으면 섭외 화면까지 한 단계다. 그래도 **발송은 사람이 한다** — 섭외 요청은 기관 이름으로 나가는
 * 요청이고, 보낼지 말지가 곧 기관의 판단이다.
 *
 * - 강사 후보는 규칙이 고르고 정렬은 거리 → 이름뿐이다. 소속 업체·구독·결제 여부를 쓰지 않는다 (ADR-009).
 * - 모집·정원·수강료·신청 폼을 다루지 않는다. 그 순간 학원법 등록 대상이 된다 (ADR-023).
 * - **아무것도 저장하지 않는다.** `recruitment_requests` 도 만들지 않는다.
 * - 응답 5건 미만이면 수요를 판단하지 않고 LLM 도 부르지 않는다 (ADR-018).
 */

const CANDIDATE_LIMIT = 3
const SESSION_COUNT = 4
const TITLE_MAX = 40
const OUTLINE_LINE_MAX = 60
const MESSAGE_MAX = 400
const QUOTE_MAX = 200
const QUOTE_LIMIT = 5

/**
 * 설문 Q7 선택지 중 실제 시간대 (SURVEY.md). '잘 모르겠어요'는 시간대가 아니므로 1위 후보가 아니고,
 * 목록 밖 값은 섭외 문안에 실리지 않게 세지 않는다.
 */
const TIME_SLOTS: readonly string[] = ['평일 방과후', '토요일', '일요일', '방학 중']

/** 플랫폼이 직접 모집·수납하는 것처럼 읽히는 단어 (ADR-023). LLM 문장에 있으면 버린다. */
const ENROLLMENT_WORDS = ['수강료', '정원', '결제', '모집', '신청서']

const NOTICE_DRAFT = '초안입니다. 내용을 확인한 뒤 섭외 요청 화면에서 직접 보내세요.'
const NOTICE_NO_ENROLLMENT =
  '플랫폼은 학생 모집·정원·수강료를 다루지 않습니다. 참여 학생 안내와 운영은 기관이 합니다.'
const NOTICE_NO_SUPPLY =
  '관내·인접 지역에 이 분야 승인 강사가 없습니다. 미충족 수요로 남으며, 신규 강사 발굴의 근거가 됩니다.'

/** 화면 가명(`중2 학생 A`) 형태. 단위는 회차이고 학생 개인을 지목하지 않는다. */
const POINTS_AT_STUDENT_RE = /학생\s*[A-Z](?![A-Za-z])/
/** `[이름 삭제]` 같은 자리표시. 원문에 개인정보가 있었다는 뜻이므로 인용하지 않는다. */
const MASK_PLACEHOLDER_RE = /\[[^\]]*삭제\]/
/** 가명코드·번호로 보이는 네 자리 이상 숫자. */
const LONG_DIGITS_RE = /\d{4,}/

type Demand = NonNullable<ReturnType<typeof followupDemand>>

function findSession(ds: Dataset, sessionId: string): LectureSession | null {
  return ds.lectureSessions.find((s) => s.id === sessionId) ?? null
}

function isField(v: string): v is Field {
  return (FIELDS as readonly string[]).includes(v)
}

/** 가장 많이 나온 값. 동률이면 가나다순. 한 응답 안의 중복은 호출자가 먼저 걷어낸다. */
function topOf<T extends string>(values: readonly T[]): { value: T; count: number } | null {
  const counts = new Map<T, number>()
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1)
  let best: { value: T; count: number } | null = null
  for (const [value, count] of counts) {
    if (
      best === null ||
      count > best.count ||
      (count === best.count && value.localeCompare(best.value, 'ko') < 0)
    ) {
      best = { value, count }
    }
  }
  return best
}

// ============================================================================
// 1. 규칙 — 수요·후보·과정안·문안은 여기서 확정된다
// ============================================================================

/**
 * 회차가 없으면 null. 후속 의향 3점 이상(high) 응답만으로 분야·시간 1위를 센다.
 * **표본 임계치는 여기서 걸지 않는다** — ruleFollowupPlan 이 건다. 이 값을 그대로 화면에 쓰지 않는다.
 */
export function followupDemand(
  ds: Dataset,
  sessionId: string,
): { total: number; high: number; field: Field | null; fieldCount: number; topTime: string | null } | null {
  if (!findSession(ds, sessionId)) return null

  const rows = ds.surveyResponses.filter((r) => r.session_id === sessionId)
  const highRows = rows.filter((r) => r.followup_intent >= 3)

  // '아직 잘 모르겠어요'·목록 밖 값은 분야가 아니다.
  const field = topOf(highRows.flatMap((r) => [...new Set(r.interest_fields)].filter(isField)))
  const time = topOf(highRows.flatMap((r) => [...new Set(r.available_times)].filter((t) => TIME_SLOTS.includes(t))))

  return {
    total: rows.length,
    high: highRows.length,
    field: field?.value ?? null,
    fieldCount: field?.count ?? 0,
    topTime: time?.value ?? null,
  }
}

/**
 * 기관 지역에서 regionDistance <= 2 인 승인 강사 중 field 를 가진 사람. 거리 오름차순 → 이름(ko) 오름차순. 최대 3.
 * 소속 업체·구독·결제·교안 보유 여부로 정렬·필터하지 않는다 (ADR-009). 연락처를 읽지 않는다.
 */
export function followupCandidates(ds: Dataset, orgId: string, field: Field): FollowupCandidate[] {
  const org = ds.organizations.find((o) => o.id === orgId)
  if (!org) return []

  return approvedInstructors(ds)
    .filter((i) => i.fields.includes(field))
    .map((i) => ({
      instructor_id: i.id,
      name: i.name,
      region_label: regionName(i.region_code),
      distance: regionDistance(org.region_code, i.region_code),
    }))
    .filter((c) => c.distance <= 2)
    .sort((a, b) => a.distance - b.distance || a.name.localeCompare(b.name, 'ko'))
    .slice(0, CANDIDATE_LIMIT)
}

/** LLM 문장에서 금지할 이름: 모든 승인 강사명 + 배정 강사명 + 업체명 + 발주 기관명. */
function bannedNames(ds: Dataset, session: LectureSession): string[] {
  const org = ds.organizations.find((o) => o.id === session.org_id)
  const assigned = session.instructor_id
    ? ds.instructors.find((i) => i.id === session.instructor_id)
    : undefined
  const names = [
    ...approvedInstructors(ds).map((i) => i.name),
    assigned?.name,
    ...ds.providers.map((p) => p.name),
    org?.name,
  ]
  return [...new Set(names.filter((v): v is string => typeof v === 'string' && v.trim().length > 0))]
}

/** numbersWithin 에 넘길 허용 숫자: total · high · fieldCount · 원 회차 시수 · 1~4 · MIN_AGGREGATE_RESPONSES. */
function allowedNumbers(session: LectureSession, demand: Demand): number[] {
  return [
    ...new Set([
      demand.total,
      demand.high,
      demand.fieldCount,
      session.duration_minutes,
      1,
      2,
      3,
      4,
      MIN_AGGREGATE_RESPONSES,
    ]),
  ]
}

/** 문안·LLM 입력에 실어도 되는 회차 제목. 이름·연락처·학교명이 섞였으면 null. */
function usableTitle(ds: Dataset, session: LectureSession): string | null {
  const t = sanitizeText(session.title, 100)
  return t !== null && !containsAny(t, bannedNames(ds, session)) ? t : null
}

function ruleOutline(field: Field, minutes: number): string[] {
  return [
    `1차시(${minutes}분) · ${field} 기초: 원리와 안전 수칙 익히기`,
    `2차시(${minutes}분) · 실습: 특강에서 해 본 활동을 직접 이어 가기`,
    `3차시(${minutes}분) · 소그룹 프로젝트: 모둠별 결과물 만들기`,
    `4차시(${minutes}분) · 결과 공유와 진로 탐색: 관련 직업 알아보기`,
  ]
}

/** 기관명 대신 "저희 기관". 강사명·학생 정보·연락처·링크를 넣지 않는다. 400자를 넘으면 제목을 뺀다. */
function ruleRequestMessage(
  title: string | null,
  demand: Demand & { field: Field },
  minutes: number,
): string {
  // 제목이 이미 '특강'으로 끝나면 '특강'을 덧붙이지 않는다.
  const where = (t: string | null) =>
    t === null ? '지난 특강' : t.endsWith('특강') ? `「${t}」` : `「${t}」 특강`
  const build = (t: string | null) =>
    [
      '안녕하세요.',
      `저희 기관에서 진행한 ${where(t)}에 응답 ${demand.total}건이 모였고, 그중 ${demand.high}건이 더 배우고 싶다고 답했습니다.`,
      `더 배우고 싶다는 응답 가운데 ${demand.fieldCount}건이 ${demand.field} 분야에 관심을 보였습니다.`,
      `이를 바탕으로 회당 ${minutes}분, ${SESSION_COUNT}차시 ${demand.field} 후속 과정을 검토하고 있습니다.`,
      demand.topTime ? `학생들이 가장 많이 고른 참여 가능 시간은 ${demand.topTime}입니다.` : null,
      '진행 가능 여부와 가능한 일정을 회신해 주시면 감사하겠습니다.',
    ]
      .filter((s): s is string => s !== null)
      .join(' ')

  const withTitle = build(title)
  return withTitle.length <= MESSAGE_MAX ? withTitle : build(null)
}

export function ruleFollowupPlan(ds: Dataset, sessionId: string): FollowupPlanDraft | null {
  const session = findSession(ds, sessionId)
  const demand = followupDemand(ds, sessionId)
  if (!session || !demand) return null

  const notices = [NOTICE_DRAFT, NOTICE_NO_ENROLLMENT]
  const empty = {
    session_id: session.id,
    eligible: false,
    response_count: demand.total,
    supply_status: 'none' as const,
    candidates: [],
    suggested_title: '',
    outline: [],
    request_message: '',
    notices,
    source: 'rule' as const,
  }

  if (demand.total < MIN_AGGREGATE_RESPONSES) {
    return {
      ...empty,
      reason: `응답이 ${demand.total}건입니다. 응답이 ${MIN_AGGREGATE_RESPONSES}건 이상 모여야 후속 수요를 판단합니다.`,
      demand_count: 0,
      field: null,
      field_interest_count: 0,
      top_time: null,
    }
  }

  if (demand.high === 0) {
    return {
      ...empty,
      reason: `응답 ${demand.total}건 중 더 배우고 싶다는 응답이 없습니다. 이번 회차 결과만으로는 후속 과정을 제안하지 않습니다.`,
      demand_count: 0,
      field: null,
      field_interest_count: 0,
      top_time: null,
    }
  }

  if (demand.field === null) {
    return {
      ...empty,
      reason: `더 배우고 싶다는 응답 ${demand.high}건에 신산업 분야 선택이 없어 후속 과정 분야를 정할 수 없습니다.`,
      demand_count: demand.high,
      field: null,
      field_interest_count: 0,
      top_time: demand.topTime,
    }
  }

  const field = demand.field
  const candidates = followupCandidates(ds, session.org_id, field)
  const available = candidates.length > 0
  if (!available) notices.push(NOTICE_NO_SUPPLY)

  return {
    session_id: session.id,
    eligible: true,
    reason: null,
    response_count: demand.total,
    demand_count: demand.high,
    field,
    field_interest_count: demand.fieldCount,
    top_time: demand.topTime,
    supply_status: available ? 'available' : 'none',
    candidates,
    suggested_title: `${field} 심화 과정`,
    outline: ruleOutline(field, session.duration_minutes),
    request_message: available
      ? ruleRequestMessage(usableTitle(ds, session), { ...demand, field }, session.duration_minutes)
      : '',
    notices,
    source: 'rule',
  }
}

// ============================================================================
// 2. LLM — 규칙이 확정한 수요·후보 안에서 제목·차시·문안 문장만
// ============================================================================

/** high 응답의 want_to_learn 중 마스킹을 통과해 원문과 같고, 이름·자리표시·긴 숫자·학생 지목이 없는 것. */
function usableQuotes(rows: SurveyResponse[], banned: readonly string[]): string[] {
  const out: string[] = []
  for (const r of rows) {
    if (r.followup_intent < 3) continue
    const t = sanitizeText(r.want_to_learn, QUOTE_MAX)
    if (t === null || out.includes(t)) continue
    if (containsAny(t, banned)) continue
    if (MASK_PLACEHOLDER_RE.test(t) || LONG_DIGITS_RE.test(t) || POINTS_AT_STUDENT_RE.test(t)) continue
    out.push(t)
    if (out.length >= QUOTE_LIMIT) break
  }
  return out
}

/** 강사명·기관명·업체명·student_id·가명코드·개별 응답 행을 넣지 않는다. 후보도 넣지 않는다. */
function buildLlmPayload(ds: Dataset, session: LectureSession, demand: Demand): Record<string, unknown> {
  const title = usableTitle(ds, session)
  return {
    원_회차: {
      ...(title ? { 제목: title } : {}),
      분야: session.field,
      학년대: gradeBandLabel(session.grade_band),
      시수_분: session.duration_minutes,
    },
    후속_수요: {
      응답_수: demand.total,
      후속의향_3점이상_수: demand.high,
      관심분야_1위: demand.field,
      관심분야_1위_응답_수: demand.fieldCount,
      참여가능시간_1위: demand.topTime,
    },
    과정안_형식: { 차시_수: SESSION_COUNT, 회당_분: session.duration_minutes },
    학생_자유서술: usableQuotes(
      ds.surveyResponses.filter((r) => r.session_id === session.id),
      bannedNames(ds, session),
    ),
  }
}

const SYSTEM = `너는 학교·청소년기관 담당자가 지역 강사에게 보낼 후속 과정 섭외 요청의 초안 문장을 쓴다.

주어진 원 회차 조건·후속 수요 집계·학생 자유서술 **안에서만** 쓴다.

쓰는 것:
- suggested_title: 후속 과정 제목. 40자 이내.
- outline: 차시별 한 줄. 정확히 ${SESSION_COUNT}개, 각 60자 이내. 기초 → 실습 → 소그룹 프로젝트 → 결과 공유와 진로 탐색 순서.
- request_message: 강사에게 보내는 섭외 요청 문안. 400자 이내. 수요 근거(응답 수·관심 응답 수), 참여 가능 시간(주어졌을 때만), 차시 수·회당 시간, 진행 가능 여부와 일정 회신 요청을 담는다. 기관은 "저희 기관"이라고 쓴다.

지켜야 할 것:
- 주어진 숫자만 쓴다. 숫자를 새로 계산하거나 "약 20명"처럼 바꿔 옮기지 않는다.
- 사람 이름·기관명·업체명·연락처·링크를 쓰지 않는다.
- 학생 개인을 지목하거나 평가하지 않는다. 단위는 회차 전체다.
- 학생 모집·정원·수강료·결제·신청서를 다루지 않는다. 참여 학생 안내와 운영은 기관이 한다.
- 과장하지 않는다. 존댓말로 쓴다.

출력은 JSON 하나만. 설명을 덧붙이지 않는다.
{"suggested_title":"","outline":[],"request_message":""}`

/** LLM 문장 한 줄이 규칙 밖의 숫자·금지 이름·모집 관련 단어·학생 지목 없이 쓰였는지. */
function passesGuards(text: string, ctx: { allowed: number[]; banned: string[] }): boolean {
  return (
    numbersWithin(text, ctx.allowed, FIELDS) &&
    !containsAny(text, ctx.banned) &&
    !containsAny(text, ENROLLMENT_WORDS) &&
    !POINTS_AT_STUDENT_RE.test(text)
  )
}

/**
 * LLM 응답을 suggested_title·outline·request_message 에만 병합한다. 가드를 통과한 필드만 쓰고
 * 나머지는 규칙 값을 유지한다. 수요·분야·후보·고지문은 **어떤 입력이 와도** 바뀌지 않는다.
 */
export function mergeLlmFollowupPlan(
  draft: FollowupPlanDraft,
  raw: unknown,
  ctx: { allowed: number[]; banned: string[] },
): FollowupPlanDraft {
  // 제안하지 않는 회차·공급 0 회차는 LLM 을 부르지 않는다. 무엇이 들어와도 합치지 않는다.
  if (!draft.eligible || draft.supply_status !== 'available') return draft
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return draft
  const o = raw as Record<string, unknown>

  const text = (v: unknown, max: number): string | null => {
    const t = sanitizeText(v, max)
    return t !== null && passesGuards(t, ctx) ? t : null
  }

  const title = text(o.suggested_title, TITLE_MAX)

  // 차시는 한 줄이라도 걸리거나 개수가 다르면 통째로 규칙 값을 쓴다 — 섞으면 흐름이 끊긴다.
  const lines =
    Array.isArray(o.outline) && o.outline.length === draft.outline.length
      ? o.outline.map((v) => text(v, OUTLINE_LINE_MAX))
      : null
  const outline = lines !== null && lines.every((l): l is string => l !== null) ? lines : null

  const message = text(o.request_message, MESSAGE_MAX)

  const adopted = title !== null || outline !== null || message !== null

  return {
    ...draft,
    suggested_title: title ?? draft.suggested_title,
    outline: outline ?? draft.outline,
    request_message: message ?? draft.request_message,
    source: adopted ? 'llm' : 'rule',
  }
}

/** 어떤 경우에도 throw 하지 않는다. 회차가 없을 때만 null. eligible 이 false 면 LLM 을 부르지 않는다. */
export async function generateFollowupPlan(
  ds: Dataset,
  sessionId: string,
): Promise<FollowupPlanDraft | null> {
  const draft = ruleFollowupPlan(ds, sessionId)
  if (!draft) return null
  if (!draft.eligible || draft.supply_status !== 'available') return draft

  try {
    const session = findSession(ds, sessionId)
    const demand = followupDemand(ds, sessionId)
    if (!session || !demand) return draft

    const raw = await callJsonLlm({
      system: SYSTEM,
      payload: buildLlmPayload(ds, session, demand),
      maxTokens: 1500,
    })
    if (raw === null) return draft
    return mergeLlmFollowupPlan(draft, raw, {
      allowed: allowedNumbers(session, demand),
      banned: bannedNames(ds, session),
    })
  } catch {
    return draft
  }
}
