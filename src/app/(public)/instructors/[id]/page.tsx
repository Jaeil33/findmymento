import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Badge } from '@/components/ui/Badge'
import { buttonClass } from '@/components/ui/Button'
import { loadDataset } from '@/lib/db/dataset'
import { instructorDetail } from '@/lib/db/queries'
import { regionLabel } from '@/lib/region'
import { GRADE_BAND_LABEL, PROGRAM_FORMAT_LABEL } from '@/types/domain'
import { IconArrowLeft, IconMapPin } from '@/components/ui/Icons'

/**
 * 공개 강사 상세.
 *
 * **연락처·SNS·주소 영역을 만들지 않는다.** 조건부로 숨기는 컴포넌트도 만들지 않는다 —
 * 존재하지 않는 영역은 새지 않는다. 개인 사진·평점·리뷰도 없다.
 */
export default async function InstructorDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ds = await loadDataset()
  const detail = instructorDetail(ds, id)
  if (!detail) notFound()

  const { instructor, provider, programs } = detail

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <Link
        href="/programs"
        className="inline-flex items-center gap-1.5 text-sm text-sub hover:text-ink"
      >
        <IconArrowLeft width={16} height={16} />
        프로그램 목록
      </Link>

      <header className="mt-6">
        <div className="flex flex-wrap items-center gap-2">
          {instructor.fields.map((f) => (
            <Badge key={f} tone="point">
              {f}
            </Badge>
          ))}
          <Badge tone="positive">심사 완료</Badge>
        </div>

        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
          {instructor.name} 강사
        </h1>

        <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <div className="flex items-center gap-1.5">
            <IconMapPin width={15} height={15} className="text-sub" />
            <dt className="sr-only">활동 지역</dt>
            <dd className="font-medium text-ink">{regionLabel(instructor.region_code)}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="text-sub">소속</dt>
            <dd className="text-body">{provider ? provider.name : '프리랜서'}</dd>
          </div>
        </dl>

        <p className="mt-6 text-base leading-relaxed text-body">{instructor.bio}</p>

        {instructor.career.length > 0 ? (
          <ul className="mt-4 space-y-1.5 text-sm text-sub">
            {instructor.career.map((c) => (
              <li key={c}>· {c}</li>
            ))}
          </ul>
        ) : null}
      </header>

      <section className="mt-10">
        <h2 className="text-base font-semibold text-ink">진행하는 프로그램</h2>
        <ul className="mt-4 divide-y divide-line overflow-hidden rounded-lg border border-line bg-card">
          {programs.map((p) => (
            <li key={p.id}>
              <Link
                href={`/programs/${p.id}`}
                className="block px-5 py-4 transition-colors hover:bg-muted/50"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="text-sm font-semibold text-ink">{p.title}</h3>
                  <p className="text-xs text-sub tabular-nums">
                    {PROGRAM_FORMAT_LABEL[p.format]} {p.session_count}회 ·{' '}
                    {p.target_grades.map((g) => GRADE_BAND_LABEL[g]).join('·')}
                  </p>
                </div>
                <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-body">{p.summary}</p>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-8 rounded-lg border border-point-line bg-point-bg p-5">
        <h2 className="text-base font-semibold text-ink">이 강사에게 문의하고 싶다면</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-body">
          강사 연락처는 어떤 화면에도 표시되지 않습니다.{' '}
          <strong className="font-semibold">보호자님</strong>이 문의를 남기시면 운영자가 확인해
          강사에게 전달하고, 강사가 연락드립니다.
        </p>
        <div className="mt-4">
          <Link
            href={`/inquiry?type=instructor&target=${instructor.id}&field=${encodeURIComponent(instructor.fields[0] ?? '')}`}
            className={buttonClass({ variant: 'primary' })}
          >
            보호자님, 문의 남기기
          </Link>
        </div>
      </section>
    </div>
  )
}
