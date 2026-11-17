/**
 * 비행 명령을 **적분해서 실제 경로를 만든다.**
 *
 * 검증이 "대충 괜찮아 보인다"가 아니라 선분-장애물 최단거리로 판정하려면, 먼저 명령이
 * 기체를 어디로 보내는지를 알아야 한다. 이 파일이 그 계산이다.
 *
 * 좌표계: 비행 구역 왼쪽 위가 원점, x 가로 · y 세로 · z 고도 (cm).
 * 기수(yaw)는 0도가 +x 방향이고 `cw` 가 +y 쪽으로 돈다 — 전진은 **바라보는 방향**이다.
 * 이걸 빼먹으면 회전이 든 코스의 경로가 전부 틀린다.
 */

import {
  DRONE_LAND_SECONDS,
  DRONE_SPEED_CM_S,
  DRONE_TAKEOFF_ALTITUDE_CM,
  DRONE_TAKEOFF_SECONDS,
  DRONE_YAW_DEG_S,
  type DroneModel,
} from '@/lib/studio/constants'
import type { DroneCommand, DroneMission } from '@/types/studio'

export type FlightPoint = { x: number; y: number; z: number }
export type FlightSegment = { a: FlightPoint; b: FlightPoint; command: number }

export type Flight = {
  points: FlightPoint[]
  /** 위치가 바뀐 구간만. 호버·회전은 구간을 만들지 않는다 */
  segments: FlightSegment[]
  seconds: number
  path_cm: number
  max_altitude_cm: number
  /** 경로 외곽 크기 */
  footprint_cm: { x: number; y: number }
  /** 각 명령이 끝난 뒤의 위치. 화면에서 명령과 좌표를 나란히 보여줄 때 쓴다 */
  after: FlightPoint[]
}

const rad = (deg: number) => (deg * Math.PI) / 180
const round = (n: number) => Math.round(n * 1e6) / 1e6

/** 한 명령이 소비하는 시간(초). 이동은 거리/속도, 회전은 각도/각속도다. */
export function commandSeconds(command: DroneCommand): number {
  switch (command.name) {
    case 'takeoff':
      return DRONE_TAKEOFF_SECONDS
    case 'land':
      return DRONE_LAND_SECONDS
    case 'hover':
      return command.value
    case 'cw':
    case 'ccw':
      return command.value / DRONE_YAW_DEG_S
    case 'flip':
      // 뒤집기는 한 동작이고 그 사이 기체가 크게 떨어진다. 2초로 본다.
      return 2
    default:
      return command.value / DRONE_SPEED_CM_S
  }
}

export function simulate(mission: DroneMission, model: DroneModel): Flight {
  let x = mission.takeoff_cm.x
  let y = mission.takeoff_cm.y
  let z = 0
  let yaw = 0
  let seconds = 0
  let path = 0

  const points: FlightPoint[] = [{ x, y, z }]
  const segments: FlightSegment[] = []
  const after: FlightPoint[] = []

  mission.commands.forEach((command, index) => {
    const from: FlightPoint = { x, y, z }
    const distance = command.value

    switch (command.name) {
      case 'takeoff':
        // 기체 상한이 기본 이륙 고도보다 낮으면 그 높이까지만 올라간다.
        z = Math.min(DRONE_TAKEOFF_ALTITUDE_CM, model.max_altitude_cm)
        break
      case 'land':
        z = 0
        break
      case 'up':
        z += distance
        break
      case 'down':
        z -= distance
        break
      case 'forward':
        x += distance * Math.cos(rad(yaw))
        y += distance * Math.sin(rad(yaw))
        break
      case 'back':
        x -= distance * Math.cos(rad(yaw))
        y -= distance * Math.sin(rad(yaw))
        break
      case 'right':
        x += distance * Math.cos(rad(yaw + 90))
        y += distance * Math.sin(rad(yaw + 90))
        break
      case 'left':
        x += distance * Math.cos(rad(yaw - 90))
        y += distance * Math.sin(rad(yaw - 90))
        break
      case 'cw':
        yaw += distance
        break
      case 'ccw':
        yaw -= distance
        break
      case 'hover':
      case 'flip':
        break
    }

    x = round(x)
    y = round(y)
    z = round(z)
    seconds += commandSeconds(command)

    const to: FlightPoint = { x, y, z }
    const moved = to.x !== from.x || to.y !== from.y || to.z !== from.z
    if (moved) {
      points.push(to)
      segments.push({ a: from, b: to, command: index })
      path += Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z)
    }
    after.push(to)
  })

  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)

  return {
    points,
    segments,
    seconds: round(seconds),
    path_cm: round(path),
    max_altitude_cm: Math.max(...points.map((p) => p.z)),
    footprint_cm: {
      x: round(Math.max(...xs) - Math.min(...xs)),
      y: round(Math.max(...ys) - Math.min(...ys)),
    },
    after,
  }
}
