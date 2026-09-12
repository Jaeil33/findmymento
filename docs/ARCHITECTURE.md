# 아키텍처

Find My Mento. Next.js 15 App Router + TypeScript(strict) + Tailwind + Supabase.

## 권한 모델 (설계의 중심)

4종 주체가 같은 DB를 본다. 권한 분리는 **코드가 아니라 RLS(Row Level Security)에서 강제한다.** 코드 레벨 체크만으로 막으면 언젠가 새고, 새면 서비스가 끝난다.

| 주체 | 인증 | 볼 수 있는 것 | 절대 못 보는 것 |
|---|---|---|---|
| 학생 | **없음** (가명코드 입력만) | 승인된 강사 프로필, 프로그램, 공개 Q&A, 자기 설문 결과 | 강사 연락처, 타 학생 응답, 기관 리포트 |
| 강사 | Supabase Auth | 자기 프로필·프로그램, 자기에게 온 섭외 요청, 공개 Q&A, 지역 수요 **집계치** | 학생 가명코드 단위 원본 응답, 타 강사 정보 |
| 기관 담당자 | Supabase Auth | **자기 기관의** 회차·학생 가명코드·응답·관심표현·동의기록, 승인된 강사 전체 | 타 기관의 모든 데이터 |
| 운영자 | Supabase Auth (service role) | 강사 심사 큐, 증빙 파일, 신고 내역 | - |

### CRITICAL 규칙

1. **모든 테이블에 RLS를 켠다.** 예외 없음. `service_role` 키는 서버 전용이며 클라이언트 번들에 절대 포함되지 않는다.
2. **강사 연락처는 `instructor_contacts` 별도 테이블로 분리한다.** `instructors`와 조인해 통째로 내려주는 쿼리를 만들지 않는다. 이유: 학생 화면에 연락처가 새는 사고는 단 한 번으로 치명적이고, 컬럼이 같은 테이블에 있으면 `select *` 한 줄로 유출된다.
3. **`students` 테이블에 실명·연락처·학교명 컬럼을 추가하지 않는다.** 가명코드·기관ID·학년까지만. 이 제약이 깨지면 법적 지위(수탁자)가 바뀐다.
4. **1:1 비공개 메시지 테이블을 만들지 않는다.** Q&A는 공개 스레드뿐이다.

## 디렉토리 구조

```
src/
├── app/
│   ├── (public)/            # 랜딩 1장, 로그인, 초대 수락 — 인증 없음
│   ├── (student)/           # 학생 — 모바일 웹 우선, 로그인 없음
│   │   ├── s/[code]/        # QR 진입 → 설문 → AI 추천 결과
│   │   └── qna/             # 공개 Q&A 열람·질문 작성
│   ├── (org)/               # 기관 담당자 대시보드
│   ├── (instructor)/        # 강사 프로필·프로그램·섭외 요청
│   ├── (admin)/             # 운영자 — 강사 심사
│   └── api/
│       ├── survey/          # 설문 제출
│       ├── recommend/       # AI 추천 (LLM 키 사용 — 서버 전용)
│       └── qna/             # 질문·답변 작성 (금칙어 필터 경유)
├── components/
├── types/
├── lib/
│   ├── supabase/            # server.ts / client.ts
│   ├── auth/                # 역할 판별 + 초대 토큰 검증
│   ├── region/              # 시군구 → 인접 확장 로직
│   ├── moderation/          # 연락처·외부링크 차단 필터
│   └── ai/                  # 후보 필터 + 프롬프트
├── data/
│   └── region-adjacency.json   # 수도권 66개 시군구 인접 관계 (외부 지도 API 미사용)
└── services/
```

## 데이터 모델

| 테이블 | 핵심 컬럼 | 비고 |
|---|---|---|
| `organizations` | 기관명, 지역코드 | |
| `org_members` | auth_user_id, org_id, role | |
| `admins` | auth_user_id | 운영자 |
| `invitations` | email, role, org_id/provider_id, token, expires_at, accepted_at, created_by | **셀프 가입이 없으므로 계정은 전부 여기서 출발한다** |
| `students` | **pseudo_code**, org_id, grade | **PII 없음** |
| `lecture_sessions` | org_id, title, field, held_on, entry_code | 특강 회차 |
| `survey_responses` | session_id, student_id(nullable), satisfaction, interest_fields[], want_to_learn, desired_job | student_id NULL = 익명 응답 |
| `providers` | 업체명, region_code, status | 교육업체. 프리랜서 강사는 소속이 없다 |
| `instructors` | **provider_id (nullable)**, name, region_code, fields[], bio, status | status: pending/approved/rejected |
| `instructor_contacts` | instructor_id, phone, email | **분리 테이블. 학생 역할 SELECT 불가** |
| `instructor_verifications` | instructor_id, file_path, type | Supabase Storage, 비공개 버킷 |
| `programs` | instructor_id, title, field, target_grades, format, session_count | |
| `interests` | student_id, target(program/instructor), session_id, status | 학생의 "관심 표현" |
| `recruitment_requests` | org_id, instructor_id, field, demand_count, status | 기관 → 강사 섭외 |
| `consents` | student_id, interest_id, recorded_by, method, recorded_at | 보호자 동의 **기록**만 |
| `qna_questions` | student_id, field, body, visibility, org_id | |
| `qna_answers` | question_id, instructor_id, body | |
| `moderation_reports` | target_type, target_id, reason, handled_by | |

