import type Anthropic from '@anthropic-ai/sdk'
import { createAnthropic } from '@/lib/ai/client'
import { maskForStorage } from '@/lib/moderation'
import { demoAiEnabled, demoSessionPlan } from '@/lib/ai/demo-writer'
import type { Dataset } from '@/lib/db/dataset'
import { approvedInstructors } from '@/lib/db/queries'
import {
  FIELDS,
  GRADE_BAND_LABEL,
  type Field,
  type GradeBand,
  type SessionPlanDraft,
} from '@/types/domain'

/**
 * AI 회차 기획 도우미 = **규칙 확정 + LLM 문장** 하이브리드 (ADR-021).
 *
 * 담당 선생님의 현재 대안은 꿈길도 크레존도 아니다 — **작년 파일을 열어 작년 업체에 전화하는
 * 것**이다. 비용 0 · 학습 0 · 리스크 0인 그 선택을 이기려면 더 좋은 강사를 보여주는 것으로는
 * 부족하고 지금 하는 일을 줄여야 한다.
 *
 * 후보 분야와 공급 수치는 **규칙이 확정한다.** LLM 은 문장만 만든다 — 관내에 없는 공급을
 * 있다고 말하는 순간 이 화면은 섭외 근거로 쓸 수 없게 된다.
 */

export type SessionPlanInput = {
  orgId: string
  regionCode: string
  gradeBand: GradeBand
  expectedStudents: number
  durationMinutes: number
  /** 담당자가 적은 목적. 자유 텍스트이므로 마스킹을 통과한 값만 LLM 에 간다. */
  purpose: string | null
}

// ============================================================================
// 1. 규칙 — 무엇을 열 수 있는지는 공급이 정한다
// ============================================================================

/** 그 지역에 실제로 있는 승인 강사의 분야별 공급 수. */
export function supplyCount(ds: Dataset, regionCode: string): Record<string, number> {
  const local = approvedInstructors(ds).filter((i) => i.region_code === regionCode)
  const counts: Record<string, number> = {}
  for (const f of FIELDS) counts[f] = 0
  for (const i of local) {
    for (const f of i.fields) counts[f] = (counts[f] ?? 0) + 1
  }
  return counts
}

/**
 * 관심은 모였는데 관내 공급이 0인 분야.
 * **이 숫자가 담당자에게는 예산 기안의 재료가 된다** — "관내 VR 관심 14명, 공급 0".
 */
export function unmetInterest(
  ds: Dataset,
  orgId: string,
  supply: Record<string, number>,
): { field: string; interest_count: number }[] {
  const sessionIds = new Set(
    ds.lectureSessions.filter((s) => s.org_id === orgId).map((s) => s.id),
  )
  const counts = new Map<string, number>()
  for (const r of ds.surveyResponses) {
    if (!sessionIds.has(r.session_id)) continue
    for (const f of r.interest_fields) {
      if (!(FIELDS as readonly string[]).includes(f)) continue
      counts.set(f, (counts.get(f) ?? 0) + 1)
    }
  }
  return [...counts.entries()]
    .filter(([f]) => (supply[f] ?? 0) === 0)
    .map(([field, interest_count]) => ({ field, interest_count }))
    .sort((a, b) => b.interest_count - a.interest_count)
}

/**
 * 열 수 있는 분야 중 이 기관의 관심이 가장 많은 것.
 * 공급이 0인 분야는 **후보가 될 수 없다** — 열 수 없는 회차를 제안하면 화면이 신뢰를 잃는다.
 */
export function pickField(
  ds: Dataset,
  orgId: string,
  supply: Record<string, number>,
): Field | null {
  const sessionIds = new Set(
    ds.lectureSessions.filter((s) => s.org_id === orgId).map((s) => s.id),
  )
  const counts = new Map<string, number>()
  for (const r of ds.surveyResponses) {
    if (!sessionIds.has(r.session_id)) continue
    for (const f of r.interest_fields) counts.set(f, (counts.get(f) ?? 0) + 1)
  }

  const available = FIELDS.filter((f) => (supply[f] ?? 0) > 0)
  if (available.length === 0) return null
  return (
    [...available].sort(
      (a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0) || a.localeCompare(b, 'ko'),
    )[0] ?? null
  )
}

const REQUIREMENTS_BY_FIELD: Record<string, string[]> = {
  드론: ['실내 비행 가능 기체 지참', '프로펠러 가드 필수', '학생 4~5명당 기체 1대'],
  '3D 모델링·프린팅': ['모델링 프로그램 사전 설치 안내', '출력 시간을 고려한 과제 크기 설계'],
  'VR·AR': ['기기 위생 관리(1인 1커버)', '1회 착용 15분 이내 운영'],
  'AI·코딩': ['학생 계정 없이 쓸 수 있는 도구 사용', '개인정보 입력 금지 사전 안내'],
  뷰티: ['1인 1세트 도구 지참', '패치 테스트 절차 포함'],
}

const PREP_BY_VENUE = ['전원 확보(멀티탭)', '책상 배치 계획', '학생 명단·가명코드 스티커 준비']

