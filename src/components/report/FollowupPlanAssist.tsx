'use client'

import Link from 'next/link'
import { useId } from 'react'
import {
  AssistProgress,
  AssistResultHeader,
  DraftNotices,
  useAssistRequest,
} from '@/components/ai/AssistProgress'
import { CopyButton } from '@/components/ai/CopyButton'
import { Badge, type BadgeTone } from '@/components/ui/Badge'
import { Button, buttonClass } from '@/components/ui/Button'
import { IconArrowRight } from '@/components/ui/Icons'
import { Panel } from '@/components/ui/Section'
import { cn } from '@/lib/cn'
import { followupMessageToText } from '@/lib/report/text'
import type { FollowupCandidate, FollowupPlanDraft } from '@/types/domain'

/** 실제로 거치는 순서: 후속 의향 집계 → 분야·시간 1위 → 2-hop 후보 → 문장 (lib/ai/followup-plan). */
const STAGES = [
  '더 배우고 싶다는 응답 집계',
  '관심 분야와 참여 시간 확인',
  '가까운 지역 강사 찾기',
  '과정안·섭외 문안 정리',
]

const MESSAGE_MAX = 400

const DISTANCE: Record<number, { label: string; tone: BadgeTone }> = {
  0: { label: '같은 시군구', tone: 'point' },
  1: { label: '인접 지역', tone: 'neutral' },
  2: { label: '조금 먼 지역', tone: 'neutral' },
}

/**
 * 후속 과정 제안 + 섭외 요청 문안 (ADR-024 기능 5). 수요 → 후보 → 문안이 한 흐름으로 읽혀야
 * 섭외 요청(주 지표)까지 한 단계가 된다.
 *
 * - 강사 후보는 **공개 프로필 링크만** 가진다. 연락처 자리를 만들지 않는다.
 * - 섭외 요청을 **자동으로 보내지 않는다.** 기관이 문안을 복사해 섭외 화면에서 직접 보낸다.
 * - 모집·정원·수강료를 다루지 않는다 (ADR-023). 아무것도 저장하지 않는다.
 */
export function FollowupPlanAssist({
  sessionId,
  stageMs = 450,
}: {
  sessionId: string
  stageMs?: number
}) {
  const { draft, source, pending, active, error, run } = useAssistRequest<FollowupPlanDraft>(
    '/api/followup-plan',
    sessionId,
    STAGES.length,
    stageMs,
  )

  return (
    <Panel
      title="후속 과정 제안"
      description="더 배우고 싶다는 응답으로 후속 과정과 섭외 문안을 제안합니다. 모집·수강료는 다루지 않습니다."
    >
      <Button onClick={run} disabled={pending}>
        {pending ? '만드는 중…' : draft ? '다시 만들기' : '후속 과정 제안받기'}
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
        <div className="mt-5 animate-fade-in space-y-6">
          <AssistResultHeader source={source} responseCount={draft.response_count} />
          {draft.eligible ? (
            <EligiblePlan draft={draft} />
          ) : (
            <p className="text-sm leading-relaxed text-body">{draft.reason}</p>
          )}
          <DraftNotices notices={draft.notices} />
        </div>
      ) : null}
    </Panel>
  )
}

