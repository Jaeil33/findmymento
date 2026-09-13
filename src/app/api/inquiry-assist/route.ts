import { NextResponse } from 'next/server'
import { generateInquiryAssist } from '@/lib/ai/inquiry-assist'
import { loadDataset } from '@/lib/db/dataset'
import { PILOT_REGION_CODE, getRegion } from '@/lib/region'
import { clientKey, isField, rateLimit } from '@/lib/validation'
import type { GradeBand } from '@/types/domain'

/**
 * 보호자 문의 도우미 (ADR-026). 비로그인이다 — 보호자는 계정을 만들지 않는다.
 *
 * **초안만 돌려주고 아무에게도 닿지 않는다.** 문의 접수는 기존 `/api/inquiry` 하나뿐이고,
 * 이 라우트는 어떤 테이블에도 쓰지 않는다. 역할을 보지 않는 것도 같은 이유다 — 권한을 주는 경로가 아니다.
 *
 * 보호자가 적은 설명 원문은 응답에 되돌려주지 않는다. 가린 결과로 만든 초안만 내려간다.
 * **LLM 이 실패해도 200 이다.** 조건 정리와 프로그램 찾기는 규칙이다.
 */
export async function POST(request: Request) {
  if (!rateLimit(clientKey(request.headers, 'inquiry-assist'), 10, 60_000)) {
    return NextResponse.json({ ok: false, message: '잠시 후 다시 시도해 주세요.' }, { status: 429 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false, message: '요청을 읽을 수 없어요.' }, { status: 400 })
  }
  const r =
    typeof body === 'object' && body !== null && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : {}

  const situation = typeof r.situation === 'string' ? r.situation.trim() : ''
  if (situation.length < 5) {
    return NextResponse.json(
      { ok: false, field: 'situation', message: '아이 상황을 한두 문장으로 적어 주세요.' },
      { status: 400 },
    )
  }
  if (situation.length > 500) {
    return NextResponse.json(
      { ok: false, field: 'situation', message: '500자 안으로 적어 주세요.' },
      { status: 400 },
    )
  }

  const regionCode =
    typeof r.regionCode === 'string' && getRegion(r.regionCode) ? r.regionCode : PILOT_REGION_CODE
  const gradeBand: GradeBand | null =
    r.gradeBand === 'elementary' || r.gradeBand === 'middle' || r.gradeBand === 'high' ? r.gradeBand : null
  const field = typeof r.field === 'string' && isField(r.field) ? r.field : null

  const draft = await generateInquiryAssist(await loadDataset(), { situation, regionCode, gradeBand, field })

  return NextResponse.json({ ok: true, source: draft.source, draft })
}
