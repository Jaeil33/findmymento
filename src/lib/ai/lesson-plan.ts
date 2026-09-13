import Anthropic from '@anthropic-ai/sdk'
import { maskForStorage } from '@/lib/moderation'
import type { Dataset } from '@/lib/db/dataset'
import {
  GRADE_BAND_LABEL,
  type ClassTrait,
  type LectureSession,
  type LessonPlan,
  type LessonPlanInputs,
  type LessonStep,
  type PriorFeedback,
  type Program,
} from '@/types/domain'

/**
 * AI 수업 설계 도우미 = **규칙 조립 + LLM 문장** 하이브리드 (ADR-017).
 *
 * 규칙이 입력을 결정론적으로 확정하고 골격까지 만든다. LLM 은 그 골격의 문장을 구체화할 뿐이고
 * 단계를 새로 만들거나 없앨 수 없다.
 *
 * **LLM 실패·키 없음·타임아웃이면 규칙 골격을 그대로 반환한다.** 강사는 수업 전날 밤에 이 화면을
 * 연다. 그때 에러가 뜨면 다시 열지 않는다.
 *
 * 이 파일이 지켜야 하는 것:
 * - 학급 특성은 `session.class_traits`(회차 단위)에서만 온다. 학생 개인 레코드를 읽지 않는다 (ADR-016).
 * - 과거 설문은 **집계만**, 그리고 **5건 이상일 때만** 쓴다 (ADR-018).
 * - 자유서술은 마스킹을 통과한 값만 LLM 에 보낸다 (E-08).
 */

/** k-익명성 최소 임계치. 이 밑으로는 집계가 특정 학생 한 명의 답이 된다 (ADR-018). */
export const PRIOR_MIN_RESPONSES = 5

// ============================================================================
// 1. 규칙 — 입력 조립
// ============================================================================

/**
 * 같은 기관 + 같은 분야의 지난 회차 설문 집계.
 * **응답 합계가 {@link PRIOR_MIN_RESPONSES} 미만이면 `null`** — 프롬프트에서 통째로 빠진다.
 */
export function priorFeedback(
  ds: Dataset,
  orgId: string,
  field: string,
  excludeSessionId: string,
): PriorFeedback | null {
  const sessions = ds.lectureSessions.filter(
    (s) => s.org_id === orgId && s.field === field && s.id !== excludeSessionId,
  )
  if (sessions.length === 0) return null

  const ids = new Set(sessions.map((s) => s.id))
  const rows = ds.surveyResponses.filter((r) => ids.has(r.session_id))
  if (rows.length < PRIOR_MIN_RESPONSES) return null

  const interest = new Map<string, number>()
  for (const r of rows) {
    for (const f of r.interest_fields) interest.set(f, (interest.get(f) ?? 0) + 1)
  }

  return {
    session_count: sessions.length,
    response_count: rows.length,
    avg_satisfaction:
      Math.round((rows.reduce((a, r) => a + r.satisfaction, 0) / rows.length) * 10) / 10,
    followup_ratio:
      Math.round((rows.filter((r) => r.followup_intent >= 3).length / rows.length) * 100) / 100,
    top_interests: [...interest.entries()]
      .map(([f, count]) => ({ field: f, count }))
      .sort((a, b) => b.count - a.count || a.field.localeCompare(b.field, 'ko'))
      .slice(0, 4),
    repeated_phrases: repeatedPhrases(rows.map((r) => r.want_to_learn)),
  }
}

/**
 * 자유서술에서 **두 번 이상** 나온 표현만.
 *
 * 한 번만 나온 말은 버린다 — 개인이 쓴 문장이 그대로 프롬프트에 실리는 것을 막기 위해서다.
 * 마스킹이 값을 바꾼 응답(연락처·이름이 섞여 있던 응답)은 통째로 제외한다.
 */
function repeatedPhrases(texts: (string | null)[]): string[] {
  const count = new Map<string, number>()
  for (const raw of texts) {
    const masked = maskForStorage(raw)
    if (masked === null || masked !== (raw ?? null)) continue
    for (const token of masked.split(/[\s,./()]+/)) {
      const t = token.trim()
      if (t.length < 2 || t.length > 12) continue
      count.set(t, (count.get(t) ?? 0) + 1)
    }
  }
  return [...count.entries()]
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ko'))
    .slice(0, 6)
    .map(([t]) => t)
}

