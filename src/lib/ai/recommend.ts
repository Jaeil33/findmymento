import Anthropic from '@anthropic-ai/sdk'
import { FIELD_UNSURE, type Field, type GradeBand, type Recommendation } from '@/types/domain'
import { expandRegion, regionName } from '@/lib/region'
import { maskForStorage } from '@/lib/moderation'
import { demoAiEnabled, demoRanking } from '@/lib/ai/demo-writer'
import { approvedInstructors } from '@/lib/db/queries'
import type { Dataset } from '@/lib/db/dataset'

/**
 * AI 추천 = **규칙 필터 + LLM 순위** 하이브리드 (ADR-004).
 *
 * 규칙이 후보를 확정하고(지역·학년·분야·승인 상태), LLM 은 그 후보의 **순위와 이유 한 줄**만 만든다.
 * LLM 이 후보를 새로 만들지 못하므로 존재하지 않는 강사가 추천되는 일이 구조적으로 불가능하다.
 *
 * **LLM 실패·한도·키 없음이면 규칙 기반 순위와 규칙 문구로 200 을 반환한다 (E-06).**
 * 학생은 특강 직후 교실에서 이 화면을 보고 있다. 에러 화면을 보여주면 그 관심은 그대로 사라진다.
 */

export type RecommendInput = {
  regionCode: string
  gradeBand: GradeBand
  /** 설문 Q4. `아직 잘 모르겠어요` 는 분야 필터에서 제외하고 회차 분야로 대체한다. */
  interestFields: string[]
  /** 회차 분야. 관심 분야가 비었을 때의 기본값이 된다. */
  sessionField: Field
  followupIntent: number
  /** 설문 Q5. **마스킹을 통과한 텍스트만** 들어온다. LLM 에도 이 값만 보낸다 (E-08). */
  wantToLearn: string | null
  desiredJob: string | null
  /** 같은 가명코드의 누적 이력 — 분야 목록 (E-18). */
  history?: string[]
}

export type RecommendResult = {
  items: Recommendation[]
  /** 어느 지역 단계에서 찾았는지. 화면에 그대로 쓴다. */
  stage: 'same' | 'adjacent' | 'two_hop' | 'none'
  stageCodes: string[]
  /** 순위·문구를 무엇이 만들었는지. 화면에 "AI" 배지를 달기 위한 값이 아니다 — 로그·검수용이다. */
  source: 'llm' | 'rule'
  /** 관심은 있었는데 공급이 없던 분야. 미충족 수요로 기록한다 (E-16). */
  unmetFields: string[]
  /**
   * 이 추천을 LLM 이 만들었는지 확인하는 기록. 학생 화면에는 내려가지 않는다 — 로그·추천 기록 전용이다.
   * LLM 실패는 규칙 문장으로 조용히 떨어지므로(E-06), 이게 없으면 교실에서 AI 가 돌았는지 알 수 없다.
   */
  meta: RecommendMeta
}

export type RecommendMeta = {
  /** 호출한 모델. 데모 시연 응답이면 'demo', LLM 을 부르지 않았으면 null. */
  model: string | null
  latencyMs: number | null
  inputTokens: number | null
  outputTokens: number | null
  /** 실패 분류 — 분류명과 HTTP 상태만 (`RateLimitError:429`). **에러 메시지 본문은 넣지 않는다.** */
  error: string | null
}

const EMPTY_META: RecommendMeta = {
  model: null,
  latencyMs: null,
  inputTokens: null,
  outputTokens: null,
  error: null,
}

const MAX_ITEMS = 5

/** 후보 확정까지는 전부 규칙이다. LLM 은 이 목록 밖으로 나갈 수 없다. */
function candidates(ds: Dataset, input: RecommendInput) {
  const wanted = normalizeFields(input)

  const approved = new Set(approvedInstructors(ds).map((i) => i.id))
  const base = ds.programs.filter((p) => {
    if (!approved.has(p.instructor_id)) return false
    if (!p.target_grades.includes(input.gradeBand)) return false
    return wanted.includes(p.field)
  })

  const regionOf = (instructorId: string) =>
    ds.instructors.find((i) => i.id === instructorId)?.region_code ?? ''

  const expansion = expandRegion(input.regionCode, (codes) =>
    base.some((p) => codes.includes(regionOf(p.instructor_id))),
  )

  const matched =
    expansion.stage === 'none'
      ? []
      : base.filter((p) => expansion.codes.includes(regionOf(p.instructor_id)))

  const items: Recommendation[] = matched.map((program) => {
    const instructor = ds.instructors.find((i) => i.id === program.instructor_id)!
    const provider = instructor.provider_id
      ? (ds.providers.find((v) => v.id === instructor.provider_id) ?? null)
      : null
    const distance = expansion.stage === 'same' ? 0 : expansion.stage === 'adjacent' ? 1 : 2
    return {
      program,
      instructor,
      provider,
      reason: ruleReason(program.field, program.format, program.session_count, distance, input),
      distance,
      region_label: regionName(instructor.region_code),
    }
  })

  const supplied = new Set(items.map((i) => i.program.field as string))
  const unmetFields = wanted.filter((f) => !supplied.has(f))

  return { items: rankByRule(items), expansion, unmetFields }
}