function EligiblePlan({ draft }: { draft: FollowupPlanDraft }) {
  const messageId = useId()
  const total = draft.response_count
  const flow = [
    { label: '전체 응답', count: draft.response_count, bar: 'bg-sub' },
    { label: '더 배우고 싶다', count: draft.demand_count, bar: 'bg-point' },
    { label: `${draft.field ?? ''} 관심`, count: draft.field_interest_count, bar: 'bg-point' },
  ]
  const showCandidates = draft.supply_status === 'available' && draft.candidates.length > 0

  return (
    <>
      <section>
        <h3 className="text-sm font-semibold text-ink">후속 수요</h3>
        <p className="mt-0.5 text-xs text-sub">전체 응답에서 더 배우고 싶다는 응답, 그중 관심 분야 순으로 좁혀 셉니다.</p>
        <ol className="mt-3 space-y-2.5">
          {flow.map((row) => {
            const pct = total > 0 ? Math.round((row.count / total) * 100) : 0
            return (
              <li
                key={row.label}
                className="grid grid-cols-[minmax(0,10.5rem)_minmax(0,1fr)_3.5rem] items-center gap-3"
              >
                <span className="text-sm leading-snug text-body">{row.label}</span>
                <span className="h-2 overflow-hidden rounded-sm bg-muted">
                  <span
                    className={cn('block h-full rounded-sm', row.bar)}
                    style={{ width: `${Math.max(row.count > 0 ? 2 : 0, pct)}%` }}
                  />
                </span>
                <span className="text-right text-sm font-medium text-ink tabular-nums">{row.count}건</span>
              </li>
            )
          })}
        </ol>
        {draft.top_time ? (
          <div className="mt-3">
            <Badge tone="point">가장 많이 고른 시간 · {draft.top_time}</Badge>
          </div>
        ) : null}
      </section>

      {showCandidates ? (
        <section>
          <h3 className="text-sm font-semibold text-ink">가까운 지역 강사</h3>
          <p className="mt-0.5 text-xs text-sub">
            거리순 → 이름순. 소속 업체·유료 여부는 순서에 반영하지 않습니다.
          </p>
          <ul className="mt-3 space-y-2">
            {draft.candidates.map((c) => (
              <CandidateRow key={c.instructor_id} candidate={c} />
            ))}
          </ul>
        </section>
      ) : null}

      {draft.suggested_title || draft.outline.length > 0 ? (
        <section>
          <h3 className="text-sm font-semibold text-ink">과정안</h3>
          {draft.suggested_title ? (
            <p className="mt-2 text-base font-semibold text-ink">{draft.suggested_title}</p>
          ) : null}
          {draft.outline.length > 0 ? (
            <ol className="mt-3 divide-y divide-line rounded-md border border-line">
              {draft.outline.map((line, i) => {
                const { body, meta } = splitOutlineLine(line)
                return (
                  <li key={`${i}-${line}`} className="flex gap-3 px-4 py-2.5">
                    <span className="w-14 shrink-0 text-xs leading-5 font-medium text-point tabular-nums">
                      {i + 1}차시
                    </span>
                    <span className="min-w-0 text-sm leading-5 text-body">
                      {body}
                      {meta ? <span className="ml-1.5 text-xs text-sub tabular-nums">{meta}</span> : null}
                    </span>
                  </li>
                )
              })}
            </ol>
          ) : null}
        </section>
      ) : null}

      {draft.request_message ? (
        <section>
          <label htmlFor={messageId} className="text-sm font-semibold text-ink">
            섭외 요청 문안
          </label>
          <p className="mt-0.5 text-xs text-sub">섭외 요청 화면의 요청 메모에 붙여 넣으세요.</p>
          <textarea
            id={messageId}
            readOnly
            rows={7}
            value={draft.request_message}
            className="mt-2 block w-full resize-y rounded-lg border border-line-strong bg-muted px-4 py-3 text-sm leading-relaxed text-body focus:border-point focus:ring-1 focus:ring-point focus:outline-none"
          />
          <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
            <CopyButton label="문안 복사" text={followupMessageToText(draft)} />
            <span className="text-xs text-faint tabular-nums">
              {draft.request_message.length} / {MESSAGE_MAX}자
            </span>
          </div>
        </section>
      ) : null}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {/* 새 탭으로 연다 — 초안은 저장되지 않으므로 이 화면을 떠나면 사라진다. */}
        <Link
          href="/org/recruitment"
          target="_blank"
          rel="noopener noreferrer"
          className={buttonClass({ variant: 'primary' })}
        >
          섭외 요청 화면으로
          <IconArrowRight width={16} height={16} />
        </Link>
        <p className="text-xs leading-relaxed text-sub">
          새 탭에서 열립니다. 요청은 자동으로 보내지 않고, 그 화면에서 직접 보냅니다.
        </p>
      </div>
    </>
  )
}

function CandidateRow({ candidate: c }: { candidate: FollowupCandidate }) {
  const distance = DISTANCE[c.distance] ?? { label: '조금 먼 지역', tone: 'neutral' as const }
  return (
    <li className="flex items-center justify-between gap-3 rounded-md border border-line px-4 py-3">
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        <span className="font-medium text-ink">{c.name}</span>
        <span className="text-sm text-sub">{c.region_label}</span>
        <Badge tone={distance.tone}>{distance.label}</Badge>
      </div>
      <Link
        href={`/instructors/${c.instructor_id}`}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`${c.name} 공개 프로필 (새 탭)`}
        className="shrink-0 text-sm text-point underline-offset-4 hover:text-point-hover hover:underline"
      >
        공개 프로필
      </Link>
    </li>
  )
}

/**
 * 차시 줄은 `1차시(50분) · 내용` 꼴이 많다. 왼쪽에 `{n}차시` 라벨을 따로 두므로 앞머리의 차시 번호만
 * 떼고 괄호 속 시간은 뒤에 작게 붙인다. 내용 문장은 고치지 않는다 (복사본은 원문 그대로다).
 */
const OUTLINE_HEAD_RE = /^\s*\d+\s*차시\s*(?:\(([^)]*)\))?\s*[·:\-–]?\s*/

function splitOutlineLine(line: string): { body: string; meta: string | null } {
  const m = OUTLINE_HEAD_RE.exec(line)
  const body = m ? line.slice(m[0].length) : ''
  return m && body ? { body, meta: m[1] ?? null } : { body: line, meta: null }
}
