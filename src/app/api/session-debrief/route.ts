import { NextResponse } from 'next/server'
import { getActor } from '@/lib/auth/actor'
import { loadDataset } from '@/lib/db/dataset'
import { generateDebrief, ruleDebrief } from '@/lib/ai/session-debrief'
import { clientKey, rateLimit } from '@/lib/validation'
import type { SessionDebriefDraft } from '@/types/domain'

/**
 * AI 수업 회고 + 학교 제출용 결과 요약 (ADR-024 기능 6). **그 회차에 배정된 강사 본인만.**
 *
 * 아무것도 저장하지 않는다. 지표와 무엇을 짚을지는 규칙이 정하고, LLM 이 실패해도 규칙 초안으로
 * 200 이다. 데모 모드에는 RLS 가 없으므로 배정 확인은 여기가 방어선이다 (ADR-015).
 *
 * 역할과 배정은 `getActor()` 로만 판단한다. 본문에서 읽는 값은 `sessionId` 하나뿐이다.
 */
export async function POST(request: Request): Promise<Response> {
  if (!rateLimit(clientKey(request.headers, 'session-debrief'), 10, 60_000)) {
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

  const sessionId = (body as { sessionId?: unknown } | null)?.sessionId
  if (typeof sessionId !== 'string' || sessionId.length < 1 || sessionId.length > 64) {
    return NextResponse.json({ ok: false, message: '회차를 지정해 주세요.' }, { status: 400 })
  }

  const ds = await loadDataset()
  // 배정되지 않은 회차와 없는 회차를 같은 응답으로 돌려준다 (E-23).
  const assigned = ds.lectureSessions.some(
    (s) => s.id === sessionId && s.instructor_id === actor.instructorId,
  )
  if (!assigned) return notFound()

  let draft: SessionDebriefDraft | null
  try {
    draft = await generateDebrief(ds, sessionId)
  } catch {
    // 생성 함수는 throw 하지 않게 만들어져 있다. 그래도 새면 에러 화면 대신 규칙 초안이다.
    draft = ruleDebrief(ds, sessionId)
  }
  if (!draft) return notFound()

  return NextResponse.json({ ok: true, source: draft.source, draft })
}

function notFound(): Response {
  return NextResponse.json({ ok: false, message: '배정된 회차가 아닙니다.' }, { status: 404 })
}
