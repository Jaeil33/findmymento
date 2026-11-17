import Link from 'next/link'
import { Wordmark } from '@/components/layout/Wordmark'
import { DemoBar } from '@/components/layout/DemoBar'
import { tourActive } from '@/lib/demo/mode'
import { isDemoMode } from '@/lib/supabase/env'

/**
 * 학생 화면 껍데기. 본문 폭은 **각 페이지가 정한다** — 설문은 `max-w-md` 단일 컬럼,
 * 공개 Q&A 는 보호자·강사도 읽으므로 더 넓다.
 * 네비게이션은 최소로 둔다. 특강 직후 산만한 교실에서 쓰는 화면이다.
 */
export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const demo = isDemoMode()
  const tour = demo ? false : await tourActive()

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b-2 border-ink bg-card">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3 sm:px-6">
          <Wordmark className="text-sm" />
          <nav className="flex items-center gap-3 text-xs">
            <Link href="/qna" className="font-medium text-body hover:text-point">
              공개 Q&amp;A
            </Link>
            <Link href="/programs" className="font-medium text-body hover:text-point">
              프로그램
            </Link>
          </nav>
        </div>
      </header>
      <DemoBar demo={demo} tour={tour} />
      <main className="flex-1">{children}</main>
    </div>
  )
}
