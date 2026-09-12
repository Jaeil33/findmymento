import { redirect } from 'next/navigation'
import { Badge } from '@/components/ui/Badge'
import { PageHeader, Panel } from '@/components/ui/Section'
import { EmptyState } from '@/components/ui/EmptyState'
import { getActor } from '@/lib/auth/actor'
import { loadDataset } from '@/lib/db/dataset'
import { approvedInstructors, qnaThreads, unansweredQueue } from '@/lib/db/queries'
import { moderateQuestion } from '../actions'
import { IconChat } from '@/components/ui/Icons'

export const metadata = { title: '미답변 큐' }

/**
 * 미답변 Q&A 큐 + 모더레이션.
 *
 * 48시간 초과를 따로 표시한다 (E-20). 학생 질문에 아무도 답하지 않으면 Q&A 경로 자체가 죽고,
 * 추천 0건일 때의 유일한 대안이 사라진다.
 */
export default async function AdminQnaPage() {
  const actor = await getActor()
  if (!actor || actor.role !== 'admin') redirect('/login')

  const ds = await loadDataset()
  const overdue = unansweredQueue(ds)
  const all = qnaThreads(ds, { includeHidden: true })
  const waiting = all.filter((t) => t.unanswered && t.hoursWaiting < 48 && t.question.visibility === 'public')
  const hidden = all.filter((t) => t.question.visibility === 'hidden')
  const instructors = approvedInstructors(ds)

  /** 그 분야를 맡은 승인 강사가 아예 없으면, 답변을 기다려도 오지 않는다. */
  const coverage = (field: string) =>
    instructors.filter((i) => (i.fields as string[]).includes(field)).length

  return (
    <div className="space-y-8">
      <PageHeader
        title="미답변 큐"
        description="48시간이 지난 질문을 먼저 보여 줍니다. 답변할 강사가 없는 분야는 따로 표시됩니다."
      />

      <Panel
        title={`48시간 초과 ${overdue.length}건`}
        description="해당 분야 강사에게 답변을 요청하세요."
      >
        {overdue.length === 0 ? (
          <p className="text-sm text-sub">48시간을 넘긴 미답변 질문이 없습니다.</p>
        ) : (
          <ul className="space-y-4">
            {overdue.map((t) => (
              <li
                key={t.question.id}
                className="rounded-md border border-negative/25 bg-negative-bg p-4"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="point">{t.question.field}</Badge>
                  <span className="text-xs text-sub">{t.question.student_alias}</span>
                  <Badge tone="negative">{t.hoursWaiting}시간 경과</Badge>
                  {coverage(t.question.field) === 0 ? (
                    <Badge tone="caution">이 분야 승인 강사 0명</Badge>
                  ) : (
                    <span className="text-xs text-sub tabular-nums">
                      답변 가능 강사 {coverage(t.question.field)}명
                    </span>
                  )}
                </div>
                <p className="mt-2.5 text-sm leading-relaxed text-ink">{t.question.body}</p>
                {coverage(t.question.field) === 0 ? (
                  <p className="mt-2 text-xs leading-relaxed text-caution">
                    이 분야에는 승인된 강사가 없습니다. 기다려도 답변이 오지 않습니다 — 신규 강사
                    섭외 근거로 쓰고, 필요하면 질문을 숨기지 말고 직접 안내해 주세요.
                  </p>
                ) : null}
                <form action={moderateQuestion} className="mt-3">
                  <input type="hidden" name="questionId" value={t.question.id} />
                  <input type="hidden" name="hide" value="true" />
                  <button
                    type="submit"
                    className="rounded-md border border-line-strong bg-card px-2.5 py-1 text-xs font-medium text-body hover:bg-muted"
                  >
                    숨김 처리
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {waiting.length > 0 ? (
        <Panel title={`대기 중 ${waiting.length}건`} description="48시간 안쪽입니다.">
          <ul className="divide-y divide-line">
            {waiting.map((t) => (
              <li key={t.question.id} className="py-3 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="point">{t.question.field}</Badge>
                  <span className="text-xs text-sub">{t.question.student_alias}</span>
                  <span className="text-xs text-sub tabular-nums">{t.hoursWaiting}시간</span>
                </div>
                <p className="mt-1.5 text-sm leading-relaxed text-body">{t.question.body}</p>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      {hidden.length > 0 ? (
        <Panel title="숨김 처리된 글" description="삭제가 아니라 비공개 상태입니다. 되돌릴 수 있습니다.">
          <ul className="divide-y divide-line">
            {hidden.map((t) => (
              <li
                key={t.question.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
              >
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-xs text-sub">
                    <IconChat width={14} height={14} />
                    {t.question.field} · {t.question.student_alias}
                  </p>
                  <p className="mt-1 text-sm text-body">{t.question.body}</p>
                </div>
                <form action={moderateQuestion}>
                  <input type="hidden" name="questionId" value={t.question.id} />
                  <input type="hidden" name="hide" value="false" />
                  <button
                    type="submit"
                    className="rounded-md border border-line-strong bg-card px-2.5 py-1 text-xs font-medium text-body hover:bg-muted"
                  >
                    다시 공개
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      {all.length === 0 ? (
        <EmptyState
          title="아직 질문이 없습니다"
          description="학생이 추천 결과에서 수업을 못 찾으면 Q&A로 안내됩니다."
        />
      ) : null}
    </div>
  )
}
