/**
 * 드론 코스 레시피. **비행 명령을 만드는 유일한 주체다** (ADR-029).
 *
 * LLM 은 이 목록에서 고르기만 한다. 명령과 장애물 좌표를 모델이 만들면 체육관에 들어가지
 * 않는 코스가 나오고, 그건 수업 당일 교실에서야 알게 된다.
 *
 * 좌표계는 `simulate.ts` 와 같다 — 비행 구역 왼쪽 위가 원점, cm 단위.
 */

import { DRONE_TAKEOFF_ALTITUDE_CM } from '@/lib/studio/constants'
import type { GradeBand } from '@/types/domain'
import type { DroneCommand, DroneMission, DroneObstacle } from '@/types/studio'

export type DroneRecipeParams = {
  /** 코스 기준 치수 (cm) */
  size: number
  /** 반복 횟수 또는 게이트 수 */
  repeats: number
  /** 기본 비행 고도 (cm) */
  altitude: number
}

export type DroneRecipe = {
  id: string
  title: string
  summary: string
  keywords: readonly string[]
  defaults: DroneRecipeParams
  size_range: [number, number]
  nominal_difficulty: number
  build: (params: DroneRecipeParams) => Omit<DroneMission, 'recipe_id' | 'title' | 'model_id'>
}

const MARGIN = 80

/** 코스 사각형과 이착륙 지점. 경로가 구역 안에 들어가도록 여유를 둔다. */
function frame(
  width: number,
  height: number,
  takeoffOffset: { x: number; y: number } = { x: 0, y: 0 },
): { course_cm: { x: number; y: number }; takeoff_cm: { x: number; y: number } } {
  return {
    course_cm: { x: Math.round(width + MARGIN * 2), y: Math.round(height + MARGIN * 2) },
    takeoff_cm: { x: Math.round(MARGIN + takeoffOffset.x), y: Math.round(MARGIN + takeoffOffset.y) },
  }
}

/** 게이트를 지난 뒤 고도를 바꾸기 전에 빠져나가는 거리. 문틀 안에서 올라가면 윗막대에 부딪힌다. */
const GATE_CLEAR_CM = 60

const squarePatrol: DroneRecipe = {
  id: 'square-patrol',
  title: '사각 순찰 비행',
  summary: '이륙해서 정사각형으로 한 바퀴 돌고 제자리에 착륙한다. 전진과 회전만 쓰는 첫 코스다.',
  keywords: ['순찰', '사각', '기초', '첫 비행', '정사각', '회전'],
  defaults: { size: 150, repeats: 1, altitude: DRONE_TAKEOFF_ALTITUDE_CM },
  size_range: [60, 300],
  nominal_difficulty: 2,
  build: ({ size, repeats, altitude }) => {
    const { course_cm, takeoff_cm } = frame(size, size)
    const commands: DroneCommand[] = [{ name: 'takeoff', value: 0 }]
    if (altitude !== DRONE_TAKEOFF_ALTITUDE_CM) {
      const delta = altitude - DRONE_TAKEOFF_ALTITUDE_CM
      commands.push({ name: delta > 0 ? 'up' : 'down', value: Math.abs(delta) })
    }
    for (let lap = 0; lap < repeats; lap += 1) {
      for (let i = 0; i < 4; i += 1) {
        commands.push({ name: 'forward', value: size })
        commands.push({ name: 'cw', value: 90 })
      }
    }
    commands.push({ name: 'land', value: 0 })

    // 네 모서리에 콘을 놓아 경로를 눈으로 보이게 한다. 경로 안쪽이 아니라 바깥에 둔다.
    const obstacles: DroneObstacle[] = [
      [0, 0],
      [size, 0],
      [size, size],
      [0, size],
    ].map(([dx, dy], i) => ({
      id: `cone-${i + 1}`,
      kind: 'cone' as const,
      x: takeoff_cm.x + (dx as number) + (dx === 0 ? -60 : 60),
      y: takeoff_cm.y + (dy as number) + (dy === 0 ? -60 : 60),
      height_cm: 45,
    }))

    return { course_cm, takeoff_cm, commands, obstacles }
  },
}

