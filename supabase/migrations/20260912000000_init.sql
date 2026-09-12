-- ============================================================================
-- Find My Mento · 초기 스키마
--
-- 이 파일이 이 제품의 안전 설계가 실제로 구현되는 지점이다.
-- 화면은 나중에 고칠 수 있지만 권한 모델이 틀리면 전부 다시 만들어야 한다.
--
-- 원칙 (docs/ARCHITECTURE.md · CLAUDE.md):
--   1. 19개 테이블 전부 RLS ENABLE. 예외 없음.
--   2. `students` 에 실명·연락처·학교명·생년월일 컬럼을 만들지 않는다 (ADR-003).
--   3. 강사 연락처는 `instructor_contacts` 별도 테이블. anon SELECT 불가 (CLAUDE.md CRITICAL).
--   4. 1:1 비공개 메시지 테이블을 만들지 않는다 (ADR-006, 영구 결정).
--   5. `inquiries` 는 anon INSERT 만 가능하고 SELECT 는 불가능하다 — 이 비대칭이 핵심이다 (ADR-014).
--   6. 역할은 auth_user_id 가 org_members / instructors / admins 중 어디에 있는지로만 판별한다.
--      JWT 커스텀 클레임을 쓰지 않는다.
--   7. 회차 INSERT 는 org_members 에게만. 강사는 instructor_id 로 **배정**된다 (ADR-015).
-- ============================================================================

create extension if not exists "pgcrypto";

create schema if not exists app;

-- ── 열거형 -------------------------------------------------------------------

create type org_type as enum ('school', 'youth_center', 'edu_company', 'local_gov');
create type grade_band as enum ('elementary', 'middle', 'high');
create type session_status as enum ('open', 'closed');
create type review_status as enum ('pending', 'approved', 'rejected', 'suspended');
create type provider_status as enum ('pending', 'approved', 'rejected');
create type program_format as enum ('short_course', 'one_off', 'club');
create type interest_status as enum (
  'expressed', 'org_review', 'rejected', 'consent_pending',
  'consent_denied', 'recruiting', 'connected'
);
create type inquiry_status as enum (
  'received', 'rejected', 'assigned', 'delivered', 'matched', 'unmatched'
);
create type recruitment_status as enum ('sent', 'accepted', 'declined', 'expired');
create type invitation_role as enum ('org_member', 'instructor', 'admin');
create type consent_method as enum ('paper', 'phone', 'messenger');
create type verification_type as enum ('qualification', 'criminal_record_check', 'identity');
create type target_type as enum ('program', 'instructor', 'none');
create type qna_visibility as enum ('public', 'hidden');

-- ── 1. 기관 -----------------------------------------------------------------
-- 학교와 기관은 같은 주체다. `type` 은 화면 문구·집계 분류에만 쓰고 권한 분기에 쓰지 않는다 (ADR-013).

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type org_type not null,
  region_code text not null,
  created_at timestamptz not null default now()
);

create table public.org_members (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users (id) on delete set null,
  org_id uuid not null references public.organizations (id) on delete cascade,
  role text not null default 'manager' check (role in ('manager', 'teacher')),
  display_name text not null,
  -- 이직한 담당자는 삭제가 아니라 접근 차단이다 (E-13).
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index org_members_auth_idx on public.org_members (auth_user_id);
create index org_members_org_idx on public.org_members (org_id);

create table public.admins (
  auth_user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '운영자',
  created_at timestamptz not null default now()
);

-- ── 2. 초대 -----------------------------------------------------------------
-- 셀프 가입이 없으므로 모든 계정이 여기서 출발한다 (ADR-011).
-- 1회용 · 만료 필수 · 수락 시 accepted_at 기록 (E-12).

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  role invitation_role not null,
  org_id uuid references public.organizations (id) on delete cascade,
  provider_id uuid,
  token text not null unique,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_by text not null,
  created_at timestamptz not null default now(),
  -- 담당자 초대는 기관이, 강사 초대는 업체가 붙는다. 둘 다 붙는 초대는 없다.
  constraint invitation_scope check (
    (role = 'org_member' and org_id is not null and provider_id is null)
    or (role = 'instructor' and org_id is null)
    or (role = 'admin' and org_id is null and provider_id is null)
  )
);

