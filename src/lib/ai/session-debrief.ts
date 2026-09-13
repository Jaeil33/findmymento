import type { Dataset } from '@/lib/db/dataset'
import { gradeBandLabel, sessionReport } from '@/lib/db/queries'
import {
  MIN_AGGREGATE_RESPONSES,
  callJsonLlm,
  containsAny,
  numbersWithin,
  sanitizeText,
} from '@/lib/ai/guard'
import { bannedNames } from '@/lib/ai/result-report'
import { demoDebrief } from '@/lib/ai/demo-writer'
import { FIELDS, type Field, type LectureSession, type SessionDebriefDraft } from '@/types/domain'

/**
 * AI 수업 회고 + 학교 제출용 결과 요약 (배정 강사용) = **규칙 트리거 + LLM 문장** 하이브리드 (ADR-024 기능 6).
 *
 * 강사는 수업이 끝나면 무엇이 통했고 무엇을 바꿀지 돌아보고, 학교에 낼 결과 요약을 따로 쓴다.
 * 지표와 **무엇을 지적할지**(트리거)는 규칙이 정하고, LLM 은 그 항목의 문장만 다듬는다.
 *
 * - 회고는 **강사 자신을 위한 집계**다. 점수·등급·순위 같은 강사 평가 표현을 만들지 않는다.
 * - 학생 개인을 평가하지 않는다. 학생 인용문을 요약·LLM 입력에 넣지 않는다 — 학교에 제출되는
 *   문서에 학생 문장이 들어가면 작성자를 추정할 수 있다.
 * - 교안(`lesson_plans`)은 단계의 구분·제목만 읽는다. 고치지 않는다 (ADR-019).
 * - **아무것도 저장하지 않는다.** 응답 5건 미만이면 통계를 싣지 않고 LLM 도 부르지 않는다 (ADR-018).
 *
 * 권한(배정 강사 확인)은 이 모듈이 하지 않는다 — 라우트가 한다.
 */

const LIST_LIMIT = 3
const ITEM_MAX = 100
const SUMMARY_MAX = 400
const TITLE_MAX = 100
const STEP_TITLE_MAX = 80

/** 트리거 임계치 (docs/AI.md 기능 6). 후속 의향 40% 는 USER_FLOW H2 목표치다. */
const HIGH_SATISFACTION_PCT = 70
const FOLLOWUP_HIGH_PCT = 40
const LOW_SATISFACTION_PCT = 20
const RESPONSE_RATE_PCT = 50

const NOTICE_DRAFT = '초안입니다. 수업의 최종 판단과 책임은 강사에게 있습니다.'
const NOTICE_AGGREGATE = '학생 개인을 평가하는 내용이 아니라 이 회차 응답의 집계입니다.'
const NOTICE_SMALL = `응답이 ${MIN_AGGREGATE_RESPONSES}건 미만이라 통계를 싣지 않았습니다.`

const SMALL_CHANGE = `응답이 ${MIN_AGGREGATE_RESPONSES}건 미만입니다. 다음 회차에는 수업 마무리 3분 전에 QR 안내를 먼저 하세요.`

/** 강사를 평가하는 표현. LLM 문장에 있으면 버린다 — 소수 지역 강사 풀에서 낙인이 된다. */
const EVALUATION_WORDS = ['점수', '등급', '순위', '평점']
/** 화면 가명(`중2 학생 A`) 형태. 단위는 회차이고 학생 개인을 지목하지 않는다. */
const POINTS_AT_STUDENT_RE = /학생\s*[A-Z](?![A-Za-z])/

function findSession(ds: Dataset, sessionId: string): LectureSession | null {
  return ds.lectureSessions.find((s) => s.id === sessionId) ?? null
}

// ============================================================================
// 1. 규칙 — 지표·트리거·요약·고지문은 여기서 확정된다
// ============================================================================

/** 신산업 분야 중 가장 많이 고른 것. 동률이면 분야 목록 순서. '아직 잘 모르겠어요'는 분야가 아니다. */
function topField(counts: readonly { field: string; count: number }[]): Field | null {
  const order = (f: string) => FIELDS.indexOf(f as Field)
  const top = counts
    .filter((c) => (FIELDS as readonly string[]).includes(c.field))
    .sort((a, b) => b.count - a.count || order(a.field) - order(b.field))[0]
  return top ? (top.field as Field) : null
}

/** 요약에 실어도 되는 회차 제목. 이름·연락처가 섞였거나 너무 길면 null. */
function usableTitle(ds: Dataset, session: LectureSession): string | null {
  const t = sanitizeText(session.title, TITLE_MAX)
  return t !== null && !containsAny(t, bannedNames(ds, session.id)) ? t : null
}

