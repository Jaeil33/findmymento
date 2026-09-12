import Link from 'next/link'
import { PageHeader } from '@/components/ui/Section'
import { QuestionForm } from '@/components/qna/QuestionForm'
import { IconArrowLeft } from '@/components/ui/Icons'

export const metadata = { title: '질문 남기기' }

export default async function NewQuestionPage({
  searchParams,
}: {
  searchParams: Promise<{ field?: string }>
}) {
  const sp = await searchParams

  return (
    <div className="mx-auto max-w-xl px-4 py-10 sm:px-6">
      <Link href="/qna" className="inline-flex items-center gap-1.5 text-sm text-sub hover:text-ink">
        <IconArrowLeft width={16} height={16} />
        Q&amp;A 목록
      </Link>

      <div className="mt-6">
        <PageHeader
          title="질문 남기기"
          description="지역 강사가 답변합니다. 우리 지역에 아직 수업이 없는 분야도 물어볼 수 있어요 — 질문이 새 강사를 찾는 근거가 됩니다."
        />
      </div>

      <div className="mt-8">
        <QuestionForm defaultField={sp.field} />
      </div>
    </div>
  )
}
