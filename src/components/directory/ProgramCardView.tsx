import Link from 'next/link'
import { Badge } from '@/components/ui/Badge'
import { GRADE_BAND_LABEL, PROGRAM_FORMAT_LABEL } from '@/types/domain'
import { IconMapPin } from '@/components/ui/Icons'
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
      className="group flex h-full flex-col rounded-lg border border-line bg-card p-5 transition-colors hover:border-line-strong hover:bg-muted/40"
    >
      <div className="flex items-start justify-between gap-3">
        <Badge tone="point">{program.field}</Badge>
        {showDistance && distance === 0 ? <Badge tone="positive">우리 동네</Badge> : null}
      </div>

      <h3 className="mt-3 text-base leading-snug font-semibold text-ink group-hover:underline group-hover:underline-offset-4">
        {program.title}
      </h3>
      <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-body">{program.summary}</p>

      <dl className="mt-4 space-y-1.5 text-xs text-sub">
        <div className="flex items-center gap-1.5">
          <IconMapPin width={14} height={14} className="shrink-0" />
          <dt className="sr-only">지역</dt>
          <dd className="font-medium text-body">{regionLabel}</dd>
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          <div>
            <dt className="sr-only">대상</dt>
            <dd>{program.target_grades.map((g) => GRADE_BAND_LABEL[g]).join('·')}</dd>
          </div>
          <div>
            <dt className="sr-only">형태</dt>
            <dd className="tabular-nums">
              {PROGRAM_FORMAT_LABEL[program.format]} {program.session_count}회
            </dd>
          </div>
        </div>
      </dl>

      <p className="mt-4 border-t border-line pt-3 text-xs text-sub">
        {instructor.name} 강사
        {provider ? <span className="text-faint"> · {provider.name}</span> : <span className="text-faint"> · 프리랜서</span>}
      </p>
    </Link>
  )
}
