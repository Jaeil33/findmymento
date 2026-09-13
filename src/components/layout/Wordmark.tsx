import Link from 'next/link'
import { cn } from '@/lib/cn'

/**
 * 워드마크. 이미지 파일을 쓰지 않고 인라인 SVG 심볼 + 타이포로 만든다.
 * 심볼은 두 점(학생의 관심 · 지역 강사)을 잇는 선 하나 — 이 제품이 하는 일 그대로다.
 * 포인트 색은 딥 틸 한 가지뿐이고 그라데이션을 쓰지 않는다 (UI_GUIDE 안티패턴).
 */
export function Wordmark({ href = '/', className }: { href?: string; className?: string }) {
  return (
    <Link
      href={href}
      className={cn(
        'inline-flex shrink-0 items-center gap-2 text-base font-semibold tracking-tight text-ink',
        className,
      )}
    >
      <svg
        viewBox="0 0 24 24"
        width={22}
        height={22}
        aria-hidden="true"
        focusable="false"
        className="shrink-0 text-point"
      >
        <path
          d="M5.5 15v-1.5a8 8 0 0 1 8-8H15"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
        />
        <circle cx="5.5" cy="18.5" r="3" fill="currentColor" />
        <circle cx="18.5" cy="5.5" r="2.75" fill="none" stroke="currentColor" strokeWidth={2} />
      </svg>
      <span>Find My Mento</span>
    </Link>
  )
}
