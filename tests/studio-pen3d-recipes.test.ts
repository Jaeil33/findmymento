import { describe, expect, it } from 'vitest'
import { PEN_RECIPES, buildPattern, recipeById, recipeCandidates } from '@/lib/studio/pen3d/recipes'
import {
  featureEdges,
  interiorAngles,
  isClosedPath,
  minGap,
  sizeOf,
  strokeLength,
  strokesBBox,
} from '@/lib/studio/geometry'
import { PAGE_USABLE, PEN_LIMITS } from '@/lib/studio/constants'

/**
 * 레시피는 **좌표를 만드는 유일한 주체**다 (ADR-029). 그래서 여기서 보는 것은
 * "모양이 예쁜가"가 아니라 "조립될 수 있는 물건인가"다.
 */

describe('레시피 목록', () => {
  it('비어 있지 않고 id 가 중복되지 않는다', () => {
    expect(PEN_RECIPES.length).toBeGreaterThanOrEqual(6)
    const ids = PEN_RECIPES.map((r) => r.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('모든 레시피에 주제 키워드와 설명이 있다', () => {
    for (const r of PEN_RECIPES) {
      expect(r.keywords.length).toBeGreaterThan(0)
      expect(r.summary.length).toBeGreaterThan(10)
      expect(r.nominal_difficulty).toBeGreaterThanOrEqual(1)
      expect(r.nominal_difficulty).toBeLessThanOrEqual(5)
    }
  })

  it('recipeById — 없는 id 는 null 이다', () => {
    expect(recipeById(PEN_RECIPES[0]!.id)?.id).toBe(PEN_RECIPES[0]!.id)
    expect(recipeById('없는-레시피')).toBeNull()
  })
})

describe.each(PEN_RECIPES.map((r) => [r.id, r] as const))('레시피 %s', (_id, recipe) => {
  const pattern = buildPattern(recipe, recipe.defaults)

  it('부품이 있고 수량이 1 이상이다', () => {
    expect(pattern.parts.length).toBeGreaterThan(0)
    for (const part of pattern.parts) {
      expect(part.quantity).toBeGreaterThanOrEqual(1)
      expect(part.strokes.length).toBeGreaterThan(0)
      expect(part.name.length).toBeGreaterThan(0)
    }
  })

  it('부품 id 가 중복되지 않는다', () => {
    const ids = pattern.parts.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('모든 윤곽선이 닫혀 있다 — 열린 윤곽은 떼어낼 때 분해된다', () => {
    for (const part of pattern.parts) {
      for (const stroke of part.strokes) {
        if (stroke.kind !== 'outline') continue
        expect(isClosedPath(stroke, 0.1), `${part.id} 의 윤곽이 열려 있다`).toBe(true)
      }
    }
  })

  it('부품 좌표가 (0,0) 기준으로 정규화돼 있고 크기가 양수다', () => {
    for (const part of pattern.parts) {
      const box = strokesBBox(part.strokes)
      expect(box.min.x).toBeCloseTo(0, 6)
      expect(box.min.y).toBeCloseTo(0, 6)
      const size = sizeOf(box)
      expect(size.w).toBeGreaterThan(0)
      expect(size.h).toBeGreaterThan(0)
    }
  })

  it('고유 부품 하나하나가 A4 사용 영역에 들어간다', () => {
    for (const part of pattern.parts) {
      const size = sizeOf(strokesBBox(part.strokes))
      expect(size.w).toBeLessThanOrEqual(PAGE_USABLE.width_mm)
      expect(size.h).toBeLessThanOrEqual(PAGE_USABLE.height_mm)
    }
  })

  it('접합이 있고 양쪽 부품이 모두 존재한다', () => {
    expect(pattern.joints.length).toBeGreaterThan(0)
    const ids = new Set(pattern.parts.map((p) => p.id))
    for (const joint of pattern.joints) {
      expect(ids.has(joint.a), `${joint.id} 의 a=${joint.a} 부품이 없다`).toBe(true)
      expect(ids.has(joint.b), `${joint.id} 의 b=${joint.b} 부품이 없다`).toBe(true)
      expect(joint.count).toBeGreaterThanOrEqual(1)
      expect(joint.how.length).toBeGreaterThan(5)
      if (joint.kind === 'weld') expect(joint.length_mm).toBeGreaterThan(0)
      if (joint.kind === 'slot') {
        expect(joint.tab_thickness_mm).toBeGreaterThan(0)
        expect(joint.slot_width_mm).toBeGreaterThan(joint.tab_thickness_mm as number)
      }
    }
  })

  it('모든 부품이 접합에 한 번은 등장한다 — 조립되지 않는 부품을 만들지 않는다', () => {
    const joined = new Set(pattern.joints.flatMap((j) => [j.a, j.b]))
    for (const part of pattern.parts) {
      expect(joined.has(part.id), `${part.id} 가 어떤 접합에도 없다`).toBe(true)
    }
  })

  it('꼭짓점이 과하게 뾰족하지 않다 (15도 이상)', () => {
    for (const part of pattern.parts) {
      for (const stroke of part.strokes) {
        const angles = interiorAngles(stroke)
        if (angles.length === 0) continue
        expect(Math.min(...angles), `${part.id}`).toBeGreaterThan(15)
      }
    }
  })

  it('선 길이가 0 인 부품이 없다', () => {
    for (const part of pattern.parts) {
      const total = part.strokes.reduce((sum, s) => sum + strokeLength(s), 0)
      expect(total).toBeGreaterThan(10)
    }
  })

  it('같은 파라미터면 같은 좌표다 (결정론)', () => {
    expect(buildPattern(recipe, recipe.defaults)).toEqual(pattern)
  })

  it('size 를 키우면 선 길이도 커진다', () => {
    const bigger = buildPattern(recipe, { ...recipe.defaults, size: recipe.defaults.size * 1.2 })
    const len = (p: typeof pattern) =>
      p.parts.reduce(
        (sum, part) => sum + part.strokes.reduce((s, st) => s + strokeLength(st), 0) * part.quantity,
        0,
      )
    expect(len(bigger)).toBeGreaterThan(len(pattern))
  })

  it('scale 이 패턴에 기록된다', () => {
    expect(pattern.recipe_id).toBe(recipe.id)
    expect(pattern.scale).toBeGreaterThan(0)
  })
})

describe('최소 치수에서도 고칠 수 있는 레시피인가', () => {
  /**
   * 치수를 가장 작게 잡았을 때 **가장 빡빡한 학년 임계값**(초등: 간격 4mm · 선분 8mm)을
   * 만족해야 한다. 치수에 비례하지 않는 고정 값이 임계값보다 작으면, 개선 라운드가 도안을
   * 키워도 그 값은 그대로여서 레시피가 영구히 실패한다 — 꽃 줄기 폭 6mm 가 그랬다.
   */
  it.each(PEN_RECIPES.map((r) => [r.id, r] as const))('%s', (_id, recipe) => {
    const strictGap = Math.max(
      ...(['elementary', 'middle', 'high'] as const).map((b) => PEN_LIMITS[b].min_gap_mm),
    )
    const strictSegment = Math.max(
      ...(['elementary', 'middle', 'high'] as const).map((b) => PEN_LIMITS[b].min_segment_mm),
    )
    const small = buildPattern(recipe, { ...recipe.defaults, size: recipe.size_range[0] })

    for (const part of small.parts) {
      const gap = minGap(part.strokes, { pathSkip: Math.max(10, strictGap * 3) })
      expect(gap, `${part.id} 간격`).toBeGreaterThanOrEqual(strictGap)
      for (const stroke of part.strokes) {
        for (const edge of featureEdges(stroke)) {
          expect(edge, `${part.id} 선분`).toBeGreaterThanOrEqual(strictSegment)
        }
      }
    }
  })
})

describe('후보 추리기 — 규칙이 정하고 LLM 은 이 목록 밖으로 나갈 수 없다', () => {
  it('주제 키워드가 맞으면 앞으로 온다', () => {
    const cands = recipeCandidates('우리 동네 랜드마크 타워 만들기', 'middle')
    expect(cands.length).toBeGreaterThan(0)
    expect(cands[0]!.keywords.some((k) => '우리 동네 랜드마크 타워 만들기'.includes(k))).toBe(true)
  })

  it('초등에는 난이도 3 이상 레시피를 후보로 올리지 않는다', () => {
    for (const r of recipeCandidates('아무 주제', 'elementary')) {
      expect(r.nominal_difficulty).toBeLessThanOrEqual(2)
    }
  })

  it('주제가 비어도 후보가 비지 않는다 — 빈 화면을 보여주지 않는다', () => {
    expect(recipeCandidates('', 'middle').length).toBeGreaterThan(0)
    expect(recipeCandidates('', 'high').length).toBeGreaterThan(0)
    expect(recipeCandidates('', 'elementary').length).toBeGreaterThan(0)
  })

  it('같은 입력이면 같은 순서다', () => {
    expect(recipeCandidates('드론', 'high')).toEqual(recipeCandidates('드론', 'high'))
  })
})

describe('모양을 알아볼 수 있을 만큼 구체적인가', () => {
  /**
   * 윤곽만 있는 도안은 교실에서 "네모 몇 장"으로 보인다. 장식 단계(`detail`)는 그 차이를
   * 메우는 선이다 — 다만 **시간이 모자라면 개선 라운드가 가장 먼저 떼는 것**도 이 선이므로,
   * 끈 상태에서도 조립이 되는 모양이어야 한다.
   */
  const strokeCount = (recipeId: string, partId: string, detail: number) => {
    const recipe = recipeById(recipeId)!
    const pattern = buildPattern(recipe, { ...recipe.defaults, detail })
    return pattern.parts.find((p) => p.id === partId)?.strokes.length ?? 0
  }

  it('집 모형은 앞뒤 벽에 문을, 측면 벽에 창을 그린다', () => {
    expect(strokeCount('house-lamp', 'gable', 1)).toBeGreaterThan(
      strokeCount('house-lamp', 'gable', 0),
    )
    expect(strokeCount('house-lamp', 'wall', 1)).toBeGreaterThan(
      strokeCount('house-lamp', 'wall', 0),
    )
  })

  it('이름 키링은 이름 쓸 자리를 선으로 표시한다', () => {
    expect(strokeCount('name-keyring', 'plate', 1)).toBeGreaterThan(
      strokeCount('name-keyring', 'plate', 0),
    )
  })

  it('장식을 끄면 윤곽만 남는다 — 개선 라운드가 떼어낼 수 있어야 한다', () => {
    for (const [id, partId] of [
      ['house-lamp', 'gable'],
      ['house-lamp', 'wall'],
      ['name-keyring', 'plate'],
      ['cube-lantern', 'panel'],
    ] as const) {
      expect(strokeCount(id, partId, 0), `${id}/${partId}`).toBe(1)
    }
  })
})

/**
 * 탑 레시피 — 강사가 "에펠탑 만들기"를 넣었을 때 **탑이 나와야 한다.**
 *
 * 레시피에 탑이 없던 동안에는 조각 조합으로 떨어져서 받침판 위에 막대 4개를 겹쳐 붙이는
 * 도안이 나왔다. 조립해도 탑이 서지 않는 물건이다.
 */
describe('탑 주제', () => {
  const tower = recipeById('lattice-tower')!

  it.each(['에펠탑 만들기', '남산타워 모형', '우리 동네 시계탑', '송전탑'])(
    '"%s" 의 1순위 후보가 탑 레시피다',
    (topic) => {
      expect(recipeCandidates(topic, 'middle')[0]!.id).toBe('lattice-tower')
    },
  )

  it('초등에도 후보로 올라간다 — 탑은 초등 주제이기도 하다', () => {
    expect(recipeCandidates('에펠탑 만들기', 'elementary')[0]!.id).toBe('lattice-tower')
  })

  it('탑 면이 위로 좁아진다 — 테이퍼가 없으면 탑으로 보이지 않는다', () => {
    const pattern = buildPattern(tower, tower.defaults)
    const leg = pattern.parts.find((p) => p.id === 'leg')!
    expect(leg.quantity).toBe(4)

    const outlineStroke = leg.strokes[0]!
    const ys = outlineStroke.points.map((p) => p.y)
    const top = Math.min(...ys)
    const bottom = Math.max(...ys)
    const widthAt = (y: number) => {
      const xs = outlineStroke.points.filter((p) => Math.abs(p.y - y) < 0.01).map((p) => p.x)
      return Math.max(...xs) - Math.min(...xs)
    }
    expect(widthAt(top)).toBeLessThan(widthAt(bottom) * 0.5)
    // 위아래가 뒤집히면 탑이 아니라 깔때기다.
    expect(bottom - top).toBeGreaterThan(widthAt(bottom))
  })

  it('꼭대기에 전망대와 첨탑이 올라간다', () => {
    const pattern = buildPattern(tower, tower.defaults)
    expect(pattern.parts.map((p) => p.id)).toEqual(
      expect.arrayContaining(['leg', 'deck', 'spire']),
    )
  })

  it('장식을 끄면 탑 면이 윤곽만 남는다 — 개선 라운드가 아치를 떼어낼 수 있어야 한다', () => {
    const plain = buildPattern(tower, { ...tower.defaults, detail: 0 })
    expect(plain.parts.find((p) => p.id === 'leg')!.strokes).toHaveLength(1)
    const arched = buildPattern(tower, { ...tower.defaults, detail: 1 })
    expect(arched.parts.find((p) => p.id === 'leg')!.strokes).toHaveLength(2)
  })

  it('선택 부품은 바닥판이다 — 부품 수가 넘치면 이것부터 빠진다', () => {
    const withBase = buildPattern(tower, { ...tower.defaults, extras: true })
    const without = buildPattern(tower, { ...tower.defaults, extras: false })
    expect(withBase.parts.find((p) => p.id === 'base')?.optional).toBe(true)
    expect(without.parts.find((p) => p.id === 'base')).toBeUndefined()
  })
})
