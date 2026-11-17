import { NextResponse } from 'next/server'
import { getActor } from '@/lib/auth/actor'
import { loadDataset } from '@/lib/db/dataset'
import { insertStudioFeedback } from '@/lib/db/writes'
import { studioContentById } from '@/lib/studio/library'
import { validateFeedback } from '@/lib/studio/request'
import { clientKey, rateLimit } from '@/lib/validation'

/**
 * 수업 후 성과 피드백. **회차 단위 집계만 받는다** (ADR-032).
 *
 * 학생 개인 단위 입력을 받는 필드가 없고, 추가하지 말 것 — 누가 완성하지 못했는지는
 * 이 플랫폼에 들어오지 않는다.
 */
export async function POST(request: Request) {
  if (!rateLimit(clientKey(request.headers, 'studio-feedback'), 20, 60_000)) {
    return NextResponse.json({ ok: false, message: '잠시 후 다시 시도해 주세요.' }, { status: 429 })
  }

  const actor = await getActor()
  if (!actor || actor.role !== 'instructor') {
    return NextResponse.json({ ok: false, message: '권한이 없습니다.' }, { status: 403 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false, message: '요청을 읽을 수 없습니다.' }, { status: 400 })
  }

  const validated = validateFeedback(body)
  if (!validated.ok) {
    return NextResponse.json(
      { ok: false, field: validated.field, message: validated.message },
      { status: 400 },
    )
  }
  const input = validated.value

  const ds = await loadDataset()
  const content = studioContentById(ds.studioContents, input.contentId)
  // 남의 산출물에는 기록할 수 없다. 없는 것과 남의 것을 구분해 알려주지 않는다.
  if (!content || content.instructor_id !== actor.instructorId) {
    return NextResponse.json({ ok: false, message: '찾을 수 없습니다.' }, { status: 404 })
  }

  try {
    const saved = await insertStudioFeedback({
      contentId: content.id,
      sessionId: content.session_id,
      instructorId: actor.instructorId,
      attemptedCount: input.attemptedCount,
      completedCount: input.completedCount,
      actualMinutes: input.actualMinutes,
      difficultyVote: input.difficultyVote,
      note: input.note,
    })
    return NextResponse.json({ ok: true, id: saved.id })
  } catch {
    return NextResponse.json({ ok: false, message: '저장에 실패했습니다.' }, { status: 500 })
  }
}
