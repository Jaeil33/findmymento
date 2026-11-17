import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

/**
 * 지표 타일. 숫자가 주인공이다 — 장식 없이 크고 정확하게, `tabular-nums` 필수.
 *
 * `emphasis` 는 후속 의향처럼 **만족도보다 크게 보여야 하는 지표**에 쓴다
 * (SURVEY.md: 기관 대시보드는 만족도보다 이 숫자를 크게 보여준다).
 *
 * 라벨을 위에 두고 숫자를 아래에 둔다 — 담당자가 세로로 훑을 때 숫자 열이 한 줄로 선다.
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
        'rounded-sm border bg-card px-4 py-3.5',
        // 강조 타일은 색 면이 아니라 위쪽 굵은 선으로 구분한다 — 색은 판정에만 쓴다.
        emphasis ? 'border-line border-t-2 border-t-point' : 'border-line',
        className,
      )}
    >
      <p className="text-xs font-semibold text-sub">{label}</p>
      <p className="mt-1.5 flex items-baseline gap-1">
        <span
          className={cn(
            'font-display font-bold tracking-tight tabular-nums',
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
