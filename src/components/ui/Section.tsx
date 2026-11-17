import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

/**
 * 표제란(title block). 도면 왼쪽 아래에 붙는 그 칸이다 —
 * 무슨 도면인지, 어떤 조건으로 만든 것인지, 지금 뭘 할 수 있는지가 한 자리에 있다.
 *
 * `meta` 는 조건·버전처럼 **제목을 읽은 뒤에 필요한 사실**이다. 제목 위에 색칠한
 * 라벨로 올리지 않는다 (UI_GUIDE 안티패턴 — eyebrow).
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  /** 조건·분야·버전 등 제목을 보조하는 사실. 제목 아래 한 줄로 들어간다. */
  eyebrow?: string
  title: string
  description?: ReactNode
  actions?: ReactNode
  className?: string
}) {
  return (
    <header
      className={cn(
        'flex flex-wrap items-end justify-between gap-x-6 gap-y-4 border-b-2 border-ink pb-4',
        className,
      )}
    >
      <div className="min-w-0">
        <h1 className="text-[1.6rem] leading-tight text-ink">{title}</h1>
        {eyebrow ? <p className="mt-1.5 text-xs text-sub">{eyebrow}</p> : null}
        {description ? (
          <div className="mt-2.5 max-w-2xl text-sm leading-relaxed text-body">{description}</div>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  )
}

/**
 * 대시보드 안에서 본문 블록을 구분하는 최소 단위. 섹션 간 간격은 space-y-8.
 * 머리줄은 선 하나로 나눈다 — 회색 면을 덧붙이면 카드 안에 카드가 생긴다.
 */
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
    <section className={cn('rounded-md border border-line bg-card', className)}>
      {title ? (
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line px-5 py-3.5">
          <div className="min-w-0">
            <h2 className="text-[0.95rem] text-ink">{title}</h2>
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
      {footer ? (
        <div className="border-t border-line px-5 py-3 text-xs text-sub">{footer}</div>
      ) : null}
    </section>
  )
}

/**
 * 사실을 그대로 보여주는 고지 줄.
 * `등록 업체 1곳 · 강사 6명` 처럼 파일럿의 공급 규모를 숨기지 않는다 (UI_GUIDE 안전규칙 5).
 */
export function FactNote({ children }: { children: ReactNode }) {
  return (
    <p className="border-l-2 border-line-strong bg-muted/60 px-3 py-2 text-xs leading-relaxed text-body">
      {children}
    </p>
  )
}

/**
 * 측정값과 기준을 나란히 놓는 칸 — 이 제품의 판정 논리를 그대로 화면에 옮긴 것이다.
 * 검증 결과·지표·랜딩이 같은 모양을 쓴다. "통과했다"는 말보다 "3.1mm / 기준 3mm 이상"이
 * 강사에게 근거가 된다 (ADR-030).
 */
export function MeasureRow({
  items,
  className,
}: {
  items: { label: string; measured: ReactNode; limit?: ReactNode }[]
  className?: string
}) {
  return (
    <dl className={cn('grid grid-cols-1 border-y border-line sm:grid-cols-4', className)}>
      {items.map((item) => (
        <div key={item.label} className="rule-cell px-4 py-3 first:pl-0 sm:first:pl-4">
          <dt className="text-xs text-sub">{item.label}</dt>
          <dd className="mt-1 text-base font-semibold text-ink tabular-nums">{item.measured}</dd>
          {item.limit ? (
            <dd className="mt-0.5 text-xs text-sub tabular-nums">기준 {item.limit}</dd>
          ) : null}
        </div>
      ))}
    </dl>
  )
}