export function buildInputs(ds: Dataset, session: LectureSession): LessonPlanInputs {
  const program = pickProgram(ds, session)
  return {
    session_title: session.title,
    field: session.field,
    grade_band: session.grade_band,
    expected_students: session.expected_students,
    duration_minutes: session.duration_minutes,
    venue: session.venue,
    class_traits: session.class_traits,
    equipment: session.equipment,
    program_title: program?.title ?? null,
    program_outline: program?.outline ?? [],
    prior: priorFeedback(ds, session.org_id, session.field, session.id),
  }
}

/** 배정 강사가 등록한 프로그램 중 같은 분야·같은 학년대인 것. 없으면 분야만 맞춰 고른다. */
function pickProgram(ds: Dataset, session: LectureSession): Program | null {
  if (!session.instructor_id) return null
  const mine = ds.programs.filter((p) => p.instructor_id === session.instructor_id)
  return (
    mine.find((p) => p.field === session.field && p.target_grades.includes(session.grade_band)) ??
    mine.find((p) => p.field === session.field) ??
    null
  )
}

// ============================================================================
// 2. 규칙 — 골격 생성 (LLM 이 없어도 반드시 나오는 것)
// ============================================================================

/**
 * 특성별 기본 대응.
 *
 * 전부 **활동을 어떻게 바꾸는가**에 대한 문장이다. 진단명·상태에 대한 서술을 넣지 않는다 —
 * 교안은 강사와 기관이 같이 보는 문서이고, 여기에 특정 학생을 추정할 수 있는 문장이 들어가면
 * 회차 단위로 특성을 붙여 둔 의미가 사라진다 (ADR-016).
 */
const TRAIT_DEFAULT: Record<ClassTrait, string> = {
  '통합학급 포함': '짝 활동으로 바꾸고 역할을 둘로 나눕니다 (조작 담당 · 기록 담당).',
  '휠체어 사용 학생 있음': '앉은 자리에서 끝낼 수 있는 형태로 바꾸고 통로 옆 앞자리를 비워 둡니다.',
  '청각 보조 필요': '구두 설명과 같은 내용을 화면이나 칠판에 글로 함께 띄웁니다.',
  '시각 보조 필요': '화면 대신 실물을 만져 확인하게 하고 색 대비와 글자 크기를 키웁니다.',
  '한국어 보조 필요': '핵심 용어를 그림·아이콘과 함께 제시하고 지시문을 짧은 문장으로 나눕니다.',
  '첫 경험 다수': '첫 시도 전에 교사 시범을 한 번 더 넣고 성공 기준을 낮게 잡습니다.',
  '경험자 다수': '기본 과제를 건너뛸 수 있게 하고 바로 심화 과제로 보냅니다.',
  '집중 지속이 짧은 편': '한 단계를 10분 이내로 쪼개고 사이에 자리에서 일어나는 전환을 넣습니다.',
}

const SAFETY_BY_FIELD: Record<string, string[]> = {
  드론: [
    '실내·실외 모두 프로펠러 가드를 장착합니다.',
    '이착륙 구역을 테이프로 표시하고 그 안에서만 띄웁니다.',
  ],
  '3D 모델링·프린팅': [
    '노즐과 베드는 식은 뒤에만 만지게 합니다.',
    '출력물 제거는 교사가 하거나 교사가 보는 앞에서 합니다.',
  ],
  'VR·AR': [
    '1회 착용 시간이 15분을 넘지 않게 합니다.',
    '착용 중에는 앉은 상태를 유지하고 주변 1m를 비웁니다.',
  ],
  'AI·코딩': [
    '생성 결과를 그대로 제출하지 않고 근거를 확인하게 합니다.',
    '실명·연락처 등 개인정보를 입력하지 않도록 먼저 안내합니다.',
  ],
  뷰티: [
    '피부에 닿는 제품은 패치 테스트 후에만 사용합니다.',
    '도구는 1인 1세트로 배분하고 공용하지 않습니다.',
  ],
}