## 인증과 라우팅

**셀프 가입이 없다.** 기관 담당자·강사·운영자 계정은 전부 초대로만 생성된다 (ADR-011). 로그인은 이메일 매직링크이며 비밀번호를 저장하지 않는다.

```
/                    랜딩 1장 (공개)          → 로그인 진입구 + 문의
/login               매직링크 요청 (공개)
/invite/[token]      초대 수락 → 계정 생성 (공개, 토큰 유효성 검증 필수)
/s/[code]            학생 설문 (공개, 인증 없음)
/qna                 공개 Q&A 열람 (공개)
/org/*               기관 담당자            ← org_members
/instructor/*        강사                   ← instructors
/admin/*             운영자                 ← admins
```

로그인 후 역할에 따라 `/org`, `/instructor`, `/admin`으로 분기한다. 역할은 **`auth_user_id`가 어느 테이블에 있는지로 판별**한다 (`org_members` / `instructors` / `admins`). 클라이언트가 보낸 값이나 JWT에 직접 써넣은 역할 문자열을 신뢰하지 말 것.

RLS에서 같은 판별을 반복하지 않도록 Postgres 함수로 한 번만 정의하고 정책에서 재사용한다:

```sql
-- 시그니처만. 구현은 구현 step에서.
app.current_org_id()      -- 호출자가 속한 기관 ID (없으면 NULL)
app.current_instructor_id()
app.is_admin()            -- boolean
```

**초대 토큰 규칙**: 1회용, 만료시각 필수, 수락 시 `accepted_at` 기록. 만료·사용된 토큰으로는 계정이 생성되지 않아야 한다. 이 경로가 뚫리면 아무나 기관 담당자가 되어 그 기관 학생 데이터를 열 수 있다.

## 패턴

- **Server Components 기본.** 조회는 Server Component에서 Supabase를 직접 호출한다(RLS가 적용되므로 API 라우트를 한 겹 더 두지 않는다).
- **Client Component는 입력·상호작용에만.** 설문 폼, 디렉토리 필터, Q&A 작성, 대시보드 차트.
- **API 라우트는 두 경우에만 만든다.** (a) LLM 키 등 서버 전용 비밀이 필요할 때, (b) 쓰기 전에 서버 검증이 필요할 때(금칙어 필터, 설문 중복 제출 방지).

## 데이터 흐름

```
학생 설문:
QR → /s/[code] (Server) → 가명코드 입력 → 설문 폼 (Client)
  → POST /api/survey → 검증 → survey_responses INSERT
  → POST /api/recommend → 규칙 필터(지역·학년·분야)로 후보 추림 → LLM이 순위+이유 생성
  → 추천 카드 렌더 → "관심 표현" → interests INSERT

기관 대시보드:
로그인 → Server Component에서 Supabase 조회 (RLS가 자기 기관으로 자동 한정)
  → 수요 집계 → 추천 강사 → 섭외 요청 INSERT

Q&A:
질문 작성 (Client) → POST /api/qna → moderation 필터(연락처·링크 차단) → INSERT (공개)
```

## 지역 확장 규칙

추천·검색 결과가 비면 단계적으로 넓힌다. **빈 화면을 절대 보여주지 않는다.**

```
같은 시군구 → 인접 시군구(1-hop) → 인접의 인접(2-hop) → "이 지역에 아직 강사가 없습니다 + Q&A로 먼저 물어보기"
```

**"같은 시도"를 단계에 넣지 말 것.** 파일럿 지역 광명시는 인접 5곳 중 2곳(서울 구로구·금천구)이 서울이다. 광명 학생에게 같은 경기도인 양평군은 서울 구로구보다 훨씬 멀다. 행정 경계가 아니라 인접 관계로만 넓힌다.

마지막 단계가 중요하다. 빈 화면 대신 Q&A로 흘려보내면 관심 신호를 잃지 않는다. 그리고 이 단계에 도달했다는 사실 자체를 **미충족 수요로 기록한다** — 관심은 있었는데 공급이 없었다는 데이터가 제품의 핵심 자산이다.

## 상태 관리

서버 상태는 Server Components. 클라이언트 상태는 `useState`/`useReducer`. 전역 상태 라이브러리를 도입하지 않는다 — 화면 간 공유할 클라이언트 상태가 없다.
