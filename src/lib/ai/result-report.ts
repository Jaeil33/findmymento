import type { Dataset } from '@/lib/db/dataset'
import { gradeBandLabel, sessionReport, type SessionReport } from '@/lib/db/queries'
import {
  MIN_AGGREGATE_RESPONSES,
  callJsonLlm,
  containsAny,
  numbersWithin,
  sanitizeText,
} from '@/lib/ai/guard'
import { FIELDS, type Field, type LectureSession, type ResultReportDraft } from '@/types/domain'

/**
 * AI 결과보고서 초안 (기관·학교용) = **규칙 확정 + LLM 문장** 하이브리드 (ADR-024 기능 4).
 *
 * 담당자는 회차가 끝나면 만족도를 집계해 상급기관·학교에 낼 결과보고서를 손으로 쓴다.
 * 교안의 어색한 문장은 강사가 수업 전에 걸러내지만, **보고서의 틀린 숫자는 결재선을 타고
 * 올라간다.** 그래서 제목·개요·지표·고지문은 규칙이 확정하고, LLM 은 문장만 쓰며, 그 문장도
 * 숫자·이름 가드를 통과해야 남는다.
 *
 * **아무것도 저장하지 않는다.** 초안은 같은 집계에서 언제든 다시 만들 수 있다.
 * 응답 5건 미만 회차는 통계·학생 의견을 싣지 않고 LLM 도 부르지 않는다 (ADR-018).
 */

const LIST_LIMIT = 4
const SENTENCE_MAX = 120
const RECORD_MAX = 150
const QUOTE_MAX = 200
const QUOTE_LIMIT = 5
const TOP_FIELDS = 3

const NOTICE_DRAFT = '초안입니다. 수치와 표현을 확인한 뒤 사용하세요.'
const NOTICE_RECORD =
  '창체 기록 참고 문구는 학교가 주최·주관한 활동에만 쓸 수 있고, AI가 만든 문장을 학교생활기록부에 그대로 입력하면 안 됩니다(2026 기재요령). 강사명·기관명·상호명은 기재할 수 없어 넣지 않았습니다.'
const NOTICE_SMALL = `응답이 ${MIN_AGGREGATE_RESPONSES}건 미만이라 만족도·후속 의향·학생 의견을 싣지 않았습니다.`

/** 화면 가명(`중2 학생 A`) 형태. 단위는 회차이고 학생 개인을 지목하지 않는다 (ADR-024). */
const POINTS_AT_STUDENT_RE = /학생\s*[A-Z](?![A-Za-z])/
/** `[이름 삭제]` 같은 자리표시. 원문에 개인정보가 있었다는 뜻이므로 인용하지 않는다. */
const MASK_PLACEHOLDER_RE = /\[[^\]]*삭제\]/
/** 가명코드·번호로 보이는 네 자리 이상 숫자. */
const LONG_DIGITS_RE = /\d{4,}/
/** 문장 끝이 아닌 자리의 마침표·물음표·느낌표 — 두 문장 이상이다. */
const MULTI_SENTENCE_RE = /[.!?]\s*\S/

function findSession(ds: Dataset, sessionId: string): LectureSession | null {
  return ds.lectureSessions.find((s) => s.id === sessionId) ?? null
}

// ============================================================================
// 1. 규칙 — 숫자·개요·고지문은 여기서 확정된다
// ============================================================================

/**
 * LLM 과 규칙 초안에 쓸 수 있는 학생 인용.
 * maskForStorage 를 다시 통과해 원문과 같고, 금지 이름·자리표시·긴 숫자·학생 지목이 없는 것만.
 */
function usableQuotes(ds: Dataset, report: SessionReport): string[] {
  const banned = bannedNames(ds, report.session.id)
  const out: string[] = []
  for (const q of report.quotes) {
    const t = sanitizeText(q.text, QUOTE_MAX)
    if (t === null || out.includes(t)) continue
    if (containsAny(t, banned)) continue
    if (MASK_PLACEHOLDER_RE.test(t) || LONG_DIGITS_RE.test(t) || POINTS_AT_STUDENT_RE.test(t)) continue
    out.push(t)
    if (out.length >= QUOTE_LIMIT) break
  }
  return out
}

