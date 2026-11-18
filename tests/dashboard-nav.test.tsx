import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

const nav = vi.hoisted(() => ({ pathname: '/instructor' }))
vi.mock('next/navigation', () => ({ usePathname: () => nav.pathname }))

import { DashboardNav } from '@/components/layout/DashboardNav'
import type { NavItem } from '@/components/layout/DashboardShell'

/**
 * 대시보드 탭 줄.
 *
 * 강사 화면은 탭이 8개다. **지금 어느 탭인지 표시가 없으면** 매일 쓰는 화면에서 길을 잃는다.
 * 공개 헤더(`SiteNav`)는 이미 `aria-current` 를 붙이는데 대시보드만 빠져 있었다.
 *
 * 그리고 스튜디오(ADR-028 의 1순위)와 매칭 화면은 **다른 묶음**이다. 한 줄에 같은 무게로
 * 늘어놓으면 제품의 진입 순서가 화면에서 사라진다. 묶음은 선으로만 나눈다 — 면을 깔거나
 * 색을 쓰지 않는다 (UI_GUIDE: 색이 있으면 판정이다).
 */

const ITEMS: NavItem[] = [
  { href: '/instructor', label: '요약' },
  { href: '/instructor/studio', label: '콘텐츠 스튜디오' },
  { href: '/instructor/sessions', label: '배정 회차', group: 'matching' },
  { href: '/instructor/profile', label: '프로필', group: 'matching' },
]

function current(): string | null {
  const marked = screen.queryAllByRole('link').filter((a) => a.getAttribute('aria-current') === 'page')
  expect(marked.length).toBeLessThanOrEqual(1)
  return marked[0]?.textContent ?? null
}

describe('대시보드 탭 — 현재 위치', () => {
  it('지금 보고 있는 탭 하나에만 aria-current 를 붙인다', () => {
    nav.pathname = '/instructor/studio'
    render(<DashboardNav items={ITEMS} />)
    expect(current()).toBe('콘텐츠 스튜디오')
  })

  it('하위 경로에서도 그 탭이 켜진다 — 산출물 상세에서 스튜디오가 켜져 있어야 한다', () => {
    nav.pathname = '/instructor/studio/sc-2'
    render(<DashboardNav items={ITEMS} />)
    expect(current()).toBe('콘텐츠 스튜디오')
  })

  it('요약(index)은 하위 경로를 가져가지 않는다 — 가장 긴 일치가 이긴다', () => {
    nav.pathname = '/instructor/sessions'
    render(<DashboardNav items={ITEMS} />)
    expect(current()).toBe('배정 회차')
  })

  it('index 경로 그대로일 때만 요약이 켜진다', () => {
    nav.pathname = '/instructor'
    render(<DashboardNav items={ITEMS} />)
    expect(current()).toBe('요약')
  })

  it('어느 탭에도 속하지 않는 경로에서는 아무 탭도 켜지 않는다', () => {
    nav.pathname = '/programs/abc'
    render(<DashboardNav items={ITEMS} />)
    expect(current()).toBeNull()
  })
})

describe('대시보드 탭 — 묶음', () => {
  it('묶음이 바뀌는 자리에 구분선을 하나만 둔다', () => {
    nav.pathname = '/instructor'
    const { container } = render(<DashboardNav items={ITEMS} />)
    expect(container.querySelectorAll('[data-nav-divider]')).toHaveLength(1)
  })

  it('구분선은 읽히지 않는다 — 스크린리더의 탭 목록에 끼어들면 안 된다', () => {
    nav.pathname = '/instructor'
    const { container } = render(<DashboardNav items={ITEMS} />)
    const divider = container.querySelector('[data-nav-divider]')
    expect(divider?.getAttribute('aria-hidden')).toBe('true')
  })

  it('묶음이 하나뿐이면 구분선을 만들지 않는다', () => {
    nav.pathname = '/admin'
    const { container } = render(
      <DashboardNav
        items={[
          { href: '/admin', label: '요약' },
          { href: '/admin/sessions', label: '수업·설문' },
        ]}
      />,
    )
    expect(container.querySelectorAll('[data-nav-divider]')).toHaveLength(0)
  })

  it('탭 전체가 하나의 목록으로 남는다 — 묶음을 나눈다고 nav 를 둘로 쪼개지 않는다', () => {
    nav.pathname = '/instructor'
    render(<DashboardNav items={ITEMS} />)
    expect(screen.getAllByRole('link')).toHaveLength(ITEMS.length)
  })
})
