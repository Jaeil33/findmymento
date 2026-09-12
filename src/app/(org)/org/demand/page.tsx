import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Badge } from '@/components/ui/Badge'
import { StatTile } from '@/components/ui/StatTile'
import { PageHeader, Panel } from '@/components/ui/Section'
import { EmptyState } from '@/components/ui/EmptyState'
import { Table, Td, Th } from '@/components/ui/Table'
import { getActor } from '@/lib/auth/actor'
import { loadDataset } from '@/lib/db/dataset'
import { demandClusters, gradeBandLabel, supplySummary, unmetDemand } from '@/lib/db/queries'
import { regionName } from '@/lib/region'

export const metadata = { title: '수요' }

/**
 * 수요 클러스터 + 미충족 수요.
 *
 * 미충족 수요는 이 제품의 핵심 자산이다 — "광명시 중학생 VR 관심 14명, 공급 0"이 곧
 * 신규 강사 영업 자료이고 기관의 예산 기안 근거다 (E-16).
 */
export default async function OrgDemandPage() {
  const actor = await getActor()
  if (!actor || actor.role !== 'org_member') redirect('/login')

  const ds = await loadDataset()
  const org = ds.organizations.find((o) => o.id === actor.orgId)
  const clusters = demandClusters(ds, actor.orgId).filter((c) => c.field !== '아직 잘 모르겠어요')
  const unsure = demandClusters(ds, actor.orgId).filter((c) => c.field === '아직 잘 모르겠어요')
  const unmet = unmetDemand(ds, actor.orgId)
  const supply = supplySummary(ds)

  const totalIntent = clusters.reduce((a, c) => a + c.intentCount, 0)
  const unmetIntent = unmet.reduce((a, u) => a + u.interest_count, 0)

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={org?.name}
        title="수요"
        description="특강 응답에서 모인 분야 × 학년대 수요입니다. 후속 과정 편성과 강사 섭외의 근거로 씁니다."
      />

      <section className="grid gap-4 sm:grid-cols-3">
        <StatTile
          emphasis
          label="후속 의향이 있는 응답"
          value={totalIntent}
          unit="건"
          tone="point"
          sub="분야별 중복 선택을 포함한 수치"
        />
        <StatTile
          label="미충족 수요"
          value={unmetIntent}
          unit="건"
          tone={unmetIntent > 0 ? 'caution' : 'default'}
          sub={`${unmet.length}개 분야에 주변 공급이 없습니다`}
        />
        <StatTile
          label="지금 공급이 있는 분야"
          value={supply.coveredFields.length}
          unit={`/ ${supply.coveredFields.length + supply.uncoveredFields.length}`}
          sub={supply.coveredFields.join(' · ')}
        />
      </section>

      {unmet.length > 0 ? (
        <Panel
          title="미충족 수요"
          description="관심은 있는데 우리 지역과 인접 지역에 강사가 없는 분야입니다. 운영자가 이 숫자로 새 강사를 찾습니다."
          footer="이 목록은 수요가 사라졌다는 뜻이 아닙니다. 공급이 생기면 바로 연결할 수 있게 남겨 둡니다."
        >
          <Table>
            <thead>
              <tr>
                <Th>분야</Th>
                <Th>학년대</Th>
                <Th>지역</Th>
                <Th className="text-right">관심 응답</Th>
                <Th className="text-right">주변 강사</Th>
              </tr>
            </thead>
            <tbody>
              {unmet.map((u) => (
                <tr key={`${u.field}-${u.grade_band}`}>
                  <Td className="font-medium text-ink">{u.field}</Td>
                  <Td className="text-sub">{u.grade_band ? gradeBandLabel(u.grade_band) : '-'}</Td>
                  <Td className="text-sub">{regionName(u.region_code)}</Td>
                  <Td className="text-right font-medium text-ink tabular-nums">
                    {u.interest_count}건
                  </Td>
                  <Td className="text-right">
                    <Badge tone="negative">0명</Badge>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Panel>
      ) : null}

      {clusters.length === 0 ? (
        <EmptyState
          title="아직 수요 데이터가 없습니다"
          description="특강 회차를 만들고 학생 응답이 들어오면 여기에 분야 × 학년대로 쌓입니다."
          action={
            <Link
              href="/org/sessions/new"
              className="rounded-lg bg-point px-4 py-2.5 text-sm font-medium text-white hover:bg-point-hover"
            >
              회차 만들기
            </Link>
          }
        />
      ) : (
        <Panel
          title="분야 × 학년대"
          description="후속 의향 3점 이상을 센 숫자가 실제 수요입니다. 전체 선택 수와 함께 보여 줍니다."
        >
          <ul className="space-y-4">
            {clusters.map((c) => (
              <li
                key={`${c.field}-${c.gradeBand}`}
                className="rounded-md border border-line bg-card p-4"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold text-ink">{c.field}</h3>
                    <span className="text-xs text-sub">{gradeBandLabel(c.gradeBand)}</span>
                    {c.supplyCount === 0 ? (
                      <Badge tone="caution">지역 공급 0</Badge>
                    ) : (
                      <span className="text-xs text-sub tabular-nums">강사 {c.supplyCount}명</span>
                    )}
                  </div>
                  <p className="text-sm tabular-nums">
                    <span className="font-semibold text-point">{c.intentCount}명</span>
                    <span className="text-sub"> 후속 희망 / 선택 {c.count}건</span>
                  </p>
                </div>

                {c.quotes.length > 0 ? (
                  <ul className="mt-3 space-y-1.5 border-t border-line pt-3">
                    {c.quotes.map((q, i) => (
                      <li key={`${q}-${i}`} className="text-xs leading-relaxed text-body">
                        &ldquo;{q}&rdquo;
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {unsure.length > 0 ? (
        <Panel
          title="아직 잘 모르겠어요"
          description="분야를 고르지 못한 응답입니다. 버리지 않고 따로 셉니다 — 탐색 기회가 더 필요한 집단입니다."
        >
          <ul className="space-y-2 text-sm">
            {unsure.map((c) => (
              <li key={c.gradeBand} className="flex items-center justify-between gap-3">
                <span className="text-ink">{gradeBandLabel(c.gradeBand)}</span>
                <span className="font-medium text-ink tabular-nums">{c.count}건</span>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
    </div>
  )
}
