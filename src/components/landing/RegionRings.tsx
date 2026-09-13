/**
 * 지역 확장 3단계 도식 — `우리 동네 → 인접 → 조금 더 넓게`.
 *
 * **지도가 아니다.** 방위·거리는 실제 지리가 아니라 확장 단계만 나타낸다.
 * 외부 지도 API 를 쓰지 않는다는 결정(PRD 확정 결정 9)과 같은 이유로, 행정구역 인접 관계만 그린다.
 */
export function RegionRings({
  center,
  ring1,
  ring2,
}: {
  center: string
  ring1: string[]
  ring2: string[]
}) {
  const size = 480
  const c = size / 2
  const r0 = 62
  const r1 = 138
  const r2 = 208

  const place = (i: number, n: number, r: number, offset = 0) => {
    const angle = ((-90 + offset + (360 / Math.max(n, 1)) * i) * Math.PI) / 180
    return { x: c + r * Math.cos(angle), y: c + r * Math.sin(angle) }
  }

  const halo = { paintOrder: 'stroke' as const }

  return (
    <figure className="rounded-lg border border-line bg-card p-4 sm:p-6">
      <svg
        viewBox={`0 0 ${size} ${size}`}
        className="mx-auto block h-auto w-full max-w-[26rem]"
        aria-hidden="true"
        focusable="false"
      >
        <circle cx={c} cy={c} r={r2} className="fill-none stroke-line-strong" strokeWidth={1.25} strokeDasharray="3 6" />
        <circle cx={c} cy={c} r={r1} className="fill-none stroke-point-line" strokeWidth={1.5} />
        <circle cx={c} cy={c} r={r0} className="fill-point-bg stroke-point" strokeWidth={1.5} />

        {ring2.map((name, i) => {
          const p = place(i, ring2.length, r2, 180 / Math.max(ring2.length, 1))
          return (
            <g key={name}>
              <circle cx={p.x} cy={p.y} r={3} className="fill-faint" />
              <text
                x={p.x}
                y={p.y + 17}
                textAnchor="middle"
                className="fill-sub stroke-card"
                strokeWidth={5}
                style={halo}
                fontSize={12.5}
              >
                {name}
              </text>
            </g>
          )
        })}

        {ring1.map((name, i) => {
          const p = place(i, ring1.length, r1)
          return (
            <g key={name}>
              <circle cx={p.x} cy={p.y} r={4.5} className="fill-point" />
              <text
                x={p.x}
                y={p.y + 20}
                textAnchor="middle"
                className="fill-ink stroke-card"
                strokeWidth={5}
                style={halo}
                fontSize={14}
                fontWeight={600}
              >
                {name}
              </text>
            </g>
          )
        })}

        <text x={c} y={c - 2} textAnchor="middle" className="fill-point" fontSize={18} fontWeight={700}>
          {center}
        </text>
        <text x={c} y={c + 18} textAnchor="middle" className="fill-point" fontSize={11.5}>
          우리 동네
        </text>
      </svg>

      <figcaption className="mt-4 space-y-3">
        <ol className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <li className="flex items-center gap-2">
            <span aria-hidden="true" className="h-3 w-3 shrink-0 rounded-full border border-point bg-point-bg" />
            <span className="text-ink">
              <span className="font-semibold">1단계</span> {center}
            </span>
          </li>
          <li className="flex items-center gap-2">
            <span aria-hidden="true" className="h-3 w-3 shrink-0 rounded-full bg-point" />
            <span className="text-ink tabular-nums">
              <span className="font-semibold">2단계</span> 인접 {ring1.length}곳
            </span>
          </li>
          <li className="flex items-center gap-2">
            <span aria-hidden="true" className="h-3 w-3 shrink-0 rounded-full bg-faint" />
            <span className="text-ink tabular-nums">
              <span className="font-semibold">3단계</span> 더 넓게 {ring2.length}곳
            </span>
          </li>
        </ol>
        <p className="text-xs leading-relaxed text-sub">
          인접 지역: {ring1.join(' · ')}. 도식의 방향은 실제 지리가 아니라 확장 단계만 나타냅니다.
        </p>
      </figcaption>
    </figure>
  )
}
