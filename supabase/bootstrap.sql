-- ============================================================================
-- Find My Mento · 부트스트랩 (실 DB 첫 진입)
--
-- 이 서비스에는 **공개 회원가입이 없다** (ADR-011). 모든 계정은 초대에서 출발하고,
-- 초대를 만들 수 있는 것은 운영자뿐이다. 그래서 마이그레이션 직후의 DB 는
-- 아무도 들어갈 수 없는 상태다 — 초대를 만들 운영자가 없기 때문이다.
--
-- 그 고리를 끊는 것이 이 파일이다. 딱 두 가지만 한다.
--   1. 이미 존재하는 auth 계정 하나를 `admins` 에 연결한다 (첫 운영자).
--   2. 파일럿 기관 1개 + 공급 업체 1개를 만든다 (초대를 붙일 대상).
--
-- 그 다음부터는 화면에서 한다 — `/admin/invitations` 에서 기관 담당자·강사를 초대하고,
-- 발급된 `/invite/{token}` 링크를 전달한다.
--
-- ── 실행 순서 ────────────────────────────────────────────────────────────────
--   1. supabase/migrations/20260912000000_init.sql 를 먼저 적용한다.
--   2. Supabase 대시보드 → Authentication → Users → Add user 로
--      **운영자 이메일 계정을 먼저 만든다.** (이 파일은 계정을 만들지 않는다.)
--   3. 아래 v_admin_email 을 그 이메일로 바꾼다.
--   4. Supabase 대시보드 → SQL Editor 에 이 파일 전체를 붙여 실행한다.
--
-- 다시 실행해도 안전하다. 이미 있으면 아무것도 바꾸지 않는다.
-- ============================================================================

do $$
declare
  -- ▼▼▼ 여기만 고친다 ▼▼▼
  v_admin_email text := 'CHANGE_ME@example.com';
  v_admin_label text := '운영자';

  -- 파일럿 기관. 이름·유형은 실제 협약 기관으로 바꿔도 된다.
  -- type 은 화면 문구·집계 분류 전용이다. 권한 판단에 쓰지 않는다 (ADR-013).
  v_org_name text := '광명시청소년수련관';
  v_org_type public.org_type := 'youth_center';

  -- 공급 업체 1호. 강사 초대는 업체에 붙는다 (ADR-010).
  v_provider_name text := '3DNFLY';

  -- 파일럿 지역 = 경기 광명시. src/lib/region PILOT_REGION_CODE 와 같은 값이어야 한다.
  v_region_code text := '41210';
  -- ▲▲▲ 여기까지 ▲▲▲

  -- 고정 UUID. 다시 실행했을 때 같은 행을 가리키게 하려고 박아 둔다.
  v_org_id uuid := 'a0000000-0000-4000-8000-000000000001';
  v_provider_id uuid := 'b0000000-0000-4000-8000-000000000001';

  v_user_id uuid;
begin
  if v_admin_email like 'CHANGE_ME%' then
    raise exception
      '운영자 이메일을 먼저 고쳐야 한다. 이 파일 상단 v_admin_email 을 실제 이메일로 바꾼다';
  end if;

  select u.id into v_user_id
  from auth.users u
  where lower(u.email) = lower(v_admin_email)
  limit 1;

  if v_user_id is null then
    raise exception
      'auth 계정이 없다: %. Supabase 대시보드 Authentication → Users → Add user 로 먼저 만든다',
      v_admin_email;
  end if;

  -- 1. 첫 운영자. 역할은 이 테이블에 행이 있는지로만 판별된다 (CLAUDE.md CRITICAL).
  insert into public.admins (auth_user_id, display_name)
  values (v_user_id, v_admin_label)
  on conflict (auth_user_id) do nothing;

  -- 2. 파일럿 기관. 담당자 계정은 여기에 초대로 붙는다.
  insert into public.organizations (id, name, type, region_code)
  values (v_org_id, v_org_name, v_org_type, v_region_code)
  on conflict (id) do nothing;

  -- 3. 공급 업체. 승인 상태로 둔다 — 운영자가 대행 등록하는 주체다 (ADR-008).
  insert into public.providers (id, name, region_code, status)
  values (v_provider_id, v_provider_name, v_region_code, 'approved')
  on conflict (id) do nothing;

  raise notice '부트스트랩 완료. % 로 /login 에서 매직링크 로그인하면 /admin 으로 들어간다', v_admin_email;
end
$$;

-- 확인. 세 줄이 각각 1 이어야 한다.
select
  (select count(*) from public.admins) as admins,
  (select count(*) from public.organizations) as organizations,
  (select count(*) from public.providers) as providers;
