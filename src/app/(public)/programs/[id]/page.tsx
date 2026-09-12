import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Badge } from '@/components/ui/Badge'
import { buttonClass } from '@/components/ui/Button'
import { loadDataset } from '@/lib/db/dataset'
import { programDetail, searchDirectory } from '@/lib/db/queries'
import { ProgramCardView } from '@/components/directory/ProgramCardView'
import { GRADE_BAND_LABEL, PROGRAM_FORMAT_LABEL } from '@/types/domain'
import { IconArrowLeft, IconMapPin } from '@/components/ui/Icons'

/** 읽는 화면이므로 본문 폭을 좁게 둔다 (max-w-3xl). */
export default async function ProgramDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ds = await loadDataset()
  const card = programDetail(ds, id)
  if (!card) notFound()

  const { program, instructor, provider, regionLabel } = card

  const related = searchDirectory(ds, { field: program.field })
    .items.filter((c) => c.program.id !== program.id)
    .slice(0, 3)

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <Link
        href="/programs"
        className="inline-flex items-center gap-1.5 text-sm text-sub hover:text-ink"
      >
        <IconArrowLeft width={16} height={16} />
        프로그램 목록
      </Link>

      <article className="mt-6">
        <Badge tone="point">{program.field}</Badge>
        <h1 className="mt-3 text-2xl leading-snug font-semibold tracking-tight text-ink sm:text-3xl">
          {program.title}
        </h1>

        <dl className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <div className="flex items-center gap-1.5">
            <IconMapPin width={15} height={15} className="text-sub" />
            <dt className="sr-only">지역</dt>
            <dd className="font-medium text-ink">{regionLabel}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="text-sub">대상</dt>
            <dd className="text-body">
              {program.target_grades.map((g) => GRADE_BAND_LABEL[g]).join(' · ')}
            </dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="text-sub">형태</dt>
            <dd className="text-body tabular-nums">
              {PROGRAM_FORMAT_LABEL[program.format]} · {program.session_count}회
            </dd>
          </div>
        </dl>

        <p className="mt-6 text-base leading-relaxed text-body">{program.summary}</p>

        <section className="mt-8">
          <h2 className="text-base font-semibold text-ink">수업은 이렇게 진행됩니다</h2>
          <ol className="mt-3 space-y-2.5">
            {program.outline.map((line, i) => (
              <li key={line} className="flex gap-3 text-sm leading-relaxed text-body">
                <span className="mt-0.5 w-5 shrink-0 text-xs font-semibold text-point tabular-nums">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span>{line}</span>
              </li>
            ))}
          </ol>
        </section>

        <section className="mt-8 rounded-lg border border-line bg-card p-5">
          <h2 className="text-sm font-medium text-sub">강사</h2>
          <p className="mt-1.5 text-base font-semibold text-ink">
            {instructor.name}
            <span className="ml-2 text-sm font-normal text-sub">
              {provider ? provider.name : '프리랜서'}
            </span>
          </p>
          <p className="mt-3 text-sm leading-relaxed text-body">{instructor.bio}</p>
          <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-sub">
            {instructor.career.map((c) => (
              <li key={c}>· {c}</li>
            ))}
          </ul>
          <Link
            href={`/instructors/${instructor.id}`}
            className="mt-4 inline-block text-sm text-point underline underline-offset-4 hover:text-point-hover"
          >
            이 강사의 다른 프로그램 보기
          </Link>
        </section>

        {/* 행동 버튼은 "문의하기" 하나뿐이고, 문구가 보호자를 향한다 (UI_GUIDE 안전규칙 6). */}
        <section className="mt-8 rounded-lg border border-point-line bg-point-bg p-5">
          <h2 className="text-base font-semibold text-ink">이 수업을 문의하고 싶다면</h2>
          <p className="mt-1.5 text-sm leading-relaxed text-body">
            문의는 <strong className="font-semibold">보호자님</strong>이 남겨 주세요. 운영자가 확인한
            뒤 담당 강사에게 전달하고, 강사가 알려주신 연락처로 직접 연락드립니다.
          </p>
          <div className="mt-4">
            <Link
              href={`/inquiry?type=program&target=${program.id}&field=${encodeURIComponent(program.field)}`}
              className={buttonClass({ variant: 'primary' })}
            >
              보호자님, 문의 남기기
            </Link>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-sub">
            학생은 이 버튼을 누르지 않아도 됩니다. 궁금한 점은{' '}
            <Link href="/qna" className="underline underline-offset-4">
              공개 Q&amp;A
            </Link>
            에 남기면 강사가 답변합니다.
          </p>
        </section>
      </article>

      {related.length > 0 ? (
        <section className="mt-12 border-t border-line pt-8">
          <h2 className="text-base font-semibold text-ink">같은 분야 다른 프로그램</h2>
          <ul className="mt-4 grid gap-4 sm:grid-cols-2">
            {related.map((c) => (
              <li key={c.program.id}>
                <ProgramCardView card={c} showDistance={false} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}