create index invitations_token_idx on public.invitations (token);

-- ── 3. 공급 (업체 ↔ 강사 2계층, ADR-010) --------------------------------------

create table public.providers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  region_code text not null,
  status provider_status not null default 'pending',
  created_at timestamptz not null default now()
);

alter table public.invitations
  add constraint invitations_provider_fk
  foreign key (provider_id) references public.providers (id) on delete cascade;

create table public.instructors (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users (id) on delete set null,
  -- 프리랜서 강사는 소속이 없다.
  provider_id uuid references public.providers (id) on delete set null,
  name text not null,
  region_code text not null,
  fields text[] not null default '{}',
  bio text not null default '',
  career text[] not null default '{}',
  status review_status not null default 'pending',
  created_at timestamptz not null default now()
  -- 연락처 컬럼을 여기에 추가하지 말 것. `instructor_contacts` 로 분리돼 있다.
  -- 사진 컬럼도 만들지 않는다 (UI_GUIDE 안전규칙 4).
);

create index instructors_auth_idx on public.instructors (auth_user_id);
create index instructors_status_idx on public.instructors (status);

-- **별도 테이블.** anon 에게 SELECT 권한을 주지 않는다.
-- 같은 테이블에 두면 `select *` 한 줄로 유출된다.
create table public.instructor_contacts (
  instructor_id uuid primary key references public.instructors (id) on delete cascade,
  phone text,
  email text,
  updated_at timestamptz not null default now()
);

create table public.instructor_verifications (
  id uuid primary key default gen_random_uuid(),
  instructor_id uuid not null references public.instructors (id) on delete cascade,
  -- Supabase Storage 비공개 버킷 경로. 서명 URL 없이 접근 불가.
  file_path text not null,
  type verification_type not null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.programs (
  id uuid primary key default gen_random_uuid(),
  instructor_id uuid not null references public.instructors (id) on delete cascade,
  title text not null,
  field text not null,
  target_grades grade_band[] not null default '{}',
  format program_format not null,
  session_count int not null default 1 check (session_count between 1 and 60),
  summary text not null default '',
  outline text[] not null default '{}',
  created_at timestamptz not null default now()
);

create index programs_instructor_idx on public.programs (instructor_id);

-- ── 4. 학생 -----------------------------------------------------------------
-- **PII 가 없다.** 가명코드 · 기관ID · 학년까지다.
-- 이름 / 연락처 / 학교명 / 생년월일 컬럼을 추가하지 말 것 (ADR-003).
-- 이 제약이 깨지면 플랫폼의 법적 지위(수탁자)가 바뀐다.

create table public.students (
  id uuid primary key default gen_random_uuid(),
  pseudo_code text not null,
  org_id uuid not null references public.organizations (id) on delete cascade,
  grade_band grade_band not null,
  grade_year int not null check (grade_year between 1 and 6),
  created_at timestamptz not null default now(),
  unique (org_id, pseudo_code)
);

-- ── 5. 회차 -----------------------------------------------------------------
-- 생성 주체는 기관·학교뿐이다. instructor_id 는 **배정**이고, 강사의 회차·리포트
-- 열람 권한 전부가 이 컬럼에서 나온다 (ADR-015).

create table public.lecture_sessions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  instructor_id uuid references public.instructors (id) on delete set null,
  title text not null,
  field text not null,
  held_on date not null,
  -- 응답 마감. 마감 후 제출은 거부된다 (E-17).
  closes_at timestamptz not null,
  status session_status not null default 'open',
  entry_code text not null unique,
  grade_band grade_band not null,
  expected_students int not null default 30 check (expected_students between 1 and 500),
  created_at timestamptz not null default now()
);

create index lecture_sessions_org_idx on public.lecture_sessions (org_id);
create index lecture_sessions_instructor_idx on public.lecture_sessions (instructor_id);
create index lecture_sessions_entry_idx on public.lecture_sessions (entry_code);