function normalizeFields(input: RecommendInput): string[] {
  const raw = input.interestFields.filter((f) => f !== FIELD_UNSURE)
  const fields = raw.length > 0 ? raw : [input.sessionField]
  // 누적 이력이 있으면 후보 폭을 넓힌다 — 드론 2회 + 3D 1회면 둘 다 본다 (E-18).
  return [...new Set([...fields, ...(input.history ?? [])])]
}

/**
 * 규칙 순위. 가까운 곳 → 회차 많은 과정 → 제목 순.
 * **소속 업체와 구독 여부를 절대 반영하지 않는다** (ADR-009).
 */
function rankByRule(items: Recommendation[]): Recommendation[] {
  return [...items]
    .sort(
      (a, b) =>
        a.distance - b.distance ||
        b.program.session_count - a.program.session_count ||
        a.program.title.localeCompare(b.program.title, 'ko'),
    )
    .slice(0, MAX_ITEMS)
}

/** 규칙 문구. LLM 이 없어도 학생이 읽을 수 있는 한 줄이 반드시 나와야 한다. */
function ruleReason(
  field: string,
  format: string,
  sessionCount: number,
  distance: number,
  input: RecommendInput,
): string {
  const where =
    distance === 0
      ? `${regionName(input.regionCode)} 안에서`
      : distance === 1
        ? '바로 옆 지역에서'
        : '조금 떨어진 지역에서'

  const shape =
    format === 'one_off'
      ? '한 번만 더 해보기 좋은 1회 수업'
      : format === 'club'
        ? `꾸준히 하는 ${sessionCount}회 정기 활동`
        : `${sessionCount}회로 이어서 배우는 과정`

  const matched = input.interestFields.includes(field)
    ? `오늘 고른 ${field}`
    : `오늘 들은 ${input.sessionField}과 이어지는 ${field}`

  return `${matched}을 ${where} ${shape}이에요.`
}

export async function recommend(ds: Dataset, input: RecommendInput): Promise<RecommendResult> {
  const { items, expansion, unmetFields } = candidates(ds, input)

  if (items.length === 0) {
    return {
      items: [],
      stage: expansion.stage,
      stageCodes: expansion.codes,
      source: 'rule',
      unmetFields,
      meta: { ...EMPTY_META },
    }
  }

  const ranked = await rankByLlm(items, input)

  return {
    items: ranked.items ?? items,
    stage: expansion.stage,
    stageCodes: expansion.codes,
    source: ranked.items ? 'llm' : 'rule',
    unmetFields,
    meta: ranked.meta,
  }
}

const SYSTEM = `너는 초·중·고 학생에게 다음에 들을 교육을 추천하는 도우미다.

지켜야 할 것:
- 주어진 후보 목록 **안에서만** 고른다. 새 프로그램·강사를 만들지 않는다.
- 각 후보에 **이유 한 줄**을 쓴다. 50자 이내, 학생이 읽는 문장, 존댓말.
- 이유에는 학생이 쓴 말과 프로그램 내용을 연결한 구체적인 근거를 넣는다.
- 연락처·외부 링크·학교명·사람 이름을 절대 쓰지 않는다.
- "AI가 분석했어요" 같은 말을 쓰지 않는다. 학생에게 필요한 건 왜 이게 맞는지다.
- 과장하지 않는다. 확실하지 않으면 담백하게 쓴다.

출력은 JSON 하나만. 설명을 덧붙이지 않는다.
{"ranking":[{"id":"<후보 id>","reason":"<한 줄>"}]}`

type LlmRanking = { ranking: { id: string; reason: string }[] }

type LlmOutcome = { items: Recommendation[] | null; meta: RecommendMeta }

/** HTTP 상태 → 분류명. SDK 클래스 이름은 빌드에서 줄어들 수 있으므로 상태로 정한다. */
const STATUS_LABEL: Record<number, string> = {
  400: 'BadRequestError',
  401: 'AuthenticationError',
  403: 'PermissionDeniedError',
  404: 'NotFoundError',
  408: 'RequestTimeoutError',
  413: 'RequestTooLargeError',
  422: 'UnprocessableEntityError',
  429: 'RateLimitError',
  500: 'InternalServerError',
  529: 'OverloadedError',
}

/** 실패 분류. **메시지 본문은 쓰지 않는다** — 분류명과 HTTP 상태만. */
function errorLabel(err: unknown): string {
  const sdk = Anthropic as unknown as Record<string, unknown>
  const isA = (key: string) =>
    typeof sdk[key] === 'function' && err instanceof (sdk[key] as abstract new (...args: never[]) => unknown)
  // 타임아웃은 연결 에러의 하위 클래스다 — 먼저 본다.
  if (isA('APIConnectionTimeoutError')) return 'APIConnectionTimeoutError'
  if (isA('APIConnectionError')) return 'APIConnectionError'
  const status = (err as { status?: unknown } | null)?.status
  if (typeof status === 'number') {
    return `${STATUS_LABEL[status] ?? (status >= 500 ? 'ServerError' : 'APIError')}:${status}`
  }
  return 'Error'
}

