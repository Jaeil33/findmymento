import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { Badge } from '@/components/ui/Badge'
import { buttonClass } from '@/components/ui/Button'
import { StatTile } from '@/components/ui/StatTile'
import { PageHeader, Panel } from '@/components/ui/Section'
import { getActor } from '@/lib/auth/actor'
import { loadDataset } from '@/lib/db/dataset'
import {
  gradeBandLabel,
  instructorLeads,
  instructorSessions,
  qnaThreads,
  recruitmentForInstructor,
  regionDemand,
} from '@/lib/db/queries'
import { regionName } from '@/lib/region'
import { IconQr } from '@/components/ui/Icons'
import { StatusBadge } from '@/components/studio/StatusBadge'
import { studioHeads, studioStats } from '@/lib/studio/library'

export const metadata = { title: '요약' }

export default async function InstructorHomePage() {
  const actor = await getActor()
  if (!actor || actor.role !== 'instructor') redirect('/login')

  const ds = await loadDataset()
  const me = ds.instructors.find((i) => i.id === actor.instructorId)
  if (!me) notFound()

  const sessions = instructorSessions(ds, me.id)
  const leads = instructorLeads(ds, me.id)
  const requests = recruitmentForInstructor(ds, me.id)
  const pendingRequests = requests.filter((r) => r.request.status === 'sent')
  const demand = regionDemand(ds, me.region_code).filter((d) =>
    (me.fields as string[]).includes(d.field),
  )
  const unanswered = qnaThreads(ds, {}).filter(
    (t) => t.unanswered && (me.fields as string[]).includes(t.question.field),
  )

  const studio = studioHeads(ds.studioContents, me.id)
  const studioSummary = studioStats(ds.studioContents, me.id)

  const responseTotal = sessions.reduce((a, s) => a + s.responseCount, 0)
  const demandTotal = demand.reduce((a, d) => a + d.intentCount, 0)
  const upcoming = sessions.find((s) => !s.closed)

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={`${me.fields.join(' · ')} · ${regionName(me.region_code)}`}
        title={`${me.name} 강사님`}
        description="수업에 쓸 실습 콘텐츠를 만들고, 배정된 회차와 내 수업을 좋아한 학생들이 어디에 있는지 보여 줍니다."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/instructor/studio/new" className={buttonClass({ variant: 'primary' })}>
              도안 만들기
            </Link>
            {upcoming ? (
              <Link
                href={`/project/${upcoming.session.id}`}
                className={buttonClass({ variant: 'secondary' })}
              >
                <IconQr width={16} height={16} />
                교실에 QR 띄우기
              </Link>
            ) : null}
          </div>
        }
      />

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          emphasis
          label="수업에 쓸 수 있는 산출물"
          value={studioSummary.usable}
          unit="개"
          tone="point"
          sub={
            studioSummary.failed > 0
              ? `검증 실패 ${studioSummary.failed}개는 조건을 바꿔 다시 만들어야 합니다`
              : '검증을 통과한 도안만 셉니다'
          }
        />
        <StatTile
          label="내 분야를 더 배우고 싶다는 응답"
          value={demandTotal}
          unit="건"
          sub={`${regionName(me.region_code)}와 인접 지역 집계`}
        />
        <StatTile label="배정 회차" value={sessions.length} unit="개" sub={`총 응답 ${responseTotal}건`} />
        <StatTile
          label="섭외·문의"
          value={pendingRequests.length + leads.length}
          unit="건"
          tone={pendingRequests.length > 0 ? 'caution' : 'default'}
          sub={`섭외 요청 ${pendingRequests.length}건 · 전달받은 문의 ${leads.length}건`}
        />
      </section>

      <Panel
        title="콘텐츠 스튜디오"
        description="학년대·시수·장비에 맞는 도안을 만들고, 검증을 통과한 것만 수업에 씁니다."
        actions={
          <Link href="/instructor/studio" className="text-sm text-point hover:underline">
            전체
          </Link>
        }
      >
        {studio.length === 0 ? (
          <p className="text-sm leading-relaxed text-sub">
            아직 만든 콘텐츠가 없습니다. 주제와 수업 조건만 넣으면 A4 1:1 도안과 조립 순서, 실습
            과제가 한 번에 나옵니다.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {studio.slice(0, 4).map(({ content }) => (
              <li
                key={content.id}
                className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0"
              >
                <span className="flex min-w-0 flex-wrap items-center gap-2">
                  <Link
                    href={`/instructor/studio/${content.id}`}
                    className="text-sm font-medium text-ink underline-offset-4 hover:underline"
                  >
                    {content.title}
                  </Link>
                  <StatusBadge status={content.status} />
                </span>
                <span className="shrink-0 text-xs tabular-nums text-sub">
                  예상 {Math.round(content.artifact.metrics.estimated_minutes)}분 · 난이도{' '}
                  {content.artifact.metrics.difficulty}단계
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {upcoming ? (
        <Panel
          title="수업 마무리 안내"
          description="학생 유입의 실제 트리거는 교실 벽의 포스터가 아니라 강사님의 한마디입니다."
        >
          <div className="space-y-3">
            <p className="rounded-md border border-point-line bg-point-bg px-4 py-3 text-sm leading-relaxed text-body">
              &ldquo;수업 끝나기 전에 이 QR 한 번 찍어 줄래요? 오늘 배운 걸 더 해보고 싶은 사람에게
              다음에 들을 수 있는 수업을 찾아줘요. 3분이면 끝나요.&rdquo;
            </p>
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span className="text-sub">{upcoming.session.title}</span>
              <span className="font-semibold text-ink tabular-nums">
                코드 {upcoming.session.entry_code}
              </span>
              <Link
                href={`/project/${upcoming.session.id}`}
                className="text-point underline underline-offset-4 hover:text-point-hover"
              >
                전체화면으로 띄우기
              </Link>
            </div>
          </div>
        </Panel>
      ) : null}

      <section className="grid gap-5 lg:grid-cols-2">
        <Panel
          title="배정된 회차"
          description="기관이 만든 회차에 배정된 것만 보입니다."
          actions={
            <Link href="/instructor/sessions" className="text-sm text-point hover:underline">
              전체
            </Link>
          }
        >
          {sessions.length === 0 ? (
            <p className="text-sm leading-relaxed text-sub">
              아직 배정된 회차가 없습니다. 회차는 기관·학교가 만들고 강사를 배정합니다.
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {sessions.slice(0, 4).map((s) => (
                <li key={s.session.id} className="flex items-start justify-between gap-3 py-3 first:pt-0">
                  <div className="min-w-0">
                    <Link
                      href={`/instructor/sessions/${s.session.id}`}
                      className="text-sm font-medium text-ink hover:underline hover:underline-offset-4"
                    >
                      {s.session.title}
                    </Link>
                    <p className="mt-0.5 text-xs text-sub">
                      {s.orgName} · {s.session.held_on} · {gradeBandLabel(s.session.grade_band)}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-medium text-ink tabular-nums">
                      {s.responseCount}
                      <span className="text-faint">/{s.session.expected_students}</span>
                    </p>
                    {s.responseCount === 0 && !s.closed ? (
                      <Badge tone="negative">응답 0</Badge>
                    ) : s.closed ? (
                      <Badge>마감</Badge>
                    ) : (
                      <Badge tone="positive">수집 중</Badge>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel
          title="답변이 없는 질문"
          description="내 분야 질문입니다. 답변은 모두에게 공개됩니다."
          actions={
            <Link href="/instructor/qna" className="text-sm text-point hover:underline">
              답변하기
            </Link>
          }
        >
          {unanswered.length === 0 ? (
            <p className="text-sm text-sub">답변 대기 중인 질문이 없습니다.</p>
          ) : (
            <ul className="space-y-3">
              {unanswered.slice(0, 4).map((t) => (
                <li key={t.question.id}>
                  <div className="flex items-center gap-2">
                    <Badge tone="point">{t.question.field}</Badge>
                    <span className="text-xs text-sub">{t.question.student_alias}</span>
                    {t.hoursWaiting >= 48 ? (
                      <Badge tone="caution">{t.hoursWaiting}시간 경과</Badge>
                    ) : null}
                  </div>
                  <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-body">
                    {t.question.body}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </section>
    </div>
  )
}
