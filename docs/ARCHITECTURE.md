# 아키텍처

Find My Mento. Next.js 15 App Router + TypeScript(strict) + Tailwind + Supabase.

## 권한 모델 (설계의 중심)

5종 주체가 같은 DB를 본다. 권한 분리는 **코드가 아니라 RLS(Row Level Security)에서 강제한다.** 코드 레벨 체크만으로 막으면 언젠가 새고, 새면 서비스가 끝난다.

| 주체 | 인증 | 볼 수 있는 것 | 절대 못 보는 것 |
|---|---|---|---|
| 학생 | **없음** (가명코드 입력만) | 승인된 강사 프로필, 프로그램, 공개 Q&A, 자기 설문 결과 | 강사 연락처, 타 학생 응답, 기관 리포트 |
| 보호자 | **없음** (비로그인 문의 폼) | 공개 디렉토리, 공개 Q&A | 강사 연락처, 타인의 문의, 학생 응답 전체 |
| 강사 | Supabase Auth | 자기 프로필·프로그램, **자기에게 배정된 회차와 그 회차의 수업 조건·리포트·교안**, 자기에게 온 섭외 요청·전달된 보호자 문의, 공개 Q&A, 지역 수요 **집계치** | 학생 가명코드 단위 원본 응답, 타 강사 정보, **타 강사의 교안**, 배정되지 않은 회차 |
| 기관·학교 담당자 | Supabase Auth | **자기 기관의** 회차·학생 가명코드·응답·관심표현·동의기록·**발주한 회차의 교안**, 승인된 강사 전체 | 타 기관의 모든 데이터, 타 기관 회차의 교안, 보호자 문의 원본 |
| 운영자 | Supabase Auth (service role) | 강사 심사 큐, 증빙 파일, 신고 내역, 보호자 문의 전체 | - |

**기관과 학교는 같은 주체다.** `organizations.type`으로만 구분하고 권한 로직을 분기하지 않는다 (ADR-013).

### CRITICAL 규칙

1. **모든 테이블에 RLS를 켠다.** 예외 없음. `service_role` 키는 서버 전용이며 클라이언트 번들에 절대 포함되지 않는다.
2. **강사 연락처는 `instructor_contacts` 별도 테이블로 분리한다.** `instructors`와 조인해 통째로 내려주는 쿼리를 만들지 않는다. 이유: 학생 화면에 연락처가 새는 사고는 단 한 번으로 치명적이고, 컬럼이 같은 테이블에 있으면 `select *` 한 줄로 유출된다. **공개 디렉토리도 같은 제약을 받는다** — 디렉토리는 anon 역할로 조회되므로 `instructor_contacts`에 접근할 수 없다.
3. **`students` 테이블에 실명·연락처·학교명 컬럼을 추가하지 않는다.** 가명코드·기관ID·학년까지만. 이 제약이 깨지면 법적 지위(수탁자)가 바뀐다.
4. **1:1 비공개 메시지 테이블을 만들지 않는다.** Q&A는 공개 스레드뿐이다.
5. **`inquiries`(보호자 문의)에 학생 식별 정보 컬럼을 만들지 않는다.** 보호자 본인의 이름·연락처와 학년대(초/중/고)까지만. 아이 이름·학교 컬럼이 생기면 플랫폼이 미성년자 PII 보유자가 된다 (ADR-014).
6. **`inquiries`는 anon이 INSERT만 할 수 있고 SELECT는 할 수 없다.** 비로그인 폼이므로 INSERT가 열려 있어야 하지만, SELECT가 같이 열리면 아무나 다른 보호자의 연락처를 전부 읽는다. 이 비대칭이 RLS 정책의 핵심이고 네거티브 테스트 필수 항목이다.
7. **학급 특성·접근성 정보는 `lecture_sessions`에만 둔다.** `students`·`survey_responses`에 붙이지 않는다. 장애·건강 관련은 민감정보이고, 학생 개인에 귀속되는 순간 별도 동의 의무가 발생한다. `class_traits`는 **고정 체크박스 목록**이며 자유 텍스트 입력을 열지 않는다 (ADR-016).
8. **`lesson_plans`를 읽을 수 있는 주체는 작성 강사·발주 기관·운영자 셋뿐이다.** 타 강사 SELECT 0행, anon SELECT 0행. 학생·보호자에게 도달하는 경로를 만들지 않는다 (ADR-019).

## 디렉토리 구조

