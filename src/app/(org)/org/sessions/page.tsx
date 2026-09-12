import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Badge } from '@/components/ui/Badge'
import { buttonClass } from '@/components/ui/Button'
import { PageHeader, Panel } from '@/components/ui/Section'
import { EmptyState } from '@/components/ui/EmptyState'
import { Table, Td, Th } from '@/components/ui/Table'
import { getActor } from '@/lib/auth/actor'
import { loadDataset } from '@/lib/db/dataset'
import { gradeBandLabel, orgSessionRows } from '@/lib/db/queries'
import { IconQr } from '@/components/ui/Icons'

export const metadata = { title: '특강 회차' }

export default async function OrgSessionsPage() {
  const actor = await getActor()
  if (!actor || actor.role !== 'org_member') redirect('/login')

  const ds = await loadDataset()
  const rows = orgSessionRows(ds, actor.orgId)

  return (
    <div className="space-y-8">
      <PageHeader
        title="특강 회차"
        description="회차를 만드는 주체는 기관·학교입니다. 강사는 회차에 배정되고, 배정된 회차의 QR과 리포트만 볼 수 있습니다."
        actions={
          <Link href="/org/sessions/new" className={buttonClass({ variant: 'primary' })}>
            회차 만들기
          </Link>
        }
      />

      {rows.length === 0 ? (
        <EmptyState
          title="아직 회차가 없습니다"
          description="특강 회차를 만들면 6자리 입장 코드와 QR이 발급됩니다. 학생은 수업 마지막에 QR을 찍고 3분 동안 답합니다."
          action={
            <Link href="/org/sessions/new" className={buttonClass({ variant: 'primary' })}>
              첫 회차 만들기
            </Link>
          }
        />
      ) : (
        <Panel>
          <Table>
            <thead>
              <tr>
                <Th>회차</Th>
                <Th>진행일</Th>
                <Th>응답 마감</Th>
                <Th>배정 강사</Th>
                <Th className="text-right">응답</Th>
                <Th>입장 코드</Th>
                <Th className="text-right">화면</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.session.id} className={r.unassigned ? 'bg-caution-bg/40' : undefined}>
                  <Td>
                    <Link
                      href={`/org/sessions/${r.session.id}`}
                      className="font-medium text-ink hover:underline hover:underline-offset-4"
                    >
                      {r.session.title}
                    </Link>
                    <p className="mt-0.5 text-xs text-sub">
                      {r.session.field} · {gradeBandLabel(r.session.grade_band)} · 예상{' '}
                      {r.session.expected_students}명
                    </p>
                  </Td>
                  <Td className="whitespace-nowrap text-sub tabular-nums">{r.session.held_on}</Td>
                  <Td className="whitespace-nowrap text-sub tabular-nums">
                    {r.session.closes_at.slice(0, 10)}
                    <p className="mt-0.5 text-xs">
                      {r.closed ? <Badge>마감</Badge> : <Badge tone="positive">수집 중</Badge>}
                    </p>
                  </Td>
                  <Td>
                    {r.instructorName ?? (
                      <span className="space-y-1">
                        <Badge tone="caution">미배정</Badge>
                        <span className="block text-xs text-caution">
                          강사가 QR·리포트를 못 봅니다
                        </span>
                      </span>
                    )}
                  </Td>
                  <Td className="text-right tabular-nums">
                    {r.zeroResponse ? (
                      <span className="font-medium text-negative">0</span>
                    ) : (
                      <span className="font-medium text-ink">{r.responseCount}</span>
                    )}
                    <span className="text-faint"> / {r.session.expected_students}</span>
                    {r.zeroResponse && !r.closed ? (
                      <p className="mt-0.5 text-xs text-negative">안내 확인 필요</p>
                    ) : null}
                  </Td>
                  <Td className="font-semibold whitespace-nowrap text-ink tabular-nums">
                    {r.session.entry_code}
                  </Td>
                  <Td className="text-right">
                    <div className="flex items-center justify-end gap-2 whitespace-nowrap">
                      <Link
                        href={`/project/${r.session.id}`}
                        className="inline-flex items-center gap-1 rounded-md border border-line-strong px-2 py-1 text-xs text-body hover:bg-muted"
                      >
                        <IconQr width={14} height={14} />
                        투사
                      </Link>
                      <Link
                        href={`/org/sessions/${r.session.id}/codes`}
                        className="rounded-md border border-line-strong px-2 py-1 text-xs text-body hover:bg-muted"
                      >
                        가명코드
                      </Link>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Panel>
      )}
    </div>
  )
}
