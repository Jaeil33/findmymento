import { redirect } from 'next/navigation'
import { Badge } from '@/components/ui/Badge'
import { PageHeader, Panel } from '@/components/ui/Section'
import { EmptyState } from '@/components/ui/EmptyState'
import { getActor } from '@/lib/auth/actor'
import { loadDataset } from '@/lib/db/dataset'
import { reviewQueue } from '@/lib/db/queries'
import { regionName } from '@/lib/region'
import {
  approveInstructor,
  rejectInstructor,
  restoreInstructor,
  suspendInstructor,
} from '../actions'
import { IconAlert, IconDoc, IconShield } from '@/components/ui/Icons'

export const metadata = { title: '강사 심사' }

const VERIFICATION_LABEL: Record<string, string> = {
  qualification: '자격 증빙',
  criminal_record_check: '성범죄경력 조회 증빙',
  identity: '신분 확인',
}

/**
 * 강사 심사. 자동 조회 API 를 쓰지 않고 **사람이 증빙을 확인한다** (ADR-008).
 * `pending`·`rejected`·`suspended` 강사는 학생·기관·공개 디렉토리 어디에도 노출되지 않는다 (E-11).
 */
export default async function AdminInstructorsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const sp = await searchParams
  const actor = await getActor()
  if (!actor || actor.role !== 'admin') redirect('/login')

  const ds = await loadDataset()
  const queue = reviewQueue(ds)
  const approved = ds.instructors.filter((i) => i.status === 'approved')
  const others = ds.instructors.filter(
    (i) => i.status === 'rejected' || i.status === 'suspended',
  )

  return (
    <div className="space-y-8">
      <PageHeader
        title="강사 심사"
        description="증빙을 직접 확인하고 승인합니다. 승인 전에는 추천·디렉토리·Q&A 어디에도 노출되지 않습니다."
      />

      {sp.error === 'verification' ? (
        <p className="flex items-center gap-2 rounded-md border border-negative/25 bg-negative-bg px-4 py-3 text-sm leading-relaxed text-negative">
          <IconAlert width={16} height={16} className="shrink-0" />
          성범죄경력 조회 증빙이 없어 승인할 수 없습니다. 업체를 경유해 증빙을 먼저 받아 주세요.
        </p>
      ) : null}

      <Panel
        title={`심사 대기 ${queue.length}명`}
        description="증빙 파일은 비공개 버킷에 있고, 여기서 확인 여부만 표시합니다."
      >
        {queue.length === 0 ? (
          <p className="text-sm text-sub">심사 대기 중인 강사가 없습니다.</p>
        ) : (
          <ul className="space-y-5">
            {queue.map((q) => (
              <li key={q.instructor.id} className="rounded-md border border-line bg-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-ink">{q.instructor.name}</span>
                      <Badge tone="caution">심사 대기</Badge>
                    </div>
                    <p className="mt-1 text-xs text-sub">
                      {q.instructor.fields.join(' · ')} · {q.regionLabel} ·{' '}
                      {q.provider?.name ?? '프리랜서'}
                    </p>
                    <p className="mt-2 max-w-xl text-sm leading-relaxed text-body">
                      {q.instructor.bio}
                    </p>

                    <ul className="mt-3 space-y-1.5">
                      {q.verifications.length === 0 ? (
                        <li className="text-xs text-negative">제출된 증빙이 없습니다.</li>
                      ) : (
                        q.verifications.map((v) => (
                          <li key={v.id} className="flex items-center gap-2 text-xs text-body">
                            <IconDoc width={14} height={14} className="shrink-0 text-sub" />
                            {VERIFICATION_LABEL[v.type] ?? v.type}
                            <span className="text-faint">· 비공개 버킷</span>
                          </li>
                        ))
                      )}
                    </ul>

                    {q.hasCriminalRecordCheck ? (
                      <p className="mt-3 flex items-center gap-1.5 text-xs text-positive">
                        <IconShield width={14} height={14} />
                        성범죄경력 조회 증빙 확인됨
                      </p>
                    ) : (
                      <p className="mt-3 flex items-center gap-1.5 text-xs text-negative">
                        <IconAlert width={14} height={14} />
                        성범죄경력 조회 증빙이 없습니다 — 승인 불가
                      </p>
                    )}
                  </div>

                  <div className="flex shrink-0 flex-col gap-2">
                    <form action={approveInstructor}>
                      <input type="hidden" name="instructorId" value={q.instructor.id} />
                      <button
                        type="submit"
                        disabled={!q.hasCriminalRecordCheck}
                        className="w-full rounded-lg bg-point px-4 py-2 text-sm font-medium text-white hover:bg-point-hover disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        승인
                      </button>
                    </form>
                    <form action={rejectInstructor}>
                      <input type="hidden" name="instructorId" value={q.instructor.id} />
                      <button
                        type="submit"
                        className="w-full rounded-lg border border-line-strong bg-card px-4 py-2 text-sm font-medium text-body hover:bg-muted"
                      >
                        반려
                      </button>
                    </form>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title={`심사 완료 ${approved.length}명`} description="공개 디렉토리와 추천에 노출됩니다.">
        {approved.length === 0 ? (
          <EmptyState title="승인된 강사가 없습니다" description="승인 전에는 공개 디렉토리가 비어 있습니다." />
        ) : (
          <ul className="divide-y divide-line">
            {approved.map((i) => (
              <li
                key={i.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
              >
                <div className="min-w-0">
                  <p className="text-sm text-ink">
                    {i.name}
                    <span className="ml-1.5 text-xs text-sub">
                      {i.fields.join('·')} · {regionName(i.region_code)}
                    </span>
                  </p>
                </div>
                <form action={suspendInstructor}>
                  <input type="hidden" name="instructorId" value={i.id} />
                  <button
                    type="submit"
                    className="rounded-md border border-line-strong bg-card px-2.5 py-1 text-xs font-medium text-body hover:bg-muted"
                  >
                    일시 중지
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {others.length > 0 ? (
        <Panel title="반려 · 중지" description="노출되지 않습니다. 사유가 해소되면 복구할 수 있습니다.">
          <ul className="divide-y divide-line">
            {others.map((i) => (
              <li
                key={i.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
              >
                <div className="min-w-0">
                  <p className="text-sm text-ink">
                    {i.name}
                    <span className="ml-1.5 text-xs text-sub">
                      {i.fields.join('·')} · {regionName(i.region_code)}
                    </span>
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={i.status === 'suspended' ? 'caution' : 'neutral'}>
                    {i.status === 'suspended' ? '일시 중지' : '반려'}
                  </Badge>
                  {i.status === 'suspended' ? (
                    <form action={restoreInstructor}>
                      <input type="hidden" name="instructorId" value={i.id} />
                      <button
                        type="submit"
                        className="rounded-md border border-line-strong bg-card px-2.5 py-1 text-xs font-medium text-body hover:bg-muted"
                      >
                        복구
                      </button>
                    </form>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
    </div>
  )
}
