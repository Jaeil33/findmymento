-- ============================================================================
-- Find My Mento · 검수용 픽스처 (선택)
--
-- `bootstrap.sql` 은 **실 운영 경로**고, 이 파일은 **검수·테스트 경로**다.
-- 파일럿 기관에 실제 데이터가 들어오기 전에
--   (1) 기관·강사에게 실 DB 로 붙은 화면을 보여주고,
--   (2) RLS 네거티브 테스트 14개(`tests/rls-negative.live.test.ts`)를 **실제로 돌리기**
-- 위한 고정 픽스처다. 그 14개는 지금까지 키가 없어서 건너뛰고 있었다.
--
-- 파일럿 기관의 실 데이터를 받기 시작한 프로젝트에는 넣지 않는다.
-- dev / staging Supabase 프로젝트에만 적용한다.
--
-- 담긴 것은 "잘 되는 경우"만이 아니다. 파일럿에서 실제로 마주칠 상태를 넣었다 —
-- 미배정 회차(E-23) · 응답 0건 회차(E-24) · 공급 0인 분야(E-16) ·
-- 48시간 미답변 Q&A(E-20) · 미승인 강사(E-11) · 만료된 초대(E-12) · 마감된 회차(E-17).
--
-- 학생 실명·연락처·학교명이 없다. 가명코드와 학년까지다 (ADR-003).
-- 강사 연락처는 `instructor_contacts` 에만 있다 (CLAUDE.md CRITICAL).
--
-- ── 실행 순서 ────────────────────────────────────────────────────────────────
--   1. migrations → bootstrap 을 먼저 적용한다.
--   2. SQL Editor 에 이 파일 전체를 붙여 실행한다.
--   3. 마지막 select 가 출력하는 RLS_TEST_* 값을 `.env.local` 에 넣는다.
--   4. RLS 테스트용 계정 2개를 Authentication → Users 에서 만들고(비밀번호 포함),
--      이 파일 맨 아래 "계정 연결" 블록의 이메일을 고쳐 한 번 더 실행한다.
--
-- 다시 실행해도 안전하다 (전부 고정 UUID + on conflict).
-- ============================================================================

-- ── 1. 기관 2개 -------------------------------------------------------------
-- 네거티브 테스트 2·3·13 이 "기관 A 담당자가 기관 B 를 볼 수 있는가"를 묻는다.
-- 기관이 2개여야 그 질문이 성립한다.

insert into public.organizations (id, name, type, region_code) values
  ('a0000000-0000-4000-8000-000000000001', '광명시청소년수련관', 'youth_center', '41210'),
  ('a0000000-0000-4000-8000-000000000002', '광명하안중학교', 'school', '41210')
on conflict (id) do nothing;

insert into public.org_members (id, auth_user_id, org_id, role, display_name, active) values
  ('e0000000-0000-4000-8000-000000000001', null,
   'a0000000-0000-4000-8000-000000000001', 'manager', '수련관 담당자', true),
  ('e0000000-0000-4000-8000-000000000002', null,
   'a0000000-0000-4000-8000-000000000002', 'teacher', '중학교 진로교사', true)
on conflict (id) do nothing;

-- ── 2. 공급 (업체 ↔ 강사 2계층, ADR-010) --------------------------------------
-- 강사 3명: 승인 1 · 승인 1(다른 분야) · 미승인 1.
-- 미승인 강사는 추천·디렉토리·Q&A 어디에도 나타나지 않아야 한다 (E-11, 네거티브 5).

insert into public.providers (id, name, region_code, status) values
  ('b0000000-0000-4000-8000-000000000001', '3DNFLY', '41210', 'approved')
on conflict (id) do nothing;

insert into public.instructors
  (id, provider_id, name, region_code, fields, bio, career, status) values
  ('c0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001',
   '박서연', '41210', array['드론', 'VR·AR'],
   '드론 촬영 10년. 광명에서 활동합니다.',
   array['드론 촬영 스튜디오 운영', '초·중 진로특강 120회'], 'approved'),
  ('c0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001',
   '김도현', '41190', array['AI·코딩'],
   '데이터 분석가. 인접 지역에서 활동합니다.',
   array['IT 기업 재직 8년'], 'approved'),
  ('c0000000-0000-4000-8000-000000000003', null,
   '이정민', '41210', array['뷰티'],
   '증빙 심사 대기 중인 강사입니다.',
   array['메이크업 아티스트'], 'pending')
