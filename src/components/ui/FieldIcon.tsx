import type { ReactNode, SVGProps } from 'react'
import type { Field } from '@/types/domain'

/**
 * 신산업 분야 라인 아이콘. `Icons.tsx` 와 같은 규칙을 따른다 —
 * strokeWidth 1.5, 둥근 배경 박스로 감싸지 않고, 항상 분야 이름 텍스트와 같이 쓴다.
 */
const PATHS: Record<Field, ReactNode> = {
  드론: (
    <>
      <rect x="9.5" y="9.5" width="5" height="5" rx="1" />
      <path d="M9.5 9.5 7.3 7.3M14.5 9.5l2.2-2.2M9.5 14.5l-2.2 2.2M14.5 14.5l2.2 2.2" />
      <circle cx="5.5" cy="5.5" r="2.5" />
      <circle cx="18.5" cy="5.5" r="2.5" />
      <circle cx="5.5" cy="18.5" r="2.5" />
      <circle cx="18.5" cy="18.5" r="2.5" />
    </>
  ),
  '3D 모델링·프린팅': (
    <>
      <path d="M12 3.5 19.5 7.75v8.5L12 20.5l-7.5-4.25v-8.5Z" />
      <path d="M4.5 7.75 12 12l7.5-4.25M12 12v8.5" />
    </>
  ),
  'VR·AR': (
    <>
      <path d="M5.5 7.5h13a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-3.3a1.5 1.5 0 0 1-1.3-.75l-.6-1.05a1.5 1.5 0 0 0-2.6 0l-.6 1.05a1.5 1.5 0 0 1-1.3.75H5.5a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2Z" />
      <path d="M3.5 11H2M22 11h-1.5" />
    </>
  ),
  'AI·코딩': <path d="M8.5 7.5 4 12l4.5 4.5M15.5 7.5 20 12l-4.5 4.5M13.5 5l-3 14" />,
  뷰티: (
    <>
      <rect x="8.5" y="13" width="7" height="7.5" rx="1" />
      <path d="M9.5 13v-3h5v3" />
      <path d="M10.5 10V6.3a1 1 0 0 1 .55-.9l2.45-1.2V10" />
    </>
  ),
}

export function FieldIcon({ field, ...rest }: { field: string } & SVGProps<SVGSVGElement>) {
  const path = PATHS[field as Field] ?? <circle cx="12" cy="12" r="7.5" />
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      width={24}
      height={24}
      {...rest}
    >
      {path}
    </svg>
  )
}
