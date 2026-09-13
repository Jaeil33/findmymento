-- ============================================================================
-- AI 수업 설계 도우미 (ADR-016 · 017 · 019 · 023)
--
-- 1. lecture_sessions 에 수업 조건 4컬럼. **기관이 입력하고 강사는 읽기만 한다.**
-- 2. lesson_plans 테이블. 열람은 작성 강사 · 발주 기관 · 운영자 셋뿐이다.
-- 3. recruitment_requests 에 close_reason. `장소 없음` 건수가 공간 사업의 근거다.
-- ============================================================================

-- ── 1. 수업 조건 (ADR-016) ---------------------------------------------------
-- class_traits 는 **고정 목록이다.** 자유 텍스트가 들어오는 경로를 DB 에서 막는다 —
-- 입력란을 열어 두면 담당 교사가 특정 학생의 진단명을 적는다. 장애·건강은 민감정보이고
-- 학생 개인에 귀속되는 순간 별도 동의 의무가 생긴다.
-- 이 컬럼들은 **회차(= 한 반의 한 수업)에만** 붙는다. students·survey_responses 에 붙이지 말 것.

alter table public.lecture_sessions
  add column if not exists duration_minutes int not null default 50
    check (duration_minutes between 20 and 300),
  add column if not exists venue text not null default '교실'
    check (venue in ('교실', '강당', '체육관', '운동장', '컴퓨터실', '메이커실')),
  add column if not exists class_traits text[] not null default '{}',
  add column if not exists equipment text[] not null default '{}';

alter table public.lecture_sessions
  drop constraint if exists lecture_sessions_class_traits_allowed;

alter table public.lecture_sessions
  add constraint lecture_sessions_class_traits_allowed check (
    class_traits <@ array[
      '통합학급 포함',
      '휠체어 사용 학생 있음',
      '청각 보조 필요',
      '시각 보조 필요',
      '한국어 보조 필요',
      '첫 경험 다수',
      '경험자 다수',
      '집중 지속이 짧은 편'
    ]::text[]
  );

-- ── 2. 섭외 종료 사유 (ADR-023) ----------------------------------------------
-- 고정값이다. 세어야 하는 값이기 때문이다 — "수요도 강사도 있는데 장소가 없어 무산된 건"의
-- 개수가 공간 사업으로 넘어갈지 판단하는 유일한 근거 데이터다.

alter table public.recruitment_requests
  add column if not exists close_reason text
    check (close_reason is null or close_reason in ('공급 없음', '장소 없음', '예산 없음', '일정 불가'));

-- ── 3. lesson_plans (ADR-017 · 019) -----------------------------------------

create table public.lesson_plans (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.lecture_sessions (id) on delete cascade,
  instructor_id uuid not null references public.instructors (id) on delete cascade,
  title text not null,
  objectives text[] not null default '{}',
  -- 차시 흐름 + 단계별 난이도 분기. 구조는 규칙이 만들고 LLM 은 문장만 채운다.
  steps jsonb not null default '[]'::jsonb,
  materials text[] not null default '{}',
  safety_notes text[] not null default '{}',
  -- 무엇이 만들었는지. 화면 배지용이 아니라 검수·로그용이다.
  source text not null default 'rule' check (source in ('llm', 'rule')),
  -- 어떤 조건으로 만들었는지. 재현과 검수에 쓴다.
  inputs_snapshot jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'final')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- 한 회차에 강사 하나의 교안 하나. 재생성은 UPDATE 다.
  unique (session_id, instructor_id)
);

create index if not exists lesson_plans_session_idx on public.lesson_plans (session_id);
create index if not exists lesson_plans_instructor_idx on public.lesson_plans (instructor_id);

alter table public.lesson_plans enable row level security;

-- 읽기: 작성 강사 · 발주 기관 · 운영자. **그 외 전부 0행.**
-- 다른 강사가 남의 교안을 보면 "여기서 만들면 내 노하우가 샌다"가 되고, 그 인식은
-- 한 번 생기면 되돌릴 수 없다. 초기 공급자의 신뢰가 데이터 해자보다 비싸다 (ADR-019).
create policy lesson_plans_read on public.lesson_plans
  for select to authenticated
  using (
    instructor_id = app.current_instructor_id()
    or exists (
      select 1 from public.lecture_sessions s
      where s.id = session_id and s.org_id = app.current_org_id()
    )
    or app.is_admin()
  );

-- 쓰기: **그 회차에 배정된 강사 본인만.** 배정되지 않은 회차의 교안을 만들 수 없다 (ADR-015).
create policy lesson_plans_assigned_insert on public.lesson_plans
  for insert to authenticated
  with check (
    instructor_id = app.current_instructor_id()
    and exists (
      select 1 from public.lecture_sessions s
      where s.id = session_id and s.instructor_id = app.current_instructor_id()
    )
  );

create policy lesson_plans_owner_update on public.lesson_plans
  for update to authenticated
  using (instructor_id = app.current_instructor_id())
  with check (instructor_id = app.current_instructor_id());

create policy lesson_plans_owner_delete on public.lesson_plans
  for delete to authenticated
  using (instructor_id = app.current_instructor_id());

create policy lesson_plans_admin on public.lesson_plans
  for all to authenticated
  using (app.is_admin()) with check (app.is_admin());