on conflict (id) do nothing;

-- 별도 테이블. anon 에게 SELECT 권한이 없다 (네거티브 1).
insert into public.instructor_contacts (instructor_id, phone, email) values
  ('c0000000-0000-4000-8000-000000000001', '010-0000-0001', 'seed-instructor-1@example.com'),
  ('c0000000-0000-4000-8000-000000000002', '010-0000-0002', 'seed-instructor-2@example.com')
on conflict (instructor_id) do nothing;

-- 승인 강사에게만 증빙을 붙인다. 성범죄경력 조회 증빙이 없으면 운영자 화면에서 승인 버튼이 막힌다.
insert into public.instructor_verifications (id, instructor_id, file_path, type, reviewed_at) values
  ('b1000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
   'verifications/seed-1-qualification.pdf', 'qualification', now()),
  ('b1000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000001',
   'verifications/seed-1-criminal.pdf', 'criminal_record_check', now()),
  ('b1000000-0000-4000-8000-000000000003', 'c0000000-0000-4000-8000-000000000002',
   'verifications/seed-2-criminal.pdf', 'criminal_record_check', now()),
  ('b1000000-0000-4000-8000-000000000004', 'c0000000-0000-4000-8000-000000000003',
   'verifications/seed-3-qualification.pdf', 'qualification', null)
on conflict (id) do nothing;

-- 프로그램. '뷰티'에는 일부러 공급을 두지 않는다 — 미충족 수요(E-16)가 화면에 보여야 한다.
insert into public.programs
  (id, instructor_id, title, field, target_grades, format, session_count, summary, outline) values
  ('d0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
   '드론 조종 기초 4주 과정', '드론', array['middle', 'high']::public.grade_band[], 'short_course', 4,
   '실내 드론으로 조종 감각을 익히고 간단한 촬영까지 해 봅니다.',
   array['1주 드론 구조와 안전', '2주 호버링', '3주 코스 비행', '4주 촬영 실습']),
  ('d0000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000001',
   'VR 체험 원데이', 'VR·AR', array['elementary', 'middle']::public.grade_band[], 'one_off', 1,
   'VR 장비로 직업 현장을 체험합니다.',
   array['장비 사용법', '직업 현장 체험']),
  ('d0000000-0000-4000-8000-000000000003', 'c0000000-0000-4000-8000-000000000002',
   '파이썬으로 데이터 다루기', 'AI·코딩', array['middle', 'high']::public.grade_band[], 'club', 8,
   '공공데이터를 직접 불러와 그래프로 만들어 봅니다.',
   array['1~2주 파이썬 기초', '3~5주 데이터 불러오기', '6~8주 프로젝트'])
on conflict (id) do nothing;

-- ── 3. 회차 ------------------------------------------------------------------
-- 생성 주체는 기관뿐이고 강사는 instructor_id 로 **배정**된다 (ADR-015).
--   회차 1 — 기관 A · 응답 받는 중 · 강사 1 배정
--   회차 2 — 기관 A · **마감** (네거티브 9: 마감 후 설문 INSERT 는 실패해야 한다)
--   회차 3 — 기관 B · 강사 2 배정 → 강사 1 에게는 **미배정 회차** (네거티브 12)
--   회차 4 — 기관 A · 강사 미배정 + 응답 0건 (E-23 · E-24 가 화면에 보여야 한다)

insert into public.lecture_sessions
  (id, org_id, instructor_id, title, field, held_on, closes_at, status,
   entry_code, grade_band, expected_students) values
  ('f0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001',
   'c0000000-0000-4000-8000-000000000001', '드론 직업인 특강', '드론',
   current_date - 2, now() + interval '14 days', 'open', '481207', 'middle', 28),
  ('f0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001',
   'c0000000-0000-4000-8000-000000000001', 'VR 진로체험 (마감)', 'VR·AR',
   current_date - 40, now() - interval '7 days', 'closed', '481208', 'elementary', 24),
  ('f0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000002',
   'c0000000-0000-4000-8000-000000000002', '데이터 직업인 특강', 'AI·코딩',
   current_date - 5, now() + interval '10 days', 'open', '481209', 'high', 32),
  ('f0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000001',
   null, '뷰티 직업인 특강 (강사 미배정)', '뷰티',
   current_date + 7, now() + interval '21 days', 'open', '481210', 'middle', 30)
