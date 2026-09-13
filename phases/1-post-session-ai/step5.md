# Step 5: post-session-api

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` — 역할 판별 규칙, API 라우트 규칙
- `/docs/AI.md` — "수업 후 AI — 기능 4·5·6"
- `/docs/ADR.md` — ADR-015, ADR-024
- `/docs/ARCHITECTURE.md` — "패턴", 권한 모델
- `src/app/api/session-plan/route.ts` — 기관 전용 라우트 패턴 (레이트리밋 → 역할 → 본문 → 생성 → 200)
- `src/app/api/lesson-plan/route.ts` — 배정 강사 확인 패턴 (`403 권한이 없습니다` / `404 배정된 회차가 아닙니다`)
- `src/lib/auth/actor.ts` — `getActor`, `Actor`, 데모 액터(`org`=org-1, `school`=org-2, `instructor`=in-2)
- `src/lib/db/dataset.ts` — `loadDataset`
- `src/lib/validation/` — `rateLimit`, `clientKey`
- `src/lib/ai/result-report.ts`, `src/lib/ai/followup-plan.ts`, `src/lib/ai/session-debrief.ts` — step 2~4 산출물
- `src/data/demo.ts` — `ls-1`(org-1, 배정 in-2), `ls-2`(org-1, 배정 in-1), `ls-4`(org-2)
- `tests/health.test.ts` — 라우트를 직접 import 해서 호출하는 테스트 방식 (`// @vitest-environment node`)

## 작업

수업 후 AI 3종의 API 라우트를 만든다. **테스트를 먼저 쓰고**(TDD) 구현한다. 화면은 만들지 않는다.

### 파일

- `src/app/api/result-report/route.ts` (신규) — 기관·학교 전용
- `src/app/api/followup-plan/route.ts` (신규) — 기관·학교 전용
- `src/app/api/session-debrief/route.ts` (신규) — 배정 강사 전용
- `tests/post-session-api.test.ts` (신규)

### 시그니처

```ts
// 세 파일 모두
export async function POST(request: Request): Promise<Response>
```

요청 본문: `{ "sessionId": string }`
성공 응답: `200 { ok: true, source: 'llm' | 'rule', draft: <ResultReportDraft | FollowupPlanDraft | SessionDebriefDraft> }`

### 처리 순서 (세 라우트 공통 — 이 순서를 지킨다)

1. `rateLimit(clientKey(request.headers, '<라우트 이름>'), 10, 60_000)`이 false → `429 { ok: false, message: '잠시 후 다시 시도해 주세요.' }`
2. `getActor()`
   - `result-report`·`followup-plan`: `actor?.role !== 'org_member'` → `403 { ok: false, message: '권한이 없습니다.' }`
   - `session-debrief`: `actor?.role !== 'instructor'` → 같은 403
3. `request.json()` 실패 → `400 { ok: false, message: '요청을 읽을 수 없습니다.' }`. `sessionId`가 1~64자 문자열이 아니면 → `400 { ok: false, message: '회차를 지정해 주세요.' }`
4. `loadDataset()` 후 회차 소유 확인
   - 기관 라우트: `s.id === sessionId && s.org_id === actor.orgId`. 없으면 → `404 { ok: false, message: '회차를 찾을 수 없습니다.' }`. **없는 회차와 남의 기관 회차는 똑같은 응답이어야 한다.**
   - 강사 라우트: `s.id === sessionId && s.instructor_id === actor.instructorId`. 없으면 → `404 { ok: false, message: '배정된 회차가 아닙니다.' }`
5. `generateResultReport` / `generateFollowupPlan` / `generateDebrief` 호출.
   - 예상 밖 예외가 나면 같은 모듈의 규칙 함수(`ruleResultReport` / `ruleFollowupPlan` / `ruleDebrief`)로 초안을 만들어 200을 반환한다.
   - 결과가 null이면 4번과 같은 404.
6. `200 { ok: true, source: draft.source, draft }`

### 핵심 규칙

