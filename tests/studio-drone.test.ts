import { describe, expect, it } from 'vitest'
import {
  DRONE_LAND_SECONDS,
  DRONE_MODELS,
  DRONE_SPEED_CM_S,
  DRONE_TAKEOFF_ALTITUDE_CM,
  DRONE_TAKEOFF_SECONDS,
  VENUE_DIMENSIONS,
} from '@/lib/studio/constants'
import { simulate } from '@/lib/studio/drone/simulate'
import { validateDrone } from '@/lib/studio/drone/validate'
import type { DroneCommand, DroneMission, StudioSpec } from '@/types/studio'

/**
 * 드론 비행 코드. 3D펜과 같은 원칙이다 — **경로를 적분해서 실제로 재 본다.**
 * "대충 괜찮아 보인다"가 아니라 선분-장애물 최단거리를 계산한다.
 */

const tello = DRONE_MODELS.find((m) => m.id === 'tello')!

const spec = (over: Partial<StudioSpec> = {}): StudioSpec => ({
  kind: 'drone',
  grade_band: 'middle',
  student_count: 10,
  duration_minutes: 90,
  venue: '체육관',
  equipment: ['DJI Tello 6대', '프로펠러 가드', '라바콘 4개'],
  topic: '드론 코딩 — 사각 순찰',
  session_id: null,
  ...over,
})

const mission = (over: Partial<DroneMission> = {}): DroneMission => ({
  recipe_id: 'test',
  title: '테스트 비행',
  model_id: 'tello',
  course_cm: { x: 400, y: 300 },
  takeoff_cm: { x: 50, y: 150 },
  commands: [
    { name: 'takeoff', value: 0 },
    { name: 'forward', value: 200 },
    { name: 'land', value: 0 },
  ],
  obstacles: [],
  ...over,
})

describe('시뮬레이터 — 명령을 적분해 실제 경로를 만든다', () => {
  it('이륙하면 기본 고도로 올라간다', () => {
    const result = simulate(mission({ commands: [{ name: 'takeoff', value: 0 }] }), tello)
    expect(result.points.at(-1)).toEqual({ x: 50, y: 150, z: DRONE_TAKEOFF_ALTITUDE_CM })
    expect(result.seconds).toBe(DRONE_TAKEOFF_SECONDS)
  })

  it('전진은 바라보는 방향으로 간다', () => {
    const result = simulate(mission(), tello)
    expect(result.points.at(-1)).toEqual({ x: 250, y: 150, z: 0 })
    expect(result.seconds).toBe(DRONE_TAKEOFF_SECONDS + 200 / DRONE_SPEED_CM_S + DRONE_LAND_SECONDS)
  })

  it('cw 90도를 돌면 전진 방향이 바뀐다', () => {
    const commands: DroneCommand[] = [
      { name: 'takeoff', value: 0 },
      { name: 'cw', value: 90 },
      { name: 'forward', value: 100 },
    ]
    const last = simulate(mission({ commands }), tello).points.at(-1)!
    expect(last.x).toBeCloseTo(50, 6)
    expect(last.y).toBeCloseTo(250, 6)
  })

  it('좌우 이동은 바라보는 방향의 직각이다', () => {
    const commands: DroneCommand[] = [
      { name: 'takeoff', value: 0 },
      { name: 'right', value: 100 },
    ]
    const last = simulate(mission({ commands }), tello).points.at(-1)!
    expect(last.x).toBeCloseTo(50, 6)
    expect(last.y).toBeCloseTo(250, 6)
  })

  it('고도 명령과 호버가 시간에 반영된다', () => {
    const commands: DroneCommand[] = [
      { name: 'takeoff', value: 0 },
      { name: 'up', value: 50 },
      { name: 'hover', value: 3 },
      { name: 'land', value: 0 },
    ]
    const result = simulate(mission({ commands }), tello)
    expect(result.max_altitude_cm).toBe(DRONE_TAKEOFF_ALTITUDE_CM + 50)
    expect(result.seconds).toBe(DRONE_TAKEOFF_SECONDS + 1 + 3 + DRONE_LAND_SECONDS)
  })

  it('경로 길이와 외곽 크기를 잰다', () => {
    const commands: DroneCommand[] = [
      { name: 'takeoff', value: 0 },
      { name: 'forward', value: 100 },
      { name: 'cw', value: 90 },
      { name: 'forward', value: 50 },
      { name: 'land', value: 0 },
    ]
    const result = simulate(mission({ commands }), tello)
    // 이륙 100 + 수평 150 + 착륙 100. 고도 변화도 경로다 — 배터리는 올라갈 때 가장 많이 쓴다.
    expect(result.path_cm).toBe(350)
    expect(result.footprint_cm.x).toBeCloseTo(100, 6)
    expect(result.footprint_cm.y).toBeCloseTo(50, 6)
  })

  it('같은 입력이면 같은 경로다 (결정론)', () => {
    expect(simulate(mission(), tello)).toEqual(simulate(mission(), tello))
  })
})