on conflict (id) do nothing;

-- ── 4. 학생 ------------------------------------------------------------------
-- 가명코드 · 기관 · 학년까지다. 그 외 컬럼이 없다 (ADR-003).

insert into public.students (id, pseudo_code, org_id, grade_band, grade_year)
select
  ('00000000-0000-4000-9000-' || lpad(to_hex(n), 12, '0'))::uuid,
  '48' || lpad(n::text, 4, '0'),
  'a0000000-0000-4000-8000-000000000001'::uuid,
  'middle'::public.grade_band,
  1 + (n % 3)
from generate_series(1, 24) as n
on conflict (id) do nothing;

-- ── 5. 설문 응답 -------------------------------------------------------------
-- satisfaction 과 followup_intent 는 별개 값이다. 파일럿의 1차 전환 지표가
-- 만족도가 아니라 **후속 의향**이라서 합치면 안 된다.
-- 24건 중 2건은 가명코드 없이(익명) 들어간다 — 기관 리포트에 익명 수가 따로 표기된다 (E-04).

insert into public.survey_responses
  (id, session_id, student_id, grade_band, grade_year, satisfaction, followup_intent,
   interest_fields, want_to_learn, desired_job, available_times)
select
  ('00000000-0000-4000-a000-' || lpad(to_hex(n), 12, '0'))::uuid,
  'f0000000-0000-4000-8000-000000000001'::uuid,
  case when n > 22 then null
       else ('00000000-0000-4000-9000-' || lpad(to_hex(n), 12, '0'))::uuid end,
  'middle'::public.grade_band,
  1 + (n % 3),
  3 + (n % 3),
  1 + (n % 4),
  array[(array['드론', '3D 모델링·프린팅', 'VR·AR', 'AI·코딩', '뷰티'])[1 + (n % 5)]],
  case when n % 4 = 0 then '드론 조종을 더 배워서 직접 영상을 찍어보고 싶어요' else null end,
  case when n % 5 = 0 then '드론 촬영 기사' else null end,
  array[(array['평일 방과후', '토요일 오전', '방학 중'])[1 + (n % 3)]]
from generate_series(1, 24) as n
on conflict (id) do nothing;

-- 회차 3 (기관 B) 에도 응답을 조금 넣는다. 기관 A 담당자에게 이 행들이 보이면 RLS 가 새는 것이다.
insert into public.survey_responses
  (id, session_id, student_id, grade_band, grade_year, satisfaction, followup_intent,
   interest_fields, want_to_learn, desired_job, available_times)
select
  ('00000000-0000-4000-b000-' || lpad(to_hex(n), 12, '0'))::uuid,
  'f0000000-0000-4000-8000-000000000003'::uuid,
  null,
  'high'::public.grade_band,
  1 + (n % 3),
  4,
  3,
  array['AI·코딩'],
  null,
  null,
  array['평일 방과후']
from generate_series(1, 6) as n
on conflict (id) do nothing;

-- ── 6. 관심 표현 · 동의 · 섭외 ------------------------------------------------
-- 학생은 관심만 표현한다. 강사에게 닿는 버튼이 아니다 — 기관 대시보드로 모인다.

insert into public.interests
  (id, student_id, target_type, target_id, session_id, status, student_alias) values
  ('c1000000-0000-4000-8000-000000000001', '00000000-0000-4000-9000-000000000003',
   'program', 'd0000000-0000-4000-8000-000000000001',
   'f0000000-0000-4000-8000-000000000001', 'expressed', '학생 A'),
  ('c1000000-0000-4000-8000-000000000002', '00000000-0000-4000-9000-000000000007',
   'program', 'd0000000-0000-4000-8000-000000000001',
   'f0000000-0000-4000-8000-000000000001', 'org_review', '학생 B'),
  ('c1000000-0000-4000-8000-000000000003', '00000000-0000-4000-9000-00000000000b',
   'program', 'd0000000-0000-4000-8000-000000000002',
   'f0000000-0000-4000-8000-000000000001', 'consent_pending', '학생 C'),
  ('c1000000-0000-4000-8000-000000000004', '00000000-0000-4000-9000-00000000000f',
   'none', null,
   'f0000000-0000-4000-8000-000000000001', 'rejected', '학생 D')
