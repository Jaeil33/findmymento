-- ============================================================================
-- anon 이 평가하는 RLS 정책의 역할 함수에 EXECUTE 권한을 준다
--
-- 문제: 공개 정책 몇 개가 역할 함수를 부른다.
--   providers_read_approved   : status = 'approved' or app.is_admin()
--   instructors_read_approved : status = 'approved' or id = app.current_instructor_id() or app.is_admin()
--   programs_read_public      : ... app.current_instructor_id() ... app.is_admin()
--   qna_questions_read_public · qna_answers_read_public : ... app.current_org_id() ... app.is_admin()
-- 그런데 init.sql 은 세 함수의 EXECUTE 를 authenticated 에게만 줬다.
-- PostgreSQL 은 함수 실행 권한을 **식을 준비하는 시점에** 확인하므로, 앞 조건
-- (status = 'approved')가 참이어도 anon 의 SELECT 전체가 "permission denied for function" 으로 실패한다.
-- loadDataset 은 이 에러를 0행으로 삼키기 때문에 실 DB 에서 비로그인 화면은
-- "프로그램 0개"로만 보였다 — 학생 추천 후보가 사라지고, AI 추천은 한 번도 불리지 않는다.
--
-- 안전한 이유: 세 함수는 SECURITY DEFINER 로 **호출자 자신(auth.uid())의 행만** 본다.
-- anon 에게는 auth.uid() 가 null 이므로 current_org_id()·current_instructor_id() 는 null,
-- is_admin() 은 false 를 돌려준다. 새로 보이는 행은 없고, 정책이 원래 의도대로 평가될 뿐이다.
-- ============================================================================

grant execute on function app.current_org_id() to anon;
grant execute on function app.current_instructor_id() to anon;
grant execute on function app.is_admin() to anon;
