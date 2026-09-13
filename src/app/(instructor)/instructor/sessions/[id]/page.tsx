import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { buttonClass } from '@/components/ui/Button'
import { PageHeader, Panel } from '@/components/ui/Section'
import { SessionReportView } from '@/components/report/SessionReportView'
import { SessionDebriefAssist } from '@/components/lesson/SessionDebriefAssist'
import { QrPanel } from '@/components/session/QrPanel'
import { demoAiEnabled } from '@/lib/ai/demo-writer'
import { getActor } from '@/lib/auth/actor'
import { loadDataset } from '@/lib/db/dataset'
import { gradeBandLabel, isClosed, sessionReport, supplyByField } from '@/lib/db/queries'
import { siteUrl } from '@/lib/supabase/env'
import { IconArrowLeft, IconQr } from '@/components/ui/Icons'

/**
 * 배정 회차 리포트. 학교·기관에 제출하는 산출물이다 (UC-29).
 *
 * **집계치만 보인다.** 학생 가명코드 단위 원본 응답은 이 화면에 오지 않는다 —
 * 실 DB 에서는 RLS 가 막고, 여기서는 `sessionReport()` 가 집계만 내보낸다.
 */
export default async function InstructorSessionReportPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const actor = await getActor()
  if (!actor || actor.role !== 'instructor') redirect('/login')

  const ds = await loadDataset()
  // 배정되지 않은 회차는 존재 자체를 알려주지 않는다 (ADR-015, E-23).
  const session = ds.lectureSessions.find(
    (s) => s.id === id && s.instructor_id === actor.instructorId,
  )
  if (!session) notFound()

  const report = sessionReport(ds, id)
  if (!report) notFound()

  const org = ds.organizations.find((o) => o.id === session.org_id)
  const closed = isClosed(session)

  return (
    <div className="space-y-8">
      <Link
        href="/instructor/sessions"
        className="inline-flex items-center gap-1.5 text-sm text-sub hover:text-ink"
      >
        <IconArrowLeft width={16} height={16} />
        배정 회차
      </Link>

      <PageHeader
        eyebrow={`${session.field} · ${gradeBandLabel(session.grade_band)}`}
        title={session.title}
        description={
          <>
            {org?.name} · {session.held_on} 진행 ·{' '}
            {closed ? '응답 마감' : `응답 수집 중 (마감 ${session.closes_at.slice(0, 10)})`}
          </>
        }
        actions={
          <>
            <Link href={`/instructor/sessions/${session.id}/plan`} className={buttonClass()}>
              수업 설계 도우미
            </Link>
            <Link href={`/project/${session.id}`} className={buttonClass({ variant: 'secondary' })}>
              <IconQr width={16} height={16} />
              교실에 QR 띄우기
            </Link>
          </>
        }
      />

      <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto]">
        <Panel
          title="이 리포트의 범위"
          description="학교·기관에 제출할 수 있는 집계 자료입니다."
        >
          <ul className="space-y-2 text-sm leading-relaxed text-body">
            <li>· 응답 수, 만족도·후속 의향 분포, 분야별 관심, 참여 가능 시간</li>
            <li>· 학생이 직접 쓴 문장 (개인정보로 보이는 부분은 저장 전에 가려짐)</li>
            <li className="text-sub">
              · 학생 단위 원본 응답과 가명코드는 <strong className="font-semibold">보이지 않습니다</strong>{' '}
              — 기관만 열람합니다
            </li>
          </ul>
        </Panel>

        <Panel title="이 반의 조건" description="기관이 입력한 값입니다.">
          <ul className="space-y-2 text-sm leading-relaxed text-body">
            <li>
              · {session.expected_students}명 · {session.duration_minutes}분 · {session.venue}
            </li>
            <li>· 장비: {session.equipment.length > 0 ? session.equipment.join(', ') : '미입력'}</li>
            {session.class_traits.length > 0 && (
              <li className="font-medium text-ink">· {session.class_traits.join(' · ')}</li>
            )}
          </ul>
        </Panel>

        <Panel title="입장 QR" className="lg:w-72">
          <QrPanel entryCode={session.entry_code} siteUrl={siteUrl()} />
        </Panel>
      </section>

      <section>
        <h2 className="mb-4 text-lg font-semibold tracking-tight text-ink">회차 리포트</h2>
        <SessionReportView report={report} supplyByField={supplyByField(ds, org?.region_code)} />
      </section>

      {/* 수업 후 AI (ADR-024). 강사 자신을 위한 회고이며 저장하지 않는다. */}
      <section id="post-session-ai" className="scroll-mt-6">
        <h2 className="text-lg font-semibold tracking-tight text-ink">수업 후 AI 도우미</h2>
        <p className="mt-1 mb-4 text-sm text-sub">
          응답 집계로 회고와 학교 제출용 요약 초안을 만듭니다. 아무것도 저장하지 않습니다.
        </p>
        <SessionDebriefAssist sessionId={session.id} demoAi={demoAiEnabled()} />
      </section>
    </div>
  )
}
