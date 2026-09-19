import { createAnthropic } from '@/lib/ai/client'
import { CAREERS, type Career } from '@/data/careers'
import { FIELD_UNSURE, GRADE_BAND_LABEL, type GradeBand } from '@/types/domain'
import { maskForStorage } from '@/lib/moderation'
import { numbersWithin, sanitizeText } from '@/lib/ai/guard'

/**
 * 진로 방향 카드 = **규칙 후보 + LLM 선택** 하이브리드 (ADR-027).
 *
 * 추천할 수업이 0건인 회차(파일럿 대부분)에서 학생 결과 화면을 채운다. 구조는 AI 기능 1(수업 추천)과
 * 같다 — 규칙이 검수된 목록(`data/careers.ts`)에서 후보를 확정하고, LLM 은 그 안에서 3개를 고르고
 * 이유 한 줄만 쓴다. 목록 밖의 직업·자격증·학교는 구조적으로 나갈 수 없다.
 *
 * 하지 않는 것 (CLAUDE.md CRITICAL): 학생 수준 평가, 공부 순서·학습 계획 제시, 결과 저장 후 프로필화.
 *
 * **LLM 실패·거절·키 없음이면 규칙 선택과 규칙 문장으로 돌아간다.** 학생 화면은 절대 비지 않는다.
 * 서버 전용이다. LLM 키를 읽으므로 클라이언트 컴포넌트에서 import 하지 않는다.
 */

export const CAREER_PICKS = 3
export const MAX_CAREER_CANDIDATES = 8
const REASON_MAX = 80

export type CareerInput = {
  gradeBand: GradeBand
  /** 회차 분야 (예: 드론). */
  sessionField: string
  /** 설문 Q4. `아직 잘 모르겠어요` 는 분야로 치지 않는다. */
  interestFields: string[]
  followupIntent: number
  /** 설문 Q5·Q6. 여기서 한 번 더 가린다 — LLM 에는 가린 값만 간다. */
  wantToLearn: string | null
  desiredJob: string | null
}

export type CareerPick = {
  id: string
  title: string
  summary: string
  related: string
  /** 이 학생에게 왜 맞는지 한 줄. LLM(가드 통과) 또는 규칙 문장. */
  reason: string
}

/** LLM 호출 기록. 오류는 종류만 남긴다 — 메시지 본문을 기록하지 않는다. */
export type LlmMeta = {
  model: string | null
  latencyMs: number | null
  inputTokens: number | null
  outputTokens: number | null
  error: string | null
}

/**
 * 학생이 적은 관심 직업(꿈). 목록과 이어지면 matched — 카드 이유가 이미 그 꿈을 다룬다.
 * 목록에 없으면 카드만 보여 주면 "내 꿈은 요리사인데 왜 드론 조종사?"가 된다. 그래서 그 꿈을 먼저
 * 응원하고 오늘 분야와 만나는 장면을 한 줄로 보여 준다 (AI 문장, 실패하면 규칙 문장).
 */
export type DreamNote = { matched: boolean; note: string | null }

export type CareerResult = {
  items: CareerPick[]
  /** 관심 직업을 안 적었으면 null. */
  dream: DreamNote | null
  /** 선택·문장을 무엇이 만들었는지. 로그·검수용이다. 화면에 "AI" 배지를 달지 않는다. */
  source: 'llm' | 'rule'
  meta: LlmMeta
}

const NO_CALL: LlmMeta = {
  model: null,
  latencyMs: null,
  inputTokens: null,
  outputTokens: null,
  error: null,
}

const FOLLOWUP_TEXT: Record<number, string> = {
  1: '아니요',
  2: '잘 모르겠어요',
  3: '조금 배워보고 싶어요',
  4: '많이 배워보고 싶어요',
}

// ============================================================================
// 1. 후보 확정 — 전부 규칙이다
// ============================================================================

type Scored = {
  career: Career
  score: number
  jobHit: boolean
  learnHit: boolean
  /** 학생이 직접 고른 분야 중 이 진로와 이어지는 것 (오늘 분야 제외). */
  chosenField: string | null
}

