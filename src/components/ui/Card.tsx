import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

export type CardVariant = 'dashboard' | 'student' | 'tile'

export type CardProps = {
  variant?: CardVariant
} & HTMLAttributes<HTMLDivElement>

/**
 * 모서리 반경을 용도별로 다르게 쓴다. 전부 `rounded-2xl` 이면 템플릿처럼 보인다
 * (UI_GUIDE 안티패턴 표).
 */
const VARIANT: Record<CardVariant, string> = {
  dashboard: 'rounded-lg bg-card border border-line p-6',
  student: 'rounded-xl bg-card border border-line p-5 active:bg-muted',
  tile: 'rounded-md bg-card border border-line p-4',
}

export function Card({ variant = 'dashboard', className, ...rest }: CardProps) {
  return <div className={cn(VARIANT[variant], className)} {...rest} />
}