-- ── 6. 설문 응답 -------------------------------------------------------------
-- satisfaction 과 followup_intent 는 **별개 컬럼**이다. 합치면 파일럿의 1차 전환 지표가 사라진다.
-- student_id 는 nullable (익명 응답). (session_id, student_id) 유니크로 가명코드 중복만 막는다 —
-- Postgres 는 NULL 을 서로 다른 값으로 보므로 익명 응답은 여러 건 들어온다 (E-04 의도된 동작).

create table public.survey_responses (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.lecture_sessions (id) on delete cascade,
  student_id uuid references public.students (id) on delete set null,
  grade_band grade_band not null,
  grade_year int not null check (grade_year between 1 and 6),
  satisfaction int not null check (satisfaction between 1 and 5),
  followup_intent int not null check (followup_intent between 1 and 4),
  interest_fields text[] not null default '{}',
  -- 마스킹 필터를 통과한 텍스트만 저장한다. 원문을 남기지 않는다 (E-08).
  want_to_learn text check (want_to_learn is null or char_length(want_to_learn) <= 400),
  desired_job text check (desired_job is null or char_length(desired_job) <= 100),
  available_times text[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (session_id, student_id)
);

create index survey_responses_session_idx on public.survey_responses (session_id);

-- ── 7. 관심 표현 · 동의 · 섭외 ------------------------------------------------

create table public.interests (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references public.students (id) on delete set null,
  target_type target_type not null default 'program',
  target_id uuid,
  session_id uuid not null references public.lecture_sessions (id) on delete cascade,
  status interest_status not null default 'expressed',
  -- 화면에는 이 가명 표시만 쓴다. 가명코드 원문을 노출하지 않는다.
  student_alias text not null,
  created_at timestamptz not null default now()
);

create index interests_session_idx on public.interests (session_id);

-- 플랫폼이 동의를 받는 게 아니라, 기관이 받은 결과를 **기록**한다 (UC-20).
create table public.consents (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references public.students (id) on delete set null,
  interest_id uuid not null references public.interests (id) on delete cascade,
  recorded_by uuid not null references public.org_members (id) on delete restrict,
  method consent_method not null,
  recorded_at timestamptz not null default now()
);

create table public.recruitment_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  instructor_id uuid not null references public.instructors (id) on delete cascade,
  field text not null,
  demand_count int not null default 0,
  status recruitment_status not null default 'sent',
  note text not null default '',
  created_at timestamptz not null default now()
);

create index recruitment_org_idx on public.recruitment_requests (org_id);
create index recruitment_instructor_idx on public.recruitment_requests (instructor_id);

-- ── 8. 보호자 문의 (개인 경로) ------------------------------------------------
-- 플랫폼이 실제 PII 를 보유하는 유일한 테이블이다. 저장하는 것은 **성인 보호자 본인의**
-- 이름·연락처이고, 아이에 대해서는 학년대까지다.
-- 아이 이름·학교·생년월일 컬럼을 만들지 말 것 (ADR-014).

create table public.inquiries (
  id uuid primary key default gen_random_uuid(),
  guardian_name text not null check (char_length(guardian_name) between 2 and 40),
  guardian_contact text not null check (char_length(guardian_contact) between 5 and 120),
  region_code text not null,
  grade_band grade_band not null,
  field text not null,
  target_type target_type not null default 'none',
  target_id uuid,
  message text not null default '' check (char_length(message) <= 600),
  status inquiry_status not null default 'received',
  assigned_instructor_id uuid references public.instructors (id) on delete set null,
  handled_by text,
  created_at timestamptz not null default now()
);

create index inquiries_assigned_idx on public.inquiries (assigned_instructor_id);
create index inquiries_status_idx on public.inquiries (status);

-- ── 9. Q&A (공개 스레드만. 1:1 테이블을 만들지 않는다 — ADR-006) ----------------

