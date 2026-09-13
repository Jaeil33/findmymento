import Anthropic from '@anthropic-ai/sdk'
import { maskForStorage } from '@/lib/moderation'

/**
 * 수업 후 AI 3종(결과보고서·후속 과정·수업 회고)이 공통으로 쓰는 가드 (ADR-024).
 *
 * 이 모듈은 **판정만** 한다. 무엇이 허용 숫자이고 누가 금지 이름인지는 각 기능 모듈이 규칙으로
 * 확정해서 넘긴다 — 판정 기준을 여기서 만들면 기능마다 다른 데이터를 같은 목록으로 막게 된다.
 *
 * 서버 전용이다. LLM 키를 읽으므로 클라이언트 컴포넌트에서 import 하지 않는다.
 */

/** 집계를 LLM·화면에 쓰기 위한 최소 응답 수. k-익명성 최소 조치 (ADR-018, ADR-024). */
export const MIN_AGGREGATE_RESPONSES = 5

// ============================================================================
// 1. LLM 문장 정리 — 연락처·링크가 섞이면 고치지 않고 버린다
// ============================================================================

/**
 * 공백을 하나로 정리한 뒤 길이 1~max 이고, maskForStorage 결과가 원문과 같을 때만 반환한다.
 * 연락처·링크가 섞였거나 문자열이 아니거나 너무 길면 null.
 */
export function sanitizeText(raw: unknown, max: number): string | null {
  if (typeof raw !== 'string') return null
  const t = raw.trim().replace(/\s+/g, ' ')
  if (t.length === 0 || t.length > max) return null
  const masked = maskForStorage(t)
  if (masked === null || masked !== t) return null
  return t
}

/** 배열의 각 항목에 sanitizeText. 살아남은 항목이 0개면 null, 아니면 앞에서부터 최대 limit 개. */
export function sanitizeList(raw: unknown, max: number, limit: number): string[] | null {
  if (!Array.isArray(raw)) return null
  const out = raw.map((v) => sanitizeText(v, max)).filter((v): v is string => v !== null)
  return out.length > 0 ? out.slice(0, limit) : null
}

// ============================================================================
// 2. 숫자·이름 판정 — LLM 이 규칙 밖의 사실을 만들었는지
// ============================================================================

/**
 * `1,200` · `75` · `4.3` 을 하나의 숫자로 읽는다.
 * 쉼표 뒤는 정확히 세 자리일 때만 천 단위로 본다 — `1,2345` 는 1 과 2345 다.
 * 소수점 뒤에 숫자가 없으면(문장 끝 마침표) 소수로 읽지 않는다.
 */
const NUMBER_RE = /\d+(?:,\d{3}(?!\d))*(?:\.\d+)?/g

/**
 * text 에 등장하는 모든 숫자가 allowed 에 있으면 true.
 * - ignore 에 든 문자열(예: 분야명 '3D 모델링·프린팅')은 먼저 지운 뒤 숫자를 찾는다.
 * - '1,200' 은 1200, '75%' 는 75, '4.3' 은 4.3 으로 읽는다.
 * - 비교는 |a - b| < 1e-9.
 * - 숫자가 하나도 없으면 true.
 */
export function numbersWithin(
  text: string,
  allowed: readonly number[],
  ignore: readonly string[] = [],
): boolean {
  let rest = text
  // 긴 것부터 지운다 — 짧은 항목이 긴 항목의 일부를 먼저 지우면 긴 항목의 숫자가 남는다.
  // 공백으로 바꾼다 — 지운 자리 양옆의 숫자가 붙어 새 숫자가 되지 않게.
  for (const s of [...ignore].filter((s) => s.length > 0).sort((a, b) => b.length - a.length)) {
    rest = rest.split(s).join(' ')
  }

  for (const m of rest.match(NUMBER_RE) ?? []) {
    const n = Number(m.replace(/,/g, ''))
    if (!allowed.some((a) => Math.abs(a - n) < 1e-9)) return false
  }
  return true
}

/**
 * banned 중 하나라도 text 에 들어 있으면 true.
 * 비교 전에 양쪽의 공백을 모두 제거한다('박 서연' 도 '박서연' 으로 걸린다).
 * null·undefined·trim 후 2글자 미만 항목은 무시한다(한 글자 성씨로 모든 문장이 걸리는 것을 막는다).
 */
export function containsAny(
  text: string,
  banned: readonly (string | null | undefined)[],
): boolean {
  const squash = (s: string) => s.replace(/\s+/g, '')
  const haystack = squash(text)
  return banned.some((b) => {
    if (b === null || b === undefined) return false
    const needle = squash(b)
    return needle.length >= 2 && haystack.includes(needle)
  })
}

// ============================================================================
// 3. LLM 호출 — 실패는 null. 호출자는 규칙 결과로 그대로 진행한다
// ============================================================================

export type JsonLlmRequest = {
  system: string
  payload: unknown
  maxTokens: number
  /** 기본 12_000 */
  timeoutMs?: number
}

/**
 * LLM 을 한 번 호출해 응답 텍스트의 첫 `{` ~ 마지막 `}` 를 JSON.parse 한 값을 반환한다.
 * ANTHROPIC_API_KEY 없음(빈 문자열 포함) · 네트워크 실패 · 타임아웃 · JSON 없음 · 파싱 실패 → 전부 null.
 * **절대 throw 하지 않는다.** LLM 실패가 화면 실패가 되면 안 된다 (CLAUDE.md 아키텍처 규칙).
 */
export async function callJsonLlm(req: JsonLlmRequest): Promise<unknown | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey || apiKey.trim() === '') return null

  try {
    const client = new Anthropic({ apiKey })
    const response = await client.messages.create(
      {
        model: process.env.ANTHROPIC_MODEL?.trim() || 'claude-opus-5',
        max_tokens: req.maxTokens,
        output_config: { effort: 'low' },
        system: req.system,
        messages: [{ role: 'user', content: JSON.stringify(req.payload) }],
      },
      { timeout: req.timeoutMs ?? 12_000, maxRetries: 1 },
    )

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')

    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    if (start < 0 || end <= start) return null
    return JSON.parse(text.slice(start, end + 1)) as unknown
  } catch {
    return null
  }
}
