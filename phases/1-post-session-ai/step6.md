# Step 6: post-session-ui

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md`
- `/docs/UI_GUIDE.md` — 색상 토큰·타이포·컴포넌트 규칙 (`tests/ui-guide.test.ts`가 정적으로 검사한다)
- `/docs/AI.md` — "수업 후 AI — 기능 4·5·6"
- `/docs/ADR.md` — ADR-017(초안 고지), ADR-024
- `/docs/DEPLOY.md` — "AI 기능 시연 경로" (버튼 문구가 여기와 같아야 한다)
- `src/components/session/SessionPlanAssist.tsx`, `src/components/lesson/LessonPlanView.tsx` — AI 초안 패널의 기존 패턴 (상태·에러 문구·source 표시·초안 고지 박스)
- `src/components/ui/` — `Button`, `Badge`, `Section`(`Panel`, `PageHeader`), `StatTile`
- `src/app/(org)/org/sessions/[id]/page.tsx` — 기관 회차 상세
- `src/app/(instructor)/instructor/sessions/[id]/page.tsx` — 강사 회차 상세
- `src/types/domain.ts` — `ResultReportDraft`, `FollowupPlanDraft`, `SessionDebriefDraft`
- `src/app/api/result-report/route.ts`, `src/app/api/followup-plan/route.ts`, `src/app/api/session-debrief/route.ts` — step 5 산출물 (요청·응답 형태)
- `src/lib/ai/result-report.ts`, `followup-plan.ts`, `session-debrief.ts` — 테스트 픽스처로 규칙 초안을 만들 때 쓴다
- `tests/ui-primitives.test.tsx`, `tests/landing.test.tsx`, `tests/ui-guide.test.ts` — UI 테스트 방식과 정적 규칙

## 작업

수업 후 AI 3종의 화면을 만들고 두 회차 상세 페이지에 붙인다. **테스트를 먼저 쓰고**(TDD) 구현한다.

### 파일

- `src/lib/report/text.ts` (신규) — 복사용 평문 변환 (순수 함수)
- `src/components/report/ResultReportAssist.tsx` (신규, `'use client'`)
- `src/components/report/FollowupPlanAssist.tsx` (신규, `'use client'`)
- `src/components/lesson/SessionDebriefAssist.tsx` (신규, `'use client'`)
- `src/app/(org)/org/sessions/[id]/page.tsx` (수정) — 두 패널 추가
- `src/app/(instructor)/instructor/sessions/[id]/page.tsx` (수정) — 회고 패널 추가
- `tests/post-session-ui.test.tsx` (신규)

### 시그니처

```ts
// src/lib/report/text.ts
export function resultReportToText(draft: ResultReportDraft): string
export function debriefToText(draft: SessionDebriefDraft): string

