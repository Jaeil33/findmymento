/**
 * 드론 비행 코드 검증. **실제 기체가 아이들 머리 위에서 돈다** — 이 파일이 통과시킨 코드가
 * 교실에서 그대로 실행된다.
 *
 * 임계값은 전부 `constants.ts` 에서 온다. 항목과 코드는 `docs/STUDIO.md` 표와 1:1이다.
 */

import {
  DRONE_CONE_RADIUS_CM,
  DRONE_CEILING_MARGIN_CM,
  DRONE_FINDING_SEVERITY,
  DRONE_GATE_MARGIN_CM,
  DRONE_MIN_ALTITUDE_CM,
  DRONE_MODELS,
  DRONE_OBSTACLE_CLEARANCE_CM,
  DRONE_OVERHEAD_MINUTES,
  DRONE_SAFETY_NOTES,
  DRONE_SWAP_SECONDS,
  DRONE_WALL_CLEARANCE_CM,
  FLIP_MIN_CEILING_CM,
  TIME_TIGHT_RATIO,
  VENUE_DIMENSIONS,
  type DroneModel,
} from '@/lib/studio/constants'
import { pointSegDistance, type Seg } from '@/lib/studio/geometry'
import { simulate, type Flight } from '@/lib/studio/drone/simulate'
import {
  reportOf,
  type DroneMetrics,
  type DroneMission,
  type DroneObstacle,
  type Finding,
  type StudioSpec,
  type ValidationReport,
} from '@/types/studio'

export function droneModel(id: string): DroneModel | null {
  return DRONE_MODELS.find((m) => m.id === id) ?? null
}

export function hasDroneEquipment(equipment: string[], model: DroneModel): boolean {
  const text = equipment.join(' ').toLowerCase()
  return model.keywords.some((k) => text.includes(k))
}

function finding(code: string, message: string, extra: Partial<Finding> = {}): Finding {
  return { code, severity: DRONE_FINDING_SEVERITY[code] ?? 'error', message, ...extra }
}

const round1 = (n: number) => Math.round(n * 10) / 10

/** 수평면에서 선분과 점 사이 거리. 고도는 따로 본다 — 장애물은 바닥에서 올라온 물건이다. */
function horizontalDistance(seg: Seg, x: number, y: number): number {
  return pointSegDistance({ x, y }, seg)
}

/** 구간이 장애물 높이 범위와 겹치는가. 장애물보다 높이 날면 부딪히지 않는다. */
function overlapsHeight(a: number, b: number, obstacleTop: number): boolean {
  return Math.min(a, b) <= obstacleTop
}

/**
 * 경로와 장애물의 최단거리 판정.
 *
 * - **콘**: 바닥에서 올라온 기둥이다. 기둥 반지름을 뺀 거리가 여유이고, 콘보다 높이 날면 본다.
 * - **게이트**: 통과하라고 놓은 물건이므로 벽과 같은 50cm 를 요구하지 않는다. 대신
 *   **개구부 안쪽으로 지나가는지**를 본다 — 중심선에서 `개구부 폭/2 − 여유` 보다 더 벗어나면
 *   기둥을 스친다. 고도도 같은 방식으로 본다.
 */
