import { cookies } from 'next/headers'
import { getServerSupabase } from '@/lib/supabase/server'
import { isDemoMode } from '@/lib/supabase/env'

/**
 * 역할 판별.
 *
 * **`auth_user_id` 가 `org_members` / `instructors` / `admins` 중 어디에 있는지로만 판별한다.**
 * 클라이언트가 보낸 값이나 JWT 커스텀 클레임을 믿지 않는다 (CLAUDE.md CRITICAL).
 * `organizations.type` 도 권한 판단에 쓰지 않는다 — 화면 문구·집계 분류 전용이다 (ADR-013).
 */
export type Role = 'org_member' | 'instructor' | 'admin'

export type Actor =
  | { role: 'org_member'; orgId: string; memberId: string; displayName: string; demo: boolean }
  | { role: 'instructor'; instructorId: string; displayName: string; demo: boolean }
  | { role: 'admin'; displayName: string; demo: boolean }

export const DEMO_ROLE_COOKIE = 'fmm_demo_role'

/** 데모 모드에서 둘러보기용으로 고정해 둔 계정. 실 DB 가 붙으면 이 경로는 실행되지 않는다. */
const DEMO_ACTORS: Record<string, Actor> = {
  org: { role: 'org_member', orgId: 'org-1', memberId: 'om-1', displayName: '이수진', demo: true },
  school: { role: 'org_member', orgId: 'org-2', memberId: 'om-2', displayName: '강민호', demo: true },
  instructor: { role: 'instructor', instructorId: 'in-2', displayName: '박서연', demo: true },
  admin: { role: 'admin', displayName: '운영자', demo: true },
}

export function demoActorKeys(): (keyof typeof DEMO_ACTORS)[] {
  return Object.keys(DEMO_ACTORS)
}

export function demoActorLabel(key: string): string {
  const a = DEMO_ACTORS[key]
  if (!a) return key
  if (a.role === 'org_member') return `${a.displayName} · 기관 담당자`
  if (a.role === 'instructor') return `${a.displayName} · 강사`
  return `${a.displayName} · 운영자`
}

export async function getActor(): Promise<Actor | null> {
  // ── 데모 모드: 쿠키로 둘러볼 역할을 고른다.
  //    `isDemoMode()` 가 false 면 이 블록은 실행되지 않는다 — 쿠키로 권한을 얻는 경로는
  //    Supabase 키가 들어온 순간 코드 상에서 사라진다.
  if (isDemoMode()) {
    const store = await cookies()
    const key = store.get(DEMO_ROLE_COOKIE)?.value
    return (key ? DEMO_ACTORS[key] : null) ?? null
  }

  const sb = await getServerSupabase()
  if (!sb) return null

  const {
    data: { user },
  } = await sb.auth.getUser()
  if (!user) return null

  // 세 테이블 중 어디에 있는지로만 판별한다. 조회 자체에 RLS 가 걸리므로
  // 남의 행이 섞여 들어올 수 없다.
  const { data: adminRows } = await sb
    .from('admins')
    .select('auth_user_id')
    .eq('auth_user_id', user.id)
    .limit(1)
  if (adminRows && adminRows.length > 0) {
    return { role: 'admin', displayName: user.email ?? '운영자', demo: false }
  }

  const { data: memberRows } = await sb
    .from('org_members')
    .select('id, org_id, display_name')
    .eq('auth_user_id', user.id)
    .eq('active', true)
    .limit(1)
  const member = memberRows?.[0] as
    | { id: string; org_id: string; display_name: string }
    | undefined
  if (member) {
    return {
      role: 'org_member',
      orgId: member.org_id,
      memberId: member.id,
      displayName: member.display_name,
      demo: false,
    }
  }

  const { data: instructorRows } = await sb
    .from('instructors')
    .select('id, name')
    .eq('auth_user_id', user.id)
    .limit(1)
  const instructor = instructorRows?.[0] as { id: string; name: string } | undefined
  if (instructor) {
    return {
      role: 'instructor',
      instructorId: instructor.id,
      displayName: instructor.name,
      demo: false,
    }
  }

  return null
}

/** 로그인 후 역할별 분기 경로. */
export function homePathFor(role: Role): string {
  switch (role) {
    case 'org_member':
      return '/org'
    case 'instructor':
      return '/instructor'
    case 'admin':
      return '/admin'
  }
}
