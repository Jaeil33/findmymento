import { NextResponse } from 'next/server'
import { getActor } from '@/lib/auth/actor'
import { loadDataset } from '@/lib/db/dataset'
import { insertStudioContent } from '@/lib/db/writes'
import { authorContent, type AuthorCandidate } from '@/lib/studio/author'
import { droneCandidates } from '@/lib/studio/drone/course'
import { generateDrone } from '@/lib/studio/drone/pipeline'
import { calibrationFor, nextVersion, studioLineage } from '@/lib/studio/library'
import { generatePen } from '@/lib/studio/pen3d/pipeline'
import { recipeCandidates } from '@/lib/studio/pen3d/recipes'
import { validateGenerate } from '@/lib/studio/request'
import { clientKey, rateLimit } from '@/lib/validation'
import type { LectureSession } from '@/types/domain'
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
  const { spec, lineageId: requestedLineage, recipeId } = validated.value

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

  const authoring = recipeId
    ? { recipe_id: recipeId, title: '', reason: '', tasks: [] as string[], source: 'rule' as const }
    : await authorContent(spec, candidates, firstCalibration)

  const calibration = calibrationFor(
    ds.studioContents,
    ds.studioFeedback,
    authoring.recipe_id,
    spec.grade_band,
  )

  const generated = generate(spec, authoring.recipe_id, calibration)

  // LLM 이 쓴 것은 **제목과 과제 문장뿐이다.** 좌표·명령·지표는 생성기 결과를 그대로 쓴다.
  const title = authoring.title !== '' ? authoring.title : generated.title
  const artifact = withTitleAndTasks(generated.artifact, title, authoring.tasks)
  const source = authoring.tasks.length >= 2 && authoring.source === 'llm' ? 'llm' : 'rule'

  const payload = {
    ok: true,
    status: generated.status,
    recipe_id: generated.recipe_id,
    reason: authoring.reason,
    source,
    calibrated: calibration !== null,
    metrics: generated.metrics,
    rounds: generated.rounds,
    findings: generated.report.findings,
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
) {
  if (spec.kind === 'drone') {
    const result = generateDrone(spec, { recipeId, calibration })
    return { ...result, title: result.artifact.mission.title }
  }
  const result = generatePen(spec, { recipeId, calibration })
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