function scoreAll(input: CareerInput): Scored[] {
  const chosen = input.interestFields.filter((f) => f !== FIELD_UNSURE)
  const fields = new Set([...chosen, input.sessionField])
  const job = (input.desiredJob ?? '').toLowerCase()
  const learn = (input.wantToLearn ?? '').toLowerCase()
  const hits = (text: string, keywords: string[]) =>
    text !== '' && keywords.some((k) => text.includes(k.toLowerCase()))

  return CAREERS.map((career, index) => {
    const overlap = career.fields.filter((f) => fields.has(f)).length
    const jobHit = hits(job, career.keywords)
    const learnHit = hits(learn, career.keywords)
    const chosenField =
      career.fields.find((f) => chosen.includes(f) && f !== input.sessionField) ?? null
    const score =
      (jobHit ? 4 : 0) +
      (learnHit ? 2 : 0) +
      overlap +
      ((career.fields as string[]).includes(input.sessionField) ? 1 : 0)
    return { career, score, jobHit, learnHit, chosenField, index, related: overlap > 0 || jobHit || learnHit }
  })
    .filter((s) => s.related)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ career, score, jobHit, learnHit, chosenField }) => ({
      career,
      score,
      jobHit,
      learnHit,
      chosenField,
    }))
}

/** LLM 에 보낼 후보. 이 목록 밖으로는 아무것도 나가지 않는다. */
export function careerCandidates(input: CareerInput): Career[] {
  return scoreAll(input)
    .slice(0, MAX_CAREER_CANDIDATES)
    .map((s) => s.career)
}

/** 규칙 문장. LLM 이 없어도 학생이 읽을 수 있는 한 줄이 반드시 나온다. 학생의 말을 인용하지 않는다. */
function ruleReason(s: Scored, input: CareerInput): string {
  if (s.jobHit) return '관심 직업으로 적어 준 내용과 가장 가까운 일이에요.'
  if (s.learnHit) return '배우고 싶다고 적은 내용과 바로 이어지는 일이에요.'
  if (s.chosenField) return `오늘 고른 분야(${s.chosenField})와 이어지는 일이에요.`
  return `오늘 해 본 ${input.sessionField} 수업과 바로 이어지는 일이에요.`
}

function toPick(career: Career, reason: string): CareerPick {
  return {
    id: career.id,
    title: career.title,
    summary: career.summary,
    related: career.related,
    reason,
  }
}

// ============================================================================
// 2. 선택 — LLM 은 후보 안에서 고르고 이유만 쓴다
// ============================================================================

export async function pickCareers(input: CareerInput): Promise<CareerResult> {
  // 호출자가 가렸더라도 한 번 더 가린다. LLM 에는 이 값만 간다.
  const safe: CareerInput = {
    ...input,
    wantToLearn: maskForStorage(input.wantToLearn),
    desiredJob: maskForStorage(input.desiredJob),
  }

  const candidates = scoreAll(safe).slice(0, MAX_CAREER_CANDIDATES)
  if (candidates.length === 0) return { items: [], source: 'rule', meta: NO_CALL, dream: null }

  const rulePicks = candidates
    .slice(0, CAREER_PICKS)
    .map((s) => toPick(s.career, ruleReason(s, safe)))

  const llm = await pickByLlm(candidates, safe)
  const dream = dreamFor(candidates, safe, llm.dreamNote)
  if (!llm.picks) return { items: rulePicks, source: 'rule', meta: llm.meta, dream }

  const byId = new Map(candidates.map((s) => [s.career.id, s]))
  const used = new Set<string>()
  const items: CareerPick[] = []
  let fromLlm = 0

  for (const row of llm.picks) {
    if (items.length >= CAREER_PICKS) break
    const s = byId.get(row.id)
    if (!s || used.has(row.id)) continue
    used.add(row.id)
    fromLlm += 1
    // 이유만 가드에 걸리면 그 카드만 규칙 문장으로 바꾼다. 선택 자체는 후보 안이므로 유지한다.
    items.push(toPick(s.career, guardReason(row.reason) ?? ruleReason(s, safe)))
  }
  // LLM 이 3개를 다 채우지 못했으면 규칙 순위로 채운다.
  for (const s of candidates) {
    if (items.length >= CAREER_PICKS) break
    if (used.has(s.career.id)) continue
    used.add(s.career.id)
    items.push(toPick(s.career, ruleReason(s, safe)))
  }

  // 학생이 적은 꿈과 이어지는 카드는 맨 앞에 둔다 — "내 꿈이 먼저 보이는가"가 결과 화면의 첫인상이다.
  // 나머지 순서는 LLM(또는 규칙)이 정한 그대로다 (안정 정렬).
  const dreamIds = new Set(candidates.filter((s) => s.jobHit).map((s) => s.career.id))
  items.sort((a, b) => Number(dreamIds.has(b.id)) - Number(dreamIds.has(a.id)))

  return { items, source: fromLlm > 0 ? 'llm' : 'rule', meta: llm.meta, dream }
}