```
src/
├── app/
│   ├── (public)/            # 랜딩 1장, 로그인, 초대 수락 — 인증 없음
│   │   ├── programs/        # 공개 프로그램 디렉토리 + 상세 (보호자·학교 담당자용)
│   │   ├── instructors/     # 공개 강사 상세 (연락처 없음)
│   │   └── inquiry/         # 보호자 문의 폼
│   ├── (student)/           # 학생 — 모바일 웹 우선, 로그인 없음
│   │   ├── s/[code]/        # QR 진입 → 설문 → AI 추천 결과
│   │   └── qna/             # 공개 Q&A 열람·질문 작성
│   ├── (org)/               # 기관·학교 담당자 대시보드 + 회차 생성·AI 기획 초안
│   ├── (instructor)/        # 강사 프로필·프로그램·배정 회차·QR 투사·교안·리포트·섭외·문의
│   ├── (admin)/             # 운영자 — 강사 심사, 문의 배정
│   └── api/
│       ├── survey/          # 설문 제출
│       ├── recommend/       # AI 추천 — 학생용 (LLM 키 사용 — 서버 전용)
│       ├── lesson-plan/     # AI 수업 설계 도우미 — 강사용 (LLM 키 사용 — 서버 전용)
│       ├── session-plan/    # AI 회차 기획 도우미 — 기관용 (LLM 키 사용 — 서버 전용)
│       ├── inquiry/         # 보호자 문의 접수 (금칙어·스팸 검증 경유)
│       └── qna/             # 질문·답변 작성 (금칙어 필터 경유)
├── components/
├── types/
├── lib/
│   ├── supabase/            # server.ts / client.ts
│   ├── auth/                # 역할 판별 + 초대 토큰 검증
│   ├── region/              # 시군구 → 인접 확장 로직
│   ├── moderation/          # 연락처·외부링크 차단 필터
│   └── ai/                  # recommend.ts (학생) + lesson-plan.ts (강사) + session-plan.ts (기관)
├── data/
│   └── region-adjacency.json   # 수도권 66개 시군구 인접 관계 (외부 지도 API 미사용)
└── services/
```

## 데이터 모델

| 테이블 | 핵심 컬럼 | 비고 |
|---|---|---|
| `organizations` | 기관명, **type**, 지역코드 | type: `school` / `youth_center` / `edu_company` / `local_gov` (ADR-013) |
| `org_members` | auth_user_id, org_id, role | |
| `admins` | auth_user_id | 운영자 |
| `invitations` | email, role, org_id/provider_id, token, expires_at, accepted_at, created_by | **셀프 가입이 없으므로 계정은 전부 여기서 출발한다** |
| `students` | **pseudo_code**, org_id, grade | **PII 없음** |
| `lecture_sessions` | org_id, **instructor_id (nullable)**, title, field, held_on, closes_at, status, entry_code, grade_band, expected_students, **duration_minutes, venue, class_traits[], equipment[]** | 특강 회차. 생성 주체는 기관·학교뿐이고, `instructor_id`는 **배정**이다 (ADR-015). 강사의 회차 열람 권한이 이 컬럼에서 나온다. 뒤 4개가 **수업 조건**이며 기관이 입력하고 강사는 읽기만 한다 (ADR-016) |
| `survey_responses` | session_id, student_id(nullable), grade, satisfaction(1-5), **followup_intent(1-4)**, interest_fields[], want_to_learn, desired_job, available_times[] | student_id NULL = 익명 응답. 만족도와 후속 의향은 **반드시 별개 컬럼**이다. 문항 정의는 `/docs/SURVEY.md` |
| `providers` | 업체명, region_code, status | 교육업체. 프리랜서 강사는 소속이 없다 |
| `instructors` | **provider_id (nullable)**, name, region_code, fields[], bio, status | status: pending/approved/rejected |
| `instructor_contacts` | instructor_id, phone, email | **분리 테이블. 학생·보호자(anon) SELECT 불가** |
| `instructor_verifications` | instructor_id, file_path, type | Supabase Storage, 비공개 버킷 |
| `programs` | instructor_id, title, field, target_grades, format, session_count | 공개 디렉토리의 기본 단위 |
| `interests` | student_id, target(program/instructor), session_id, status | 학생의 "관심 표현" |
| `inquiries` | guardian_name, guardian_contact, region_code, **grade_band**, field, target_type(program/instructor/none), target_id, message, status, assigned_instructor_id, handled_by | **보호자 문의 = 개인 경로의 유일한 접점.** anon INSERT 전용. 학생 식별 컬럼 금지 (ADR-014) |
| `recruitment_requests` | org_id, instructor_id, field, demand_count, status, **close_reason** | 기관·학교 → 강사 섭외. `close_reason`은 성사되지 않은 이유이며 **`공급 없음` / `장소 없음` / `예산 없음` / `일정 불가`** 고정값이다. `장소 없음` 건수가 공간 사업 판단의 유일한 근거다 (ADR-023) |
| `consents` | student_id, interest_id, recorded_by, method, recorded_at | 보호자 동의 **기록**만 |
| `qna_questions` | student_id, field, body, visibility, org_id | |
| `qna_answers` | question_id, instructor_id, body | |
| `moderation_reports` | target_type, target_id, reason, handled_by | |
| `lesson_plans` | session_id, instructor_id, content(jsonb), inputs_snapshot(jsonb), source(`llm`/`rule`), status(`draft`/`final`) | **AI 수업 설계 도우미 산출물.** 열람은 작성 강사·발주 기관·운영자뿐 (ADR-019). `inputs_snapshot`은 어떤 조건으로 생성했는지의 기록 — 재현과 검수에 쓴다 |

