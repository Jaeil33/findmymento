import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Badge, type BadgeTone } from '@/components/ui/Badge'
import { PageHeader, Panel, FactNote } from '@/components/ui/Section'
import { EmptyState } from '@/components/ui/EmptyState'
import { getActor } from '@/lib/auth/actor'
import { loadDataset } from '@/lib/db/dataset'
import {
  demandClusters,
  gradeBandLabel,
  recruitmentCandidates,
  recruitmentRows,
  supplySummary,
} from '@/lib/db/queries'
import { RECRUITMENT_STATUS_LABEL, type RecruitmentStatus } from '@/types/domain'
import { sendRecruitment } from '../actions'

export const metadata = { title: '섭외' }

const TONE: Record<RecruitmentStatus, BadgeTone> = {
  sent: 'caution',
  accepted: 'positive',
  declined: 'negative',
  expired: 'neutral',
}

/** 섭외 요청 발송·추적. H5(섭외 요청 ≥ 1건)가 이 화면에서 측정된다. */
export default async function OrgRecruitmentPage() {
  const actor = await getActor()
  if (!actor || actor.role !== 'org_member') redirect('/login')

  const ds = await loadDataset()
  const rows = recruitmentRows(ds, actor.orgId)
  const candidates = recruitmentCandidates(ds, actor.orgId)
  const clusters = demandClusters(ds, actor.orgId).filter((c) => c.field !== '아직 잘 모르겠어요')
  const supply = supplySummary(ds)

  return (
    <div className="space-y-8">
      <PageHeader
        title="섭외"
        description="수요가 확인된 분야의 지역 강사에게 과정 개설을 요청합니다. 수락 여부와 거절 사유가 그대로 기록됩니다."
      />

      <FactNote>
        {supply.sentence}. 후보 순서는 <strong className="font-semibold">수요 크기와 거리</strong>로만
        정렬됩니다. 소속 업체나 구독 여부를 순위에 반영하지 않습니다.
      </FactNote>

      <Panel title="보낸 요청" description="강사가 수락하면 과정 개설 협의로 넘어갑니다.">
        {rows.length === 0 ? (
          <p className="text-sm text-sub">아직 보낸 요청이 없습니다.</p>
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((r) => (
              <li key={r.id} className="py-4 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-ink">{r.instructorName} 강사</span>
                      <span className="text-xs text-sub">{r.instructorRegion}</span>
                      <Badge tone={TONE[r.status as RecruitmentStatus]}>
                        {RECRUITMENT_STATUS_LABEL[r.status as RecruitmentStatus]}
                      </Badge>
                    </div>
                    <p className="mt-1.5 text-sm text-body">
                      {r.field} · 수요 {r.demandCount}명
                    </p>
                    {r.note ? (
                      <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-sub">{r.note}</p>
                    ) : null}
                  </div>
                  <p className="shrink-0 text-xs text-sub tabular-nums">{r.createdAt.slice(0, 10)}</p>
                </div>

                {r.status === 'declined' ? (
                  <div className="mt-3 rounded-md border border-line bg-muted px-3.5 py-3">
                    <p className="text-xs font-medium text-body">같은 분야 대체 강사</p>
                    {r.alternatives.length > 0 ? (
                      <ul className="mt-2 space-y-1.5">
                        {r.alternatives.map((alt) => (
                          <li
                            key={alt.id}
                            className="flex flex-wrap items-center justify-between gap-2 text-sm"
                          >
                            <span className="text-ink">
                              {alt.name} 강사
                              <span className="ml-1.5 text-xs text-sub">{alt.regionLabel}</span>
                            </span>
                            <form action={sendRecruitment}>
                              <input type="hidden" name="instructorId" value={alt.id} />
                              <input type="hidden" name="field" value={r.field} />
                              <input type="hidden" name="demandCount" value={r.demandCount} />
                              <input
                                type="hidden"
                                name="note"
                                value={`${r.field} 과정 개설 요청입니다. 이전 섭외가 어려워 같은 분야로 다시 요청합니다.`}
                              />
                              <button
                                type="submit"
                                className="rounded-md border border-line-strong bg-card px-2.5 py-1 text-xs font-medium text-body hover:bg-muted"
                              >
                                이 강사에게 요청
                              </button>
                            </form>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-1.5 text-xs leading-relaxed text-caution">
                        주변에 같은 분야 강사가 더 없습니다. 이 건은 미충족 수요로 남습니다 —{' '}
                        <Link href="/org/demand" className="underline underline-offset-4">
                          수요 화면
                        </Link>
                        에서 확인하세요.
                      </p>
                    )}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel
        title="섭외 후보"
        description="우리 지역과 인접 지역의 심사 완료 강사입니다. 수요가 큰 분야를 맡은 강사가 먼저 옵니다."
      >
        {candidates.length === 0 ? (
          <EmptyState
            title="주변에 심사 완료 강사가 없습니다"
            description="운영자가 새 강사를 등록하면 여기 나타납니다. 수요 화면의 미충족 수요가 그 근거로 쓰입니다."
          />
        ) : (
          <ul className="space-y-4">
            {candidates.map((c) => {
              const best = clusters.find((cl) => (c.instructor.fields as string[]).includes(cl.field))
              return (
                <li key={c.instructor.id} className="rounded-md border border-line bg-card p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-ink">
                          {c.instructor.name} 강사
                        </span>
                        <span className="text-xs text-sub">{c.regionLabel}</span>
                        {c.distance === 0 ? <Badge tone="positive">우리 지역</Badge> : null}
                        <span className="text-xs text-sub">
                          {c.provider ? c.provider.name : '프리랜서'}
                        </span>
                      </div>
                      <p className="mt-1.5 text-sm text-body">
                        {c.instructor.fields.join(' · ')}
                      </p>
                      <p className="mt-1 max-w-xl text-xs leading-relaxed text-sub">
                        {c.instructor.bio}
                      </p>
                      <Link
                        href={`/instructors/${c.instructor.id}`}
                        className="mt-1.5 inline-block text-xs text-point underline underline-offset-4"
                      >
                        프로필 보기
                      </Link>
                    </div>

                    <form action={sendRecruitment} className="w-full max-w-xs space-y-2">
                      <input type="hidden" name="instructorId" value={c.instructor.id} />
                      <label className="block space-y-1">
                        <span className="block text-xs font-medium text-body">분야</span>
                        <select
                          name="field"
                          defaultValue={c.instructor.fields[0]}
                          className="block w-full rounded-md border border-line-strong bg-card px-2.5 py-1.5 text-xs text-ink"
                        >
                          {c.instructor.fields.map((f) => (
                            <option key={f} value={f}>
                              {f}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="block space-y-1">
                        <span className="block text-xs font-medium text-body">
                          수요 인원
                          {best ? (
                            <span className="ml-1 text-faint">
                              (집계 {best.intentCount}명 · {gradeBandLabel(best.gradeBand)})
                            </span>
                          ) : null}
                        </span>
                        <input
                          type="number"
                          name="demandCount"
                          min={0}
                          max={500}
                          defaultValue={best?.intentCount ?? c.demand}
                          className="block w-full rounded-md border border-line-strong bg-card px-2.5 py-1.5 text-xs text-ink tabular-nums"
                        />
                      </label>
                      <label className="block space-y-1">
                        <span className="block text-xs font-medium text-body">요청 메모</span>
                        <textarea
                          name="note"
                          rows={2}
                          maxLength={500}
                          placeholder="장소·희망 시간대·대상 학년을 적어 주세요."
                          className="block w-full rounded-md border border-line-strong bg-card px-2.5 py-1.5 text-xs leading-relaxed text-ink"
                        />
                      </label>
                      <button
                        type="submit"
                        className="w-full rounded-lg bg-point px-3 py-2 text-xs font-medium text-white hover:bg-point-hover"
                      >
                        섭외 요청 보내기
                      </button>
                    </form>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </Panel>
    </div>
  )
}
