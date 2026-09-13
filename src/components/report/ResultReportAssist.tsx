'use client'

import { Fragment } from 'react'
import { Distribution } from '@/components/data/Distribution'
import {
  AssistProgress,
  AssistResultHeader,
  DraftMetric,
  DraftNotices,
  useAssistRequest,
} from '@/components/ai/AssistProgress'
import { CopyButton } from '@/components/ai/CopyButton'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Panel } from '@/components/ui/Section'
import { cn } from '@/lib/cn'
import { formatAverage, reportSections, resultReportToText } from '@/lib/report/text'
import type { ResultReportDraft } from '@/types/domain'

/** 실제로 거치는 순서: 집계 → 5건 임계치 → 숫자·이름 가드 → 문장 (lib/ai/result-report). */
const STAGES = ['회차 응답 집계', '표본 5건 기준 확인', '숫자·이름 검증', '보고서 문장 정리']

/**
 * 결과보고서 초안 (ADR-024 기능 4). 기관·학교 담당자가 상급기관·학교에 내는 문서의 초안이다.
 *
 * **실제 결과보고서 양식처럼** 보이게 만든다 — 제목, 개요 표, 지표, 번호 붙은 본문. 숫자는 규칙이
 * 확정한 값을 그대로 쓰고, 초안이라는 사실(배지·고지문)을 숨기지 않는다. 아무것도 저장하지 않는다.
 */
export function ResultReportAssist({
  sessionId,
  stageMs = 450,
}: {
  sessionId: string
  stageMs?: number
}) {
  const { draft, source, pending, active, error, run } = useAssistRequest<ResultReportDraft>(
    '/api/result-report',
    sessionId,
    STAGES.length,
    stageMs,
  )

  return (
    <Panel
      title="결과보고서 초안"
      description="회차 응답 집계로 보고용 초안을 만듭니다. 저장되지 않습니다."
    >
      <Button onClick={run} disabled={pending}>
        {pending ? '만드는 중…' : draft ? '다시 만들기' : '결과보고서 초안 만들기'}
      </Button>

      {error ? (
        <p role="alert" className="mt-3 text-sm text-negative">
          {error}
        </p>
      ) : null}

      {pending ? (
        <div className="mt-5">
          <AssistProgress stages={STAGES} active={active} />
        </div>
      ) : draft ? (
        <div className="mt-5 animate-fade-in space-y-4">
          <AssistResultHeader source={source} responseCount={draft.metrics.response_count} />
          <ReportDocument draft={draft} />
          <CopyButton label="전체 복사" text={resultReportToText(draft)} />
          <DraftNotices notices={draft.notices} />
        </div>
      ) : null}
    </Panel>
  )
}

function ReportDocument({ draft }: { draft: ResultReportDraft }) {
  const m = draft.metrics
  const record = draft.record_reference.trim()
  // 개요가 홀수 칸이면 넓은 폭에서 마지막 값이 줄 끝까지 차지한다 — 빈 칸이 뚫린 표로 보이지 않게.
  const lastSpans = draft.overview.length % 2 === 1

  return (
    <article className="@container rounded-lg border border-t-2 border-line border-t-point bg-card">
      <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
        <h3 className="text-lg font-semibold tracking-tight text-ink">{draft.title}</h3>
        <Badge tone="caution" className="mt-1 shrink-0">
          초안
        </Badge>
      </header>

      <div className="space-y-6 px-5 py-5">
        <section>
          <h4 className="mb-2 text-sm font-semibold text-ink">운영 개요</h4>
          <dl className="grid grid-cols-[5.5rem_minmax(0,1fr)] border-t border-l border-line @lg:grid-cols-[5.5rem_minmax(0,1fr)_5.5rem_minmax(0,1fr)]">
            {draft.overview.map((o, i) => (
              <Fragment key={o.label}>
                <dt className="border-r border-b border-line bg-muted px-3 py-2 text-xs font-medium text-sub">
                  {o.label}
                </dt>
                <dd
                  className={cn(
                    'border-r border-b border-line px-3 py-2 text-sm text-ink',
                    lastSpans && i === draft.overview.length - 1 && '@lg:col-span-3',
                  )}
                >
                  {o.value}
                </dd>
              </Fragment>
            ))}
          </dl>
        </section>

        <section>
          <h4 className="mb-2 text-sm font-semibold text-ink">주요 지표</h4>
          <div className="grid grid-cols-2 gap-2 @lg:grid-cols-4">
            <DraftMetric label="응답 수" value={m.response_count} unit={`/ ${m.expected}명`} />
            <DraftMetric label="응답률" value={m.response_rate_pct} unit="%" />
            <DraftMetric
              label="만족도 평균"
              value={m.satisfaction_avg === null ? null : formatAverage(m.satisfaction_avg)}
              unit="/ 5"
            />
            <DraftMetric
              label="더 배우고 싶다"
              value={m.followup_high_count}
              unit="건"
              sub={m.followup_high_pct === null ? undefined : `${m.followup_high_pct}%`}
            />
          </div>
        </section>

        {m.top_fields.length > 0 ? (
          <section>
            <h4 className="mb-3 text-sm font-semibold text-ink">관심 분야 상위</h4>
            <Distribution
              rows={m.top_fields.map((f) => ({ label: f.field, count: f.count, tone: 'point' }))}
              total={m.response_count}
            />
          </section>
        ) : null}

        {reportSections(draft).map((s) => (
          <section key={s.key}>
            <h4 className="text-sm font-semibold text-ink">{s.heading}</h4>
            {s.key === 'student_voice' ? (
              <ul className="mt-2 space-y-2 text-sm leading-relaxed text-body">
                {s.items.map((item, i) => (
                  <li key={`${s.key}-${i}`} className="border-l-2 border-point-line pl-3">
                    {item}
                  </li>
                ))}
              </ul>
            ) : (
              <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-body marker:text-faint">
                {s.items.map((item, i) => (
                  <li key={`${s.key}-${i}`}>{item}</li>
                ))}
              </ul>
            )}
          </section>
        ))}

        {record ? (
          <section>
            <h4 className="text-sm font-semibold text-ink">창체 진로활동 기록 참고 문구 (회차 단위)</h4>
            <p className="mt-2 rounded-md bg-point-bg px-4 py-3 text-sm leading-relaxed text-ink">
              {record}
            </p>
          </section>
        ) : null}
      </div>
    </article>
  )
}
