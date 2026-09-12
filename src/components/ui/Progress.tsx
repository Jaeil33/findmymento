/** 설문 진행 상태. 학생 화면은 항상 지금 몇 번째인지를 보여준다 (SURVEY.md 설계 원칙 6). */
export function Progress({
  current,
  total,
  label,
}: {
  current: number
  total: number
  label?: string
}) {
  const pct = Math.min(100, Math.max(0, Math.round((current / total) * 100)))
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <p className="text-xs font-medium text-sub">{label ?? '진행'}</p>
        <p className="text-xs font-medium text-sub tabular-nums">
          {current} / {total}
        </p>
      </div>
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={current}
        aria-label={label ?? '설문 진행'}
      >
        <div
          className="h-full rounded-full bg-point transition-[width] duration-200"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}