function summaryHead(ds: Dataset, session: LectureSession): string {
  const title = usableTitle(ds, session)
  const name = title === null ? '이번 특강' : `「${title}」`
  return `${name} 수업 결과 요약입니다. 일시 ${session.held_on} · 대상 ${gradeBandLabel(session.grade_band)} 학생 · 시수 ${session.duration_minutes}분.`
}

/** 회차가 없으면 null. 트리거는 화면에 보이는 정수 %로 판정한다 — 표시된 숫자와 판정이 어긋나지 않게. */
export function ruleDebrief(ds: Dataset, sessionId: string): SessionDebriefDraft | null {
  const report = sessionReport(ds, sessionId)
  if (!report) return null

  const { session } = report
  const n = report.responseCount
  const ratePct = Math.round(report.responseRate * 100)
  const notices = [NOTICE_DRAFT, NOTICE_AGGREGATE]

  if (n < MIN_AGGREGATE_RESPONSES) {
    notices.push(NOTICE_SMALL)
    return {
      session_id: session.id,
      sample_sufficient: false,
      metrics: {
        response_count: n,
        response_rate_pct: ratePct,
        satisfaction_avg: null,
        high_satisfaction_pct: null,
        low_satisfaction_pct: null,
        followup_high_pct: null,
        top_field: null,
      },
      went_well: [],
      change_next: [SMALL_CHANGE],
      school_summary: [
        summaryHead(ds, session),
        `학생 설문 응답은 ${n}건입니다.`,
        `응답이 ${MIN_AGGREGATE_RESPONSES}건 미만이라 만족도·후속 의향·관심 분야 통계는 싣지 않았습니다.`,
      ].join(' '),
      notices,
      source: 'rule',
    }
  }

  const satCount = (pred: (v: number) => boolean) =>
    report.satisfactionDist.filter((d) => pred(d.value)).reduce((a, d) => a + d.count, 0)
  const avg = Math.round(report.satisfactionAvg * 10) / 10
  const highSat = Math.round((satCount((v) => v >= 4) / n) * 100)
  const lowSat = Math.round((satCount((v) => v <= 2) / n) * 100)
  const followupHigh = Math.round(report.followupHighRate * 100)
  const top = topField(report.fieldCounts)

  const wentWell: string[] = []
  if (highSat >= HIGH_SATISFACTION_PCT) {
    wentWell.push(`만족도 4·5점 응답이 ${highSat}%로, 대부분의 학생이 수업을 좋게 받아들였습니다.`)
  }
  if (followupHigh >= FOLLOWUP_HIGH_PCT) {
    wentWell.push(`더 배우고 싶다는 후속 의향 3점 이상 응답이 ${followupHigh}%입니다. 후속 과정 제안의 근거가 됩니다.`)
  }
  if (wentWell.length === 0) {
    wentWell.push(`응답 ${n}건을 모아 이 회차 학생들의 반응을 집계할 수 있었습니다.`)
  }

  // 순서가 우선순위다. 넷 다 걸리면 앞의 셋만 남는다.
  const changeNext: string[] = []
  if (followupHigh < FOLLOWUP_HIGH_PCT) {
    changeNext.push(`후속 의향 3점 이상 응답이 ${followupHigh}%입니다. 마무리에 후속 과정·관련 직업 같은 다음 단계 안내를 넣어 보세요.`)
  }
  if (lowSat >= LOW_SATISFACTION_PCT) {
    changeNext.push(`만족도 1·2점 응답이 ${lowSat}%입니다. 수업 설계 도우미 교안의 '어려워하는 학생' 분기를 앞 단계에 넣어 보세요.`)
  }
  // 조사가 받침에 따라 틀리지 않도록 "관심 분야 1위: {분야}" 형태로 쓴다.
  if (top !== null && top !== session.field) {
    changeNext.push(`관심 분야 1위: ${top}. 마무리에 이 분야와 이어지는 직업을 소개해 보세요.`)
  }
  if (ratePct < RESPONSE_RATE_PCT) {
    changeNext.push(`응답률이 ${ratePct}%입니다. QR 안내를 수업 종료 3분 전에 해 보세요.`)
  }

  return {
    session_id: session.id,
    sample_sufficient: true,
    metrics: {
      response_count: n,
      response_rate_pct: ratePct,
      satisfaction_avg: avg,
      high_satisfaction_pct: highSat,
      low_satisfaction_pct: lowSat,
      followup_high_pct: followupHigh,
      top_field: top,
    },
    went_well: wentWell.slice(0, LIST_LIMIT),
    change_next: changeNext.slice(0, LIST_LIMIT),
    // 강사명·기관명·학생 인용문을 넣지 않는다. 학교에 제출되는 문서다.
    school_summary: [
      summaryHead(ds, session),
      `학생 설문 응답은 ${n}건(응답률 ${ratePct}%)이고, 만족도 평균은 5점 만점에 ${avg}점입니다.`,
      `더 배우고 싶다는 후속 의향 3점 이상 응답은 ${followupHigh}%입니다.`,
      top !== null ? `관심 분야 1위: ${top}.` : '관심 분야 1위: 없음(신산업 분야를 고른 응답이 없음).',
      '학생 개인이 아닌 회차 전체 응답의 집계입니다.',
    ].join(' '),
    notices,
    source: 'rule',
  }
}

