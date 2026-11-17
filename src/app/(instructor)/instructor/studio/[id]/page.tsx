import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ApproveButton } from '@/components/studio/ApproveButton'
import { FeedbackForm } from '@/components/studio/FeedbackForm'
import { StatusBadge } from '@/components/studio/StatusBadge'
import { StencilPreview } from '@/components/studio/StencilPreview'
import { ValidationReport } from '@/components/studio/ValidationReport'
import { Badge } from '@/components/ui/Badge'
import { buttonClass } from '@/components/ui/Button'
import { PageHeader, Panel } from '@/components/ui/Section'
import { StatTile } from '@/components/ui/StatTile'
import { DEMO_SOURCE_LABEL, SOURCE_LABEL } from '@/components/ai/AssistProgress'
import { demoAiEnabled } from '@/lib/ai/demo-writer'
import { getActor } from '@/lib/auth/actor'
import { loadDataset } from '@/lib/db/dataset'
import { calibrationFor, studioContentById, studioLineage } from '@/lib/studio/library'
import { GRADE_BAND_LABEL } from '@/types/domain'
import {
  DIFFICULTY_VOTE_LABEL,
  isUsable,
  type PenArtifact,
  type StudioContent,
} from '@/types/studio'

export const metadata = { title: '산출물' }

/**
 * 산출물 상세. 순서가 중요하다 — **검증 결과를 도안보다 먼저 보여준다.**
 * 도안이 먼저 보이면 강사는 통과 여부를 읽지 않고 인쇄한다 (ADR-030).
 */
