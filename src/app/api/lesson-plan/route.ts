import { NextResponse } from 'next/server'
import { getActor } from '@/lib/auth/actor'
import { loadDataset } from '@/lib/db/dataset'
import { upsertLessonPlan } from '@/lib/db/writes'
import { generateLessonPlan } from '@/lib/ai/lesson-plan'
import { clientKey, rateLimit } from '@/lib/validation'

/**
 * AI 수업 설계 도우미. LLM 키가 서버 전용이므로 라우트 핸들러에서만 호출한다
 * (CLAUDE.md 아키텍처 규칙).
 *
 * **LLM 이 실패해도 200 이다.** 규칙 골격으로 내려간다 (ADR-017). 강사는 수업 전날 밤에 이
 * 버튼을 누른다. 그때 에러가 뜨면 다시 열지 않는다.
 *
 * 권한: **그 회차에 배정된 강사 본인만.** 실 DB 에서는 RLS 가 한 번 더 막지만(ADR-015·019),
 * 데모 모드에는 RLS 가 없으므로 여기가 유일한 방어선이다.
 */
export async function POST(request: Request) {
  // LLM 호출이 붙으므로 추천보다 빡빡하게 잡는다.
  if (!rateLimit(clientKey(request.headers, 'lesson-plan'), 10, 60_000)) {
    return NextResponse.json({ ok: false, message: '잠시 후 다시 시도해 주세요.' }, { status: 429 })
  }

  const actor = await getActor()
  if (!actor || actor.role !== 'instructor') {
    return NextResponse.json({ ok: false, message: '권한이 없습니다.' }, { status: 403 })
  }

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ ok: false, message: '요청을 읽을 수 없습니다.' }, { status: 400 })
  }

  const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : ''
  if (!sessionId) {
    return NextResponse.json({ ok: false, message: '회차를 찾을 수 없습니다.' }, { status: 400 })
  }

  const ds = await loadDataset()
  // 배정되지 않은 회차는 존재 자체를 알려주지 않는다 (E-23).
  const session = ds.lectureSessions.find(
    (s) => s.id === sessionId && s.instructor_id === actor.instructorId,
  )
  if (!session) {
    return NextResponse.json({ ok: false, message: '배정된 회차가 아닙니다.' }, { status: 404 })
  }

  const draft = await generateLessonPlan(ds, session)

  try {
    await upsertLessonPlan({
      sessionId: session.id,
      instructorId: actor.instructorId,
      title: draft.skeleton.title,
      objectives: draft.skeleton.objectives,
      steps: draft.skeleton.steps,
      materials: draft.skeleton.materials,
      safetyNotes: draft.skeleton.safety_notes,
      source: draft.source,
      inputsSnapshot: draft.inputs,
      status: 'draft',
    })
  } catch {
    // 저장에 실패해도 화면에는 초안을 보여준다. 강사가 그대로 복사해 쓸 수 있으면 충분하다.
    return NextResponse.json({ ok: true, saved: false, source: draft.source, plan: draft.skeleton })
  }

  return NextResponse.json({
    ok: true,
    saved: true,
    source: draft.source,
    // 지난 회차 응답이 몇 건 반영됐는지. 화면에서 강사가 차이를 체감하는 유일한 지표다 (ADR-018).
    priorResponses: draft.inputs.prior?.response_count ?? 0,
    plan: draft.skeleton,
    // 연락처·학생 식별 정보는 이 응답에 존재하지 않는다. 필드 자체를 만들지 않는다.
  })
}
