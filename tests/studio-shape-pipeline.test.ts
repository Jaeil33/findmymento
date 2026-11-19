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

  /**
   * **2D 는 빈손으로 끝나지 않는다** (ADR-042). 임계값을 면제해서 통과시키는 것이 아니라,
   * 인쇄해서 수업이 되는 **다른 물건**(이름 명패)을 주는 것이다.
   */
  it('모양이 없으면 명패로 떨어진다 — 실패 화면을 주지 않는다', () => {
    const result = generatePen(spec('middle'), {})

    expect(result.status).not.toBe('failed')
    expect(isUsable(result.status)).toBe(true)

    const codes = result.report.findings.map((f) => f.code)
    expect(codes).toContain('PEN_SHAPE_FALLBACK')
    expect(codes).not.toContain('PEN_SHAPE_UNAVAILABLE')

    // 물리 검증을 면제하지 않는다 — 명패도 error 가 하나도 없어야 쓸 수 있다
    expect(result.report.findings.filter((f) => f.severity === 'error')).toEqual([])

    // 인쇄할 것이 실제로 있다
    expect(result.artifact.pattern.parts.length).toBeGreaterThan(0)
  })

  it('명패는 결정론이다 — 같은 주제면 같은 색이다', () => {
    const a = generatePen(spec('middle'), {})
    const b = generatePen(spec('middle'), {})
    const colorsOf = (r: ReturnType<typeof generatePen>) =>
      r.artifact.pattern.parts.flatMap((p) => p.art.map((region) => region.color))
    expect(colorsOf(a)).toEqual(colorsOf(b))
    expect(colorsOf(a).length).toBeGreaterThan(0)
  })

  it('고지 문구가 요청한 모양이 아니라는 사실을 말한다', () => {
    const result = generatePen(spec('middle'), {})
    const notice = result.report.findings.find((f) => f.code === 'PEN_SHAPE_FALLBACK')!
    expect(notice.severity).toBe('warn')
    expect(notice.message).toContain('찾지 못해')
  })
})

describe('3D 적층 생성', () => {
  it.each(['elementary', 'middle', 'high'] as GradeBand[])('%s — 층 수가 학년대 값이다', (band) => {
    const result = generatePen(spec(band, { form: 'solid' }), { shape: shape() })
    expect(result.status).toBe('validated')
    const layer = result.artifact.pattern.parts.find((p) => p.id === 'layer')!
    expect(layer.quantity).toBe(LAYER_COUNT[band])
  })

  /**
   * 24분인 이유: 1라운드 치수가 종이에서 역산되고(ADR-045) 시간이 모자라면 **치수를 먼저**
   * 줄여 맞춘다. 25분이면 층 3장을 그대로 두고 치수만 줄여 통과한다 — 그쪽이 작품을 덜
   * 망친다. 층을 줄여야만 들어가는 구간이 이 값이다.
   */
  it('시간이 모자라면 층 수를 줄여서 통과시킨다 — 임계값은 건드리지 않는다', () => {
    const result = generatePen(spec('elementary', { form: 'solid', duration_minutes: 24 }), {
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