/**
 * 한국어 조사. `드론로 오늘` 같은 문장이 나오면 강사는 이 도구를 신뢰하지 않는다.
 * 받침 유무로 고른다 — `으로/로` 는 ㄹ 받침도 `로` 를 쓴다.
 */
function josa(word: string, kind: '을를' | '으로' | '이가'): string {
  const last = word.trim().slice(-1)
  const code = last.charCodeAt(0)
  const hangul = code >= 0xac00 && code <= 0xd7a3
  // 한글이 아니면(숫자·영문) 판단하지 않고 병기한다.
  if (!hangul) return kind === '을를' ? '을(를)' : kind === '으로' ? '(으)로' : '이(가)'
  const jong = (code - 0xac00) % 28
  if (kind === '을를') return jong === 0 ? '를' : '을'
  if (kind === '이가') return jong === 0 ? '가' : '이'
  return jong === 0 || jong === 8 ? '로' : '으로'
}

/**
 * 차시 제목 정리. 강사 프로그램의 outline 은 단기과정 기준이라 `1~2회 · 실내 호버링` 처럼
 * 회차 번호가 붙어 있다. 그대로 쓰면 90분짜리 1회 특강의 단계 제목이 "1~2회"가 된다.
 */
function stripCourseIndex(item: string): string {
  return item.replace(/^\s*\d+(\s*[~-]\s*\d+)?\s*회\s*[·:.-]?\s*/, '').trim() || item.trim()
}

function allocate(
  total: number,
  outlineCount: number,
): { intro: number; body: number[]; outro: number } {
  const intro = Math.max(5, Math.round(total * 0.15))
  const outro = Math.max(5, Math.round(total * 0.15))
  const bodyTotal = Math.max(10, total - intro - outro)
  const n = Math.max(1, Math.min(outlineCount, 4))
  const each = Math.floor(bodyTotal / n)
  const body = Array.from({ length: n }, (_, i) => (i === n - 1 ? bodyTotal - each * (n - 1) : each))
  return { intro, body, outro }
}

function accommodations(traits: ClassTrait[]): LessonStep['accommodations'] {
  return traits.map((trait) => ({ trait, how: TRAIT_DEFAULT[trait] }))
}

export type LessonSkeleton = Pick<
  LessonPlan,
  'title' | 'objectives' | 'steps' | 'materials' | 'safety_notes'
>

/**
 * 규칙 골격. **마무리 단계에 QR 안내가 반드시 들어간다.**
 *
 * 학생 유입의 실제 트리거는 강사의 한마디이고(ADR-015), 응답 0건으로 끝나는 회차는 대부분
 * 그 3분을 건너뛴 회차다. 그걸 강사의 기억이 아니라 교안에 박아 두는 것이 이 제품이 할 수 있는
 * 유일한 대비다. 이 단계를 지우지 말 것.
 */
