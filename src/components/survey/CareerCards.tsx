/**
 * 진로 방향 카드 (ADR-027). 추천할 수업이 0건일 때 학생 결과 화면에 들어간다.
 *
 * 카드의 가치는 "왜 나한테 맞는지" 한 줄이다 — 수업 추천 카드와 같은 자리에 같은 모양으로 둔다.
 * 누를 버튼이 없다. "AI가 분석했어요" 같은 배지를 달지 않는다 (UI_GUIDE 안티패턴).
 */
export type CareerCardItem = {
  id: string
  title: string
  summary: string
  related: string
  reason: string
}

export function CareerCards({ items }: { items: CareerCardItem[] }) {
  return (
    <ul className="space-y-4">
      {items.map((c) => (
        <li key={c.id}>
          <article className="rounded-xl border border-line bg-card p-5">
            <h2 className="text-base leading-snug font-semibold text-ink">{c.title}</h2>

            {/* 이 학생에게 왜 맞는지 — 카드에서 가장 중요한 문장이다. */}
            <p className="mt-2.5 border-l-2 border-point pl-3 text-sm leading-relaxed text-body">
              {c.reason}
            </p>

            <p className="mt-3 text-sm leading-relaxed text-sub">{c.summary}</p>

            <div className="mt-3 text-xs leading-relaxed text-sub">
              <span className="font-medium text-body">관련 학과·자격 </span>
              <span>{c.related}</span>
            </div>
          </article>
        </li>
      ))}
    </ul>
  )
}
