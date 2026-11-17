import { GUIDES, tourHref, type Guide } from '@/lib/demo/tour'

/**
 * 강사·학생 사용 방법.
 *
 * 문구는 `lib/demo/tour.ts` 에 있다. 화면 흐름이 바뀌면 그 파일만 고치면 된다.
 * **없는 기능을 적지 않는다** — 사용 방법에 적힌 단계는 전부 지금 화면에 있는 것이다.
 *
 * 번호를 붙이는 건 이게 **실제로 순서**이기 때문이다. 순서가 아닌 목록에는 번호를 쓰지 않는다.
 * 번호는 동그라미에 담지 않고 왼쪽 여백에 걸어 둔다 — 도면 주석과 같은 자리다.
 */
export function HowTo() {
  return (
    <div className="grid gap-12 lg:grid-cols-2 lg:gap-x-10">
      {GUIDES.map((guide) => (
        <GuideColumn key={guide.key} guide={guide} />
      ))}
    </div>
  )
}

function GuideColumn({ guide }: { guide: Guide }) {
  const instructor = guide.key === 'instructor'

  return (
    <section aria-labelledby={`guide-${guide.key}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b-2 border-ink pb-2.5">
        <h3 id={`guide-${guide.key}`} className="text-lg text-ink">
          {guide.audience} 사용 방법
        </h3>
        {/* 체험 입구는 평범한 `<a>` 다 — `next/link` 는 누르기 전에 주소를 미리 호출한다 (ADR-033). */}
        <a
          href={tourHref(instructor ? 'instructor' : 'student')}
          className="text-xs font-semibold text-point underline underline-offset-4 hover:text-point-hover"
        >
          {instructor ? '강사 모드로 열어 보기' : '학생 화면 열어 보기'}
        </a>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-body">{guide.lead}</p>

      <ol className="mt-5 divide-y divide-line border-y border-line">
        {guide.steps.map((step, i) => (
          <li key={step.title} className="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-x-2 py-3.5">
            <span className="pt-0.5 text-xs font-semibold text-faint tabular-nums">
              {String(i + 1).padStart(2, '0')}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ink">{step.title}</p>
              <p className="mt-1 text-sm leading-relaxed text-body">{step.body}</p>
              {step.note ? (
                <p className="mt-1.5 border-l-2 border-line pl-2.5 text-xs leading-relaxed text-sub">
                  {step.note}
                </p>
              ) : null}
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-5">
        <p className="text-xs font-semibold text-ink">알아 두실 것</p>
        <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-body">
          {guide.notes.map((note) => (
            <li key={note} className="flex gap-2">
              <span aria-hidden="true" className="mt-1.5 h-px w-2 shrink-0 bg-line-strong" />
              <span>{note}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
