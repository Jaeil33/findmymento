import type { SVGProps } from 'react'

/**
 * 인라인 SVG, strokeWidth 1.5.
 * 아이콘을 둥근 배경 박스로 감싸지 않고, 단독으로 의미를 전달하지 않는다 — 항상 텍스트 라벨과 같이 쓴다.
 */
function Svg({ children, ...rest }: SVGProps<SVGSVGElement>) {
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
      width={18}
      height={18}
      {...rest}
    >
      {children}
    </svg>
  )
}

export const IconArrowRight = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Svg>
)

export const IconArrowLeft = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="M19 12H5M11 18l-6-6 6-6" />
  </Svg>
)

export const IconCheck = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="M4 12.5 9 17.5 20 6.5" />
  </Svg>
)

export const IconClose = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Svg>
)

export const IconCalendar = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <rect x="3.5" y="5" width="17" height="15" rx="2" />
    <path d="M3.5 10h17M8 3.5v3M16 3.5v3" />
  </Svg>
)

export const IconMapPin = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="M12 21s7-6.1 7-11a7 7 0 1 0-14 0c0 4.9 7 11 7 11Z" />
    <circle cx="12" cy="10" r="2.5" />
  </Svg>
)

export const IconUsers = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="M16 19v-1.5A3.5 3.5 0 0 0 12.5 14h-5A3.5 3.5 0 0 0 4 17.5V19" />
    <circle cx="10" cy="8" r="3" />
    <path d="M20 19v-1.5a3.5 3.5 0 0 0-2.6-3.4M15.5 5.3a3 3 0 0 1 0 5.4" />
  </Svg>
)

export const IconQr = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <rect x="3.5" y="3.5" width="6" height="6" rx="1" />
    <rect x="14.5" y="3.5" width="6" height="6" rx="1" />
    <rect x="3.5" y="14.5" width="6" height="6" rx="1" />
    <path d="M14.5 14.5h2.5v2.5h-2.5zM20.5 14.5h-1M14.5 20.5h2.5M20.5 18v2.5h-1" />
  </Svg>
)

export const IconChart = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
  </Svg>
)

export const IconChat = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="M20.5 12c0 3.9-3.8 7-8.5 7-1 0-2-.15-2.9-.42L4 20.5l1.3-3.4C4.2 15.7 3.5 13.95 3.5 12c0-3.9 3.8-7 8.5-7s8.5 3.1 8.5 7Z" />
  </Svg>
)

export const IconDoc = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="M14 3.5H7a1.5 1.5 0 0 0-1.5 1.5v14A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5V8z" />
    <path d="M14 3.5V8h4.5M9 12.5h6M9 16h4" />
  </Svg>
)

export const IconShield = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="M12 3.5l7 2.8v5.2c0 4.3-2.9 7.6-7 9-4.1-1.4-7-4.7-7-9V6.3z" />
    <path d="M9 12.2l2.2 2.2L15.2 10" />
  </Svg>
)

export const IconSearch = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m16 16 4 4" />
  </Svg>
)

export const IconAlert = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="M12 4.5 21 19.5H3z" />
    <path d="M12 10v4M12 16.8v.2" />
  </Svg>
)

export const IconInbox = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="M3.5 13.5 6 5h12l2.5 8.5v4a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5z" />
    <path d="M3.5 13.5H9a3 3 0 0 0 6 0h5.5" />
  </Svg>
)

export const IconSend = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="M4 12 20 4l-8 16-2-6z" />
  </Svg>
)

export const IconMenu = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </Svg>
)

export const IconPlus = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
)

export const IconMinus = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="M5 12h14" />
  </Svg>
)

export const IconLock = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <rect x="5" y="10.5" width="14" height="10" rx="1.5" />
    <path d="M8.5 10.5v-3a3.5 3.5 0 0 1 7 0v3" />
  </Svg>
)

export const IconEyeOff = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="M3.5 3.5l17 17" />
    <path d="M10.6 6.1A9.8 9.8 0 0 1 12 6c5 0 8.5 4.5 9 6-.25.75-1.2 2.3-2.8 3.7M6.3 7.8C4.3 9.1 3.2 11 3 12c.5 1.5 4 6 9 6 1.5 0 2.9-.4 4.1-1" />
    <path d="M9.9 10a3 3 0 0 0 4.1 4.1" />
  </Svg>
)
