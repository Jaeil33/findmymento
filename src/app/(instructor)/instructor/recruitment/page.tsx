import { redirect } from 'next/navigation'
import { Badge, type BadgeTone } from '@/components/ui/Badge'
import { PageHeader, Panel } from '@/components/ui/Section'
import { EmptyState } from '@/components/ui/EmptyState'
import { getActor } from '@/lib/auth/actor'
import { loadDataset } from '@/lib/db/dataset'
import { recruitmentForInstructor } from '@/lib/db/queries'
import { RECRUITMENT_STATUS_LABEL, type RecruitmentStatus } from '@/types/domain'
import { respondToRecruitment } from '../actions'

export const metadata = { title: '섭외 요청' }

const TONE: Record<RecruitmentStatus, BadgeTone> = {
  sent: 'caution',
  accepted: 'positive',
  declined: 'neutral',
  expired: 'neutral',
}

export default async function InstructorRecruitmentPage() {
  const actor = await getActor()
  if (!actor || actor.role !== 'instructor') redirect('/login')

  const ds = await loadDataset()
  const rows = recruitmentForInstructor(ds, actor.instructorId)
  const pending = rows.filter((r) => r.request.status === 'sent')
  const done = rows.filter((r) => r.request.status !== 'sent')

  return (
    <div className="space-y-8">
      <PageHeader
        title="섭외 요청"
        description="기관·학교가 수요를 확인한 뒤 보낸 과정 개설 요청입니다. 수락하면 기관 담당자가 일정·장소를 협의합니다."
      />

      {rows.length === 0 ? (
        <EmptyState
          title="아직 받은 요청이 없습니다"
          description="배정된 회차에서 수요가 모이면 기관이 요청을 보냅니다. 지역 수요 화면에서 지금 어떤 분야에 수요가 있는지 볼 수 있습니다."
        />
      ) : null}

      {pending.length > 0 ? (
        <Panel title="응답 대기" description="기관이 답을 기다리고 있습니다.">
          <ul className="space-y-4">
            {pending.map((r) => (
              <li key={r.request.id} className="rounded-md border border-caution/25 bg-caution-bg p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink">{r.orgName}</p>
                    <p className="mt-0.5 text-xs text-sub">{r.orgRegion}</p>
                    <p className="mt-2 text-sm text-body">
                      {r.request.field} · 수요{' '}
                      <span className="font-semibold text-ink tabular-nums">
                        {r.request.demand_count}명
                      </span>
                    </p>
                    {r.request.note ? (
                      <p className="mt-2 max-w-xl rounded-md bg-card px-3 py-2 text-sm leading-relaxed text-body">
                        {r.request.note}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex shrink-0 flex-col gap-2">
                    <form action={respondToRecruitment}>
                      <input type="hidden" name="requestId" value={r.request.id} />
                      <input type="hidden" name="accept" value="true" />
                      <button
                        type="submit"
                        className="w-full rounded-lg bg-point px-4 py-2 text-sm font-medium text-white hover:bg-point-hover"
                      >
                        수락
                      </button>
                    </form>
                    <form action={respondToRecruitment}>
                      <input type="hidden" name="requestId" value={r.request.id} />
                      <input type="hidden" name="accept" value="false" />
                      <button
                        type="submit"
                        className="w-full rounded-lg border border-line-strong bg-card px-4 py-2 text-sm font-medium text-body hover:bg-muted"
                      >
                        거절
                      </button>
                    </form>
                  </div>
                </div>
                <p className="mt-3 text-xs leading-relaxed text-caution">
                  거절하셔도 괜찮습니다. 기관에는 같은 분야 다른 강사가 바로 제안되고, 대체 강사가
                  없으면 미충족 수요로 기록됩니다.
                </p>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      {done.length > 0 ? (
        <Panel title="지난 요청">
          <ul className="divide-y divide-line">
            {done.map((r) => (
              <li key={r.request.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <p className="text-sm text-ink">
                    {r.orgName}
                    <span className="ml-1.5 text-xs text-sub">
                      {r.request.field} · 수요 {r.request.demand_count}명
                    </span>
                  </p>
                  <p className="mt-0.5 text-xs text-sub tabular-nums">
                    {r.request.created_at.slice(0, 10)}
                  </p>
                </div>
                <Badge tone={TONE[r.request.status as RecruitmentStatus]}>
                  {RECRUITMENT_STATUS_LABEL[r.request.status as RecruitmentStatus]}
                </Badge>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
    </div>
  )
}
