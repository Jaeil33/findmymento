import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Badge } from '@/components/ui/Badge'
import { PageHeader, Panel } from '@/components/ui/Section'
import { EmptyState } from '@/components/ui/EmptyState'
import { Table, Td, Th } from '@/components/ui/Table'
import { getActor } from '@/lib/auth/actor'
import { loadDataset } from '@/lib/db/dataset'
import { gradeBandLabel, instructorSessions } from '@/lib/db/queries'
import { IconQr } from '@/components/ui/Icons'

export const metadata = { title: '배정 회차' }

/**
 * 배정 회차 목록. `lecture_sessions.instructor_id = 내 id` 인 회차만 보인다.
 * **회차를 만드는 버튼이 없다** — 회차의 소유자는 기관이다 (ADR-015).
 */
export default async function InstructorSessionsPage() {
  const actor = await getActor()
  if (!actor || actor.role !== 'instructor') redirect('/login')

  const ds = await loadDataset()
  const sessions = instructorSessions(ds, actor.instructorId)

  return (
    <div className="space-y-8">
      <PageHeader
        title="배정 회차"
        description="기관·학교가 만든 회차 중 강사님이 배정된 것만 보입니다. 회차 생성·수정은 기관에서 합니다."
      />

      {sessions.length === 0 ? (
        <EmptyState
          title="아직 배정된 회차가 없습니다"
          description="기관·학교가 특강 회차를 만들고 강사님을 배정하면 여기 나타납니다. 배정되면 교실 투사용 QR과 회차 리포트를 볼 수 있습니다."
        />
      ) : (
        <Panel>
          <Table>
            <thead>
              <tr>
                <Th>회차</Th>
                <Th>기관</Th>
                <Th>진행일</Th>
                <Th className="text-right">응답</Th>
                <Th>입장 코드</Th>
                <Th className="text-right">화면</Th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.session.id}>
                  <Td>
                    <Link
                      href={`/instructor/sessions/${s.session.id}`}
                      className="font-medium text-ink hover:underline hover:underline-offset-4"
                    >
                      {s.session.title}
                    </Link>
                    <p className="mt-0.5 text-xs text-sub">
                      {s.session.field} · {gradeBandLabel(s.session.grade_band)}
                    </p>
                  </Td>
                  <Td className="text-sub">{s.orgName}</Td>
                  <Td className="whitespace-nowrap text-sub tabular-nums">
                    {s.session.held_on}
                    <p className="mt-0.5">
                      {s.closed ? <Badge>마감</Badge> : <Badge tone="positive">수집 중</Badge>}
                    </p>
                  </Td>
                  <Td className="text-right tabular-nums">
                    {s.responseCount === 0 ? (
                      <span className="font-medium text-negative">0</span>
                    ) : (
                      <span className="font-medium text-ink">{s.responseCount}</span>
                    )}
                    <span className="text-faint"> / {s.session.expected_students}</span>
                  </Td>
                  <Td className="font-semibold whitespace-nowrap text-ink tabular-nums">
                    {s.session.entry_code}
                  </Td>
                  <Td className="text-right">
                    <Link
                      href={`/project/${s.session.id}`}
                      className="inline-flex items-center gap-1 rounded-md border border-line-strong px-2 py-1 text-xs whitespace-nowrap text-body hover:bg-muted"
                    >
                      <IconQr width={14} height={14} />
                      교실에 띄우기
                    </Link>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Panel>
      )}

      <p className="text-xs leading-relaxed text-sub">
        응답이 0건인 회차는 대부분 수업 마무리에 QR 안내가 빠진 경우입니다. 마지막 3분에 한 마디만
        보태면 응답률이 크게 달라집니다.
      </p>
    </div>
  )
}
