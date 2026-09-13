'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/cn'
import { IconMenu } from '@/components/ui/Icons'

export type SiteNavItem = { href: string; label: string }

/** `/programs/abc` 에서도 `프로그램 찾기` 가 켜진다. 해시 링크(`/#how`)는 켜지지 않는다. */
function isActive(pathname: string, href: string): boolean {
  if (href.includes('#')) return false
  if (href === '/') return pathname === '/'
  return pathname === href || pathname.startsWith(`${href}/`)
}

/** 데스크톱 메뉴. 경로 표시(aria-current)만 클라이언트에서 한다 — 조회는 하지 않는다. */
export function SiteNav({ items }: { items: SiteNavItem[] }) {
  const pathname = usePathname() ?? '/'

  return (
    <nav aria-label="주요 메뉴" className="hidden items-center gap-0.5 md:flex">
      {items.map((item) => {
        const active = isActive(pathname, item.href)
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'rounded-md px-3 py-2 text-sm transition-colors',
              active ? 'font-semibold text-ink' : 'text-body hover:bg-muted hover:text-ink',
            )}
          >
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}

/**
 * 모바일 메뉴. `<details>` 로 여닫아 JS 상태를 두지 않는다.
 * 경로가 바뀌면 `key` 로 다시 마운트해 닫힌 상태로 돌아간다.
 */
export function SiteMobileMenu({ items }: { items: SiteNavItem[] }) {
  const pathname = usePathname() ?? '/'

  return (
    <details key={pathname} className="group relative md:hidden">
      <summary className="flex min-h-10 cursor-pointer list-none items-center gap-1.5 rounded-lg border border-line-strong px-3 text-sm text-body transition-colors hover:bg-muted [&::-webkit-details-marker]:hidden">
        <IconMenu width={16} height={16} />
        메뉴
      </summary>
      <nav
        aria-label="모바일 메뉴"
        className="absolute top-[calc(100%+0.5rem)] right-0 z-50 w-60 rounded-lg border border-line bg-card p-1.5 shadow-lg"
      >
        {items.map((item) => {
          const active = isActive(pathname, item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'block rounded-md px-3 py-2.5 text-sm transition-colors',
                active ? 'bg-point-bg font-semibold text-point' : 'text-body hover:bg-muted hover:text-ink',
              )}
            >
              {item.label}
            </Link>
          )
        })}
      </nav>
    </details>
  )
}
