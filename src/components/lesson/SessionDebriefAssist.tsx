'use client'

import Link from 'next/link'
import {
  AssistProgress,
  AssistResultHeader,
  DraftMetric,
  DraftNotices,
  useAssistRequest,
} from '@/components/ai/AssistProgress'
import { CopyButton } from '@/components/ai/CopyButton'
import { Button, buttonClass } from '@/components/ui/Button'
import { Panel } from '@/components/ui/Section'
import { cn } from '@/lib/cn'
import { debriefToText, formatAverage } from '@/lib/report/text'
import type { SessionDebriefDraft } from '@/types/domain'

/** 실제로 거치는 순서: 집계 → 규칙 트리거 → 숫자 가드 → 요약 문장 (lib/ai/session-debrief). */
const STAGES = ['회차 응답 집계', '잘 된 점·바꿀 점 판단', '숫자 검증', '학교 제출용 요약 정리']

const SUMMARY_MAX = 400

/**
 * 수업 회고 + 학교 제출용 결과 요약 (ADR-024 기능 6). 배정 강사 자신을 위한 집계다.
 *
 * **강사를 평가하는 화면이 아니다.** 별점·게이지·등급 배지를 만들지 않는다 — 소수 지역 강사 풀에서
 * 점수는 신호가 아니라 낙인이 된다. 학생 개인도 평가하지 않는다. 아무것도 저장하지 않는다.
 */
export function SessionDebriefAssist({
  sessionId,
  stageMs = 450,
}: {
  sessionId: string
  stageMs?: number
}) {
  const { draft, source, pending, active, error, run } = useAssistRequest<SessionDebriefDraft>(
    '/api/session-debrief',
    sessionId,
    STAGES.length,
    stageMs,
  )

  return (
    <Panel
      title="수업 회고"
      description="이 회차 응답 집계로 잘 된 점, 다음에 바꿀 점, 학교 제출용 요약을 만듭니다."
    >
      <Button onClick={run} disabled={pending}>
        {pending ? '만드는 중…' : draft ? '다시 만들기' : '수업 회고 만들기'}
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
        <div className="@container mt-5 animate-fade-in space-y-6">
          <AssistResultHeader source={source} responseCount={draft.metrics.response_count} />
          <DebriefBody draft={draft} sessionId={sessionId} />
          <DraftNotices notices={draft.notices} />
        </div>
      ) : null}
    </Panel>
  )
}

function DebriefBody({ draft, sessionId }: { draft: SessionDebriefDraft; sessionId: string }) {
  const m = draft.metrics
  const columns = [
    { title: '잘 된 점', items: draft.went_well, line: 'border-positive' },
    { title: '다음에 바꿀 점', items: draft.change_next, line: 'border-caution' },
  ].filter((c) => c.items.length > 0)

  return (
    <>
      <div className="grid grid-cols-2 gap-2 @lg:grid-cols-4">
        <DraftMetric
          label="응답 수"
          value={m.response_count}
          unit="건"
          sub={`응답률 ${m.response_rate_pct}%`}
        />
        <DraftMetric
          label="만족도 평균"
          value={m.satisfaction_avg === null ? null : formatAverage(m.satisfaction_avg)}
          unit="/ 5"
        />
        <DraftMetric label="만족도 4·5점" value={m.high_satisfaction_pct} unit="%" />
        <DraftMetric label="더 배우고 싶다" value={m.followup_high_pct} unit="%" />
      </div>

      {columns.length > 0 ? (
        <div className={cn('grid gap-4', columns.length === 2 && 'md:grid-cols-2')}>
          {columns.map((c) => (
            <section key={c.title} className={cn('border-l-2 pl-4', c.line)}>
              <h3 className="text-sm font-semibold text-ink">{c.title}</h3>
              <ul className="mt-2 space-y-1.5 text-sm leading-relaxed text-body">
                {c.items.map((item, i) => (
                  <li key={`${c.title}-${i}`}>{item}</li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      ) : null}

      <section>
        <h3 className="text-sm font-semibold text-ink">학교 제출용 요약</h3>
        <p className="mt-2 rounded-lg border border-line bg-muted px-5 py-4 text-sm leading-relaxed text-body">
          {draft.school_summary}
        </p>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <CopyButton label="요약 복사" text={debriefToText(draft)} />
          <span className="text-xs text-faint tabular-nums">
            {draft.school_summary.length} / {SUMMARY_MAX}자
          </span>
        </div>
      </section>

      <div>
        <Link
          href={`/instructor/sessions/${sessionId}/plan`}
          className={buttonClass({ variant: 'secondary' })}
        >
          교안 다시 만들기
        </Link>
      </div>
    </>
  )
}
