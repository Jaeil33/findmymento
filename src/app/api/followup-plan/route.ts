import { NextResponse } from 'next/server'
import { getActor } from '@/lib/auth/actor'
import { loadDataset } from '@/lib/db/dataset'
import { generateFollowupPlan, ruleFollowupPlan } from '@/lib/ai/followup-plan'
import { clientKey, rateLimit } from '@/lib/validation'
import type { FollowupPlanDraft } from '@/types/domain'

/**
 * AI 후속 과정 제안 + 섭외 요청 문안 (ADR-024 기능 5). **기관·학교 담당자 전용, 자기 기관 회차만.**
 *
 * 아무것도 저장하지 않고 섭외 요청을 자동으로 보내지 않는다 — 기관이 문안을 복사해 섭외 화면에서
 * 직접 보낸다. 수요·강사 후보는 규칙이 확정하고, LLM 이 실패해도 규칙 초안으로 200 이다.
 *
 * 역할과 소속은 `getActor()` 로만 판단한다. 본문에서 읽는 값은 `sessionId` 하나뿐이다.
 */
export async function POST(request: Request): Promise<Response> {
  if (!rateLimit(clientKey(request.headers, 'followup-plan'), 10, 60_000)) {
    return NextResponse.json({ ok: false, message: '잠시 후 다시 시도해 주세요.' }, { status: 429 })
  }

  const actor = await getActor()
  if (!actor || actor.role !== 'org_member') {
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
  // 없는 회차와 남의 기관 회차를 같은 응답으로 돌려준다 — 다른 기관 회차가 있는지조차 흘리지 않는다.
  const owned = ds.lectureSessions.some((s) => s.id === sessionId && s.org_id === actor.orgId)
  if (!owned) return notFound()

  let draft: FollowupPlanDraft | null
  try {
    draft = await generateFollowupPlan(ds, sessionId)
  } catch {
    // 생성 함수는 throw 하지 않게 만들어져 있다. 그래도 새면 에러 화면 대신 규칙 초안이다.
    draft = ruleFollowupPlan(ds, sessionId)
  }
  if (!draft) return notFound()

  return NextResponse.json({ ok: true, source: draft.source, draft })
}

function notFound(): Response {
  return NextResponse.json({ ok: false, message: '회차를 찾을 수 없습니다.' }, { status: 404 })
}
