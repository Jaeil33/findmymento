# Step 6: post-session-ui

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md`
- `/docs/UI_GUIDE.md` — 색상 토큰·타이포·컴포넌트 규칙 (`tests/ui-guide.test.ts`가 정적으로 검사한다)
- `/docs/AI.md` — "수업 후 AI — 기능 4·5·6"
- `/docs/ADR.md` — ADR-017(초안 고지), ADR-024
- `/docs/DEPLOY.md` — "AI 기능 시연 경로" (버튼 문구가 여기와 같아야 한다)
- `src/app/globals.css` — `@theme` 색 토큰(`point`, `point-bg`, `point-line`, `positive`, `caution`, `negative`, `line`, `muted`, `ink`, `body`, `sub`, `faint`)과 `animate-fade-in`·`animate-slide-up`
- `src/components/session/SessionPlanAssist.tsx`, `src/components/lesson/LessonPlanView.tsx` — AI 초안 패널의 기존 패턴 (상태·에러 문구·source 표시·초안 고지 박스)
- `src/components/ui/` — `Button`(`buttonClass`), `Badge`, `Section`(`Panel`, `PageHeader`), `StatTile`, `Icons`
- `src/components/data/Distribution.tsx` — 분포 막대
- `src/components/report/SessionReportView.tsx` — 회차 리포트 (지표 타일·분포 배치 방식)
- `src/app/(org)/org/sessions/[id]/page.tsx` — 기관 회차 상세
- `src/app/(instructor)/instructor/sessions/[id]/page.tsx` — 강사 회차 상세
- `src/app/(org)/org/page.tsx` — 기관 요약, `src/lib/db/queries.ts`의 `orgSessionRows`
- `src/types/domain.ts` — `ResultReportDraft`, `FollowupPlanDraft`, `FollowupCandidate`, `SessionDebriefDraft`
- `src/app/api/result-report/route.ts`, `src/app/api/followup-plan/route.ts`, `src/app/api/session-debrief/route.ts` — step 5 산출물 (요청·응답 형태)
- `src/lib/ai/result-report.ts`, `followup-plan.ts`, `session-debrief.ts` — 테스트 픽스처로 규칙 초안을 만들 때 쓴다
- `tests/ui-primitives.test.tsx`, `tests/landing.test.tsx`, `tests/ui-guide.test.ts` — UI 테스트 방식과 정적 규칙

## 작업

수업 후 AI 3종의 화면을 만들고 회차 상세 페이지 두 곳과 기관 요약에 붙인다. **테스트를 먼저 쓰고**(TDD) 구현한다.

이 화면은 창업 지원 심사와 파일럿 기관 시연에서 "AI가 교육 현장의 일을 실제로 줄여 준다"는 것을 보여주는 화면이다. 목표는 **실제 업무 문서처럼 보이는 완성도**다. 장식으로 멋을 내지 말고 구조·타이포·숫자·여백으로 만든다 (UI_GUIDE "숫자가 주인공이다", "기관 화면은 도구처럼").

### 파일

- `src/lib/report/text.ts` (신규) — 복사용 평문 변환 (순수 함수)
- `src/components/ai/AssistProgress.tsx` (신규, `'use client'`) — 생성 단계 표시
- `src/components/ai/CopyButton.tsx` (신규, `'use client'`) — 복사 버튼
- `src/components/report/ResultReportAssist.tsx` (신규, `'use client'`)
- `src/components/report/FollowupPlanAssist.tsx` (신규, `'use client'`)
- `src/components/lesson/SessionDebriefAssist.tsx` (신규, `'use client'`)
- `src/app/(org)/org/sessions/[id]/page.tsx` (수정) — 두 패널 추가
- `src/app/(instructor)/instructor/sessions/[id]/page.tsx` (수정) — 회고 패널 추가
- `src/app/(org)/org/page.tsx` (수정) — 수업 후 AI 도우미 진입 패널
- `tests/post-session-ui.test.tsx` (신규)

### 시그니처

```ts
// src/lib/report/text.ts
export function resultReportToText(draft: ResultReportDraft): string
export function followupMessageToText(draft: FollowupPlanDraft): string   // request_message 그대로. 비었으면 ''
export function debriefToText(draft: SessionDebriefDraft): string