create table public.qna_questions (
  id uuid primary key default gen_random_uuid(),
  student_alias text not null,
  field text not null,
  body text not null check (char_length(body) between 5 and 1000),
  visibility qna_visibility not null default 'public',
  org_id uuid references public.organizations (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.qna_answers (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.qna_questions (id) on delete cascade,
  instructor_id uuid not null references public.instructors (id) on delete cascade,
  body text not null check (char_length(body) between 5 and 3000),
  created_at timestamptz not null default now()
);

create index qna_answers_question_idx on public.qna_answers (question_id);

create table public.moderation_reports (
  id uuid primary key default gen_random_uuid(),
  target_type text not null check (target_type in ('question', 'answer', 'inquiry')),
  target_id uuid not null,
  reason text not null,
  handled_by text,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- 역할 판별 함수
--
-- auth.uid() 가 org_members / instructors / admins 중 어디에 있는지로만 판별한다.
-- JWT 커스텀 클레임이나 클라이언트가 보낸 값으로 판단하지 않는다 (CLAUDE.md CRITICAL).
-- RLS 정책 안에서 테이블을 다시 읽어야 하므로 SECURITY DEFINER 로 두고 재귀를 피한다.
-- ============================================================================

create or replace function app.current_org_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select m.org_id
  from public.org_members m
  where m.auth_user_id = auth.uid() and m.active
  limit 1
$$;

create or replace function app.current_instructor_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select i.id
  from public.instructors i
  where i.auth_user_id = auth.uid()
  limit 1
$$;

create or replace function app.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.admins a where a.auth_user_id = auth.uid())
$$;

-- 회차가 아직 응답을 받을 수 있는 상태인지. 설문 INSERT 정책에서 쓴다 (E-17).
create or replace function app.session_accepts_responses(p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.lecture_sessions s
    where s.id = p_session_id and s.status = 'open' and s.closes_at > now()
  )
$$;

revoke all on function app.current_org_id() from public;
revoke all on function app.current_instructor_id() from public;
revoke all on function app.is_admin() from public;
revoke all on function app.session_accepts_responses(uuid) from public;

grant usage on schema app to anon, authenticated;
grant execute on function app.current_org_id() to authenticated;
grant execute on function app.current_instructor_id() to authenticated;
grant execute on function app.is_admin() to authenticated;
grant execute on function app.session_accepts_responses(uuid) to anon, authenticated;

-- ============================================================================
-- RLS — 19개 테이블 전부 ENABLE. 예외 없음.
-- ============================================================================

alter table public.organizations            enable row level security;
alter table public.org_members              enable row level security;
alter table public.admins                   enable row level security;
alter table public.invitations              enable row level security;
alter table public.providers                enable row level security;
alter table public.instructors              enable row level security;
alter table public.instructor_contacts      enable row level security;
alter table public.instructor_verifications enable row level security;
alter table public.programs                 enable row level security;
alter table public.students                 enable row level security;
alter table public.lecture_sessions         enable row level security;
alter table public.survey_responses         enable row level security;
alter table public.interests                enable row level security;
alter table public.consents                 enable row level security;
alter table public.recruitment_requests     enable row level security;
alter table public.inquiries                enable row level security;
alter table public.qna_questions            enable row level security;
alter table public.qna_answers              enable row level security;
alter table public.moderation_reports       enable row level security;

-- ── organizations ----------------------------------------------------------
-- 기관명은 공개 화면(회차 진입 안내)에서 보인다. 지역코드까지만 공개된다.

create policy organizations_read_all on public.organizations
  for select to anon, authenticated using (true);

create policy organizations_admin_write on public.organizations
  for all to authenticated using (app.is_admin()) with check (app.is_admin());

-- ── org_members ------------------------------------------------------------

create policy org_members_self on public.org_members
  for select to authenticated
  using (auth_user_id = auth.uid() or org_id = app.current_org_id() or app.is_admin());

create policy org_members_admin_write on public.org_members
  for all to authenticated using (app.is_admin()) with check (app.is_admin());

-- ── admins -----------------------------------------------------------------
-- 자기 행만 읽는다. 운영자 명단이 새면 표적이 된다.

create policy admins_self on public.admins
  for select to authenticated using (auth_user_id = auth.uid());

-- ── invitations ------------------------------------------------------------
-- anon SELECT 불가. 토큰 검증은 서버(service_role)에서만 한다 —
-- anon 이 읽을 수 있으면 토큰 목록을 긁어 아무 기관 담당자가 될 수 있다.

create policy invitations_admin on public.invitations
  for all to authenticated using (app.is_admin()) with check (app.is_admin());

-- ── providers --------------------------------------------------------------

create policy providers_read_approved on public.providers
  for select to anon, authenticated using (status = 'approved' or app.is_admin());

create policy providers_admin_write on public.providers
  for all to authenticated using (app.is_admin()) with check (app.is_admin());

-- ── instructors ------------------------------------------------------------
-- **승인된 강사만 공개된다.** pending / rejected / suspended 는 추천·디렉토리·Q&A
-- 어디에도 나타나지 않는다 (E-11).

create policy instructors_read_approved on public.instructors
  for select to anon, authenticated
  using (
    status = 'approved'
    or id = app.current_instructor_id()
    or app.is_admin()
  );

create policy instructors_self_update on public.instructors
  for update to authenticated
  using (id = app.current_instructor_id())
  with check (id = app.current_instructor_id());

create policy instructors_admin_write on public.instructors
  for all to authenticated using (app.is_admin()) with check (app.is_admin());

-- ── instructor_contacts ----------------------------------------------------
-- **anon 에게 어떤 권한도 주지 않는다.** 정책이 없으면 RLS 가 전부 막는다.
-- 본인과 운영자만 읽는다. 공개 디렉토리는 anon 으로 조회되므로 구조적으로 접근할 수 없다.

create policy instructor_contacts_self on public.instructor_contacts
  for select to authenticated
  using (instructor_id = app.current_instructor_id() or app.is_admin());

create policy instructor_contacts_self_write on public.instructor_contacts
  for all to authenticated
  using (instructor_id = app.current_instructor_id() or app.is_admin())
  with check (instructor_id = app.current_instructor_id() or app.is_admin());

-- ── instructor_verifications ----------------------------------------------
-- 증빙은 운영자 심사용이다. 본인은 제출 여부만 확인한다.

create policy verifications_self_read on public.instructor_verifications
  for select to authenticated
  using (instructor_id = app.current_instructor_id() or app.is_admin());

create policy verifications_admin_write on public.instructor_verifications
  for all to authenticated using (app.is_admin()) with check (app.is_admin());

-- ── programs ---------------------------------------------------------------

create policy programs_read_public on public.programs
  for select to anon, authenticated
  using (
    exists (
      select 1 from public.instructors i
      where i.id = instructor_id
        and (i.status = 'approved' or i.id = app.current_instructor_id() or app.is_admin())
    )
  );

create policy programs_admin_write on public.programs
  for all to authenticated using (app.is_admin()) with check (app.is_admin());

-- ── students ---------------------------------------------------------------
-- 자기 기관 행만. 강사는 접근 불가. anon 도 불가 —
-- 학생이 코드를 입력하면 **서버(anon 키가 아닌 라우트 핸들러)** 가 확인한다.

create policy students_own_org on public.students
  for select to authenticated
  using (org_id = app.current_org_id() or app.is_admin());

create policy students_own_org_write on public.students
  for all to authenticated
  using (org_id = app.current_org_id() or app.is_admin())
  with check (org_id = app.current_org_id() or app.is_admin());

-- ── lecture_sessions -------------------------------------------------------
-- 읽기: 자기 기관 / **배정된** 강사 / 운영자.
-- 쓰기: 기관 담당자만. **강사에게 INSERT·UPDATE 를 주지 않는다** (ADR-015) —
-- 강사가 회차를 만들 수 있으면 기관 동의 없이 그 기관 학생에게 설문을 돌릴 수 있다.

create policy sessions_read on public.lecture_sessions
  for select to authenticated
  using (
    org_id = app.current_org_id()
    or instructor_id = app.current_instructor_id()
    or app.is_admin()
  );

create policy sessions_org_insert on public.lecture_sessions
  for insert to authenticated
  with check (org_id = app.current_org_id() or app.is_admin());

create policy sessions_org_update on public.lecture_sessions
  for update to authenticated
  using (org_id = app.current_org_id() or app.is_admin())
  with check (org_id = app.current_org_id() or app.is_admin());

create policy sessions_org_delete on public.lecture_sessions
  for delete to authenticated
  using (org_id = app.current_org_id() or app.is_admin());

-- ── survey_responses -------------------------------------------------------
-- INSERT: anon 허용 (학생은 로그인하지 않는다). 단 **열린 회차에만** (E-17).
-- SELECT: 자기 기관 담당자와 운영자만. 강사는 학생 단위 원본을 볼 수 없다 —
--         집계는 아래 `instructor_session_responses` 뷰로만 제공한다.

create policy survey_insert_open_session on public.survey_responses
  for insert to anon, authenticated
  with check (app.session_accepts_responses(session_id));

create policy survey_read_own_org on public.survey_responses
  for select to authenticated
  using (
    exists (
      select 1 from public.lecture_sessions s
      where s.id = session_id and s.org_id = app.current_org_id()
    )
    or app.is_admin()
  );

-- 강사용 집계 소스. **student_id 가 없다.** 배정된 회차만 나온다.
-- 뷰는 기본적으로 소유자 권한으로 실행되므로(security_invoker = off) 아래 where 절이
-- 실질적인 권한 경계가 된다.
create view public.instructor_session_responses as
select
  r.id,
  r.session_id,
  -- 익명 응답 수는 기관 리포트에서 따로 표시해야 하므로(E-04) 여부만 내보낸다.
  -- **가명코드나 student_id 자체는 내보내지 않는다.**
  (r.student_id is null) as is_anonymous,
  r.grade_band,
  r.grade_year,
  r.satisfaction,
  r.followup_intent,
  r.interest_fields,
  r.want_to_learn,
  r.desired_job,
  r.available_times,
  r.created_at
from public.survey_responses r
join public.lecture_sessions s on s.id = r.session_id
where s.instructor_id = app.current_instructor_id();

revoke all on public.instructor_session_responses from anon;
grant select on public.instructor_session_responses to authenticated;

-- ── interests --------------------------------------------------------------
-- INSERT: anon 허용 (학생의 관심 표현). 열린 회차만.
-- SELECT: 자기 기관만. **강사는 볼 수 없다** — 학생이 누른 버튼이 강사에게 직접 닿지 않는다.

create policy interests_insert_open_session on public.interests
  for insert to anon, authenticated
  with check (app.session_accepts_responses(session_id));

create policy interests_read_own_org on public.interests
  for select to authenticated
  using (
    exists (
      select 1 from public.lecture_sessions s
      where s.id = session_id and s.org_id = app.current_org_id()
    )
    or app.is_admin()
  );

create policy interests_update_own_org on public.interests
  for update to authenticated
  using (
    exists (
      select 1 from public.lecture_sessions s
      where s.id = session_id and s.org_id = app.current_org_id()
    )
    or app.is_admin()
  )
  with check (true);

-- ── consents ---------------------------------------------------------------
-- anon SELECT 불가. 기관이 기록하고 기관이 읽는다.

create policy consents_own_org on public.consents
  for select to authenticated
  using (
    exists (
      select 1
      from public.interests i
      join public.lecture_sessions s on s.id = i.session_id
      where i.id = interest_id and s.org_id = app.current_org_id()
    )
    or app.is_admin()
  );

create policy consents_own_org_insert on public.consents
  for insert to authenticated
  with check (
    exists (
      select 1
      from public.interests i
      join public.lecture_sessions s on s.id = i.session_id
      where i.id = interest_id and s.org_id = app.current_org_id()
    )
    or app.is_admin()
  );

-- ── recruitment_requests ---------------------------------------------------
-- 기관은 자기가 보낸 것, 강사는 자기에게 온 것.

create policy recruitment_read on public.recruitment_requests
  for select to authenticated
  using (
    org_id = app.current_org_id()
    or instructor_id = app.current_instructor_id()
    or app.is_admin()
  );

create policy recruitment_org_insert on public.recruitment_requests
  for insert to authenticated
  with check (org_id = app.current_org_id() or app.is_admin());

-- 강사는 status 만 바꾼다(수락·거절). 기관도 자기 건을 수정할 수 있다.
create policy recruitment_update on public.recruitment_requests
  for update to authenticated
  using (
    instructor_id = app.current_instructor_id()
    or org_id = app.current_org_id()
    or app.is_admin()
  )
  with check (
    instructor_id = app.current_instructor_id()
    or org_id = app.current_org_id()
    or app.is_admin()
  );

-- ── inquiries --------------------------------------------------------------
-- **이 테이블의 비대칭이 RLS 설계의 핵심이다.**
-- anon 은 INSERT 만 가능하고 SELECT 는 불가능하다. 하나의 정책으로 뭉개지 않는다 —
-- SELECT 가 같이 열리면 아무나 모든 보호자의 실명·연락처를 내려받는다.

create policy inquiries_anon_insert on public.inquiries
  for insert to anon, authenticated
  with check (
    status = 'received'
    and assigned_instructor_id is null
    and handled_by is null
  );

-- SELECT: 운영자 전체 + 배정된 강사는 자기 건만. anon 은 정책이 없으므로 0행.
create policy inquiries_read_scoped on public.inquiries
  for select to authenticated
  using (
    app.is_admin()
    or (assigned_instructor_id is not null and assigned_instructor_id = app.current_instructor_id())
  );

create policy inquiries_admin_update on public.inquiries
  for update to authenticated
  using (app.is_admin()) with check (app.is_admin());

-- ── qna_questions ----------------------------------------------------------
-- 공개 스레드. 숨김 처리된 글은 공개 목록에서 빠진다 (UC-22).

create policy qna_questions_read_public on public.qna_questions
  for select to anon, authenticated
  using (
    visibility = 'public'
    or org_id = app.current_org_id()
    or app.is_admin()
  );

create policy qna_questions_insert on public.qna_questions
  for insert to anon, authenticated
  with check (visibility = 'public');

-- 숨김 처리는 그 기관 담당자와 운영자만.
create policy qna_questions_moderate on public.qna_questions
  for update to authenticated
  using (org_id = app.current_org_id() or app.is_admin())
  with check (org_id = app.current_org_id() or app.is_admin());

-- ── qna_answers ------------------------------------------------------------

create policy qna_answers_read_public on public.qna_answers
  for select to anon, authenticated
  using (
    exists (
      select 1 from public.qna_questions q
      where q.id = question_id
        and (q.visibility = 'public' or q.org_id = app.current_org_id() or app.is_admin())
    )
  );

-- 답변은 **승인된 강사 본인만** 작성할 수 있다.
create policy qna_answers_instructor_insert on public.qna_answers
  for insert to authenticated
  with check (
    instructor_id = app.current_instructor_id()
    and exists (
      select 1 from public.instructors i
      where i.id = instructor_id and i.status = 'approved'
    )
  );

create policy qna_answers_instructor_update on public.qna_answers
  for update to authenticated
  using (instructor_id = app.current_instructor_id() or app.is_admin())
  with check (instructor_id = app.current_instructor_id() or app.is_admin());

-- ── moderation_reports -----------------------------------------------------
-- 신고는 누구나 남길 수 있고, 읽는 건 운영자뿐이다.

create policy moderation_insert on public.moderation_reports
  for insert to anon, authenticated with check (handled_by is null);

create policy moderation_admin_read on public.moderation_reports
  for select to authenticated using (app.is_admin());

create policy moderation_admin_update on public.moderation_reports
  for update to authenticated using (app.is_admin()) with check (app.is_admin());
