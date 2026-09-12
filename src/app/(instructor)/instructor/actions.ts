'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getActor } from '@/lib/auth/actor'
import { loadDataset } from '@/lib/db/dataset'
import { insertAnswer, updateRecruitmentStatus } from '@/lib/db/ops'
import { moderate } from '@/lib/moderation'

/**
 * 강사 서버 액션.
 *
 * 할 수 없는 일: **회차 생성·수정.** 회차의 소유자는 기관이어야 개인정보 처리위탁 관계가
 * 성립한다 (ADR-015). 이 파일에 회차를 만드는 함수가 없는 것이 그 제약의 구현이다.
 */
async function requireInstructor() {
  const actor = await getActor()
  if (!actor || actor.role !== 'instructor') redirect('/login')
  return actor
}

export async function respondToRecruitment(formData: FormData) {
  const actor = await requireInstructor()
  const id = String(formData.get('requestId') ?? '')
  const accept = String(formData.get('accept') ?? '') === 'true'

  // 자기에게 온 요청만 응답할 수 있다.
  const ds = await loadDataset()
  const request = ds.recruitmentRequests.find(
    (r) => r.id === id && r.instructor_id === actor.instructorId,
  )
  if (!request) return

  await updateRecruitmentStatus(id, accept ? 'accepted' : 'declined')
  revalidatePath('/instructor/recruitment')
  revalidatePath('/instructor')
}

/**
 * Q&A 답변. 연락처·외부 링크는 **강사 답변에서도 차단된다** (E-10).
 * 플랫폼 밖 직거래로 빠지는 경로를 막는 목적도 있다.
 */
export async function answerQuestion(formData: FormData) {
  const actor = await requireInstructor()
  const questionId = String(formData.get('questionId') ?? '')
  const body = String(formData.get('body') ?? '').trim()

  if (body.length < 5) redirect('/instructor/qna?error=short')

  const ds = await loadDataset()
  const question = ds.qnaQuestions.find((q) => q.id === questionId && q.visibility === 'public')
  if (!question) return

  const result = moderate(body, 'block')
  if (result.blocked) redirect('/instructor/qna?error=blocked')

  await insertAnswer({
    questionId,
    instructorId: actor.instructorId,
    body: result.clean.slice(0, 1500),
  })

  revalidatePath('/instructor/qna')
  revalidatePath('/qna')
}
