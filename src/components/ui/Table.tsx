import type { ReactNode, ThHTMLAttributes, TdHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

/** 표는 좁은 화면에서만 가로 스크롤한다. 페이지 본문은 절대 가로로 스크롤되지 않는다. */
export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className="-mx-5 overflow-x-auto px-5">
      <table className={cn('w-full min-w-[34rem] border-collapse text-sm', className)}>
        {children}
      </table>
    </div>
  )
}

export function Th({ className, children, ...rest }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      scope="col"
      className={cn(
        'border-b border-line bg-muted px-3 py-2.5 text-left text-xs font-semibold text-sub first:rounded-l-md last:rounded-r-md',
        className,
      )}
      {...rest}
    >
      {children}
    </th>
  )
}

export function Td({ className, children, ...rest }: TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td className={cn('border-b border-line px-3 py-3 align-middle text-body', className)} {...rest}>
      {children}
    </td>
  )
}
