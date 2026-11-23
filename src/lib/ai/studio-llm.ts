/**
 * 스튜디오 경로가 클로드 API 를 부를 수 있는가 — **스위치 하나** (ADR-046).
 *
 * 왜 있는가: 도안 저작(`lib/studio/author.ts`)과 이미지 검토(`pen3d/review.ts`)는 요청마다
 * 실제 토큰을 쓴다. 키가 환경에 들어 있다는 사실만으로 그 호출이 열리면, 키를 넣는 순간부터
 * 모든 생성 클릭이 과금된다 — 로컬 개발도, 테스트 배포도, 누가 눌러 보는 체험도.
 *
 * 그래서 **키와 별개의 스위치**를 둔다. 기본값은 끈 상태이고, 끈 상태에서 이 모듈은 어떤
 * 경우에도 키를 돌려주지 않는다. 그때 스튜디오는 검수된 목록(레시피·아틀라스·사전 제작 팩)과
 * 이름 명패만으로 돌아간다 — 지금까지의 로컬 엔진 그대로이고, 토큰을 **한 톨도** 쓰지 않는다.
 *
 *   STUDIO_LLM=on   # .env.local 한 줄. 이것이 들어가야 클로드가 돈다
 *
 * **스튜디오에서 클로드를 부르는 모든 코드는 이 모듈을 거친다.** `llmKeyForRequest()` 나
 * `tourStudioKey()` 를 스튜디오 경로에서 직접 부르지 말 것 — 그 틈으로 스위치가 꺼진 요청이
 * 과금된다. `tests/studio-llm-switch.test.ts` 가 이 구조를 고정한다.
 *
 * 추천·교안·보고서 등 **매칭 쪽 AI 는 이 스위치와 무관하다.** 그쪽은 예전처럼
 * `llmKeyForRequest()` 가 정한다 (ADR-004·024) — 스튜디오만 분리한 이유는 도안 생성이
 * 호출당 토큰이 가장 크고, 한 사람이 생성 버튼을 반복해서 누르는 유일한 화면이기 때문이다.
 *
 * 서버 전용이다. 클라이언트 컴포넌트에서 import 하지 않는다.
 */

import { llmKeyForRequest, tourStudioKey, tourStudioLlmAvailable } from '@/lib/ai/client'

/** 스위치 환경변수 이름. 문서·헬스체크가 같은 문자열을 쓴다 */
export const STUDIO_LLM_ENV = 'STUDIO_LLM'

/**
 * 키를 어디서 받았는가.
 *
 * - `regular` — 로그인한 강사의 요청. 윤곽·색 영역 제안(ADR-036·039)과 이미지 검토(ADR-038)까지 연다
 * - `tour` — 체험 세션의 저작 예산 (ADR-035). **검수된 목록에서 고르는 것까지다** —
 *   익명 공개 경로이므로 모양을 직접 그리게 하지 않는다 (ADR-033 CRITICAL)
 */
export type StudioLlmScope = 'regular' | 'tour'

export type StudioLlmGrant = { key: string; scope: StudioLlmScope }

/**
 * 스위치가 켜져 있는가. **키가 있는지는 보지 않는다** — 설정과 자격을 섞지 않는다.
 *
 * `on` 한 값만 켠다. `true`·`1`·`yes` 를 받아 주지 않는 이유는, 과금을 여는 설정이
 * 오타로 켜지면 안 되기 때문이다.
 */
export function studioLlmEnabled(): boolean {
  return process.env[STUDIO_LLM_ENV]?.trim().toLowerCase() === 'on'
}

/**
 * 이번 요청에서 스튜디오가 쓸 키. 없으면 `null` 이고, 호출자는 검수된 목록·규칙으로 떨어진다.
 *
 * **체험 예산은 부르는 순간 깎인다** (`tourStudioKey`). 그래서 `tourStudio` 를 주는 곳은
 * 스튜디오 생성 라우트 하나뿐이고, "쓸 수 있는가" 만 알고 싶으면 {@link studioLlmAvailable}
 * 을 쓴다 — 그쪽은 깎지 않는다.
 */
export async function studioLlmGrant(options?: {
  /** 체험 세션에서도 저작을 허용할 것인가 (ADR-035). 생성 라우트만 준다 */
  tourStudio?: boolean
}): Promise<StudioLlmGrant | null> {
  if (!studioLlmEnabled()) return null

  // 일반 키를 먼저 본다. 순서를 바꾸면 로그인한 강사의 요청이 체험 예산을 깎는다.
  const regular = await llmKeyForRequest()
  if (regular !== null) return { key: regular, scope: 'regular' }

  if (options?.tourStudio !== true) return null
  const tour = await tourStudioKey()
  return tour === null ? null : { key: tour, scope: 'tour' }
}

/**
 * 지금 클로드를 부를 수 있는 상태인가. **예산을 깎지 않는다** — 라우트가 "저작 레이어를
 * 부를 것인가" 를 정할 때와 헬스체크가 쓴다.
 */
export async function studioLlmAvailable(options?: { tourStudio?: boolean }): Promise<boolean> {
  if (!studioLlmEnabled()) return false
  if ((await llmKeyForRequest()) !== null) return true
  if (options?.tourStudio !== true) return false
  return tourStudioLlmAvailable()
}

/**
 * **체험 세션**이 이번에 실제 클로드를 쓸 수 있는가 (ADR-035). 예산을 깎지 않는다 —
 * 체험 중이라는 띠 옆의 안내 문구가 쓴다. 체험이 아니면 늘 `false` 다.
 */
export async function studioTourLlmAvailable(): Promise<boolean> {
  if (!studioLlmEnabled()) return false
  return tourStudioLlmAvailable()
}
