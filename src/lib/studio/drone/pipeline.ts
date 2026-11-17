/**
 * 드론 미션 생성 → 검증 → 개선 → 재검증. 3D펜 파이프라인과 **같은 계약**이다 (ADR-030):
 * 통과하지 못한 산출물을 통과한 것처럼 돌려주지 않고, 라운드를 전부 남기고,
 * 임계값을 건드리지 않는다.
 */

import { DRONE_MODELS, MAX_REPAIR_ROUNDS, SCALE_DOWN_STEP } from '@/lib/studio/constants'
import {
  DRONE_RECIPES,
  buildMission,
  droneCandidates,
  droneRecipeById,
  type DroneRecipe,
  type DroneRecipeParams,
} from '@/lib/studio/drone/course'
import { courseSetup, emitCode } from '@/lib/studio/drone/code'
import { validateDrone } from '@/lib/studio/drone/validate'
import type {
  DroneArtifact,
  DroneMetrics,
  Finding,
  StudioCalibration,
  StudioRound,
  StudioSpec,
  ValidationReport,
} from '@/types/studio'

export type DroneGenerateOptions = {
  recipeId?: string | null
  calibration?: StudioCalibration | null
}

export type DroneGenerateResult = {
  recipe_id: string
  params: DroneRecipeParams
  artifact: DroneArtifact
  metrics: DroneMetrics
  report: ValidationReport
  rounds: StudioRound[]
  status: 'validated' | 'failed'
}

const REPAIRABLE = new Set([
  'DRONE_VENUE_TOO_SMALL',
  'DRONE_OUT_OF_BOUNDS',
  'DRONE_TIME_OVER',
  'DRONE_ALTITUDE_LIMIT',
  'DRONE_STEP_TOO_LARGE',
  'DRONE_OBSTACLE_CLEARANCE',
])

/** 보유 장비에서 기체를 고른다. 없으면 Tello 로 두고 검증이 장비 없음을 잡게 한다. */
export function pickModel(equipment: string[]): string {
  const text = equipment.join(' ').toLowerCase()
  const found = DRONE_MODELS.find((m) => m.keywords.some((k) => text.includes(k)))
  return (found ?? DRONE_MODELS[0]!).id
}

function pickRecipe(spec: StudioSpec, options: DroneGenerateOptions): DroneRecipe {
  const chosen = options.recipeId ? droneRecipeById(options.recipeId) : null
  if (chosen) return chosen
  const candidates = droneCandidates(spec.topic, spec.grade_band)
  if (options.calibration?.lower_difficulty === true) {
    const lowered = droneCandidates(
      spec.topic,
      spec.grade_band,
      Math.max(1, (candidates[0]?.nominal_difficulty ?? 2) - 1),
    )
    return (lowered[0] ?? candidates[0] ?? DRONE_RECIPES[0]) as DroneRecipe
  }
  return (candidates[0] ?? DRONE_RECIPES[0]) as DroneRecipe
}

type Repair = { params: DroneRecipeParams; label: string }

function chooseRepair(
  findings: Finding[],
  params: DroneRecipeParams,
  recipe: DroneRecipe,
): Repair | null {
  const has = (code: string) => findings.some((f) => f.code === code && f.severity === 'error')
  const [minSize] = recipe.size_range

  // 1) 공간이 모자라다 → 코스를 줄인다.
  if (has('DRONE_VENUE_TOO_SMALL') || has('DRONE_OUT_OF_BOUNDS')) {
    if (params.size > minSize) {
      const size = Math.max(minSize, Math.round(params.size * SCALE_DOWN_STEP))
      return { params: { ...params, size }, label: `장소에 맞도록 코스를 ${size}cm 로 줄였습니다.` }
    }
    return null
  }

  // 2) 시간이 모자라다 → 반복을 줄이고, 그 다음 코스를 줄인다.
  if (has('DRONE_TIME_OVER')) {
    if (params.repeats > 1) {
      return {
        params: { ...params, repeats: params.repeats - 1 },
        label: `시간에 맞추기 위해 반복을 ${params.repeats - 1}회로 줄였습니다.`,
      }
    }
    if (params.size > minSize) {
      const size = Math.max(minSize, Math.round(params.size * SCALE_DOWN_STEP))
      return {
        params: { ...params, size },
        label: `시간에 맞추기 위해 코스를 ${size}cm 로 줄였습니다.`,
      }
    }
    return null
  }

  // 3) 고도가 범위를 벗어난다 → 기본 고도를 낮춘다.
  if (has('DRONE_ALTITUDE_LIMIT')) {
    if (params.altitude > 60) {
      const altitude = params.altitude - 30
      return {
        params: { ...params, altitude },
        label: `천장·기체 상한에 맞춰 비행 고도를 ${altitude}cm 로 낮췄습니다.`,
      }
    }
    return null
  }

  // 4) 이동량이 기체 범위 밖이다 → 코스를 줄여 한 번에 가는 거리를 줄인다.
  if (has('DRONE_STEP_TOO_LARGE') || has('DRONE_OBSTACLE_CLEARANCE')) {
    if (params.size > minSize) {
      const size = Math.max(minSize, Math.round(params.size * SCALE_DOWN_STEP))
      return {
        params: { ...params, size },
        label: `기체·장애물 조건에 맞도록 코스를 ${size}cm 로 줄였습니다.`,
      }
    }
    return null
  }

  return null
}

function ruleTasks(mission: ReturnType<typeof buildMission>, metrics: DroneMetrics): string[] {
  return [
    `비행 구역 밖에서 코스를 보고, 명령 ${metrics.command_count}개가 어디로 가는지 종이에 먼저 그려 봅니다.`,
    '조종자는 한 번에 한 명입니다. 자기 차례가 아니면 선 밖에서 봅니다.',
    `코드를 실행하고 기체가 ${mission.title} 경로를 그대로 도는지 확인합니다.`,
    '실제 경로가 예상과 다르면 어느 명령에서 어긋났는지 찾아 숫자를 고쳐 봅니다.',
  ]
}

/** 드론 코드 생성. **예외를 던지지 않는다** — 실패해도 산출물과 이유를 돌려준다. */
export function generateDrone(
  spec: StudioSpec,
  options: DroneGenerateOptions = {},
): DroneGenerateResult {
  const recipe = pickRecipe(spec, options)
  const modelId = pickModel(spec.equipment)

  let params = { ...recipe.defaults }
  const rounds: StudioRound[] = []

  let mission = buildMission(recipe, params, modelId)
  let result = validateDrone(mission, spec)
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
    if (!errors.every((f) => REPAIRABLE.has(f.code))) break

    const repair = chooseRepair(result.report.findings, params, recipe)
    if (!repair) break

    params = repair.params
    mission = buildMission(recipe, params, modelId)
    result = validateDrone(mission, spec)
    rounds.push({
      round: rounds.length + 1,
      action: 'repaired',
      repair: repair.label,
      params: { ...params },
      ok: result.report.ok,
      findings: result.report.findings,
    })
  }

  const model = DRONE_MODELS.find((m) => m.id === modelId) ?? DRONE_MODELS[0]!

  const artifact: DroneArtifact = {
    kind: 'drone',
    mission,
    metrics: result.metrics,
    code: emitCode(mission, model),
    course_setup: courseSetup(mission),
    tasks: ruleTasks(mission, result.metrics),
    safety_notes: result.safety_notes,
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
