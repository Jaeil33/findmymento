import { NextResponse } from 'next/server'
import { loadDataset } from '@/lib/db/dataset'
import { loadEntryContext } from '@/lib/db/student-gate'
import { insertQuestion } from '@/lib/db/writes'
import { moderate, studentAlias } from '@/lib/moderation'
import { clientKey, rateLimit, validateQuestion } from '@/lib/validation'
import { GRADE_BAND_LABEL } from '@/types/domain'

/**
 * Q&A 질문 작성. 금칙어 필터를 거치지 않는 INSERT 경로를 만들지 않기 위해 라우트를 둔다.
 *
 * 연락처·외부 링크는 **차단**한다 (E-09). 안내는 한 줄만 — 규칙 상세를 설명하면
 * 우회 방법을 알려주는 것과 같다.
 */
export async function POST(request: Request) {
  if (!rateLimit(clientKey(request.headers, 'qna'), 6, 60_000)) {
    return NextResponse.json(
      { ok: false, message: '질문을 너무 빠르게 올리고 있어요. 잠시 후 다시 시도해 주세요.' },
      { status: 429 },
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false, message: '요청을 읽을 수 없어요.' }, { status: 400 })
  }

  const parsed = validateQuestion(body)
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, field: parsed.field, message: parsed.message }, { status: 400 })
  }
  const input = parsed.value

  const result = moderate(input.body, 'block')
  if (result.blocked) {
    return NextResponse.json({ ok: false, field: 'body', message: result.message }, { status: 422 })
  }

  // 질문은 회차 코드가 있으면 그 기관에 묶인다 — 기관 담당자가 모더레이터이기 때문이다 (UC-22).
  // 입장 코드 확인은 서버 게이트가 한다. anon 은 회차를 읽을 수 없다.
  const ctx = input.entryCode ? await loadEntryContext(input.entryCode) : null
  const orgId = ctx?.session.org_id ?? null
  const ds = await loadDataset()

  // 화면에는 가명만 남는다. 가명코드 원문은 저장·노출하지 않는다 (UI_GUIDE 안전규칙 2).
  const ordinal = ds.qnaQuestions.length % 26
  const alias = studentAlias(GRADE_BAND_LABEL[input.gradeBand], ordinal)

  const { id } = await insertQuestion({
    alias,
    field: input.field,
    body: result.clean,
    orgId,
  })

  return NextResponse.json({ ok: true, id, alias })
}
