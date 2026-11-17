import type { ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

export type ChipProps = {
  selected?: boolean
} & ButtonHTMLAttributes<HTMLButtonElement>

/** 고르는 것이므로 알약 모양이다. 고른 것은 테두리를 두껍게 해 눈으로 먼저 보이게 한다. */
export function Chip({ selected = false, className, type = 'button', ...rest }: ChipProps) {
  return (
    <button
      type={type}
      aria-pressed={selected}
      className={cn(
        // 테두리 두께를 두 상태에서 같게 둔다 — 고를 때 칩 크기가 흔들리면 손가락이 빗나간다.
        'min-h-11 rounded-full border-2 px-4 py-2 text-sm transition-colors',
        selected
          ? 'border-point bg-point-bg font-semibold text-point'
          : 'border-line text-body hover:border-line-strong hover:bg-card',
        'disabled:cursor-not-allowed disabled:opacity-45',
        className,
      )}
      {...rest}
    />
  )
}
