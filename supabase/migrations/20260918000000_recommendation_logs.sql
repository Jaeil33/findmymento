-- ============================================================================
-- 추천 기록 — 학생에게 **실제로 보여 준** 추천 카드와 그 출처 (파일럿 검수용)
--
-- 왜: LLM 실패는 규칙 문장으로 조용히 떨어진다(E-06). 화면은 멀쩡하므로, 기록이 없으면
--     교실에서 AI 가 한 번도 돌지 않았어도 아무도 모른다. 응답 한 건마다
--     "무엇을 보여 줬고, 그 순위·문장을 LLM 이 만들었는지 규칙이 만들었는지"를 남긴다.
--
-- 남기는 것: 회차 · (익명) 응답 id · 출처(llm/rule) · 지역 단계 · 카드(program_id + 이유 한 줄)
--            · 모델 · 지연 · 토큰 · 실패 분류(분류명과 HTTP 상태만).
-- 남기지 않는 것: 학생 자유서술 원문 · 가명코드 · LLM 에 보낸 입력 전체 · 에러 메시지 본문.
--
-- 권한: 설문과 같다. INSERT 는 anon 에게 열린 회차에만 열고, 읽기는 자기 기관 담당자와 운영자뿐이다.
--       강사는 학생 단위 원본을 보지 않는다 (survey_responses 와 같은 경계). 수정·삭제 정책은 없다.
-- ============================================================================

create table public.recommendation_logs (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.lecture_sessions (id) on delete cascade,
  response_id uuid references public.survey_responses (id) on delete cascade,
  source text not null check (source in ('llm', 'rule')),
  stage text not null check (stage in ('same', 'adjacent', 'two_hop', 'none')),
  items jsonb not null default '[]'::jsonb check (jsonb_typeof(items) = 'array'),
  model text check (model is null or char_length(model) <= 80),
  latency_ms int check (latency_ms is null or latency_ms >= 0),
  input_tokens int check (input_tokens is null or input_tokens >= 0),
  output_tokens int check (output_tokens is null or output_tokens >= 0),
  error text check (error is null or char_length(error) <= 80),
  created_at timestamptz not null default now()
);

create index recommendation_logs_session_idx on public.recommendation_logs (session_id);

alter table public.recommendation_logs enable row level security;

-- INSERT: 학생은 로그인하지 않는다. 설문과 같이 **열린 회차에만** (E-17).
create policy recommendation_logs_insert_open_session on public.recommendation_logs
  for insert to anon, authenticated
  with check (app.session_accepts_responses(session_id));

-- SELECT: 자기 기관 담당자와 운영자만. anon 정책이 없으므로 anon 은 0행이다.
create policy recommendation_logs_read_own_org on public.recommendation_logs
  for select to authenticated
  using (
    exists (
      select 1 from public.lecture_sessions s
      where s.id = session_id and s.org_id = app.current_org_id()
    )
    or app.is_admin()
  );
