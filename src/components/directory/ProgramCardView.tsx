import Link from 'next/link'
import { Badge } from '@/components/ui/Badge'
import { FieldIcon } from '@/components/ui/FieldIcon'
import { GRADE_BAND_LABEL, PROGRAM_FORMAT_LABEL } from '@/types/domain'
import { IconArrowRight, IconMapPin } from '@/components/ui/Icons'
import type { ProgramCard } from '@/lib/db/queries'

/**
 * 디렉토리 카드.
 *
 * 넣는 것: 분야 · 제목 · 대상 학년 · 형태(회차 수) · **지역** · 소속 업체명.
 * 지역을 빼지 않는다 — 이 제품의 가치가 "우리 지역"이고 보호자가 가장 먼저 보는 정보다.
 *
 * 넣지 않는 것: 연락처·사진·평점·"인기"·"추천" 배지. 조건부로 숨기는 영역조차 만들지 않는다.
 */
export function ProgramCardView({ card, showDistance = true }: { card: ProgramCard; showDistance?: boolean }) {
  const { program, instructor, provider, regionLabel, distance } = card

  return (
    <Link
      href={`/programs/${program.id}`}
      className="group flex h-full flex-col rounded-lg border border-line bg-card p-5 break-keep transition-colors hover:border-point"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-point">
          <FieldIcon field={program.field} width={20} height={20} />
          {program.field}
        </span>
        {showDistance && distance === 0 ? <Badge tone="positive">우리 동네</Badge> : null}
      </div>

      <h3 className="mt-4 text-base leading-snug font-semibold text-ink group-hover:text-point sm:text-[1.0625rem]">
        {program.title}
      </h3>
      <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-body">{program.summary}</p>

      {/* 보조 영역(#f5f5f5) 위에는 #737373 을 쓰지 않는다 (UI_GUIDE 접근성) — text-body 로 둔다. */}
      <dl className="mt-4 flex flex-wrap gap-1.5 text-xs">
        <div className="inline-flex items-center gap-1 rounded bg-muted px-2 py-1">
          <IconMapPin width={13} height={13} className="shrink-0 text-body" />
          <dt className="sr-only">지역</dt>
          <dd className="font-semibold text-ink">{regionLabel}</dd>
        </div>
        <div className="rounded bg-muted px-2 py-1">
          <dt className="sr-only">대상</dt>
          <dd className="text-body">{program.target_grades.map((g) => GRADE_BAND_LABEL[g]).join('·')}</dd>
        </div>
        <div className="rounded bg-muted px-2 py-1">
          <dt className="sr-only">형태</dt>
          <dd className="text-body tabular-nums">
            {PROGRAM_FORMAT_LABEL[program.format]} {program.session_count}회
          </dd>
        </div>
      </dl>

      <div className="mt-auto pt-5">
        <div className="flex items-center justify-between gap-3 border-t border-line pt-3.5 text-xs">
          <p className="min-w-0 truncate text-body">
            {instructor.name} 강사
            <span className="text-sub"> · {provider ? provider.name : '프리랜서'}</span>
          </p>
          <IconArrowRight width={16} height={16} className="shrink-0 text-faint group-hover:text-point" />
        </div>
      </div>
    </Link>
  )
}
