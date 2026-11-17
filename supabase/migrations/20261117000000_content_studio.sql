-- ============================================================================
-- 콘텐츠 스튜디오 (ADR-028 · 029 · 030 · 031 · 032)
--
-- 1. studio_contents — 산출물. **버전 행이 쌓인다.** 고치려면 새 버전을 INSERT 한다
-- 2. app.studio_contents_guard — 승인 외의 수정을 DB 가 거부한다.
--    그리고 **검증에 실패한 산출물은 승인될 수 없다** (ADR-030)
-- 3. studio_feedback — 수업 후 성과. **회차 단위 집계뿐이다** (ADR-032)
--
-- 소유 경계는 lesson_plans 와 같다 — 작성 강사 · 발주 기관 · 운영자 셋뿐이고
-- anon 에게는 어떤 정책도 주지 않는다. 학생·보호자에게 도달하는 경로를 만들지 않는다.
-- ============================================================================

-- ── 1. studio_contents ------------------------------------------------------

create table public.studio_contents (
  id uuid primary key default gen_random_uuid(),
  -- 한 산출물의 역사를 묶는 id. 첫 버전은 자기 id 와 같은 값을 쓴다.
  lineage_id uuid not null,
  version int not null check (version >= 1),
  instructor_id uuid not null references public.instructors (id) on delete cascade,
  -- 회차에 붙은 산출물이면 그 회차. 라이브러리 단독 생성이면 NULL.
  -- 회차가 지워져도 산출물은 강사에게 남는다 (ADR-031).
  session_id uuid references public.lecture_sessions (id) on delete set null,
  kind text not null check (kind in ('pen3d', 'drone')),
  title text not null,
  -- 어느 레시피로 만들었는지. 성과 피드백 보정의 집계 키다 (ADR-032).
  recipe_id text not null,
  -- 생성 조건. 재현에 필요하다.
  spec jsonb not null default '{}'::jsonb,
  -- 산출물 본체 — 패턴(좌표)·지표·조립 순서·과제·안전 문구.
  artifact jsonb not null default '{}'::jsonb,
  -- 생성·개선 라운드 전체. 강사 화면이 이걸 그대로 보여준다 (ADR-030).
  rounds jsonb not null default '[]'::jsonb,
  status text not null check (status in ('draft', 'validated', 'failed', 'approved')),
  -- 레시피 선택과 문장을 무엇이 만들었는지. **좌표는 언제나 규칙이 만든다** (ADR-029).
  source text not null default 'rule' check (source in ('llm', 'rule')),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  -- 승인 시각은 승인 상태에서만 존재한다.
  check ((status = 'approved') = (approved_at is not null)),
  unique (lineage_id, version)
);

create index if not exists studio_contents_instructor_idx
  on public.studio_contents (instructor_id, created_at desc);
create index if not exists studio_contents_lineage_idx
  on public.studio_contents (lineage_id, version desc);
create index if not exists studio_contents_session_idx on public.studio_contents (session_id);
create index if not exists studio_contents_recipe_idx on public.studio_contents (recipe_id, kind);

alter table public.studio_contents enable row level security;

-- 읽기: 작성 강사 · (회차에 붙은 경우) 발주 기관 구성원 · 운영자. **그 외 전부 0행.**
-- 타 강사가 남의 도안을 보면 "여기서 만들면 내 노하우가 샌다"가 되고, 그 인식은 한 번 생기면
-- 되돌릴 수 없다 (ADR-019 와 같은 이유).
create policy studio_contents_read on public.studio_contents
  for select to authenticated
  using (
    instructor_id = app.current_instructor_id()
    or exists (
      select 1 from public.lecture_sessions s
      where s.id = session_id and s.org_id = app.current_org_id()
    )
    or app.is_admin()
  );

-- 쓰기: 자기 강사 id 로만. 회차에 붙이려면 **그 회차에 배정된 강사**여야 한다 (ADR-015).
-- `approved` 상태로는 INSERT 할 수 없다 — 승인은 검증을 통과한 행에서만 일어난다 (ADR-030).
create policy studio_contents_own_insert on public.studio_contents
  for insert to authenticated
  with check (
    instructor_id = app.current_instructor_id()
    and status in ('draft', 'validated', 'failed')
    and (
      session_id is null
      or exists (
        select 1 from public.lecture_sessions s
        where s.id = session_id and s.instructor_id = app.current_instructor_id()
      )
    )
  );

