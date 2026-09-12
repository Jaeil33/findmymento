import { redirect } from 'next/navigation'
import { Badge, type BadgeTone } from '@/components/ui/Badge'
import { PageHeader, Panel } from '@/components/ui/Section'
import { EmptyState } from '@/components/ui/EmptyState'
import { getActor } from '@/lib/auth/actor'
import { loadDataset } from '@/lib/db/dataset'
import { gradeBandLabel, inquiryRows } from '@/lib/db/queries'
import { INQUIRY_STATUS_LABEL, type InquiryStatus } from '@/types/domain'
import { assignInquiryAction, markInquiryDelivered, rejectInquiryAction } from '../actions'

export const metadata = { title: '보호자 문의' }

const TONE: Record<InquiryStatus, BadgeTone> = {
  received: 'caution',
  rejected: 'neutral',
  assigned: 'point',
  delivered: 'positive',
  matched: 'positive',
  unmatched: 'neutral',
}

/**
 * 보호자 문의 배정.
 *
 * 이 화면이 다루는 데이터는 **성인 보호자의 실명·연락처**다. 플랫폼이 실제 PII 를 보유하는
 * 유일한 테이블이고, anon 은 INSERT 만 가능하며 SELECT 는 막혀 있다 (ADR-014).
 * 보호자에게는 "영업일 2일 안에 연락"이라고 안내돼 있다 — 그 약속이 여기서 지켜진다.
 */
