/**
 * 하네스 오케스트레이터 — **수업 조건 → 검색 → 생성 → 다층 검증 → 수업 패키지** (ADR-044).
 *
 * 순서는 ADR-036·046 이 고정한다. 이 파일이 그 순서를 **한 곳에 모은 것**이고, 라우트는 저작
 * 레이어(LLM 호출)만 맡는다:
 *
 *   1. 강사가 직접 고른 레시피 (입체 요청에서만)
 *   2. 레시피 키워드 일치 (입체 요청에서만 — 레시피 9종은 전부 입체다)
 *   3. 저작 레이어의 윤곽·색 영역 제안 (DSL) — `STUDIO_LLM` 을 켠 요청에만 들어온다 (ADR-046)
 *   4. 검수된 목록에서 **주제와 같은 단어**로 찾은 모양 (= 사전 제작 팩, ADR-044)
 *   5. 조각 조합 · **유사 아틀라스**(분류만 맞거나 대체 모양)
 *   6. 이름 명패 (2D 전용 바닥, ADR-042)
 *
 * 3번이 4번보다 앞인 것은 **스위치를 켠 요청에 한해서다** (ADR-046). 끈 요청에는 제안 자체가
 * 들어오지 않으므로 순서가 예전과 같다. 그리고 3번이 물리 검증에 걸리면 4번으로 내려간다 —
 * 검수되지 않은 모양이 검수된 모양을 **밀어내지는 못한다.**
 *
 * **LLM 도 팩도 숫자를 만들지 않는다.** 둘이 주는 것은 모양 선택과 문장이고, 좌표·치수·
 * 접합·배치·판정은 그대로 `generatePen` 과 `validatePen` 이 한다 (CLAUDE.md).
 *
 * 검증은 두 층으로 나뉘어 돌아간다:
 * - 물리(`PEN_*`) — `validatePen`. 임계값은 모드·출처와 무관하다
 * - 수업 운영·지도안(`TIME_*`·`EQUIP_*`·`TOPIC_*`·`PLAN_*`) — 이 파일이 얹는다
 *
 * 둘을 합친 결과에 error 가 하나라도 있으면 `failed` 다. **2D 는 모양을 못 찾아도
 * `failed` 로 끝나지 않는다** — 명패로 떨어지고 warn 을 남긴다 (ADR-042).
 */

import { lessonConstraints, type LessonConstraints } from '@/lib/studio/harness/constraints'
import {
  harnessChecks,
  lessonPackage,
  validatePackage,
} from '@/lib/studio/harness/package'
import {
  ATLAS_ATTRIBUTION,
  ATLAS_LICENSE,
  retrieveDesign,
  substituteNote,
  type MatchedBy,
  type RetrievedShape,
} from '@/lib/studio/harness/retrieve'
import { packShape } from '@/lib/studio/pack'
import type { PenComposition } from '@/lib/studio/pen3d/compose'
import { generatePen, type PenGenerateResult } from '@/lib/studio/pen3d/pipeline'
import { penFinding } from '@/lib/studio/pen3d/validate'
import { formOf } from '@/types/studio'
import type {
  Evidence,
  LessonPackage,
  PackDesign,
  PenArtifact,
  PenShape,
  StudioCalibration,
  StudioSpec,
} from '@/types/studio'

/** 모양이 어디서 왔는가. 화면이 이 값으로 배지를 고른다 */
export type ShapeSource = 'recipe' | 'atlas' | 'pack' | 'dsl' | 'compose' | 'fallback'

