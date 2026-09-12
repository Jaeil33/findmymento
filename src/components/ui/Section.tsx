import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: string
  title: string
  description?: ReactNode
  actions?: ReactNode
  className?: string
}) {
  return (
    <header className={cn('flex flex-wrap items-end justify-between gap-4', className)}>
      <div className="min-w-0">
        {eyebrow ? (
          <p className="text-xs font-medium tracking-wide text-point uppercase">{eyebrow}</p>
        ) : null}
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink">{title}</h1>
        {description ? (
          <div className="mt-2 max-w-2xl text-sm leading-relaxed text-body">{description}</div>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  )
}

export function SectionHeading({
  title,
  description,
  actions,
  note,
}: {
  title: string
  description?: ReactNode
  actions?: ReactNode
  note?: ReactNode
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-base font-semibold text-ink">{title}</h2>
        {description ? (
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-sub">{description}</p>
        ) : null}
        {note ? <div className="mt-2">{note}</div> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  )
}

/** 대시보드 안에서 본문 블록을 구분하는 최소 단위. 섹션 간 간격은 space-y-8. */
export function Panel({
  title,
  description,
  actions,
  children,
  className,
  footer,
}: {
  title?: string
  description?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
  footer?: ReactNode
}) {
  return (
    <section className={cn('rounded-lg border border-line bg-card', className)}>
      {title ? (
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-ink">{title}</h2>
            {description ? (
              <p className="mt-1 text-sm leading-relaxed text-sub">{description}</p>
            ) : null}
          </div>
          {actions ? (
            <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
          ) : null}
        </div>
      ) : null}
      <div className="px-5 py-4">{children}</div>
      {footer ? <div className="border-t border-line px-5 py-3 text-xs text-sub">{footer}</div> : null}
    </section>
  )
}

/**
 * 사실을 그대로 보여주는 고지 줄.
 * `등록 업체 1곳 · 강사 6명` 처럼 파일럿의 공급 규모를 숨기지 않는다 (UI_GUIDE 안전규칙 5).
 */
export function FactNote({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-md border border-line bg-muted px-3 py-2 text-xs leading-relaxed text-body">
      {children}
    </p>
  )
}
