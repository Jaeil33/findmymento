import Link from 'next/link'
import { isDemoMode } from '@/lib/supabase/env'
import { Wordmark } from './Wordmark'
import { IconMapPin } from '@/components/ui/Icons'

const COLUMNS: { title: string; links: { href: string; label: string }[] }[] = [
  {
    title: '찾기',
    links: [
      { href: '/programs', label: '프로그램 찾기' },
      { href: '/qna', label: '공개 Q&A' },
      { href: '/inquiry', label: '보호자 문의' },
    ],
  },
  {
    title: '담당자 · 강사',
    links: [
      { href: '/login', label: '로그인' },
      { href: '/#how', label: '이용 방법' },
      { href: '/#who', label: '대상별 안내' },
    ],
  },
  {
    title: '안내',
    links: [
      { href: '/#safety', label: '안전 원칙' },
      { href: '/#faq', label: '자주 묻는 질문' },
    ],
  },
]

/** 공개 화면 푸터. 연락처·주소 영역을 두지 않는다 — 문의는 보호자 문의 폼과 공개 Q&A 로만 받는다. */
export function SiteFooter() {
  return (
    <footer className="mt-20 border-t border-line bg-card">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="grid gap-10 md:grid-cols-[minmax(0,1.5fr)_repeat(3,minmax(0,1fr))]">
          <div>
            <Wordmark />
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-sub">
              지역의 직업인 강사를 학교·기관·개인과 연결합니다.
            </p>
            <p className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1 text-xs text-body">
              <IconMapPin width={13} height={13} className="text-point" />
              파일럿 지역 · 경기도 광명시
            </p>
          </div>

          {COLUMNS.map((col) => (
            <div key={col.title}>
              <p className="text-sm font-semibold text-ink">{col.title}</p>
              <ul className="mt-3 space-y-2.5 text-sm">
                {col.links.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className="text-sub transition-colors hover:text-ink">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col gap-4 border-t border-line pt-6 text-xs leading-relaxed text-sub md:flex-row md:justify-between md:gap-10">
          <div className="space-y-1.5">
            <p>
              계정은 초대로만 만들어집니다. 공개 회원가입이 없고, 보호자는 계정 없이 문의만 남깁니다.
            </p>
            <p>
              학생의 실명·연락처·학교를 저장하지 않습니다. 학생 식별은 기관이 발급한 가명코드만
              사용합니다.
            </p>
            {isDemoMode() ? (
              <p className="text-caution">
                지금은 데모 데이터 모드입니다. 화면의 숫자·이름은 검수용 예시이고 실제 응답이 아닙니다.
              </p>
            ) : null}
          </div>
          <p className="shrink-0">© 2026 Find My Mento</p>
        </div>
      </div>
    </footer>
  )
}