function obstacleFindings(flight: Flight, obstacles: DroneObstacle[]): {
  findings: Finding[]
  minClearance: number | null
} {
  const findings: Finding[] = []
  let min: number | null = null

  for (const obstacle of obstacles) {
    for (const seg of flight.segments) {
      const flat: Seg = { a: { x: seg.a.x, y: seg.a.y }, b: { x: seg.b.x, y: seg.b.y } }

      if (obstacle.kind === 'cone') {
        if (!overlapsHeight(seg.a.z, seg.b.z, obstacle.height_cm)) continue
        const clearance = horizontalDistance(flat, obstacle.x, obstacle.y) - DRONE_CONE_RADIUS_CM
        if (min === null || clearance < min) min = clearance
        if (clearance < DRONE_OBSTACLE_CLEARANCE_CM) {
          findings.push(
            finding(
              'DRONE_OBSTACLE_CLEARANCE',
              `${obstacle.id} 콘과 경로 사이가 ${round1(Math.max(clearance, 0))}cm 입니다. ${DRONE_OBSTACLE_CLEARANCE_CM}cm 이상 떨어져야 합니다.`,
              {
                where: obstacle.id,
                measured: round1(Math.max(clearance, 0)),
                limit: DRONE_OBSTACLE_CLEARANCE_CM,
              },
            ),
          )
        }
        continue
      }

      // ── 게이트 ──────────────────────────────────────────────────────────
      // 게이트는 **얇은 문틀**이다. 그 면을 가로지르는 구간만 개구부 안으로 지나가는지 보고,
      // 옆을 지나가는 구간은 기둥 두 개와의 거리로 본다. 이걸 구분하지 않으면 게이트 옆에서
      // 고도를 바꾸는 구간까지 "개구부를 벗어났다"로 잡혀 정상 코스가 전부 실격된다.
      const axis = obstacle.facing ?? 'x'
      const halfWidth = (obstacle.opening_w_cm ?? 0) / 2
      const usable = halfWidth - DRONE_GATE_MARGIN_CM
      const from = axis === 'x' ? seg.a.x : seg.a.y
      const to = axis === 'x' ? seg.b.x : seg.b.y
      const plane = axis === 'x' ? obstacle.x : obstacle.y
      const crosses = (from - plane) * (to - plane) <= 0 && from !== to

      if (crosses) {
        const t = (plane - from) / (to - from)
        const across =
          axis === 'x'
            ? seg.a.y + (seg.b.y - seg.a.y) * t - obstacle.y
            : seg.a.x + (seg.b.x - seg.a.x) * t - obstacle.x
        const z = seg.a.z + (seg.b.z - seg.a.z) * t
        const clearance = usable - Math.abs(across)
        if (min === null || clearance < min) min = clearance

        if (clearance < 0) {
          findings.push(
            finding(
              'DRONE_OBSTACLE_CLEARANCE',
              `${obstacle.id} 게이트 개구부 중심에서 ${round1(Math.abs(across))}cm 벗어난 자리로 지나갑니다. 기둥에서 ${DRONE_GATE_MARGIN_CM}cm 안쪽으로 지나가야 합니다.`,
              { where: obstacle.id, measured: round1(Math.abs(across)), limit: round1(usable) },
            ),
          )
          continue
        }

        const bottom = obstacle.height_cm + DRONE_GATE_MARGIN_CM
        const top = obstacle.height_cm + (obstacle.opening_h_cm ?? 0) - DRONE_GATE_MARGIN_CM
        if (z < bottom || z > top) {
          findings.push(
            finding(
              'DRONE_OBSTACLE_CLEARANCE',
              `${obstacle.id} 게이트를 ${round1(z)}cm 높이로 지나갑니다. ${round1(bottom)}~${round1(top)}cm 안으로 지나가야 합니다.`,
              { where: obstacle.id, measured: round1(z), limit: round1(bottom) },
            ),
          )
        }
        continue
      }

      // 면을 가로지르지 않는 구간 — 기둥 두 개를 점으로 보고 거리를 잰다.
      const posts =
        axis === 'x'
          ? [
              { x: obstacle.x, y: obstacle.y - halfWidth },
              { x: obstacle.x, y: obstacle.y + halfWidth },
            ]
          : [
              { x: obstacle.x - halfWidth, y: obstacle.y },
              { x: obstacle.x + halfWidth, y: obstacle.y },
            ]
      const top = obstacle.height_cm + (obstacle.opening_h_cm ?? 0)
      if (!overlapsHeight(seg.a.z, seg.b.z, top)) continue
      for (const post of posts) {
        const clearance = horizontalDistance(flat, post.x, post.y)
        if (min === null || clearance < min) min = clearance
        if (clearance < DRONE_OBSTACLE_CLEARANCE_CM) {
          findings.push(
            finding(
              'DRONE_OBSTACLE_CLEARANCE',
              `${obstacle.id} 게이트 기둥과 경로 사이가 ${round1(clearance)}cm 입니다. 통과하지 않고 옆을 지날 때는 ${DRONE_OBSTACLE_CLEARANCE_CM}cm 이상 떨어져야 합니다.`,
              { where: obstacle.id, measured: round1(clearance), limit: DRONE_OBSTACLE_CLEARANCE_CM },
            ),
          )
        }
      }
    }
  }

  return { findings, minClearance: min === null ? null : round1(min) }
}

