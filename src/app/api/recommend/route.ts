import { NextResponse } from 'next/server'
import { loadDataset } from '@/lib/db/dataset'
import { sessionByEntryCode, studentByPseudoCode } from '@/lib/db/queries'
import { recommend } from '@/lib/ai/recommend'
import { maskForStorage } from '@/lib/moderation'
import { clientKey, parseGrade, rateLimit } from '@/lib/validation'
import { expansionMessage, regionName } from '@/lib/region'
import type { GradeBand } from '@/types/domain'

/**
 * AI 추천. LLM 키가 서버 전용이므로 라우트 핸들러에서만 호출한다 (CLAUDE.md 아키텍처 규칙).
 *
 * **LLM 이 실패해도 200 이다.** 규칙 기반 순위와 규칙 문구로 내려간다 (E-06).
 * 이 화면은 학생이 QR 을 찍은 이유이고, 에러 화면은 곧 이탈이다.
 */
export async function POST(request: Request) {
  if (!rateLimit(clientKey(request.headers, 'recommend'), 20, 60_000)) {
    return NextResponse.json({ ok: false, message: '잠시 후 다시 시도해 주세요.' }, { status: 429 })
  }

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ ok: false, message: '요청을 읽을 수 없어요.' }, { status: 400 })
  }

  const entryCode = typeof body.entryCode === 'string' ? body.entryCode.trim() : ''
  const grade = parseGrade(body.grade)
  if (!grade) {
    return NextResponse.json({ ok: false, message: '학년 정보가 없어요.' }, { status: 400 })
  }

  const ds = await loadDataset()
  const ctx = sessionByEntryCode(ds, entryCode)
  if (!ctx) {
    return NextResponse.json({ ok: false, message: '참여 코드를 찾을 수 없어요.' }, { status: 404 })
  }

  const org = ds.organizations.find((o) => o.id === ctx.session.org_id)
  const regionCode = org?.region_code ?? ''

  // 같은 가명코드의 누적 이력 — 드론 2회 + 3D 1회 같은 경로를 반영한다 (E-18).
  let history: string[] = []
  const pseudoCode = typeof body.pseudoCode === 'string' ? body.pseudoCode.trim() : ''
  if (pseudoCode) {
    const student = studentByPseudoCode(ds, ctx.session.org_id, pseudoCode)
    if (student) {
      history = [
        ...new Set(
          ds.surveyResponses
            .filter((r) => r.student_id === student.id)
            .flatMap((r) => r.interest_fields),
        ),
      ]
    }
  }

  const interestFields = Array.isArray(body.interestFields)
    ? body.interestFields.filter((f): f is string => typeof f === 'string')
    : []

  const result = await recommend(ds, {
    regionCode,
    gradeBand: grade.band as GradeBand,
    interestFields,
    sessionField: ctx.session.field,
    followupIntent: Number(body.followupIntent ?? 2),
    wantToLearn: maskForStorage(typeof body.wantToLearn === 'string' ? body.wantToLearn : null),
    desiredJob: maskForStorage(typeof body.desiredJob === 'string' ? body.desiredJob : null),
    history,
  })

  return NextResponse.json({
    ok: true,
    source: result.source,
    stage: result.stage,
    regionName: regionName(regionCode),
    // 어느 단계에서 찾았는지를 문장으로 그대로 내려준다 — 빈 화면을 만들지 않기 위한 핵심 (E-07).
    stageMessage: expansionMessage(regionCode, { stage: result.stage, codes: result.stageCodes }),
    unmetFields: result.unmetFields,
    items: result.items.map((i) => ({
      programId: i.program.id,
      instructorId: i.instructor.id,
      title: i.program.title,
      field: i.program.field,
      format: i.program.format,
      sessionCount: i.program.session_count,
      summary: i.program.summary,
      instructorName: i.instructor.name,
      providerName: i.provider?.name ?? null,
      regionLabel: i.region_label,
      distance: i.distance,
      reason: i.reason,
      // 연락처·사진·평점은 이 응답에 존재하지 않는다. 필드 자체를 만들지 않는다.
    })),
  })
}
