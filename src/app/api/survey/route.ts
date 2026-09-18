import { NextResponse } from 'next/server'
import { gradeLabel } from '@/lib/db/queries'
import { findStudentByPseudoCode, hasResponded, loadEntryContext } from '@/lib/db/student-gate'
import { insertSurveyResponse } from '@/lib/db/writes'
import { maskForStorage, studentAlias } from '@/lib/moderation'
import { STUDENT_RATE_LIMITS, clientKey, rateLimit, validateSurvey } from '@/lib/validation'

/**
 * 설문 제출. 클라이언트에서 직접 INSERT 하지 않는 이유가 이 파일 안에 전부 있다 —
 * 마감 검증(E-17), 중복 제출 검증(E-03), 자유서술 마스킹(E-08)은 서버에서만 보장된다.
 *
 * 입장 코드·가명코드 확인은 서버 게이트(`lib/db/student-gate`)가 한다. anon 은 회차·학생을 읽을 수 없다.
 */
export async function POST(request: Request) {
  // 한 반 = 학교 와이파이 하나 = 공인 IP 하나. 한 반이 1분 안에 제출해도 막히지 않는 한도다.
  if (!rateLimit(clientKey(request.headers, 'survey'), STUDENT_RATE_LIMITS.survey, 60_000)) {
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

  const ctx = await loadEntryContext(input.entryCode)
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
    const student = await findStudentByPseudoCode(ctx.session.org_id, input.pseudoCode)
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
    if (await hasResponded(ctx.session.id, student.id)) {
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

  let id: string
  try {
    const saved = await insertSurveyResponse({
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
    id = saved.id
  } catch (err) {
    // 크래시(HTML 500) 대신 JSON 안내를 준다. 학생 화면은 답을 브라우저에 들고 다시 시도한다 (E-05).
    // 로그에는 사유 분류만 남긴다 — 학생 답 본문을 서버 로그에 쓰지 않는다.
    console.error(
      JSON.stringify({
        event: 'survey_insert_failed',
        sessionId: ctx.session.id,
        code: (err as { code?: unknown } | null)?.code ?? null,
      }),
    )
    return NextResponse.json(
      { ok: false, reason: 'save_failed', message: '답을 저장하지 못했어요. 잠시 후 다시 눌러 주세요.' },
      { status: 503 },
    )
  }

  return NextResponse.json({
    ok: true,
    responseId: id,
    sessionId: ctx.session.id,
    sessionField: ctx.session.field,
    alias: studentAlias(gradeLabel(input.grade), 0),
    masked: wantToLearn !== (input.wantToLearn ?? null) || desiredJob !== (input.desiredJob ?? null),
  })
}