테이블 20개. `lesson_plans`가 추가되고 `lecture_sessions`에 수업 조건 4컬럼(`duration_minutes`·`venue`·`class_traits[]`·`equipment[]`)이 들어온다 (ADR-016).

`class_traits`의 허용값은 DB에서 강제한다 — 자유 텍스트가 들어오면 제약이 거부한다. 목록: `통합학급 포함` / `휠체어 사용 학생 있음` / `청각 보조 필요` / `시각 보조 필요` / `한국어 보조 필요` / `첫 경험 다수` / `경험자 다수` / `집중 지속이 짧은 편`.

## 인증과 라우팅

**셀프 가입이 없다.** 기관·학교 담당자·강사·운영자 계정은 전부 초대로만 생성된다 (ADR-011). 로그인은 이메일 매직링크이며 비밀번호를 저장하지 않는다. **보호자는 계정을 만들지 않는다** — 문의는 비로그인 폼이다.

```
/                    랜딩 1장 (공개)          → 로그인 진입구 + 문의
/programs            공개 프로그램 디렉토리 (공개, 필터)
/programs/[id]       프로그램 상세 (공개) → "문의하기"
/instructors/[id]    강사 상세 (공개, 연락처 없음)
/inquiry             보호자 문의 폼 (공개, 비로그인)
/login               매직링크 요청 (공개)
/invite/[token]      초대 수락 → 계정 생성 (공개, 토큰 유효성 검증 필수)
/s/[code]            학생 설문 (공개, 인증 없음)
/qna                 공개 Q&A 열람 (공개)
/org/*               기관·학교 담당자       ← org_members
/instructor/*        강사                   ← instructors
  └ /instructor/sessions/[id]/plan   배정 회차의 교안 초안 생성·편집 (배정 강사만)
/admin/*             운영자                 ← admins
```

로그인 후 역할에 따라 `/org`, `/instructor`, `/admin`으로 분기한다. 역할은 **`auth_user_id`가 어느 테이블에 있는지로 판별**한다 (`org_members` / `instructors` / `admins`). 클라이언트가 보낸 값이나 JWT에 직접 써넣은 역할 문자열을 신뢰하지 말 것. **`organizations.type`은 화면 문구와 집계 분류에만 쓰고 권한 판단에 쓰지 않는다.**

RLS에서 같은 판별을 반복하지 않도록 Postgres 함수로 한 번만 정의하고 정책에서 재사용한다:

```sql
-- 시그니처만. 구현은 구현 step에서.
app.current_org_id()      -- 호출자가 속한 기관 ID (없으면 NULL)
app.current_instructor_id()
app.is_admin()            -- boolean
```

**초대 토큰 규칙**: 1회용, 만료시각 필수, 수락 시 `accepted_at` 기록. 만료·사용된 토큰으로는 계정이 생성되지 않아야 한다. 이 경로가 뚫리면 아무나 기관 담당자가 되어 그 기관 학생 데이터를 열 수 있다.

## 패턴

- **Server Components 기본.** 조회는 Server Component에서 Supabase를 직접 호출한다(RLS가 적용되므로 API 라우트를 한 겹 더 두지 않는다). 공개 디렉토리도 Server Component에서 anon 키로 직접 조회한다.
- **Client Component는 입력·상호작용에만.** 설문 폼, 디렉토리 필터, 문의 폼, Q&A 작성, 대시보드 차트.
- **API 라우트는 두 경우에만 만든다.** (a) LLM 키 등 서버 전용 비밀이 필요할 때, (b) 쓰기 전에 서버 검증이 필요할 때(금칙어 필터, 설문 중복 제출 방지, 문의 스팸 검증).

## 데이터 흐름