/** 꿈 안내. 목록과 이어지는지는 규칙(키워드)이 정한다 — LLM 이 정하지 않는다. */
function dreamFor(candidates: Scored[], input: CareerInput, llmNote: unknown): DreamNote | null {
  if (!input.desiredJob || input.desiredJob.trim() === '') return null
  if (candidates.some((s) => s.jobHit)) return { matched: true, note: null }
  return { matched: false, note: guardReason(llmNote) ?? ruleDreamNote(input) }
}

/** 학생의 말을 되풀이하지 않는 규칙 문장. */
function ruleDreamNote(input: CareerInput): string {
  return `적어 준 꿈을 응원해요! 오늘 배운 ${input.sessionField} 기술은 여러 분야에서 쓰여서, 그 꿈에서도 쓸 곳을 찾을 수 있어요.`
}

const SYSTEM = `너는 초·중·고 학생에게 오늘 들은 수업과 이어지는 진로를 소개하는 도우미다.

규칙:
- 주어진 후보 목록 안에서만 정확히 3개를 고른다. 새 직업·자격증·학교·기관을 만들지 않는다.
- 학생이 고른 분야, 직접 쓴 말, 관심 직업과 가장 잘 이어지는 순서로 고른다.
- 고른 진로마다 이유 한 줄을 쓴다. 60자 이내, 학생에게 말하는 해요체.
- 이유에는 학생의 답과 그 직업이 하는 일을 잇는 구체적인 근거를 넣는다. 학생이 직접 쓴 말이 없으면 오늘 수업 분야와 잇는다.
- 학생의 실력이나 수준을 평가하지 않는다. 공부 순서나 학습 계획을 제시하지 않는다.
- 숫자(연봉·순위·나이 등)와 "반드시 된다" 같은 약속을 쓰지 않는다.
- 연락처·외부 링크·학교명·사람 이름을 쓰지 않는다. "AI가 분석했어요" 같은 말을 쓰지 않는다.
- 학생이 적은 관심 직업과 이어지는 후보가 없으면, 이유에서 그 직업을 억지로 끌어오지 않는다. 대신 dream_note 에 오늘 들은 분야가 그 꿈과 만나는 장면을 한 줄(60자 이내, 해요체)로 쓴다. 관심 직업이 없거나 이어지는 후보가 있으면 dream_note 는 빈 문자열로 둔다.

출력은 JSON 하나만. 설명을 덧붙이지 않는다.
{"picks":[{"id":"<후보 id>","reason":"<한 줄>"}],"dream_note":"<한 줄 또는 빈 문자열>"}`

type RawPick = { id: string; reason: unknown }

