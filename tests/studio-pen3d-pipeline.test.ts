import { describe, expect, it } from 'vitest'
import { MAX_REPAIR_ROUNDS, PEN_SAFETY_NOTES } from '@/lib/studio/constants'
import { generatePen } from '@/lib/studio/pen3d/pipeline'
import { isUsable } from '@/types/studio'
import type { StudioCalibration, StudioSpec } from '@/types/studio'

/**
 * 파이프라인 테스트. 보는 것은 하나다 — **통과하지 못한 산출물이 통과한 것처럼 나오지 않는가**
 * (ADR-030). 그리고 라운드 기록이 강사에게 보여줄 수 있는 형태인가.
 */

const spec = (over: Partial<StudioSpec> = {}): StudioSpec => ({
  kind: 'pen3d',
  grade_band: 'middle',
  student_count: 20,
  duration_minutes: 90,
  venue: '교실',
  equipment: ['3D펜 20자루', 'PLA 필라멘트', '실리콘 매트'],
  topic: '정육면체 조명 만들기',
  session_id: null,
  ...over,
})

describe('정상 경로', () => {
  it('중등 90분 — 통과하고 라운드가 기록된다', () => {
    const result = generatePen(spec())
    expect(result.status).toBe('validated')
    expect(isUsable(result.status)).toBe(true)
    expect(result.rounds.length).toBeGreaterThanOrEqual(1)
    expect(result.rounds[0]!.action).toBe('generated')
    expect(result.rounds[0]!.params).toBeTruthy()
    expect(result.rounds.at(-1)!.ok).toBe(true)
  })

  it('주제 키워드로 레시피가 정해진다 — LLM 없이도', () => {
    expect(generatePen(spec({ topic: '우리 동네 집 모형' })).recipe_id).toBe('house-lamp')
    expect(generatePen(spec({ topic: '드론 프로펠러 모형', grade_band: 'high' })).recipe_id).toBe(
      'drone-frame',
    )
  })

  it('강사·LLM 이 고른 레시피를 그대로 쓴다', () => {
    expect(generatePen(spec(), { recipeId: 'flower-pot' }).recipe_id).toBe('flower-pot')
  })

  it('없는 레시피 id 는 규칙 1순위로 떨어진다 — 던지지 않는다', () => {
    const result = generatePen(spec(), { recipeId: '존재하지-않음' })
    expect(result.recipe_id.length).toBeGreaterThan(0)
    expect(['validated', 'failed']).toContain(result.status)
  })

  it('산출물에 조립 순서·과제·안전 문구가 들어 있다', () => {
    const { artifact } = generatePen(spec())
    expect(artifact.kind).toBe('pen3d')
    expect(artifact.assembly.length).toBeGreaterThan(0)
    expect(artifact.tasks.length).toBeGreaterThanOrEqual(3)
    expect(artifact.safety_notes).toEqual([...PEN_SAFETY_NOTES])
  })

  it('같은 입력이면 같은 결과다 (결정론)', () => {
    expect(generatePen(spec())).toEqual(generatePen(spec()))
  })
})

describe('개선 라운드', () => {
  it('시수가 짧으면 치수·장식을 줄여 맞춘다', () => {
    const result = generatePen(spec({ duration_minutes: 50, grade_band: 'elementary' }))
    // 통과했다면 예상 시간이 가용 시간 안이어야 한다. 통과했다고만 말하고 넘어가지 않는다.
    if (result.status === 'validated') {
      expect(result.metrics.estimated_minutes).toBeLessThanOrEqual(result.metrics.available_minutes)
    }
    expect(result.rounds.length).toBeLessThanOrEqual(MAX_REPAIR_ROUNDS + 1)
  })

  it('개선 라운드는 무엇을 고쳤는지 문장으로 남긴다', () => {
    const result = generatePen(
      spec({ duration_minutes: 40, grade_band: 'elementary', topic: '육각 보관함' }),
      { recipeId: 'hex-box' },
    )
    const repairs = result.rounds.filter((r) => r.action === 'repaired')
    expect(repairs.length).toBeGreaterThan(0)
    for (const r of repairs) {
      expect(r.repair).toBeTruthy()
      expect((r.repair as string).length).toBeGreaterThan(5)
      expect(r.params).toBeTruthy()
    }
  })

  it('개선 횟수 상한을 넘기지 않는다', () => {
    const result = generatePen(
      spec({ duration_minutes: 25, grade_band: 'elementary' }),
      { recipeId: 'drone-frame' },
    )
    expect(result.rounds.length).toBeLessThanOrEqual(MAX_REPAIR_ROUNDS + 1)
  })
})

