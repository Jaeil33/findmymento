import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Badge } from '@/components/ui/Badge'
import { StatTile } from '@/components/ui/StatTile'
import { FactNote, PageHeader, Panel } from '@/components/ui/Section'
import { Table, Td, Th } from '@/components/ui/Table'
import { getActor } from '@/lib/auth/actor'
import { loadDataset } from '@/lib/db/dataset'
import {
  gradeBandLabel,
  reviewQueue,
  supplySummary,
  unansweredQueue,
  unmetDemand,
} from '@/lib/db/queries'
import { regionName } from '@/lib/region'

export const metadata = { title: '운영 요약' }

export default async function AdminHomePage() {
  const actor = await getActor()
  if (!actor || actor.role !== 'admin') redirect('/login')

  const ds = await loadDataset()
  const supply = supplySummary(ds)
  const queue = reviewQueue(ds)
  const unanswered = unansweredQueue(ds)
  const pendingInquiries = ds.inquiries.filter((q) => q.status === 'received')
  const assigned = ds.inquiries.filter((q) => q.status === 'assigned')

  // 전 기관의 미충족 수요 — 신규 강사·업체 영업 큐다 (E-16).
  const unmetAll = ds.organizations.flatMap((o) =>
    unmetDemand(ds, o.id).map((u) => ({ ...u, orgName: o.name })),
  )

  return (
    <div className="space-y-8">
      <PageHeader
        title="운영 요약"
        description="심사·배정·모더레이션은 사람이 합니다. 지금 사람 손이 필요한 일만 모았습니다."
      />

      <FactNote>
        {supply.sentence}. 공급이 없는 분야는 {supply.uncoveredFields.join(' · ') || '없음'} 입니다. 이
        목록과 아래 미충족 수요가 신규 강사 영업의 근거입니다.
      </FactNote>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="심사 대기 강사"
          value={queue.length}
          unit="명"
          tone={queue.length > 0 ? 'caution' : 'default'}
          sub="증빙 확인 후 승인·반려"
        />
        <StatTile
          label="미배정 문의"
          value={pendingInquiries.length}
          unit="건"
          tone={pendingInquiries.length > 0 ? 'caution' : 'default'}
          sub={`배정 완료 ${assigned.length}건 대기 중`}
        />
        <StatTile
          label="48시간 초과 미답변"
          value={unanswered.length}
          unit="건"
          tone={unanswered.length > 0 ? 'negative' : 'default'}
          sub="강사에게 답변을 요청하세요"
        />
        <StatTile
          emphasis
          label="미충족 수요"
          value={unmetAll.reduce((a, u) => a + u.interest_count, 0)}
          unit="건"
          tone="point"
          sub="공급이 없어 연결하지 못한 관심"
        />
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <Panel
          title="심사 대기"
          description="성범죄경력 조회 증빙이 없으면 승인할 수 없습니다."
          actions={
            <Link href="/admin/instructors" className="text-sm text-point hover:underline">
              심사 화면
            </Link>
          }
        >
          {queue.length === 0 ? (
            <p className="text-sm text-sub">심사 대기 중인 강사가 없습니다.</p>
          ) : (
            <ul className="space-y-3">
              {queue.map((q) => (
                <li key={q.instructor.id} className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink">{q.instructor.name}</p>
                    <p className="mt-0.5 text-xs text-sub">
                      {q.instructor.fields.join('·')} · {q.regionLabel} ·{' '}
                      {q.provider?.name ?? '프리랜서'}
                    </p>
                  </div>
                  {q.hasCriminalRecordCheck ? (
                    <Badge tone="positive">증빙 완비</Badge>
                  ) : (
                    <Badge tone="negative">경력조회 증빙 없음</Badge>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel
          title="미배정 보호자 문의"
          description="접수 후 영업일 2일 안에 연락한다고 안내했습니다."
          actions={
            <Link href="/admin/inquiries" className="text-sm text-point hover:underline">
              문의 화면
            </Link>
          }
        >
          {pendingInquiries.length === 0 ? (
            <p className="text-sm text-sub">배정 대기 중인 문의가 없습니다.</p>
          ) : (
            <ul className="space-y-3">
              {pendingInquiries.map((q) => (
                <li key={q.id} className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm text-ink">
                      {q.guardian_name} 보호자
                      <span className="ml-1.5 text-xs text-sub">
                        {q.field} · {gradeBandLabel(q.grade_band)}
                      </span>
                    </p>
                    <p className="mt-0.5 text-xs text-sub">{regionName(q.region_code)}</p>
                  </div>
                  <p className="shrink-0 text-xs text-sub tabular-nums">
                    {q.created_at.slice(5, 10)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </section>

      {unmetAll.length > 0 ? (
        <Panel
          title="미충족 수요 (영업 큐)"
          description="관심은 있었지만 주변에 강사가 없어 연결되지 않은 건입니다. 이 표가 곧 신규 강사·업체 제안 자료입니다."
        >
          <Table>
            <thead>
              <tr>
                <Th>분야</Th>
                <Th>지역</Th>
                <Th>기관</Th>
                <Th>학년대</Th>
                <Th className="text-right">관심 응답</Th>
              </tr>
            </thead>
            <tbody>
              {unmetAll.map((u, i) => (
                <tr key={`${u.field}-${u.region_code}-${u.grade_band}-${i}`}>
                  <Td className="font-medium text-ink">{u.field}</Td>
                  <Td className="text-sub">{regionName(u.region_code)}</Td>
                  <Td className="text-sub">{u.orgName}</Td>
                  <Td className="text-sub">{u.grade_band ? gradeBandLabel(u.grade_band) : '-'}</Td>
                  <Td className="text-right font-medium text-ink tabular-nums">
                    {u.interest_count}건
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Panel>
      ) : null}
    </div>
  )
}
