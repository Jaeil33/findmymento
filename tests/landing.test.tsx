import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'

const nav = vi.hoisted(() => ({ pathname: '/' }))
vi.mock('next/navigation', () => ({ usePathname: () => nav.pathname }))

import LandingPage from '@/app/(public)/page'
import { SiteHeader } from '@/components/layout/SiteHeader'
import { SiteFooter } from '@/components/layout/SiteFooter'
import { loadDataset } from '@/lib/db/dataset'
import { supplySummary } from '@/lib/db/queries'
import { INSTRUCTOR_GUIDE, STUDENT_GUIDE, TOUR_PRIMARY_KEYS } from '@/lib/demo/tour'
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

/**
 * 로그인 없이 들어가는 입구 (ADR-033)와 사용 방법.
 *
 * 홈페이지에서 **계정 없이** 강사·학생·운영자 화면으로 들어갈 수 있어야 하고, 그 자리에
 * "데모 데이터만 보인다"는 사실이 같이 적혀 있어야 한다. 입구만 있고 설명이 없으면
 * 체험 화면의 숫자를 실제 운영 데이터로 읽는다.
 */
describe('랜딩 — 체험 입구와 사용 방법', () => {
  async function renderLanding() {
    return render(await LandingPage())
  }

  it('강사·학생·운영자 체험 입구가 있다', async () => {
    const { container } = await renderLanding()
    const hrefs = [...container.querySelectorAll('a')].map((a) => a.getAttribute('href'))
    for (const key of TOUR_PRIMARY_KEYS) {
      expect(hrefs).toContain(`/tour/${key}`)
    }
    expect(container.querySelector('#tour')).not.toBeNull()
  })

  it('체험이 데모 데이터라는 사실을 입구와 같은 자리에 적는다', async () => {
    const { container } = await renderLanding()
    const tour = container.querySelector('#tour')!
    expect(tour.textContent).toMatch(/데모 데이터/)
  })

  it('강사·학생 사용 방법을 단계까지 적는다', async () => {
    const { container } = await renderLanding()
    expect(container.querySelector('#guide')).not.toBeNull()

    const guide = container.querySelector('#guide')!
    for (const g of [INSTRUCTOR_GUIDE, STUDENT_GUIDE]) {
      expect(guide.textContent).toContain(`${g.audience} 사용 방법`)
      expect(g.steps.length).toBeGreaterThanOrEqual(5)
      for (const step of g.steps) expect(guide.textContent).toContain(step.title)
      for (const note of g.notes) expect(guide.textContent).toContain(note)
    }
  })

  it('학생 사용 방법에 1:1 비공개 경로나 결제를 적지 않는다 (CLAUDE.md CRITICAL)', async () => {
    const { container } = await renderLanding()
    const guide = container.querySelector('#guide')!.textContent ?? ''
    // 학생 쪽 안내에는 "비밀 대화를 만들지 않았다"처럼 **없다는 사실**만 적혀 있어야 한다.
    expect(guide).toMatch(/1:1[^.]*없|비밀 대화는 만들지 않았습니다/)
    expect(guide).toMatch(/결제하는 기능은 없습니다/)
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

/**
 * 체험 입구의 위계.
 *
 * 입구 카드 세 장이 **완전히 같은 무게**로 서 있으면, 처음 여는 사람에게 "이 중 무엇이
 * 이 제품인가"라는 질문이 남는다. 1순위는 강사의 AI 콘텐츠 스튜디오다 (ADR-028).
 *
 * 위계는 장식이 아니라 **버튼 등급과 선 하나**로 만든다 — 파란 Primary 버튼 세 개가
 * 나란히 있으면 그건 위계가 없는 것이지 셋 다 중요한 게 아니다.
 * 학생·운영자 입구를 없애거나 감추지는 않는다. 둘 다 심사에서 여는 화면이다.
 */
describe('랜딩 — 체험 입구의 위계', () => {
  async function tourSection() {
    const { container } = render(await LandingPage())
    return container.querySelector('#tour')!
  }

  it('강사 입구가 첫 번째다 (ADR-028)', async () => {
    const tour = await tourSection()
    const cards = [...tour.querySelectorAll('li')].filter((li) => li.querySelector('a[href^="/tour/"]'))
    expect(cards[0]?.querySelector('a[href^="/tour/"]')?.getAttribute('href')).toBe('/tour/instructor')
  })

  it('Primary 버튼은 강사 입구 하나뿐이다', async () => {
    const tour = await tourSection()
    const primary = [...tour.querySelectorAll('a[href^="/tour/"]')].filter((a) =>
      a.className.includes('bg-point'),
    )
    expect(primary).toHaveLength(1)
    expect(primary[0].getAttribute('href')).toBe('/tour/instructor')
  })

  it('학생·운영자 입구는 사라지지 않는다 — 등급만 내려간다', async () => {
    const tour = await tourSection()
    const hrefs = [...tour.querySelectorAll('a')].map((a) => a.getAttribute('href'))
    expect(hrefs).toContain('/tour/student')
    expect(hrefs).toContain('/tour/admin')
  })

  it('강조는 색 면이 아니라 위쪽 선이다 — 색은 판정에만 쓴다 (UI_GUIDE)', async () => {
    const tour = await tourSection()
    const lead = [...tour.querySelectorAll('li')].find(
      (li) => li.querySelector('a[href="/tour/instructor"]'),
    )!
    expect(lead.className).toMatch(/border-t-2/)
    expect(lead.className).not.toMatch(/bg-(point|positive|caution|negative)-bg/)
  })
})
