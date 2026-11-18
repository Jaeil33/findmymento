import { NextResponse } from 'next/server'
import { getActor } from '@/lib/auth/actor'
import { loadDataset } from '@/lib/db/dataset'
import { demoDataMode, tourActive } from '@/lib/demo/mode'
import { TOUR_LLM_PER_VISITOR } from '@/lib/ai/tour-budget'
import { insertStudioContent } from '@/lib/db/writes'
import { authorContent, type AuthorCandidate } from '@/lib/studio/author'
import { droneCandidates } from '@/lib/studio/drone/course'
import { generateDrone } from '@/lib/studio/drone/pipeline'
import { calibrationFor, nextVersion, studioLineage } from '@/lib/studio/library'
import { generatePen } from '@/lib/studio/pen3d/pipeline'
import { PEN_PIECES } from '@/lib/studio/pen3d/pieces'
import { recipeCandidates } from '@/lib/studio/pen3d/recipes'
import { generalizeCharacter } from '@/lib/studio/topic'
import { validateGenerate } from '@/lib/studio/request'
import { clientKey, rateLimit } from '@/lib/validation'
import type { LectureSession } from '@/types/domain'
import type { PenComposition } from '@/lib/studio/pen3d/compose'
import type { StudioArtifact, StudioSpec } from '@/types/studio'

/**
 * 콘텐츠 생성. **LLM 키가 서버 전용이므로 라우트에서만 호출한다** (CLAUDE.md 아키텍처 규칙).
 *
 * 흐름: 규칙이 후보를 좁힘 → LLM 이 그중 하나를 고르고 문장을 씀 → **생성기가 좌표·명령을
 * 만들고 검증기가 판정** → 개선 → 저장. LLM 이 실패하면 규칙 선택으로 조용히 떨어진다 (ADR-029).
 *
 * 권한: 강사 본인. 회차에 붙이려면 **그 회차에 배정된 강사**여야 하고, 그때 수업 조건은
 * 회차 행에서 가져온다 — 본문 값은 무시한다 (ADR-015·016).
 *
 * 검증에 실패한 산출물도 200 으로 돌려준다. 화면이 실패 이유를 보여줘야 하기 때문이다 (ADR-030).
 *
 * **체험 세션도 여기서는 실제 LLM 을 쓴다** (ADR-035). 방문자가 적은 문장을 읽고 검수된
 * 조각으로 모양을 짜는 것이 이 제품이라, 고정된 시연 응답으로는 보여 줄 수 없다. 대신
 * 방문자별·하루 총량 상한을 걸고, 걸리면 거절이 아니라 시연용 응답으로 떨어진다.
 */
