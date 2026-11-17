import { NextResponse } from 'next/server'
import { getActor } from '@/lib/auth/actor'
import { approveStudioContent } from '@/lib/db/writes'
import { clientKey, rateLimit } from '@/lib/validation'

/**
 * 강사 승인. **검증을 통과한(`validated`) 산출물만 승인된다** (ADR-030).
 *
 * 실 DB 에서는 트리거가 `validated → approved` 외의 전이를 거부하고, 데모 모드에서는
 * `approveStudioContent` 의 검사가 같은 경계다. 라우트는 그 결과를 그대로 전한다 —
 * 실패를 성공처럼 돌려주지 않는다.
 */
export async function POST(request: Request) {
  if (!rateLimit(clientKey(request.headers, 'studio-approve'), 30, 60_000)) {
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

  const id = typeof body.id === 'string' ? body.id.trim() : ''
  if (id === '') {
    return NextResponse.json({ ok: false, message: '어느 산출물인지 알 수 없습니다.' }, { status: 400 })
  }

  try {
    const result = await approveStudioContent({ id, instructorId: actor.instructorId })
    if (!result.ok) {
      // 남의 산출물이거나 검증을 통과하지 않은 산출물이다. 둘을 구분해 알려주지 않는다.
      return NextResponse.json(
        { ok: false, message: '검증을 통과한 내 산출물만 승인할 수 있습니다.' },
        { status: 409 },
      )
    }
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: false, message: '승인에 실패했습니다.' }, { status: 500 })
  }
}
