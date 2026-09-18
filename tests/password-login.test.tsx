import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { Dataset } from '@/lib/db/dataset'
import type { LectureSession } from '@/types/domain'

/**
 * 아이디·비밀번호 로그인 + 로그인 직후 교실 QR.
 *
 * - 아이디는 Supabase 이메일+비밀번호 로그인 위에 얹는다. `@` 없는 아이디는 메일이 절대 가지 않는
 *   예약 도메인(.invalid) 주소로 바꾼다.
 * - 역할은 여전히 org_members/instructors/admins 조회로만 정한다 (CLAUDE.md CRITICAL). 로그인 액션은
 *   역할을 판단하지 않고 `/login/after` 로 보내고, 거기서 새 요청의 세션으로 판별한다.
 * - 강사에게 **오늘 배정된, 응답을 받는 중인** 회차가 있으면 곧장 전체화면 QR(`/project/{id}`)로 간다.
 */

const nav = vi.hoisted(() => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`)
  }),
}))
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  redirect: nav.redirect,
}))

const sbState = vi.hoisted(() => ({
  signIn: vi.fn(),
  signOut: vi.fn(),
}))
vi.mock('@/lib/supabase/server', () => ({
  getServerSupabase: async () => ({
    auth: { signInWithPassword: sbState.signIn, signOut: sbState.signOut },
  }),
}))

const actorState = vi.hoisted(() => ({ actor: null as unknown }))
vi.mock('@/lib/auth/actor', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth/actor')>()),
  getActor: async () => actorState.actor,
}))

const dsState = vi.hoisted(() => ({ ds: null as unknown }))
vi.mock('@/lib/db/dataset', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/db/dataset')>()),
  loadDataset: async () => dsState.ds,
}))

const { loginEmailFor, LOGIN_ID_DOMAIN } = await import('@/lib/auth/login-id')
const { landingPathFor, kstToday } = await import('@/lib/auth/landing')
const { signInWithPassword } = await import('@/app/(public)/login/actions')
const { GET: afterLogin } = await import('@/app/(public)/login/after/route')
const { default: LoginPage } = await import('@/app/(public)/login/page')

const ORIGINAL = { ...process.env }
function goLive() {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon'
}

beforeEach(() => {
  nav.redirect.mockClear()
  sbState.signIn.mockReset()
  sbState.signOut.mockReset()
  actorState.actor = null
  dsState.ds = null
})
afterEach(() => {
  process.env = { ...ORIGINAL }
})

// 2026-09-19 10:30 KST
const NOW = new Date('2026-09-19T01:30:00Z')

function session(over: Partial<LectureSession>): LectureSession {
  return {
    id: 'ls-x',
    org_id: 'org-1',
    instructor_id: 'ins-1',
    title: '드론코딩',
    field: '드론',
    held_on: '2026-09-19',
    closes_at: '2026-09-19T14:59:00Z',
    status: 'open',
    entry_code: '267260',
    ...over,
  } as LectureSession
}

function dataset(sessions: LectureSession[]): Dataset {
  return {
    lectureSessions: sessions,
    organizations: [{ id: 'org-1', name: '부천 소사 청소년센터' }],
    surveyResponses: [],
  } as unknown as Dataset
}

const instructor = { role: 'instructor', instructorId: 'ins-1', displayName: '황록주', demo: false }
const orgMember = { role: 'org_member', orgId: 'org-1', memberId: 'm-1', displayName: '담당자', demo: false }

// ────────────────────────────────────────────────────────────
describe('loginEmailFor — 아이디를 로그인 주소로', () => {
  it('영문·숫자 아이디는 예약 도메인 주소가 된다 (대소문자·공백 무시)', () => {
    expect(LOGIN_ID_DOMAIN.endsWith('.invalid')).toBe(true)
    expect(loginEmailFor('  HwangRokju ')).toBe(`hwangrokju@${LOGIN_ID_DOMAIN}`)
    expect(loginEmailFor('drone_t.1')).toBe(`drone_t.1@${LOGIN_ID_DOMAIN}`)
  })

  it('이메일을 넣으면 이메일 그대로 쓴다', () => {
    expect(loginEmailFor('NJSKY1@naver.com')).toBe('njsky1@naver.com')
  })

  it('빈 값·한글·너무 짧은 아이디·깨진 이메일은 거절한다', () => {
    for (const bad of ['', '  ', '황록주', 'ab', 'a b c', 'x@', '@naver.com']) {
      expect(loginEmailFor(bad), bad).toBeNull()
    }
  })
})

// ────────────────────────────────────────────────────────────
describe('landingPathFor — 로그인 직후 갈 곳', () => {
  it('한국 날짜로 오늘을 센다 (자정 넘은 새벽도 한국 날짜)', () => {
    expect(kstToday(new Date('2026-09-18T15:30:00Z'))).toBe('2026-09-19')
  })

  it('강사에게 오늘 응답 받는 회차가 있으면 곧장 교실 QR 화면', () => {
    const ds = dataset([session({ id: 'ls-old', held_on: '2026-09-01', closes_at: '2026-09-01T14:59:00Z' }), session({ id: 'ls-today' })])
    expect(landingPathFor(instructor as never, ds, NOW)).toBe('/project/ls-today')
  })

  it('오늘 회차가 마감됐거나 남의 회차면 강사 첫 화면', () => {
    expect(landingPathFor(instructor as never, dataset([session({ status: 'closed' })]), NOW)).toBe('/instructor')
    expect(landingPathFor(instructor as never, dataset([session({ instructor_id: 'ins-2' })]), NOW)).toBe('/instructor')
  })

  it('기관 담당자는 기관 첫 화면', () => {
    expect(landingPathFor(orgMember as never, dataset([session({})]), NOW)).toBe('/org')
  })
})

// ────────────────────────────────────────────────────────────
describe('signInWithPassword — 로그인 액션', () => {
  const form = (loginId: string, password: string) => {
    const f = new FormData()
    f.set('loginId', loginId)
    f.set('password', password)
    return f
  }

  it('맞으면 아이디를 주소로 바꿔 로그인하고 /login/after 로 보낸다', async () => {
    goLive()
    sbState.signIn.mockResolvedValue({ error: null })
    await expect(signInWithPassword(form('HwangRokju', 'pw-123456'))).rejects.toThrow('REDIRECT:/login/after')
    expect(sbState.signIn).toHaveBeenCalledWith({ email: `hwangrokju@${LOGIN_ID_DOMAIN}`, password: 'pw-123456' })
  })

  it('틀리면 같은 안내로 돌려보낸다 (어느 쪽이 틀렸는지 말하지 않는다)', async () => {
    goLive()
    sbState.signIn.mockResolvedValue({ error: { message: 'Invalid login credentials' } })
    await expect(signInWithPassword(form('hwangrokju', 'wrong'))).rejects.toThrow('REDIRECT:/login?error=password')
  })

  it('아이디 형식이 틀리거나 비밀번호가 비면 Supabase 를 부르지 않는다', async () => {
    goLive()
    await expect(signInWithPassword(form('황록주', 'pw'))).rejects.toThrow('REDIRECT:/login?error=password')
    await expect(signInWithPassword(form('hwangrokju', ''))).rejects.toThrow('REDIRECT:/login?error=password')
    expect(sbState.signIn).not.toHaveBeenCalled()
  })

  it('데모 모드에서는 아무것도 하지 않는다', async () => {
    await expect(signInWithPassword(form('hwangrokju', 'pw-123456'))).rejects.toThrow('REDIRECT:/login')
    expect(sbState.signIn).not.toHaveBeenCalled()
  })
})

// ────────────────────────────────────────────────────────────
describe('/login/after — 역할 판별 뒤 첫 화면', () => {
  const req = () => new Request('https://findmymento.vercel.app/login/after')

  it('강사 + 오늘 회차 → 교실 QR 화면', async () => {
    actorState.actor = instructor
    dsState.ds = dataset([session({ id: 'ls-today', held_on: kstToday(), closes_at: new Date(Date.now() + 3_600_000).toISOString() })])
    const res = await afterLogin(req())
    expect(res.headers.get('location')).toBe('https://findmymento.vercel.app/project/ls-today')
  })

  it('역할이 없는 계정은 로그아웃시키고 안내한다', async () => {
    actorState.actor = null
    const res = await afterLogin(req())
    expect(sbState.signOut).toHaveBeenCalled()
    expect(res.headers.get('location')).toBe('https://findmymento.vercel.app/login?error=no_role')
  })
})

// ────────────────────────────────────────────────────────────
describe('로그인 화면', () => {
  it('실 DB 가 붙으면 아이디·비밀번호 칸이 있고 메일 링크 칸은 없다', async () => {
    goLive()
    render(await LoginPage({ searchParams: Promise.resolve({}) }))
    expect(screen.getByLabelText('아이디')).toHaveAttribute('name', 'loginId')
    expect(screen.getByLabelText('비밀번호')).toHaveAttribute('type', 'password')
    expect(screen.queryByText('로그인 링크 받기')).toBeNull()
  })

  it('틀렸을 때 안내 문구를 보여 준다', async () => {
    goLive()
    render(await LoginPage({ searchParams: Promise.resolve({ error: 'password' }) }))
    expect(screen.getByText('아이디 또는 비밀번호가 맞지 않아요.')).toBeInTheDocument()
  })
})
