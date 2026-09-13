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
import { enterDemo } from '@/app/(public)/login/actions'
import StudentLayout from '@/app/(student)/layout'
import PublicLayout from '@/app/(public)/layout'
import { DEMO_ROLE_COOKIE } from '@/lib/auth/actor'
import { DEMO_STUDENT_ENTRY_CODE, DEMO_STUDENT_PSEUDO_CODE, demoGuestEntries } from '@/lib/demo/guests'
import { loadDataset } from '@/lib/db/dataset'
import { alreadyResponded, sessionByEntryCode, studentByPseudoCode } from '@/lib/db/queries'
import { recommend } from '@/lib/ai/recommend'

/**
 * 데모 입구 — 학생·보호자.
 *
 * 학생과 보호자는 **계정이 없다** (CLAUDE.md CRITICAL: 공개 가입 없음 · 보호자 계정 없음 · 학생은 가명코드뿐).
 * 그래서 데모에서도 역할 버튼(쿠키)으로 넣지 않고, 실서비스와 같은 **비로그인 경로**로 들여보낸다.
 *
 * 여기서 반드시 지켜지는 것:
 * - 역할 버튼은 기관·학교·강사·운영자 넷뿐이다. 학생·보호자 키로는 쿠키가 심기지 않는다
 * - 학생 입구는 QR 설문(`/s/{입장코드}`), 보호자 입구는 문의 폼(`/inquiry`)이다
 * - 데모 학생 코드는 시드에 실제로 있고, 아직 그 회차에 응답하지 않았고, 지난 회차 기록이 있다
 * - 계정 없는 화면에도 "데모"라는 사실과 역할 고르기로 돌아가는 길이 보인다
 * - 실 DB 에 붙으면 이 입구가 전부 사라진다
 */

const ORIGINAL = { ...process.env }

beforeEach(() => {
  delete process.env.NEXT_PUBLIC_SUPABASE_URL
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  cookieStore.set.mockReset()
})

afterEach(() => {
  process.env = { ...ORIGINAL }
})

function goLive() {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon'
}

describe('데모 로그인 화면', () => {
  it('역할 버튼은 기관·학교·강사·운영자 넷 그대로다', () => {
    const { container } = render(LoginPage())
    const keys = [...container.querySelectorAll<HTMLInputElement>('input[type="hidden"][name="actor"]')].map(
      (i) => i.value,
    )
    expect(keys).toEqual(['org', 'school', 'instructor', 'admin'])
  })

  it('학생 입구는 로그인 없이 QR 설문 화면으로 간다', () => {
    render(LoginPage())
    const link = screen.getByRole('link', { name: /학생 · 계정 없음/ })
    expect(link).toHaveAttribute('href', `/s/${DEMO_STUDENT_ENTRY_CODE}`)
    expect(link.closest('form')).toBeNull()
    expect(link.textContent).toContain(DEMO_STUDENT_PSEUDO_CODE)
  })

  it('보호자 입구는 비로그인 문의 폼으로 간다', () => {
    render(LoginPage())
    const link = screen.getByRole('link', { name: /보호자 · 계정 없음/ })
    expect(link).toHaveAttribute('href', '/inquiry')
    expect(link.closest('form')).toBeNull()
  })

  it('학생·보호자는 계정이 없다는 이유를 적어 둔다', () => {
    render(LoginPage())
    expect(screen.getByText('계정 없이 쓰는 사람')).toBeInTheDocument()
    expect(screen.getByText(/학생과 보호자는 계정을 만들지 않습니다/)).toBeInTheDocument()
  })

  it('실 DB 가 붙으면 데모 입구가 전부 사라진다', () => {
    goLive()
    render(LoginPage())
    expect(screen.queryByText('계정 없이 쓰는 사람')).toBeNull()
    expect(screen.queryByRole('link', { name: /학생 · 계정 없음/ })).toBeNull()
    expect(screen.queryByRole('link', { name: /보호자 · 계정 없음/ })).toBeNull()
  })
})

describe('enterDemo — 학생·보호자에게 쿠키를 심지 않는다', () => {
  function form(actor: string) {
    const fd = new FormData()
    fd.set('actor', actor)
    return fd
  }

  it.each(['student', 'guardian', 'parent'])('%s → /login 으로 돌려보내고 쿠키 없음', async (key) => {
    await expect(enterDemo(form(key))).rejects.toThrow('redirect:/login')
    expect(cookieStore.set).not.toHaveBeenCalled()
  })

  it('기관 담당자 키는 그대로 동작한다', async () => {
    await expect(enterDemo(form('org'))).rejects.toThrow('redirect:/org')
    expect(cookieStore.set).toHaveBeenCalledWith(DEMO_ROLE_COOKIE, 'org', expect.any(Object))
  })
})

describe('데모 학생 코드는 시드에 있는 실제 흐름이다', () => {
  it('입구 두 개의 주소', () => {
    expect(demoGuestEntries().map((e) => [e.key, e.href])).toEqual([
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

describe('계정 없는 화면의 데모 안내', () => {
  it('학생 화면 — 데모라는 사실과 역할 고르기로 돌아가는 링크', () => {
    render(StudentLayout({ children: <p>본문</p> }))
    expect(screen.getByRole('link', { name: '역할 다시 고르기' })).toHaveAttribute('href', '/login')
    expect(screen.getByText(/AI 문장은 시연용 예시입니다/)).toBeInTheDocument()
  })

  it('공개 화면(보호자) — 같은 안내', () => {
    render(PublicLayout({ children: <p>본문</p> }))
    expect(screen.getByRole('link', { name: '역할 다시 고르기' })).toHaveAttribute('href', '/login')
  })

  it('실 DB 에서는 안내가 없다', () => {
    goLive()
    render(StudentLayout({ children: <p>본문</p> }))
    expect(screen.queryByRole('link', { name: '역할 다시 고르기' })).toBeNull()
  })
})