/** 실패하면 `items: null`. 호출자는 규칙 순위로 그대로 진행한다 (E-06). 어떤 경우든 meta 는 채운다. */
async function rankByLlm(items: Recommendation[], input: RecommendInput): Promise<LlmOutcome> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  const hasKey = Boolean(apiKey && apiKey.trim() !== '')
  // 키가 없으면 데모 배포에서만 시연용 응답을 쓴다 (ADR-025). 아래 정리·병합은 똑같이 거친다.
  if (!hasKey && !demoAiEnabled()) return { items: null, meta: { ...EMPTY_META, error: 'NoApiKey' } }

  const model = hasKey ? process.env.ANTHROPIC_MODEL?.trim() || 'claude-opus-5' : 'demo'
  const meta: RecommendMeta = { ...EMPTY_META, model }
  const started = Date.now()

  const byId = new Map(items.map((i) => [i.program.id, i]))

  const payload = {
    학생: {
      학년대: input.gradeBand,
      오늘_들은_분야: input.sessionField,
      더_배우고_싶은_정도: input.followupIntent,
      고른_관심분야: input.interestFields,
      // 마스킹을 통과한 텍스트만 보낸다. 원문은 저장조차 되지 않는다.
      직접_쓴_말: maskForStorage(input.wantToLearn),
      관심_직업: maskForStorage(input.desiredJob),
      이전에_들은_분야: input.history ?? [],
    },
    후보: items.map((i) => ({
      id: i.program.id,
      제목: i.program.title,
      분야: i.program.field,
      형태: i.program.format,
      회차수: i.program.session_count,
      소개: i.program.summary,
      수업내용: i.program.outline,
      지역: i.region_label,
      거리: i.distance === 0 ? '같은 시군구' : i.distance === 1 ? '인접 지역' : '조금 먼 지역',
    })),
  }

  try {
    let text: string
    let stopReason: string | null = null
    if (hasKey) {
      const client = new Anthropic({ apiKey })
      const response = await client.messages.create(
        {
          model,
          // Opus 5 는 적응형 사고가 기본으로 켜져 있고 사고 토큰도 이 한도를 쓴다.
          // 한도가 빠듯하면 JSON 이 잘리고, 잘린 JSON 은 규칙 문장으로 조용히 떨어진다.
          max_tokens: 4000,
          // 짧은 순위·문구 생성이므로 낮은 effort 로 충분하다.
          output_config: { effort: 'low' },
          system: SYSTEM,
          messages: [{ role: 'user', content: JSON.stringify(payload) }],
        },
        { timeout: 8_000, maxRetries: 1 },
      )

      meta.inputTokens = response.usage?.input_tokens ?? null
      meta.outputTokens = response.usage?.output_tokens ?? null
      stopReason = response.stop_reason ?? null
      text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('')
    } else {
      text = JSON.stringify(demoRanking(payload))
    }
    meta.latencyMs = Date.now() - started

    const parsed = parseRanking(text)
    if (!parsed) {
      meta.error = stopReason && stopReason !== 'end_turn' ? `ParseError:${stopReason}` : 'ParseError'
      return { items: null, meta }
    }

    // 순서 확인은 **프로그램 id 로** 한다. 객체 비교로 하면 아래에서 이유를 붙이며 만든
    // 복사본이 원본과 다른 객체가 되어 같은 프로그램이 두 번 들어간다.
    const used = new Set<string>()
    const ordered: Recommendation[] = []
    for (const row of parsed.ranking) {
      const item = byId.get(row.id)
      if (!item || used.has(row.id)) continue
      used.add(row.id)
      const reason = sanitizeReason(row.reason)
      ordered.push(reason ? { ...item, reason } : item)
    }
    // LLM 이 일부만 돌려줬으면 남은 후보를 규칙 순위로 뒤에 붙인다.
    for (const item of items) if (!used.has(item.program.id)) ordered.push(item)

    if (ordered.length === 0) {
      meta.error = 'EmptyRanking'
      return { items: null, meta }
    }
    return { items: ordered.slice(0, MAX_ITEMS), meta }
  } catch (err) {
    // 키 만료·한도·타임아웃·스키마 변경 전부 여기로 떨어진다. 화면은 규칙 결과로 정상 동작한다.
    meta.latencyMs = Date.now() - started
    meta.error = errorLabel(err)
    return { items: null, meta }
  }
}

function parseRanking(text: string): LlmRanking | null {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    const obj = JSON.parse(text.slice(start, end + 1)) as unknown
    if (
      typeof obj === 'object' &&
      obj !== null &&
      Array.isArray((obj as LlmRanking).ranking)
    ) {
      return obj as LlmRanking
    }
    return null
  } catch {
    return null
  }
}

/** 모델 출력도 믿지 않는다. 연락처·링크가 섞이면 그 문구는 버리고 규칙 문구를 쓴다. */
function sanitizeReason(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim().replace(/\s+/g, ' ')
  if (trimmed.length === 0 || trimmed.length > 120) return null
  const masked = maskForStorage(trimmed)
  if (masked === null || masked !== trimmed) return null
  return trimmed
}
