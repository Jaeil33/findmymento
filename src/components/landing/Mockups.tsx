import { cn } from '@/lib/cn'

/**
 * 랜딩용 제품 화면 모형.
 *
 * **실제 데이터를 넣지 않는다.** 실 DB 모드에서 기관 리포트 숫자를 공개 랜딩에 끌어오면
 * 그 자체로 기관 데이터 노출이다. 숫자는 고정 예시이고, 모형마다 "화면 예시" 표시를 붙인다.
 * 모형 본문은 스크린리더에 읽히지 않게 숨기고, 캡션이 무엇의 예시인지 설명한다.
 */

const MOCK_SHADOW = 'shadow-[0_24px_48px_-28px_rgba(23,23,23,0.28)]'

export function MockCaption({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <figcaption className={cn('mt-3 text-xs leading-relaxed text-sub', className)}>
      <span className="font-medium text-body">화면 예시</span> · {children}
    </figcaption>
  )
}

function WindowBar({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-3 border-b border-line px-4 py-2.5">
      <span className="flex gap-1.5" aria-hidden="true">
        <span className="h-2.5 w-2.5 rounded-full bg-line-strong" />
        <span className="h-2.5 w-2.5 rounded-full bg-line-strong" />
        <span className="h-2.5 w-2.5 rounded-full bg-line-strong" />
      </span>
      <span className="truncate text-xs text-sub">{title}</span>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────
// 기관 — 분야 × 학년대 수요
// ──────────────────────────────────────────────────────────────

const DEMAND_ROWS = [
  { field: '드론', band: '중등', count: 18, supply: 3 },
  { field: 'VR·AR', band: '중등', count: 14, supply: 0 },
  { field: '3D 모델링·프린팅', band: '중등', count: 11, supply: 2 },
  { field: 'AI·코딩', band: '고등', count: 6, supply: 0 },
]

export function DemandMock() {
  const max = Math.max(...DEMAND_ROWS.map((r) => r.count))
  return (
    <figure>
      <div className={cn('overflow-hidden rounded-lg border border-line bg-card', MOCK_SHADOW)} aria-hidden="true">
        <WindowBar title="기관 대시보드 · 수요" />
        <div className="flex flex-wrap items-end justify-between gap-2 px-5 pt-4 pb-3">
          <div>
            <p className="text-sm font-semibold text-ink">더 배우고 싶은 분야</p>
            <p className="mt-0.5 text-xs text-sub">최근 3개 회차 · 후속 의향 3점 이상</p>
          </div>
          <p className="text-xs text-body tabular-nums">응답 81명</p>
        </div>
        <table className="w-full text-left text-sm">
          <thead className="bg-muted text-xs text-body">
            <tr>
              <th className="px-5 py-2 font-medium">분야</th>
              <th className="hidden px-2 py-2 font-medium sm:table-cell">학년대</th>
              <th className="px-2 py-2 font-medium">관심</th>
              <th className="px-5 py-2 text-right font-medium">지역 공급</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {DEMAND_ROWS.map((r) => (
              <tr key={r.field}>
                <td className="px-5 py-3 font-medium whitespace-nowrap text-ink">{r.field}</td>
                <td className="hidden px-2 py-3 text-body sm:table-cell">{r.band}</td>
                <td className="px-2 py-3">
                  <div className="flex items-center gap-2">
                    <span className="h-1.5 w-16 overflow-hidden rounded-full bg-muted sm:w-20">
                      <span
                        className="block h-full rounded-full bg-point"
                        style={{ width: `${(r.count / max) * 100}%` }}
                      />
                    </span>
                    <span className="text-ink tabular-nums">{r.count}명</span>
                  </div>
                </td>
                <td className="px-5 py-3 text-right whitespace-nowrap">
                  {r.supply === 0 ? (
                    <span className="rounded border border-caution/25 bg-caution-bg px-1.5 py-0.5 text-xs font-medium text-caution">
                      공급 0
                    </span>
                  ) : (
                    <span className="text-xs text-body tabular-nums">강사 {r.supply}명</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="border-t border-line bg-caution-bg px-5 py-3 text-xs leading-relaxed text-caution">
          VR·AR 중등 14명 · 지역 공급 0 — 신규 강사 섭외와 예산 기안의 근거가 됩니다
        </p>
      </div>
      <MockCaption>기관 대시보드의 분야별 수요 집계</MockCaption>
    </figure>
  )
}

// ──────────────────────────────────────────────────────────────
// 강사 — 교실 투사 화면
// ──────────────────────────────────────────────────────────────

/** 장식용 QR 모양. 스캔되지 않는다 — 실제 QR 은 배정 회차 화면에서만 만든다. */
function DecorativeQr({ className }: { className?: string }) {
  const n = 25
  const inFinder = (x: number, y: number) =>
    (x < 8 && y < 8) || (x >= n - 8 && y < 8) || (x < 8 && y >= n - 8)
  let d = ''
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (inFinder(x, y)) continue
      const v = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453
      if (v - Math.floor(v) > 0.5) d += `M${x} ${y}h1v1h-1z`
    }
  }
  const finder = (x: number, y: number) => (
    <g key={`${x}-${y}`}>
      <rect x={x + 0.5} y={y + 0.5} width={6} height={6} fill="none" stroke="currentColor" strokeWidth={1} />
      <rect x={x + 2} y={y + 2} width={3} height={3} fill="currentColor" />
    </g>
  )
  return (
    <svg viewBox={`0 0 ${n} ${n}`} className={className} shapeRendering="crispEdges" aria-hidden="true" focusable="false">
      <path d={d} fill="currentColor" />
      {finder(0, 0)}
      {finder(n - 7, 0)}
      {finder(0, n - 7)}
    </svg>
  )
}

export function ProjectionMock() {
  return (
    <figure>
      <div className={cn('overflow-hidden rounded-lg border border-line bg-card', MOCK_SHADOW)} aria-hidden="true">
        <WindowBar title="교실 투사용 QR · 진로체험 드론 직업인 특강" />
        <div className="grid items-center gap-6 px-6 py-8 sm:grid-cols-[auto_minmax(0,1fr)] sm:px-8">
          <div className="mx-auto rounded-md border border-line p-3 sm:mx-0">
            <DecorativeQr className="h-32 w-32 text-ink sm:h-36 sm:w-36" />
          </div>
          <div className="text-center sm:text-left">
            <p className="text-lg leading-snug font-semibold break-keep text-ink">
              나에게 맞는 다음 교육을 찾아줘요
            </p>
            <p className="mt-1.5 text-xs text-sub">휴대폰으로 QR을 찍거나, 아래 코드를 입력하세요</p>
            <p className="mt-4 text-4xl font-semibold tracking-[0.14em] text-ink tabular-nums">735104</p>
          </div>
        </div>
        <dl className="grid grid-cols-2 divide-x divide-line border-t border-line">
          <div className="px-5 py-3.5">
            <dt className="text-xs text-sub">응답</dt>
            <dd className="mt-0.5 text-xl font-semibold text-ink tabular-nums">
              27<span className="ml-1 text-sm font-normal text-sub">/ 30명</span>
            </dd>
          </div>
          <div className="px-5 py-3.5">
            <dt className="text-xs text-sub">더 배우고 싶다</dt>
            <dd className="mt-0.5 text-xl font-semibold text-point tabular-nums">
              19<span className="ml-1 text-sm font-normal text-sub">명</span>
            </dd>
          </div>
        </dl>
      </div>
      <MockCaption>수업 마지막 3분, 강사가 교실 프로젝터에 띄우는 화면</MockCaption>
    </figure>
  )
}