export function ruleSkeleton(inputs: LessonPlanInputs): LessonSkeleton {
  const outline =
    inputs.program_outline.length > 0
      ? inputs.program_outline.slice(0, 4).map(stripCourseIndex)
      : [`${inputs.field} 기본 동작 익히기`, `${inputs.field} 과제 수행`]

  const { intro, body, outro } = allocate(inputs.duration_minutes, outline.length)
  const acc = accommodations(inputs.class_traits)

  const steps: LessonStep[] = [
    {
      phase: '도입',
      title: '오늘 할 일과 안전 수칙',
      minutes: intro,
      base: `${inputs.field}${josa(inputs.field, '으로')} 오늘 무엇을 만드는지 완성 예시로 먼저 보여줍니다.`,
      fast: '완성 예시를 보고 자기 목표를 한 가지 더 정하게 합니다.',
      slow: '오늘의 성공 기준을 "한 번 해보기"로 낮춰 말해 줍니다.',
      accommodations: acc,
    },
    ...outline.slice(0, body.length).map((item, i) => ({
      phase: '전개' as const,
      title: item,
      minutes: body[i] ?? 0,
      base: `${item}${josa(item, '을를')} 순서대로 따라 하며 완성합니다.`,
      fast: `${item}에 조건을 하나 더 붙여 심화 과제로 확장합니다.`,
      slow: `범위를 앞 절반으로 줄이고, 교사가 1회 시범한 뒤 따라 하게 합니다.`,
      accommodations: acc,
    })),
    {
      phase: '마무리',
      title: '정리 + 다음 교육 안내 (QR)',
      minutes: outro,
      base: '완성물을 서로 보여주고, 교실 화면에 QR을 띄운 뒤 "이거 찍으면 너한테 맞는 다음 교육을 찾아줘"라고 안내합니다.',
      fast: '먼저 끝낸 학생에게 자기 작업을 한 문장으로 설명하게 합니다.',
      slow: '완성하지 못했어도 시도한 부분을 먼저 말하게 합니다.',
      accommodations: acc,
    },
  ]

  return {
    title: `${inputs.session_title} 수업 설계`,
    objectives: [
      `${inputs.field}의 기본 개념과 동작을 한 번 이상 직접 해본다.`,
      `${GRADE_BAND_LABEL[inputs.grade_band]} 수준에서 오늘 만든 것을 스스로 설명할 수 있다.`,
    ],
    materials: inputs.equipment.length > 0 ? [...inputs.equipment] : [`${inputs.field} 실습 장비`],
    safety_notes: SAFETY_BY_FIELD[inputs.field] ?? ['활동 전 안전 수칙을 먼저 안내합니다.'],
    steps,
  }
}

// ============================================================================
// 3. LLM — 문장만 구체화한다
// ============================================================================

const SYSTEM = `너는 초·중·고 진로체험 특강 강사의 수업 준비를 돕는다.

주어진 차시 골격의 **문장만 구체화한다.** 단계를 추가·삭제·재배열하지 않고, 시간 배분도 바꾸지 않는다.

각 단계마다 쓰는 것:
- base: 이 단계에서 실제로 무엇을 시키는지. 학생이 손으로 하는 동작으로 쓴다.
- fast: 먼저 끝낸 학생에게 줄 것.
- slow: 따라오기 어려워하는 학생을 위해 범위를 어떻게 줄일지.
- accommodations: 주어진 항목에 대해서만, **활동을 어떻게 바꾸는지**를 쓴다.

지켜야 할 것:
- 각 문장 80자 이내. 강사가 읽는 문장이고 존댓말이다.
- 특정 학생을 지목하거나 추정하게 하는 문장을 쓰지 않는다. 진단명·장애명을 쓰지 않는다.
- 연락처·외부 링크·학교명·사람 이름을 쓰지 않는다.
- 주어진 장비와 장소 안에서만 가능한 활동을 쓴다. 없는 장비를 전제하지 않는다.
- 지난 회차 응답이 주어지면 그 반응을 반영한다. 주어지지 않으면 추측하지 않는다.
- 과장하지 않는다. "AI가 분석했다" 같은 말을 쓰지 않는다.

출력은 JSON 하나만. 설명을 덧붙이지 않는다.
{"steps":[{"base":"...","fast":"...","slow":"...","accommodations":[{"trait":"<주어진 항목 그대로>","how":"..."}]}]}`

type LlmStep = {
  base?: unknown
  fast?: unknown
  slow?: unknown
  accommodations?: { trait?: unknown; how?: unknown }[]
}

/** 모델 출력도 믿지 않는다. 연락처·링크가 섞이면 그 문장을 버리고 규칙 문장을 쓴다. */
function sanitize(raw: unknown, max = 160): string | null {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim().replace(/\s+/g, ' ')
  if (trimmed.length === 0 || trimmed.length > max) return null
  const masked = maskForStorage(trimmed)
  if (masked === null || masked !== trimmed) return null
  return trimmed
}

function parseSteps(text: string): LlmStep[] | null {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    const obj = JSON.parse(text.slice(start, end + 1)) as { steps?: unknown }
    return Array.isArray(obj.steps) ? (obj.steps as LlmStep[]) : null
  } catch {
    return null
  }
}

/**
 * LLM 문장을 규칙 골격에 **덮어쓴다.** 구조는 전부 규칙 쪽을 유지한다 —
 * 단계 수·순서·phase·제목·시간은 LLM 이 건드릴 수 없다. 그래서 모델이 무엇을 돌려주든
 * 교안의 형태는 깨지지 않는다.
 */
