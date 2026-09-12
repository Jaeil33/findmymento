import { cn } from '@/lib/cn'

export type DistributionRow = {
  label: string
  count: number
  /** 값별 색. 만족/불만족처럼 의미가 있는 축에만 쓴다. */
  tone?: 'positive' | 'caution' | 'negative' | 'neutral' | 'point'
}

const BAR_TONE: Record<NonNullable<DistributionRow['tone']>, string> = {
  positive: 'bg-positive',
  caution: 'bg-caution',
  negative: 'bg-negative',
  neutral: 'bg-sub',
  point: 'bg-point',
}

/**
 * 분포 막대. 차트 라이브러리를 쓰지 않는다 — 차트보다 숫자가 먼저다 (UI_GUIDE 디자인 원칙 3).
 * 막대는 비율을 읽는 보조 수단이고 정확한 값은 항상 숫자로 같이 둔다.
 */
export function Distribution({
  rows,
  total,
  className,
  emptyLabel = '아직 응답이 없어요.',
}: {
  rows: DistributionRow[]
  total?: number
  className?: string
  emptyLabel?: string
}) {
  const sum = total ?? rows.reduce((a, r) => a + r.count, 0)

  if (sum === 0) {
    return <p className={cn('text-sm text-sub', className)}>{emptyLabel}</p>
  }

  return (
    <ul className={cn('space-y-2.5', className)}>
      {rows.map((r) => {
        const pct = Math.round((r.count / sum) * 100)
        return (
          <li key={r.label} className="grid grid-cols-[auto_1fr_auto] items-center gap-3">
            {/* 라벨은 줄바꿈하지 않는다 — 두 줄로 접히면 막대 높이가 흔들려 표가 읽히지 않는다 */}
            <span className="min-w-20 shrink-0 text-sm whitespace-nowrap text-body">{r.label}</span>
            <span className="h-2 overflow-hidden rounded-sm bg-muted">
              <span
                className={cn('block h-full rounded-sm', BAR_TONE[r.tone ?? 'point'])}
                style={{ width: `${Math.max(r.count > 0 ? 2 : 0, pct)}%` }}
              />
            </span>
            <span className="w-20 shrink-0 text-right text-sm text-ink tabular-nums">
              {r.count}명
              <span className="ml-1.5 text-xs text-faint">{pct}%</span>
            </span>
          </li>
        )
      })}
    </ul>
  )
}