/** 회차가 없으면 null. 숫자·개요·고지문은 여기서 확정된다. */
export function ruleResultReport(ds: Dataset, sessionId: string): ResultReportDraft | null {
  const report = sessionReport(ds, sessionId)
  if (!report) return null

  const { session } = report
  const n = report.responseCount
  const sufficient = n >= MIN_AGGREGATE_RESPONSES
  const ratePct = Math.round(report.responseRate * 100)
  const fieldOrder = (f: string) => FIELDS.indexOf(f as Field)

  // '아직 잘 모르겠어요'는 분야가 아니다 — 수요 화면에서 따로 센다.
  const topFields = sufficient
    ? report.fieldCounts
        .filter((f) => (FIELDS as readonly string[]).includes(f.field))
        .sort((a, b) => b.count - a.count || fieldOrder(a.field) - fieldOrder(b.field))
        .slice(0, TOP_FIELDS)
        .map((f) => ({ field: f.field, count: f.count }))
    : []

  const metrics: ResultReportDraft['metrics'] = {
    response_count: n,
    expected: report.expected,
    response_rate_pct: ratePct,
    satisfaction_avg: sufficient ? Math.round(report.satisfactionAvg * 10) / 10 : null,
    followup_high_count: sufficient ? report.followupHighCount : null,
    followup_high_pct: sufficient ? Math.round(report.followupHighRate * 100) : null,
    top_fields: topFields,
  }

  const overview = [
    { label: '일시', value: session.held_on },
    { label: '장소', value: session.venue },
    { label: '대상', value: `${gradeBandLabel(session.grade_band)} 학생` },
    { label: '예상 인원', value: `${session.expected_students}명` },
    { label: '시수', value: `${session.duration_minutes}분` },
    { label: '분야', value: session.field },
    { label: '배정 강사', value: report.instructorName ?? '미배정' },
  ]

  const unassigned = session.instructor_id === null
  const unassignedNote = '배정 강사를 지정해야 강사가 교실에서 QR을 띄우고 리포트를 받을 수 있습니다.'

  let outcomes: string[]
  let studentVoice: string[]
  let improvements: string[]
  let nextSteps: string[]

  if (!sufficient) {
    outcomes = [
      `응답이 ${n}건으로 ${MIN_AGGREGATE_RESPONSES}건 미만이라 통계를 싣지 않습니다.`,
    ]
    studentVoice = []
    improvements = ['수업 마무리 3분 전에 QR 안내를 먼저 해 응답을 확보합니다.']
    if (unassigned) improvements.push(unassignedNote)
    nextSteps = [
      `다음 회차에서 응답을 ${MIN_AGGREGATE_RESPONSES}건 이상 모은 뒤 후속 과정 개설 여부를 판단합니다.`,
    ]
  } else {
    const top = topFields[0]
    outcomes = [
      `응답 ${n}건이 모여 예상 인원 ${report.expected}명 대비 응답률은 ${ratePct}%입니다.`,
      `만족도 평균은 5점 만점에 ${metrics.satisfaction_avg}점입니다.`,
      `더 배우고 싶다는 후속 의향 3점 이상 응답은 ${report.followupHighCount}건(${metrics.followup_high_pct}%)입니다.`,
    ]
    if (top) outcomes.push(`가장 많이 선택된 관심 분야는 ${top.field}(${top.count}건)입니다.`)

    // 인용이 없으면 비워 둔다 — 근거 없이 학생 의견을 쓰지 않는다.
    studentVoice = usableQuotes(ds, report)
      .slice(0, LIST_LIMIT)
      .map((q) => `“${q}”라는 의견이 있었습니다.`)

    // 임계치는 수업 회고 트리거와 같다 (docs/AI.md 기능 6, USER_FLOW H2).
    const lowSatisfaction = report.satisfactionDist
      .filter((d) => d.value <= 2)
      .reduce((a, d) => a + d.count, 0)
    improvements = []
    if (report.responseRate < 0.5) {
      improvements.push('응답률이 절반에 못 미쳐 다음 회차에는 수업 마무리 3분 전에 QR 안내를 먼저 합니다.')
    }
    if (report.followupHighRate < 0.4) {
      improvements.push('후속 의향 응답이 적어 수업 마무리에 다음 단계 교육 안내를 강화합니다.')
    }
    if (lowSatisfaction / n >= 0.2) {
      improvements.push('만족도 1·2점 응답이 적지 않아 어려워하는 학생을 위한 난이도 조절을 강사와 협의합니다.')
    }
    if (top && top.field !== session.field) {
      improvements.push(`관심 분야 1위(${top.field})가 회차 분야와 달라 마무리에 그 분야와 이어지는 직업 소개를 더합니다.`)
    }
    if (unassigned) improvements.push(unassignedNote)
    if (improvements.length === 0) {
      improvements.push('응답 결과를 강사와 공유해 다음 회차 운영에 반영합니다.')
    }
    improvements = improvements.slice(0, LIST_LIMIT)

    nextSteps =
      report.followupHighCount > 0
        ? [
            '후속 의향 3점 이상 응답의 관심 분야를 근거로 후속 과정 개설 여부를 검토합니다.',
            '후속 과정 강사가 필요하면 섭외 화면에서 요청을 직접 보냅니다.',
          ]
        : ['후속 의향 응답이 없어 이번 회차 결과만으로는 후속 과정을 검토하지 않고 다음 회차 응답을 더 모읍니다.']
  }

  const notices = [NOTICE_DRAFT, NOTICE_RECORD]
  if (!sufficient) notices.push(NOTICE_SMALL)

  return {
    session_id: session.id,
    title: `${session.title} 운영 결과보고(초안)`,
    overview,
    sample_sufficient: sufficient,
    metrics,
    outcomes,
    student_voice: studentVoice,
    improvements,
    next_steps: nextSteps,
    // 회차 분야와 활동 형태만. 학생 개인의 태도·성취, 숫자, 이름을 넣지 않는다 (2026 기재요령).
    record_reference: `진로활동으로 ${session.field} 분야 직업인 특강에 참여하여 관련 기술을 직접 체험하고 직업 세계를 탐색함.`,
    notices,
    source: 'rule',
  }
}

