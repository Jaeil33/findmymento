import type Anthropic from '@anthropic-ai/sdk'
import { anthropicModel, createAnthropic, llmKeyForRequest } from '@/lib/ai/client'
import { demoAiEnabled } from '@/lib/ai/demo-writer'

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

/** 순수 문장 가드는 `ai/text-guard.ts` 에 있다 (오프라인 스크립트가 쓸 수 있어야 한다) */
export { containsAny, numbersWithin, sanitizeList, sanitizeText } from '@/lib/ai/text-guard'

export type JsonLlmRequest = {
  system: string
  payload: unknown
  maxTokens: number
  /** 기본 12_000 */
  timeoutMs?: number
  /**
   * 시연용 AI 응답 (ADR-025). 키가 없고 데모 데이터 모드일 때만 LLM 대신 불린다.
   * 받는 값은 LLM 에 보낼 payload 와 같고, 결과는 LLM 응답과 같은 병합·가드를 거친다.
   */
  demo?: (payload: unknown) => unknown
}

/**
 * LLM 을 한 번 호출해 응답 텍스트의 첫 `{` ~ 마지막 `}` 를 JSON.parse 한 값을 반환한다.
 * ANTHROPIC_API_KEY 없음(빈 문자열 포함) · 네트워크 실패 · 타임아웃 · JSON 없음 · 파싱 실패 → 전부 null.
 * **절대 throw 하지 않는다.** LLM 실패가 화면 실패가 되면 안 된다 (CLAUDE.md 아키텍처 규칙).
 */
export async function callJsonLlm(req: JsonLlmRequest): Promise<unknown | null> {
  const apiKey = await llmKeyForRequest()
  if (apiKey === null) {
    if (!req.demo || !(await demoAiEnabled())) return null
    try {
      return req.demo(req.payload)
    } catch {
      return null
    }
  }

  try {
    const client = createAnthropic(apiKey)
    const response = await client.messages.create(
      {
        model: anthropicModel(),
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
