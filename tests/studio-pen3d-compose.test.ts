import { describe, expect, it } from 'vitest'
import { COMPOSE_MAX_PIECES, COMPOSE_MIN_PIECE_MM, PEN_LIMITS } from '@/lib/studio/constants'
import { compositionRecipe, parseComposition } from '@/lib/studio/pen3d/compose'
import { buildPattern } from '@/lib/studio/pen3d/recipes'
import { featureEdges, minGap, sizeOf, strokesBBox } from '@/lib/studio/geometry'

/**
 * 조합 (ADR-034).
 *
 * LLM 은 **검수된 조각 목록에서 고르고 비율만** 제안한다. mm·좌표·접합 규격은 여기서 정한다.
 * 그래서 여기서 보는 것은 두 가지다:
 * 1. 목록·범위 밖의 제안은 **통째로 버린다** (레시피 선택과 같은 방어다 — ADR-029)
 * 2. 받아들인 제안도 숫자는 우리가 만든다 — 비율이 아무리 작아도 조각이 임계값 아래로 내려가지 않는다
 */

const fish = {
  title: '물고기',
  base: 'oval-body',
  parts: [
    { piece: 'tail-trapezoid', ratio: 0.5, quantity: 1, attach: 'back' },
    { piece: 'fin-triangle', ratio: 0.35, quantity: 2, attach: 'top' },
  ],
}

describe('제안을 받아들이는 기준', () => {
  it('목록 안 조각 + 범위 안 비율이면 받아들인다', () => {
    const parsed = parseComposition(fish)
    expect(parsed).not.toBeNull()
    expect(parsed!.base).toBe('oval-body')
    expect(parsed!.parts).toHaveLength(2)
  })

  it('목록 밖 조각이 하나라도 있으면 통째로 버린다 — 지시를 무시한 응답이다', () => {
    expect(parseComposition({ ...fish, base: 'pikachu-body' })).toBeNull()
    expect(
      parseComposition({
        ...fish,
        parts: [...fish.parts, { piece: 'lightning-bolt', ratio: 0.4, quantity: 1, attach: 'top' }],
      }),
    ).toBeNull()
  })

  it('몸통이 될 수 없는 조각을 몸통으로 쓰면 버린다', () => {
    expect(parseComposition({ ...fish, base: 'fin-triangle' })).toBeNull()
  })

  it('붙이는 조각이 하나도 없으면 버린다 — 조합할 것이 없으면 레시피를 쓴다', () => {
    expect(parseComposition({ ...fish, parts: [] })).toBeNull()
  })

  it('조각 종류가 상한을 넘으면 버린다', () => {
    const many = Array.from({ length: COMPOSE_MAX_PIECES + 1 }, () => ({
      piece: 'fin-triangle',
      ratio: 0.3,
      quantity: 1,
      attach: 'top',
    }))
    expect(parseComposition({ ...fish, parts: many })).toBeNull()
  })

  it('비율·수량이 범위 밖이면 버린다 — 임의의 숫자를 받지 않는다', () => {
    for (const bad of [0, -1, 2.5, Number.NaN]) {
      expect(parseComposition({ ...fish, parts: [{ ...fish.parts[0], ratio: bad }] })).toBeNull()
    }
    for (const bad of [0, 9, 1.5]) {
      expect(parseComposition({ ...fish, parts: [{ ...fish.parts[0], quantity: bad }] })).toBeNull()
    }
  })

  it('제목이 비어 있거나 과하게 길면 버린다', () => {
    expect(parseComposition({ ...fish, title: '' })).toBeNull()
    expect(parseComposition({ ...fish, title: 'ㄱ'.repeat(60) })).toBeNull()
  })

  it('요청이 객체가 아니면 버린다', () => {
    for (const bad of [null, undefined, 'fish', 42, []]) {
      expect(parseComposition(bad)).toBeNull()
    }
  })
})

