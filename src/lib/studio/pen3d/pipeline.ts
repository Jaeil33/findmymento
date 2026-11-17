/**
 * 생성 → 검증 → 개선 → 재검증 (ADR-030).
 *
 * 이 파일이 지켜야 하는 것 세 가지:
 * 1. **통과하지 못한 산출물을 통과한 것처럼 돌려주지 않는다.** `status` 는 마지막 검증 결과에서만 온다
 * 2. **임계값을 건드리지 않는다.** 고치는 것은 생성 파라미터(치수·장식·선택 부품)뿐이다
 * 3. **모든 라운드를 남긴다.** 강사가 "무엇이 걸렸고 어떻게 고쳤는지"를 그대로 본다
 *
 * LLM 은 여기 없다. 레시피 선택과 문장은 `lib/studio/author.ts` 가 얹고, 실패하면 이 규칙
 * 결과가 그대로 화면에 나간다.
 */

import { MAX_REPAIR_ROUNDS, PEN_SAFETY_NOTES, SCALE_DOWN_STEP, SCALE_UP_STEP } from '@/lib/studio/constants'
import { compositionRecipe, type PenComposition } from '@/lib/studio/pen3d/compose'
import {
  buildPattern,
  recipeById,
  recipeCandidates,
  type PenRecipe,
  type PenRecipeParams,
} from '@/lib/studio/pen3d/recipes'
import { penMetrics, validatePen } from '@/lib/studio/pen3d/validate'
import type {
  Finding,
  PenArtifact,
  PenMetrics,
  PenPattern,
  StudioCalibration,
  StudioRound,
  StudioSpec,
  ValidationReport,
} from '@/types/studio'

export type PenGenerateOptions = {
  /** 강사 또는 LLM 이 고른 레시피. 없거나 목록에 없으면 규칙 1순위를 쓴다 */
  recipeId?: string | null
  /**
   * 조각 조합 (ADR-034). 있으면 **레시피 대신** 이것으로 만든다 —
   * 조합은 레시피와 같은 형태라 아래 생성·검증·개선 라운드가 그대로 돌아간다.
   * 강사가 레시피를 직접 고른 경우에는 그쪽이 우선이다.
   */
  composition?: PenComposition | null
  /** 같은 레시피·학년대의 성과 피드백 보정 (ADR-032) */
  calibration?: StudioCalibration | null
}

export type PenGenerateResult = {
  recipe_id: string
  params: PenRecipeParams
  artifact: PenArtifact
  metrics: PenMetrics
  report: ValidationReport
  rounds: StudioRound[]
  status: 'validated' | 'failed'
}

/** 파라미터를 바꿔서 고칠 수 있는 항목. 나머지는 고쳐도 달라지지 않으므로 바로 끝낸다. */
const REPAIRABLE = new Set([
  'PEN_GAP_TOO_SMALL',
  'PEN_SEGMENT_TOO_SHORT',
  'PEN_ANGLE_TOO_SHARP',
  'PEN_PART_OUT_OF_PAGE',
  'PEN_PARTS_OVERLAP',
  'PEN_TIME_OVER',
  'PEN_TOO_MANY_PARTS',
])

function pickRecipe(spec: StudioSpec, options: PenGenerateOptions): PenRecipe {
  const chosen = options.recipeId ? recipeById(options.recipeId) : null
  if (chosen) return chosen
  // 강사가 고른 레시피가 없을 때만 조합을 쓴다. 사람이 고른 것이 늘 우선이다.
  if (options.composition) return compositionRecipe(options.composition)
  // 피드백이 "어려웠다"로 모이면 난이도 상한을 한 단계 낮춰서 고른다 (ADR-032).
  const lower = options.calibration?.lower_difficulty === true
  const candidates = recipeCandidates(spec.topic, spec.grade_band)
  if (!lower) return candidates[0] as PenRecipe
  const lowered = recipeCandidates(
    spec.topic,
    spec.grade_band,
    Math.max(1, (candidates[0]?.nominal_difficulty ?? 2) - 1),
  )
  return (lowered[0] ?? candidates[0]) as PenRecipe
}

/**
 * 1라운드 치수. 기본 치수로 시간이 모자라면 **미리 줄여서 시작한다** — 선 길이는 치수에
 * 비례하므로 필요한 배율을 바로 계산할 수 있다. 시간이 남을 때 키우지는 않는다:
 * 레시피의 기본 치수가 사람이 검수한 값이고, 그걸 넘겨서 키울 근거가 없다.
 */
