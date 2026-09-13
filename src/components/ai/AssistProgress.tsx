'use client'

import { useEffect, useRef, useState } from 'react'
import { Badge } from '@/components/ui/Badge'
import { IconCheck } from '@/components/ui/Icons'
import { cn } from '@/lib/cn'

/**
 * 수업 후 AI 초안 패널(결과보고서·후속 과정·수업 회고)이 같이 쓰는 부품 (ADR-024).
 *
 * - `AssistProgress` — 스피너 대신 **지금 무엇을 하는지** 정적 문구로 보여준다 (UI_GUIDE 애니메이션 규칙).
 *   단계 문구는 각 기능이 실제로 거치는 처리만 적는다. 없는 처리를 한다고 보여주면 신뢰를 잃는다.
 * - `useAssistRequest` — 자기 `/api/*` 라우트만 부른다. LLM 을 클라이언트에서 부르지 않고,
 *   초안을 브라우저 저장소에 남기지 않는다 (기관 PC 는 공용인 경우가 많다).
 * - 머리줄·고지 박스·지표 타일 — 세 패널이 같은 모양이어야 같은 종류의 문서로 읽힌다.
 */

export type AssistSource = 'llm' | 'rule'

/** source 는 검수용 값이다. 이 두 문구 외의 표현을 쓰지 않는다 (docs/AI.md). */
export const SOURCE_LABEL: Record<AssistSource, string> = {
  llm: 'AI가 문장을 정리했습니다',
  rule: '응답 집계로 만들었습니다',
}

/** LLM 키 없는 데모 배포의 시연용 AI 응답 (ADR-025). 실제 LLM 이 쓴 것처럼 보이게 두지 않는다. */
export const DEMO_SOURCE_LABEL = '시연용 AI 문장입니다'

const NETWORK_ERROR = '인터넷 연결이 끊긴 것 같습니다. 다시 시도해 주세요.'

export function AssistProgress({ stages, active }: { stages: string[]; active: number }) {
  return (
    <div role="status" aria-live="polite">
      <ol className="space-y-2">
        {stages.map((stage, i) => {
          const state = i < active ? 'done' : i === active ? 'active' : 'waiting'
          return (
            <li
              key={stage}
              data-state={state}
              className={cn(
                'flex animate-fade-in items-center gap-2.5 text-sm',
                state === 'done' && 'text-body',
                state === 'active' && 'font-medium text-point',
                state === 'waiting' && 'text-faint',
              )}
            >
              <span className="flex h-4 w-4 shrink-0 items-center justify-center" aria-hidden="true">
                {state === 'done' ? (
                  <IconCheck width={16} height={16} className="text-point" />
                ) : (
                  <span className="block h-1.5 w-1.5 rounded-full bg-current" />
                )}
              </span>
              <span>{state === 'active' ? `${stage}…` : stage}</span>
              {state === 'done' ? <span className="sr-only">(완료)</span> : null}
            </li>
          )
        })}
      </ol>
    </div>
  )
}

type ApiBody<T> = { ok?: boolean; message?: string; source?: AssistSource; draft?: T }

/**
 * 초안 요청 + 단계 표시. 단계는 `stageMs` 마다 하나씩 넘어가고 마지막 단계에서 응답을 기다린다.
 * 응답이 먼저 와도 **각 단계를 stageMs 씩 보여 준 뒤** 결과를 낸다. `stageMs` 가 0이면 기다리지 않는다.
 * 실패는 기다리지 않고 바로 알린다.
 */
export function useAssistRequest<T extends { source: AssistSource }>(
  endpoint: string,
  sessionId: string,
  stageCount: number,
  stageMs: number,
) {
  const [draft, setDraft] = useState<T | null>(null)
  const [source, setSource] = useState<AssistSource>('rule')
  const [pending, setPending] = useState(false)
  const [active, setActive] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const ticker = useRef<ReturnType<typeof setInterval> | null>(null)

  function stopTicker() {
    if (ticker.current !== null) {
      clearInterval(ticker.current)
      ticker.current = null
    }
  }

  useEffect(() => stopTicker, [])

  async function run() {
    stopTicker()
    setError(null)
    setActive(0)
    setPending(true)

    const last = Math.max(stageCount - 1, 0)
    if (stageMs > 0) {
      ticker.current = setInterval(() => setActive((a) => Math.min(a + 1, last)), stageMs)
    }
    const shown = stageMs > 0 ? new Promise<void>((r) => setTimeout(r, stageMs * stageCount)) : null

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      })
      const data = (await res.json()) as ApiBody<T>
      if (!res.ok || !data.ok || !data.draft) {
        setError(data.message ?? '초안을 만들지 못했습니다.')
        return
      }
      if (shown) await shown
      setDraft(data.draft)
      setSource(data.source ?? data.draft.source)
    } catch {
      setError(NETWORK_ERROR)
    } finally {
      stopTicker()
      setPending(false)
    }
  }

  return { draft, source, pending, active, error, run }
}

/** 결과 맨 위 한 줄: source 문구 + 사실 칩. AI 마케팅 장식을 두지 않는다. */
export function AssistResultHeader({
  source,
  responseCount,
  demo = false,
}: {
  source: AssistSource
  responseCount: number
  /** 서버가 판단한 시연 모드 여부. true 이고 source 가 llm 이면 시연 문구를 쓴다. */
  demo?: boolean
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-medium text-sub">{source === 'llm' && demo ? DEMO_SOURCE_LABEL : SOURCE_LABEL[source]}</span>
      <Badge tone="neutral">응답 {responseCount}건 집계</Badge>
      <Badge tone="neutral">저장되지 않음</Badge>
    </div>
  )
}

/** 초안 고지. 첫 줄(초안입니다…)을 굵게, 나머지는 본문으로. 작은 회색 각주로 숨기지 않는다. */
export function DraftNotices({ notices }: { notices: string[] }) {
  const [first, ...rest] = notices.filter((n) => n.trim() !== '')
  if (!first) return null
  return (
    <div role="note" className="rounded-lg border border-caution/30 bg-caution-bg px-4 py-3 text-sm">
      <p className="font-semibold text-ink">{first}</p>
      {rest.length > 0 ? (
        <ul className="mt-1.5 space-y-1 leading-relaxed text-body">
          {rest.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

/** 초안 안의 작은 지표 타일. 값이 null 이면 숫자 대신 — 와 `표본 부족`. */
export function DraftMetric({
  label,
  value,
  unit,
  sub,
}: {
  label: string
  value: number | string | null
  unit?: string
  sub?: string
}) {
  const missing = value === null
  const note = missing ? '표본 부족' : sub
  return (
    <div className="rounded-md border border-line bg-card p-3">
      <p className="text-xs font-medium text-sub">{label}</p>
      <p className="mt-1.5 flex items-baseline gap-1">
        <span className="text-2xl font-semibold tracking-tight text-ink tabular-nums">
          {missing ? '—' : value}
        </span>
        {!missing && unit ? <span className="text-xs font-medium text-sub">{unit}</span> : null}
      </p>
      {note ? <p className="mt-1 text-xs text-sub tabular-nums">{note}</p> : null}
    </div>
  )
}
