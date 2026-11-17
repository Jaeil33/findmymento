import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

const cookieStore = vi.hoisted(() => ({ set: vi.fn(), delete: vi.fn(), get: vi.fn() }))
vi.mock('next/headers', () => ({ cookies: async () => cookieStore }))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`)
  },
  usePathname: () => '/',
  useRouter: () => ({ push: vi.fn() }),
}))
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: vi.fn() }
  },
}))

import LoginPage from '@/app/(public)/login/page'
import { leaveDemo } from '@/app/(public)/login/actions'
import StudentLayout from '@/app/(student)/layout'
import PublicLayout from '@/app/(public)/layout'
import { DemoBar } from '@/components/layout/DemoBar'
import { DEMO_ROLE_COOKIE } from '@/lib/auth/actor'
import { TOUR_COOKIE } from '@/lib/demo/mode'
import { DEMO_STUDENT_ENTRY_CODE, DEMO_STUDENT_PSEUDO_CODE } from '@/lib/demo/guests'
import { TOUR_ENTRIES } from '@/lib/demo/tour'
import { loadDataset } from '@/lib/db/dataset'
import { alreadyResponded, sessionByEntryCode, studentByPseudoCode } from '@/lib/db/queries'
import { recommend } from '@/lib/ai/recommend'

/**
 * 계정 없이 들어오는 입구 — 학생·보호자, 그리고 로그인 화면의 체험 입구.
 *
 * 학생과 보호자는 **계정이 없다** (CLAUDE.md CRITICAL: 공개 가입 없음 · 보호자 계정 없음 · 학생은
 * 가명코드뿐). 그래서 체험에서도 역할 쿠키로 넣지 않고, 실서비스와 같은 **비로그인 경로**로 들여보낸다.
 *
 * 여기서 반드시 지켜지는 것:
 * - 역할이 붙는 입구는 기관·학교·강사·운영자 넷뿐이다. 학생·보호자 입구에는 역할이 없다
 * - 학생 입구는 QR 설문(`/s/{입장코드}`), 보호자 입구는 문의 폼(`/inquiry`)이다
 * - 데모 학생 코드는 시드에 실제로 있고, 아직 그 회차에 응답하지 않았고, 지난 회차 기록이 있다
 * - 계정 없는 화면에도 "데모·체험"이라는 사실과 돌아가는 길이 보인다
 *
 * **실 DB 가 붙어도 이 입구는 사라지지 않는다** (ADR-033). 체험 세션이 실 DB 를 보지 못하도록
 * 막는 쪽이 안전장치이고, 그것은 `tests/tour-mode.test.ts` 가 고정한다.
 */

const ORIGINAL = { ...process.env }

beforeEach(() => {
  delete process.env.NEXT_PUBLIC_SUPABASE_URL
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  cookieStore.set.mockReset()
  cookieStore.delete.mockReset()
  cookieStore.get.mockReset()
})

afterEach(() => {
  process.env = { ...ORIGINAL }
})

function goLive() {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon'
}

describe('로그인 화면의 체험 입구', () => {
  async function renderLogin() {
    return render(await LoginPage({ searchParams: Promise.resolve({}) }))
  }

  it('역할이 붙는 입구는 기관·학교·강사·운영자 넷이다', async () => {
    const { container } = await renderLogin()
    const hrefs = [...container.querySelectorAll('a')].map((a) => a.getAttribute('href'))
    for (const key of ['org', 'school', 'instructor', 'admin']) {
      expect(hrefs).toContain(`/tour/${key}`)
    }
    expect(TOUR_ENTRIES.filter((e) => e.actor !== null).map((e) => e.key)).toEqual([
      'instructor',
      'admin',
      'org',
      'school',
    ])
  })

  it('입장은 전부 GET 링크다 — 쿠키를 심는 곳은 체험 라우트 하나뿐이다', async () => {
    const { container } = await renderLogin()
    expect(container.querySelectorAll('input[name="actor"]')).toHaveLength(0)
    const tourLinks = [...container.querySelectorAll('a')].filter((a) =>
      a.getAttribute('href')?.startsWith('/tour/'),
    )
    expect(tourLinks.length).toBeGreaterThan(0)
    for (const link of tourLinks) expect(link.closest('form')).toBeNull()
  })

  it('학생 입구는 로그인 없이 QR 설문 화면으로 간다', async () => {
    await renderLogin()
    const link = screen.getByRole('link', { name: /학생 모드 · 계정 없음/ })
    expect(link).toHaveAttribute('href', '/tour/student')
    expect(link.textContent).toContain(DEMO_STUDENT_PSEUDO_CODE)
  })

  it('보호자 입구는 비로그인 문의 폼으로 간다', async () => {
    await renderLogin()
    const link = screen.getByRole('link', { name: /보호자 모드 · 계정 없음/ })
    expect(link).toHaveAttribute('href', '/tour/guardian')
  })

  it('학생·보호자는 계정이 없다는 이유를 적어 둔다', async () => {
    await renderLogin()
    expect(screen.getByText('계정 없이 쓰는 사람')).toBeInTheDocument()
    expect(screen.getByText(/학생과 보호자는 계정을 만들지 않습니다/)).toBeInTheDocument()
  })

  it('실 DB 가 붙어도 입구는 남고, 데모 데이터만 보인다고 적는다', async () => {
    goLive()
    await renderLogin()
    expect(screen.getByText('계정 없이 둘러보기')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /학생 모드 · 계정 없음/ })).toBeInTheDocument()
    expect(screen.getByText(/실제 기관·학생 데이터는 보이지도 바뀌지도 않습니다/)).toBeInTheDocument()
  })
})

describe('체험 종료', () => {
  it('쿠키 둘을 지우고 첫 화면으로 돌아간다', async () => {
    await expect(leaveDemo()).rejects.toThrow('redirect:/')
    expect(cookieStore.delete).toHaveBeenCalledWith(TOUR_COOKIE)
    expect(cookieStore.delete).toHaveBeenCalledWith(DEMO_ROLE_COOKIE)
  })
})

describe('데모 학생 코드는 시드에 있는 실제 흐름이다', () => {
  it('계정 없는 입구 두 개의 도착 주소', () => {
    expect(
      TOUR_ENTRIES.filter((e) => e.actor === null).map((e) => [e.key, e.destination]),
    ).toEqual([
      ['student', `/s/${DEMO_STUDENT_ENTRY_CODE}`],
      ['guardian', '/inquiry'],
    ])
  })

  it('입장 코드는 응답을 받는 중인 회차다', async () => {
    const ctx = sessionByEntryCode(await loadDataset(), DEMO_STUDENT_ENTRY_CODE)
    expect(ctx).not.toBeNull()
    expect(ctx!.closed).toBe(false)
  })

  it('가명코드는 같은 기관이 발급했고, 이 회차에는 아직 응답하지 않았다', async () => {
    const ds = await loadDataset()
    const ctx = sessionByEntryCode(ds, DEMO_STUDENT_ENTRY_CODE)!
    const student = studentByPseudoCode(ds, ctx.session.org_id, DEMO_STUDENT_PSEUDO_CODE)
    expect(student).not.toBeNull()
    expect(alreadyResponded(ds, ctx.session.id, student!.id)).toBe(false)
  })

  it('지난 드론 회차 기록이 이어져 3D 를 골라도 드론 과정까지 추천된다 (E-18)', async () => {
    const ds = await loadDataset()
    const ctx = sessionByEntryCode(ds, DEMO_STUDENT_ENTRY_CODE)!
    const student = studentByPseudoCode(ds, ctx.session.org_id, DEMO_STUDENT_PSEUDO_CODE)!
    const history = [
      ...new Set(ds.surveyResponses.filter((r) => r.student_id === student.id).flatMap((r) => r.interest_fields)),
    ]
    expect(history).toContain('드론')

    const result = await recommend(ds, {
      regionCode: '41210',
      gradeBand: 'middle',
      interestFields: ['3D 모델링·프린팅'],
      sessionField: ctx.session.field,
      followupIntent: 4,
      wantToLearn: null,
      desiredJob: null,
      history,
    })
    const fields = result.items.map((i) => i.program.field)
    expect(fields).toContain('3D 모델링·프린팅')
    expect(fields).toContain('드론')
  })
})

describe('계정 없는 화면의 안내', () => {
  it('학생 화면 — 데모라는 사실과 역할 고르기로 돌아가는 링크', async () => {
    render(await StudentLayout({ children: <p>본문</p> }))
    expect(screen.getByRole('link', { name: '역할 다시 고르기' })).toHaveAttribute('href', '/login')
    expect(screen.getByText(/AI 문장은 시연용 예시입니다/)).toBeInTheDocument()
  })

  it('공개 화면(보호자) — 같은 안내', async () => {
    render(await PublicLayout({ children: <p>본문</p> }))
    expect(screen.getByRole('link', { name: '역할 다시 고르기' })).toHaveAttribute('href', '/login')
  })

  it('실 DB + 체험 아님 → 안내가 없다', async () => {
    goLive()
    render(await StudentLayout({ children: <p>본문</p> }))
    expect(screen.queryByRole('link', { name: '역할 다시 고르기' })).toBeNull()
  })

  it('체험 세션에서는 데모 데이터라는 사실과 종료 링크를 보여준다', () => {
    render(<DemoBar demo={false} tour />)
    expect(screen.getByText(/실제 기관·학생 데이터가 아닙니다/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '체험 종료' })).toHaveAttribute('href', '/tour/exit')
  })

  it('둘 다 아니면 아무것도 렌더하지 않는다', () => {
    const { container } = render(<DemoBar />)
    expect(container).toBeEmptyDOMElement()
  })
})