/** numbersWithin 에 넘길 허용 숫자: metrics 의 모든 수, top_fields 의 count, 시수, 예상 인원, 일시의 연·월·일, MIN_AGGREGATE_RESPONSES, 1~4 */
export function allowedNumbers(ds: Dataset, draft: ResultReportDraft): number[] {
  const m = draft.metrics
  const nums: (number | null)[] = [
    m.response_count,
    m.expected,
    m.response_rate_pct,
    m.satisfaction_avg,
    m.followup_high_count,
    m.followup_high_pct,
    ...m.top_fields.map((f) => f.count),
    MIN_AGGREGATE_RESPONSES,
    1,
    2,
    3,
    4,
  ]
  const session = findSession(ds, draft.session_id)
  if (session) {
    nums.push(session.duration_minutes, session.expected_students)
    nums.push(...session.held_on.split('-').map(Number))
  }
  return [...new Set(nums.filter((v): v is number => typeof v === 'number' && Number.isFinite(v)))]
}

/** LLM 문장에서 금지할 이름: 배정 강사명, 발주 기관명, 강사 소속 업체명 (없는 값은 빼고) */
export function bannedNames(ds: Dataset, sessionId: string): string[] {
  const session = findSession(ds, sessionId)
  if (!session) return []
  const org = ds.organizations.find((o) => o.id === session.org_id)
  const instructor = session.instructor_id
    ? ds.instructors.find((i) => i.id === session.instructor_id)
    : undefined
  const provider = instructor?.provider_id
    ? ds.providers.find((p) => p.id === instructor.provider_id)
    : undefined
  return [instructor?.name, org?.name, provider?.name].filter(
    (v): v is string => typeof v === 'string' && v.trim().length > 0,
  )
}

// ============================================================================
// 2. LLM — 규칙이 확정한 숫자 안에서 문장만
// ============================================================================

/**
 * LLM 에 보낼 입력. **표본 부족이면 null** — 이 경우 LLM 을 부르지 않는다.
 * 회차 제목·강사명·기관명·업체명·student_id·가명코드·개별 응답 행을 넣지 않는다.
 */
export function buildLlmPayload(ds: Dataset, draft: ResultReportDraft): Record<string, unknown> | null {
  if (!draft.sample_sufficient) return null
  const report = sessionReport(ds, draft.session_id)
  if (!report || report.responseCount < MIN_AGGREGATE_RESPONSES) return null

  const { session } = report
  const m = draft.metrics
  return {
    회차: {
      분야: session.field,
      학년대: gradeBandLabel(session.grade_band),
      시수_분: session.duration_minutes,
      장소: session.venue,
    },
    집계: {
      응답_수: m.response_count,
      예상_인원: m.expected,
      응답률_퍼센트: m.response_rate_pct,
      만족도_평균_5점만점: m.satisfaction_avg,
      후속의향_3점이상_수: m.followup_high_count,
      후속의향_3점이상_퍼센트: m.followup_high_pct,
      관심분야_상위: m.top_fields,
    },
    규칙_판단: { 개선점: draft.improvements, 후속_계획: draft.next_steps },
    학생_자유서술: usableQuotes(ds, report),
  }
}

