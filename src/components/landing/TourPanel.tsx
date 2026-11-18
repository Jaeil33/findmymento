import {
  TOUR_ENTRIES,
  TOUR_PRIMARY_KEYS,
  TOUR_SECONDARY_KEYS,
  tourHref,
  type TourEntry,
} from '@/lib/demo/tour'

/**
 * 로그인 없이 들어가는 입구 (ADR-033).
 *
 * 입구는 평범한 `<a>` 다. `/tour/{키}` 는 페이지가 아니라 쿠키를 심는 라우트 핸들러이고,
 * `next/link` 로 걸면 라우터가 화면에 들어온 입구 여섯 개를 **누르기 전에 미리 호출해**
 * 역할 쿠키가 뒤섞인다 (`lib/demo/mode.ts` 의 `isRouterPrefetch`).
 *
 * 주소 하나(`/tour/{키}`)로 들어가고, 그 세션은 **데모 데이터만** 본다. 그래서 여기 적는 말은
 * "둘러보기"이고 "로그인 우회"가 아니다. 실제 기관·학생 데이터가 보이지 않는다는 사실을
 * 버튼과 같은 자리에 적는다 — 심사용 체험과 실제 운영을 혼동하면 안 된다.
 */
export function TourPanel({ live }: { live: boolean }) {
  const byKey = new Map(TOUR_ENTRIES.map((e) => [e.key, e]))
  const primary = TOUR_PRIMARY_KEYS.map((k) => byKey.get(k)).filter((e): e is TourEntry => !!e)
  const secondary = TOUR_SECONDARY_KEYS.map((k) => byKey.get(k)).filter((e): e is TourEntry => !!e)

  return (
    <div>
      <ul className="grid gap-4 lg:grid-cols-3">
        {primary.map((entry) => (
          <li key={entry.key} className="flex h-full flex-col border border-line bg-card p-5">
            <p className="text-base font-semibold text-ink">{entry.label}</p>
            <p className="mt-0.5 text-xs text-sub">{entry.who}</p>
            <p className="mt-3 text-sm leading-relaxed text-body">{entry.summary}</p>
            <ul className="mt-4 flex-1 divide-y divide-line border-t border-line">
              {entry.highlights.map((h) => (
                <li key={h} className="py-2 text-xs leading-relaxed text-body">
                  {h}
                </li>
              ))}
            </ul>
            {/* 링크는 카드 전체가 아니라 이 한 줄이다 — 읽어 주는 이름이 카드 본문 전체가 되지 않게 한다. */}
            <a
              href={tourHref(entry.key)}
              className="mt-4 inline-flex min-h-11 items-center justify-center rounded-sm border border-point bg-point px-4 text-sm font-semibold text-white transition-colors hover:bg-point-hover"
            >
              {entry.label} 열기
            </a>
            <p className="mt-2 text-center text-xs text-sub">{entry.destinationLabel} 화면</p>
          </li>
        ))}
      </ul>

      <div className="mt-4 flex flex-col gap-3 border-l-2 border-line-strong bg-muted/60 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs leading-relaxed text-body">
          {live
            ? '체험 중에는 데모 데이터만 보입니다. 만들거나 고친 것은 저장되지 않습니다.'
            : '데모 데이터로 동작하는 검수용 배포입니다. 숫자·이름은 시연용 예시입니다.'}
        </p>
        <p className="flex shrink-0 flex-wrap gap-x-4 gap-y-1 text-xs">
          {secondary.map((entry) => (
            <a
              key={entry.key}
              href={tourHref(entry.key)}
              className="font-semibold text-point underline underline-offset-4 hover:text-point-hover"
            >
              {entry.label}
            </a>
          ))}
        </p>
      </div>
    </div>
  )
}
