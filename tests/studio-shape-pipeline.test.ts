import { describe, expect, it } from 'vitest'
import { generatePen } from '@/lib/studio/pen3d/pipeline'
import { parseShape } from '@/lib/studio/pen3d/shape'
import { LAYER_COUNT } from '@/lib/studio/constants'
import { isUsable } from '@/types/studio'
import type { GradeBand } from '@/types/domain'
import type { StudioSpec } from '@/types/studio'

/**
 * 모양이 파이프라인에 붙었을 때 — **개선 라운드가 그대로 돌아야 한다** (ADR-030·036·037).
 *
 * 모양은 레시피와 같은 형태로 들어오므로, 파이프라인이 "이게 아틀라스인지 제안인지"를
 * 알 필요가 없다. 여기서 보는 것은 모드 분기와 적층 개선(층 수 줄이기)뿐이다.
 */

const blob = () =>
  Array.from({ length: 28 }, (_, i) => {
    const t = (2 * Math.PI * i) / 28
    const r = 0.42 + 0.06 * Math.sin(3 * t)
    return { x: 0.5 + r * Math.cos(t), y: 0.5 + r * Math.sin(t) }
  })

const shape = (over: Record<string, unknown> = {}) =>
  parseShape(
    { title: '코끼리', silhouette: blob(), details: [], holes: [], hanger: false, ...over },
    { word: '코끼리', source: 'dsl' },
  )!

function spec(grade_band: GradeBand, over: Partial<StudioSpec> = {}): StudioSpec {
  return {
    kind: 'pen3d',
    grade_band,
    student_count: 20,
    duration_minutes: 90,
    venue: '교실',
    equipment: ['3D펜 20자루', 'PLA 필라멘트'],
    topic: '코끼리',
    session_id: null,
    form: 'flat',
    ...over,
  }
}

describe('2D 생성', () => {
  it('모양이 있으면 통과하고 라운드가 기록된다', () => {
    const result = generatePen(spec('middle'), { shape: shape() })
    expect(result.status).toBe('validated')
    expect(result.rounds[0]!.action).toBe('generated')
    expect(result.artifact.pattern.joints).toEqual([])
    expect(isUsable(result.status)).toBe(true)
  })

  it('조립 순서와 과제 문장이 2D 용이다 — 붙일 곳이 없다고 쓰지 않는다', () => {
    const result = generatePen(spec('middle'), { shape: shape() })
    const text = [...result.artifact.assembly, ...result.artifact.tasks].join(' ')
    expect(text).not.toContain('0곳')
    expect(result.artifact.assembly.some((s) => s.includes('떼어'))).toBe(true)
  })

  it('2D 요청에는 입체 레시피를 쓰지 않는다 — 강사가 고른 레시피도 무시한다', () => {
    const result = generatePen(spec('middle'), { shape: shape(), recipeId: 'cube-lantern' })
    expect(result.recipe_id).not.toBe('cube-lantern')
    expect(result.artifact.pattern.parts.length).toBe(1)
  })

  it('모양이 없으면 실패로 끝낸다 — 입체 도안을 2D 라고 내보내지 않는다', () => {
    const result = generatePen(spec('middle'), {})
    expect(result.status).toBe('failed')
    expect(isUsable(result.status)).toBe(false)
    expect(result.report.findings.map((f) => f.code)).toContain('PEN_SHAPE_UNAVAILABLE')
    // 실패 화면이 무엇을 바꾸면 되는지 말해야 한다 (ADR-030)
    expect(result.report.findings[0]!.message.length).toBeGreaterThan(10)
  })
})

describe('3D 적층 생성', () => {
  it.each(['elementary', 'middle', 'high'] as GradeBand[])('%s — 층 수가 학년대 값이다', (band) => {
    const result = generatePen(spec(band, { form: 'solid' }), { shape: shape() })
    expect(result.status).toBe('validated')
    const layer = result.artifact.pattern.parts.find((p) => p.id === 'layer')!
    expect(layer.quantity).toBe(LAYER_COUNT[band])
  })

  it('시간이 모자라면 층 수를 줄여서 통과시킨다 — 임계값은 건드리지 않는다', () => {
    const result = generatePen(spec('elementary', { form: 'solid', duration_minutes: 25 }), {
      shape: shape(),
    })
    expect(result.status).toBe('validated')
    const layer = result.artifact.pattern.parts.find((p) => p.id === 'layer')!
    expect(layer.quantity).toBeLessThan(LAYER_COUNT.elementary)
    expect(result.rounds.some((r) => (r.repair ?? '').includes('층'))).toBe(true)
    // 줄인 층 수와 접합 수가 어긋나면 조립되지 않는다
    const stack = result.artifact.pattern.joints.find((j) => j.a === 'layer')!
    expect(stack.count).toBe(layer.quantity - 1)
  })

  it('그래도 안 되면 실패로 끝낸다 — 통과시키려고 층을 1장으로 만들지 않는다', () => {
    const result = generatePen(spec('elementary', { form: 'solid', duration_minutes: 21 }), {
      shape: shape(),
    })
    const layer = result.artifact.pattern.parts.find((p) => p.id === 'layer')
    if (result.status === 'failed') {
      expect(result.report.findings.some((f) => f.severity === 'error')).toBe(true)
    }
    expect(layer!.quantity).toBeGreaterThanOrEqual(2)
  })
})

describe('기존 경로는 그대로다 (ADR-028)', () => {
  it('form 이 없는 spec 은 입체로 읽고 레시피를 쓴다', () => {
    const legacy = { ...spec('middle'), form: undefined }
    const result = generatePen(legacy, { recipeId: 'cube-lantern' })
    expect(result.recipe_id).toBe('cube-lantern')
    expect(result.artifact.pattern.joints.length).toBeGreaterThan(0)
  })
})
