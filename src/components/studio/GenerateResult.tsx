'use client'

import { useState } from 'react'
import { DEMO_SOURCE_LABEL, SOURCE_LABEL } from '@/components/ai/AssistProgress'
import { StatusBadge } from '@/components/studio/StatusBadge'
import { StencilPreview } from '@/components/studio/StencilPreview'
import { ValidationReport } from '@/components/studio/ValidationReport'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { PageHeader, Panel } from '@/components/ui/Section'
import { StatTile } from '@/components/ui/StatTile'
import { renderPenSvg } from '@/lib/studio/pen3d/render'
import { GRADE_BAND_LABEL } from '@/types/domain'
import { isUsable, type PenArtifact, type StudioRound, type StudioSpec, type StudioStatus } from '@/types/studio'

export type GenerateResultData = {
  status: StudioStatus
  recipe_id: string
  reason: string
  source: 'llm' | 'rule'
  calibrated: boolean
  rounds: StudioRound[]
  artifact: PenArtifact
  /** 서버가 실제로 쓴 수업 조건. 회차에 붙은 생성은 회차 행이 정한다 (ADR-016) */
  spec: StudioSpec
  /** 주제를 바꿔 만든 경우의 안내. 캐릭터·상표 이름은 일반 형태로 바꾼다 (ADR-034) */
  topic_note?: string | null
  /**
   * 이 문장을 시연용 응답이 썼는가. 서버가 정한다 — 체험 세션도 도안 저작에서는 실제 LLM 을
   * 쓸 수 있으므로(ADR-035), 화면 밖에서 미리 계산한 값으로 표시하면 거짓말이 된다.
   */
  demo_ai?: boolean
  /**
   * 모양이 어디서 왔는가 (ADR-036). **"검수된 실루엣"과 "자동 생성"을 구분해 적는다** —
   * 이 구분을 지우면 강사는 검수되지 않은 모양을 검수된 것으로 믿는다.
   */
  shape_source?: 'recipe' | 'atlas' | 'dsl' | 'compose'
  /** 이미지 2차 검토 결과 (ADR-038). `skipped` 는 "못 했다"이고 "안 닮았다"가 아니다 */
  shape_review?: 'looks_like' | 'unrecognized' | 'skipped'
  shape_missing?: string | null
  /** 꼭 맞는 실루엣이 없어 가장 가까운 것으로 대체한 경우의 안내 */
  nearest_note?: string | null
}

const SHAPE_SOURCE_BADGE: Record<
  NonNullable<GenerateResultData['shape_source']>,
  { tone: 'positive' | 'caution' | 'neutral'; label: string } | null
> = {
  recipe: { tone: 'positive', label: '검수된 도안' },
  atlas: { tone: 'positive', label: '검수된 실루엣' },
  dsl: { tone: 'caution', label: '자동 생성 모양 · 검수 전' },
  compose: { tone: 'neutral', label: '검수된 조각 조합' },
}

/**
 * 생성 결과를 **만든 자리에서** 보여주는 화면.
 *
 * 왜 이 화면이 따로 있나: 데모·체험 모드의 저장은 서버 메모리이고, 배포(서버리스)에서는
 * 라우트 핸들러와 서버 컴포넌트가 다른 함수로 올라간다. 그래서 생성 라우트가 저장한 산출물을
 * 상세 페이지가 읽지 못하고 404 가 난다. 이 세션에서는 이동하지 않고 여기서 그린다 (ADR-033).
 *
 * 화면 규칙은 상세 페이지와 같다 (ADR-030):
 * - **검증 결과가 도안보다 먼저다.** 도안이 먼저 보이면 통과 여부를 읽지 않고 인쇄한다
 * - 통과하지 못한 도안은 인쇄도 내려받기도 열리지 않는다
 * - 저장되지 않는다는 사실을 화면에 적는다. 체험에서 만든 것이 남아 있는 것처럼 보이면 안 된다
 */
