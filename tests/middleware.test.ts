// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * 미들웨어가 하는 일은 **하나뿐이다 — 세션 쿠키 갱신.**
 *
 * 이게 없으면 access token 이 만료된 뒤 org·instructor·admin 화면이 전부 `/login` 으로
 * 튕긴다. Server Component 는 쿠키를 쓸 수 없어서(`lib/supabase/server.ts` 의 catch)
 * 갱신할 지점이 미들웨어밖에 없다.
 *
 * 반대로 **역할 판단은 여기서 하지 않는다.** 역할은 `org_members`/`instructors`/`admins`
 * 테이블 조회로만 판별하고(CLAUDE.md CRITICAL), 그 판단은 각 layout 의 `getActor()` 가 한다.
 * 미들웨어가 역할을 흉내내면 판단 지점이 두 곳으로 갈라진다.
 */

const ORIGINAL = { ...process.env }

afterEach(() => {
  process.env = { ...ORIGINAL }
  vi.resetModules()
  vi.unstubAllEnvs()
})

function clearSupabaseEnv() {
  delete process.env.NEXT_PUBLIC_SUPABASE_URL
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
}

describe('세션 갱신 대상 판별', () => {
  it('Supabase 쿠키가 없으면 갱신하지 않는다 (익명 방문자 — 학생 설문·디렉토리)', async () => {
    const { needsSessionRefresh } = await import('@/middleware')
    expect(needsSessionRefresh([])).toBe(false)
    expect(needsSessionRefresh([{ name: 'fmm_demo_role', value: 'org' }])).toBe(false)
  })

  it('sb- 접두사 쿠키가 있으면 갱신한다', async () => {
    const { needsSessionRefresh } = await import('@/middleware')
    expect(needsSessionRefresh([{ name: 'sb-abcdefg-auth-token', value: 'x' }])).toBe(true)
  })
})

describe('데모 모드', () => {
  it('Supabase 키가 없으면 통과시킨다 (리다이렉트 없음)', async () => {
    clearSupabaseEnv()
    const { NextRequest } = await import('next/server')
    const { middleware } = await import('@/middleware')

    const req = new NextRequest('http://localhost:3000/org')
    req.cookies.set('sb-localhost-auth-token', 'stale')

    const res = await middleware(req)
    expect(res.status).toBe(200)
    expect(res.headers.get('location')).toBeNull()
  })

  it('데모 모드에서는 Supabase 클라이언트를 만들지 않는다', async () => {
    clearSupabaseEnv()
    const createServerClient = vi.fn()
    vi.doMock('@supabase/ssr', () => ({ createServerClient }))

    const { NextRequest } = await import('next/server')
    const { middleware } = await import('@/middleware')

    const req = new NextRequest('http://localhost:3000/admin')
    req.cookies.set('sb-localhost-auth-token', 'stale')
    await middleware(req)

    expect(createServerClient).not.toHaveBeenCalled()
    vi.doUnmock('@supabase/ssr')
  })
})

describe('실 DB 모드', () => {
  it('세션 쿠키가 있으면 getUser() 로 토큰을 갱신한다', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://probe.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-probe-key'

    const getUser = vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
    vi.doMock('@supabase/ssr', () => ({
      createServerClient: () => ({ auth: { getUser } }),
    }))

    const { NextRequest } = await import('next/server')
    const { middleware } = await import('@/middleware')

    const req = new NextRequest('http://localhost:3000/org/sessions')
    req.cookies.set('sb-probe-auth-token', 'stale')
    const res = await middleware(req)

    expect(getUser).toHaveBeenCalledTimes(1)
    // 갱신만 한다. 역할 판단·리다이렉트는 layout 의 몫이다.
    expect(res.headers.get('location')).toBeNull()
    vi.doUnmock('@supabase/ssr')
  })

  it('갱신이 실패해도 요청을 통과시킨다 — 미들웨어 하나로 사이트 전체가 죽지 않게', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://probe.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-probe-key'

    vi.doMock('@supabase/ssr', () => ({
      createServerClient: () => ({
        auth: {
          getUser: () => Promise.reject(new Error('fetch failed')),
        },
      }),
    }))

    const { NextRequest } = await import('next/server')
    const { middleware } = await import('@/middleware')

    const req = new NextRequest('http://localhost:3000/programs')
    req.cookies.set('sb-probe-auth-token', 'stale')

    const res = await middleware(req)
    expect(res.status).toBe(200)
    vi.doUnmock('@supabase/ssr')
  })

  it('세션 쿠키가 없으면 네트워크를 타지 않는다', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://probe.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-probe-key'

    const createServerClient = vi.fn()
    vi.doMock('@supabase/ssr', () => ({ createServerClient }))

    const { NextRequest } = await import('next/server')
    const { middleware } = await import('@/middleware')

    await middleware(new NextRequest('http://localhost:3000/programs'))
    expect(createServerClient).not.toHaveBeenCalled()
    vi.doUnmock('@supabase/ssr')
  })
})

describe('미들웨어의 책임 범위 (정적 검증)', () => {
  const src = readFileSync(join(process.cwd(), 'src/middleware.ts'), 'utf8')
  const code = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*'))
    .join('\n')

  it('역할 테이블을 조회하지 않는다', () => {
    expect(code).not.toContain('org_members')
    expect(code).not.toContain('instructors')
    expect(code).not.toContain('admins')
  })

  it('리다이렉트를 만들지 않는다', () => {
    expect(code).not.toContain('NextResponse.redirect')
  })

  it('service_role 키를 읽지 않는다', () => {
    expect(code).not.toContain('SUPABASE_SERVICE_ROLE_KEY')
  })

  it('정적 자산을 matcher 에서 제외한다', () => {
    expect(code).toContain('_next/static')
    expect(code).toContain('_next/image')
  })
})