const gateCourse: DroneRecipe = {
  id: 'gate-course',
  title: '게이트 통과 코스',
  summary: '높이가 다른 게이트를 차례로 통과한다. 고도 조절과 직진을 같이 연습한다.',
  keywords: ['게이트', '통과', '장애물', '코스', '문', '높이'],
  defaults: { size: 140, repeats: 3, altitude: DRONE_TAKEOFF_ALTITUDE_CM },
  size_range: [100, 250],
  nominal_difficulty: 3,
  build: ({ size, repeats, altitude }) => {
    const gates = Math.max(2, Math.min(repeats, 4))
    const { course_cm, takeoff_cm } = frame((size + GATE_CLEAR_CM) * gates, 160)
    const commands: DroneCommand[] = [{ name: 'takeoff', value: 0 }]
    const obstacles: DroneObstacle[] = []

    let current = DRONE_TAKEOFF_ALTITUDE_CM
    let x = takeoff_cm.x

    for (let i = 0; i < gates; i += 1) {
      // 게이트 개구부 중심을 번갈아 높인다. 개구부 높이 80cm 의 가운데로 지나간다.
      const openingBottom = i % 2 === 0 ? altitude - 40 : altitude + 20
      const center = openingBottom + 40
      const delta = Math.round(center - current)

      // **고도는 게이트 앞에서 미리 맞춘다.** 문틀 안에서 올라가면 윗막대에 부딪힌다.
      if (Math.abs(delta) >= 20) {
        commands.push({ name: delta > 0 ? 'up' : 'down', value: Math.abs(delta) })
        current += delta
      }
      commands.push({ name: 'forward', value: size })
      x += size
      obstacles.push({
        id: `gate-${i + 1}`,
        kind: 'gate',
        x,
        y: takeoff_cm.y,
        height_cm: Math.round(openingBottom),
        opening_w_cm: 90,
        opening_h_cm: 80,
        facing: 'x',
      })
      // 게이트를 완전히 빠져나간 뒤에 다음 고도 조절을 한다.
      commands.push({ name: 'forward', value: GATE_CLEAR_CM })
      x += GATE_CLEAR_CM
    }
    commands.push({ name: 'land', value: 0 })
    return { course_cm, takeoff_cm, commands, obstacles }
  },
}

const altitudeSteps: DroneRecipe = {
  id: 'altitude-steps',
  title: '고도 계단 비행',
  summary: '같은 자리에서 고도를 한 단계씩 올렸다 내린다. 장애물 없이 고도 감각만 익히는 코스다.',
  keywords: ['고도', '높이', '계단', '제자리', '호버', '기초'],
  defaults: { size: 80, repeats: 3, altitude: DRONE_TAKEOFF_ALTITUDE_CM },
  size_range: [60, 150],
  nominal_difficulty: 2,
  build: ({ size, repeats, altitude }) => {
    const { course_cm, takeoff_cm } = frame(size, size)
    const steps = Math.max(2, Math.min(repeats, 4))
    const commands: DroneCommand[] = [{ name: 'takeoff', value: 0 }]
    let current = DRONE_TAKEOFF_ALTITUDE_CM

    for (let i = 0; i < steps; i += 1) {
      commands.push({ name: 'up', value: 30 })
      current += 30
      commands.push({ name: 'hover', value: 2 })
    }
    commands.push({ name: 'forward', value: size })
    for (let i = 0; i < steps; i += 1) {
      commands.push({ name: 'down', value: 30 })
      current -= 30
    }
    // altitude 는 시작 고도 보정용이다. 범위를 벗어나지 않게 마지막에 맞춘다.
    const delta = Math.round(altitude - current)
    if (Math.abs(delta) >= 20) {
      commands.push({ name: delta > 0 ? 'up' : 'down', value: Math.abs(delta) })
    }
    commands.push({ name: 'land', value: 0 })

    return { course_cm, takeoff_cm, commands, obstacles: [] }
  },
}