on conflict (id) do nothing;

-- 플랫폼이 동의를 받는 게 아니라, 기관이 받은 결과를 **기록**한다 (UC-20).
insert into public.consents (id, student_id, interest_id, recorded_by, method) values
  ('c2000000-0000-4000-8000-000000000001', '00000000-0000-4000-9000-000000000007',
   'c1000000-0000-4000-8000-000000000002',
   'e0000000-0000-4000-8000-000000000001', 'paper')
on conflict (id) do nothing;

-- H5 = 기관이 섭외 요청을 1건이라도 실제로 발송하는 것. 화면에서 그 상태를 보려면 픽스처가 필요하다.
insert into public.recruitment_requests
  (id, org_id, instructor_id, field, demand_count, status, note) values
  ('c3000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001',
   'c0000000-0000-4000-8000-000000000001', '드론', 9, 'sent',
   '특강 후 드론 후속 과정 문의가 많습니다. 4주 과정 가능한지 확인 부탁드립니다.'),
  ('c3000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001',
   'c0000000-0000-4000-8000-000000000002', 'AI·코딩', 4, 'declined',
   '일정이 맞지 않아 거절되었습니다.')
on conflict (id) do nothing;

-- ── 7. Q&A (공개 스레드만. 1:1 비공개 경로는 존재하지 않는다 — ADR-006) -----------
-- 두 번째 질문은 일부러 답변 없이 3일 전으로 둔다 — 운영자 미답변 큐(E-20)가 비어 있으면
-- 그 화면이 동작하는지 알 수 없다.

insert into public.qna_questions (id, student_alias, field, body, visibility, org_id, created_at)
values
  ('c4000000-0000-4000-8000-000000000001', '학생 A', '드론',
   '드론 조종 자격증은 몇 살부터 딸 수 있나요?', 'public',
   'a0000000-0000-4000-8000-000000000001', now() - interval '2 days'),
  ('c4000000-0000-4000-8000-000000000002', '학생 E', '뷰티',
   '뷰티 쪽 일을 하려면 고등학교를 어디로 가야 하나요?', 'public',
   'a0000000-0000-4000-8000-000000000001', now() - interval '3 days')
on conflict (id) do nothing;

insert into public.qna_answers (id, question_id, instructor_id, body) values
  ('c5000000-0000-4000-8000-000000000001', 'c4000000-0000-4000-8000-000000000001',
   'c0000000-0000-4000-8000-000000000001',
   '초경량비행장치 조종자 증명은 만 14세부터 응시할 수 있어요. 그 전에는 실내 드론으로 연습하면 충분합니다.')
on conflict (id) do nothing;

-- ── 8. 보호자 문의 (개인 경로, ADR-014) ----------------------------------------
-- 저장하는 것은 **성인 보호자 본인의** 이름·연락처이고, 아이에 대해서는 학년대까지다.
-- anon 은 INSERT 만 가능하고 SELECT 는 불가능하다 (네거티브 10·11).
-- 두 번째 행은 강사 2 에게 배정돼 있다 — 강사 1 이 이 행을 읽으면 RLS 가 새는 것이다 (네거티브 14).

insert into public.inquiries
  (id, guardian_name, guardian_contact, region_code, grade_band, field,
   target_type, target_id, message, status, assigned_instructor_id, handled_by) values
  ('c6000000-0000-4000-8000-000000000001', '김보호', '010-0000-1001', '41210', 'middle', '드론',
   'program', 'd0000000-0000-4000-8000-000000000001',
   '아이가 특강을 듣고 드론을 더 배우고 싶다고 합니다. 주말 과정이 있을까요?',
   'received', null, null),
  ('c6000000-0000-4000-8000-000000000002', '이보호', '010-0000-1002', '41210', 'high', 'AI·코딩',
   'none', null,
   '코딩 쪽 진로를 고민하고 있어 상담을 받고 싶습니다.',
   'assigned', 'c0000000-0000-4000-8000-000000000002', '운영자')
