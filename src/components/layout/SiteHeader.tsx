import Link from 'next/link'
import { Wordmark } from './Wordmark'
import { SiteMobileMenu, SiteNav, type SiteNavItem } from './SiteNav'

const NAV: SiteNavItem[] = [
  { href: '/programs', label: '프로그램 찾기' },
  { href: '/qna', label: '공개 Q&A' },
  { href: '/#how', label: '이용 방법' },
  { href: '/#safety', label: '안전 원칙' },
]

/**
 * 공개 화면 헤더. 보호자·학교 담당자가 읽는 화면이므로 신뢰감 쪽으로 톤을 맞춘다.
 *
 * 스크롤해도 따라오지만 **반투명·blur 를 쓰지 않는다** (UI_GUIDE 안티패턴) — 불투명 흰 면이다.
 * 문의 버튼은 주체를 보호자로 적는다 (UI_GUIDE 안전규칙 6). 회원가입 버튼은 없다.
 */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-card">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-6 lg:gap-10">
          <Wordmark />
          <SiteNav items={NAV} />
        </div>

        <div className="flex items-center gap-1.5">
          <Link
            href="/login"
            className="hidden rounded-md px-3 py-2 text-sm text-body transition-colors hover:bg-muted hover:text-ink md:inline-block"
          >
            로그인
          </Link>
          <Link
            href="/inquiry"
            className="hidden min-h-10 items-center rounded-lg bg-point px-4 text-sm font-medium text-white transition-colors hover:bg-point-hover sm:inline-flex"
          >
            보호자 문의
          </Link>
          <SiteMobileMenu
            items={[
              ...NAV,
              { href: '/inquiry', label: '보호자 문의 남기기' },
              { href: '/login', label: '담당자·강사 로그인' },
            ]}
          />
        </div>
      </div>
    </header>
  )
}
