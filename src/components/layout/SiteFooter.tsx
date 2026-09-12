import Link from 'next/link'
import { isDemoMode } from '@/lib/supabase/env'

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-line bg-card">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <div className="flex flex-wrap justify-between gap-6">
          <div className="max-w-md">
            <p className="text-sm font-semibold text-ink">Find My Mento</p>
            <p className="mt-1.5 text-xs leading-relaxed text-sub">
              지역의 직업인 강사를 학교·기관·개인과 연결합니다. 파일럿 지역은 경기도 광명시입니다.
            </p>
          </div>
          <div className="text-xs">
            <p className="font-medium text-body">안내</p>
            <ul className="mt-2 space-y-1.5 text-sub">
              <li>
                <Link href="/programs" className="hover:text-ink hover:underline">
                  공개 프로그램 디렉토리
                </Link>
              </li>
              <li>
                <Link href="/qna" className="hover:text-ink hover:underline">
                  공개 Q&A
                </Link>
              </li>
              <li>
                <Link href="/login" className="hover:text-ink hover:underline">
                  담당자·강사 로그인
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-8 space-y-2 border-t border-line pt-5 text-xs leading-relaxed text-sub">
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
      </div>
    </footer>
  )
}
