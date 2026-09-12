import type { ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

export type ButtonVariant = 'primary' | 'secondary' | 'text'
export type ButtonSize = 'default' | 'student'

export type ButtonProps = {
  variant?: ButtonVariant
  size?: ButtonSize
} & ButtonHTMLAttributes<HTMLButtonElement>

const BASE =
  'inline-flex items-center justify-center gap-2 font-medium transition-colors ' +
  'disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-2 ' +
  'focus-visible:outline-offset-2 focus-visible:outline-point'

const VARIANT: Record<ButtonVariant, string> = {
  primary: 'rounded-lg bg-point text-white hover:bg-point-hover px-4 py-2.5',
  secondary:
    'rounded-lg bg-card border border-line-strong text-body hover:bg-muted px-4 py-2.5',
  text: 'text-sub hover:text-ink underline-offset-4 hover:underline',
}

/** 학생 화면은 터치 타깃 48px 이상, 글자 16px 이상 (iOS 자동 확대 방지). */
const SIZE: Record<ButtonSize, string> = {
  default: 'text-sm min-h-10',
  student: 'w-full min-h-12 text-base',
}

/** `<Link>` 에도 같은 모양을 주기 위해 클래스 계산을 따로 노출한다. */
export function buttonClass({
  variant = 'primary',
  size = 'default',
  className,
}: {
  variant?: ButtonVariant
  size?: ButtonSize
  className?: string
} = {}): string {
  return cn(BASE, VARIANT[variant], SIZE[size], className)
}

export function Button({
  variant = 'primary',
  size = 'default',
  className,
  type = 'button',
  ...rest
}: ButtonProps) {
  return <button type={type} className={buttonClass({ variant, size, className })} {...rest} />
}
