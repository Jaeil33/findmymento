import Link from 'next/link'
import { IconAlert, IconArrowRight } from '@/components/ui/Icons'
import { GUIDES, tourHref, type Guide } from '@/lib/demo/tour'
import { cn } from '@/lib/cn'

/**
 * 강사·학생 사용 방법.
 *
 * 문구는 `lib/demo/tour.ts` 에 있다. 화면 흐름이 바뀌면 그 파일만 고치면 된다.
 * **없는 기능을 적지 않는다** — 사용 방법에 적힌 단계는 전부 지금 화면에 있는 것이다.
 */
export function HowTo() {
  return (
    <div className="grid gap-12 lg:grid-cols-2 lg:gap-10">
      {GUIDES.map((guide) => (
        <GuideColumn key={guide.key} guide={guide} />
      ))}
    </div>
  )
}

function GuideColumn({ guide }: { guide: Guide }) {
  const instructor = guide.key === 'instructor'

  return (
    <section
      aria-labelledby={`guide-${guide.key}`}
      className="rounded-lg border border-line bg-card p-6 sm:p-7"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 id={`guide-${guide.key}`} className="text-lg font-semibold text-ink">
          {guide.audience} 사용 방법
        </h3>
        {/* 체험 입구는 평범한 `<a>` 다 — `next/link` 는 누르기 전에 주소를 미리 호출한다 (ADR-033). */}
        <a
          href={tourHref(instructor ? 'instructor' : 'student')}
          className="inline-flex items-center gap-1 text-xs font-semibold text-point hover:text-point-hover"
        >
          {instructor ? '강사 모드로 열어 보기' : '학생 화면 열어 보기'}
          <IconArrowRight width={13} height={13} />
        </a>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-body">{guide.lead}</p>

      <ol className="mt-6 space-y-5">
        {guide.steps.map((step, i) => (
          <li key={step.title} className="flex gap-3.5">
            <span
              className={cn(
                'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold tabular-nums',
                'border border-point-line bg-point-bg text-point',
              )}
            >
              {i + 1}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ink">{step.title}</p>
              <p className="mt-1 text-sm leading-relaxed text-body">{step.body}</p>
              {step.note ? (
                <p className="mt-1.5 text-xs leading-relaxed text-sub">{step.note}</p>
              ) : null}
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-7 border-t border-line pt-5">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-ink">
          <IconAlert width={14} height={14} className="text-caution" />
          알아 두실 것
        </p>
        <ul className="mt-2.5 space-y-2 text-xs leading-relaxed text-body">
          {guide.notes.map((note) => (
            <li key={note} className="flex gap-2">
              <span aria-hidden="true" className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-faint" />
              <span>{note}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