on conflict (id) do nothing;

-- ── 9. 초대 (1회용 · 만료 필수 — E-12) -----------------------------------------
-- 두 번째 토큰은 **이미 만료된** 것이다. 만료 토큰으로 초대를 읽을 수 있으면
-- 계정 생성 경로 전체가 뚫린다 (네거티브 7).

insert into public.invitations
  (id, email, role, org_id, provider_id, token, expires_at, accepted_at, created_by) values
  ('c7000000-0000-4000-8000-000000000001', 'seed-org-b@example.com', 'org_member',
   'a0000000-0000-4000-8000-000000000002', null,
   'seedvalidtoken0000000000000000aa', now() + interval '7 days', null, '운영자'),
  ('c7000000-0000-4000-8000-000000000002', 'seed-expired@example.com', 'instructor',
   null, 'b0000000-0000-4000-8000-000000000001',
   'seedexpiredtoken00000000000000bb', now() - interval '2 days', null, '운영자')
on conflict (id) do nothing;

-- ── 10. 계정 연결 (선택) -------------------------------------------------------
-- RLS 네거티브 테스트 중 7개는 **실제 로그인 세션**이 필요하다. Supabase 대시보드
-- Authentication → Users → Add user 로 비밀번호 계정 2개를 만든 뒤 아래 이메일을 고치고
-- 이 파일을 한 번 더 실행한다. 계정이 없으면 조용히 건너뛴다 (에러가 아니다).
--
-- 이 파일은 계정을 만들지 않는다 — auth.users 에 직접 INSERT 하지 않는다 (ADR-011).

do $$
declare
  v_org_a_email text := 'rls-org-a@example.com';
  v_instructor_email text := 'rls-instructor@example.com';
  v_user_id uuid;
begin
  select u.id into v_user_id from auth.users u
  where lower(u.email) = lower(v_org_a_email) limit 1;

  if v_user_id is null then
    raise notice '기관 A 담당자 계정을 찾지 못해 건너뜀: %', v_org_a_email;
  else
    update public.org_members
       set auth_user_id = v_user_id
     where id = 'e0000000-0000-4000-8000-000000000001';
    raise notice '기관 A 담당자 연결 완료: %', v_org_a_email;
  end if;

  select u.id into v_user_id from auth.users u
  where lower(u.email) = lower(v_instructor_email) limit 1;

  if v_user_id is null then
    raise notice '강사 계정을 찾지 못해 건너뜀: %', v_instructor_email;
  else
    update public.instructors
       set auth_user_id = v_user_id
     where id = 'c0000000-0000-4000-8000-000000000001';
    raise notice '강사 연결 완료: %', v_instructor_email;
  end if;
end
$$;

-- ── 11. RLS 네거티브 테스트용 환경변수 ------------------------------------------
-- 아래 출력을 `.env.local` 에 그대로 붙이고 `npm test` 를 돌리면
-- 건너뛰던 14개가 실제 역할 키로 실행된다.
-- RLS_TEST_ORG_A_* / RLS_TEST_INSTRUCTOR_* 는 위에서 만든 계정의 이메일·비밀번호다.

select * from (values
  ('RLS_TEST_ORG_B_ORG_ID', 'a0000000-0000-4000-8000-000000000002'),
  ('RLS_TEST_UNASSIGNED_SESSION_ID', 'f0000000-0000-4000-8000-000000000003'),
  ('RLS_TEST_CLOSED_SESSION_ID', 'f0000000-0000-4000-8000-000000000002'),
  ('RLS_TEST_PENDING_INSTRUCTOR_ID', 'c0000000-0000-4000-8000-000000000003'),
  ('RLS_TEST_EXPIRED_INVITE_TOKEN', 'seedexpiredtoken00000000000000bb'),
  ('RLS_TEST_OTHER_INSTRUCTOR_ID', 'c0000000-0000-4000-8000-000000000002')
) as t(env_key, env_value);
