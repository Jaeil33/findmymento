import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

export type BadgeTone = 'neutral' | 'point' | 'positive' | 'caution' | 'negative'

const TONE: Record<BadgeTone, string> = {
  neutral: 'bg-muted text-sub border-line',
  point: 'bg-point-bg text-point border-point-line',
  positive: 'bg-positive-bg text-positive border-positive/20',
  caution: 'bg-caution-bg text-caution border-caution/25',
  negative: 'bg-negative-bg text-negative border-negative/20',
}

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
        'inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        TONE[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}
