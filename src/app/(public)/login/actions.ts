'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { DEMO_ROLE_COOKIE, homePathFor, type Role } from '@/lib/auth/actor'
import { isDemoMode } from '@/lib/supabase/env'

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