// 컴포넌트 (세 개 모두)
export function ResultReportAssist(props: { sessionId: string }): JSX.Element
export function FollowupPlanAssist(props: { sessionId: string }): JSX.Element
export function SessionDebriefAssist(props: { sessionId: string }): JSX.Element
```

### 화면 규칙

**공통** — `SessionPlanAssist`·`LessonPlanView`와 같은 방식으로 만든다.

- `fetch('/api/…', { method: 'POST', body: JSON.stringify({ sessionId }) })`
- 진행 중 버튼 문구: `만드는 중…`
- 에러: API의 `message`, 네트워크 실패면 `인터넷 연결이 끊긴 것 같습니다. 다시 시도해 주세요.`
- `source` 표시: `llm` → `AI가 문장을 정리했습니다`, `rule` → `응답 집계로 만들었습니다`
- `notices`는 초안 고지 박스(`LessonPlanView`의 caution 박스 스타일)에 모두 보여준다.
- 복사 버튼은 `navigator.clipboard.writeText`를 쓴다. 성공하면 `복사했습니다`, 실패하거나 clipboard가 없으면 `복사하지 못했습니다. 직접 선택해 복사해 주세요.`

**`ResultReportAssist`**

- Panel 제목 `결과보고서 초안`, 설명 `회차 응답 집계로 보고용 초안을 만듭니다. 저장되지 않습니다.`
- 버튼 `결과보고서 초안 만들기` (생성 후 `다시 만들기`)
- 결과 표시
  - `title`
  - `overview` (라벨·값 그리드)
  - 지표 4개: 응답 수 / 응답률 / 만족도 평균 / 더 배우고 싶다. null이면 `—`과 `표본 부족`
  - `outcomes` / `student_voice` / `improvements` / `next_steps` — 빈 목록은 섹션째 생략
  - `record_reference` — 제목 `창체 진로활동 기록 참고 문구 (회차 단위)`
  - `전체 복사` 버튼 → `resultReportToText`

**`FollowupPlanAssist`**

- Panel 제목 `후속 과정 제안`, 설명 `더 배우고 싶다는 응답으로 후속 과정과 섭외 문안을 제안합니다. 모집·수강료는 다루지 않습니다.`
- 버튼 `후속 과정 제안받기`
- `eligible === false`: `reason`과 `notices`만 보여주고 후보·문안·복사 버튼을 렌더하지 않는다.
- `eligible`
  - 배지: 분야 / `더 배우고 싶다 {demand_count}건` / `{field} 관심 {field_interest_count}건` / `top_time`(있을 때)
  - `candidates`를 이름·지역·거리 라벨로 보여준다. 거리 라벨: 0 `같은 시군구`, 1 `인접 지역`, 2 `조금 먼 지역`.
  - 각 후보는 공개 프로필 `/instructors/{instructor_id}` 링크만 가진다.
  - `suggested_title`과 `outline` 번호 목록
  - `request_message`가 비어 있지 않으면 읽기 전용 textarea + `문안 복사` 버튼
  - `섭외 요청 화면으로` 링크 → `/org/recruitment`
  - `supply_status === 'none'`이면 후보 목록 대신 notices의 공급 없음 문장이 보인다.

**`SessionDebriefAssist`**

- Panel 제목 `수업 회고`, 설명 `이 회차 응답 집계로 잘 된 점, 다음에 바꿀 점, 학교 제출용 요약을 만듭니다.`
- 버튼 `수업 회고 만들기`
- 결과 표시
  - `went_well` / `change_next` — 빈 목록은 생략
  - `school_summary` 박스 + `요약 복사` → `debriefToText`
  - `교안 다시 만들기` 링크 → `/instructor/sessions/{sessionId}/plan`

**페이지 연결**

- 기관 회차 상세: 기존 `회차 리포트` 섹션 **뒤**에 섹션을 추가한다.
  - 제목 `수업 후 AI 도우미` (기존 h2와 같은 클래스)
  - 안에 `ResultReportAssist`와 `FollowupPlanAssist`를 `grid gap-5 lg:grid-cols-2`로 배치
- 강사 회차 상세: 리포트 영역 뒤에 같은 제목의 섹션을 추가하고 `SessionDebriefAssist`를 넣는다.

### 테스트 (`tests/post-session-ui.test.tsx`) — 최소 포함

- `resultReportToText`:
  - 규칙 초안(`ruleResultReport(demoDs,'ls-1')`)으로 제목·응답 수·고지문이 들어간다.
  - 표본 부족 초안이면 `표본 부족`이 들어간다.
  - 결과에 `undefined`/`null` 문자열이 없다.
- `debriefToText`: `school_summary`와 고지문이 들어간다.
- 컴포넌트 (`vi.stubGlobal('fetch', …)`로 step 2~4 규칙 함수가 만든 초안을 응답):
  - 세 버튼 문구가 정확히 보인다.
  - 클릭 후 `초안입니다`로 시작하는 고지문이 보인다.
  - source 표시 `응답 집계로 만들었습니다`
  - 결과보고서 복사 버튼 존재
  - `FollowupPlanAssist`
    - `eligible: false` 초안 → `reason`이 보이고 `문안 복사` 버튼이 없다.
    - `supply_status: 'none'` 초안 → 후보 링크가 없다.
    - 후보 링크 href가 모두 `/instructors/`로 시작한다.
  - 렌더된 HTML에 `tel:`·`mailto:`·`localStorage`가 없다.
  - fetch가 reject → 네트워크 에러 문구
- 정적:
  - `src/app/(student)`·`src/app/(public)` 아래 파일이 세 컴포넌트를 import 하지 않는다.
  - 세 컴포넌트 원문에 `localStorage`·`sessionStorage`·`@anthropic-ai/sdk`가 없다.

## Acceptance Criteria

```bash
npm run lint
npm run build
npm test
! grep -rqE "ResultReportAssist|FollowupPlanAssist|SessionDebriefAssist" "src/app/(student)" "src/app/(public)"
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md 디렉토리 구조를 따르는가? (컴포넌트는 `components/`, 유틸은 `lib/`)
   - Client Component는 입력·상호작용에만 쓰는가? 조회는 페이지(Server Component)가 하는가?
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가? (학생·보호자 화면에 노출 없음, 클라이언트에서 LLM 직접 호출 없음, 강사 연락처 없음)
3. 결과에 따라 `phases/1-post-session-ai/index.json`의 step 6을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"` (컴포넌트·붙인 페이지·버튼 문구를 담는다)
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- `(student)`·`(public)` 라우트 그룹에 이 컴포넌트를 붙이지 마라. 이유: 결과보고서·후속 제안·회고는 기관·강사 업무 화면이고, 학생·보호자에게 도달하면 안 된다 (CLAUDE.md).
- 새 색상 hex·임의 Tailwind 색상을 쓰지 마라. `UI_GUIDE.md` 토큰만 쓴다. 이유: `tests/ui-guide.test.ts`가 깨지고 화면 일관성이 무너진다.
- 초안을 `localStorage`·`sessionStorage`·쿠키에 저장하지 마라. 이유: ADR-024 저장하지 않음, 기관 PC는 공용인 경우가 많다.
- 섭외 요청을 자동으로 보내는 버튼이나 recruitment 서버 액션 호출을 만들지 마라. 이유: ADR-024 — 기관이 섭외 화면에서 직접 보낸다.
- 클라이언트에서 Anthropic SDK나 외부 API를 부르지 마라. 자기 `/api/*` 라우트만 호출한다. 이유: CLAUDE.md 아키텍처 규칙.
- "AI가 분석했습니다" 같은 과장 문구나 AI 마케팅 배지를 넣지 마라. source 표시는 위에 정한 문구만 쓴다. 이유: AI.md — source는 검수용 값이다.
- `src/lib/ai/*`와 `src/app/api/*`를 수정하지 마라. 이유: 이전 step에서 테스트로 고정됐다.
- 기존 테스트를 깨뜨리지 마라
