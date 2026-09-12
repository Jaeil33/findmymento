import { redirect } from 'next/navigation'
import { Badge, type BadgeTone } from '@/components/ui/Badge'
import { PageHeader, Panel } from '@/components/ui/Section'
import { EmptyState } from '@/components/ui/EmptyState'
import { getActor } from '@/lib/auth/actor'
import { loadDataset } from '@/lib/db/dataset'
import { interestRows } from '@/lib/db/queries'
import { INTEREST_STATUS_LABEL, type InterestStatus } from '@/types/domain'
import { recordConsentAction, setInterest } from '../actions'

export const metadata = { title: '관심 표현' }

const TONE: Record<InterestStatus, BadgeTone> = {
  expressed: 'caution',
  org_review: 'caution',
  rejected: 'neutral',
  consent_pending: 'caution',
  consent_denied: 'neutral',
  recruiting: 'point',
  connected: 'positive',
}

/**
 * 관심 표현 검토.
 *
 * 학생은 가명으로만 표시된다 — 가명코드 원문을 화면에 노출하지 않는다 (UI_GUIDE 안전규칙 2).
 * 반려해도 수요 집계에는 남는다 (E-14). 동의는 플랫폼이 받는 게 아니라 기관이 받은 결과를
 * **기록**하는 것이다 (UC-20).
 */
export default async function OrgInterestsPage() {
  const actor = await getActor()
  if (!actor || actor.role !== 'org_member') redirect('/login')

  const ds = await loadDataset()
  const rows = interestRows(ds, actor.orgId)

  const groups: { key: string; title: string; description: string; items: typeof rows }[] = [
    {
      key: 'review',
      title: '검토 대기',
      description: '학생이 더 배우고 싶다고 표현했습니다. 수요와 적합성을 확인해 주세요.',
      items: rows.filter((r) => r.status === 'expressed' || r.status === 'org_review'),
    },
    {
      key: 'consent',
      title: '보호자 동의 기록 대기',
      description:
        '승인한 건입니다. 보호자에게 받은 동의 결과를 기록해 주세요. 플랫폼이 동의를 받는 것이 아니라, 기관이 받은 결과를 남기는 단계입니다.',
      items: rows.filter((r) => r.status === 'consent_pending'),
    },
    {
      key: 'progress',
      title: '진행 중 · 완료',
      description: '섭외로 넘어간 건과 연결이 끝난 건입니다.',
      items: rows.filter((r) => r.status === 'recruiting' || r.status === 'connected'),
    },
    {
      key: 'closed',
      title: '종료',
      description: '반려·동의 거부로 종료된 건입니다. 수요 집계에는 그대로 남습니다.',
      items: rows.filter((r) => r.status === 'rejected' || r.status === 'consent_denied'),
    },
  ]

  return (
    <div className="space-y-8">
      <PageHeader
        title="관심 표현"
        description="학생이 추천 화면에서 '더 배우고 싶어요'를 누른 건입니다. 강사에게는 아직 아무것도 전달되지 않았습니다."
      />

      {rows.length === 0 ? (
        <EmptyState
          title="아직 관심 표현이 없습니다"
          description="학생이 설문을 마치고 추천 카드에서 '더 배우고 싶어요'를 누르면 여기에 모입니다."
        />
      ) : (
        groups
          .filter((g) => g.items.length > 0)
          .map((group) => (
            <Panel key={group.key} title={group.title} description={group.description}>
              <ul className="divide-y divide-line">
                {group.items.map((row) => (
                  <li key={row.id} className="py-4 first:pt-0 last:pb-0">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium text-ink">{row.alias}</span>
                          <Badge tone={TONE[row.status as InterestStatus]}>
                            {INTEREST_STATUS_LABEL[row.status as InterestStatus]}
                          </Badge>
                          {row.consentRecorded ? <Badge tone="positive">동의 기록됨</Badge> : null}
                        </div>
                        <p className="mt-1.5 text-sm text-body">
                          {row.targetLabel}
                          <span className="text-sub"> · {row.instructorName} 강사</span>
                        </p>
                        <p className="mt-0.5 text-xs text-sub">
                          {row.sessionTitle} · {row.createdAt.slice(0, 10)}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {(row.status === 'expressed' || row.status === 'org_review') && (
                          <>
                            <StatusButton
                              interestId={row.id}
                              status="consent_pending"
                              label="승인 · 동의 요청"
                              variant="primary"
                            />
                            <StatusButton
                              interestId={row.id}
                              status="rejected"
                              label="반려"
                              variant="secondary"
                            />
                          </>
                        )}

                        {row.status === 'consent_pending' && (
                          <>
                            <form action={recordConsentAction} className="flex items-center gap-2">
                              <input type="hidden" name="interestId" value={row.id} />
                              <select
                                name="method"
                                defaultValue="paper"
                                aria-label="동의 확인 방법"
                                className="rounded-md border border-line-strong bg-card px-2.5 py-1.5 text-xs text-body"
                              >
                                <option value="paper">서면</option>
                                <option value="phone">전화</option>
                                <option value="messenger">문자·메신저</option>
                              </select>
                              <button
                                type="submit"
                                className="rounded-lg bg-point px-3 py-1.5 text-xs font-medium text-white hover:bg-point-hover"
                              >
                                동의 기록
                              </button>
                            </form>
                            <StatusButton
                              interestId={row.id}
                              status="consent_denied"
                              label="동의 거부"
                              variant="secondary"
                            />
                          </>
                        )}

                        {row.status === 'recruiting' && (
                          <StatusButton
                            interestId={row.id}
                            status="connected"
                            label="연결 완료로 표시"
                            variant="secondary"
                          />
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </Panel>
          ))
      )}

      <p className="text-xs leading-relaxed text-sub">
        반려한 건도 수요 집계에는 남습니다. 관심이 있었다는 사실 자체가 다음 과정 편성의 근거이기
        때문입니다.
      </p>
    </div>
  )
}

function StatusButton({
  interestId,
  status,
  label,
  variant,
}: {
  interestId: string
  status: InterestStatus
  label: string
  variant: 'primary' | 'secondary'
}) {
  return (
    <form action={setInterest}>
      <input type="hidden" name="interestId" value={interestId} />
      <input type="hidden" name="status" value={status} />
      <button
        type="submit"
        className={
          variant === 'primary'
            ? 'rounded-lg bg-point px-3 py-1.5 text-xs font-medium text-white hover:bg-point-hover'
            : 'rounded-lg border border-line-strong bg-card px-3 py-1.5 text-xs font-medium text-body hover:bg-muted'
        }
      >
        {label}
      </button>
    </form>
  )
}
