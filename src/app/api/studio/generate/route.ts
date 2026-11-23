import { NextResponse } from 'next/server'
import { studioLlmAvailable, studioLlmGrant } from '@/lib/ai/studio-llm'
import { getActor } from '@/lib/auth/actor'
import { loadDataset } from '@/lib/db/dataset'
import { demoDataMode, tourActive } from '@/lib/demo/mode'
import { TOUR_LLM_PER_VISITOR } from '@/lib/ai/tour-budget'
import { insertStudioContent } from '@/lib/db/writes'
import { atlasById } from '@/lib/studio/atlas'
import { authorContent, type AuthorCandidate, type StudioAuthoring } from '@/lib/studio/author'
import { droneCandidates } from '@/lib/studio/drone/course'
import { generateDrone } from '@/lib/studio/drone/pipeline'
import {
  isStrongHit,
  penHarness,
  type PenHarnessOptions,
  type PenHarnessResult,
} from '@/lib/studio/harness/pipeline'
import { retrieveCandidates, retrieveDesign } from '@/lib/studio/harness/retrieve'
import { packByShapeId } from '@/lib/studio/pack'
import { calibrationFor, nextVersion, studioLineage } from '@/lib/studio/library'
import { PEN_PIECES } from '@/lib/studio/pen3d/pieces'
import { recipeMatches } from '@/lib/studio/pen3d/recipes'
import { reviewShape } from '@/lib/studio/pen3d/review'
import { penFinding } from '@/lib/studio/pen3d/validate'
import { generalizeCharacter } from '@/lib/studio/topic'
import { validateGenerate } from '@/lib/studio/request'
import { clientKey, rateLimit } from '@/lib/validation'
import type { LectureSession } from '@/types/domain'
import { formOf } from '@/types/studio'
import type { Finding, PenShape, StudioArtifact, StudioSpec } from '@/types/studio'

