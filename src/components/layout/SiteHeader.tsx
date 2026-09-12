import Link from 'next/link'
import { Wordmark } from './Wordmark'

const NAV = [
  { href: '/programs', label: '프로그램 찾기' },
  { href: '/qna', label: '공개 Q&A' },
  { href: '/inquiry', label: '문의 남기기' },
]

/** 공개 화면 헤더. 보호자·학교 담당자가 읽는 화면이므로 신뢰감 쪽으로 톤을 맞춘다. */
export function SiteHeader() {
  return (
    <header className="border-b border-line bg-card">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3.5 sm:px-6">
        <Wordmark />
        <nav aria-label="주요 메뉴" className="flex items-center gap-1 text-sm">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-md px-2.5 py-1.5 text-body transition-colors hover:bg-muted hover:text-ink"
            >
              {item.label}
            </Link>
          ))}
          <Link
            href="/login"
            className="ml-1 rounded-md border border-line-strong px-2.5 py-1.5 text-body transition-colors hover:bg-muted"
          >
            로그인
          </Link>
        </nav>
      </div>
    </header>
  )
}
