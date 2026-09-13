import type { ReactNode } from 'react'
import { IconMinus, IconPlus } from '@/components/ui/Icons'

export type FaqItem = { q: string; a: ReactNode }

/**
 * 자주 묻는 질문. `<details>` 로 여닫아 클라이언트 JS 가 없다.
 * 여닫힘에 애니메이션을 붙이지 않는다 (UI_GUIDE 애니메이션 규칙 — fade-in / slide-up 외 금지).
 */
export function Faq({ items }: { items: FaqItem[] }) {
  return (
    <div className="divide-y divide-line border-y border-line">
      {items.map((item) => (
        <details key={item.q} className="group">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 text-left text-base font-medium text-ink hover:text-point [&::-webkit-details-marker]:hidden">
            <span>{item.q}</span>
            <IconPlus className="shrink-0 text-sub group-open:hidden" />
            <IconMinus className="hidden shrink-0 text-point group-open:block" />
          </summary>
          <div className="pr-10 pb-6 text-sm leading-relaxed text-body">{item.a}</div>
        </details>
      ))}
    </div>
  )
}
