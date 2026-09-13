import Link from 'next/link'
import { Suspense } from 'react'
import { PageHeader, FactNote } from '@/components/ui/Section'
import { EmptyState } from '@/components/ui/EmptyState'
import { buttonClass } from '@/components/ui/Button'
import { ProgramFilters } from '@/components/directory/ProgramFilters'
import { ProgramCardView } from '@/components/directory/ProgramCardView'
import { StageNotice } from '@/components/directory/StageNotice'
import { loadDataset } from '@/lib/db/dataset'
import { searchDirectory, supplySummary } from '@/lib/db/queries'
import { allRegions, PILOT_REGION_CODE } from '@/lib/region'
import { FIELDS, type Field, type GradeBand, type ProgramFormat } from '@/types/domain'

export const metadata = { title: '프로그램 찾기' }

type Search = { region?: string; field?: string; grade?: string; format?: string }

/**
 * 공개 프로그램 디렉토리. Server Component + anon 조회다 — 승인되지 않은 강사의 프로그램은
 * 쿼리 단계에서 빠지고, 실 DB 에서는 RLS 가 같은 일을 한 번 더 한다 (E-11).
 */
export default async function ProgramsPage({
  searchParams,
}: {
  searchParams: Promise<Search>
}) {
  const sp = await searchParams
  const ds = await loadDataset()
  const supply = supplySummary(ds)

  const field = sp.field && (FIELDS as readonly string[]).includes(sp.field) ? (sp.field as Field) : undefined
  const gradeBand = ['elementary', 'middle', 'high'].includes(sp.grade ?? '')
    ? (sp.grade as GradeBand)
    : undefined
  const format = ['short_course', 'one_off', 'club'].includes(sp.format ?? '')
    ? (sp.format as ProgramFormat)
    : undefined

  const result = searchDirectory(ds, {
    regionCode: sp.region || undefined,
    field,
    gradeBand,
    format,
  })

  // 수도권 66개를 모두 선택지로 둔다. 결과가 0건인 지역을 고르는 것 자체가 미충족 수요 신호다.
  const regions = allRegions().map((r) => ({ code: r.code, label: r.label }))

  return (
    <div className="break-keep">
      <div className="border-b border-line bg-card">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-12">
          <PageHeader
            eyebrow="공개 디렉토리"
            title="우리 지역 프로그램 찾기"
            description={
              <>
                로그인 없이 볼 수 있습니다. 지역에 결과가 없으면 인접 지역까지 자동으로 넓혀
                찾습니다. 수업 신청은 보호자님의 문의로만 받습니다.
              </>
            }
            actions={
              <Link href="/inquiry" className={buttonClass({ variant: 'primary' })}>
                보호자님, 문의 남기기
              </Link>
            }
          />
        </div>
      </div>

      <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
        <FactNote>
          {supply.sentence}. 파일럿 단계라 결과가 한 업체로 쏠릴 수 있습니다. 강사 연락처는 어느
          화면에도 표시되지 않으며, 평점·리뷰 기능은 없습니다.
        </FactNote>

        <Suspense
          fallback={<div className="h-44 rounded-lg border border-line bg-card" aria-hidden="true" />}
        >
          <ProgramFilters regions={regions} total={result.items.length} />
        </Suspense>

        <StageNotice stage={result.stage} originCode={result.originCode} codes={result.stageCodes} />

        {result.items.length > 0 ? (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {result.items.map((card) => (
              <li key={card.program.id} className="h-full">
                <ProgramCardView card={card} showDistance={Boolean(result.originCode)} />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            title="아직 이 조건의 수업이 없어요"
            description={
              <>
                관심이 있었는데 공급이 없었다는 사실을 기록해 두고 새 강사를 찾는 데 씁니다. 먼저
                공개 Q&amp;A에 물어보시면 지역 강사가 답변합니다.
              </>
            }
            action={
              <Link href="/qna" className={buttonClass({ variant: 'primary' })}>
                공개 Q&amp;A에서 물어보기
              </Link>
            }
            secondary={
              <>
                조건을 넓혀 보실 수도 있어요 —{' '}
                <Link href="/programs" className="underline underline-offset-4 hover:text-ink">
                  전체 보기
                </Link>
                {' · '}
                <Link
                  href={`/programs?region=${PILOT_REGION_CODE}`}
                  className="underline underline-offset-4 hover:text-ink"
                >
                  광명시 전체
                </Link>
              </>
            }
          />
        )}
      </div>
    </div>
  )
}