-- 수정: 작성 강사만. 무엇을 바꿀 수 있는지는 아래 트리거가 정한다 (승인뿐).
create policy studio_contents_own_update on public.studio_contents
  for update to authenticated
  using (instructor_id = app.current_instructor_id())
  with check (instructor_id = app.current_instructor_id());

create policy studio_contents_own_delete on public.studio_contents
  for delete to authenticated
  using (instructor_id = app.current_instructor_id());

create policy studio_contents_admin on public.studio_contents
  for all to authenticated
  using (app.is_admin()) with check (app.is_admin());

-- ── 2. 불변 가드 ------------------------------------------------------------
-- 산출물은 버전 행이다. UPDATE 로 바꿀 수 있는 것은 **승인 두 컬럼뿐이고**,
-- 승인은 `validated` 에서만 `approved` 로 갈 수 있다.
--
-- 이걸 애플리케이션 코드에만 두지 않는 이유: 검증에 실패한 도안이 승인된 것으로 표시되는 순간
-- 이 제품은 "검증한다"고 말할 자격을 잃는다. 그 경계는 DB 에 있어야 한다.

create or replace function app.studio_contents_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.id is distinct from old.id
    or new.lineage_id is distinct from old.lineage_id
    or new.version is distinct from old.version
    or new.instructor_id is distinct from old.instructor_id
    or new.session_id is distinct from old.session_id
    or new.kind is distinct from old.kind
    or new.title is distinct from old.title
    or new.recipe_id is distinct from old.recipe_id
    or new.spec is distinct from old.spec
    or new.artifact is distinct from old.artifact
    or new.rounds is distinct from old.rounds
    or new.source is distinct from old.source
    or new.created_at is distinct from old.created_at
  then
    raise exception 'studio_contents 는 버전 행이다. 산출물을 고치려면 새 버전을 INSERT 하라 (ADR-031)';
  end if;

  if new.status is distinct from old.status
    and not (old.status = 'validated' and new.status = 'approved')
  then
    raise exception '승인은 검증을 통과한(validated) 산출물에서만 가능하다 (ADR-030)';
  end if;

  return new;
end;
$$;

create trigger studio_contents_guard
  before update on public.studio_contents
  for each row execute function app.studio_contents_guard();

-- ── 3. studio_feedback ------------------------------------------------------
-- **회차 단위 집계뿐이다.** 학생 개인 단위 컬럼을 추가하지 말 것 (ADR-032) —
-- 누가 완성하지 못했는지는 이 플랫폼에 들어오지 않는다. 그 기록은 반드시 생활기록부 근거로
-- 쓰이려 하고, 플랫폼이 그 자료를 보유하는 순간 책임의 성격이 달라진다.

create table public.studio_feedback (
  id uuid primary key default gen_random_uuid(),
  content_id uuid not null references public.studio_contents (id) on delete cascade,
  session_id uuid references public.lecture_sessions (id) on delete set null,
  instructor_id uuid not null references public.instructors (id) on delete cascade,
  attempted_count int not null check (attempted_count between 1 and 200),
  completed_count int not null check (completed_count >= 0),
  actual_minutes int not null check (actual_minutes between 1 and 600),
  difficulty_vote text not null check (difficulty_vote in ('too_easy', 'right', 'too_hard')),
  -- 강사 의견. 마스킹(lib/moderation)을 통과한 값만 저장한다.
  note text check (note is null or char_length(note) <= 500),
  created_at timestamptz not null default now(),
  check (completed_count <= attempted_count)
);

create index if not exists studio_feedback_content_idx on public.studio_feedback (content_id);
create index if not exists studio_feedback_instructor_idx on public.studio_feedback (instructor_id);

alter table public.studio_feedback enable row level security;

create policy studio_feedback_read on public.studio_feedback
  for select to authenticated
  using (
    instructor_id = app.current_instructor_id()
    or exists (
      select 1 from public.lecture_sessions s
      where s.id = session_id and s.org_id = app.current_org_id()
    )
    or app.is_admin()
  );

-- 자기 산출물에 대해서만 피드백을 남긴다.
create policy studio_feedback_own_insert on public.studio_feedback
  for insert to authenticated
  with check (
    instructor_id = app.current_instructor_id()
    and exists (
      select 1 from public.studio_contents c
      where c.id = content_id and c.instructor_id = app.current_instructor_id()
    )
  );

create policy studio_feedback_admin on public.studio_feedback
  for all to authenticated
  using (app.is_admin()) with check (app.is_admin());