/**
 * 콘텐츠 생성. **LLM 키가 서버 전용이므로 라우트에서만 호출한다** (CLAUDE.md 아키텍처 규칙).
 *
 * 흐름: **검수된 목록 검색 → (필요하면) LLM 이 고르고 문장을 씀 → 생성기가 좌표·치수를 만들고
 * 검증기가 판정 → 수업 운영·지도안 검사 → 수업 패키지 → 저장** (ADR-044).
 *
 * 순서가 이렇게 된 이유: 주제와 **같은 단어**의 검수된 모양이 이미 있으면 LLM 을 부를 이유가
 * 없다 (개발명세서 §8-1). 그 경우 문장은 사전 제작 팩이 들고 있던 것을 쓰고, 화면에는
 * "미리 만들어 둔 도안" 이라고 적는다 — 실시간 AI 가 쓴 것처럼 보이지 않게 한다 (ADR-025).
 *
 * 권한: 강사 본인. 회차에 붙이려면 **그 회차에 배정된 강사**여야 하고, 그때 수업 조건은
 * 회차 행에서 가져온다 — 본문 값은 무시한다 (ADR-015·016).
 *
 * 검증에 실패한 산출물도 200 으로 돌려준다. 화면이 실패 이유를 보여줘야 하기 때문이다 (ADR-030).
 *
 * **체험 세션은 LLM 없이도 돌아간다** (ADR-033·044). 팩이 적중하면 호출이 0회이고, 적중하지
 * 않으면 예산 안에서 실제 LLM 을 쓰거나(ADR-035) 시연용 응답으로 떨어진다.
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
   * 주제는 **강사가 적은 그대로** 쓴다 (ADR-043). 캐릭터·상표 이름을 일반 형태로 치환하던
   * 규칙을 걷어냈다 — 이 플랫폼은 무엇이 저작권 침해인지 판정하지 않는다. 공백만 정리한다.
   */
  const general = generalizeCharacter(rawSpec.topic)
  const spec = general.text === rawSpec.topic ? rawSpec : { ...rawSpec, topic: general.text }

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

  // ── 검색 → 저작 → 생성·검증 ──────────────────────────────────────────────
  const form = formOf(spec)

  /**
   * 검수된 목록에서 먼저 찾는다 (ADR-044). 결정론적 문자열 일치이고 LLM 을 부르지 않는다.
   * 미적중이면 `null` 이고, **아무 모양이나 집어 주지 않는다.**
   */
  const retrieved = spec.kind === 'pen3d' ? retrieveDesign(spec.topic) : null

  /**
   * 저작 레이어를 **건너뛸 수 있는가** (개발명세서 §8-1).
   *
   * 주제와 같은 단어의 검수된 모양이 2D 요청에 그대로 맞는 경우다. 그때 LLM 이 더해 줄 수
   * 있는 것이 없다 — 모양은 이미 사람이 검수했고, 문장은 그 모양에 맞춰 미리 써 두었다.
   *
   * 입체 요청에는 적용하지 않는다: 레시피가 1순위이고(ADR-036) "연필 넣을 상자" 처럼
   * 주제의 단어(연필)와 만들 물건(상자)이 다른 요청이 입체에 흔하다.
   *
   * **스위치(`STUDIO_LLM`)가 켜져 있으면 건너뛰지 않는다** (ADR-046). 켠 이유가 "주제대로
   * 그려 달라" 이므로, 같은 단어의 아틀라스가 있어도 제안을 먼저 받아 본다. 제안이 실패하거나
   * 물리 검증에 걸리면 하네스가 그 검수된 모양으로 내려간다 — 켠 것이 결과를 나쁘게 만들지 않는다.
   */
  const llmDraws = !recipeId && spec.kind === 'pen3d' && (await studioLlmAvailable())
  const usePack = !recipeId && form === 'flat' && isStrongHit(retrieved) && !llmDraws

  /**
   * 저작 레이어에 주는 후보. **주제와 같은 모양만** 올린다 (ADR-036). 2D 요청에는 레시피를
   * 넣지 않는다 — 레시피 9종은 전부 입체다 (ADR-037).
   */
  const candidates: AuthorCandidate[] =
    spec.kind === 'pen3d'
      ? [
          ...(form === 'flat' ? [] : recipeMatches(spec.topic, spec.grade_band)).map((r) => ({
            id: r.id,
            title: r.title,
            summary: r.summary,
            nominal_difficulty: r.nominal_difficulty,
          })),
          // 검색 결과를 그대로 후보로 쓴다. id 는 아틀라스 id 이므로 고르면 `atlasById` 가 읽는다.
          ...retrieveCandidates(spec.topic).map((c) => ({
            id: c.design.shape_id,
            title: c.design.title,
            summary: c.design.reason,
            nominal_difficulty: c.difficulty,
          })),
        ]
      : droneCandidates(spec.topic, spec.grade_band)

  const firstCalibration = candidates[0]
    ? calibrationFor(ds.studioContents, ds.studioFeedback, candidates[0].id, spec.grade_band)
    : null

  /**
   * 체험 세션에 LLM 을 열어 줄 것인가 (ADR-035).
   *
   * **팩이 적중하면 열지 않는다** — 예산을 쓰지 않고 같은 결과를 내므로, 이 순서가 체험
   * 세션의 비용을 실제로 0 으로 만든다. 레시피를 직접 고른 요청도 저작을 하지 않는다.
   */
  const tourStudio =
    !recipeId &&
    !usePack &&
    (await tourActive()) &&
    rateLimit(
      clientKey(request.headers, 'studio-tour-llm'),
      TOUR_LLM_PER_VISITOR.limit,
      TOUR_LLM_PER_VISITOR.windowMs,
    )

  /** 사전 제작 팩의 문장. **미리 써 둔 것이고 이번에 생성한 것이 아니다** (ADR-044) */
  const packAuthoring: StudioAuthoring | null =
    usePack && retrieved
      ? {
          recipe_id: retrieved.design.shape_id,
          composition: null,
          shape: null,
          title: retrieved.design.title,
          reason: retrieved.design.reason,
          tasks: [],
          source: 'rule',
          engine: 'pack',
        }
      : null

  const authoring: StudioAuthoring =
    packAuthoring ??
    (recipeId
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
          /**
           * 윤곽 제안 (ADR-036). 3D펜만이고, **체험 세션에서는 저작 레이어가 스스로 끈다** —
           * 체험 키로는 제안하지 않는다 (익명 공개 경로의 예산).
           */
          outline: spec.kind === 'pen3d' ? { allow: true, word: spec.topic } : undefined,
          /**
           * 조각 조합은 **입체 요청에만** 준다 (ADR-034·037). 2D 에 조합 지시문을 같이 보내면
           * 모델이 조합으로 답하고, 2D 경로는 조합(접합이 있는 입체)을 쓸 수 없어 실패한다.
           */
          pieces:
            spec.kind === 'pen3d' && form === 'solid'
              ? PEN_PIECES.map((p) => ({
                  id: p.id,
                  name: p.name,
                  summary: p.summary,
                  can_be_base: p.can_be_base,
                }))
              : undefined,
        }))

  const calibration = calibrationFor(
    ds.studioContents,
    ds.studioFeedback,
    authoring.recipe_id,
    spec.grade_band,
  )

  /**
   * 저작 레이어가 고른 모양. **팩 항목이면 그 항목째로 되찾는다** — 모양 id 만 들고 가면
   * 대체 여부("요청한 사물이 아니다")가 사라지고, 그러면 고지 없이 다른 모양이 나간다.
   */
  const pickedDesign =
    spec.kind === 'pen3d' && !usePack
      ? /**
         * 같은 모양을 가리키는 항목이 둘일 수 있다 — "복어"(그 사물)와 "물고기"(대체).
         * 이번 주제로 찾은 항목이 그 모양이면 **그쪽을 쓴다.** 그래야 "물고기로 적었는데
         * 복어로 만들었다" 는 고지가 남는다.
         */
        retrieved && retrieved.design.shape_id === authoring.recipe_id
        ? retrieved.design
        : packByShapeId(authoring.recipe_id)
      : null
  const pickedShape: PenShape | null =
    spec.kind === 'pen3d' && !usePack && !pickedDesign ? atlasById(authoring.recipe_id) : null

  const generated = generate(spec, {
    recipeId: authoring.recipe_id,
    instructorRecipeId: recipeId,
    calibration,
    composition: authoring.composition ?? null,
    proposedShape: authoring.shape ?? null,
    pickedShape,
    pickedDesign,
    retrieved,
    authoredBy: authoredByOf(authoring),
    tasks: authoring.tasks,
  })

  /**
   * 검수되지 않은 모양이면 그 사실을 남기고, 통과한 도안만 이미지로 되돌려 묻는다
   * (ADR-036·038). 둘 다 **warn 이다** — 물리 검증(`ok`)의 의미를 흐리지 않는다.
   *
   * 스위치가 꺼져 있거나 체험 세션이면 게이트가 `null` 을 주므로 검토가 저절로 꺼진다
   * (ADR-033·046). 체험 키(scope `tour`)는 여기 오지 않는다 — `tourStudio` 를 주지 않는다.
   */
  const extraFindings: Finding[] = []
  let review: Awaited<ReturnType<typeof reviewShape>> = { verdict: 'skipped', missing: null }
  if (generated.shape_source === 'dsl') {
    extraFindings.push(
      penFinding(
        'PEN_SHAPE_UNREVIEWED',
        '사람이 검수하지 않은 자동 생성 모양입니다. 인쇄 전에 모양을 한 번 확인해 주세요.',
      ),
    )
    if (generated.report.ok && generated.artifact.kind === 'pen3d') {
      review = await reviewShape({
        word: spec.topic,
        strokes: generated.artifact.pattern.parts.flatMap((p) => p.strokes),
        apiKey: (await studioLlmGrant())?.key ?? null,
      })
      if (review.verdict === 'unrecognized') {
        extraFindings.push(
          penFinding(
            'PEN_SHAPE_UNRECOGNIZED',
            review.missing
              ? `도안이 "${spec.topic}" 으로 보이지 않습니다 — ${review.missing}`
              : `도안이 "${spec.topic}" 으로 보이지 않습니다.`,
          ),
        )
      }
    }
  }

  if (extraFindings.length > 0) {
    generated.report = { ...generated.report, findings: [...generated.report.findings, ...extraFindings] }
    const last = generated.rounds[generated.rounds.length - 1]
    if (last) last.findings = [...last.findings, ...extraFindings]
  }

  // LLM·팩이 쓴 것은 **제목과 과제 문장뿐이다.** 좌표·명령·지표는 생성기 결과를 그대로 쓴다.
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
    // 문장을 실제로 누가 썼는가. 화면 표시는 **이 값**이 정한다 (ADR-025·035·044).
    demo_ai: authoring.engine === 'demo',
    // 최종 판정은 **산출물 안의 값**이다 — 하네스가 팩 항목을 썼으면 그쪽으로 바뀐다
    authored_by: 'package' in generated ? generated.package.authored_by : authoredByOf(authoring),
    metrics: generated.metrics,
    rounds: generated.rounds,
    findings: generated.report.findings,
    persisted,
    // 주제를 바꿔 만든 경우에만 들어온다. 화면이 그대로 보여준다.
    topic_note: general.note,
    /**
     * 모양이 어디서 왔는가 (ADR-036·044). 화면이 "검수된 도안"·"미리 만들어 둔 도안"·
     * "자동 생성"을 구분해 적는다 — 이 구분을 지우면 강사는 검수되지 않은 모양을 검수된
     * 것으로 믿는다.
     */
    shape_source: generated.shape_source,
    shape_review: review.verdict,
    shape_missing: review.missing,
    form,
    // 요청한 모양과 다른 것으로 만든 경우에만 들어온다
    nearest_note: generated.substitute_note,
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

