import { NextResponse } from 'next/server'
import { loadDataset } from '@/lib/db/dataset'
import { isClosed, sessionByEntryCode, studentByPseudoCode, gradeLabel } from '@/lib/db/queries'
import { insertInterest } from '@/lib/db/writes'
import { studentAlias } from '@/lib/moderation'
import { clientKey, parseGrade, rateLimit } from '@/lib/validation'

/**
 * 학생의 "관심 표현".
 *
 * **이 요청은 강사에게 도달하지 않는다.** `interests` 행이 기관 대시보드에 쌓이고,
 * 기관이 검토 → 보호자 동의 기록 → 섭외 요청을 보내는 순서로만 연결이 일어난다.
 * 학생이 누르는 버튼 중 강사에게 직접 닿는 것은 하나도 없다 (PRD 안전 설계 3).
 */
export async function POST(request: Request) {
  if (!rateLimit(clientKey(request.headers, 'interest'), 15, 60_000)) {
    return NextResponse.json({ ok: false, message: '잠시 후 다시 시도해 주세요.' }, { status: 429 })
  }

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ ok: false, message: '요청을 읽을 수 없어요.' }, { status: 400 })
  }

  const entryCode = typeof body.entryCode === 'string' ? body.entryCode.trim() : ''
  const programId = typeof body.programId === 'string' ? body.programId.trim() : ''
  const grade = parseGrade(body.grade)

  if (!programId || !grade) {
    return NextResponse.json({ ok: false, message: '요청 값이 올바르지 않아요.' }, { status: 400 })
  }

  const ds = await loadDataset()
  const ctx = sessionByEntryCode(ds, entryCode)
  if (!ctx) {
    return NextResponse.json({ ok: false, message: '참여 코드를 찾을 수 없어요.' }, { status: 404 })
  }
  if (isClosed(ctx.session)) {
    return NextResponse.json(
      { ok: false, message: '이 수업의 응답 기간이 끝났어요.' },
      { status: 409 },
    )
  }

  // 승인된 강사의 프로그램만 대상이 될 수 있다 (E-11).
  const program = ds.programs.find((p) => p.id === programId)
  const instructor = program
    ? ds.instructors.find((i) => i.id === program.instructor_id && i.status === 'approved')
    : undefined
  if (!program || !instructor) {
    return NextResponse.json({ ok: false, message: '대상을 찾을 수 없어요.' }, { status: 404 })
  }

  const pseudoCode = typeof body.pseudoCode === 'string' ? body.pseudoCode.trim() : ''
  const student = pseudoCode ? studentByPseudoCode(ds, ctx.session.org_id, pseudoCode) : null

  const ordinal = ds.interests.length % 26
  const { id } = await insertInterest({
    sessionId: ctx.session.id,
    studentId: student?.id ?? null,
    targetType: 'program',
    targetId: program.id,
    alias: studentAlias(gradeLabel(grade), ordinal),
  })

  return NextResponse.json({
    ok: true,
    id,
    // 다음에 무엇이 일어나는지 학생에게 분명히 알려준다. 강사에게 바로 가지 않는다.
    message: `${ctx.orgName} 선생님께 전달됐어요. 선생님이 보호자님 확인을 거쳐 수업 개설을 검토해요.`,
  })
}
