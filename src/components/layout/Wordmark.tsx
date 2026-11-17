import Link from 'next/link'
import { cn } from '@/lib/cn'

/**
 * 워드마크. 이미지 파일을 쓰지 않고 인라인 SVG 심볼 + 타이포로 만든다.
 *
 * 심볼은 **A4 한 장과 그 위의 도안선**이다 — 이 제품이 내놓는 물건 그대로다.
 * 포인트 색은 청사진 블루 한 가지뿐이고 그라데이션을 쓰지 않는다 (UI_GUIDE 안티패턴).
 */
export function Wordmark({ href = '/', className }: { href?: string; className?: string }) {
  return (
    <Link
      href={href}
      className={cn(
        'inline-flex shrink-0 items-baseline gap-2 font-display text-[1.05rem] font-bold tracking-tight text-ink',
        className,
      )}
    >
      <svg
        viewBox="0 0 18 24"
        width={14}
        height={19}
        aria-hidden="true"
        focusable="false"
        className="shrink-0 translate-y-0.5 text-point"
      >
        {/* 종이 한 장 */}
        <rect
          x="0.9"
          y="0.9"
          width="16.2"
          height="22.2"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
        />
        {/* 그 위의 도안선 — 실선 하나와 접는 선 하나 */}
        <path d="M4.5 15.5 9 7l4.5 8.5Z" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path
          d="M4.5 15.5h9"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeDasharray="2 1.6"
        />
      </svg>
      <span>Find My Mento</span>
    </Link>
  )
}