export function GenerateResult({
  data,
  demoAi,
  onReset,
}: {
  data: GenerateResultData
  /** 화면을 열 때 계산한 기본값. 이번 생성의 응답이 있으면 그쪽이 먼저다 (ADR-035) */
  demoAi: boolean
  onReset: () => void
}) {
  const [printBlocked, setPrintBlocked] = useState(false)
  const { artifact, spec, status } = data
  // 서버가 말한 값이 우선이다 — 같은 체험 세션에서도 예산에 따라 엔진이 갈린다.
  const demo = data.demo_ai ?? demoAi
  const metrics = artifact.metrics
  const usable = isUsable(status)
  const shapeBadge = data.shape_source ? SHAPE_SOURCE_BADGE[data.shape_source] : null

  /** 인쇄는 브라우저 인쇄다. 서버에서 PDF 를 만들지 않는다 (docs/STUDIO.md). */
  function print() {
    const svg = renderPenSvg(artifact, { status })
    const win = window.open('', '_blank')
    if (!win) {
      setPrintBlocked(true)
      return
    }
    win.document.write(
      `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${artifact.pattern.title}</title>` +
        `<style>@page{size:A4;margin:0}html,body{margin:0;padding:0;background:#fff}</style>` +
        `</head><body>${svg}</body></html>`,
    )
    win.document.close()
    win.focus()
    win.print()
  }

  function download() {
    const svg = renderPenSvg(artifact, { status })
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `${data.recipe_id}.svg`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={`${data.recipe_id} · 방금 만든 도안`}
        title={artifact.pattern.title}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge status={status} />
            <span>
              {GRADE_BAND_LABEL[spec.grade_band]} {spec.student_count}명 · {spec.duration_minutes}분
              · {spec.venue}
            </span>
            {data.source === 'llm' ? (
              <Badge tone="neutral">{demo ? DEMO_SOURCE_LABEL : SOURCE_LABEL.llm}</Badge>
            ) : null}
            {shapeBadge ? <Badge tone={shapeBadge.tone}>{shapeBadge.label}</Badge> : null}
            {data.shape_review === 'looks_like' ? (
              <Badge tone="neutral">모양 확인 통과</Badge>
            ) : null}
          </span>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {usable ? (
              <>
                <Button onClick={print}>인쇄하기</Button>
                <Button variant="secondary" onClick={download}>
                  SVG 내려받기
                </Button>
              </>
            ) : null}
            <Button variant="secondary" onClick={onReset}>
              조건 바꿔 다시 만들기
            </Button>
          </div>
        }
      />

      {data.topic_note ? (
        <p className="rounded-sm border border-line bg-muted px-4 py-3 text-xs leading-relaxed text-body">
          {data.topic_note}
        </p>
      ) : null}

      {data.nearest_note ? (
        <p className="rounded-sm border border-caution/25 bg-caution-bg px-4 py-3 text-xs leading-relaxed text-caution">
          {data.nearest_note}
        </p>
      ) : null}

      <p className="rounded-sm border border-caution/25 bg-caution-bg px-4 py-3 text-xs leading-relaxed text-caution">
        체험 세션이라 이 산출물은 <strong>저장되지 않습니다.</strong>
        {/* 통과하지 못한 도안에는 쓸 수 있다는 말을 붙이지 않는다 — 버튼도 열리지 않는다 (ADR-030). */}
        {usable
          ? ' 인쇄하거나 SVG 를 내려받아 수업에 쓰세요.'
          : ' 검증을 통과하지 못해 인쇄·내려받기는 열리지 않습니다.'}
        {printBlocked ? ' 인쇄 창이 막혔습니다 — SVG 를 내려받아 인쇄해 주세요.' : null}
      </p>

      {/* 1. 검증 결과 — 도안보다 먼저 */}
      <Panel title="검증 결과" description="생성 → 검증 → 개선 → 재검증 전 과정">
        <ValidationReport rounds={data.rounds} status={status} gradeBand={spec.grade_band} />
        {data.reason !== '' ? (
          <p className="mt-4 border-t border-line pt-4 text-sm leading-relaxed text-body">
            {data.reason}
          </p>
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
          sub={`가용 ${Math.round(metrics.available_minutes)}분 (수업 ${spec.duration_minutes}분 − 준비·정리 20분)`}
        />
        <StatTile
          label="부품"
          value={metrics.part_count}
          unit="개"
          sub={`${metrics.unique_part_count}종 · 접합 ${metrics.joint_count}곳`}
        />
        <StatTile
          label="총 선 길이"
          value={Math.round(metrics.total_stroke_mm)}
          unit="mm"
          sub={`그리기 ${Math.round(metrics.draw_seconds / 60)}분`}
        />
        <StatTile
          label="최소 선 간격"
          value={metrics.min_gap_mm ?? '충분'}
          unit={metrics.min_gap_mm === null ? undefined : 'mm'}
          sub={`최소 선 길이 ${metrics.min_segment_mm ?? '-'}mm · 최소 내각 ${metrics.min_angle_deg ?? '-'}도`}
        />
      </section>

      {/*
        3. 도안 · 조립 · 과제 — 한 묶음이다.

        A4 는 세로로 길고 부품은 윗부분에만 찬다. 도안을 가로 폭 전체로 깔면 그 옆과 아래가
        통째로 빈 종이가 되어, 조립 순서에 닿기까지 화면 한 장을 그냥 지나게 된다.
        옆에 조립·과제를 세워 그 여백을 쓴다. 도안이 DOM 에서 먼저이므로 읽는 순서는 그대로다.
      */}
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]">
        <Panel title="도안" description="A4 1:1 · 같은 모양은 한 번만 인쇄하고 수량 표기">
          <StencilPreview artifact={artifact} status={status} />
        </Panel>

        <div className="space-y-6">
          <Panel title="조립 순서">
            <ol className="space-y-3">
              {artifact.assembly.map((step, i) => (
                <li key={i} className="flex gap-3 text-sm leading-relaxed text-body">
                  <span className="mt-0.5 shrink-0 rounded bg-muted px-1.5 text-xs font-semibold tabular-nums text-sub">
                    {i + 1}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </Panel>

          <Panel title="학생 실습 과제">
            <ul className="space-y-2">
              {artifact.tasks.map((task, i) => (
                <li key={i} className="text-sm leading-relaxed text-body">
                  {task}
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title="안전 안내">
            <ul className="space-y-2">
              {artifact.safety_notes.map((note, i) => (
                <li key={i} className="text-sm leading-relaxed text-body">
                  {note}
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  )
}
