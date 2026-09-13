import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'

const nav = vi.hoisted(() => ({ pathname: '/' }))
vi.mock('next/navigation', () => ({ usePathname: () => nav.pathname }))

import LandingPage from '@/app/(public)/page'
import { SiteHeader } from '@/components/layout/SiteHeader'
import { SiteFooter } from '@/components/layout/SiteFooter'
import { loadDataset } from '@/lib/db/dataset'
import { supplySummary } from '@/lib/db/queries'
import { FIELDS } from '@/types/domain'

/**
 * 공개 랜딩.
 *
 * 홈페이지답게 다듬어도 **사실을 숨기지 않고, 연락 경로를 새로 만들지 않는다**는 조건은 그대로다.
 * 장식이 늘어날수록 이 조건이 먼저 흐려지므로 화면 단위로 고정한다.
 */
describe('랜딩 페이지', () => {
  async function renderLanding() {
    const ui = await LandingPage()
    return render(ui)
  }

  it('파일럿 공급 규모를 숫자로 그대로 보여준다 (UI_GUIDE 안전규칙 5)', async () => {
    const supply = supplySummary(await loadDataset())
    const { container } = await renderLanding()
    const text = container.textContent ?? ''

    expect(text).toContain(`${supply.providerCount}곳`)
    expect(text).toContain(`${supply.instructorCount}명`)
    expect(text).toContain(`${supply.programCount}개`)
  })

  it('신산업 5개 분야를 모두 보여주고, 공급이 없는 분야를 숨기지 않는다', async () => {
    const supply = supplySummary(await loadDataset())
    await renderLanding()

    const fields = screen.getByRole('region', { name: /분야/ })
    for (const f of FIELDS) {
      expect(within(fields).getAllByText(f).length).toBeGreaterThan(0)
    }
    expect(within(fields).queryAllByText('강사 모집 중')).toHaveLength(supply.uncoveredFields.length)
  })

  it('문의 버튼 문구는 보호자를 향한다 (UI_GUIDE 안전규칙 6)', async () => {
    await renderLanding()
    const links = screen.getAllByRole('link', { name: /문의/ })
    expect(links.length).toBeGreaterThan(0)
    for (const link of links) {
      expect(link).toHaveAttribute('href', expect.stringMatching(/^\/inquiry/))
      expect(link.textContent).toContain('보호자')
    }
  })

  it('제품 화면 모형에는 "화면 예시" 표시가 붙는다 — 실제 응답으로 오해하지 않게', async () => {
    await renderLanding()
    expect(screen.getAllByText(/화면 예시/).length).toBeGreaterThan(0)
  })

  it('연락처 링크·입력 폼·가입 경로를 만들지 않는다', async () => {
    const { container } = await renderLanding()
    expect(container.querySelectorAll('a[href^="tel:"], a[href^="mailto:"]')).toHaveLength(0)
    expect(container.querySelectorAll('input, textarea, select, form')).toHaveLength(0)
    expect(screen.queryByRole('link', { name: /회원가입|가입하기/ })).toBeNull()
  })

  it('학생을 향한 문구에 "만족도 조사"를 쓰지 않는다 (UI_GUIDE 안전규칙 8)', async () => {
    const { container } = await renderLanding()
    expect(container.textContent).not.toContain('만족도 조사')
  })

  it('안전 설계 섹션으로 바로 갈 수 있다', async () => {
    const { container } = await renderLanding()
    expect(container.querySelector('#safety')).not.toBeNull()
  })
})

describe('공개 헤더·푸터', () => {
  it('헤더에 주요 메뉴와 로그인이 있고 회원가입이 없다', () => {
    render(<SiteHeader />)
    const hrefs = screen.getAllByRole('link').map((a) => a.getAttribute('href'))
    for (const href of ['/', '/programs', '/qna', '/inquiry', '/login']) {
      expect(hrefs).toContain(href)
    }
    expect(screen.queryByText(/회원가입|가입하기/)).toBeNull()
  })

  it('하위 경로에서도 해당 메뉴를 aria-current 로 표시한다', () => {
    nav.pathname = '/programs/p-1'
    try {
      render(<SiteHeader />)
      const current = screen
        .getAllByRole('link', { hidden: true })
        .filter((a) => a.getAttribute('aria-current') === 'page')
      expect(current.length).toBeGreaterThan(0)
      expect(current.every((a) => a.getAttribute('href') === '/programs')).toBe(true)
    } finally {
      nav.pathname = '/'
    }
  })

  it('푸터는 안전 원칙을 적고 연락처를 싣지 않는다', () => {
    const { container } = render(<SiteFooter />)
    expect(container.textContent).toContain('가명코드')
    expect(container.querySelectorAll('a[href^="tel:"], a[href^="mailto:"]')).toHaveLength(0)
  })
})