const doubleLoop: DroneRecipe = {
  id: 'double-loop',
  title: '8자 두 바퀴',
  summary: '시계 방향으로 한 바퀴, 반대 방향으로 한 바퀴 돈다. 회전 방향을 바꾸는 감각을 익힌다.',
  keywords: ['8자', '회전', '심화', '두 바퀴', '방향'],
  defaults: { size: 120, repeats: 1, altitude: DRONE_TAKEOFF_ALTITUDE_CM },
  size_range: [60, 220],
  nominal_difficulty: 4,
  build: ({ size, repeats, altitude }) => {
    // 시계 방향 바퀴는 이착륙 지점 아래쪽(+y), 반대 방향 바퀴는 위쪽(-y)에 생긴다.
    // 그래서 구역 높이는 size 의 두 배이고 이착륙 지점은 가운데다.
    const { course_cm, takeoff_cm } = frame(size, size * 2, { x: 0, y: size })
    const commands: DroneCommand[] = [{ name: 'takeoff', value: 0 }]
    if (altitude !== DRONE_TAKEOFF_ALTITUDE_CM) {
      const delta = altitude - DRONE_TAKEOFF_ALTITUDE_CM
      commands.push({ name: delta > 0 ? 'up' : 'down', value: Math.abs(delta) })
    }
    for (let lap = 0; lap < Math.max(1, repeats); lap += 1) {
      for (let i = 0; i < 4; i += 1) {
        commands.push({ name: 'forward', value: size })
        commands.push({ name: 'cw', value: 90 })
      }
      for (let i = 0; i < 4; i += 1) {
        commands.push({ name: 'forward', value: size })
        commands.push({ name: 'ccw', value: 90 })
      }
    }
    commands.push({ name: 'land', value: 0 })

    // 두 바퀴의 가운데에 콘을 하나씩 놓아 경로를 눈으로 보이게 한다.
    const obstacles: DroneObstacle[] = [
      { id: 'cone-1', kind: 'cone', x: takeoff_cm.x + size / 2, y: takeoff_cm.y + size / 2, height_cm: 45 },
      { id: 'cone-2', kind: 'cone', x: takeoff_cm.x + size / 2, y: takeoff_cm.y - size / 2, height_cm: 45 },
    ]
    return { course_cm, takeoff_cm, commands, obstacles }
  },
}

export const DRONE_RECIPES: readonly DroneRecipe[] = [
  squarePatrol,
  altitudeSteps,
  gateCourse,
  doubleLoop,
]

export function droneRecipeById(id: string): DroneRecipe | null {
  return DRONE_RECIPES.find((r) => r.id === id) ?? null
}

export function buildMission(
  recipe: DroneRecipe,
  params: DroneRecipeParams,
  modelId: string,
  title = recipe.title,
): DroneMission {
  return {
    recipe_id: recipe.id,
    title,
    model_id: modelId,
    ...recipe.build(params),
  }
}

const DIFFICULTY_CAP: Record<GradeBand, number> = {
  elementary: 2,
  middle: 4,
  high: 5,
}

/** 주제로 후보를 추린다. 키워드가 맞지 않아도 빈 목록을 돌려주지 않는다. */
export function droneCandidates(
  topic: string,
  gradeBand: GradeBand,
  difficultyCap = DIFFICULTY_CAP[gradeBand],
): DroneRecipe[] {
  const text = topic.trim().toLowerCase()
  return DRONE_RECIPES.filter((r) => r.nominal_difficulty <= difficultyCap)
    .map((r) => ({
      r,
      score: text === '' ? 0 : r.keywords.filter((k) => text.includes(k.toLowerCase())).length,
    }))
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.r.nominal_difficulty - b.r.nominal_difficulty ||
        a.r.id.localeCompare(b.r.id),
    )
    .map((x) => x.r)
}
