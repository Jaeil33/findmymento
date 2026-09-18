'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { DEMO_ROLE_COOKIE, homePathFor, type Role } from '@/lib/auth/actor'
import { loginEmailFor } from '@/lib/auth/login-id'
import { isDemoMode } from '@/lib/supabase/env'
import { getServerSupabase } from '@/lib/supabase/server'

/**
 * 아이디·비밀번호 로그인 (실 DB 전용).
 *
 * 여기서는 **역할을 판단하지 않는다.** 로그인에 성공하면 `/login/after` 로 보내고, 그 새 요청이
 * 방금 심은 세션으로 org_members/instructors/admins 를 조회해 첫 화면을 정한다 (CLAUDE.md CRITICAL).
 * 아이디가 틀렸는지 비밀번호가 틀렸는지는 구분해서 알려 주지 않는다 — 등록된 아이디를 알려 주는 것과 같다.
 */
export async function signInWithPassword(formData: FormData) {
  if (isDemoMode()) redirect('/login')

  const email = loginEmailFor(String(formData.get('loginId') ?? ''))
  const password = String(formData.get('password') ?? '')
  if (!email || password === '') redirect('/login?error=password')

  const sb = await getServerSupabase()
  if (!sb) redirect('/login?error=1')

  const { error } = await sb.auth.signInWithPassword({ email, password })
  if (error) redirect('/login?error=password')

  redirect('/login/after')
}

const PATHS: Record<string, { role: Role }> = {
  org: { role: 'org_member' },
  school: { role: 'org_member' },
  instructor: { role: 'instructor' },
  admin: { role: 'admin' },
}

/**
 * 데모 모드 전용 진입. **Supabase 키가 설정돼 있으면 아무것도 하지 않는다.**
 * 실 DB 에서는 역할을 `org_members`/`instructors`/`admins` 조회로만 판별한다 (CLAUDE.md CRITICAL).
 */
export async function enterDemo(formData: FormData) {
  if (!isDemoMode()) redirect('/login')

  const key = String(formData.get('actor') ?? '')
  const entry = PATHS[key]
  if (!entry) redirect('/login')

  const store = await cookies()
  store.set(DEMO_ROLE_COOKIE, key, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 8,
  })

  redirect(homePathFor(entry.role))
}

export async function leaveDemo() {
  const store = await cookies()
  store.delete(DEMO_ROLE_COOKIE)
  redirect('/')
}