export type PenHarnessOptions = {
  /** 강사가 직접 고른 레시피 */
  recipeId?: string | null
  /** 저작 레이어의 윤곽 제안 (검수 전) */
  proposedShape?: PenShape | null
  /** 저작 레이어가 후보 목록에서 고른 아틀라스 모양 (검수됨) */
  pickedShape?: PenShape | null
  /**
   * 저작 레이어가 고른 것이 **팩 항목**인 경우 그 항목. 모양 id 만 돌려받으면 그 항목이
   * 들고 있던 주의사항과 대체 여부가 사라지므로, 라우트가 `packByShapeId` 로 되찾아 넘긴다.
   */
  pickedDesign?: PackDesign | null
  composition?: PenComposition | null
  calibration?: StudioCalibration | null
  /** 산출물 문장을 누가 썼는가. 화면 표기가 이 값에서 나온다 (ADR-025) */
  authoredBy?: LessonPackage['authored_by']
  /** 저작 레이어가 쓴 과제 문장. 비어 있으면 규칙 문장을 쓴다 */
  tasks?: string[]
  /**
   * 검색 결과를 미리 구한 경우 (라우트가 LLM 을 부를지 정할 때 이미 조회한다).
   * 주지 않으면 여기서 조회한다 — 테스트가 이 함수만 불러도 같은 경로가 돈다.
   */
  retrieved?: RetrievedShape | null
}

export type PenHarnessResult = PenGenerateResult & {
  artifact: PenArtifact
  package: LessonPackage
  constraints: LessonConstraints
  shape_source: ShapeSource
  /** 검색이 쓰인 경우의 항목. 화면이 "미리 만들어 둔 도안" 을 표기하는 근거다 */
  design: PackDesign | null
  matched_by: MatchedBy | null
  /** 요청한 모양이 아닐 때의 고지 문구. 없으면 `null` */
  substitute_note: string | null
  evidence: Evidence[]
}

/** 검색 결과가 **주제와 같은 단어**로 찾은 검수된 모양인가 (= 저작 레이어를 부를 필요가 없다) */
export function isStrongHit(retrieved: RetrievedShape | null): boolean {
  if (!retrieved) return false
  if (retrieved.design.substitute) return false
  return (
    retrieved.matched_by === 'exact' ||
    retrieved.matched_by === 'alias' ||
    retrieved.matched_by === 'phrase'
  )
}

type Chosen = {
  shape: PenShape | null
  source: ShapeSource
  design: PackDesign | null
  matched_by: MatchedBy | null
  substitute: boolean
  retrieval_miss: boolean
}

/**
 * 무엇으로 만들 것인가. 위 주석의 순서를 **그대로** 구현한다.
 *
 * 레시피(1·2순위)는 `shape` 가 `null` 인 것으로 표현된다 — `generatePen` 이 레시피·조합을
 * 고르는 기존 경로를 그대로 타기 때문이다.
 */
