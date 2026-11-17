import Link from 'next/link'

/**
 * 계정 없는 화면(학생·보호자·공개)의 안내 한 줄.
 *
 * 대시보드에는 `DashboardShell` 이 같은 안내를 둔다. 학생·보호자에게는 로그아웃할 계정이 없으므로
 * 역할 고르기로 돌아가는 링크만 둔다.
 *
 * **모드 판정을 직접 하지 않는다** — 레이아웃이 넘겨준다. 체험 여부는 쿠키를 읽어야 알 수 있고
 * (`lib/demo/mode.ts`), 그 비동기 읽기를 이 작은 컴포넌트까지 끌고 오면 렌더 경로가 전부 비동기가 된다.
 *
 * - `demo`: 데모 시드를 보고 있다 (키 없는 데모 배포)
 * - `tour`: 로그인 없이 둘러보는 체험 세션이다 (ADR-033). 실 DB 가 붙어 있어도 데모 시드만 본다
 */
export function DemoBar({ demo = false, tour = false }: { demo?: boolean; tour?: boolean }) {
  if (!demo && !tour) return null
  return (
    <div className="border-b border-caution/25 bg-caution-bg">
      <p className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 py-2 text-center text-xs text-caution sm:px-6">
        {tour ? (
          <span>
            체험 모드입니다. 보이는 숫자·이름과 AI 문장은 데모 데이터이고, 실제 기관·학생 데이터가
            아닙니다.
          </span>
        ) : (
          <span>데모 데이터 모드입니다. 화면의 숫자·이름과 AI 문장은 시연용 예시입니다.</span>
        )}
        <Link href="/login" className="font-medium underline underline-offset-4 hover:text-ink">
          역할 다시 고르기
        </Link>
        {tour ? (
          /* 평범한 `<a>` 다 — 이 띠는 모든 화면 위에 있어서, `next/link` 로 걸면 라우터가
             미리 호출하는 것만으로 둘러보는 도중에 체험이 꺼진다 (ADR-033).
             `/tour/exit` 는 페이지가 아니라 라우트 핸들러라 아래 규칙이 가리키는 경우가 아니다. */
          // eslint-disable-next-line @next/next/no-html-link-for-pages
          <a href="/tour/exit" className="font-medium underline underline-offset-4 hover:text-ink">
            체험 종료
          </a>
        ) : null}
      </p>
    </div>
  )
}
