import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { PageHeader } from '@/components/ui/Section'
import { LessonPlanView } from '@/components/lesson/LessonPlanView'
import { demoAiEnabled } from '@/lib/ai/demo-writer'
import { getActor } from '@/lib/auth/actor'
import { loadDataset } from '@/lib/db/dataset'
import { gradeBandLabel } from '@/lib/db/queries'
import { priorFeedback } from '@/lib/ai/lesson-plan'
import { IconArrowLeft } from '@/components/ui/Icons'

/**
 * AI 수업 설계 도우미 (ADR-017).
 *
 * **배정된 강사 본인만 연다.** 배정되지 않은 회차는 존재 자체를 알려주지 않는다 (E-23).
 * 실 DB 에서는 RLS 가 한 번 더 막는다 (ADR-019).
 */
export default async function LessonPlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const actor = await getActor()
  if (!actor || actor.role !== 'instructor') redirect('/login')

  const ds = await loadDataset()
  const session = ds.lectureSessions.find(
    (s) => s.id === id && s.instructor_id === actor.instructorId,
  )
  if (!session) notFound()

  const org = ds.organizations.find((o) => o.id === session.org_id)
  const existing =
    ds.lessonPlans.find(
      (p) => p.session_id === session.id && p.instructor_id === actor.instructorId,
    ) ?? null

  const prior = priorFeedback(ds, session.org_id, session.field, session.id)

  const conditions = [
    `${gradeBandLabel(session.grade_band)} ${session.expected_students}명 · ${session.duration_minutes}분 · ${session.venue}`,
    session.equipment.length > 0 ? `보유 장비: ${session.equipment.join(', ')}` : '보유 장비: 미입력',
  ]

  return (
    <div className="space-y-8">
      <Link
        href={`/instructor/sessions/${session.id}`}
        className="inline-flex items-center gap-1.5 text-sm text-sub hover:text-ink"
      >
        <IconArrowLeft width={16} height={16} />
        회차 리포트
      </Link>

      <PageHeader
        eyebrow={`${session.field} · ${org?.name ?? ''}`}
        title="수업 설계 도우미"
        description={
          <>
            {session.title} · {session.held_on} 진행. 이 반의 조건에 맞춘 차시 흐름과 단계별 난이도
            조절안을 만듭니다.
          </>
        }
      />

      <LessonPlanView
        demoAi={demoAiEnabled()}
        sessionId={session.id}
        initialPlan={existing}
        initialSource={existing?.source ?? null}
        initialPriorResponses={prior?.response_count ?? 0}
        conditions={conditions}
        classTraits={session.class_traits}
      />
    </div>
  )
}