/** numbersWithin 에 넘길 허용 숫자: 지표 전부 · 시수 · 예상 인원 · 일시의 연·월·일 · 트리거 임계치 · 3(분) · 5(만점·임계) · 1·2·4 */
function allowedNumbers(session: LectureSession, m: SessionDebriefDraft['metrics']): number[] {
  const nums: (number | null)[] = [
    m.response_count,
    m.response_rate_pct,
    m.satisfaction_avg,
    m.high_satisfaction_pct,
    m.low_satisfaction_pct,
    m.followup_high_pct,
    session.duration_minutes,
    session.expected_students,
    ...session.held_on.split('-').map(Number),
    FOLLOWUP_HIGH_PCT,
    RESPONSE_RATE_PCT,
    HIGH_SATISFACTION_PCT,
    LOW_SATISFACTION_PCT,
    3,
    5,
    1,
    2,
    4,
  ]
  return [...new Set(nums.filter((v): v is number => typeof v === 'number' && Number.isFinite(v)))]
}

// ============================================================================
// 2. LLM — 규칙이 정한 항목 안에서 문장만
// ============================================================================

/**
 * 그 회차 **배정 강사 본인의** 교안에서 단계의 구분·제목만. 다른 강사의 교안은 읽지 않는다 (ADR-019).
 * 본문·난이도 분기·학급 대응 문장은 넣지 않는다.
 */
function lessonPlanSteps(ds: Dataset, session: LectureSession, banned: readonly string[]) {
  if (session.instructor_id === null) return []
  const plan = ds.lessonPlans
    .filter((p) => p.session_id === session.id && p.instructor_id === session.instructor_id)
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0]
  if (!plan) return []

  const out: { 구분: string; 제목: string }[] = []
  for (const step of plan.steps) {
    const title = sanitizeText(step.title, STEP_TITLE_MAX)
    if (title === null || containsAny(title, banned)) continue
    out.push({ 구분: step.phase, 제목: title })
  }
  return out
}

/** 학생 인용문·student_id·가명코드·강사명·기관명·업체명·회차 제목을 넣지 않는다. */
function buildLlmPayload(
  ds: Dataset,
  session: LectureSession,
  draft: SessionDebriefDraft,
): Record<string, unknown> {
  const m = draft.metrics
  const steps = lessonPlanSteps(ds, session, bannedNames(ds, session.id))
  return {
    회차: {
      일시: session.held_on,
      분야: session.field,
      학년대: gradeBandLabel(session.grade_band),
      시수_분: session.duration_minutes,
      장소: session.venue,
      학급_특성: session.class_traits,
    },
    지표: {
      응답_수: m.response_count,
      응답률_퍼센트: m.response_rate_pct,
      만족도_평균_5점만점: m.satisfaction_avg,
      '만족도_4·5점_퍼센트': m.high_satisfaction_pct,
      '만족도_1·2점_퍼센트': m.low_satisfaction_pct,
      후속의향_3점이상_퍼센트: m.followup_high_pct,
      관심분야_1위: m.top_field,
    },
    규칙_판단: { 잘된_점: draft.went_well, 바꿀_점: draft.change_next },
    ...(steps.length > 0 ? { 교안_단계: steps } : {}),
  }
}