export default async function StudioContentPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const actor = await getActor()
  if (!actor || actor.role !== 'instructor') redirect('/login')

  const { id } = await params
  const ds = await loadDataset()
  const me = ds.instructors.find((i) => i.id === actor.instructorId)
  if (!me) notFound()

  const content = studioContentById(ds.studioContents, id)
  // 남의 산출물은 없는 것과 같이 다룬다 (ADR-031).
  if (!content || content.instructor_id !== me.id) notFound()

  const history = studioLineage(ds.studioContents, content.lineage_id)
  const session = content.session_id
    ? ds.lectureSessions.find((s) => s.id === content.session_id)
    : null
  const feedback = ds.studioFeedback.filter((f) => f.content_id === content.id)
  const calibration = calibrationFor(
    ds.studioContents,
    ds.studioFeedback,
    content.recipe_id,
    content.spec.grade_band,
  )

  const usable = isUsable(content.status)
  const artifact = content.artifact
  const metrics = artifact.metrics

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={`${content.recipe_id} · v${content.version}${session ? ` · ${session.title}` : ' · 라이브러리'}`}
        title={content.title}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge status={content.status} />
            <span>
              {GRADE_BAND_LABEL[content.spec.grade_band]} {content.spec.student_count}명 ·{' '}
              {content.spec.duration_minutes}분 · {content.spec.venue}
            </span>
            {content.source === 'llm' ? (
              // 데모 배포의 시연용 응답을 실제 LLM 이 쓴 것처럼 보이게 두지 않는다 (ADR-025).
              <Badge tone="neutral">
                {demoAiEnabled() ? DEMO_SOURCE_LABEL : SOURCE_LABEL.llm}
              </Badge>
            ) : null}
            {calibration ? (
              <Badge tone="caution">
                지난 수업 {calibration.sample_count}건 반영 (시간 ×{calibration.speed_factor})
              </Badge>
            ) : null}
          </span>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {usable ? (
              <>
                <Link
                  href={`/stencil/${content.id}`}
                  className={buttonClass({ variant: 'primary' })}
                  target="_blank"
                >
                  인쇄하기
                </Link>
                <a
                  href={`/api/studio/${content.id}/svg`}
                  className={buttonClass({ variant: 'secondary' })}
                >
                  SVG 내려받기
                </a>
              </>
            ) : null}
            <Link
              href={`/instructor/studio/new?lineage=${content.lineage_id}`}
              className={buttonClass({ variant: 'secondary' })}
            >
              새 버전 만들기
            </Link>
          </div>
        }
      />

      {/* 1. 검증 결과 — 도안보다 먼저 */}
      <Panel
        title="검증 결과"
        description="생성 → 검증 → 개선 → 재검증의 전 과정입니다. 통과하지 못한 도안은 내려받기와 인쇄가 막혀 있습니다."
      >
        <ValidationReport
          rounds={content.rounds}
          status={content.status}
          gradeBand={content.spec.grade_band}
        />
        {content.status === 'validated' ? (
          <div className="mt-5 border-t border-line pt-4">
            <p className="mb-3 text-sm leading-relaxed text-body">
              검증은 통과했습니다. <strong className="text-ink">강사가 한 번 확인해야</strong>{' '}
              수업 사용 가능으로 표시됩니다 — 기준은 치수와 시간만 보고, 수업에서 의미가 있는지는
              보지 못합니다.
            </p>
            <ApproveButton id={content.id} />
          </div>
        ) : null}
      </Panel>

      {/* 2. 지표 */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          emphasis
          label="예상 제작 시간"
          value={Math.round(metrics.estimated_minutes)}
          unit="분"
          tone={metrics.estimated_minutes > metrics.available_minutes ? 'negative' : 'point'}
          sub={`가용 ${Math.round(metrics.available_minutes)}분 (수업 ${content.spec.duration_minutes}분 − 준비·정리 20분)`}
        />
        {artifact.kind === 'pen3d' ? (
          <>
            <StatTile
              label="부품"
              value={artifact.metrics.part_count}
              unit="개"
              sub={`${artifact.metrics.unique_part_count}종 · 접합 ${artifact.metrics.joint_count}곳`}
            />
            <StatTile
              label="총 선 길이"
              value={Math.round(artifact.metrics.total_stroke_mm)}
              unit="mm"
              sub={`그리기 ${Math.round(artifact.metrics.draw_seconds / 60)}분`}
            />
            <StatTile
              label="최소 선 간격"
              value={artifact.metrics.min_gap_mm ?? '충분'}
              unit={artifact.metrics.min_gap_mm === null ? undefined : 'mm'}
              sub={`최소 선 길이 ${artifact.metrics.min_segment_mm ?? '-'}mm · 최소 내각 ${artifact.metrics.min_angle_deg ?? '-'}도`}
            />
          </>
        ) : null}
      </section>

      {/* 3. 도안 */}
      {artifact.kind === 'pen3d' ? (
        <Panel title="도안" description="A4 1:1. 같은 모양은 한 번만 인쇄하고 수량을 표기합니다.">
          <StencilPreview artifact={artifact} status={content.status} />
        </Panel>
      ) : null}

      {/* 4. 조립과 과제 */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="조립 순서">
          <ol className="space-y-3">
            {(artifact as PenArtifact).assembly.map((step, i) => (
              <li key={i} className="flex gap-3 text-sm leading-relaxed text-body">
                <span className="mt-0.5 shrink-0 rounded bg-muted px-1.5 text-xs font-semibold tabular-nums text-sub">
                  {i + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </Panel>

        <div className="space-y-6">
          <Panel title="학생 실습 과제">
            <ul className="space-y-2">
              {artifact.tasks.map((task, i) => (
                <li key={i} className="text-sm leading-relaxed text-body">
                  · {task}
                </li>
              ))}
            </ul>
          </Panel>
          <Panel title="안전 안내" description="수업 시작 전에 그대로 읽어 주세요.">
            <ul className="space-y-2">
              {artifact.safety_notes.map((note, i) => (
                <li key={i} className="text-sm leading-relaxed text-body">
                  · {note}
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>

      {/* 5. 성과 */}
      <Panel
        title="수업 결과"
        description="회차 단위 집계만 기록합니다. 누가 완성하지 못했는지는 저장하지 않습니다."
      >
        {feedback.length > 0 ? (
          <ul className="mb-5 divide-y divide-line">
            {feedback.map((row) => (
              <li key={row.id} className="py-3 first:pt-0">
                <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-body">
                  <span className="tabular-nums">
                    완성 {row.completed_count}/{row.attempted_count}명 (
                    {Math.round((row.completed_count / row.attempted_count) * 100)}%)
                  </span>
                  <span className="tabular-nums">· 실제 {row.actual_minutes}분</span>
                  <Badge
                    tone={
                      row.difficulty_vote === 'too_hard'
                        ? 'caution'
                        : row.difficulty_vote === 'right'
                          ? 'positive'
                          : 'neutral'
                    }
                  >
                    {DIFFICULTY_VOTE_LABEL[row.difficulty_vote]}
                  </Badge>
                </p>
                {row.note ? (
                  <p className="mt-1 text-sm leading-relaxed text-sub">{row.note}</p>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
        <FeedbackForm contentId={content.id} estimatedMinutes={metrics.estimated_minutes} />
      </Panel>

      {/* 6. 버전 */}
      {history.length > 1 ? (
        <Panel title="버전 이력" description="앞 버전은 지워지지 않습니다.">
          <ul className="divide-y divide-line">
            {history.map((row: StudioContent) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <span className="flex items-center gap-2 text-sm text-body">
                  <span className="font-semibold tabular-nums text-ink">v{row.version}</span>
                  <StatusBadge status={row.status} />
                  <span className="text-xs text-sub">
                    {new Date(row.created_at).toLocaleDateString('ko-KR')} · 예상{' '}
                    {Math.round(row.artifact.metrics.estimated_minutes)}분
                  </span>
                </span>
                {row.id === content.id ? (
                  <span className="text-xs text-sub">보고 있는 버전</span>
                ) : (
                  <Link
                    href={`/instructor/studio/${row.id}`}
                    className="text-xs text-point underline-offset-4 hover:underline"
                  >
                    열기
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
    </div>
  )
}