describe('실패를 숨기지 않는다 (ADR-030)', () => {
  it('시간이 절대 안 되면 failed 이고, 마지막 라운드에 이유가 남는다', () => {
    const result = generatePen(
      spec({ duration_minutes: 25, grade_band: 'elementary' }),
      { recipeId: 'drone-frame' },
    )
    expect(result.status).toBe('failed')
    expect(isUsable(result.status)).toBe(false)
    expect(result.rounds.at(-1)!.findings.some((f) => f.severity === 'error')).toBe(true)
  })

  it('failed 여도 산출물과 지표는 돌려준다 — 화면이 이유를 보여줘야 한다', () => {
    const result = generatePen(
      spec({ duration_minutes: 25, grade_band: 'elementary' }),
      { recipeId: 'drone-frame' },
    )
    expect(result.artifact.pattern.parts.length).toBeGreaterThan(0)
    expect(result.metrics.estimated_minutes).toBeGreaterThan(0)
  })

  it('status 가 validated 면 마지막 라운드가 ok 이고, failed 면 ok 가 아니다', () => {
    for (const duration of [25, 35, 45, 60, 90, 150]) {
      for (const band of ['elementary', 'middle', 'high'] as const) {
        const result = generatePen(spec({ duration_minutes: duration, grade_band: band }))
        expect(result.status === 'validated').toBe(result.rounds.at(-1)!.ok)
      }
    }
  })

  it('통과한 산출물은 error 가 하나도 없다 — 전 조건 조합에서', () => {
    for (const duration of [30, 45, 50, 90, 180]) {
      for (const band of ['elementary', 'middle', 'high'] as const) {
        for (const topic of ['이름 키링', '정육면체 조명', '우리 동네 집', '꽃', '드론']) {
          const result = generatePen(spec({ duration_minutes: duration, grade_band: band, topic }))
          if (result.status !== 'validated') continue
          const errors = result.report.findings.filter((f) => f.severity === 'error')
          expect(errors, `${topic}/${band}/${duration}분`).toEqual([])
          expect(result.metrics.estimated_minutes).toBeLessThanOrEqual(
            result.metrics.available_minutes,
          )
          expect(result.metrics.page_fit).toBe(true)
        }
      }
    }
  })

  it('장비가 없으면 고칠 수 없으므로 한 라운드에서 끝낸다', () => {
    const result = generatePen(spec({ equipment: ['노트북'] }))
    expect(result.status).toBe('failed')
    expect(result.rounds).toHaveLength(1)
    expect(result.report.findings.map((f) => f.code)).toContain('PEN_EQUIPMENT_MISSING')
  })
})

describe('성과 피드백 보정 (ADR-032)', () => {
  const calibration = (over: Partial<StudioCalibration> = {}): StudioCalibration => ({
    recipe_id: 'cube-lantern',
    grade_band: 'middle',
    sample_count: 4,
    speed_factor: 1.5,
    lower_difficulty: false,
    ...over,
  })

  it('실제로 더 오래 걸린 레시피는 예상 시간이 늘어난다', () => {
    const base = generatePen(spec({ duration_minutes: 90 }), { recipeId: 'cube-lantern' })
    const corrected = generatePen(spec({ duration_minutes: 90 }), {
      recipeId: 'cube-lantern',
      calibration: calibration(),
    })
    expect(corrected.metrics.estimated_minutes).toBeGreaterThan(base.metrics.estimated_minutes)
  })

  it('too_hard 과반이면 난이도 상한을 한 단계 낮춰 후보를 고른다', () => {
    const normal = generatePen(spec({ grade_band: 'middle', topic: '십자 끼움 장식' }))
    const lowered = generatePen(spec({ grade_band: 'middle', topic: '십자 끼움 장식' }), {
      calibration: calibration({ lower_difficulty: true, recipe_id: 'cross-sphere' }),
    })
    expect(normal.recipe_id).toBe('cross-sphere')
    expect(lowered.recipe_id).not.toBe('cross-sphere')
  })
})