export default async function AdminInquiriesPage() {
  const actor = await getActor()
  if (!actor || actor.role !== 'admin') redirect('/login')

  const ds = await loadDataset()
  const rows = inquiryRows(ds)
  const open = rows.filter((r) => r.inquiry.status === 'received')
  const inProgress = rows.filter(
    (r) => r.inquiry.status === 'assigned' || r.inquiry.status === 'delivered',
  )
  const closed = rows.filter(
    (r) =>
      r.inquiry.status === 'rejected' ||
      r.inquiry.status === 'matched' ||
      r.inquiry.status === 'unmatched',
  )

  return (
    <div className="space-y-8">
      <PageHeader
        title="보호자 문의"
        description="지역·분야가 맞는 심사 완료 강사에게 배정합니다. 보호자에게는 영업일 2일 안에 연락한다고 안내돼 있습니다."
      />

      <Panel
        title={`배정 대기 ${open.length}건`}
        description="접수 순입니다. 스팸·광고는 반려하세요."
      >
        {open.length === 0 ? (
          <p className="text-sm text-sub">배정 대기 중인 문의가 없습니다.</p>
        ) : (
          <ul className="space-y-5">
            {open.map((r) => (
              <li key={r.inquiry.id} className="rounded-md border border-line bg-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-ink">
                        {r.inquiry.guardian_name} 보호자
                      </span>
                      <Badge tone={TONE[r.inquiry.status]}>
                        {INQUIRY_STATUS_LABEL[r.inquiry.status]}
                      </Badge>
                      <span className="text-xs text-sub tabular-nums">
                        {r.inquiry.created_at.slice(0, 10)}
                      </span>
                    </div>
                    <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm">
                      <div className="flex gap-1.5">
                        <dt className="text-sub">연락처</dt>
                        <dd className="font-medium text-ink">{r.inquiry.guardian_contact}</dd>
                      </div>
                      <div className="flex gap-1.5">
                        <dt className="text-sub">지역</dt>
                        <dd className="text-body">{r.regionLabel}</dd>
                      </div>
                      <div className="flex gap-1.5">
                        <dt className="text-sub">학년대</dt>
                        <dd className="text-body">{gradeBandLabel(r.inquiry.grade_band)}</dd>
                      </div>
                      <div className="flex gap-1.5">
                        <dt className="text-sub">분야</dt>
                        <dd className="text-body">{r.inquiry.field}</dd>
                      </div>
                    </dl>
                    {r.inquiry.message ? (
                      <p className="mt-2.5 max-w-xl rounded-md border border-line bg-muted px-3.5 py-2.5 text-sm leading-relaxed text-body">
                        {r.inquiry.message}
                      </p>
                    ) : null}
                  </div>

                  <div className="w-full max-w-xs space-y-2">
                    {r.candidates.length > 0 ? (
                      <form action={assignInquiryAction} className="space-y-2">
                        <input type="hidden" name="inquiryId" value={r.inquiry.id} />
                        <label className="block space-y-1">
                          <span className="block text-xs font-medium text-body">배정 강사</span>
                          <select
                            name="instructorId"
                            defaultValue={r.candidates[0]?.id}
                            className="block w-full rounded-md border border-line-strong bg-card px-2.5 py-1.5 text-xs text-ink"
                          >
                            {r.candidates.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name} · {c.regionLabel}
                              </option>
                            ))}
                          </select>
                        </label>
                        <button
                          type="submit"
                          className="w-full rounded-lg bg-point px-3 py-2 text-xs font-medium text-white hover:bg-point-hover"
                        >
                          배정하기
                        </button>
                      </form>
                    ) : (
                      <p className="rounded-md border border-caution/25 bg-caution-bg px-3 py-2 text-xs leading-relaxed text-caution">
                        {r.inquiry.field} 분야에 배정할 수 있는 강사가 주변에 없습니다. 미충족 수요로
                        남겨 두고 신규 강사 영업에 씁니다.
                      </p>
                    )}

                    <form action={rejectInquiryAction}>
                      <input type="hidden" name="inquiryId" value={r.inquiry.id} />
                      <button
                        type="submit"
                        className="w-full rounded-lg border border-line-strong bg-card px-3 py-2 text-xs font-medium text-body hover:bg-muted"
                      >
                        반려 (스팸·부적합)
                      </button>
                    </form>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {inProgress.length > 0 ? (
        <Panel title="진행 중" description="강사가 리드를 확인하면 전달 완료로 표시하세요.">
          <ul className="divide-y divide-line">
            {inProgress.map((r) => (
              <li key={r.inquiry.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <p className="text-sm text-ink">
                    {r.inquiry.guardian_name} 보호자
                    <span className="ml-1.5 text-xs text-sub">
                      {r.inquiry.field} · {r.regionLabel}
                    </span>
                  </p>
                  <p className="mt-0.5 text-xs text-sub">
                    배정: {r.assignedName ?? '-'} 강사 · {r.inquiry.created_at.slice(0, 10)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={TONE[r.inquiry.status]}>
                    {INQUIRY_STATUS_LABEL[r.inquiry.status]}
                  </Badge>
                  {r.inquiry.status === 'assigned' ? (
                    <form action={markInquiryDelivered}>
                      <input type="hidden" name="inquiryId" value={r.inquiry.id} />
                      <button
                        type="submit"
                        className="rounded-md border border-line-strong bg-card px-2.5 py-1 text-xs font-medium text-body hover:bg-muted"
                      >
                        전달 완료
                      </button>
                    </form>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      {closed.length > 0 ? (
        <Panel title="종료">
          <ul className="divide-y divide-line">
            {closed.map((r) => (
              <li key={r.inquiry.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <p className="text-sm text-sub">
                  {r.inquiry.guardian_name} 보호자 · {r.inquiry.field} · {r.regionLabel}
                </p>
                <Badge tone={TONE[r.inquiry.status]}>
                  {INQUIRY_STATUS_LABEL[r.inquiry.status]}
                </Badge>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState
          title="아직 접수된 문의가 없습니다"
          description="공개 디렉토리의 문의 폼으로 접수되면 여기 나타납니다."
        />
      ) : null}

      <p className="text-xs leading-relaxed text-sub">
        성사 여부는 플랫폼이 직접 관측할 수 없습니다. 강사에게 확인한 결과를 수동으로 기록합니다.
      </p>
    </div>
  )
}
