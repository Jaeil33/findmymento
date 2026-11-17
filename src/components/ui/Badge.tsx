import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

export type BadgeTone = 'neutral' | 'point' | 'positive' | 'caution' | 'negative'

const TONE: Record<BadgeTone, string> = {
  neutral: 'bg-muted text-body border-line-strong',
  point: 'bg-point-bg text-point border-point-line',
  positive: 'bg-positive-bg text-positive border-positive/30',
  caution: 'bg-caution-bg text-caution border-caution/35',
  negative: 'bg-negative-bg text-negative border-negative/30',
}

/** 상태 표시다. 각을 세워 도장에 가깝게 둔다 — 알약 모양은 선택 칩에만 쓴다. */
export function Badge({
  tone = 'neutral',
  children,
  className,
}: {
  tone?: BadgeTone
  children: ReactNode
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-xs border px-1.5 py-0.5 text-xs font-semibold whitespace-nowrap',
        TONE[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}
