import { redirect } from 'next/navigation'
import { Badge } from '@/components/ui/Badge'
import { PageHeader, Panel } from '@/components/ui/Section'
import { EmptyState } from '@/components/ui/EmptyState'
import { getActor } from '@/lib/auth/actor'
import { loadDataset } from '@/lib/db/dataset'
import { gradeBandLabel, instructorLeads } from '@/lib/db/queries'
import { regionName } from '@/lib/region'
import { INQUIRY_STATUS_LABEL } from '@/types/domain'

export const metadata = { title: '문의 리드' }

/**
 * 전달받은 보호자 문의. `assigned_instructor_id` 가 자기인 것만 보인다 (UC-33).
 *
 * 여기 보이는 연락처는 **성인 보호자 본인의** 것이다. 학생 정보는 학년대까지만 있다 (ADR-014).
 */
export default async function InstructorLeadsPage() {
  const actor = await getActor()
  if (!actor || actor.role !== 'instructor') redirect('/login')

  const ds = await loadDataset()
  const leads = instructorLeads(ds, actor.instructorId)

  return (
    <div className="space-y-8">
      <PageHeader
        title="문의 리드"
        description="공개 디렉토리에서 보호자가 남긴 문의 중 운영자가 강사님께 배정한 건입니다. 알려주신 연락처로 직접 연락하시면 됩니다."
      />

      {leads.length === 0 ? (
        <EmptyState
          title="아직 배정된 문의가 없습니다"
          description="보호자가 디렉토리에서 문의를 남기면 운영자가 지역·분야를 확인해 배정합니다. 프로필과 프로그램 설명이 구체적일수록 배정될 가능성이 높습니다."
        />
      ) : (
        <Panel footer="수강료와 일정은 플랫폼 밖에서 보호자와 직접 정하시면 됩니다. 결제를 중개하지 않습니다.">
          <ul className="divide-y divide-line">
            {leads.map((q) => {
              const program = q.target_id ? ds.programs.find((p) => p.id === q.target_id) : undefined
              return (
                <li key={q.id} className="py-4 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-ink">{q.guardian_name} 보호자</span>
                        <Badge tone={q.status === 'delivered' ? 'positive' : 'caution'}>
                          {INQUIRY_STATUS_LABEL[q.status]}
                        </Badge>
                      </div>
                      <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm">
                        <div className="flex gap-1.5">
                          <dt className="text-sub">연락처</dt>
                          <dd className="font-medium text-ink">{q.guardian_contact}</dd>
                        </div>
                        <div className="flex gap-1.5">
                          <dt className="text-sub">지역</dt>
                          <dd className="text-body">{regionName(q.region_code)}</dd>
                        </div>
                        <div className="flex gap-1.5">
                          <dt className="text-sub">학년대</dt>
                          <dd className="text-body">{gradeBandLabel(q.grade_band)}</dd>
                        </div>
                        <div className="flex gap-1.5">
                          <dt className="text-sub">분야</dt>
                          <dd className="text-body">{q.field}</dd>
                        </div>
                      </dl>
                      {program ? (
                        <p className="mt-1.5 text-xs text-sub">문의 대상: {program.title}</p>
                      ) : null}
                      {q.message ? (
                        <p className="mt-2.5 max-w-xl rounded-md border border-line bg-muted px-3.5 py-2.5 text-sm leading-relaxed text-body">
                          {q.message}
                        </p>
                      ) : null}
                    </div>
                    <p className="shrink-0 text-xs text-sub tabular-nums">
                      {q.created_at.slice(0, 10)}
                    </p>
                  </div>
                </li>
              )
            })}
          </ul>
        </Panel>
      )}

      <p className="text-xs leading-relaxed text-sub">
        학생 본인의 이름·학교·생년월일은 수집하지 않습니다. 아이에 대해 아는 정보는 학년대와 관심
        분야까지입니다.
      </p>
    </div>
  )
}