function chooseShape(
  spec: StudioSpec,
  options: PenHarnessOptions,
  retrieved: RetrievedShape | null,
): Chosen {
  const flat = formOf(spec) === 'flat'
  const miss = retrieved === null

  // 1·2순위 — 강사가 고른 레시피, 또는 저작 레이어가 고른 레시피. 입체 요청에서만 의미가 있다.
  if (!flat && options.recipeId) {
    return {
      shape: null,
      source: 'recipe',
      design: null,
      matched_by: 'recipe',
      substitute: false,
      retrieval_miss: false,
    }
  }

  /**
   * 3순위 — 저작 레이어의 윤곽·색 영역 제안 (검수 전, ADR-046).
   *
   * **검수된 아틀라스보다 먼저 쓴다.** 스위치(`STUDIO_LLM`)를 켠 요청에서만 이 값이 들어오고,
   * 켠 이유가 "주제대로 그려 달라" 이기 때문이다. 검수되지 않았다는 사실은
   * `PEN_SHAPE_UNREVIEWED`(warn)와 이미지 검토(ADR-038)로 남고, 물리 검증은 한 항목도
   * 면제되지 않는다. 제안이 검증에 걸리면 `penHarness` 가 아래 순서로 내려간다.
   */
  if (options.proposedShape) {
    return {
      shape: options.proposedShape,
      source: 'dsl',
      design: null,
      matched_by: 'llm',
      substitute: false,
      retrieval_miss: miss,
    }
  }

  // 4순위 — 주제와 같은 단어로 찾은 검수된 모양 (사전 제작 팩)
  if (isStrongHit(retrieved) && retrieved) {
    return {
      shape: retrieved.shape,
      source: 'pack',
      design: retrieved.design,
      matched_by: retrieved.matched_by,
      substitute: false,
      retrieval_miss: false,
    }
  }

  // 저작 레이어가 팩 항목을 고른 경우. 대체 여부와 주의사항을 그대로 들고 간다.
  if (options.pickedDesign) {
    const shape = packShape(options.pickedDesign)
    if (shape) {
      return {
        shape,
        source: 'pack',
        design: options.pickedDesign,
        matched_by: 'llm',
        substitute: options.pickedDesign.substitute,
        retrieval_miss: false,
      }
    }
  }

  // 저작 레이어가 후보 목록에서 고른 검수된 모양
  if (options.pickedShape) {
    return {
      shape: options.pickedShape,
      source: 'atlas',
      design: null,
      matched_by: 'llm',
      substitute: false,
      retrieval_miss: false,
    }
  }

  // 5순위 — 조각 조합, 그리고 **유사 아틀라스**(분류만 맞거나 대체 모양)
  if (options.composition) {
    return {
      shape: null,
      source: 'compose',
      design: null,
      matched_by: 'llm',
      substitute: false,
      retrieval_miss: miss,
    }
  }
  if (retrieved) {
    return {
      shape: retrieved.shape,
      source: 'pack',
      design: retrieved.design,
      matched_by: retrieved.matched_by,
      substitute: retrieved.design.substitute,
      retrieval_miss: false,
    }
  }

  // 6순위 — 2D 는 `generatePen` 안에서 명패로 떨어진다. 입체는 레시피 후보가 남아 있다.
  return {
    shape: null,
    source: flat ? 'fallback' : 'recipe',
    design: null,
    matched_by: flat ? 'fallback' : 'recipe',
    substitute: false,
    retrieval_miss: miss,
  }
}

/**
 * 3D펜 도안 한 건을 **수업 패키지까지** 만든다. 예외를 던지지 않는다 (ADR-030).
 */
