import { NextResponse } from 'next/server'
import { getActor } from '@/lib/auth/actor'
import { loadDataset } from '@/lib/db/dataset'
import { generateSessionPlan } from '@/lib/ai/session-plan'
import { maskForStorage } from '@/lib/moderation'
import { clientKey, rateLimit } from '@/lib/validation'
import type { GradeBand } from '@/types/domain'

/**
 * AI 회차 기획 도우미 (ADR-021). **기관·학교 담당자 전용이다.**
 *
 * 아무것도 저장하지 않는다 — 초안은 회차 생성 폼으로 옮겨 담는 용도이고, 저장되는 것은
 * 담당자가 실제로 만든 회차뿐이다. 저장하지 않으므로 RLS 도 필요 없다.
 *
 * **LLM 이 실패해도 200 이다.** 관내 공급 현황과 미충족 수요는 규칙으로 계산되므로
 * 모델이 죽어도 담당자가 볼 숫자는 그대로 나온다.
 */
export async function POST(request: Request) {
  if (!rateLimit(clientKey(request.headers, 'session-plan'), 10, 60_000)) {
    return NextResponse.json({ ok: false, message: '잠시 후 다시 시도해 주세요.' }, { status: 429 })
  }

  const actor = await getActor()
  if (!actor || actor.role !== 'org_member') {
    return NextResponse.json({ ok: false, message: '권한이 없습니다.' }, { status: 403 })
  }

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ ok: false, message: '요청을 읽을 수 없습니다.' }, { status: 400 })
  }

  const band = body.gradeBand
  const gradeBand: GradeBand =
    band === 'elementary' || band === 'middle' || band === 'high' ? band : 'middle'

  const ds = await loadDataset()
  const org = ds.organizations.find((o) => o.id === actor.orgId)

  const draft = await generateSessionPlan(ds, {
    orgId: actor.orgId,
    regionCode: org?.region_code ?? '',
    gradeBand,
    expectedStudents: clamp(Number(body.expectedStudents ?? 30), 1, 500),
    durationMinutes: clamp(Number(body.durationMinutes ?? 50), 20, 300),
    // 담당자가 적은 목적도 자유 텍스트다. 마스킹을 통과한 값만 LLM 에 간다.
    purpose: maskForStorage(typeof body.purpose === 'string' ? body.purpose : null),
  })

  return NextResponse.json({ ok: true, source: draft.source, draft })
}

function clamp(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min
  return Math.max(min, Math.min(max, Math.round(v)))
}
