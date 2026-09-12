# Step 5: moderation-filter

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/docs/USER_FLOW.md` — 사용자 여정, 유스케이스(UC), 예외 흐름(E), 검증 가설(H)
- `/docs/ARCHITECTURE.md` — 디렉토리 구조의 `src/lib/moderation/`
- `/docs/ADR.md` — ADR-004(자유 텍스트 마스킹), ADR-006(외부 이탈 방지)
- `/docs/SURVEY.md` — Q5·Q6의 마스킹 요구
- `/CLAUDE.md` — 안전 규칙
- 이전 step 산출물: `src/lib/` 구조, vitest 설정

## 작업

순수 함수 레이어. DB·UI·네트워크를 건드리지 않는다. 두 곳에서 쓰인다:

1. **학생 설문 자유 서술** (step 6) → **마스킹**. 학생 응답을 거부하지 않는다.
2. **Q&A 질문·답변 작성** (step 9) → **차단**. 작성자에게 알리고 저장하지 않는다.

이 차이가 이 step의 핵심이다. 설문에서 과차단이 일어나면 응답률이 떨어지고, 응답률은 파일럿의 1차 지표다. 그래서 설문은 조용히 마스킹만 하고, 공개 게시물은 명시적으로 막는다.

### 1. 시그니처

```ts
// src/lib/moderation/index.ts
export type SensitiveKind = "phone" | "email" | "url" | "sns"
export type ModerationHit = { kind: SensitiveKind; start: number; end: number; matched: string }

export function findSensitive(text: string): ModerationHit[]
export function maskSensitive(text: string): string        // 설문용. 탐지 구간을 고정 토큰으로 치환
export function isClean(text: string): boolean             // Q&A용 판정
```

`maskSensitive`의 치환 토큰은 사람이 읽을 수 있게 한다(예: 전화번호 → `[연락처 삭제됨]`). 원문을 어디에도 남기지 마라 — 마스킹 전 텍스트를 DB나 로그에 저장하면 마스킹이 무의미하다.

### 2. 탐지 대상

- **전화번호** — `010-1234-5678`, `01012345678`, `010 1234 5678`, 지역번호 형식
- **이메일** — 일반 형식 + `골뱅이`·`at`·`dot` 같은 우회 표기
- **URL·외부 링크** — `http(s)://`, `www.`, 도메인만 쓴 형태
- **SNS 아이디** — `@handle`, 카카오톡 ID·인스타 ID를 가리키는 한국어 표현과 함께 등장하는 식별자

한국어 우회 표기를 반드시 다룬다: `공일공`, `영일영`, `일이삼사`, 숫자 사이의 공백·점·하이픈 삽입.

### 3. 과차단 방지 (중요)

아래는 **탐지되면 안 된다.** 테스트로 고정하라.

- `3D프린터 100대로 만들어보고 싶어요`
- `드론 자격증 2종 따고 싶어요`
- `2025년에 배운 내용이 재미있었어요`
- `키가 178cm인데 관련 있나요`
- 일반 한국어 문장에 등장하는 연속 숫자(학년, 수량, 연도, 시간)

과차단 테스트를 탐지 테스트보다 먼저 쓰는 게 좋다. 정규식은 항상 너무 많이 잡는 쪽으로 망가진다.

### 4. 테스트 (TDD — 먼저 작성)

1. 전화번호 4가지 표기 탐지
2. 한국어 우회 표기(`공일공…`) 탐지
3. 이메일 + 우회 표기 탐지
4. URL 3가지 형태 탐지
5. SNS 아이디 탐지
6. **위 3번의 과차단 방지 케이스 전부 통과**
7. `maskSensitive`가 치환 후 원문 숫자를 남기지 않는다
8. `maskSensitive`가 탐지 구간 외 텍스트를 변형하지 않는다
9. 빈 문자열·공백만·매우 긴 입력에서 예외를 던지지 않는다
10. `isClean`이 탐지 0건일 때만 true

## Acceptance Criteria

```bash
npm run build
npm run lint
npm test
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - `src/lib/moderation/`에 위치하는가?
   - 네트워크·DB 의존이 없는 순수 함수인가?
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가?
3. 결과에 따라 `phases/0-mvp/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- 설문 자유 서술을 차단(거부) 대상으로 만들지 마라. 이유: 과차단 한 번이 응답 이탈로 이어지고, 응답률은 파일럿의 1차 지표다. 설문은 마스킹만 한다.
- 마스킹 전 원문을 DB·로그·에러 메시지에 남기지 마라. 이유: 남는 순간 마스킹이 아무 의미가 없어진다.
- 외부 모더레이션 API나 LLM을 호출하지 마라. 이유: 이 레이어는 순수 함수여야 한다. LLM 호출 경로에서 **먼저** 쓰이는 함수이므로 LLM에 의존하면 순환이 생긴다.
- 차단 규칙을 학생 화면에 상세히 설명하지 마라. 이유: 우회 방법을 알려주는 문서가 된다. Q&A에서는 "연락처나 외부 링크는 쓸 수 없어요" 수준으로 충분하다.
- 기존 테스트를 깨뜨리지 마라.
