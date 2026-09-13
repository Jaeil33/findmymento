import { PageHeader } from '@/components/ui/Section'
import { InquiryForm } from '@/components/inquiry/InquiryForm'
import { demoAiEnabled } from '@/lib/ai/demo-writer'
import { loadDataset } from '@/lib/db/dataset'
import { allRegions, PILOT_REGION_CODE } from '@/lib/region'

export const metadata = { title: '보호자 문의' }

type Search = { type?: string; target?: string; field?: string }

/** 문의 폼. 폭을 좁게 둔다 (max-w-xl). 비로그인이고 보호자 계정을 만들지 않는다. */
export default async function InquiryPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams
  const ds = await loadDataset()

  const targetType =
    sp.type === 'program' || sp.type === 'instructor' ? sp.type : ('none' as const)
  const targetId = targetType === 'none' ? null : (sp.target ?? null)

  let targetLabel: string | null = null
  if (targetType === 'program' && targetId) {
    const p = ds.programs.find((x) => x.id === targetId)
    const i = p ? ds.instructors.find((x) => x.id === p.instructor_id) : undefined
    if (p && i && i.status === 'approved') targetLabel = `${p.title} · ${i.name} 강사`
  }
  if (targetType === 'instructor' && targetId) {
    const i = ds.instructors.find((x) => x.id === targetId && x.status === 'approved')
    if (i) targetLabel = `${i.name} 강사`
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-10 sm:px-6">
      <PageHeader
        eyebrow="보호자 문의"
        title="아이가 계속 배울 곳을 찾습니다"
        description={
          <>
            이 폼은 <strong className="font-semibold text-ink">성인 보호자</strong>가 작성하는
            폼입니다. 접수된 문의는 운영자가 확인한 뒤 담당 강사에게 전달됩니다.
          </>
        }
      />

      <div className="mt-4 rounded-md border border-line bg-muted px-4 py-3 text-xs leading-relaxed text-body">
        학생 본인이라면 이 폼을 작성하지 않아도 됩니다. 궁금한 점은 공개 Q&amp;A에 남기면 지역 강사가
        답변합니다. 여기서 받는 정보는 보호자 본인의 이름·연락처와 학년대까지입니다.
      </div>

      <div className="mt-8">
        <InquiryForm
          regions={allRegions().map((r) => ({ code: r.code, label: r.label }))}
          defaultRegion={PILOT_REGION_CODE}
          defaultField={sp.field}
          targetType={targetType}
          targetId={targetId}
          targetLabel={targetLabel}
          demoAi={demoAiEnabled()}
        />
      </div>
    </div>
  )
}
