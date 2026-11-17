'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { DEMO_ROLE_COOKIE } from '@/lib/auth/actor'
import { loginEmailFor } from '@/lib/auth/login-id'
import { TOUR_COOKIE } from '@/lib/demo/mode'
import { isDemoMode } from '@/lib/supabase/env'
import { getServerSupabase } from '@/lib/supabase/server'

/**
 * 아이디·비밀번호 로그인 (실 DB 전용).
 *
 * 여기서는 **역할을 판단하지 않는다.** 로그인에 성공하면 `/login/after` 로 보내고, 그 새 요청이
 * 방금 심은 세션으로 org_members/instructors/admins 를 조회해 첫 화면을 정한다 (CLAUDE.md CRITICAL).
 * 아이디가 틀렸는지 비밀번호가 틀렸는지는 구분해서 알려 주지 않는다 — 등록된 아이디를 알려 주는 것과 같다.
 *
 * 체험 쿠키는 **로그인 시도 전에 지운다.** 남아 있으면 로그인 자체가 데모 시드로 가서
 * (`lib/supabase/server.ts` 가 실 DB 핸들을 주지 않는다) 아무리 맞는 비밀번호를 넣어도 들어갈 수 없다.
 */
export async function signInWithPassword(formData: FormData) {
  if (isDemoMode()) redirect('/login')

  const store = await cookies()
  store.delete(TOUR_COOKIE)
  store.delete(DEMO_ROLE_COOKIE)

  const email = loginEmailFor(String(formData.get('loginId') ?? ''))
  const password = String(formData.get('password') ?? '')
  if (!email || password === '') redirect('/login?error=password')

  const sb = await getServerSupabase()
  if (!sb) redirect('/login?error=1')

  const { error } = await sb.auth.signInWithPassword({ email, password })
  if (error) redirect('/login?error=password')

  redirect('/login/after')
}

/**
 * 체험 종료. 쿠키를 지우고 첫 화면으로 돌아간다.
 *
 * 체험 입장은 주소 하나(`/tour/{키}`)로만 하고, 쿠키를 심는 코드는 그 라우트 하나뿐이다 (ADR-033).
 * 여기는 지우는 쪽이므로 권한과 무관하다.
 */
export async function leaveDemo() {
  const store = await cookies()
  store.delete(TOUR_COOKIE)
  store.delete(DEMO_ROLE_COOKIE)
  redirect('/')
}