export function droneMetrics(
  mission: DroneMission,
  spec: StudioSpec,
  model: DroneModel,
  flight: Flight = simulate(mission, model),
): DroneMetrics {
  const obstacles = obstacleFindings(flight, mission.obstacles)
  const perStudent = flight.seconds + DRONE_SWAP_SECONDS

  // 난이도: 명령 수 · 회전 · 고도 변화 · 장애물 수.
  const turns = mission.commands.filter((c) => c.name === 'cw' || c.name === 'ccw').length
  const altitudeChanges = mission.commands.filter((c) => c.name === 'up' || c.name === 'down').length
  let score = 0
  score += mission.commands.length <= 6 ? 0 : mission.commands.length <= 12 ? 1 : 2
  score += turns === 0 ? 0 : turns <= 4 ? 1 : 2
  score += altitudeChanges > 0 ? 1 : 0
  score += mission.obstacles.length === 0 ? 0 : mission.obstacles.length <= 3 ? 1 : 2
  score += mission.commands.some((c) => c.name === 'flip') ? 1 : 0

  return {
    command_count: mission.commands.length,
    flight_seconds_one: flight.seconds,
    path_cm: flight.path_cm,
    max_altitude_cm: flight.max_altitude_cm,
    min_clearance_cm: obstacles.minClearance,
    estimated_minutes: (perStudent * spec.student_count) / 60,
    available_minutes: Math.max(0, spec.duration_minutes - DRONE_OVERHEAD_MINUTES),
    difficulty: Math.max(1, Math.min(5, 1 + Math.round((score / 8) * 4))),
    footprint_cm: flight.footprint_cm,
  }
}

