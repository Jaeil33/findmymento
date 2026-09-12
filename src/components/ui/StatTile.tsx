import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

/**
 * 지표 타일. 숫자가 주인공이다 — 장식 없이 크고 정확하게, `tabular-nums` 필수.
 *
 * `emphasis` 는 후속 의향처럼 **만족도보다 크게 보여야 하는 지표**에 쓴다
 * (SURVEY.md: 기관 대시보드는 만족도보다 이 숫자를 크게 보여준다).
 */
export function StatTile({
  label,
  value,
  unit,
  sub,
  emphasis = false,
  tone = 'default',
  className,
}: {
  label: string
  value: ReactNode
  unit?: string
  sub?: ReactNode
  emphasis?: boolean
  tone?: 'default' | 'positive' | 'caution' | 'negative' | 'point'
  className?: string
}) {
  const valueTone =
    tone === 'positive'
      ? 'text-positive'
      : tone === 'caution'
        ? 'text-caution'
        : tone === 'negative'
          ? 'text-negative'
          : tone === 'point'
            ? 'text-point'
            : 'text-ink'

  return (
    <div
      className={cn(
        'rounded-md bg-card border p-4',
        emphasis ? 'border-point-line bg-point-bg/40' : 'border-line',
        className,
      )}
    >
      <p className="text-sm font-medium text-sub">{label}</p>
      <p className="mt-2 flex items-baseline gap-1">
        <span
          className={cn(
            'font-semibold tabular-nums tracking-tight',
            emphasis ? 'text-4xl' : 'text-3xl',
            valueTone,
          )}
        >
          {value}
        </span>
        {unit ? <span className="text-sm font-medium text-sub">{unit}</span> : null}
      </p>
      {sub ? <p className="mt-1.5 text-xs leading-relaxed text-sub">{sub}</p> : null}
    </div>
  )
}