function initialParams(
  recipe: PenRecipe,
  spec: StudioSpec,
  speedFactor: number,
): PenRecipeParams {
  const base = recipe.defaults
  const atDefault = penMetrics(buildPattern(recipe, base), spec, { speedFactor })
  const fixedSeconds = (atDefault.peel_seconds + atDefault.weld_seconds) * speedFactor
  const budget = atDefault.available_minutes * 60 - fixedSeconds
  const drawSeconds = atDefault.draw_seconds * speedFactor
  if (budget <= 0 || drawSeconds <= budget) return base

  const ratio = budget / drawSeconds
  const minSize = recipe.size_range[0]
  const size = Math.max(minSize, Math.round(base.size * ratio * 10) / 10)
  return { ...base, size }
}

type RepairKind = 'scale-up' | 'scale-down' | 'detail-down' | 'extras-off'
type Repair = { params: PenRecipeParams; label: string; kind: RepairKind }

const SCALE_CODES = ['PEN_GAP_TOO_SMALL', 'PEN_SEGMENT_TOO_SHORT', 'PEN_ANGLE_TOO_SHARP']

/**
 * 직전에 도안을 키웠는데 측정값이 그대로면 **더 키워도 소용없다** — 치수에 비례하지 않는
 * 고정 값(고리 두께·슬릿 폭 같은 것)이 걸린 경우다. 그때는 다른 전략으로 넘어간다.
 * 이 가드가 없으면 개선 라운드 3회를 같은 실패에 다 쓴다.
 */
function scaleUpStillHelps(findings: Finding[], previous: PreviousRound | null): boolean {
  if (!previous || previous.kind !== 'scale-up') return true
  for (const code of SCALE_CODES) {
    const before = previous.findings.find((f) => f.code === code)?.measured
    const after = findings.find((f) => f.code === code)?.measured
    if (before !== undefined && after !== undefined && after > before + 0.01) return true
  }
  return false
}

type PreviousRound = { kind: RepairKind; findings: Finding[] }

/** 무엇이 걸렸는지에 따라 파라미터를 한 번 바꾼다. 더 바꿀 것이 없으면 `null`. */
function chooseRepair(
  findings: Finding[],
  params: PenRecipeParams,
  recipe: PenRecipe,
  previous: PreviousRound | null,
): Repair | null {
  const has = (code: string) => findings.some((f) => f.code === code && f.severity === 'error')
  const [minSize, maxSize] = recipe.size_range

  // 1) 너무 좁거나 짧거나 뾰족하다 → 키운다. 물리 한계는 치수로만 넘을 수 있다.
  if (SCALE_CODES.some(has)) {
    if (params.size < maxSize && scaleUpStillHelps(findings, previous)) {
      const size = Math.min(maxSize, Math.round(params.size * SCALE_UP_STEP * 10) / 10)
      return {
        params: { ...params, size },
        label: `선이 좁거나 짧아서 도안을 ${size}mm 로 키웠습니다.`,
        kind: 'scale-up',
      }
    }
    if (params.detail > 0) {
      return {
        params: { ...params, detail: params.detail - 1 },
        label: '도안을 키워도 간격이 모자라 장식 선을 뺐습니다.',
        kind: 'detail-down',
      }
    }
    return null
  }

  // 2) 종이를 넘는다 → 줄인다.
  if (has('PEN_PART_OUT_OF_PAGE') || has('PEN_PARTS_OVERLAP')) {
    if (params.size > minSize) {
      const size = Math.max(minSize, Math.round(params.size * SCALE_DOWN_STEP * 10) / 10)
      return {
        params: { ...params, size },
        label: `A4 에 맞도록 도안을 ${size}mm 로 줄였습니다.`,
        kind: 'scale-down',
      }
    }
    return null
  }

  // 3) 시간·부품이 많다 → 선택 부품 → 장식 → 치수 순으로 뺀다.
  if (has('PEN_TIME_OVER') || has('PEN_TOO_MANY_PARTS')) {
    if (params.extras) {
      return {
        params: { ...params, extras: false },
        label: '부품 수·시간에 맞추기 위해 선택 부품(뚜껑·잎 등)을 뺐습니다.',
        kind: 'extras-off',
      }
    }
    if (params.detail > 0) {
      return {
        params: { ...params, detail: params.detail - 1 },
        label: '시간에 맞추기 위해 장식 단계를 한 단계 줄였습니다.',
        kind: 'detail-down',
      }
    }
    if (has('PEN_TIME_OVER') && params.size > minSize) {
      const size = Math.max(minSize, Math.round(params.size * SCALE_DOWN_STEP * 10) / 10)
      return {
        params: { ...params, size },
        label: `시간에 맞추기 위해 도안을 ${size}mm 로 줄였습니다.`,
        kind: 'scale-down',
      }
    }
    return null
  }

  return null
}