- **역할과 소속은 `getActor()`로만 판단한다.** 본문의 `orgId`·`instructorId`·`role` 같은 값을 읽지 않는다. `organizations.type`으로 권한을 분기하지 않는다.
- **아무것도 저장하지 않는다.** Supabase insert/update, Dataset 변경, 파일 쓰기가 없다.
- 요청 본문·초안을 `console.log` 하지 않는다.
- LLM 호출은 lib/ai 모듈 안에서만 일어난다. 라우트에서 Anthropic SDK를 import 하지 않는다.

### 테스트 (`tests/post-session-api.test.ts`) — 최소 포함

파일 첫 줄 `// @vitest-environment node`. `vi.mock('@/lib/auth/actor', …)`로 `getActor`를 테스트마다 바꿀 수 있게 한다. 액터 값은 `actor.ts`의 데모 액터와 같은 모양을 쓴다. `ANTHROPIC_API_KEY`는 지운다. 레이트리밋 전용 테스트가 아니면 요청마다 다른 `x-forwarded-for`를 주거나 clientKey 구현에 맞춰 충돌을 피한다.

- `result-report`·`followup-plan` 각각:
  - 액터 없음 → 403, 강사 액터 → 403
  - school(org-2) 액터로 `ls-1` → 404, org(org-1) 액터로 `ls-999` → 404, **두 404의 본문이 같다**
  - org 액터로 `ls-1` → 200, `ok: true`, `source: 'rule'`, `draft.session_id === 'ls-1'`
  - 깨진 JSON → 400, `sessionId` 없음 → 400
- `session-debrief`:
  - org 액터 → 403
  - in-1 강사로 `ls-1` → 404
  - in-2 강사로 `ls-1` → 200 `source: 'rule'`
- 모든 200 응답 원문에 `010-`, `@`가 들어간 이메일 형태, `phone`, `instructor_contacts`가 없다.
- 같은 clientKey로 11번 호출 → 11번째가 429.
- 저장하지 않음: 호출 전후 `loadDataset()`의 `lessonPlans`·`recruitmentRequests`·`surveyResponses` 길이가 같다.
- 정적 검사: 세 라우트 파일 원문에 `instructor_contacts`, `@/lib/supabase/client`, `@anthropic-ai/sdk`가 없고 `getActor`가 있다.

## Acceptance Criteria

```bash
npm run lint
npm run build
npm test
grep -c "getActor" src/app/api/result-report/route.ts src/app/api/followup-plan/route.ts src/app/api/session-debrief/route.ts   # 모두 1 이상
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md "패턴"의 API 라우트 조건(서버 전용 비밀 필요)에 맞는가?
   - ADR 기술 스택을 벗어나지 않았는가?
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가? (역할은 테이블 소속으로만 판별, service_role 키 클라이언트 노출 없음, 강사 연락처 없음)
3. 결과에 따라 `phases/1-post-session-ai/index.json`의 step 5를 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"` (라우트 경로·요청/응답 형태·상태코드를 담는다)
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- 요청 본문에서 역할·기관·강사 ID를 받아 권한에 쓰지 마라. 이유: CLAUDE.md — 역할은 `org_members`/`instructors`/`admins` 소속으로만 판별한다.
- 남의 회차와 없는 회차에 다른 메시지·상태코드를 주지 마라. 이유: 다른 기관 회차의 존재 여부가 샌다.
- 결과를 저장하거나 섭외 요청을 생성하지 마라. 이유: ADR-024.
- 강사가 기관 라우트를, 기관이 강사 라우트를 호출할 수 있게 하지 마라. 이유: ADR-019 교안·회고는 강사 소유, 결과보고서는 발주 기관 업무.
- `src/lib/ai/*` 모듈을 수정하지 마라. 이유: step 2~4에서 테스트로 고정된 동작이다. 라우트가 맞춘다.
- 컴포넌트·페이지를 만들지 마라. 이유: step 6의 범위다.
- 기존 테스트를 깨뜨리지 마라
