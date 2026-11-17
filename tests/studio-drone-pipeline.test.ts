import { describe, expect, it } from 'vitest'
import { DRONE_SAFETY_NOTES, MAX_REPAIR_ROUNDS } from '@/lib/studio/constants'
import { DRONE_RECIPES, buildMission, droneCandidates } from '@/lib/studio/drone/course'
import { emitCode } from '@/lib/studio/drone/code'
import { generateDrone, pickModel } from '@/lib/studio/drone/pipeline'
import { simulate } from '@/lib/studio/drone/simulate'
import { validateDrone } from '@/lib/studio/drone/validate'
import { DRONE_MODELS } from '@/lib/studio/constants'
import { isUsable } from '@/types/studio'
import type { StudioSpec } from '@/types/studio'

const spec = (over: Partial<StudioSpec> = {}): StudioSpec => ({
  kind: 'drone',
  grade_band: 'middle',
  student_count: 10,
  duration_minutes: 90,
  venue: '체육관',
  equipment: ['DJI Tello 6대', '프로펠러 가드', '라바콘 4개'],
  topic: '드론 사각 순찰 비행',
  session_id: null,
  ...over,
})

describe('코스 레시피', () => {
  it('목록이 있고 id 가 중복되지 않는다', () => {
    expect(DRONE_RECIPES.length).toBeGreaterThanOrEqual(4)
    const ids = DRONE_RECIPES.map((r) => r.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it.each(DRONE_RECIPES.map((r) => [r.id, r] as const))(
    '%s — 기본 파라미터에서 이륙·착륙이 있고 경로가 구역 안에 있다',
    (_id, recipe) => {
      const mission = buildMission(recipe, recipe.defaults, 'tello')
      expect(mission.commands[0]!.name).toBe('takeoff')
      expect(mission.commands.at(-1)!.name).toBe('land')

      const flight = simulate(mission, DRONE_MODELS[0]!)
      for (const point of flight.points) {
        expect(point.x).toBeGreaterThanOrEqual(0)
        expect(point.y).toBeGreaterThanOrEqual(0)
        expect(point.x).toBeLessThanOrEqual(mission.course_cm.x)
        expect(point.y).toBeLessThanOrEqual(mission.course_cm.y)
      }
    },
  )

  it.each(DRONE_RECIPES.map((r) => [r.id, r] as const))(
    '%s — 체육관 90분·10명 조건에서 error 가 없다',
    (_id, recipe) => {
      const mission = buildMission(recipe, recipe.defaults, 'tello')
      const { report } = validateDrone(mission, spec())
      expect(report.findings.filter((f) => f.severity === 'error')).toEqual([])
    },
  )

  it('초등에는 난이도 3 이상 코스를 후보로 올리지 않는다', () => {
    for (const r of droneCandidates('아무 주제', 'elementary')) {
      expect(r.nominal_difficulty).toBeLessThanOrEqual(2)
    }
  })

  it('주제가 비어도 후보가 비지 않는다', () => {
    expect(droneCandidates('', 'middle').length).toBeGreaterThan(0)
  })
})

describe('기체 선택과 코드', () => {
  it('보유 장비에서 기체를 고른다', () => {
    expect(pickModel(['DJI Tello 6대'])).toBe('tello')
    expect(pickModel(['CoDrone EDU 10대'])).toBe('codrone-edu')
    expect(pickModel(['교육용 시뮬레이터 계정'])).toBe('sim')
  })

  it('Tello 는 실행 가능한 파이썬 코드가 나온다', () => {
    const result = generateDrone(spec())
    expect(result.artifact.code.language).toBe('python')
    expect(result.artifact.code.body).toContain('from djitellopy import Tello')
    expect(result.artifact.code.body).toContain('tello.takeoff()')
    expect(result.artifact.code.body).toContain('tello.land()')
  })

  it('CoDrone 은 블록 의사코드가 나온다 — 없는 라이브러리를 쓰지 않는다', () => {
    const result = generateDrone(spec({ equipment: ['CoDrone EDU 10대'] }))
    expect(result.artifact.code.language).toBe('pseudo')
    expect(result.artifact.code.body).not.toContain('djitellopy')
    expect(result.artifact.code.body).toContain('이륙')
  })

  it('안전 문구 네 줄이 코드 맨 위에 주석으로 붙는다', () => {
    const { code } = generateDrone(spec()).artifact
    for (const note of DRONE_SAFETY_NOTES) expect(code.body).toContain(note)
    const firstCommandLine = code.body.indexOf('tello.takeoff()')
    expect(code.body.indexOf(DRONE_SAFETY_NOTES[0])).toBeLessThan(firstCommandLine)
  })

  it('코스 설치 안내가 줄자로 잴 수 있는 문장이다', () => {
    const { course_setup } = generateDrone(spec({ topic: '게이트 통과 코스' })).artifact
    expect(course_setup.length).toBeGreaterThan(2)
    expect(course_setup[0]).toMatch(/\d+×\d+cm 비행 구역/)
    expect(course_setup.join(' ')).toMatch(/이착륙 지점에서/)
  })

  it('지원하지 않는 명령이 코드에 나오지 않는다', () => {
    const codrone = DRONE_MODELS.find((m) => m.id === 'codrone-edu')!
    for (const recipe of DRONE_RECIPES) {
      const mission = buildMission(recipe, recipe.defaults, 'codrone-edu')
      const body = emitCode(mission, codrone).body
      expect(body).not.toContain('뒤집기')
    }
  })
})

describe('파이프라인', () => {
  it('체육관 90분은 통과한다', () => {
    const result = generateDrone(spec())
    expect(result.status).toBe('validated')
    expect(isUsable(result.status)).toBe(true)
    expect(result.rounds[0]!.action).toBe('generated')
  })

  it('교실처럼 좁은 곳은 코스를 줄여 맞춘다', () => {
    const result = generateDrone(spec({ venue: '교실', student_count: 6 }))
    if (result.status === 'validated') {
      const repaired = result.rounds.filter((r) => r.action === 'repaired')
      for (const r of repaired) expect(r.repair).toBeTruthy()
      expect(result.report.findings.filter((f) => f.severity === 'error')).toEqual([])
    }
    expect(result.rounds.length).toBeLessThanOrEqual(MAX_REPAIR_ROUNDS + 1)
  })

  it('학생이 너무 많으면 failed 이고 이유가 남는다', () => {
    const result = generateDrone(spec({ student_count: 40, duration_minutes: 45 }))
    expect(result.status).toBe('failed')
    expect(result.report.findings.map((f) => f.code)).toContain('DRONE_TIME_OVER')
  })

  it('장비에 드론이 없으면 고칠 수 없으므로 한 라운드에서 끝낸다', () => {
    const result = generateDrone(spec({ equipment: ['노트북 20대'] }))
    expect(result.status).toBe('failed')
    expect(result.rounds).toHaveLength(1)
    expect(result.report.findings.map((f) => f.code)).toContain('DRONE_EQUIPMENT_MISSING')
  })

  it('통과한 결과는 error 가 하나도 없다 — 조건 조합 전수', () => {
    for (const venue of ['교실', '강당', '체육관', '메이커실'] as const) {
      for (const duration of [45, 90, 120]) {
        for (const students of [6, 12, 20]) {
          const result = generateDrone(spec({ venue, duration_minutes: duration, student_count: students }))
          if (result.status !== 'validated') continue
          expect(
            result.report.findings.filter((f) => f.severity === 'error'),
            `${venue}/${duration}분/${students}명`,
          ).toEqual([])
          expect(result.metrics.estimated_minutes).toBeLessThanOrEqual(
            result.metrics.available_minutes,
          )
        }
      }
    }
  })

  it('같은 입력이면 같은 결과다 (결정론)', () => {
    expect(generateDrone(spec())).toEqual(generateDrone(spec()))
  })
})