describe('검증 — 통과 사례', () => {
  it('체육관에서 도는 사각 순찰은 통과한다', () => {
    const commands: DroneCommand[] = [
      { name: 'takeoff', value: 0 },
      ...Array.from({ length: 4 }, () => [
        { name: 'forward' as const, value: 150 },
        { name: 'cw' as const, value: 90 },
      ]).flat(),
      { name: 'land', value: 0 },
    ]
    const { report } = validateDrone(
      mission({ commands, course_cm: { x: 400, y: 400 }, takeoff_cm: { x: 100, y: 100 } }),
      spec(),
    )
    expect(report.findings.filter((f) => f.severity === 'error')).toEqual([])
    expect(report.ok).toBe(true)
  })
})

describe('검증 — 네거티브', () => {
  const codes = (m: DroneMission, s = spec()) =>
    validateDrone(m, s).report.findings.map((f) => f.code)

  it('기체가 장비 목록에 없으면 DRONE_EQUIPMENT_MISSING', () => {
    expect(codes(mission(), spec({ equipment: ['노트북'] }))).toContain('DRONE_EQUIPMENT_MISSING')
  })

  it('이륙·착륙이 없으면 각각 잡는다', () => {
    expect(codes(mission({ commands: [{ name: 'forward', value: 100 }] }))).toContain(
      'DRONE_NO_TAKEOFF',
    )
    expect(
      codes(
        mission({
          commands: [
            { name: 'takeoff', value: 0 },
            { name: 'forward', value: 100 },
          ],
        }),
      ),
    ).toContain('DRONE_NO_LAND')
  })

  it('착륙 뒤의 비행 명령은 DRONE_COMMAND_AFTER_LAND', () => {
    const commands: DroneCommand[] = [
      { name: 'takeoff', value: 0 },
      { name: 'land', value: 0 },
      { name: 'forward', value: 100 },
    ]
    expect(codes(mission({ commands }))).toContain('DRONE_COMMAND_AFTER_LAND')
  })

  it('기체가 지원하지 않는 명령은 DRONE_UNSUPPORTED_COMMAND', () => {
    const commands: DroneCommand[] = [
      { name: 'takeoff', value: 0 },
      { name: 'flip', value: 0 },
      { name: 'land', value: 0 },
    ]
    expect(
      codes(mission({ commands, model_id: 'codrone-edu' }), spec({ equipment: ['CoDrone EDU 6대'] })),
    ).toContain('DRONE_UNSUPPORTED_COMMAND')
  })

  it('코스가 장소에 들어가지 않으면 DRONE_VENUE_TOO_SMALL', () => {
    const big = mission({ course_cm: { x: 900, y: 600 } })
    expect(codes(big, spec({ venue: '교실' }))).toContain('DRONE_VENUE_TOO_SMALL')
    expect(VENUE_DIMENSIONS['교실'].x).toBeLessThan(900 + 100)
  })

  it('경로가 표시 구역을 벗어나면 DRONE_OUT_OF_BOUNDS', () => {
    const commands: DroneCommand[] = [
      { name: 'takeoff', value: 0 },
      { name: 'forward', value: 500 },
      { name: 'land', value: 0 },
    ]
    expect(codes(mission({ commands }))).toContain('DRONE_OUT_OF_BOUNDS')
  })

  it('천장·기체 상한을 넘는 고도는 DRONE_ALTITUDE_LIMIT', () => {
    const commands: DroneCommand[] = [
      { name: 'takeoff', value: 0 },
      { name: 'up', value: 250 },
      { name: 'land', value: 0 },
    ]
    expect(codes(mission({ commands }))).toContain('DRONE_ALTITUDE_LIMIT')
  })

  it('장애물에 너무 가까이 지나가면 DRONE_OBSTACLE_CLEARANCE', () => {
    const commands: DroneCommand[] = [
      { name: 'takeoff', value: 0 },
      { name: 'forward', value: 200 },
      { name: 'land', value: 0 },
    ]
    const withCone = mission({
      commands,
      // 비행 고도(100cm)보다 높은 슬라럼 폴. 60cm 짜리 콘이라면 그 위로 지나가므로 걸리지 않는다.
      obstacles: [{ id: 'c1', kind: 'cone', x: 150, y: 170, height_cm: 150 }],
    })
    expect(codes(withCone)).toContain('DRONE_OBSTACLE_CLEARANCE')
  })

  it('게이트는 개구부 안으로 지나가면 통과한다 — 벽과 같은 여유를 요구하지 않는다', () => {
    const commands: DroneCommand[] = [
      { name: 'takeoff', value: 0 },
      { name: 'forward', value: 200 },
      { name: 'land', value: 0 },
    ]
    const gate = mission({
      commands,
      obstacles: [
        { id: 'g1', kind: 'gate', x: 150, y: 150, height_cm: 60, opening_w_cm: 90, opening_h_cm: 80 },
      ],
    })
    expect(codes(gate)).not.toContain('DRONE_OBSTACLE_CLEARANCE')
  })

  it('게이트 기둥을 스치면 잡는다', () => {
    const commands: DroneCommand[] = [
      { name: 'takeoff', value: 0 },
      { name: 'forward', value: 200 },
      { name: 'land', value: 0 },
    ]
    const gate = mission({
      commands,
      obstacles: [
        // 개구부 중심이 경로에서 40cm 옆이다. 폭 90 의 절반이 45 이므로 기둥 바로 옆을 스친다.
        { id: 'g1', kind: 'gate', x: 150, y: 110, height_cm: 60, opening_w_cm: 90, opening_h_cm: 80 },
      ],
    })
    expect(codes(gate)).toContain('DRONE_OBSTACLE_CLEARANCE')
  })

  it('한 명령 이동량이 기체 범위 밖이면 DRONE_STEP_TOO_LARGE', () => {
    const commands: DroneCommand[] = [
      { name: 'takeoff', value: 0 },
      { name: 'forward', value: 10 },
      { name: 'land', value: 0 },
    ]
    expect(codes(mission({ commands }))).toContain('DRONE_STEP_TOO_LARGE')
  })

  it('학생 수 × 비행 시간이 수업을 넘으면 DRONE_TIME_OVER', () => {
    expect(codes(mission(), spec({ student_count: 40, duration_minutes: 50 }))).toContain(
      'DRONE_TIME_OVER',
    )
  })

  it('1회 비행이 배터리를 넘으면 DRONE_TIME_OVER', () => {
    const long: DroneCommand[] = [
      { name: 'takeoff', value: 0 },
      ...Array.from({ length: 30 }, () => ({ name: 'hover' as const, value: 10 })),
      { name: 'land', value: 0 },
    ]
    expect(codes(mission({ commands: long }), spec({ student_count: 1 }))).toContain(
      'DRONE_TIME_OVER',
    )
  })

  it('천장이 낮은 곳의 flip 은 warn 이고 ok 를 깨지 않는다', () => {
    const commands: DroneCommand[] = [
      { name: 'takeoff', value: 0 },
      { name: 'forward', value: 100 },
      { name: 'flip', value: 0 },
      { name: 'land', value: 0 },
    ]
    const { report } = validateDrone(
      mission({ commands, course_cm: { x: 300, y: 300 }, takeoff_cm: { x: 50, y: 150 } }),
      // 천장 250cm 인 컴퓨터실. 교실(260cm)은 기준을 넘지 않아 경고가 나오지 않는다.
      spec({ venue: '컴퓨터실', equipment: ['DJI Tello 4대'], student_count: 4 }),
    )
    const flip = report.findings.find((f) => f.code === 'DRONE_FLIP_INDOOR')
    expect(flip?.severity).toBe('warn')
  })

  it('안전 문구 네 줄이 결과에 항상 들어간다', () => {
    const { safety_notes } = validateDrone(mission(), spec())
    expect(safety_notes).toHaveLength(4)
    expect(safety_notes[0]).toContain('사람 위로')
  })
})
