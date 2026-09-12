import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

/**
 * 빈 화면을 절대 그대로 보여주지 않는다 (E-07 — 파일럿에서 과반 예상).
 * 무엇이 없는지 + 대신 할 수 있는 것(Q&A)을 같은 크기로 준다.
 */
export function EmptyState({
  title,
  description,
  action,
  secondary,
  className,
}: {
  title: string
  description?: ReactNode
  action?: ReactNode
  secondary?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'rounded-lg border border-dashed border-line-strong bg-card px-6 py-10 text-center',
        className,
      )}
    >
      <p className="text-base font-semibold text-ink">{title}</p>
      {description ? (
        <div className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-body">{description}</div>
      ) : null}
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
      {secondary ? <div className="mt-3 text-xs text-sub">{secondary}</div> : null}
    </div>
  )
}
