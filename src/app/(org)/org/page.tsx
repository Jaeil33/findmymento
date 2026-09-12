import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Badge } from '@/components/ui/Badge'
import { buttonClass } from '@/components/ui/Button'
import { StatTile } from '@/components/ui/StatTile'
import { FactNote, PageHeader, Panel } from '@/components/ui/Section'
import { Table, Td, Th } from '@/components/ui/Table'
import { getActor } from '@/lib/auth/actor'
import { loadDataset } from '@/lib/db/dataset'
import {
  demandClusters,
  gradeBandLabel,
  interestRows,
  orgSessionRows,
  recruitmentRows,
  supplySummary,
  unmetDemand,
} from '@/lib/db/queries'
import { IconAlert, IconArrowRight } from '@/components/ui/Icons'

export const metadata = { title: '요약' }

export default async function OrgHomePage() {
  const actor = await getActor()
  if (!actor || actor.role !== 'org_member') redirect('/login')

  const ds = await loadDataset()
  const org = ds.organizations.find((o) => o.id === actor.orgId)
  const rows = orgSessionRows(ds, actor.orgId)
  const supply = supplySummary(ds)
  const unmet = unmetDemand(ds, actor.orgId)
  const clusters = demandClusters(ds, actor.orgId)
  const interests = interestRows(ds, actor.orgId)
  const recruitment = recruitmentRows(ds, actor.orgId)

  const sessionIds = new Set(rows.map((r) => r.session.id))
  const responses = ds.surveyResponses.filter((r) => sessionIds.has(r.session_id))
  const highIntent = responses.filter((r) => r.followup_intent >= 3).length

  const needsAttention = rows.filter((r) => r.unassigned || (r.zeroResponse && !r.closed))
  const pendingReview = interests.filter((i) => i.status === 'expressed' || i.status === 'org_review')
  const awaitingInstructor = recruitment.filter((r) => r.status === 'sent')

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={org?.name}
        title="요약"
        description="특강에서 모인 수요와 지금 해야 할 일입니다."
        actions={
          <Link href="/org/sessions/new" className={buttonClass({ variant: 'primary' })}>
            특강 회차 만들기
          </Link>
        }
      />

      <FactNote>
        {supply.sentence}. 파일럿 단계라 추천·섭외 후보가 한 업체로 쏠릴 수 있습니다. 공급이 없는
        분야({supply.uncoveredFields.join(' · ') || '없음'})는 미충족 수요로만 집계됩니다.
      </FactNote>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          emphasis
          label="더 배우고 싶다고 답한 학생"
          value={highIntent}
          unit="명"
          tone="point"
          sub={`전체 응답 ${responses.length}건 중`}
        />
        <StatTile label="특강 회차" value={rows.length} unit="개" sub={`응답 수집 중 ${rows.filter((r) => !r.closed).length}개`} />
        <StatTile
          label="검토 대기 관심 표현"
          value={pendingReview.length}
          unit="건"
          tone={pendingReview.length > 0 ? 'caution' : 'default'}
          sub="승인하면 보호자 동의 기록 단계로 넘어갑니다"
        />
        <StatTile
          label="미충족 수요 분야"
          value={unmet.length}
          unit="개"
          tone={unmet.length > 0 ? 'caution' : 'default'}
          sub="관심은 있지만 주변에 강사가 없는 분야"
        />
      </section>

      {needsAttention.length > 0 ? (
        <Panel
          title="확인이 필요한 회차"
          description="응답률에 직접 영향을 주는 두 가지입니다."
        >
          <ul className="space-y-3">
            {needsAttention.map((r) => (
              <li
                key={r.session.id}
                className="flex flex-wrap items-start justify-between gap-3 rounded-md border border-caution/25 bg-caution-bg px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-sm font-medium text-ink">
                    <IconAlert width={15} height={15} className="shrink-0 text-caution" />
                    {r.session.title}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-body">
                    {r.unassigned
                      ? '배정 강사가 없습니다. 강사가 교실에서 QR을 띄우거나 리포트를 볼 수 없습니다.'
                      : '응답이 0건입니다. 수업 마무리에 QR 안내가 빠졌을 가능성이 큽니다.'}
                  </p>
                </div>
                <Link
                  href={`/org/sessions/${r.session.id}`}
                  className="shrink-0 text-sm text-point underline underline-offset-4 hover:text-point-hover"
                >
                  회차 열기
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      <Panel
        title="최근 회차"
        description="응답 수와 상태입니다."
        actions={
          <Link href="/org/sessions" className={buttonClass({ variant: 'secondary' })}>
            전체 보기
          </Link>
        }
      >
        {rows.length === 0 ? (
          <p className="text-sm text-sub">아직 만든 회차가 없습니다.</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>회차</Th>
                <Th>진행일</Th>
                <Th>배정 강사</Th>
                <Th className="text-right">응답</Th>
                <Th>상태</Th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 5).map((r) => (
                <tr key={r.session.id}>
                  <Td>
                    <Link
                      href={`/org/sessions/${r.session.id}`}
                      className="font-medium text-ink hover:underline hover:underline-offset-4"
                    >
                      {r.session.title}
                    </Link>
                    <p className="mt-0.5 text-xs text-sub">
                      {r.session.field} · {gradeBandLabel(r.session.grade_band)}
                    </p>
                  </Td>
                  <Td className="text-sub tabular-nums">{r.session.held_on}</Td>
                  <Td>
                    {r.instructorName ?? <Badge tone="caution">미배정</Badge>}
                  </Td>
                  <Td className="text-right tabular-nums">
                    <span className={r.zeroResponse ? 'text-negative' : 'text-ink'}>
                      {r.responseCount}
                    </span>
                    <span className="text-faint"> / {r.session.expected_students}</span>
                  </Td>
                  <Td>
                    {r.closed ? <Badge>마감</Badge> : <Badge tone="positive">수집 중</Badge>}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Panel>

      <section className="grid gap-5 lg:grid-cols-2">
        <Panel
          title="수요가 가장 큰 조합"
          description="후속 의향 3점 이상만 센 숫자입니다."
          actions={
            <Link href="/org/demand" className="text-sm text-point hover:underline">
              수요 전체
            </Link>
          }
        >
          {clusters.length === 0 ? (
            <p className="text-sm text-sub">아직 응답이 없습니다.</p>
          ) : (
            <ul className="space-y-2.5">
              {clusters.slice(0, 5).map((c) => (
                <li
                  key={`${c.field}-${c.gradeBand}`}
                  className="flex items-center justify-between gap-3"
                >
                  <span className="min-w-0 text-sm text-ink">
                    {c.field}
                    <span className="ml-1.5 text-xs text-sub">
                      {gradeBandLabel(c.gradeBand)}
                    </span>
                    {c.supplyCount === 0 ? (
                      <Badge tone="caution" className="ml-2">
                        공급 0
                      </Badge>
                    ) : null}
                  </span>
                  <span className="shrink-0 text-sm font-medium text-ink tabular-nums">
                    {c.intentCount}명
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel
          title="섭외 진행"
          description="보낸 요청과 강사 응답입니다."
          actions={
            <Link href="/org/recruitment" className="text-sm text-point hover:underline">
              섭외 화면
            </Link>
          }
        >
          {recruitment.length === 0 ? (
            <p className="text-sm text-sub">
              아직 보낸 섭외 요청이 없습니다. 수요를 확인하고 지역 강사에게 요청을 보낼 수 있습니다.
            </p>
          ) : (
            <ul className="space-y-2.5 text-sm">
              {recruitment.slice(0, 5).map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3">
                  <span className="min-w-0">
                    <span className="text-ink">{r.instructorName}</span>
                    <span className="ml-1.5 text-xs text-sub">
                      {r.field} · 수요 {r.demandCount}명
                    </span>
                  </span>
                  <Badge
                    tone={
                      r.status === 'accepted'
                        ? 'positive'
                        : r.status === 'declined'
                          ? 'negative'
                          : 'caution'
                    }
                  >
                    {r.status === 'accepted'
                      ? '수락'
                      : r.status === 'declined'
                        ? '거절'
                        : '응답 대기'}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
          {awaitingInstructor.length > 0 ? (
            <p className="mt-4 text-xs text-sub">
              {awaitingInstructor.length}건이 강사 응답을 기다리고 있습니다.
            </p>
          ) : null}
        </Panel>
      </section>

      <Panel title="인맥 밖의 강사 찾기" description="공개 디렉토리에서 지역 강사를 직접 둘러볼 수 있습니다.">
        <Link
          href="/programs"
          className="inline-flex items-center gap-1.5 text-sm text-point hover:underline hover:underline-offset-4"
        >
          프로그램 디렉토리 열기
          <IconArrowRight width={16} height={16} />
        </Link>
      </Panel>
    </div>
  )
}
