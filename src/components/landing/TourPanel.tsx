import Link from 'next/link'
import { IconArrowRight, IconCheck, IconLock } from '@/components/ui/Icons'
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
          <li
            key={entry.key}
            className="flex h-full flex-col rounded-lg border border-line bg-card p-5"
          >
            <p className="text-base font-semibold text-ink">{entry.label}</p>
            <p className="mt-1 text-xs text-sub">{entry.who}</p>
            <p className="mt-3 text-sm leading-relaxed text-body">{entry.summary}</p>
            <ul className="mt-4 flex-1 space-y-1.5 text-xs leading-relaxed text-body">
              {entry.highlights.map((h) => (
                <li key={h} className="flex gap-1.5">
                  <IconCheck width={13} height={13} className="mt-0.5 shrink-0 text-point" />
                  <span>{h}</span>
                </li>
              ))}
            </ul>
            {/* 링크는 카드 전체가 아니라 이 한 줄이다 — 읽어 주는 이름이 카드 본문 전체가 되지 않게 한다. */}
            <Link
              href={tourHref(entry.key)}
              className="mt-5 inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg bg-point px-4 text-sm font-semibold text-white transition-colors hover:bg-point-hover"
            >
              {entry.label} 열기
              <IconArrowRight width={15} height={15} />
            </Link>
            <p className="mt-2 text-center text-xs text-sub">{entry.destinationLabel} 화면</p>
          </li>
        ))}
      </ul>

      <div className="mt-5 flex flex-col gap-3 rounded-lg border border-line bg-card p-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-start gap-2 text-xs leading-relaxed text-body">
          <IconLock width={14} height={14} className="mt-0.5 shrink-0 text-sub" />
          <span>
            {live
              ? '체험 중에는 데모 데이터만 보입니다. 실제 기관·학생 데이터는 조회되지 않고, 체험에서 만들거나 고친 것도 실제 DB 에 저장되지 않습니다.'
              : '지금은 데모 데이터로 동작하는 검수용 배포입니다. 화면의 숫자·이름은 시연용 예시입니다.'}
          </span>
        </p>
        <p className="flex shrink-0 flex-wrap gap-x-4 gap-y-1 text-xs">
          {secondary.map((entry) => (
            <Link
              key={entry.key}
              href={tourHref(entry.key)}
              className="font-medium text-point underline-offset-4 hover:underline"
            >
              {entry.label}
            </Link>
          ))}
        </p>
      </div>
    </div>
  )
}
