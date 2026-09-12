import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: {
    default: 'Find My Mento · 우리 지역 직업인 강사 찾기',
    template: '%s · Find My Mento',
  },
  description:
    '특강에서 생긴 관심을 지역 강사와 이어 줍니다. 학교·기관·개인이 우리 지역 직업인 강사를 찾는 매칭 플랫폼.',
  // 학생 응답 화면과 기관 대시보드 전부 비공개 성격이므로 검색 노출을 기본으로 켜지 않는다.
  robots: { index: false, follow: false },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // 학생이 교실에서 휴대폰으로 쓰는 화면이므로 확대를 막지 않는다 (접근성).
  maximumScale: 5,
  themeColor: '#fafafa',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        {/* 한글 본문 가독성을 위해 Pretendard 를 쓴다. 빌드 타임 폰트 다운로드에 의존하지 않는다. */}
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body className="min-h-dvh bg-page text-ink antialiased">{children}</body>
    </html>
  )
}
