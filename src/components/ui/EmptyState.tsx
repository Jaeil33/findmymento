import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

/**
 * 빈 화면을 절대 그대로 보여주지 않는다 (E-07 — 파일럿에서 과반 예상).
 * 무엇이 없는지 + 대신 할 수 있는 것(Q&A)을 같은 크기로 준다.
 *
 * 가운데 정렬하지 않는다 — 본문과 같은 자리에서 읽히는 쪽이 안내문답다.
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
      className={cn('border-l-2 border-line-strong bg-muted/50 px-5 py-6', className)}
    >
      <p className="text-base font-semibold text-ink">{title}</p>
      {description ? (
        <div className="mt-1.5 max-w-xl text-sm leading-relaxed text-body">{description}</div>
      ) : null}
      {action ? <div className="mt-4 flex flex-wrap gap-2">{action}</div> : null}
      {secondary ? <div className="mt-2.5 text-xs text-sub">{secondary}</div> : null}
    </div>
  )
}