async function pickByLlm(
  candidates: Scored[],
  input: CareerInput,
): Promise<{ picks: RawPick[] | null; dreamNote: unknown; meta: LlmMeta }> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey || apiKey.trim() === '') return { picks: null, dreamNote: null, meta: NO_CALL }

  const model = process.env.ANTHROPIC_MODEL?.trim() || 'claude-opus-5'
  const payload = {
    학생: {
      학년대: GRADE_BAND_LABEL[input.gradeBand],
      오늘_들은_분야: input.sessionField,
      더_배우고_싶은_정도: FOLLOWUP_TEXT[input.followupIntent] ?? null,
      고른_관심분야: input.interestFields,
      직접_쓴_말: input.wantToLearn,
      관심_직업: input.desiredJob,
    },
    후보: candidates.map((s) => ({
      id: s.career.id,
      직업: s.career.title,
      하는_일: s.career.summary,
      관련: s.career.related,
    })),
  }

  const started = Date.now()
  try {
    const client = createAnthropic(apiKey)
    const response = await client.beta.messages.create(
      {
        model,
        // Opus 5 는 적응형 사고가 기본으로 켜져 있고 사고 토큰도 max_tokens 에 들어간다.
        // 짧게 잡으면 JSON 이 잘려 규칙 문장으로 떨어진다.
        max_tokens: 4000,
        output_config: { effort: 'low' },
        system: SYSTEM,
        messages: [{ role: 'user', content: JSON.stringify(payload) }],
        // 모델이 거절하면 서버가 같은 요청을 대체 모델로 다시 돌린다 (refusal fallback).
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
      },
      { timeout: 12_000, maxRetries: 1 },
    )

    const meta: LlmMeta = {
      model: response.model ?? model,
      latencyMs: Date.now() - started,
      inputTokens: response.usage?.input_tokens ?? null,
      outputTokens: response.usage?.output_tokens ?? null,
      error: null,
    }

    if (response.stop_reason === 'refusal') return { picks: null, dreamNote: null, meta: { ...meta, error: 'refusal' } }

    const text = response.content.map((b) => (b.type === 'text' ? b.text : '')).join('')
    const parsed = parseReply(text)
    if (!parsed) return { picks: null, dreamNote: null, meta: { ...meta, error: 'parse' } }
    return { picks: parsed.picks, dreamNote: parsed.dreamNote, meta }
  } catch (err) {
    // 키 만료·한도·크레딧 소진·타임아웃이 전부 여기로 온다. 화면은 규칙 결과로 정상 동작한다.
    return {
      picks: null,
      dreamNote: null,
      meta: { ...NO_CALL, model, latencyMs: Date.now() - started, error: describeError(err) },
    }
  }
}

function parseReply(text: string): { picks: RawPick[]; dreamNote: unknown } | null {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    const obj = JSON.parse(text.slice(start, end + 1)) as { picks?: unknown; dream_note?: unknown }
    if (!Array.isArray(obj.picks)) return null
    const picks = obj.picks.filter(
      (p): p is RawPick =>
        typeof p === 'object' && p !== null && typeof (p as { id?: unknown }).id === 'string',
    )
    return { picks, dreamNote: obj.dream_note }
  } catch {
    return null
  }
}

/** 학생 수준을 평가하는 표현. 프롬프트로 막고, 새어 나오면 여기서 버린다. */
const JUDGMENT = /실력|수준|부족|재능|못하|잘하는 편/

/** 모델 출력도 믿지 않는다. 연락처·링크·숫자·수준 평가가 섞이면 그 문장은 버린다. */
function guardReason(raw: unknown): string | null {
  const text = sanitizeText(raw, REASON_MAX)
  if (!text) return null
  if (!numbersWithin(text, [], ['3D'])) return null
  if (JUDGMENT.test(text)) return null
  return text
}

/**
 * 오류 종류만 짧게. 메시지 본문은 남기지 않는다.
 * 운영 빌드는 클래스 이름이 줄어들 수 있으므로 이름보다 status·메시지 패턴으로 판단한다.
 */
function describeError(err: unknown): string {
  const status = (err as { status?: unknown } | null)?.status
  if (typeof status === 'number') return `http_${status}`
  const text = err instanceof Error ? `${err.name} ${err.message}` : String(err)
  if (/timeout|timed out/i.test(text)) return 'timeout'
  if (/connection|network|fetch failed/i.test(text)) return 'connection'
  return 'error'
}
