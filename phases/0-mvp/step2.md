# Step 2: db-schema

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/docs/USER_FLOW.md` — 사용자 여정, 유스케이스(UC), 예외 흐름(E), 검증 가설(H)
- `/docs/ARCHITECTURE.md` — "권한 모델", "데이터 모델", "인증과 라우팅" 섹션 전체
- `/docs/ADR.md` — ADR-002, ADR-003, ADR-006, ADR-010, ADR-011, **ADR-013(학교=organizations.type), ADR-014(보호자 문의), ADR-015(회차 배정)**
- `/docs/SURVEY.md` — `survey_responses` 컬럼이 설문 문항과 1:1로 대응한다
- `/CLAUDE.md` — 안전 규칙 전체
- 이전 step 산출물: `src/data/region-adjacency.json`(시군구 코드 체계), `package.json`

**이 step이 제품의 안전 설계가 실제로 구현되는 유일한 지점이다.** 화면은 나중에 고칠 수 있지만 권한 모델이 틀리면 전부 다시 만들어야 한다.

## 사전 조건 (없으면 즉시 blocked)

이 환경에는 **Docker와 Supabase CLI가 설치되어 있지 않다.** 로컬 Supabase 스택을 쓸 수 없으므로 **원격 Supabase dev 프로젝트**에 마이그레이션을 적용한다.

필요한 것:

- `.env.local`에 `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- Supabase 프로젝트 ref와 CLI 인증(access token)

하나라도 없으면 **코드를 작성하지 말고 즉시 `blocked`** 로 기록하고 중단하라. `blocked_reason`에 정확히 무엇이 없는지 적어라. 추측값이나 더미 프로젝트로 진행하지 마라.

## 작업

### 1. Supabase CLI와 마이그레이션 골격

`supabase`를 devDependency로 설치하고(`npm i -D supabase`) 마이그레이션을 `supabase/migrations/`에 둔다. `package.json`에 스크립트를 추가한다:

- `db:push` — 원격 dev 프로젝트에 마이그레이션 적용
- `db:types` — TypeScript 타입 생성 (step 3에서 사용)

### 2. 테이블 19개

`/docs/ARCHITECTURE.md`의 데이터 모델 표를 그대로 구현한다. 컬럼을 임의로 추가·삭제하지 마라.

```
organizations  org_members  admins  invitations
students  lecture_sessions  survey_responses
providers  instructors  instructor_contacts  instructor_verifications  programs
interests  inquiries  recruitment_requests  consents
qna_questions  qna_answers  moderation_reports
```

**반드시 지킬 제약:**

- `students`에 이름·연락처·학교명·생년월일 컬럼을 만들지 마라. 컬럼은 가명코드·기관ID·학년까지다. (ADR-003)
- `instructor_contacts`는 `instructors`와 **별개 테이블**이다. 연락처 컬럼을 `instructors`로 합치지 마라. (CLAUDE.md CRITICAL)
- `survey_responses`는 `satisfaction`과 `followup_intent`를 **별개 컬럼**으로 가진다. 합치지 마라. (SURVEY.md)
- `survey_responses.student_id`는 nullable이다(익명 응답). 단 `(session_id, student_id)`에 유니크 제약을 둬서 같은 학생이 같은 회차에 두 번 응답하지 못하게 한다.
- `invitations`는 1회용이다. token 유니크, `expires_at` NOT NULL, `accepted_at` nullable.
- `lecture_sessions`는 **응답 마감**을 가진다. `closes_at` NOT NULL, `status`(open/closed). 마감 후 설문 제출은 거부된다. (E-17)
- `organizations`에 **`type`** 컬럼을 둔다 (`school` / `youth_center` / `edu_company` / `local_gov`). 학교를 위한 별도 테이블을 만들지 마라. 권한 정책을 `type`으로 분기하지도 마라 — 화면 문구와 집계 분류에만 쓴다. (ADR-013)
- `lecture_sessions`에 **`instructor_id` (nullable)** 를 둔다. 회차 INSERT 권한은 `org_members`에게만 주고 강사에게는 주지 마라. 강사는 이 컬럼으로 **배정**되며, 강사의 회차·리포트 열람 권한 전부가 이 컬럼에서 나온다. (ADR-015, UC-28·29, E-23)
- `inquiries`(보호자 문의)에 **학생 이름·학교·생년월일 컬럼을 만들지 마라.** 컬럼은 보호자 본인 이름·연락처, `region_code`, `grade_band`(초/중/고), `field`, `target_type`/`target_id`, `message`, `status`, `assigned_instructor_id`까지다. (ADR-014)
- `inquiries`의 RLS는 **비대칭**이다. anon은 **INSERT만** 가능하고 **SELECT는 불가능**하다. 하나의 정책으로 뭉개지 말고 INSERT 정책과 SELECT 정책을 따로 쓴다. SELECT가 같이 열리면 아무나 모든 보호자의 연락처를 읽는다.
- **1:1 메시지 테이블을 만들지 마라.** (ADR-006 — 영구 결정)