export function validateDrone(
  mission: DroneMission,
  spec: StudioSpec,
): {
  report: ValidationReport
  metrics: DroneMetrics
  flight: Flight
  safety_notes: string[]
} {
  const model = droneModel(mission.model_id) ?? DRONE_MODELS[0]!
  const flight = simulate(mission, model)
  const metrics = droneMetrics(mission, spec, model, flight)
  const venue = VENUE_DIMENSIONS[spec.venue]
  const findings: Finding[] = []

  // ── 장비 ──────────────────────────────────────────────────────────────────
  if (!hasDroneEquipment(spec.equipment, model)) {
    findings.push(
      finding(
        'DRONE_EQUIPMENT_MISSING',
        `보유 장비에 ${model.label} 가 없습니다. 장비 목록을 확인해 주세요.`,
      ),
    )
  }

  // ── 명령 구조 ─────────────────────────────────────────────────────────────
  const takeoffIndex = mission.commands.findIndex((c) => c.name === 'takeoff')
  const landIndex = mission.commands.findIndex((c) => c.name === 'land')
  if (takeoffIndex < 0) {
    findings.push(finding('DRONE_NO_TAKEOFF', '이륙 명령이 없습니다.'))
  }
  if (landIndex < 0) {
    findings.push(
      finding('DRONE_NO_LAND', '착륙 명령이 없습니다. 배터리가 떨어질 때까지 떠 있게 됩니다.'),
    )
  }
  if (landIndex >= 0 && landIndex < mission.commands.length - 1) {
    findings.push(
      finding(
        'DRONE_COMMAND_AFTER_LAND',
        '착륙 뒤에 비행 명령이 있습니다. 기체는 착륙하면 멈춥니다.',
        { where: `${landIndex + 2}번째 명령` },
      ),
    )
  }

  mission.commands.forEach((command, i) => {
    if (!model.commands.includes(command.name)) {
      findings.push(
        finding(
          'DRONE_UNSUPPORTED_COMMAND',
          `${model.label} 는 ${command.name} 명령을 지원하지 않습니다.`,
          { where: `${i + 1}번째 명령` },
        ),
      )
    }
    const isMove = ['forward', 'back', 'left', 'right', 'up', 'down'].includes(command.name)
    if (isMove && (command.value < model.step_cm[0] || command.value > model.step_cm[1])) {
      findings.push(
        finding(
          'DRONE_STEP_TOO_LARGE',
          `${i + 1}번째 명령의 이동량 ${command.value}cm 가 ${model.label} 의 범위(${model.step_cm[0]}~${model.step_cm[1]}cm) 밖입니다.`,
          { where: `${i + 1}번째 명령`, measured: command.value, limit: model.step_cm[1] },
        ),
      )
    }
  })

  // ── 공간 ──────────────────────────────────────────────────────────────────
  if (
    mission.course_cm.x + DRONE_WALL_CLEARANCE_CM * 2 > venue.x ||
    mission.course_cm.y + DRONE_WALL_CLEARANCE_CM * 2 > venue.y
  ) {
    findings.push(
      finding(
        'DRONE_VENUE_TOO_SMALL',
        `비행 구역 ${mission.course_cm.x}×${mission.course_cm.y}cm 에 벽 여유 ${DRONE_WALL_CLEARANCE_CM}cm 를 더하면 ${spec.venue}(${venue.x}×${venue.y}cm)에 들어가지 않습니다.`,
        { measured: mission.course_cm.x + DRONE_WALL_CLEARANCE_CM * 2, limit: venue.x },
      ),
    )
  }

  for (const point of flight.points) {
    if (point.x < 0 || point.y < 0 || point.x > mission.course_cm.x || point.y > mission.course_cm.y) {
      findings.push(
        finding(
          'DRONE_OUT_OF_BOUNDS',
          `경로가 표시 구역(${mission.course_cm.x}×${mission.course_cm.y}cm)을 벗어납니다 — (${round1(point.x)}, ${round1(point.y)}).`,
          { measured: round1(Math.max(point.x, point.y)) },
        ),
      )
      break
    }
  }

  const ceiling = Math.min(venue.z - DRONE_CEILING_MARGIN_CM, model.max_altitude_cm)
  const flying = flight.points.filter((p) => p.z > 0)
  for (const point of flying) {
    if (point.z < DRONE_MIN_ALTITUDE_CM || point.z > ceiling) {
      findings.push(
        finding(
          'DRONE_ALTITUDE_LIMIT',
          `고도 ${round1(point.z)}cm 가 허용 범위(${DRONE_MIN_ALTITUDE_CM}~${ceiling}cm)를 벗어납니다.`,
          { measured: round1(point.z), limit: ceiling },
        ),
      )
      break
    }
  }

  findings.push(...obstacleFindings(flight, mission.obstacles).findings)

  // ── 시간 ──────────────────────────────────────────────────────────────────
  if (model.flight_seconds !== null && flight.seconds > model.flight_seconds) {
    findings.push(
      finding(
        'DRONE_TIME_OVER',
        `1회 비행이 ${round1(flight.seconds)}초로 ${model.label} 의 한 번 비행 한계(${model.flight_seconds}초)를 넘습니다.`,
        { measured: round1(flight.seconds), limit: model.flight_seconds },
      ),
    )
  }

  if (metrics.estimated_minutes > metrics.available_minutes) {
    findings.push(
      finding(
        'DRONE_TIME_OVER',
        `학생 ${spec.student_count}명이 한 번씩 날리면 ${round1(metrics.estimated_minutes)}분이 걸려 가용 시간 ${round1(metrics.available_minutes)}분을 넘습니다. (1회 ${round1(flight.seconds)}초 + 교대 ${DRONE_SWAP_SECONDS}초)`,
        {
          measured: round1(metrics.estimated_minutes),
          limit: round1(metrics.available_minutes),
        },
      ),
    )
  } else if (metrics.estimated_minutes > metrics.available_minutes * TIME_TIGHT_RATIO) {
    findings.push(
      finding(
        'DRONE_TIME_TIGHT',
        `학생 전원이 한 번씩 날리면 ${round1(metrics.estimated_minutes)}분으로 가용 시간에 빠듯합니다. 2인 1조로 묶는 편이 안전합니다.`,
        {
          measured: round1(metrics.estimated_minutes),
          limit: round1(metrics.available_minutes),
        },
      ),
    )
  }

  // ── 실내 flip (warn) ──────────────────────────────────────────────────────
  if (mission.commands.some((c) => c.name === 'flip') && venue.z <= FLIP_MIN_CEILING_CM) {
    findings.push(
      finding(
        'DRONE_FLIP_INDOOR',
        `천장이 ${venue.z}cm 인 ${spec.venue}에서 뒤집기를 하면 기체가 바닥이나 천장에 닿을 수 있습니다.`,
        { measured: venue.z, limit: FLIP_MIN_CEILING_CM },
      ),
    )
  }

  return {
    report: reportOf(findings),
    metrics,
    flight,
    // 안전 문구는 규칙이 넣는다. LLM 이 지우거나 바꿔 쓸 수 없는 자리다 (CLAUDE.md).
    safety_notes: [...DRONE_SAFETY_NOTES],
  }
}
