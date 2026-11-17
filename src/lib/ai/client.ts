import Anthropic from '@anthropic-ai/sdk'
import { tourActive } from '@/lib/demo/mode'

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

/**
 * 이번 요청에서 쓸 LLM 키. 없으면 `null` 이고, 호출자는 규칙 폴백(또는 시연용 응답)으로 떨어진다.
 *
 * **체험 세션에서는 키가 있어도 `null` 이다** (ADR-033). 체험은 로그인 없이 누구나 들어오는
 * 경로이므로, 익명 방문자의 클릭이 소유자의 API 예산을 쓰게 두지 않는다. 체험 중에는
 * 시연용 응답(`lib/ai/demo-writer.ts`)이 대신 들어가고 화면은 그 사실을 그대로 표시한다.
 */
export async function llmKeyForRequest(): Promise<string | null> {
  const key = process.env.ANTHROPIC_API_KEY
  // 키가 없으면 쿠키를 읽지 않는다 — 이 함수가 요청 밖(테스트·스크립트)에서도 불린다.
  if (!key || key.trim() === '') return null
  if (await tourActive()) return null
  return key
}