const SYSTEM = `너는 학교·청소년기관 담당자가 상급기관·학교에 내는 특강 회차 결과보고서의 초안 문장을 쓴다.

주어진 회차 조건·집계·규칙 판단·학생 자유서술 **안에서만** 쓴다.

쓰는 것:
- outcomes: 성과 요약. 각 120자 이내, 최대 4개.
- student_voice: 학생 자유서술에서 드러난 의견 요약. 주어진 인용에 없는 의견을 만들지 않는다. 각 120자 이내, 최대 4개.
- improvements: 다음 회차에 고칠 점. 규칙 판단의 개선점을 벗어나지 않는다. 각 120자 이내, 최대 4개.
- next_steps: 후속 계획. 각 120자 이내, 최대 4개.
- record_reference: 창의적 체험활동 진로활동 기록 참고 문구. 회차 단위 활동을 서술한 한 문장, 150자 이내, "~함."으로 끝낸다. 숫자를 쓰지 않는다.

지켜야 할 것:
- 주어진 숫자만 쓴다. 숫자를 새로 계산하거나 "약 50%"처럼 바꿔 옮기지 않는다.
- 사람 이름·기관명·업체명·상호명·연락처·링크를 쓰지 않는다.
- 학생 개인을 지목하거나 태도·성취를 평가하지 않는다. 단위는 회차 전체다.
- 모집·정원·수강료·신청 폼을 다루지 않는다.
- 과장하지 않는다. "AI가 분석했다" 같은 말을 쓰지 않는다.
- 존댓말 보고서체(~했습니다, ~합니다)로 쓴다. record_reference만 "~함."으로 끝낸다.

출력은 JSON 하나만. 설명을 덧붙이지 않는다.
{"outcomes":[],"student_voice":[],"improvements":[],"next_steps":[],"record_reference":""}`

/** LLM 문장 한 줄이 규칙 밖의 숫자·금지 이름·학생 지목 없이 쓰였는지. */
function passesGuards(text: string, allowed: readonly number[], banned: readonly string[]): boolean {
  return (
    numbersWithin(text, allowed, FIELDS) &&
    !containsAny(text, banned) &&
    !POINTS_AT_STUDENT_RE.test(text)
  )
}

/** LLM 응답을 문장 필드에만 병합한다. 가드를 통과한 문장만 쓰고, 나머지는 규칙 문장을 유지한다. */
export function mergeLlmResultReport(
  draft: ResultReportDraft,
  raw: unknown,
  ctx: { allowed: number[]; banned: string[] },
): ResultReportDraft {
  // 표본 부족 회차는 LLM 을 부르지 않는다. 무엇이 들어와도 합치지 않는다.
  if (!draft.sample_sufficient) return draft
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return draft
  const o = raw as Record<string, unknown>

  const list = (v: unknown): string[] | null => {
    if (!Array.isArray(v)) return null
    const ok = v
      .map((x) => sanitizeText(x, SENTENCE_MAX))
      .filter((t): t is string => t !== null && passesGuards(t, ctx.allowed, ctx.banned))
    return ok.length > 0 ? ok.slice(0, LIST_LIMIT) : null
  }

  const outcomes = list(o.outcomes)
  // 인용할 자유서술이 없던 회차에서 LLM 이 쓴 학생 의견은 근거가 없다.
  const studentVoice = draft.student_voice.length > 0 ? list(o.student_voice) : null
  const improvements = list(o.improvements)
  const nextSteps = list(o.next_steps)

  // 창체 참고 문구는 숫자를 하나도 허용하지 않고, 한 문장이어야 한다.
  const ref = sanitizeText(o.record_reference, RECORD_MAX)
  const record =
    ref !== null && passesGuards(ref, [], ctx.banned) && !MULTI_SENTENCE_RE.test(ref) ? ref : null

  const adopted = [outcomes, studentVoice, improvements, nextSteps, record].some((v) => v !== null)

  return {
    ...draft,
    outcomes: outcomes ?? draft.outcomes,
    student_voice: studentVoice ?? draft.student_voice,
    improvements: improvements ?? draft.improvements,
    next_steps: nextSteps ?? draft.next_steps,
    record_reference: record ?? draft.record_reference,
    source: adopted ? 'llm' : 'rule',
  }
}

/** 어떤 경우에도 throw 하지 않는다. 회차가 없을 때만 null. */
export async function generateResultReport(
  ds: Dataset,
  sessionId: string,
): Promise<ResultReportDraft | null> {
  const draft = ruleResultReport(ds, sessionId)
  if (!draft) return null

  try {
    const payload = buildLlmPayload(ds, draft)
    if (!payload) return draft
    const raw = await callJsonLlm({ system: SYSTEM, payload, maxTokens: 2000 })
    if (raw === null) return draft
    return mergeLlmResultReport(draft, raw, {
      allowed: allowedNumbers(ds, draft),
      banned: bannedNames(ds, sessionId),
    })
  } catch {
    return draft
  }
}
