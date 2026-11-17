import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: {
    default: 'Find My Mento · 실습 수업 콘텐츠 스튜디오',
    template: '%s · Find My Mento',
  },
  description:
    '학년대·인원·시수·장비를 넣으면 A4 1:1 도안과 조립 순서, 실습 과제가 나옵니다. 검증을 통과한 도안만 인쇄됩니다.',
  // 학생 응답 화면과 기관 대시보드 전부 비공개 성격이므로 검색 노출을 기본으로 켜지 않는다.
  robots: { index: false, follow: false },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // 학생이 교실에서 휴대폰으로 쓰는 화면이므로 확대를 막지 않는다 (접근성).
  maximumScale: 5,
  themeColor: '#e9edee',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        {/* 본문·숫자 한 벌 — Pretendard. 작은 한글이 가장 잘 읽힌다. 빌드 타임 폰트 다운로드에 의존하지 않는다. */}
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
        {/*
          제목용 한 벌 — IBM Plex Sans KR. 제도 계열 산세리프이고 한글을 위해 따로 설계됐다.
          이 제품의 산출물은 치수가 적힌 종이이므로, 제목의 톤을 도면 표제란 쪽에 맞춘다.
          본문·숫자는 전부 Pretendard 그대로다 (UI_GUIDE 타이포그래피).
        */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+KR:wght@500;600;700&display=swap"
        />
      </head>
      <body className="min-h-dvh bg-page text-ink antialiased">{children}</body>
    </html>
  )
}
