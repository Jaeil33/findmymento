import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { StatusBadge } from '@/components/studio/StatusBadge'
import { Badge } from '@/components/ui/Badge'
import { buttonClass } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageHeader, Panel } from '@/components/ui/Section'
import { StatTile } from '@/components/ui/StatTile'
import { getActor } from '@/lib/auth/actor'
import { loadDataset } from '@/lib/db/dataset'
import { studioHeads, studioStats } from '@/lib/studio/library'
import { CONTENT_KIND_LABEL, type StudioArtifact } from '@/types/studio'
import { GRADE_BAND_LABEL } from '@/types/domain'

export const metadata = { title: '콘텐츠 스튜디오' }

/** 목록에 보여줄 요약 지표. 콘텐츠 종류마다 의미 있는 숫자가 다르다. */
function summaryItems(artifact: StudioArtifact): { label: string; value: string }[] {
  if (artifact.kind === 'pen3d') {
    return [
      { label: '예상 제작', value: `${Math.round(artifact.metrics.estimated_minutes)}분` },
      {
        label: '부품 · 접합',
        value: `${artifact.metrics.part_count} · ${artifact.metrics.joint_count}`,
      },
      { label: '난이도', value: `${artifact.metrics.difficulty}단계` },
    ]
  }
  return [
    { label: '예상 소요', value: `${Math.round(artifact.metrics.estimated_minutes)}분` },
    { label: '비행 명령', value: `${artifact.metrics.command_count}개` },
    { label: '난이도', value: `${artifact.metrics.difficulty}단계` },
  ]
}

/**
 * 라이브러리. **상태를 목록에서 바로 읽을 수 있어야 한다** — 수업 전날 밤에 여는 화면이고,
 * 그때 "이게 쓸 수 있는 도안인가"가 첫 질문이다 (ADR-030).
 */
export default async function StudioLibraryPage() {
  const actor = await getActor()
  if (!actor || actor.role !== 'instructor') redirect('/login')

  const ds = await loadDataset()
  const me = ds.instructors.find((i) => i.id === actor.instructorId)
  if (!me) notFound()

  const heads = studioHeads(ds.studioContents, me.id)
  const stats = studioStats(ds.studioContents, me.id)
  const feedbackCount = ds.studioFeedback.filter((f) => f.instructor_id === me.id).length

  return (
    <div className="space-y-8">
      <PageHeader
        title="내 실습 콘텐츠"
        description="학년대·인원·시수·장비에 맞는 3D펜 도안을 만들고, 검증을 통과한 것만 수업에 씁니다. 좌표와 치수는 프로그램이 계산합니다."
        actions={
          <Link href="/instructor/studio/new" className={buttonClass({ variant: 'primary' })}>
            도안 만들기
          </Link>
        }
      />

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          emphasis
          label="수업에 쓸 수 있는 산출물"
          value={stats.usable}
          unit="개"
          tone="point"
          sub="검증 통과 + 승인"
        />
        <StatTile label="승인 완료" value={stats.approved} unit="개" tone="positive" />
        <StatTile
          label="검증 실패"
          value={stats.failed}
          unit="개"
          tone={stats.failed > 0 ? 'negative' : 'default'}
          sub={stats.failed > 0 ? '조건을 바꿔 다시 만들어야 합니다' : undefined}
        />
        <StatTile label="수업 결과 기록" value={feedbackCount} unit="건" sub="3건부터 제작 시간 계산에 반영" />
      </section>

      <Panel
        title="산출물"
        description="같은 도안을 다시 만들면 버전이 쌓입니다. 목록에는 최신 버전만 보여줍니다."
      >
        {heads.length === 0 ? (
          <EmptyState
            title="아직 만든 콘텐츠가 없습니다"
            description="수업 주제와 학년대·시수만 넣으면 A4 1:1 도안과 조립 순서, 실습 과제가 한 번에 나옵니다."
            action={
              <Link href="/instructor/studio/new" className={buttonClass({ variant: 'primary' })}>
                첫 도안 만들기
              </Link>
            }
          />
        ) : (
          <ul className="divide-y divide-line">
            {heads.map(({ content, version_count }) => {
              const session = content.session_id
                ? ds.lectureSessions.find((s) => s.id === content.session_id)
                : null
              const summary = summaryItems(content.artifact)
              return (
                <li key={content.id} className="py-4 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/instructor/studio/${content.id}`}
                          className="text-base font-semibold text-ink underline-offset-4 hover:underline"
                        >
                          {content.title}
                        </Link>
                        <StatusBadge status={content.status} />
                        {version_count > 1 ? (
                          <Badge tone="neutral">v{content.version} · 버전 {version_count}개</Badge>
                        ) : null}
                      </div>
                      <p className="mt-1 text-sm text-sub">
                        {CONTENT_KIND_LABEL[content.kind]} ·{' '}
                        {GRADE_BAND_LABEL[content.spec.grade_band]} {content.spec.duration_minutes}분
                        · {content.spec.venue}
                        {session ? ` · ${session.title}` : ' · 라이브러리'}
                      </p>
                    </div>
                    <dl className="flex shrink-0 gap-5 text-right text-xs text-sub">
                      {summary.map((item) => (
                        <div key={item.label}>
                          <dt>{item.label}</dt>
                          <dd className="mt-0.5 text-sm font-semibold tabular-nums text-ink">
                            {item.value}
                          </dd>
                        </div>
                      ))}
                    </dl>
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
