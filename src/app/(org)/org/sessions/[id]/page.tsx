import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { Badge } from '@/components/ui/Badge'
import { buttonClass } from '@/components/ui/Button'
import { PageHeader, Panel } from '@/components/ui/Section'
import { SessionReportView } from '@/components/report/SessionReportView'
import { ResultReportAssist } from '@/components/report/ResultReportAssist'
import { FollowupPlanAssist } from '@/components/report/FollowupPlanAssist'
import { QrPanel } from '@/components/session/QrPanel'
import { getActor } from '@/lib/auth/actor'
import { loadDataset } from '@/lib/db/dataset'
import {
  approvedInstructors,
  gradeBandLabel,
  isClosed,
  sessionReport,
  supplyByField,
} from '@/lib/db/queries'
import { siteUrl } from '@/lib/supabase/env'
import { regionName } from '@/lib/region'
import { assignInstructor, toggleSessionStatus } from '../../actions'
import { IconArrowLeft, IconQr } from '@/components/ui/Icons'

export default async function OrgSessionReportPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const actor = await getActor()
  if (!actor || actor.role !== 'org_member') redirect('/login')

  const ds = await loadDataset()
  const session = ds.lectureSessions.find((s) => s.id === id && s.org_id === actor.orgId)
  if (!session) notFound()

  const report = sessionReport(ds, id)
  if (!report) notFound()

  const org = ds.organizations.find((o) => o.id === session.org_id)
  const closed = isClosed(session)
  const instructors = approvedInstructors(ds)
  // 발주 기관은 자기 회차의 교안을 열람한다 — 어떤 수업이 들어오는지 사전에 확인할 수 있어야
  // 하고, 그것이 기관 쪽 가치의 일부다 (ADR-019). 다른 기관의 교안은 RLS 가 막는다.
  const plan = ds.lessonPlans.find((p) => p.session_id === session.id) ?? null

  return (
    <div className="space-y-8">
      <Link
        href="/org/sessions"
        className="inline-flex items-center gap-1.5 text-sm text-sub hover:text-ink"
      >
        <IconArrowLeft width={16} height={16} />
        회차 목록
      </Link>

      <PageHeader
        eyebrow={`${session.field} · ${gradeBandLabel(session.grade_band)}`}
        title={session.title}
        description={
          <>
            {org?.name} · {session.held_on} 진행 · 응답 마감 {session.closes_at.slice(0, 10)}
          </>
        }
        actions={
          <>
            <Link
              href={`/project/${session.id}`}
              className={buttonClass({ variant: 'secondary' })}
            >
              <IconQr width={16} height={16} />
              교실에 QR 띄우기
            </Link>
            <Link
              href={`/org/sessions/${session.id}/codes`}
              className={buttonClass({ variant: 'secondary' })}
            >
              가명코드 발급·인쇄
            </Link>
          </>
        }
      />

      <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto]">
        <div className="space-y-5">
          <Panel title="배정 강사" description="배정된 강사만 이 회차의 QR 화면과 리포트를 볼 수 있습니다.">
            <form action={assignInstructor} className="flex flex-wrap items-end gap-3">
              <input type="hidden" name="sessionId" value={session.id} />
              <label className="min-w-56 flex-1 space-y-1.5">
                <span className="block text-sm font-medium text-body">강사</span>
                <select
                  name="instructorId"
                  defaultValue={session.instructor_id ?? ''}
                  className="block w-full rounded-lg border border-line-strong bg-card px-4 py-2.5 text-sm text-ink focus:border-point focus:ring-1 focus:ring-point focus:outline-none"
                >
                  <option value="">미배정</option>
                  {instructors.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name} · {i.fields.join('·')} · {regionName(i.region_code)}
                    </option>
                  ))}
                </select>
              </label>
              <button type="submit" className={buttonClass({ variant: 'primary' })}>
                저장
              </button>
            </form>

            {session.instructor_id === null ? (
              <p className="mt-3 rounded-md border border-caution/25 bg-caution-bg px-3.5 py-2.5 text-xs leading-relaxed text-caution">
                이 회차는 배정 강사가 없습니다. 강사가 수업 마무리에 QR을 안내하지 못하면 응답은 거의
                모이지 않습니다.
              </p>
            ) : null}
          </Panel>

          <Panel title="응답 수집" description="마감 후 제출은 거부되고 학생에게는 안내 화면이 보입니다.">
            <div className="flex flex-wrap items-center gap-3">
              {closed ? <Badge>마감</Badge> : <Badge tone="positive">수집 중</Badge>}
              <form action={toggleSessionStatus}>
                <input type="hidden" name="sessionId" value={session.id} />
                <button type="submit" className={buttonClass({ variant: 'secondary' })}>
                  {session.status === 'open' ? '지금 마감하기' : '다시 열기'}
                </button>
              </form>
              <p className="text-xs text-sub">
                마감일({session.closes_at.slice(0, 10)})이 지나면 자동으로 마감됩니다.
              </p>
            </div>
          </Panel>
        </div>

        <Panel title="입장 QR" className="lg:w-80">
          <QrPanel entryCode={session.entry_code} siteUrl={siteUrl()} />
          <p className="mt-4 text-xs leading-relaxed text-sub">
            교실 프로젝터에는{' '}
            <Link href={`/project/${session.id}`} className="text-point underline underline-offset-4">
              투사용 전체화면
            </Link>
            을 쓰세요. 뒤쪽 좌석에서도 보이도록 QR과 코드를 크게 띄웁니다.
          </p>
        </Panel>
      </section>

      <section>
        <h2 className="mb-4 text-lg font-semibold tracking-tight text-ink">강사 교안</h2>
        {plan ? (
          <Panel
            title={plan.title}
            description={`${plan.steps.reduce((a, s) => a + s.minutes, 0)}분 · ${
              plan.source === 'llm' ? 'AI 초안을 강사가 확인함' : '기본 템플릿'
            }`}
          >
            <ol className="space-y-3 text-sm leading-relaxed text-body">
              {plan.steps.map((step, i) => (
                <li key={`${step.phase}-${i}`}>
                  <span className="font-medium text-ink">
                    [{step.phase}] {step.title} · {step.minutes}분
                  </span>
                  <br />
                  {step.base}
                  {step.accommodations.length > 0 && (
                    <span className="mt-1 block text-xs text-caution">
                      {step.accommodations.map((a) => `${a.trait}: ${a.how}`).join(' / ')}
                    </span>
                  )}
                </li>
              ))}
            </ol>
          </Panel>
        ) : (
          <Panel title="아직 교안이 없습니다">
            <p className="text-sm leading-relaxed text-body">
              배정된 강사가 수업 설계 도우미로 초안을 만들면 여기에 표시됩니다. 어떤 수업이
              들어오는지 사전에 확인하실 수 있습니다.
            </p>
          </Panel>
        )}
      </section>

      <section>
        <h2 className="mb-4 text-lg font-semibold tracking-tight text-ink">회차 리포트</h2>
        <SessionReportView
          report={report}
          supplyByField={supplyByField(ds, org?.region_code)}
        />
      </section>

      {/* 수업 후 AI (ADR-024). 초안은 저장하지 않는다 — 기관 요약 화면이 이 앵커로 바로 데려온다. */}
      <section id="post-session-ai" className="scroll-mt-6">
        <h2 className="text-lg font-semibold tracking-tight text-ink">수업 후 AI 도우미</h2>
        <p className="mt-1 mb-4 text-sm text-sub">
          회차가 끝나면 응답 집계로 보고서·후속 과정·섭외 문안 초안을 만듭니다. 숫자는 집계값 그대로
          쓰고, 아무것도 저장하지 않습니다.
        </p>
        <div className="grid items-start gap-5 xl:grid-cols-2">
          <ResultReportAssist sessionId={session.id} />
          <FollowupPlanAssist sessionId={session.id} />
        </div>
      </section>
    </div>
  )
}
