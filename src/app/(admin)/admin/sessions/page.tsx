import Link from 'next/link'
import { redirect } from 'next/navigation'
import { PageHeader, Panel } from '@/components/ui/Section'
import { getActor } from '@/lib/auth/actor'
import { loadDataset } from '@/lib/db/dataset'
import { isClosed } from '@/lib/db/queries'
import { loadRecommendationLogs } from '@/lib/db/recommendation-logs'

export const metadata = { title: '수업·설문' }

/** 운영자 — 모든 기관의 회차와 설문 응답·AI 추천 현황. 회차를 누르면 응답 전체를 본다. */
export default async function AdminSessionsPage() {
  const actor = await getActor()
  if (!actor || actor.role !== 'admin') redirect('/login')

  const ds = await loadDataset()
  const logs = await loadRecommendationLogs()

  const rows = [...ds.lectureSessions]
    .sort((a, b) => b.held_on.localeCompare(a.held_on))
    .map((s) => {
      const sessionLogs = logs.filter((l) => l.session_id === s.id)
      return {
        session: s,
        orgName: ds.organizations.find((o) => o.id === s.org_id)?.name ?? '기관',
        instructorName: ds.instructors.find((i) => i.id === s.instructor_id)?.name ?? '미배정',
        responses: ds.surveyResponses.filter((r) => r.session_id === s.id).length,
        llm: sessionLogs.filter((l) => l.source === 'llm').length,
        logs: sessionLogs.length,
        closed: isClosed(s),
      }
    })

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="운영"
        title="수업·설문"
        description="모든 기관의 회차별 설문 응답과 AI 추천 기록입니다. 회차를 누르면 학생 응답 하나하나와 그 학생이 본 카드·이유를 볼 수 있어요."
      />

      <Panel title={`회차 ${rows.length}개`}>
        {rows.length === 0 ? (
          <p className="text-sm text-sub">아직 회차가 없어요.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="text-xs text-sub">
                <tr>
                  <th className="py-2 pr-3 font-medium">날짜</th>
                  <th className="py-2 pr-3 font-medium">수업</th>
                  <th className="py-2 pr-3 font-medium">기관</th>
                  <th className="py-2 pr-3 font-medium">강사</th>
                  <th className="py-2 pr-3 font-medium">입장 코드</th>
                  <th className="py-2 pr-3 font-medium">응답</th>
                  <th className="py-2 pr-3 font-medium">AI 추천</th>
                  <th className="py-2 font-medium">상태</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.session.id} className="border-t border-line">
                    <td className="py-3 pr-3 whitespace-nowrap text-sub">{r.session.held_on}</td>
                    <td className="py-3 pr-3">
                      <Link
                        href={`/admin/sessions/${r.session.id}`}
                        className="font-medium text-ink underline-offset-4 hover:underline"
                      >
                        {r.session.title}
                      </Link>
                    </td>
                    <td className="py-3 pr-3">{r.orgName}</td>
                    <td className="py-3 pr-3">{r.instructorName}</td>
                    <td className="py-3 pr-3 font-mono">{r.session.entry_code}</td>
                    <td className="py-3 pr-3 whitespace-nowrap">{r.responses}건</td>
                    <td className="py-3 pr-3 whitespace-nowrap">
                      {r.logs === 0 ? '-' : `${r.llm}/${r.logs}건`}
                    </td>
                    <td className="py-3 whitespace-nowrap">{r.closed ? '마감' : '응답 받는 중'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  )
}
