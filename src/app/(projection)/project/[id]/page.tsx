import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { QrPanel } from '@/components/session/QrPanel'
import { getActor } from '@/lib/auth/actor'
import { loadDataset } from '@/lib/db/dataset'
import { siteUrl } from '@/lib/supabase/env'
import { isClosed } from '@/lib/db/queries'

export const metadata = { title: '교실 투사용 QR' }

/**
 * 교실 프로젝터용 전체화면 QR.
 *
 * **전체화면 단일 요소다.** 네비게이션·사이드바를 같이 띄우지 않는다 —
 * 기준은 "교실 뒤쪽 좌석에서 보이는가"다 (UI_GUIDE 안전규칙 9).
 *
 * 접근 권한: 회차를 가진 기관 담당자, 또는 **배정된** 강사. 배정되지 않은 강사는 볼 수 없다 (ADR-015).
 */
export default async function ProjectionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const actor = await getActor()
  if (!actor) redirect('/login')

  const ds = await loadDataset()
  const session = ds.lectureSessions.find((s) => s.id === id)
  if (!session) notFound()

  const allowed =
    (actor.role === 'org_member' && session.org_id === actor.orgId) ||
    (actor.role === 'instructor' && session.instructor_id === actor.instructorId) ||
    actor.role === 'admin'
  if (!allowed) notFound()

  const closed = isClosed(session)
  const backHref = actor.role === 'instructor' ? '/instructor/sessions' : `/org/sessions/${id}`

  return (
    <div className="flex min-h-dvh flex-col bg-page">
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-6">
        <p className="text-center text-2xl leading-snug font-semibold text-ink sm:text-4xl">
          나에게 맞는 다음 교육을 찾아줘요
        </p>
        <p className="mt-2.5 text-center text-base text-sub sm:text-xl">
          휴대폰으로 QR을 찍거나, 아래 코드를 입력하세요
        </p>

        <div className="mt-7">
          <QrPanel entryCode={session.entry_code} siteUrl={siteUrl()} size="projection" />
        </div>

        <p className="mt-6 text-center text-sm text-sub sm:text-lg">
          {siteUrl().replace(/^https?:\/\//, '')}/s/{session.entry_code}
        </p>

        {closed ? (
          <p className="mt-6 rounded-md border border-caution/30 bg-caution-bg px-5 py-3 text-base text-caution">
            이 회차는 응답이 마감됐습니다. 학생에게는 안내 화면이 보입니다.
          </p>
        ) : null}
      </div>

      {/* 투사 중에는 보이지 않을 만큼 작게, 끝나면 돌아갈 길은 남겨 둔다. */}
      <div className="px-6 pb-4 text-center">
        <Link href={backHref} className="text-xs text-faint hover:text-sub">
          관리 화면으로 돌아가기
        </Link>
      </div>
    </div>
  )
}
