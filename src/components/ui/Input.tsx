'use client'

import { useId, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

export type FieldSize = 'default' | 'student'

const FIELD_BASE =
  'block w-full rounded-lg bg-card border border-line-strong text-ink placeholder:text-faint ' +
  'focus:border-point focus:ring-1 focus:ring-point focus:outline-none ' +
  'disabled:bg-muted disabled:text-faint'

/** 학생 화면은 16px 이상이어야 한다 — 미만이면 iOS 에서 포커스 시 화면이 확대된다. */
const FIELD_SIZE: Record<FieldSize, string> = {
  default: 'px-4 py-3 text-sm',
  student: 'px-4 py-4 text-base',
}

export type InputProps = {
  label: string
  size?: FieldSize
  hint?: string
  error?: string
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'size'>

/** placeholder 를 라벨 대신 쓰지 않는다. 모든 입력에 `<label>` 을 연결한다 (접근성). */
export function Input({
  label,
  size = 'default',
  hint,
  error,
  id,
  className,
  required,
  ...rest
}: InputProps) {
  const auto = useId()
  const inputId = id ?? auto
  const hintId = hint ? `${inputId}-hint` : undefined
  const errorId = error ? `${inputId}-error` : undefined

  return (
    <div className="space-y-1.5">
      <label htmlFor={inputId} className="block text-sm font-medium text-body">
        {label}
        {required ? <span className="ml-1 text-negative">*</span> : null}
      </label>
      {hint ? (
        <p id={hintId} className="text-xs text-sub">
          {hint}
        </p>
      ) : null}
      <input
        id={inputId}
        required={required}
        aria-describedby={cn(hintId, errorId) || undefined}
        aria-invalid={error ? true : undefined}
        className={cn(FIELD_BASE, FIELD_SIZE[size], error && 'border-negative', className)}
        {...rest}
      />
      {error ? (
        <p id={errorId} className="text-xs text-negative">
          {error}
        </p>
      ) : null}
    </div>
  )
}

export type TextareaProps = {
  label: string
  size?: FieldSize
  hint?: string
  error?: string
  /** 입력란 **바로 위**에 놓는 공개 범위 고지. 작은 각주로 숨기지 않는다 (UI_GUIDE 안전규칙 3). */
  notice?: string
  counter?: { value: number; max: number }
} & TextareaHTMLAttributes<HTMLTextAreaElement>

export function Textarea({
  label,
  size = 'default',
  hint,
  error,
  notice,
  counter,
  id,
  className,
  required,
  ...rest
}: TextareaProps) {
  const auto = useId()
  const areaId = id ?? auto
  const hintId = hint ? `${areaId}-hint` : undefined
  const errorId = error ? `${areaId}-error` : undefined

  return (
    <div className="space-y-1.5">
      <label htmlFor={areaId} className="block text-sm font-medium text-body">
        {label}
        {required ? <span className="ml-1 text-negative">*</span> : null}
      </label>
      {hint ? (
        <p id={hintId} className="text-xs text-sub">
          {hint}
        </p>
      ) : null}
      {notice ? (
        <p className="rounded-md border border-caution/30 bg-caution-bg px-3 py-2 text-xs leading-relaxed text-caution">
          {notice}
        </p>
      ) : null}
      <textarea
        id={areaId}
        required={required}
        aria-describedby={cn(hintId, errorId) || undefined}
        aria-invalid={error ? true : undefined}
        className={cn(
          FIELD_BASE,
          FIELD_SIZE[size],
          'min-h-28 resize-y leading-relaxed',
          error && 'border-negative',
          className,
        )}
        {...rest}
      />
      <div className="flex items-start justify-between gap-3">
        {error ? (
          <p id={errorId} className="text-xs text-negative">
            {error}
          </p>
        ) : (
          <span />
        )}
        {counter ? (
          <p className="text-xs text-faint tabular-nums">
            {counter.value} / {counter.max}
          </p>
        ) : null}
      </div>
    </div>
  )
}

export type SelectProps = {
  label: string
  size?: FieldSize
  hint?: string
  error?: string
  options: { value: string; label: string }[]
  placeholder?: string
} & Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size' | 'children'>

export function Select({
  label,
  size = 'default',
  hint,
  error,
  options,
  placeholder,
  id,
  className,
  required,
  ...rest
}: SelectProps) {
  const auto = useId()
  const selectId = id ?? auto

  return (
    <div className="space-y-1.5">
      <label htmlFor={selectId} className="block text-sm font-medium text-body">
        {label}
        {required ? <span className="ml-1 text-negative">*</span> : null}
      </label>
      {hint ? <p className="text-xs text-sub">{hint}</p> : null}
      <select
        id={selectId}
        required={required}
        aria-invalid={error ? true : undefined}
        className={cn(FIELD_BASE, FIELD_SIZE[size], 'pr-10', error && 'border-negative', className)}
        {...rest}
      >
        {placeholder ? <option value="">{placeholder}</option> : null}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {error ? <p className="text-xs text-negative">{error}</p> : null}
    </div>
  )
}