```
학생 설문:
QR → /s/[code] (Server) → 가명코드 입력 → 설문 폼 (Client)
  → POST /api/survey → 검증 → survey_responses INSERT
  → POST /api/recommend → 규칙 필터(지역·학년·분야)로 후보 추림 → LLM이 순위+이유 생성
  → 추천 카드 렌더 → "관심 표현" → interests INSERT

기관·학교 대시보드:
로그인 → Server Component에서 Supabase 조회 (RLS가 자기 기관으로 자동 한정)
  → 수요 집계 → 추천 강사 → 섭외 요청 INSERT
  → 섭외가 무산되면 close_reason 기록 (공급 없음 / 장소 없음 / 예산 없음 / 일정 불가)

AI 회차 기획 도우미 (기관용, 회차 만들기 전):
회차 생성 화면 → 대상 학년·인원·시수·목적·예산대 입력 (Client)
  → POST /api/session-plan
     ├ 규칙: 우리 지역 공급 현황 + 미충족 수요 집계로 후보 분야 확정
     └ LLM: 특강 유형 제안 · 강사 요구 조건 · 사전 준비물 문장 생성
  → 실패하면 지역 공급 현황 표만으로 규칙 응답 (에러 화면 없음)
  → 담당자가 수정 → 그대로 회차 생성 폼에 채워진다

강사 워크스페이스:
로그인 → **이번 달 받은 것** 집계 (배정 N · 리드 N · 교안 N · 리포트 N)
         ↳ 별도 테이블 없이 집계 쿼리로 만든다. 배정 연동 과금의 청구 근거 화면이다 (ADR-020)
  → 배정 회차 목록 (lecture_sessions.instructor_id = app.current_instructor_id())
  → 교실 투사용 QR 화면 (회차 entry_code로 렌더)
  → 회차 리포트 (집계치만. 학생 단위 원본은 RLS가 막는다)

AI 수업 설계 도우미 (강사용, 수업 전):
배정 회차 상세 → "교안 초안 만들기" (Client)
  → POST /api/lesson-plan
     ├ 규칙: 회차 조건(시수·장소·class_traits·장비) + 프로그램 outline 조립
     ├ 규칙: 같은 기관·같은 분야 지난 회차 설문 집계 (응답 5건 미만이면 생략 — ADR-018)
     ├ 규칙: 자유서술은 maskForStorage 통과분만
     └ LLM: 차시 흐름 + 단계별 난이도 분기 생성
  → 실패하면 outline 기반 규칙 템플릿으로 골격 반환 (에러 화면 없음)
  → lesson_plans INSERT (source: llm | rule) → 강사가 수정 → status: final
  → 발주 기관 담당자도 같은 교안을 열람 (ADR-019)

개인(보호자) 경로:
/programs (Server, anon) → 필터 → /programs/[id] → "문의하기"
  → 문의 폼 (Client) → POST /api/inquiry → 스팸·금칙어 검증 → inquiries INSERT
  → 운영자 화면에서 확인 → assigned_instructor_id 지정 → 강사 화면에 리드로 노출
  → 수업 성립은 플랫폼 밖 (ADR-007)

Q&A:
질문 작성 (Client) → POST /api/qna → moderation 필터(연락처·링크 차단) → INSERT (공개)
```

## 지역 확장 규칙

추천·디렉토리 결과가 비면 단계적으로 넓힌다. **빈 화면을 절대 보여주지 않는다.**

```
같은 시군구 → 인접 시군구(1-hop) → 인접의 인접(2-hop) → "이 지역에 아직 강사가 없습니다 + Q&A로 먼저 물어보기"
```

**"같은 시도"를 단계에 넣지 말 것.** 파일럿 지역 광명시는 인접 5곳 중 2곳(서울 구로구·금천구)이 서울이다. 광명 학생에게 같은 경기도인 양평군은 서울 구로구보다 훨씬 멀다. 행정 경계가 아니라 인접 관계로만 넓힌다.

마지막 단계가 중요하다. 빈 화면 대신 Q&A로 흘려보내면 관심 신호를 잃지 않는다. 그리고 이 단계에 도달했다는 사실 자체를 **미충족 수요로 기록한다** — 관심은 있었는데 공급이 없었다는 데이터가 제품의 핵심 자산이다. 공개 디렉토리에서 0건이 난 경우도 같은 규칙으로 기록한다.

## 상태 관리

서버 상태는 Server Components. 클라이언트 상태는 `useState`/`useReducer`. 전역 상태 라이브러리를 도입하지 않는다 — 화면 간 공유할 클라이언트 상태가 없다.