### 3. 역할 판별 함수

RLS 정책에서 반복하지 않도록 먼저 정의한다. 시그니처만 따르고 구현은 재량이다.

```sql
app.current_org_id()         -- 호출자가 속한 기관 ID, 없으면 NULL
app.current_instructor_id()  -- 호출자의 강사 ID, 없으면 NULL
app.is_admin()               -- boolean
```

`auth.uid()`가 `org_members` / `instructors` / `admins` 중 어디에 있는지로 판별한다. **JWT 커스텀 클레임이나 클라이언트가 보낸 값으로 역할을 판단하지 마라.** (CLAUDE.md CRITICAL)

### 4. RLS 정책

**19개 테이블 전부 ENABLE ROW LEVEL SECURITY.** 예외 없다. `/docs/ARCHITECTURE.md`의 권한 모델 표가 정책의 명세다.

핵심만 다시 적는다:

- anon 역할: 승인된 강사·프로그램의 공개 정보(공개 디렉토리가 이 권한으로 조회된다), 공개 Q&A, 자기 설문 제출, **`inquiries` INSERT**까지만. `instructor_contacts`와 `inquiries`는 **SELECT 불가**.
- 기관 담당자: `app.current_org_id()`와 일치하는 행만. 타 기관 데이터는 0행이 나와야 한다.
- 강사: 자기 행, **`instructor_id`가 자기인 회차**, 자기에게 온 섭외 요청, `assigned_instructor_id`가 자기인 문의, 공개 Q&A. 학생 단위 원본 응답은 불가(집계는 별도 뷰·함수로). **회차 INSERT·UPDATE 불가.**
- 운영자: 심사 대상 전체.

### 5. RLS 네거티브 테스트 (TDD — 먼저 작성)

"권한 없는 역할이 접근하면 실패한다"를 검증하는 테스트가 이 step의 핵심 산출물이다. 최소 항목:

1. anon 클라이언트로 `instructor_contacts` SELECT → 0행 또는 에러
2. 기관 A 담당자로 기관 B의 `students` SELECT → 0행
3. 기관 A 담당자로 기관 B의 `survey_responses` SELECT → 0행
4. 강사 계정으로 `survey_responses` 원본 SELECT → 0행
5. anon으로 미승인(pending) 강사 SELECT → 0행
6. anon으로 `invitations` SELECT → 0행
7. 만료된 초대 토큰으로 수락 시도 → 실패
8. anon으로 `consents` SELECT → 0행
9. 마감된(`status = 'closed'`) 회차에 설문 INSERT → 실패 (E-17)
10. anon으로 `inquiries` SELECT → 0행 또는 에러
11. anon으로 `inquiries` INSERT → **성공** (이게 막히면 개인 경로 전체가 죽는다. 같은 테이블에서 두 방향을 각각 검증한다)
12. 강사 계정으로 **배정되지 않은** 회차(`instructor_id`가 다른 강사) SELECT → 0행 (ADR-015)
13. 강사 계정으로 `lecture_sessions` INSERT → 실패 (회차 생성 권한은 기관·학교만)
14. 강사 계정으로 `assigned_instructor_id`가 다른 강사인 `inquiries` SELECT → 0행