export async function POST(request: Request) {
  // LLM 호출이 붙는다. 교안과 같은 상한을 쓴다.
  if (!rateLimit(clientKey(request.headers, 'studio-generate'), 10, 60_000)) {
    return NextResponse.json({ ok: false, message: '잠시 후 다시 시도해 주세요.' }, { status: 429 })
  }

  const actor = await getActor()
  if (!actor || actor.role !== 'instructor') {
    return NextResponse.json({ ok: false, message: '권한이 없습니다.' }, { status: 403 })
  }

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ ok: false, message: '요청을 읽을 수 없습니다.' }, { status: 400 })
  }

  const ds = await loadDataset()

  // ── 회차에 붙인 생성이면 배정부터 확인한다 ────────────────────────────────
  let session: LectureSession | null = null
  const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : ''
  if (sessionId !== '') {
    session =
      ds.lectureSessions.find(
        (s) => s.id === sessionId && s.instructor_id === actor.instructorId,
      ) ?? null
    // 배정되지 않은 회차는 존재 자체를 알려주지 않는다 (E-23).
    if (!session) {
      return NextResponse.json({ ok: false, message: '배정된 회차가 아닙니다.' }, { status: 404 })
    }
  }

  const validated = validateGenerate(body, session)
  if (!validated.ok) {
    return NextResponse.json(
      { ok: false, field: validated.field, message: validated.message },
      { status: 400 },
    )
  }
  const { spec: rawSpec, lineageId: requestedLineage, recipeId } = validated.value

  /**
   * 캐릭터·상표 이름은 일반 형태로 바꿔 만든다 (ADR-034). 산출물이 인쇄되어 교실로 가므로
   * 캐릭터 도안을 배포하면 책임이 플랫폼으로 온다. 바꿨다는 사실은 응답에 담아 화면에 적는다.
   */
  const general = generalizeCharacter(rawSpec.topic)
  const spec = general.replaced ? { ...rawSpec, topic: general.text } : rawSpec

  // ── 버전 ──────────────────────────────────────────────────────────────────
  let lineageId = requestedLineage
  let version = 1
  if (lineageId) {
    const history = studioLineage(ds.studioContents, lineageId)
    if (history.length === 0 || history.some((c) => c.instructor_id !== actor.instructorId)) {
      return NextResponse.json({ ok: false, message: '찾을 수 없습니다.' }, { status: 404 })
    }
    version = nextVersion(ds.studioContents, lineageId)
  } else {
    lineageId = crypto.randomUUID()
  }

  // ── 규칙 후보 → LLM 선택 → 생성·검증 ─────────────────────────────────────
  const candidates: AuthorCandidate[] =
    spec.kind === 'pen3d'
      ? recipeCandidates(spec.topic, spec.grade_band)
      : droneCandidates(spec.topic, spec.grade_band)

  const firstCalibration = candidates[0]
    ? calibrationFor(ds.studioContents, ds.studioFeedback, candidates[0].id, spec.grade_band)
    : null

  /**
   * 체험 세션에 LLM 을 열어 줄 것인가 (ADR-035).
   *
   * 방문자 한 명이 연달아 누르는 것부터 막는다 — 하루 총량은 그다음 방어선이다
   * (`lib/ai/tour-budget.ts`). 레시피를 직접 고른 요청은 저작 자체를 하지 않으므로
   * 여기서 세지 않는다.
   */
  const tourStudio =
    !recipeId &&
    (await tourActive()) &&
    rateLimit(
      clientKey(request.headers, 'studio-tour-llm'),
      TOUR_LLM_PER_VISITOR.limit,
      TOUR_LLM_PER_VISITOR.windowMs,
    )

  const authoring = recipeId
    ? {
        recipe_id: recipeId,
        composition: null,
        title: '',
        reason: '',
        tasks: [] as string[],
        source: 'rule' as const,
        engine: 'rule' as const,
      }
    : await authorContent(spec, candidates, firstCalibration, {
        tourStudio,
        // 조각 조합은 3D펜만 쓴다 (ADR-034). 드론은 검수된 코스 목록 그대로다.
        pieces:
          spec.kind === 'pen3d'
            ? PEN_PIECES.map((p) => ({
                id: p.id,
                name: p.name,
                summary: p.summary,
                can_be_base: p.can_be_base,
              }))
            : undefined,
      })

  const calibration = calibrationFor(
    ds.studioContents,
    ds.studioFeedback,
    authoring.recipe_id,
    spec.grade_band,
  )

  const generated = generate(spec, authoring.recipe_id, calibration, authoring.composition ?? null)

  // LLM 이 쓴 것은 **제목과 과제 문장뿐이다.** 좌표·명령·지표는 생성기 결과를 그대로 쓴다.
  const title = authoring.title !== '' ? authoring.title : generated.title
  const artifact = withTitleAndTasks(generated.artifact, title, authoring.tasks)
  const source = authoring.tasks.length >= 2 && authoring.source === 'llm' ? 'llm' : 'rule'

  /**
   * 저장한 행이 **화면 레이어에서 읽히는가.**
   *
   * 데모·체험 모드의 저장은 서버 메모리다. 배포(서버리스)에서는 라우트 핸들러와 서버 컴포넌트가
   * 서로 다른 함수로 올라가므로, 여기서 저장한 산출물을 상세 페이지는 영영 읽지 못한다 —
   * 생성 직후 404 가 났다. 그래서 그 세션에서는 산출물을 통째로 실어 보내고, 생성 화면이
   * 이동하지 않고 그 자리에서 결과를 그린다 (ADR-033).
   */
  const persisted = !(await demoDataMode())

  const payload = {
    ok: true,
    status: generated.status,
    recipe_id: generated.recipe_id,
    reason: authoring.reason,
    source,
    calibrated: calibration !== null,
    // 문장을 실제로 누가 썼는가. 화면 표시는 **이 값**이 정한다 (ADR-025·035).
    demo_ai: authoring.engine === 'demo',
    metrics: generated.metrics,
    rounds: generated.rounds,
    findings: generated.report.findings,
    persisted,
    // 주제를 바꿔 만든 경우에만 들어온다. 화면이 그대로 보여준다.
    topic_note: general.note,
    // 수업 조건도 **서버가 쓴 값**을 돌려준다. 회차에 붙은 생성은 회차 행이 정한다 (ADR-016).
    ...(persisted ? {} : { artifact, spec, title }),
  }

  try {
    const saved = await insertStudioContent({
      lineageId,
      version,
      instructorId: actor.instructorId,
      sessionId: spec.session_id,
      kind: spec.kind,
      title,
      recipeId: generated.recipe_id,
      spec,
      artifact,
      rounds: generated.rounds,
      status: generated.status,
      source,
    })
    return NextResponse.json({ ...payload, saved: true, id: saved.id, lineage_id: lineageId, version })
  } catch {
    // 저장이 실패해도 만든 결과와 판정은 보여준다. 다만 **저장되지 않았다고 말한다.**
    return NextResponse.json({
      ...payload,
      saved: false,
      tasks: artifact.tasks,
      safety_notes: artifact.safety_notes,
    })
  }
}

/** 콘텐츠 종류별 생성기. 둘 다 같은 계약을 돌려준다 (ADR-030). */
function generate(
  spec: StudioSpec,
  recipeId: string,
  calibration: ReturnType<typeof calibrationFor>,
  composition: PenComposition | null,
) {
  if (spec.kind === 'drone') {
    const result = generateDrone(spec, { recipeId, calibration })
    return { ...result, title: result.artifact.mission.title }
  }
  const result = generatePen(spec, { recipeId, calibration, composition })
  return { ...result, title: result.artifact.pattern.title }
}

/** 제목과 과제 문장만 갈아 끼운다. 그 외에는 생성기 산출물을 그대로 둔다. */
function withTitleAndTasks(
  artifact: StudioArtifact,
  title: string,
  tasks: string[],
): StudioArtifact {
  const nextTasks = tasks.length >= 2 ? tasks : artifact.tasks
  if (artifact.kind === 'drone') {
    return {
      ...artifact,
      mission: { ...artifact.mission, title },
      tasks: nextTasks,
    }
  }
  return {
    ...artifact,
    pattern: { ...artifact.pattern, title },
    tasks: nextTasks,
  }
}
