import type { ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

export type ChipProps = {
  selected?: boolean
} & ButtonHTMLAttributes<HTMLButtonElement>

export function Chip({ selected = false, className, type = 'button', ...rest }: ChipProps) {
  return (
    <button
      type={type}
      aria-pressed={selected}
      className={cn(
        'rounded-full px-4 py-2 text-sm transition-colors min-h-11',
        selected
          ? 'border border-point bg-point-bg text-point font-medium'
          : 'border border-line-strong text-body hover:bg-muted',
        'disabled:cursor-not-allowed disabled:opacity-45',
        className,
      )}
      {...rest}
    />
  )
}
