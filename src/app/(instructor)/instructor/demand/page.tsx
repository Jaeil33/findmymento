import { notFound, redirect } from 'next/navigation'
import { Badge } from '@/components/ui/Badge'
import { StatTile } from '@/components/ui/StatTile'
import { PageHeader, Panel } from '@/components/ui/Section'
import { EmptyState } from '@/components/ui/EmptyState'
import { Table, Td, Th } from '@/components/ui/Table'
import { getActor } from '@/lib/auth/actor'
import { loadDataset } from '@/lib/db/dataset'
import { gradeBandLabel, regionDemand } from '@/lib/db/queries'
import { neighbors, regionName } from '@/lib/region'

export const metadata = { title: '지역 수요' }

/**
 * 지역 수요. **집계치만** 보여 준다 (UC-15).
 * 학생 가명코드·개별 응답은 이 화면에 오지 않는다.
 */
export default async function InstructorDemandPage() {
  const actor = await getActor()
  if (!actor || actor.role !== 'instructor') redirect('/login')

  const ds = await loadDataset()
  const me = ds.instructors.find((i) => i.id === actor.instructorId)
  if (!me) notFound()

  const all = regionDemand(ds, me.region_code)
  const mine = all.filter((d) => (me.fields as string[]).includes(d.field))
  const others = all.filter((d) => !(me.fields as string[]).includes(d.field))

  const mineTotal = mine.reduce((a, d) => a + d.intentCount, 0)
  const around = neighbors(me.region_code).map(regionName)

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={`${regionName(me.region_code)} + 인접 지역`}
        title="지역 수요"
        description={`${regionName(me.region_code)}와 ${around.slice(0, 3).join('·')} 등 인접 지역 기관에서 모인 "더 배우고 싶다" 응답 집계입니다. 개별 학생 응답은 포함되지 않습니다.`}
      />

      <section className="grid gap-4 sm:grid-cols-3">
        <StatTile
          emphasis
          label="내 분야 수요"
          value={mineTotal}
          unit="건"
          tone="point"
          sub={me.fields.join(' · ')}
        />
        <StatTile
          label="수요가 있는 조합"
          value={mine.length}
          unit="개"
          sub="분야 × 학년대"
        />
        <StatTile
          label="다른 분야 수요"
          value={others.reduce((a, d) => a + d.intentCount, 0)}
          unit="건"
          sub="프로그램을 넓힐 때 참고하세요"
        />
      </section>

      {mine.length === 0 ? (
        <EmptyState
          title="아직 내 분야 수요 데이터가 없습니다"
          description="배정된 회차에서 학생 응답이 들어오면 여기에 쌓입니다. 수업 마무리에 QR 안내를 해주시면 가장 빠르게 모입니다."
        />
      ) : (
        <Panel
          title="내 분야"
          description="후속 의향 3점 이상만 센 숫자입니다. 기관이 섭외를 검토할 때 보는 숫자와 같습니다."
        >
          <Table>
            <thead>
              <tr>
                <Th>분야</Th>
                <Th>학년대</Th>
                <Th className="text-right">후속 희망</Th>
              </tr>
            </thead>
            <tbody>
              {mine.map((d) => (
                <tr key={`${d.field}-${d.gradeBand}`}>
                  <Td className="font-medium text-ink">{d.field}</Td>
                  <Td className="text-sub">{gradeBandLabel(d.gradeBand)}</Td>
                  <Td className="text-right font-medium text-point tabular-nums">
                    {d.intentCount}건
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Panel>
      )}

      {others.length > 0 ? (
        <Panel
          title="다른 분야"
          description="강사님 분야가 아닌 수요입니다. 프로그램을 넓힐 여지가 있는지 참고용으로만 보여 줍니다."
        >
          <ul className="space-y-2.5">
            {others.map((d) => (
              <li key={`${d.field}-${d.gradeBand}`} className="flex items-center justify-between gap-3">
                <span className="text-sm text-body">
                  {d.field}
                  <span className="ml-1.5 text-xs text-sub">{gradeBandLabel(d.gradeBand)}</span>
                </span>
                <span className="text-sm text-sub tabular-nums">{d.intentCount}건</span>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      <p className="text-xs leading-relaxed text-sub">
        이 숫자는 집계치입니다. 어느 학생이 무엇을 골랐는지는 기관 담당자만 볼 수 있습니다.
        <Badge tone="neutral" className="ml-2">
          학생 단위 응답 비공개
        </Badge>
      </p>
    </div>
  )
}