// src/components/ai/AssistProgress.tsx
export function AssistProgress(props: { stages: string[]; active: number }): JSX.Element

// src/components/ai/CopyButton.tsx
export function CopyButton(props: { text: string; label: string }): JSX.Element

// 컴포넌트 (세 개 모두). stageMs 는 단계 표시 간격(기본 450). 테스트는 0 을 넘긴다.
export function ResultReportAssist(props: { sessionId: string; stageMs?: number }): JSX.Element
export function FollowupPlanAssist(props: { sessionId: string; stageMs?: number }): JSX.Element
export function SessionDebriefAssist(props: { sessionId: string; stageMs?: number }): JSX.Element
```

### 공통 화면 규칙

**요청·상태** — `SessionPlanAssist`·`LessonPlanView`와 같은 방식.

- `fetch('/api/…', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sessionId }) })`
- 진행 중 버튼 문구: `만드는 중…` (버튼 disabled)
- 에러: API의 `message`, 네트워크 실패면 `인터넷 연결이 끊긴 것 같습니다. 다시 시도해 주세요.`
- `source` 표시 문구는 정확히 이 둘뿐이다: `llm` → `AI가 문장을 정리했습니다`, `rule` → `응답 집계로 만들었습니다`
- 생성 후 버튼 문구는 `다시 만들기`

**생성 단계 표시 (`AssistProgress`)** — 스피너 대신 **지금 무엇을 하는지 정적 문구로** 보여준다 (UI_GUIDE 애니메이션 규칙).

- 진행 중에만 렌더한다. `stages`를 세로 목록으로, `active` 이전은 완료(체크 아이콘 + `text-body`), `active`는 진행(`text-point font-medium`, 문구 끝에 `…`), 이후는 대기(`text-faint`).
- 각 항목은 `animate-fade-in`. 다른 애니메이션을 쓰지 않는다.
- `role="status"` + `aria-live="polite"`.
- 컴포넌트는 클릭 시 `active`를 0부터 `stageMs` 간격으로 올리고, 마지막 단계에서 멈춰 응답을 기다린다. **응답이 먼저 와도 마지막 단계까지 표시한 뒤 결과를 보여준다** (총 `stageMs × (단계 수 - 1)` 이상). `stageMs`가 0이면 기다리지 않는다.
- 단계 문구 (각 기능이 실제로 거치는 순서다 — 없는 처리를 적지 않는다):
  - 결과보고서: `회차 응답 집계` / `표본 5건 기준 확인` / `숫자·이름 검증` / `보고서 문장 정리`
  - 후속 과정: `더 배우고 싶다는 응답 집계` / `관심 분야와 참여 시간 확인` / `가까운 지역 강사 찾기` / `과정안·섭외 문안 정리`
  - 수업 회고: `회차 응답 집계` / `잘 된 점·바꿀 점 판단` / `숫자 검증` / `학교 제출용 요약 정리`

**결과 머리줄** — 결과 카드 맨 위 한 줄에 `source` 문구와 사실 칩(`Badge tone="neutral"`)을 둔다.

- 칩: `응답 {response_count}건 집계` · `저장되지 않음`
- "AI가 분석했습니다" 같은 과장 문구, "Powered by AI"·반짝이 아이콘 같은 AI 마케팅 장식을 넣지 않는다.

**초안 고지** — `notices`는 모두 caution 박스(`rounded-lg border border-caution/30 bg-caution-bg px-4 py-3 text-sm`)에 보여준다. 첫 줄은 `font-semibold text-ink`.

**복사 (`CopyButton`)** — `navigator.clipboard.writeText`. 성공하면 버튼 옆에 `복사했습니다`, 실패하거나 clipboard가 없으면 `복사하지 못했습니다. 직접 선택해 복사해 주세요.` (`role="status"`). `Button variant="secondary"`.

**결과 등장** — 결과 컨테이너에 `animate-fade-in`.

### `ResultReportAssist` — 실제 결과보고서 양식처럼

- `Panel` 제목 `결과보고서 초안`, 설명 `회차 응답 집계로 보고용 초안을 만듭니다. 저장되지 않습니다.`
- 버튼 `결과보고서 초안 만들기` (primary)
- 결과(문서 미리보기) — `rounded-lg border border-line bg-card` 안에 `border-t-2 border-t-point` 상단선을 둔 문서 한 장:
  1. **문서 머리**: `title`을 `text-lg font-semibold text-ink`, 오른쪽에 `Badge tone="caution"` `초안`
  2. **개요 표**: `overview`를 2열 정의 표로. 라벨 셀 `bg-muted text-sub text-xs font-medium`, 값 셀 `text-sm text-ink`, 셀 테두리 `border-line`. 모바일 1쌍/줄, `sm` 이상 2쌍/줄
  3. **지표 4칸** (`grid grid-cols-2 lg:grid-cols-4`, 작은 지표 타일 `rounded-md border border-line p-3`, 숫자 `text-2xl font-semibold tabular-nums`):
     `응답 수`(`{response_count}` / `{expected}명`) · `응답률`(`{response_rate_pct}%`) · `만족도 평균`(`{satisfaction_avg}` / `5`) · `더 배우고 싶다`(`{followup_high_count}건` + 보조 `{followup_high_pct}%`).
     null이면 숫자 자리에 `—`, 보조 문구 `표본 부족`
  4. **관심 분야 상위**: `top_fields`가 있으면 `Distribution`(tone `point`, total = `response_count`)
  5. **번호 붙은 본문 섹션** — 보고서 목차처럼 `1. 운영 성과` / `2. 학생 의견` / `3. 개선점` / `4. 향후 계획`. 각 제목 `text-sm font-semibold text-ink`, 항목은 `ul` + `text-sm leading-relaxed text-body`. **빈 목록은 섹션째 생략하고 번호는 보이는 섹션 기준으로 다시 매긴다.** `학생 의견` 항목은 왼쪽 `border-l-2 border-point-line pl-3`
  6. **창체 기록 참고 문구**: 제목 `창체 진로활동 기록 참고 문구 (회차 단위)`, 본문은 `rounded-md bg-point-bg px-4 py-3 text-sm text-ink`
- 문서 아래 동작 줄: `CopyButton` label `전체 복사` (text = `resultReportToText`)
- 그 아래 초안 고지 박스

### `FollowupPlanAssist` — 수요 → 후보 → 문안이 한 흐름으로

- `Panel` 제목 `후속 과정 제안`, 설명 `더 배우고 싶다는 응답으로 후속 과정과 섭외 문안을 제안합니다. 모집·수강료는 다루지 않습니다.`
- 버튼 `후속 과정 제안받기` (primary)
- `eligible === false`: `reason`(`text-sm text-body`)과 초안 고지 박스만 보여주고 수요 흐름·후보·문안·복사 버튼을 렌더하지 않는다.
- `eligible`
  1. **수요 흐름** — 세 줄 막대(`Distribution`을 쓰지 말고 같은 모양으로 직접): `전체 응답 {response_count}건` → `더 배우고 싶다 {demand_count}건` → `{field} 관심 {field_interest_count}건`. 막대 너비는 `response_count` 대비 %, 색은 `bg-sub` → `bg-point` → `bg-point`. 숫자 `tabular-nums`. `top_time`이 있으면 아래에 `Badge tone="point"` `가장 많이 고른 시간 · {top_time}`
  2. **섭외 후보** — 제목 `가까운 지역 강사`, 보조 `거리순 → 이름순. 소속 업체·유료 여부는 순서에 반영하지 않습니다.`
     - 각 후보 한 줄(`flex items-center justify-between rounded-md border border-line px-4 py-3`): 이름(`font-medium text-ink`) · 지역(`text-sub`) · 거리 배지(0 `같은 시군구` tone `point`, 1 `인접 지역` tone `neutral`, 2 `조금 먼 지역` tone `neutral`) · 링크 `공개 프로필` → `/instructors/{instructor_id}`
     - 후보는 **공개 프로필 링크만** 가진다. 연락처·전화·이메일 자리를 만들지 않는다.
     - `supply_status === 'none'`이면 후보 목록 대신 notices의 공급 없음 문장이 고지 박스에 보인다.
  3. **과정안** — `suggested_title`(`text-base font-semibold text-ink`) + `outline`을 `ol`로. 각 줄 왼쪽에 `{n}차시` 라벨(`w-14 shrink-0 text-xs font-medium text-point tabular-nums`)
  4. **섭외 요청 문안** — `request_message`가 비어 있지 않을 때만. 읽기 전용 `textarea`(`rows={7}`, `rounded-lg border border-line-strong bg-muted px-4 py-3 text-sm leading-relaxed text-body`), 오른쪽 아래 `{길이} / 400자`(`text-xs text-faint tabular-nums`), `CopyButton` label `문안 복사`
  5. 링크 `섭외 요청 화면으로` → `/org/recruitment` (`buttonClass({ variant: 'primary' })`). **자동 발송 버튼을 만들지 않는다.**
  6. 초안 고지 박스

### `SessionDebriefAssist` — 강사 자신을 위한 회고

- `Panel` 제목 `수업 회고`, 설명 `이 회차 응답 집계로 잘 된 점, 다음에 바꿀 점, 학교 제출용 요약을 만듭니다.`
- 버튼 `수업 회고 만들기` (primary)
- 결과
  1. **지표 4칸**(ResultReport와 같은 작은 타일): `응답 수`(`{response_count}건` + 보조 `응답률 {response_rate_pct}%`) · `만족도 평균`(`/ 5`) · `만족도 4·5점`(`%`) · `더 배우고 싶다`(`followup_high_pct%`). null이면 `—` + `표본 부족`
  2. **두 열** (`grid gap-4 md:grid-cols-2`): `잘 된 점`(`border-l-2 border-positive pl-4`) / `다음에 바꿀 점`(`border-l-2 border-caution pl-4`). 빈 목록은 그 열을 생략한다. 강사를 점수·등급으로 보이게 하는 표현(별점·게이지·등급 배지)을 만들지 않는다.
  3. **학교 제출용 요약** — 제목 `학교 제출용 요약`, 본문 `rounded-lg border border-line bg-muted px-5 py-4 text-sm leading-relaxed text-body`, 오른쪽 아래 `{길이} / 400자`, `CopyButton` label `요약 복사` (text = `debriefToText`)
  4. 링크 `교안 다시 만들기` → `/instructor/sessions/{sessionId}/plan` (`buttonClass({ variant: 'secondary' })`)
  5. 초안 고지 박스

### 페이지 연결

- **기관 회차 상세**: 기존 `회차 리포트` 섹션 **뒤**에 섹션 추가.
  - 제목 `수업 후 AI 도우미` (기존 h2와 같은 클래스), 제목 아래 한 줄 `text-sm text-sub`: `회차가 끝나면 응답 집계로 보고서·후속 과정·섭외 문안 초안을 만듭니다. 숫자는 집계값 그대로 쓰고, 아무것도 저장하지 않습니다.`
  - `ResultReportAssist`와 `FollowupPlanAssist`를 `grid items-start gap-5 xl:grid-cols-2`로 배치 (문서 미리보기가 좁아지지 않게 `xl`부터 2열)
- **강사 회차 상세**: 회차 리포트 섹션 뒤에 같은 제목의 섹션을 추가하고 `SessionDebriefAssist`를 넣는다. 제목 아래 한 줄: `응답 집계로 회고와 학교 제출용 요약 초안을 만듭니다. 아무것도 저장하지 않습니다.`
- **기관 요약(`/org`)**: 최근 회차 패널 **앞**에 `Panel` 제목 `수업 후 AI 도우미`, 설명 `응답이 모인 회차에서 결과보고서·후속 과정·섭외 문안 초안을 바로 만듭니다.`
  - `orgSessionRows`에서 응답이 `5`건 이상인 회차를 진행일 최신순 최대 3개. 각 줄: 회차 제목 · `응답 {n}건` · 링크 `초안 만들기` → `/org/sessions/{id}`
  - 해당 회차가 없으면 `응답이 5건 이상 모인 회차가 생기면 여기서 바로 초안을 만들 수 있습니다.`

### 테스트 (`tests/post-session-ui.test.tsx`) — 최소 포함

- `resultReportToText`:
  - 규칙 초안(`ruleResultReport(demoDs,'ls-1')`)으로 제목·응답 수·고지문이 들어간다.
  - 표본 부족 초안이면 `표본 부족`이 들어간다.
  - 결과에 `undefined`/`null` 문자열이 없다.
- `debriefToText`: `school_summary`와 고지문이 들어간다.
- `followupMessageToText`: 문안이 그대로, 빈 문안이면 `''`.
- `AssistProgress`: `active=1`이면 첫 단계는 완료, 둘째 단계에 `…`, `role="status"`.
- 컴포넌트 (`vi.stubGlobal('fetch', …)`로 step 2~4 규칙 함수가 만든 초안을 응답, `stageMs={0}`):
  - 세 버튼 문구가 정확히 보인다.
  - 클릭 후 `초안입니다`로 시작하는 고지문이 보인다.
  - source 표시 `응답 집계로 만들었습니다`, 칩 `저장되지 않음`
  - 결과보고서: `전체 복사` 버튼 존재, 번호 섹션 `1. 운영 성과`가 보인다
  - `FollowupPlanAssist`
    - `eligible: false` 초안 → `reason`이 보이고 `문안 복사` 버튼이 없다.
    - `supply_status: 'none'` 초안 → 후보 링크가 없다.
    - 후보 링크 href가 모두 `/instructors/`로 시작한다.
    - `섭외 요청 화면으로` 링크 href `/org/recruitment`
  - 복사 버튼 클릭 → `navigator.clipboard.writeText` 호출 + `복사했습니다`. clipboard 없음 → 실패 문구
  - 렌더된 HTML에 `tel:`·`mailto:`·`localStorage`가 없다.
  - fetch가 reject → 네트워크 에러 문구
  - API가 `{ ok:false, message:'권한이 없습니다.' }` 403 → 그 문구
- 정적:
  - `src/app/(student)`·`src/app/(public)` 아래 파일이 세 컴포넌트를 import 하지 않는다.
  - 세 컴포넌트·`AssistProgress`·`CopyButton` 원문에 `localStorage`·`sessionStorage`·`@anthropic-ai/sdk`가 없다.

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
   - UI_GUIDE 안티패턴(그라데이션·blur·보라색·글로우·pulse/spin)을 쓰지 않았는가?
3. 결과에 따라 `phases/1-post-session-ai/index.json`의 step 6을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"` (컴포넌트·붙인 페이지·버튼 문구를 담는다)
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- `(student)`·`(public)` 라우트 그룹에 이 컴포넌트를 붙이지 마라. 이유: 결과보고서·후속 제안·회고는 기관·강사 업무 화면이고, 학생·보호자에게 도달하면 안 된다 (CLAUDE.md).
- 새 색상 hex·임의 Tailwind 색상(`bg-[#…]`, `text-teal-…` 등)을 쓰지 마라. `globals.css` 토큰만 쓴다. 이유: `tests/ui-guide.test.ts`가 깨지고 화면 일관성이 무너진다.
- 그라데이션·blur·글로우 그림자·`animate-pulse`/`animate-spin`·반짝이(sparkle) 아이콘을 쓰지 마라. 이유: UI_GUIDE AI 슬롭 안티패턴. 완성도는 구조와 타이포로 만든다.
- 초안을 `localStorage`·`sessionStorage`·쿠키에 저장하지 마라. 이유: ADR-024 저장하지 않음, 기관 PC는 공용인 경우가 많다.
- 섭외 요청을 자동으로 보내는 버튼이나 recruitment 서버 액션 호출을 만들지 마라. 이유: ADR-024 — 기관이 섭외 화면에서 직접 보낸다.
- 클라이언트에서 Anthropic SDK나 외부 API를 부르지 마라. 자기 `/api/*` 라우트만 호출한다. 이유: CLAUDE.md 아키텍처 규칙.
- source 표시·단계 문구에 위에 정한 것 외의 문구("AI가 분석했습니다", "Powered by AI" 등)를 넣지 마라. 이유: AI.md — source는 검수용 값이고, 없는 처리를 한다고 보여주면 신뢰를 잃는다.
- 강사 회고에 별점·게이지·등급 배지를 만들지 마라. 이유: ADR-024 — 회고는 강사 평가가 아니다. 소수 지역 강사 풀에서 낙인이 된다.
- `src/lib/ai/*`와 `src/app/api/*`를 수정하지 마라. 이유: 이전 step에서 테스트로 고정됐다.
- 기존 테스트를 깨뜨리지 마라
