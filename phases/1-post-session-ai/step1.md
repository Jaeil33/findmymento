# Step 1: ai-guard

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md`
- `/docs/AI.md` — 특히 "수업 후 AI — 기능 4·5·6"과 "안전 경계"
- `/docs/ADR.md` — ADR-018, ADR-024
- `/docs/ARCHITECTURE.md`
- `src/lib/ai/session-plan.ts` — `sanitize` / `sanitizeList` / `refineByLlm` 구현 (이 step의 공통 함수가 이 동작을 그대로 따른다)
- `src/lib/ai/lesson-plan.ts` — `PRIOR_MIN_RESPONSES`
- `src/lib/moderation/` — `maskForStorage`
- `tests/recommend-llm.test.ts` — Anthropic SDK 모킹 방식
- `tests/session-plan.test.ts` — 테스트 작성 스타일

## 작업

수업 후 AI 3종(step 2~4)이 공통으로 쓸 **가드 모듈**을 만든다. **테스트를 먼저 쓰고**(TDD) 구현한다.

### 파일

- `src/lib/ai/guard.ts` (신규)
- `tests/ai-guard.test.ts` (신규)

### 시그니처

```ts
/** 집계를 LLM·화면에 쓰기 위한 최소 응답 수. k-익명성 최소 조치 (ADR-018, ADR-024). */
export const MIN_AGGREGATE_RESPONSES = 5

/**
 * 공백을 하나로 정리한 뒤 길이 1~max 이고, maskForStorage 결과가 원문과 같을 때만 반환한다.
 * 연락처·링크가 섞였거나 문자열이 아니거나 너무 길면 null.
 */
export function sanitizeText(raw: unknown, max: number): string | null

/** 배열의 각 항목에 sanitizeText. 살아남은 항목이 0개면 null, 아니면 앞에서부터 최대 limit 개. */
export function sanitizeList(raw: unknown, max: number, limit: number): string[] | null

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
  ignore?: readonly string[],
): boolean

/**
 * banned 중 하나라도 text 에 들어 있으면 true.
 * 비교 전에 양쪽의 공백을 모두 제거한다('박 서연' 도 '박서연' 으로 걸린다).
 * null·undefined·trim 후 2글자 미만 항목은 무시한다(한 글자 성씨로 모든 문장이 걸리는 것을 막는다).
 */
export function containsAny(text: string, banned: readonly (string | null | undefined)[]): boolean

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
 * **절대 throw 하지 않는다.**
 */
export async function callJsonLlm(req: JsonLlmRequest): Promise<unknown | null>
```

### 구현 규칙

- `callJsonLlm`은 `src/lib/ai/session-plan.ts`의 `refineByLlm`과 같은 방식으로 호출한다: `new Anthropic({ apiKey })`, `model: process.env.ANTHROPIC_MODEL?.trim() || 'claude-opus-5'`, `max_tokens: req.maxTokens`, `output_config: { effort: 'low' }`, `system: req.system`, `messages: [{ role: 'user', content: JSON.stringify(req.payload) }]`, 요청 옵션 `{ timeout: req.timeoutMs ?? 12_000, maxRetries: 1 }`. 텍스트 블록만 이어 붙인다.
- 이 파일은 서버 전용이다. `'use client'`를 붙이지 않는다.
- step 2~4는 이 함수들을 import 해서 쓴다. 허용 숫자 목록(allowed)과 금지 이름 목록(banned)을 만드는 책임은 각 기능 모듈에 있다 — 이 모듈은 판정만 한다.

### 테스트 (`tests/ai-guard.test.ts`) — 최소 포함

- `MIN_AGGREGATE_RESPONSES`가 5이고 `lesson-plan.ts`의 `PRIOR_MIN_RESPONSES`와 같다.
- `sanitizeText`: 전화번호(`010-1234-5678`)·URL·이메일이 섞이면 null / 길이 초과 null / 숫자·null·객체 null / 연속 공백 정리.
- `sanitizeList`: 비배열 null / 전부 무효면 null / limit 적용 / 무효 항목만 빠짐.
- `numbersWithin`:
  - `'만족도 평균은 4.3점입니다'` + `[4.3]` → true, + `[4.33]` → false
  - `'응답률 75%'` + `[75]` → true
  - `'3D 모델링·프린팅 분야'` + `[]` + ignore `FIELDS` → true, ignore 없이 → false
  - `'10명이 응답했습니다'` + `[9]` → false
  - `'1,200원'` + `[1200]` → true
  - 숫자 없는 문장 + `[]` → true
- `containsAny`: `'박서연 강사님'`/`['박서연']` → true, `'박 서연'` → true, `[null, '', '가']` → false.
- `callJsonLlm`:
  - 키가 없으면 SDK를 부르지 않고 null (`vi.stubEnv` 또는 `delete process.env.ANTHROPIC_API_KEY` 후 복원)
  - SDK 모킹으로 앞뒤에 설명이 붙은 JSON 텍스트 → 파싱된 객체
  - JSON 없는 텍스트 → null, SDK가 throw → null (reject 되지 않는다)

## Acceptance Criteria

```bash
npm run lint
npm run build
npm test
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md 디렉토리 구조(`lib/ai/`)를 따르는가?
   - ADR 기술 스택을 벗어나지 않았는가? (새 npm 의존성 추가 금지)
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가? (LLM 호출은 서버 전용 코드에서만)
3. 결과에 따라 `phases/1-post-session-ai/index.json`의 step 1을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"` (export 목록을 담는다)
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- `src/lib/ai/session-plan.ts`, `lesson-plan.ts`, `recommend.ts`를 수정하지 마라(공통 함수로 옮기는 리팩터 포함). 이유: 기존 테스트와 배포된 동작을 보존한다. 공통화는 이번 범위 밖이다.
- `callJsonLlm`에서 예외를 밖으로 던지지 마라. 이유: LLM 실패가 화면 실패가 되면 안 된다 (CLAUDE.md 아키텍처 규칙).
- 테스트에서 실제 Anthropic API를 호출하지 마라. 이유: 키가 없는 CI에서도 통과해야 한다.
- 새 npm 패키지를 추가하지 마라. 이유: 기술 스택 고정 (ADR).
- 기존 테스트를 깨뜨리지 마라