테스트는 `service_role`이 아니라 **실제 역할 키·세션으로** 수행해야 한다. `service_role`로 돌리면 RLS를 우회하므로 아무것도 검증하지 못한다.

## Acceptance Criteria

```bash
npm run db:push   # 원격 dev 프로젝트에 마이그레이션 적용 성공
npm run build
npm run lint
npm test          # RLS 네거티브 테스트 포함 전체 통과
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - 19개 테이블 전부 RLS가 켜져 있는가? (`pg_tables` 조회로 확인)
   - `students`에 PII 컬럼이 없는가?
   - `inquiries`에 학생 식별 컬럼이 없는가?
   - `inquiries`의 anon INSERT는 되고 SELECT는 안 되는가?
   - `organizations.type`이 있고, 학교용 별도 테이블을 만들지 않았는가?
   - `lecture_sessions.instructor_id`가 있고 강사가 회차를 INSERT할 수 없는가?
   - `instructor_contacts`가 분리되어 있는가?
   - 1:1 메시지 테이블이 없는가?
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가?
3. 결과에 따라 `phases/0-mvp/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- RLS를 끄거나, 테스트를 통과시키려고 정책을 느슨하게 만들지 마라. 이유: 권한 분리가 이 제품의 존재 조건이다(ADR-002). 테스트가 막히면 정책이 아니라 쿼리를 고쳐라.
- `service_role` 키로 RLS 테스트를 작성하지 마라. 이유: RLS를 우회하므로 통과해도 아무것도 증명하지 못한다.
- `students`에 개인정보 컬럼을 추가하지 마라. 이유: 플랫폼이 학생 PII를 보유하지 않는다는 전제로 법적 지위(수탁자)와 동의 구조 전체가 설계됐다(ADR-003).
- 학생-강사 1:1 메시지 테이블을 만들지 마라. 이유: ADR-006의 영구 결정. 비공개 채널이 생기면 기관 경유 안전 설계가 무너진다.
- `inquiries`에 anon SELECT를 열지 마라. 이유: 비로그인 폼이므로 INSERT는 열려 있어야 하지만, SELECT가 같이 열리면 누구나 모든 보호자의 실명·연락처를 내려받는다. 이 테이블은 학생이 아닌 성인의 PII를 실제로 보유하는 유일한 테이블이다.
- `inquiries`에 아이 이름·학교 컬럼을 만들지 마라. 이유: 플랫폼이 미성년자 PII 보유자가 되는 순간 ADR-003이 전제한 법적 지위가 무너진다.
- 강사 역할에 `lecture_sessions` INSERT 권한을 주지 마라. 이유: 회차의 소유자가 기관이어야 개인정보 처리위탁 관계가 성립한다(ADR-015). 강사가 회차를 만들 수 있으면 기관 동의 없이 그 기관 학생에게 설문을 돌릴 수 있다.
- 학교용 별도 테이블(`schools`)을 만들지 마라. 이유: 모든 RLS 정책과 쿼리가 두 벌이 되고 권한 누락 확률이 두 배가 된다(ADR-013).
- UI·API 라우트 코드를 작성하지 마라. 이유: 이 step은 DB 레이어다.
- 키가 없는 상태에서 더미 프로젝트를 만들어 진행하지 마라. `blocked`로 중단하라. 이유: 잘못된 프로젝트에 스키마를 만들면 이후 step이 전부 엉뚱한 DB를 가리킨다.
- 기존 테스트를 깨뜨리지 마라.
