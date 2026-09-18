import Anthropic from '@anthropic-ai/sdk'

/**
 * Anthropic 클라이언트. **모든 LLM 호출은 이 함수로 클라이언트를 만든다** — 서버 전용이다.
 *
 * 작업공간에 묶이지 않은 조직 단위 키는 요청마다 `anthropic-workspace-id` 헤더가 있어야 한다.
 * 헤더가 없으면 모든 호출이 400 으로 거절되고, 화면은 규칙 문장으로 조용히 떨어져서
 * AI 가 한 번도 돌지 않는다 (파일럿 키로 실측해서 확인).
 *
 * `ANTHROPIC_WORKSPACE_ID`(예: `wrkspc_...`)가 있으면 헤더를 붙인다. 작업공간에 묶인 키면 비워 둔다.
 */
export function createAnthropic(apiKey: string | undefined): Anthropic {
  const workspaceId = process.env.ANTHROPIC_WORKSPACE_ID?.trim()
  return new Anthropic({
    apiKey,
    ...(workspaceId ? { defaultHeaders: { 'anthropic-workspace-id': workspaceId } } : {}),
  })
}
