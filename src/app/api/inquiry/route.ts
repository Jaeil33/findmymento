import { NextResponse } from 'next/server'
import { insertInquiry } from '@/lib/db/writes'
import { moderate } from '@/lib/moderation'
import { clientKey, rateLimit, validateInquiry } from '@/lib/validation'

/**
 * 보호자 문의 접수. 비로그인 폼이므로 이 라우트가 유일한 방어선이다.
 *
 * - 필수값·길이·동의 체크 → `validateInquiry`
 * - 금칙어·스팸·레이트 리밋 → 아래 (E-21)
 * - 아이 실명·학교가 적혀 온 경우 마스킹 (E-22. 1차 방어는 입력란을 안 만든 것)
 *
 * **클라이언트에서 `inquiries` 에 직접 INSERT 하지 않는다.** anon 에게 INSERT 권한이 열려 있는
 * 유일한 테이블이라 검증 없는 경로가 생기면 그대로 광고판이 된다.
 * 그리고 이 라우트는 **접수된 문의를 절대 돌려주지 않는다** — 성인의 실명·연락처가 들어 있다.
 */
export async function POST(request: Request) {
  if (!rateLimit(clientKey(request.headers, 'inquiry'), 3, 10 * 60_000)) {
    return NextResponse.json(
      {
        ok: false,
        message: '문의가 이미 접수됐어요. 담당자가 확인 중이니 조금만 기다려 주세요.',
      },
      { status: 429 },
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false, message: '요청을 읽을 수 없어요.' }, { status: 400 })
  }

  const parsed = validateInquiry(body)
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, field: parsed.field, message: parsed.message }, { status: 400 })
  }
  const input = parsed.value

  // 요청 내용에서 링크·연락처가 반복되면 광고로 본다.
  const scan = moderate(input.message, 'mask')
  if (scan.findings.filter((f) => f === 'url' || f === 'messenger').length > 0 && input.message.length < 40) {
    return NextResponse.json(
      { ok: false, field: 'message', message: '요청 내용을 조금 더 구체적으로 써 주세요.' },
      { status: 422 },
    )
  }

  const { id } = await insertInquiry({
    guardianName: input.guardianName,
    guardianContact: input.guardianContact,
    regionCode: input.regionCode,
    gradeBand: input.gradeBand,
    field: input.field,
    targetType: input.targetType,
    targetId: input.targetId,
    // 아이 실명·학교가 적혀 왔으면 저장 전에 가린다.
    message: scan.clean,
  })

  return NextResponse.json({ ok: true, id, masked: scan.findings.length > 0 })
}
