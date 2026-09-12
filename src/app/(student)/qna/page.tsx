import Link from 'next/link'
import { Badge } from '@/components/ui/Badge'
import { buttonClass } from '@/components/ui/Button'
import { PageHeader } from '@/components/ui/Section'
import { EmptyState } from '@/components/ui/EmptyState'
import { loadDataset } from '@/lib/db/dataset'
import { qnaThreads } from '@/lib/db/queries'
import { FIELDS, type Field } from '@/types/domain'
import { IconChat } from '@/components/ui/Icons'

export const metadata = { title: '공개 Q&A' }

/**
 * 공개 Q&A 열람. 인증이 없다 — 학생·보호자·강사가 같은 화면을 본다.
 *
 * 숨김 처리된 글은 여기 오지 않는다. 1:1 경로가 없으므로 이 스레드가 학생↔강사 소통의 전부다.
 */
export default async function QnaPage({
  searchParams,
}: {
  searchParams: Promise<{ field?: string }>
}) {
  const sp = await searchParams
  const field =
    sp.field && (FIELDS as readonly string[]).includes(sp.field) ? (sp.field as Field) : undefined

  const ds = await loadDataset()
  const threads = qnaThreads(ds, { field })

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <PageHeader
        eyebrow="공개 Q&amp;A"
        title="지역 강사에게 물어보기"
        description="질문과 답변이 모두에게 공개됩니다. 1:1 비공개 메시지 기능은 없고, 기관 선생님도 함께 봅니다."
        actions={
          <Link href="/qna/new" className={buttonClass({ variant: 'primary' })}>
            질문 남기기
          </Link>
        }
      />

      <nav aria-label="분야 필터" className="mt-6 flex flex-wrap gap-2">
        <Link
          href="/qna"
          className={
            'rounded-full border px-3.5 py-1.5 text-sm transition-colors ' +
            (field
              ? 'border-line-strong text-body hover:bg-muted'
              : 'border-point bg-point-bg font-medium text-point')
          }
        >
          전체
        </Link>
        {FIELDS.map((f) => (
          <Link
            key={f}
            href={`/qna?field=${encodeURIComponent(f)}`}
            className={
              'rounded-full border px-3.5 py-1.5 text-sm transition-colors ' +
              (field === f
                ? 'border-point bg-point-bg font-medium text-point'
                : 'border-line-strong text-body hover:bg-muted')
            }
          >
            {f}
          </Link>
        ))}
      </nav>

      {threads.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title="아직 질문이 없어요"
            description="첫 질문을 남겨 보세요. 지역 강사가 답변합니다."
            action={
              <Link href="/qna/new" className={buttonClass({ variant: 'primary' })}>
                질문 남기기
              </Link>
            }
          />
        </div>
      ) : (
        <ul className="mt-6 space-y-4">
          {threads.map(({ question, answers, hoursWaiting, unanswered }) => (
            <li key={question.id} className="rounded-lg border border-line bg-card">
              <div className="px-5 py-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Badge tone="point">{question.field}</Badge>
                    <span className="text-xs text-sub">{question.student_alias}</span>
                  </div>
                  {unanswered ? (
                    <Badge tone={hoursWaiting >= 48 ? 'caution' : 'neutral'}>
                      답변 대기 {hoursWaiting}시간
                    </Badge>
                  ) : (
                    <Badge tone="positive">답변 {answers.length}개</Badge>
                  )}
                </div>
                <p className="mt-3 text-base leading-relaxed text-ink">{question.body}</p>
              </div>

              {answers.length > 0 ? (
                <ul className="divide-y divide-line border-t border-line bg-muted/40">
                  {answers.map(({ answer, instructorName }) => (
                    <li key={answer.id} className="px-5 py-4">
                      <p className="flex items-center gap-1.5 text-xs font-medium text-point">
                        <IconChat width={14} height={14} />
                        {instructorName} 강사
                      </p>
                      <p className="mt-2 text-sm leading-relaxed text-body">{answer.body}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="border-t border-line px-5 py-3 text-xs text-sub">
                  아직 답변이 없어요. 지역 강사가 확인하면 답변이 달립니다.
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      <p className="mt-8 text-xs leading-relaxed text-sub">
        연락처·외부 링크가 들어간 글은 올라가지 않습니다. 안전을 위한 제약이고, 수업 이야기는 이
        스레드에서 계속할 수 있습니다.
      </p>
    </div>
  )
}
