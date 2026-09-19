import { NextResponse } from 'next/server'
import { loadDataset } from '@/lib/db/dataset'
import { findStudentByPseudoCode, loadEntryContext, studentFieldHistory } from '@/lib/db/student-gate'
import { insertRecommendationLog } from '@/lib/db/writes'
import { recommend } from '@/lib/ai/recommend'
import { pickCareers } from '@/lib/ai/career'
import { maskForStorage } from '@/lib/moderation'
import { STUDENT_RATE_LIMITS, clientKey, parseGrade, rateLimit } from '@/lib/validation'
import { expansionMessage, regionName } from '@/lib/region'
import type { GradeBand } from '@/types/domain'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * AI 추천. LLM 키가 서버 전용이므로 라우트 핸들러에서만 호출한다 (CLAUDE.md 아키텍처 규칙).
 *
 * **LLM 이 실패해도 200 이다.** 규칙 기반 순위와 규칙 문구로 내려간다 (E-06).
 * 이 화면은 학생이 QR 을 찍은 이유이고, 에러 화면은 곧 이탈이다.
 *
 * 학생에게 보여 준 카드와 출처(llm/rule)는 `recommendation_logs` 에 남긴다. 기록 실패는 삼킨다 —
 * 기록 때문에 학생 화면이 깨지면 안 된다.
 */
export async function POST(request: Request) {
  // 한 반 = 학교 와이파이 하나 = 공인 IP 하나. 한 반이 1분 안에 추천을 받아도 막히지 않는 한도다.
  if (!rateLimit(clientKey(request.headers, 'recommend'), STUDENT_RATE_LIMITS.recommend, 60_000)) {
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

  const ctx = await loadEntryContext(entryCode)
  if (!ctx) {
    return NextResponse.json({ ok: false, message: '참여 코드를 찾을 수 없어요.' }, { status: 404 })
  }

  const regionCode = ctx.orgRegionCode

  // 같은 가명코드의 누적 이력 — 드론 2회 + 3D 1회 같은 경로를 반영한다 (E-18).
  let history: string[] = []
  const pseudoCode = typeof body.pseudoCode === 'string' ? body.pseudoCode.trim() : ''
  if (pseudoCode) {
    const student = await findStudentByPseudoCode(ctx.session.org_id, pseudoCode)
    if (student) history = await studentFieldHistory(student.id)
  }

  const interestFields = Array.isArray(body.interestFields)
    ? body.interestFields.filter((f): f is string => typeof f === 'string')
    : []

  // 자유서술은 가린 값만 쓴다. 수업 추천과 진로 카드 양쪽이 같은 값을 받는다 (E-08).
  const followupIntent = Number(body.followupIntent ?? 2)
  const wantToLearn = maskForStorage(typeof body.wantToLearn === 'string' ? body.wantToLearn : null)
  const desiredJob = maskForStorage(typeof body.desiredJob === 'string' ? body.desiredJob : null)

  // 후보(프로그램·강사·업체)는 공개 디렉토리와 같은 경로로 읽는다 — anon 에게는 승인된 것만 보인다.
  const ds = await loadDataset()
  const result = await recommend(ds, {
    regionCode,
    gradeBand: grade.band as GradeBand,
    interestFields,
    sessionField: ctx.session.field,
    followupIntent,
    wantToLearn,
    desiredJob,
    history,
  })

  // 추천할 수업이 0건이면 빈 안내 대신 진로 카드 3장 (ADR-027). 후보는 검수된 목록뿐이다.
  const career =
    result.items.length === 0
      ? await pickCareers({
          gradeBand: grade.band as GradeBand,
          sessionField: ctx.session.field,
          interestFields,
          followupIntent,
          wantToLearn,
          desiredJob,
        })
      : null
  const careers = career?.items ?? []
  // 학생 화면을 실제로 채운 쪽의 출처·기록을 남긴다.
  const shown =
    careers.length > 0
      ? {
          kind: 'career' as const,
          source: career!.source,
          meta: career!.meta,
          items: careers.map((c) => ({ career_id: c.id, reason: c.reason })),
        }
      : {
          kind: 'program' as const,
          source: result.source,
          meta: result.meta,
          items: result.items.map((i) => ({ program_id: i.program.id, reason: i.reason })),
        }

  // ── 학생에게 보여 준 것을 기록한다. 실패해도 학생 응답은 그대로 나간다.
  const responseId = typeof body.responseId === 'string' && UUID_RE.test(body.responseId) ? body.responseId : null
  try {
    await insertRecommendationLog({
      sessionId: ctx.session.id,
      responseId,
      source: shown.source,
      stage: result.stage,
      items: shown.items,
      ...shown.meta,
    })
  } catch (err) {
    console.error(
      JSON.stringify({
        event: 'recommend_log_failed',
        sessionId: ctx.session.id,
        code: (err as { code?: unknown } | null)?.code ?? null,
      }),
    )
  }
  // 배포 로그 한 줄 — 교실에서 AI 가 실제로 돌았는지(source · error)를 바로 본다.
  console.info(
    JSON.stringify({
      event: 'recommend',
      sessionId: ctx.session.id,
      kind: shown.kind,
      source: shown.source,
      stage: result.stage,
      items: shown.items.length,
      latencyMs: shown.meta.latencyMs,
      inputTokens: shown.meta.inputTokens,
      outputTokens: shown.meta.outputTokens,
      error: shown.meta.error,
    }),
  )

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
    // 목록에 없는 꿈을 적은 학생에게 카드 위에 보여 줄 응원 한 줄. 진로 카드를 보여 줄 때만.
    dreamNote: careers.length > 0 && career?.dream && !career.dream.matched ? career.dream.note : null,
    // 진로 카드. 정해진 다섯 필드만 내려간다 — 강사·기관으로 이어지는 값은 없다.
    careers: careers.map((c) => ({
      id: c.id,
      title: c.title,
      summary: c.summary,
      related: c.related,
      reason: c.reason,
    })),
  })
}