export function ruleDraft(ds: Dataset, input: SessionPlanInput): SessionPlanDraft {
  const supply = supplyCount(ds, input.regionCode)
  const field = pickField(ds, input.orgId, supply)
  const unmet = unmetInterest(ds, input.orgId, supply)
  const band = GRADE_BAND_LABEL[input.gradeBand]

  const rationale = field
    ? `관내 ${field} 공급 ${supply[field]}곳. ${band} ${input.expectedStudents}명 · ${input.durationMinutes}분이면 체험 1회로 운영할 수 있습니다.`
    : '관내에 승인된 강사 공급이 아직 없습니다. 인접 지역 강사를 찾거나 미충족 수요를 근거로 신규 강사를 발굴해야 합니다.'

  return {
    suggested_field: field,
    suggested_title: field ? `${field} 진로체험 특강` : '',
    suggested_duration: input.durationMinutes,
    rationale,
    instructor_requirements: field ? (REQUIREMENTS_BY_FIELD[field] ?? []) : [],
    preparations: PREP_BY_VENUE,
    unmet,
    supply_by_field: supply,
    source: 'rule',
  }
}

// ============================================================================
// 2. LLM — 규칙이 확정한 숫자 안에서 문장만
// ============================================================================

const SYSTEM = `너는 학교·청소년기관 담당자의 특강 기획을 돕는다.

주어진 공급 현황과 후보 분야 **안에서만** 쓴다. 관내에 없는 분야를 제안하지 않고, 주어진 숫자를 바꾸지 않는다.

쓰는 것:
- rationale: 왜 이 특강이 이 학년·이 조건에 맞는지. 두 문장 이내.
- instructor_requirements: 섭외할 강사에게 요구할 조건. 각 40자 이내, 최대 4개.
- preparations: 기관이 미리 준비할 것. 각 40자 이내, 최대 4개.

지켜야 할 것:
- 담당자가 읽는 문장이고 존댓말이다.
- 연락처·외부 링크·업체명·사람 이름을 쓰지 않는다.
- 공급이 0인 분야를 열 수 있다고 말하지 않는다.
- 과장하지 않는다. "AI가 분석했다" 같은 말을 쓰지 않는다.

출력은 JSON 하나만. 설명을 덧붙이지 않는다.
{"rationale":"...","instructor_requirements":["..."],"preparations":["..."]}`

function sanitize(raw: unknown, max: number): string | null {
  if (typeof raw !== 'string') return null
  const t = raw.trim().replace(/\s+/g, ' ')
  if (t.length === 0 || t.length > max) return null
  const masked = maskForStorage(t)
  if (masked === null || masked !== t) return null
  return t
}

function sanitizeList(raw: unknown, max: number, limit: number): string[] | null {
  if (!Array.isArray(raw)) return null
  const out = raw.map((v) => sanitize(v, max)).filter((v): v is string => v !== null)
  return out.length > 0 ? out.slice(0, limit) : null
}

/**
 * LLM 문장을 규칙 초안에 덮어쓴다.
 * **후보 분야·공급 수치·미충족 수요는 규칙 값을 그대로 유지한다** — LLM 이 건드릴 수 없다.
 */
export function mergeLlmDraft(draft: SessionPlanDraft, raw: unknown): SessionPlanDraft {
  if (typeof raw !== 'object' || raw === null) return draft
  const o = raw as Record<string, unknown>
  return {
    ...draft,
    rationale: sanitize(o.rationale, 200) ?? draft.rationale,
    instructor_requirements:
      sanitizeList(o.instructor_requirements, 60, 4) ?? draft.instructor_requirements,
    preparations: sanitizeList(o.preparations, 60, 4) ?? draft.preparations,
  }
}

/** 실패하면 `null`. 호출자는 규칙 초안으로 그대로 진행한다. */
async function refineByLlm(
  draft: SessionPlanDraft,
  input: SessionPlanInput,
): Promise<SessionPlanDraft | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  const hasKey = Boolean(apiKey && apiKey.trim() !== '')
  // 키가 없으면 데모 배포에서만 시연용 응답을 쓴다 (ADR-025). 아래 정리·병합은 똑같이 거친다.
  if (!hasKey && !demoAiEnabled()) return null
  // 열 수 있는 분야가 없으면 LLM 을 부르지 않는다. 할 말이 없는 상황이다.
  if (!draft.suggested_field) return null

  const payload = {
    조건: {
      학년대: GRADE_BAND_LABEL[input.gradeBand],
      인원: input.expectedStudents,
      시수_분: input.durationMinutes,
      목적: maskForStorage(input.purpose),
    },
    후보_분야: draft.suggested_field,
    관내_공급: draft.supply_by_field,
    미충족_수요: draft.unmet,
  }

  try {
    let text: string
    if (hasKey) {
      const client = createAnthropic(apiKey)
      const response = await client.messages.create(
        {
          model: process.env.ANTHROPIC_MODEL?.trim() || 'claude-opus-5',
          max_tokens: 1500,
          output_config: { effort: 'low' },
          system: SYSTEM,
          messages: [{ role: 'user', content: JSON.stringify(payload) }],
        },
        { timeout: 12_000, maxRetries: 1 },
      )

      text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('')
    } else {
      text = JSON.stringify(demoSessionPlan(payload))
    }

    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    if (start < 0 || end <= start) return null
    return mergeLlmDraft(draft, JSON.parse(text.slice(start, end + 1)))
  } catch {
    return null
  }
}

/** **어떤 경우에도 초안을 반환한다.** 예외를 던지지 않는다 (ADR-021). */
export async function generateSessionPlan(
  ds: Dataset,
  input: SessionPlanInput,
): Promise<SessionPlanDraft> {
  const draft = ruleDraft(ds, input)
  const refined = await refineByLlm(draft, input)
  return refined ? { ...refined, source: 'llm' } : draft
}