describe('숫자는 우리가 정한다', () => {
  const recipe = compositionRecipe(parseComposition(fish)!)

  it('조합도 레시피처럼 동작한다 — 기존 파이프라인이 그대로 쓴다', () => {
    expect(recipe.id.startsWith('composed')).toBe(true)
    expect(recipe.title).toBe('물고기')
    expect(recipe.size_range[0]).toBeLessThan(recipe.size_range[1])
    expect(recipe.defaults.size).toBeGreaterThanOrEqual(recipe.size_range[0])
    expect(recipe.defaults.size).toBeLessThanOrEqual(recipe.size_range[1])
  })

  it('가장 작은 비율로 제안해도 조각은 하한 아래로 내려가지 않는다', () => {
    const tiny = compositionRecipe(
      parseComposition({ ...fish, parts: [{ ...fish.parts[0], ratio: 0.12 }] })!,
    )
    const pattern = buildPattern(tiny, { ...tiny.defaults, size: tiny.size_range[0] })
    for (const part of pattern.parts) {
      const size = sizeOf(strokesBBox(part.strokes))
      expect(Math.max(size.w, size.h), part.id).toBeGreaterThanOrEqual(COMPOSE_MIN_PIECE_MM)
    }
  })

  it('가장 작은 치수에서도 가장 빡빡한 학년 기준을 통과한다', () => {
    const pattern = buildPattern(recipe, { ...recipe.defaults, size: recipe.size_range[0] })
    const strictGap = PEN_LIMITS.elementary.min_gap_mm
    const strictSegment = PEN_LIMITS.elementary.min_segment_mm
    for (const part of pattern.parts) {
      expect(minGap(part.strokes, { pathSkip: 12 }), part.id).toBeGreaterThanOrEqual(strictGap)
      for (const stroke of part.strokes) {
        for (const edge of featureEdges(stroke)) {
          expect(edge, part.id).toBeGreaterThanOrEqual(strictSegment)
        }
      }
    }
  })

  it('붙이는 조각마다 접합이 생기고 몸통과 이어진다 — 조립되지 않는 부품을 만들지 않는다', () => {
    const pattern = buildPattern(recipe, recipe.defaults)
    const ids = new Set(pattern.parts.map((p) => p.id))
    expect(pattern.joints.length).toBeGreaterThanOrEqual(pattern.parts.length - 1)
    for (const joint of pattern.joints) {
      expect(ids.has(joint.a)).toBe(true)
      expect(ids.has(joint.b)).toBe(true)
      expect(joint.how.length).toBeGreaterThan(5)
    }
    for (const part of pattern.parts) {
      expect(
        pattern.joints.some((j) => j.a === part.id || j.b === part.id),
        part.id,
      ).toBe(true)
    }
  })

  it('장식을 끄면 선이 줄고, 선택 부품을 끄면 부품이 줄어든다 — 개선 라운드가 쓸 손잡이다', () => {
    const withExtras = compositionRecipe(
      parseComposition({
        ...fish,
        parts: [...fish.parts, { piece: 'ring-hoop', ratio: 0.3, quantity: 1, attach: 'top', optional: true }],
      })!,
    )
    const on = buildPattern(withExtras, { ...withExtras.defaults, extras: true, detail: 1 })
    const off = buildPattern(withExtras, { ...withExtras.defaults, extras: false, detail: 0 })
    expect(off.parts.length).toBeLessThan(on.parts.length)
    const strokesOf = (p: ReturnType<typeof buildPattern>) =>
      p.parts.reduce((s, part) => s + part.strokes.length, 0)
    expect(strokesOf(off)).toBeLessThan(strokesOf(on))
  })

  it('같은 제안이면 같은 좌표다 (결정론)', () => {
    const a = buildPattern(compositionRecipe(parseComposition(fish)!), { size: 60, detail: 1, extras: true })
    const b = buildPattern(compositionRecipe(parseComposition(fish)!), { size: 60, detail: 1, extras: true })
    expect(a).toEqual(b)
  })
})
