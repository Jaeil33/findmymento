import Link from 'next/link'
import { cn } from '@/lib/cn'

/**
 * 워드마크. 로고 이미지를 쓰지 않는다 — 타이포만으로 만든다.
 * 포인트 색은 딥 틸 한 가지뿐이고 그라데이션을 쓰지 않는다 (UI_GUIDE 안티패턴).
 */
export function Wordmark({ href = '/', className }: { href?: string; className?: string }) {
  return (
    <Link
      href={href}
      className={cn(
        'group inline-flex items-baseline gap-1.5 text-base font-semibold tracking-tight text-ink',
        className,
      )}
    >
      <span>Find My Mento</span>
      <span
        aria-hidden="true"
        className="h-1.5 w-1.5 translate-y-[-0.1rem] rounded-full bg-point"
      />
    </Link>
  )
}
