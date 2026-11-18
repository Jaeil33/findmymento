'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/cn'
import type { NavItem } from './DashboardShell'

/**
 * 대시보드 탭 줄. **현재 위치 표시만** 클라이언트에서 한다 — 조회는 하지 않는다
 * (`SiteNav` 와 같은 이유).
 *
 * 매일 여는 화면에서 탭은 손이 기억하는 자리에 있어야 하고, **지금 어디인지**가 보여야 한다.
 * 켜진 탭은 색 면이 아니라 **아래 2px 잉크선**으로 표시한다 — 색은 판정(통과·실패)에만 쓴다.
 *
 * `group: 'matching'` 은 묶음이 바뀌는 자리를 뜻한다. 강사 화면은 스튜디오(ADR-028 의 1순위)와
 * 매칭 화면이 한 줄에 같이 있는데, 같은 무게로 늘어놓으면 제품의 진입 순서가 화면에서 사라진다.
 * 매칭은 지우지 않고 뒤로만 간다 — 그래서 구분은 **선 하나**이고 탭 목록은 그대로 하나다.
 */
function activeHref(pathname: string, items: NavItem[]): string | null {
  // 가장 긴 일치가 이긴다. `/instructor` 가 `/instructor/studio` 를 가져가면 안 된다.
  const matches = items.filter((i) => pathname === i.href || pathname.startsWith(`${i.href}/`))
  if (matches.length === 0) return null
  return matches.reduce((a, b) => (b.href.length > a.href.length ? b : a)).href
}

export function DashboardNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname() ?? '/'
  const active = activeHref(pathname, items)

  return (
    <nav aria-label="대시보드 메뉴" className="border-b border-line bg-card">
      <ul className="mx-auto flex max-w-6xl items-stretch gap-x-1 overflow-x-auto px-4 sm:px-6">
        {items.map((item, i) => {
          const isActive = item.href === active
          // 묶음이 바뀌는 첫 항목 앞에만 선을 세운다. 첫 항목 앞에는 세우지 않는다.
          const previous = i > 0 ? items[i - 1] : undefined
          const divides = previous !== undefined && item.group !== previous.group

          return (
            <li key={item.href} className="flex items-stretch">
              {divides ? (
                <span
                  data-nav-divider
                  aria-hidden="true"
                  className="my-2 mr-1 w-px shrink-0 bg-line"
                />
              ) : null}
              <Link
                href={item.href}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'inline-block border-b-2 px-3 py-2 text-sm whitespace-nowrap transition-colors',
                  isActive
                    ? 'border-ink font-semibold text-ink'
                    : 'border-transparent font-medium text-body hover:border-line-strong hover:text-ink',
                )}
              >
                {item.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
