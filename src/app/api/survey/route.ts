import { NextResponse } from 'next/server'
import { loadDataset } from '@/lib/db/dataset'
import { alreadyResponded, sessionByEntryCode, studentByPseudoCode, gradeLabel } from '@/lib/db/queries'
import { insertSurveyResponse } from '@/lib/db/writes'
import { maskForStorage, studentAlias } from '@/lib/moderation'
import { clientKey, rateLimit, validateSurvey } from '@/lib/validation'

/**
 * 설문 제출. 클라이언트에서 직접 INSERT 하지 않는 이유가 이 파일 안에 전부 있다 —
 * 마감 검증(E-17), 중복 제출 검증(E-03), 자유서술 마스킹(E-08)은 서버에서만 보장된다.
 */
export async function POST(request: Request) {
  if (!rateLimit(clientKey(request.headers, 'survey'), 12, 60_000)) {
    return NextResponse.json(
      { ok: false, message: '잠시 후 다시 시도해 주세요.' },
      { status: 429 },
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false, message: '요청을 읽을 수 없어요.' }, { status: 400 })
  }

  const parsed = validateSurvey(body)
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, field: parsed.field, message: parsed.message }, { status: 400 })
  }
  const input = parsed.value

  const ds = await loadDataset()
  const ctx = sessionByEntryCode(ds, input.entryCode)
  if (!ctx) {
    return NextResponse.json(
      { ok: false, reason: 'not_found', message: '참여 코드를 찾을 수 없어요.' },
      { status: 404 },
    )
  }

  // 마감된 회차는 거부한다. 404 가 아니라 안내로 보낸다 (E-01·E-17).
  if (ctx.closed) {
    return NextResponse.json(
      {
        ok: false,
        reason: 'closed',
        message: '이 수업의 응답 기간이 끝났어요. 궁금한 건 공개 Q&A에 남겨 주세요.',
      },
      { status: 409 },
    )
  }

  // 가명코드가 있으면 같은 회차 중복 응답을 막는다. 익명은 막지 않는다 (E-03·E-04).
  let studentId: string | null = null
  if (input.pseudoCode) {
    const student = studentByPseudoCode(ds, ctx.session.org_id, input.pseudoCode)
    if (!student) {
      return NextResponse.json(
        {
          ok: false,
          reason: 'unknown_code',
          field: 'pseudoCode',
          message: '참여 코드를 찾을 수 없어요. 다시 입력하거나 코드 없이 참여할 수 있어요.',
        },
        { status: 404 },
      )
    }
    if (alreadyResponded(ds, ctx.session.id, student.id)) {
      return NextResponse.json(
        { ok: false, reason: 'duplicate', message: '이미 응답했어요. 추천 결과를 다시 볼 수 있어요.' },
        { status: 409 },
      )
    }
    studentId = student.id
  }

  // 자유서술은 **마스킹된 값만** 저장한다. 원문을 남기지 않는다 (E-08).
  const wantToLearn = maskForStorage(input.wantToLearn)
  const desiredJob = maskForStorage(input.desiredJob)

  const { id } = await insertSurveyResponse({
    sessionId: ctx.session.id,
    studentId,
    grade: input.grade,
    satisfaction: input.satisfaction,
    followupIntent: input.followupIntent,
    interestFields: input.interestFields,
    wantToLearn,
    desiredJob,
    availableTimes: input.availableTimes,
  })

  return NextResponse.json({
    ok: true,
    responseId: id,
    sessionId: ctx.session.id,
    sessionField: ctx.session.field,
    alias: studentAlias(gradeLabel(input.grade), 0),
    masked: wantToLearn !== (input.wantToLearn ?? null) || desiredJob !== (input.desiredJob ?? null),
  })
}