/** 수업 패키지의 문장을 누가 썼는가. 화면 표기의 유일한 근거다 (ADR-025·044) */
function authoredByOf(authoring: StudioAuthoring): 'pack' | 'llm' | 'demo' | 'rule' {
  if (authoring.engine === 'pack') return 'pack'
  if (authoring.engine === 'demo') return 'demo'
  if (authoring.engine === 'llm' && authoring.source === 'llm') return 'llm'
  return 'rule'
}

type GenerateOptions = {
  recipeId: string
  /** 강사가 **직접 고른** 레시피. 저작 레이어가 고른 것과 구별한다 */
  instructorRecipeId: string | null
  calibration: ReturnType<typeof calibrationFor>
  composition: PenHarnessOptions['composition']
  proposedShape: PenShape | null
  pickedShape: PenShape | null
  pickedDesign: PenHarnessOptions['pickedDesign']
  retrieved: PenHarnessOptions['retrieved']
  authoredBy: 'pack' | 'llm' | 'demo' | 'rule'
  tasks: string[]
}

type GenerateResult = (PenHarnessResult | ReturnType<typeof generateDrone>) & {
  title: string
  shape_source: PenHarnessResult['shape_source'] | 'drone'
  substitute_note: string | null
}

/** 콘텐츠 종류별 생성기. 둘 다 같은 계약을 돌려준다 (ADR-030). */
function generate(spec: StudioSpec, options: GenerateOptions): GenerateResult {
  if (spec.kind === 'drone') {
    const result = generateDrone(spec, {
      recipeId: options.recipeId,
      calibration: options.calibration,
    })
    return {
      ...result,
      title: result.artifact.mission.title,
      shape_source: 'drone',
      substitute_note: null,
    }
  }

  /**
   * 3D펜은 하네스를 지난다 (ADR-044) — 검색·생성·물리 검증·수업 운영 검사·수업 패키지가
   * 한 함수 안에서 같은 순서로 돈다. 레시피는 **강사가 직접 고른 것만** 넘긴다: 저작 레이어가
   * 고른 아틀라스 id 는 `pickedShape` 로 이미 모양이 되어 있다.
   */
  const result = penHarness(spec, {
    recipeId: options.instructorRecipeId,
    composition: options.composition,
    proposedShape: options.proposedShape,
    pickedShape: options.pickedShape,
    pickedDesign: options.pickedDesign,
    calibration: options.calibration,
    retrieved: options.retrieved,
    authoredBy: options.authoredBy,
    tasks: options.tasks,
  })
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