function assemblySteps(pattern: PenPattern): string[] {
  const byId = new Map(pattern.parts.map((p) => [p.id, p]))
  const made = pattern.parts
    .map((p) => `${p.name} ${p.quantity}개`)
    .join(' · ')

  const steps = [
    `도안의 선 위에 펜으로 덧그려 부품을 만듭니다 — ${made}. 같은 모양은 같은 선 위에 필요한 개수만큼 반복해서 그립니다.`,
    '부품이 식은 뒤에 종이에서 떼어냅니다. 따뜻할 때 떼면 늘어납니다.',
  ]
  for (const joint of pattern.joints) {
    const a = byId.get(joint.a)?.name ?? joint.a
    const b = byId.get(joint.b)?.name ?? joint.b
    const where = joint.count > 1 ? ` (${joint.count}곳)` : ''
    steps.push(`${a} ↔ ${b}${where}: ${joint.how}`)
  }
  return steps
}

function ruleTasks(pattern: PenPattern, metrics: PenMetrics): string[] {
  return [
    `도안을 보고 ${pattern.parts.length}종 ${metrics.part_count}개의 부품을 만듭니다.`,
    `부품을 떼어내고 조립 순서를 따라 ${metrics.joint_count}곳을 붙여 ${pattern.title}을 완성합니다.`,
    `완성한 작품을 친구에게 보여주고, 어디를 바꾸면 더 좋아질지 한 문장으로 적습니다.`,
    `먼저 끝냈으면 부품 하나를 다른 모양으로 바꿔 만들어 봅니다.`,
  ]
}

/**
 * 3D펜 도안 생성. **예외를 던지지 않는다** — 실패해도 산출물과 이유를 돌려준다.
 * 화면은 실패 이유를 보여줘야 하고, 그게 ADR-030 의 요구다.
 */
export function generatePen(spec: StudioSpec, options: PenGenerateOptions = {}): PenGenerateResult {
  const recipe = pickRecipe(spec, options)
  const speedFactor = options.calibration?.speed_factor ?? 1

  let params = initialParams(recipe, spec, speedFactor)
  const rounds: StudioRound[] = []
  let previous: PreviousRound | null = null

  let pattern = buildPattern(recipe, params)
  let result = validatePen(pattern, spec, { speedFactor })
  rounds.push({
    round: 1,
    action: 'generated',
    repair: null,
    params: { ...params },
    ok: result.report.ok,
    findings: result.report.findings,
  })

  while (!result.report.ok && rounds.length <= MAX_REPAIR_ROUNDS) {
    const errors = result.report.findings.filter((f) => f.severity === 'error')
    // 고쳐도 달라지지 않는 항목(장비 없음·레시피 결함)이 섞여 있으면 라운드를 낭비하지 않는다.
    if (!errors.every((f) => REPAIRABLE.has(f.code))) break

    const repair = chooseRepair(result.report.findings, params, recipe, previous)
    if (!repair) break
    previous = { kind: repair.kind, findings: result.report.findings }

    params = repair.params
    pattern = buildPattern(recipe, params)
    result = validatePen(pattern, spec, { speedFactor })
    rounds.push({
      round: rounds.length + 1,
      action: 'repaired',
      repair: repair.label,
      params: { ...params },
      ok: result.report.ok,
      findings: result.report.findings,
    })
  }

  const artifact: PenArtifact = {
    kind: 'pen3d',
    // 배치(origin)가 채워진 패턴을 쓴다. 렌더와 검증이 같은 좌표를 본다.
    pattern: result.pattern,
    metrics: result.metrics,
    assembly: assemblySteps(result.pattern),
    tasks: ruleTasks(result.pattern, result.metrics),
    safety_notes: [...PEN_SAFETY_NOTES],
  }

  return {
    recipe_id: recipe.id,
    params,
    artifact,
    metrics: result.metrics,
    report: result.report,
    rounds,
    status: result.report.ok ? 'validated' : 'failed',
  }
}
