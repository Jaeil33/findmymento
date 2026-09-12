import { notFound, redirect } from 'next/navigation'
import { Badge } from '@/components/ui/Badge'
import { PageHeader, Panel } from '@/components/ui/Section'
import { EmptyState } from '@/components/ui/EmptyState'
import { getActor } from '@/lib/auth/actor'
import { loadDataset } from '@/lib/db/dataset'
import { qnaThreads } from '@/lib/db/queries'
import { answerQuestion } from '../actions'
import { IconAlert, IconChat } from '@/components/ui/Icons'

export const metadata = { title: 'Q&A 답변' }

/**
 * Q&A 답변 화면.
 *
 * 답변은 **공개**다. 연락처·외부 링크는 서버에서 차단된다 (E-10) — 안전 목적이자
 * 플랫폼 밖 직거래 이탈을 막는 목적이다.
 */
export default async function InstructorQnaPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const sp = await searchParams
  const actor = await getActor()
  if (!actor || actor.role !== 'instructor') redirect('/login')

  const ds = await loadDataset()
  const me = ds.instructors.find((i) => i.id === actor.instructorId)
  if (!me) notFound()

  const threads = qnaThreads(ds, {})
  const mine = threads.filter((t) => (me.fields as string[]).includes(t.question.field))
  const unanswered = mine.filter((t) => t.unanswered)
  const answered = mine.filter((t) => !t.unanswered)

  return (
    <div className="space-y-8">
      <PageHeader
        title="Q&A 답변"
        description={`강사님 분야(${me.fields.join(' · ')}) 질문입니다. 질문과 답변은 모두에게 공개되고, 기관 담당자도 함께 봅니다.`}
      />

      {sp.error ? (
        <p className="flex items-center gap-2 rounded-md border border-negative/25 bg-negative-bg px-4 py-3 text-sm text-negative">
          <IconAlert width={16} height={16} />
          {sp.error === 'blocked'
            ? '연락처나 외부 링크는 답변에 넣을 수 없습니다. 내용만 남겨 주세요.'
            : '답변을 조금 더 자세히 써 주세요.'}
        </p>
      ) : null}

      {mine.length === 0 ? (
        <EmptyState
          title="아직 내 분야 질문이 없습니다"
          description="학생이 추천 결과에서 수업을 못 찾으면 Q&A로 안내됩니다. 질문이 들어오면 여기 나타납니다."
        />
      ) : null}

      {unanswered.length > 0 ? (
        <Panel
          title="답변 대기"
          description="48시간이 지나면 운영자 화면에도 표시됩니다."
        >
          <ul className="space-y-5">
            {unanswered.map((t) => (
              <li key={t.question.id} className="rounded-md border border-line bg-card p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="point">{t.question.field}</Badge>
                  <span className="text-xs text-sub">{t.question.student_alias}</span>
                  <Badge tone={t.hoursWaiting >= 48 ? 'caution' : 'neutral'}>
                    {t.hoursWaiting}시간 경과
                  </Badge>
                </div>
                <p className="mt-3 text-base leading-relaxed text-ink">{t.question.body}</p>

                <form action={answerQuestion} className="mt-4 space-y-2">
                  <input type="hidden" name="questionId" value={t.question.id} />
                  <label className="block space-y-1.5">
                    <span className="block text-sm font-medium text-body">답변</span>
                    <span className="block rounded-md border border-caution/30 bg-caution-bg px-3 py-2 text-xs leading-relaxed text-caution">
                      이 답변은 모두에게 공개됩니다. 연락처·SNS·외부 링크는 올라가지 않습니다.
                    </span>
                    <textarea
                      name="body"
                      required
                      rows={4}
                      maxLength={1500}
                      placeholder="학생이 바로 해볼 수 있는 것까지 알려주면 가장 좋습니다."
                      className="block w-full rounded-lg border border-line-strong bg-card px-4 py-3 text-sm leading-relaxed text-ink focus:border-point focus:ring-1 focus:ring-point focus:outline-none"
                    />
                  </label>
                  <button
                    type="submit"
                    className="rounded-lg bg-point px-4 py-2 text-sm font-medium text-white hover:bg-point-hover"
                  >
                    답변 올리기
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      {answered.length > 0 ? (
        <Panel title="답변 완료">
          <ul className="space-y-4">
            {answered.map((t) => (
              <li key={t.question.id} className="rounded-md border border-line bg-card p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="point">{t.question.field}</Badge>
                  <span className="text-xs text-sub">{t.question.student_alias}</span>
                  <Badge tone="positive">답변 {t.answers.length}개</Badge>
                </div>
                <p className="mt-2.5 text-sm leading-relaxed text-body">{t.question.body}</p>
                <ul className="mt-3 space-y-2 border-t border-line pt-3">
                  {t.answers.map((a) => (
                    <li key={a.answer.id}>
                      <p className="flex items-center gap-1.5 text-xs font-medium text-point">
                        <IconChat width={14} height={14} />
                        {a.instructorName} 강사
                      </p>
                      <p className="mt-1 text-sm leading-relaxed text-body">{a.answer.body}</p>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
    </div>
  )
}