export function penHarness(spec: StudioSpec, options: PenHarnessOptions = {}): PenHarnessResult {
  const flat = formOf(spec) === 'flat'
  const constraints = lessonConstraints(spec)
  const retrieved = options.retrieved !== undefined ? options.retrieved : retrieveDesign(spec.topic)

  const run = (pick: Chosen) =>
    generatePen(spec, {
      recipeId: options.recipeId ?? null,
      composition: options.composition ?? null,
      shape: pick.shape,
      calibration: options.calibration ?? null,
    })

  let chosen = chooseShape(spec, options, retrieved)
  let generated = run(chosen)

  /**
   * **검수되지 않은 제안이 물리 검증에 걸리면 검수된 모양으로 내려간다** (ADR-046).
   *
   * 제안을 아틀라스보다 먼저 쓰기로 한 결정(`chooseShape` 3순위)의 안전망이다. 이것이 없으면
   * 스위치를 켠 것만으로, 같은 단어의 검수된 모양이 있는데도 `failed` 가 나가는 요청이 생긴다.
   *
   * 내려가는 것은 **제안(`dsl`)뿐이다.** 검수된 모양이 떨어지는 경우에는 개선 라운드가 이미
   * 돈 뒤이므로, 다음 순서로 바꿔 봐야 같은 임계값에 같은 방식으로 걸린다. **임계값은 한
   * 항목도 면제하지 않는다** — 내려간 결과도 `validatePen` 을 그대로 다시 지난다 (ADR-030).
   */
  let downgraded = false
  if (!generated.report.ok && chosen.source === 'dsl') {
    const vetted = chooseShape(spec, { ...options, proposedShape: null }, retrieved)
    const retry = run(vetted)
    if (retry.report.ok) {
      chosen = vetted
      generated = retry
      downgraded = true
    }
  }

  const artifact = generated.artifact
  const fellBack = generated.report.findings.some((f) => f.code === 'PEN_SHAPE_FALLBACK')
  const source: ShapeSource = fellBack ? 'fallback' : chosen.source

  /**
   * 내려갔다는 사실을 남긴다. **명패까지 내려간 경우에는 적지 않는다** —
   * `PEN_SHAPE_FALLBACK` 이 "요청한 모양이 아니다" 를 이미 적고 있고, 그 경우 나간 것은
   * 검수된 모양이 아니라 명패이므로 이 문장이 사실과 다르다.
   */
  if (downgraded && !fellBack) {
    const notice = penFinding(
      'PEN_SHAPE_DOWNGRADED',
      'AI 가 제안한 모양이 물리 검증에 걸려 검수된 모양으로 만들었습니다. 같은 단어로 다시 만들면 다른 제안이 나올 수 있습니다.',
    )
    generated.report.findings.push(notice)
    const last = generated.rounds[generated.rounds.length - 1]
    if (last) last.findings = [...last.findings, notice]
  }

  const evidence: Evidence[] = []
  if (chosen.design && chosen.shape) {
    evidence.push({
      source_id: chosen.design.shape_id,
      matched_by: chosen.matched_by ?? 'exact',
      trust_level: chosen.design.substitute ? 'substitute' : 'reviewed',
      license: ATLAS_LICENSE,
      attribution: ATLAS_ATTRIBUTION,
    })
    evidence.push({
      source_id: chosen.design.id,
      matched_by: chosen.matched_by ?? 'exact',
      trust_level: chosen.design.substitute ? 'substitute' : 'reviewed',
      license: null,
      attribution: '사전 제작 도안 팩 (미리 작성한 문장)',
    })
  } else {
    evidence.push({
      source_id: generated.recipe_id,
      matched_by: chosen.matched_by ?? 'recipe',
      trust_level: source === 'dsl' ? 'unreviewed' : 'reviewed',
      license: null,
      attribution: null,
    })
  }

  const substitute_note =
    chosen.substitute && chosen.design && !fellBack
      ? substituteNote(spec.topic, chosen.design)
      : null

  const pkg = lessonPackage({
    pattern: artifact.pattern,
    metrics: generated.metrics,
    constraints,
    flat,
    design: fellBack ? null : chosen.design,
    reviewed: source === 'pack' || source === 'atlas' || source === 'recipe' || source === 'compose',
    geometry_ok: generated.report.ok,
    substitute: chosen.substitute,
    calibration: options.calibration ?? null,
    evidence,
    /**
     * 문장을 누가 썼는가. 저작 레이어가 규칙으로 떨어졌는데 **팩 항목이 쓰였다면 `pack`**
     * 이다 — 학습 목표와 주의사항이 그 항목이 들고 있던 문장이기 때문이다. 규칙이 쓴 것으로
     * 적으면 화면이 출처를 틀리게 말한다 (ADR-025).
     */
    authored_by:
      (options.authoredBy ?? 'rule') === 'rule' && chosen.design && !fellBack
        ? 'pack'
        : (options.authoredBy ?? 'rule'),
    tasks: options.tasks ?? artifact.tasks,
  })

  // 지도안 정합성(error) + 수업 운영 검사(warn). 물리 검증 결과에 **덧붙인다**.
  const extra = [
    ...validatePackage(pkg, artifact.pattern, constraints, flat),
    ...harnessChecks({
      package: pkg,
      constraints,
      matched_by: chosen.matched_by,
      substitute: chosen.substitute,
      substitute_note,
      retrieval_miss: chosen.retrieval_miss && !fellBack,
      metrics: generated.metrics,
    }),
  ]

  const findings = [...generated.report.findings, ...extra]
  const ok = findings.every((f) => f.severity !== 'error')
  const rounds = generated.rounds.map((round, index) =>
    index === generated.rounds.length - 1
      ? { ...round, findings: [...round.findings, ...extra], ok }
      : round,
  )

  return {
    ...generated,
    artifact: { ...artifact, package: pkg },
    package: pkg,
    constraints,
    report: { ok, findings },
    rounds,
    status: ok ? 'validated' : 'failed',
    shape_source: source,
    design: fellBack ? null : chosen.design,
    matched_by: chosen.matched_by,
    substitute_note,
    evidence,
  }
}
