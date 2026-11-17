import Link from 'next/link'
import type { ReactNode } from 'react'
import { Wordmark } from './Wordmark'
import { leaveDemo } from '@/app/(public)/login/actions'

export type NavItem = { href: string; label: string; hint?: string }

/**
 * 기관·강사·운영자 공용 껍데기.
 *
 * **도구처럼 보여야 한다.** 마케팅 랜딩이 아니라 담당자가 업무 시간에 매일 여는 화면이다.
 * 좌측 정렬 `max-w-6xl`, 장식 없음, 숫자와 표가 주인공.
 *
 * 역할은 워드마크 옆에 **배지가 아니라 글자로** 적는다 — 매일 보는 화면에서 색 배지는
 * 판정(검증 통과·실패)에만 남겨 둔다.
 *
 * `demo`·`tour` 는 레이아웃이 넘긴다 (`DemoBar` 와 같은 이유). `demo` 는 데모 시드를 보고 있다는
 * 뜻이고, `tour` 는 로그인 없이 들어온 체험 세션이라는 뜻이다 (ADR-033).
 */
export function DashboardShell({
  roleLabel,
  orgLabel,
  userName,
  nav,
  demo = false,
  tour = false,
  children,
}: {
  roleLabel: string
  orgLabel?: string
  userName: string
  nav: NavItem[]
  demo?: boolean
  tour?: boolean
  children: ReactNode
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b-2 border-ink bg-card">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-2.5 sm:px-6">
          <div className="flex items-baseline gap-2.5">
            <Wordmark />
            <span className="border-l border-line pl-2.5 text-sm font-semibold text-point">
              {roleLabel}
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <span className="text-sub">
              {orgLabel ? <span className="text-body">{orgLabel} · </span> : null}
              {userName}
            </span>
            {demo || tour ? (
              <form action={leaveDemo}>
                <button
                  type="submit"
                  className="rounded-sm border border-line-strong px-2 py-1 font-medium text-body transition-colors hover:bg-muted hover:text-ink"
                >
                  {tour ? '체험 종료' : '역할 바꾸기'}
                </button>
              </form>
            ) : (
              <Link href="/login" className="font-medium text-sub hover:text-ink">
                로그아웃
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* 메뉴는 머리줄과 분리한다 — 매일 쓰는 화면에서 탭은 손이 기억하는 자리에 있어야 한다. */}
      <nav aria-label="대시보드 메뉴" className="border-b border-line bg-card">
        <ul className="mx-auto flex max-w-6xl gap-x-1 overflow-x-auto px-4 sm:px-6">
          {nav.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className="inline-block border-b-2 border-transparent px-3 py-2 text-sm font-medium whitespace-nowrap text-body transition-colors hover:border-line-strong hover:text-ink"
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {demo || tour ? (
        <p className="border-b border-caution/40 bg-caution-bg px-4 py-2 text-center text-xs leading-relaxed text-caution sm:px-6">
          {tour
            ? '체험 모드입니다. 응답·수요 숫자와 AI 문장은 데모 데이터이고, 실제 기관·학생 데이터가 아닙니다. 여기서 만들거나 고친 것은 실제 DB 에 저장되지 않습니다.'
            : '데모 데이터 모드입니다. 화면의 응답·수요 숫자와 AI 문장은 검수용 시연 예시입니다.'}
        </p>
      ) : null}

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">{children}</main>
    </div>
  )
}