const SYSTEM = `너는 진로체험 특강을 마친 강사가 자기 수업을 돌아보는 회고 초안과, 학교·기관에 제출할 수업 결과 요약 초안의 문장을 쓴다.

주어진 회차 조건·지표·규칙 판단·교안 단계 **안에서만** 쓴다.

쓰는 것:
- went_well: 잘 된 점. 규칙 판단의 잘된_점 항목을 다듬는다. 항목을 늘리지 않는다. 각 100자 이내.
- change_next: 다음에 바꿀 점. 규칙 판단의 바꿀_점 항목을 다듬는다. 항목을 늘리지 않고, 비어 있으면 빈 배열로 둔다. 교안 단계가 주어지면 어느 단계에서 바꿀지 쓴다. 각 100자 이내.
- school_summary: 학교·기관에 제출할 수업 결과 요약. 400자 이내. 일시·대상 학년대·시수·응답 수·응답률·만족도 평균(5점 만점)·후속 의향 3점 이상 비율·관심 분야 1위를 담는다.

지켜야 할 것:
- 주어진 숫자만 쓴다. 숫자를 새로 계산하거나 "약 50%"처럼 바꿔 옮기지 않는다.
- 사람 이름·기관명·업체명·학교명·연락처·링크를 쓰지 않는다.
- 강사를 점수·등급·순위로 평가하지 않는다. 회고는 강사 자신을 위한 집계다.
- 학생 개인을 지목하거나 평가하지 않는다. 단위는 회차 전체다.
- 과장하지 않는다. "AI가 분석했다" 같은 말을 쓰지 않는다.
- 존댓말로 쓴다.

출력은 JSON 하나만. 설명을 덧붙이지 않는다.
{"went_well":[],"change_next":[],"school_summary":""}`

/** LLM 문장 한 줄이 규칙 밖의 숫자·금지 이름·강사 평가 표현·학생 지목 없이 쓰였는지. */
function passesGuards(text: string, ctx: { allowed: number[]; banned: string[] }): boolean {
  return (
    numbersWithin(text, ctx.allowed, FIELDS) &&
    !containsAny(text, ctx.banned) &&
    !containsAny(text, EVALUATION_WORDS) &&
    !POINTS_AT_STUDENT_RE.test(text)
  )
}

/**
 * LLM 응답을 went_well·change_next·school_summary 에만 병합한다. 가드를 통과한 문장만 쓰고, 통과 문장이
 * 0개인 필드는 규칙 값을 유지한다. metrics·sample_sufficient·notices·session_id 는 바뀌지 않는다.
 */
export function mergeLlmDebrief(
  draft: SessionDebriefDraft,
  raw: unknown,
  ctx: { allowed: number[]; banned: string[] },
): SessionDebriefDraft {
  // 표본 부족 회차는 LLM 을 부르지 않는다. 무엇이 들어와도 합치지 않는다.
  if (!draft.sample_sufficient) return draft
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return draft
  const o = raw as Record<string, unknown>

  const ok = (t: string | null): t is string => t !== null && passesGuards(t, ctx)

  // 항목은 규칙 트리거가 정한다 — LLM 은 규칙 항목 수를 넘길 수 없고, 규칙이 비운 목록을 채울 수 없다.
  const list = (v: unknown, rule: readonly string[]): string[] | null => {
    const limit = Math.min(LIST_LIMIT, rule.length)
    if (limit === 0 || !Array.isArray(v)) return null
    const kept = v.map((x) => sanitizeText(x, ITEM_MAX)).filter(ok)
    return kept.length > 0 ? kept.slice(0, limit) : null
  }

  const wentWell = list(o.went_well, draft.went_well)
  const changeNext = list(o.change_next, draft.change_next)
  const s = sanitizeText(o.school_summary, SUMMARY_MAX)
  const summary = ok(s) ? s : null

  const adopted = wentWell !== null || changeNext !== null || summary !== null

  return {
    ...draft,
    went_well: wentWell ?? draft.went_well,
    change_next: changeNext ?? draft.change_next,
    school_summary: summary ?? draft.school_summary,
    source: adopted ? 'llm' : 'rule',
  }
}

/** 어떤 경우에도 throw 하지 않는다. 회차가 없을 때만 null. 표본 부족이면 LLM 을 부르지 않는다. */
export async function generateDebrief(
  ds: Dataset,
  sessionId: string,
): Promise<SessionDebriefDraft | null> {
  const draft = ruleDebrief(ds, sessionId)
  if (!draft) return null
  if (!draft.sample_sufficient) return draft

  try {
    const session = findSession(ds, sessionId)
    if (!session) return draft

    const raw = await callJsonLlm({
      system: SYSTEM,
      payload: buildLlmPayload(ds, session, draft),
      maxTokens: 1500,
      demo: demoDebrief,
    })
    if (raw === null) return draft
    return mergeLlmDebrief(draft, raw, {
      allowed: allowedNumbers(session, draft.metrics),
      banned: bannedNames(ds, sessionId),
    })
  } catch {
    return draft
  }
}