export function mergeLlmSteps(skeleton: LessonSkeleton, llm: LlmStep[]): LessonSkeleton {
  const steps = skeleton.steps.map((step, i) => {
    const row = llm[i]
    if (!row) return step

    const base = sanitize(row.base)
    const fast = sanitize(row.fast)
    const slow = sanitize(row.slow)

    // 마무리의 QR 안내는 유입의 유일한 트리거다. 모델이 그걸 지웠으면 규칙 문장을 되돌린다.
    const keepBase = step.phase === '마무리' && (!base || !base.includes('QR'))

    const byTrait = new Map(
      (row.accommodations ?? []).map((a) => [String(a.trait ?? ''), sanitize(a.how)]),
    )

    return {
      ...step,
      base: keepBase ? step.base : (base ?? step.base),
      fast: fast ?? step.fast,
      slow: slow ?? step.slow,
      // 주어진 특성만 유지한다. 모델이 새 특성을 만들어도 여기서 버려진다.
      accommodations: step.accommodations.map((a) => ({
        trait: a.trait,
        how: byTrait.get(a.trait) ?? a.how,
      })),
    }
  })

  return { ...skeleton, steps }
}

/** 실패하면 `null`. 호출자는 규칙 골격으로 그대로 진행한다 (ADR-017). */
async function refineByLlm(
  inputs: LessonPlanInputs,
  skeleton: LessonSkeleton,
): Promise<LessonSkeleton | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey || apiKey.trim() === '') return null

  const payload = {
    수업: {
      분야: inputs.field,
      학년대: GRADE_BAND_LABEL[inputs.grade_band],
      인원: inputs.expected_students,
      시수_분: inputs.duration_minutes,
      장소: inputs.venue,
      보유_장비: inputs.equipment,
      학급_특성: inputs.class_traits,
      강사_프로그램: inputs.program_title,
    },
    // 5건 미만이면 이 키 자체가 없다 (ADR-018).
    지난_회차_응답: inputs.prior
      ? {
          회차수: inputs.prior.session_count,
          응답수: inputs.prior.response_count,
          평균_만족도: inputs.prior.avg_satisfaction,
          더_배우고_싶다_비율: inputs.prior.followup_ratio,
          관심_분야_분포: inputs.prior.top_interests,
          반복된_표현: inputs.prior.repeated_phrases,
        }
      : null,
    차시_골격: skeleton.steps.map((s, i) => ({
      순번: i,
      단계: s.phase,
      제목: s.title,
      시간_분: s.minutes,
      대응할_항목: s.accommodations.map((a) => a.trait),
    })),
  }

  try {
    const client = new Anthropic({ apiKey })
    const response = await client.messages.create(
      {
        model: process.env.ANTHROPIC_MODEL?.trim() || 'claude-opus-5',
        max_tokens: 4000,
        system: SYSTEM,
        messages: [{ role: 'user', content: JSON.stringify(payload) }],
      },
      { timeout: 20_000, maxRetries: 1 },
    )

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')

    const steps = parseSteps(text)
    if (!steps || steps.length === 0) return null
    return mergeLlmSteps(skeleton, steps)
  } catch {
    // 키 만료·한도·타임아웃·스키마 변경 전부 여기로 떨어진다. 화면은 규칙 골격으로 정상 동작한다.
    return null
  }
}

export type LessonPlanDraft = {
  inputs: LessonPlanInputs
  skeleton: LessonSkeleton
  source: 'llm' | 'rule'
}

/**
 * 교안 초안 생성. **어떤 경우에도 골격을 반환한다** — 예외를 던지지 않는다.
 * `source` 로 무엇이 만들었는지만 기록한다.
 */
export async function generateLessonPlan(
  ds: Dataset,
  session: LectureSession,
): Promise<LessonPlanDraft> {
  const inputs = buildInputs(ds, session)
  const skeleton = ruleSkeleton(inputs)
  const refined = await refineByLlm(inputs, skeleton)
  return { inputs, skeleton: refined ?? skeleton, source: refined ? 'llm' : 'rule' }
}
