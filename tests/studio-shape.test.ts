import { describe, expect, it } from 'vitest'
import { parseShape, shapeRecipe } from '@/lib/studio/pen3d/shape'
import { buildPattern } from '@/lib/studio/pen3d/recipes'
import { validatePen } from '@/lib/studio/pen3d/validate'
import {
  LAYER_COUNT,
  PEN_LIMITS,
  SHAPE_POINTS,
  SHAPE_POINTS_TOLERATED,
} from '@/lib/studio/constants'
import { isClosedPath } from '@/lib/studio/geometry'
import { GRADE_BANDS } from '@/types/domain'
import type { GradeBand } from '@/types/domain'
import type { StudioSpec } from '@/types/studio'

/**
 * 모양 IR — **LLM 이 윤곽을 비율로 제안하고 코드가 mm 를 만든다** (ADR-036).
 *
 * 여기서 보는 것은 "모양이 예쁜가"가 아니다. 모델이 무엇을 보내든
 * ① 범위 밖이면 통째로 버리는가 ② 받아들인 모양이 **세 학년대 임계값을 전부 만족하는가**다.
 * 임계값을 낮추는 선택지는 없으므로(CLAUDE.md), 보정이 못 하면 그 모양은 실패해야 한다.
 */

// ── 제안 만들기 (정규화 좌표 0~1) ───────────────────────────────────────────

const ring = (divisions: number, radius: (t: number) => number) =>
  Array.from({ length: divisions }, (_, i) => {
    const t = (2 * Math.PI * i) / divisions
    const r = radius(t)
    return { x: 0.5 + r * Math.cos(t), y: 0.5 + r * Math.sin(t) }
  })

/** 둥근 몸통. 가장 쉬운 입력 */
const blob = () => ring(28, (t) => 0.42 + 0.06 * Math.sin(3 * t))

/** 별 — 꼭짓점 내각이 20도다. 어느 학년대 임계값보다 뾰족하니 보정이 둥글려야 한다 */
const star = () =>
  Array.from({ length: 20 }, (_, i) => {
    const t = (2 * Math.PI * i) / 20
    const r = i % 2 === 0 ? 0.48 : 0.18
    return { x: 0.5 + r * Math.cos(t), y: 0.5 + r * Math.sin(t) }
  })

/** 톱니 — 아주 짧은 선분이 잔뜩이다. 보정이 이어 붙여야 한다 */
const jagged = () => ring(64, (t) => 0.44 + 0.015 * Math.sin(13 * t))

const proposal = (over: Record<string, unknown> = {}) => ({
  title: '코끼리',
  silhouette: blob(),
  details: [ring(16, () => 0.08).map((p) => ({ x: p.x - 0.12, y: p.y - 0.14 }))],
  holes: [],
  hanger: false,
  ...over,
})

function spec(grade_band: GradeBand, over: Partial<StudioSpec> = {}): StudioSpec {
  return {
    kind: 'pen3d',
    grade_band,
    student_count: 20,
    duration_minutes: 90,
    venue: '교실',
    equipment: ['3D펜 20자루', 'PLA 필라멘트', '실리콘 매트'],
    topic: '코끼리',
    session_id: null,
    form: 'flat',
    ...over,
  }
}

const parse = (raw: unknown) => parseShape(raw, { word: '코끼리', source: 'dsl' })

// ── 1. 받아들일 것과 버릴 것 ────────────────────────────────────────────────

describe('parseShape — 범위 밖은 통째로 버린다', () => {
  it('정상 제안을 받아들인다', () => {
    const shape = parse(proposal())
    expect(shape).not.toBeNull()
    expect(shape!.source).toBe('dsl')
    expect(shape!.reviewed).toBe(false)
    expect(shape!.id.startsWith('dsl-')).toBe(true)
    // 같은 제안은 같은 id — 재현 가능해야 한다
    expect(parse(proposal())!.id).toBe(shape!.id)
  })

  /**
   * 조금 벗어난 것은 **끌어당겨** 쓴다 — 모양은 바로 뒤에서 bbox 로 다시 정규화되므로 치수의
   * 결정권은 그대로 코드에 있다. 0.02 만큼 넘긴 응답 하나 때문에 강사가 실패 화면을 보면 안 된다.
   * 많이 벗어난 것은 지시를 무시한 응답이므로 버린다.
   */
  it('좌표가 살짝 벗어나면 당겨 쓰고, 많이 벗어나면 null', () => {
    const nudged = parse(proposal({ silhouette: blob().map((p) => ({ x: p.x, y: p.y - 0.05 })) }))
    expect(nudged).not.toBeNull()
    expect(nudged!.silhouette.points.every((p) => p.x >= 0 && p.y >= 0)).toBe(true)

    expect(parse(proposal({ silhouette: ring(20, () => 0.8) }))).toBeNull()
    expect(parse(proposal({ silhouette: ring(20, () => 2) }))).toBeNull()
  })

  it('점이 모자라면 null, 많으면 솎아서 받고, 터무니없이 많으면 null', () => {
    expect(parse(proposal({ silhouette: ring(SHAPE_POINTS[0] - 1, () => 0.4) }))).toBeNull()

    const dense = parse(proposal({ silhouette: ring(SHAPE_POINTS[1] + 40, () => 0.4) }))
    expect(dense).not.toBeNull()
    expect(dense!.silhouette.points.length).toBeLessThanOrEqual(SHAPE_POINTS[1])

    expect(
      parse(proposal({ silhouette: ring(SHAPE_POINTS_TOLERATED + 10, () => 0.4) })),
    ).toBeNull()
  })

  it('숫자가 아닌 값·빠진 값이면 null', () => {
    expect(parse(proposal({ silhouette: [{ x: 0.5, y: 'a' }, ...blob()] }))).toBeNull()
    expect(parse(proposal({ silhouette: [{ x: Number.NaN, y: 0.5 }, ...blob()] }))).toBeNull()
    expect(parse(proposal({ silhouette: undefined }))).toBeNull()
    expect(parse(null)).toBeNull()
    expect(parse('코끼리')).toBeNull()
  })

  it('제목이 없거나 너무 길면 단어를 쓴다 — 문장 하나 때문에 모양을 버리지 않는다', () => {
    expect(parse(proposal({ title: '' }))?.title).toBe('코끼리')
    expect(parse(proposal({ title: '가'.repeat(41) }))?.title).toBe('코끼리')
  })

  /**
   * 내부선은 **있으면 더 좋은 것**이다. 표기가 어긋나거나 개수가 많다고 실루엣까지 버리면,
   * 눈·귀 선 하나 때문에 도안을 못 만든다 — 운영에서 2D 가 실패한 원인이 이것이었다.
   */
  it('내부선·구멍이 상한을 넘으면 앞에서 상한까지만 쓴다 (모양은 살린다)', () => {
    const one = ring(12, () => 0.05).map((p) => ({ x: p.x - 0.1, y: p.y - 0.1 }))
    const many = parse(proposal({ details: Array.from({ length: 9 }, () => one) }))
    expect(many).not.toBeNull()
    expect(many!.details.length).toBeLessThanOrEqual(6)
  })

  it('읽을 수 없는 내부선은 그 선만 버린다', () => {
    const shape = parse(proposal({ details: [...proposal().details, 'eyes', [{ x: 'a' }]] }))
    expect(shape).not.toBeNull()
    expect(shape!.details.length).toBe(1)
  })

  it('내부선을 {points:[...]} 로 감싸 보내도 받는다', () => {
    const wrapped = { points: proposal().details[0] }
    const shape = parse(proposal({ details: [wrapped] }))
    expect(shape!.details.length).toBe(1)
  })

  it('스스로 교차하는 윤곽은 고치지 않고 버린다', () => {
    const bow = [
      { x: 0.1, y: 0.1 },
      { x: 0.9, y: 0.9 },
      { x: 0.9, y: 0.1 },
      { x: 0.1, y: 0.9 },
      { x: 0.2, y: 0.5 },
      { x: 0.3, y: 0.2 },
      { x: 0.7, y: 0.2 },
      { x: 0.8, y: 0.5 },
    ]
    expect(parse(proposal({ silhouette: bow }))).toBeNull()
  })

  it('닫히지 않은 윤곽은 닫아서 받는다', () => {
    const open = blob()
    const shape = parse(proposal({ silhouette: [...open, { ...open[0]! }] }))
    expect(shape).not.toBeNull()
    expect(shape!.silhouette.closed).toBe(true)
  })

  it('실루엣 밖으로 나간 내부선은 그 선만 버린다 (모양은 살린다)', () => {
    const outside = ring(12, () => 0.04).map((p) => ({ x: 0.97, y: 0.97 }))
    const shape = parse(proposal({ details: [...proposal().details, outside] }))
    expect(shape).not.toBeNull()
    expect(shape!.details.length).toBe(1)
  })
})

// ── 2. 2D 실루엣 ────────────────────────────────────────────────────────────

const errorsOf = (shape: ReturnType<typeof parse>, s: StudioSpec, form: 'flat' | 'solid') => {
  const recipe = shapeRecipe(shape!, { form, grade_band: s.grade_band })
  const pattern = buildPattern(recipe, recipe.defaults)
  const { report, metrics } = validatePen(pattern, s)
  return { recipe, pattern, metrics, errors: report.findings.filter((f) => f.severity === 'error') }
}

describe('2D 실루엣 (ADR-037)', () => {
  it('부품 1종이고 접합이 없다 — 조립하지 않는 산출물이다', () => {
    const { pattern } = errorsOf(parse(proposal()), spec('middle'), 'flat')
    expect(pattern.parts.length).toBe(1)
    expect(pattern.parts[0]!.quantity).toBe(1)
    expect(pattern.joints.length).toBe(0)
  })

  it('고리가 필요하다고 하면 고리 부품과 접합 1곳이 생긴다', () => {
    const { pattern } = errorsOf(parse(proposal({ hanger: true })), spec('middle'), 'flat')
    expect(pattern.parts.length).toBe(2)
    expect(pattern.joints.length).toBe(1)
  })

  it('윤곽이 닫혀 있다 — 열린 윤곽은 떼어낼 때 분해된다', () => {
    const { pattern } = errorsOf(parse(proposal()), spec('elementary'), 'flat')
    for (const stroke of pattern.parts[0]!.strokes) {
      expect(isClosedPath(stroke, 0.1)).toBe(true)
    }
  })

  it.each(GRADE_BANDS)('%s — 둥근 모양이 검증을 통과한다', (band) => {
    const { errors } = errorsOf(parse(proposal()), spec(band), 'flat')
    expect(errors).toEqual([])
  })

  it.each(GRADE_BANDS)('%s — 뾰족한 별도 보정 후 통과한다', (band) => {
    const { errors, metrics } = errorsOf(
      parse(proposal({ silhouette: star(), details: [] })),
      spec(band),
      'flat',
    )
    expect(errors).toEqual([])
    expect(metrics.min_angle_deg!).toBeGreaterThanOrEqual(PEN_LIMITS[band].min_angle_deg)
  })

  it.each(GRADE_BANDS)('%s — 톱니(짧은 선분)도 보정 후 통과한다', (band) => {
    const { errors, metrics } = errorsOf(
      parse(proposal({ silhouette: jagged(), details: [] })),
      spec(band),
      'flat',
    )
    expect(errors).toEqual([])
    expect(metrics.min_segment_mm!).toBeGreaterThanOrEqual(PEN_LIMITS[band].min_segment_mm)
  })

  it('detail 0 이면 내부선이 사라진다 — 간격이 모자랄 때 모양보다 먼저 깎인다', () => {
    const shape = parse(proposal())!
    const recipe = shapeRecipe(shape, { form: 'flat', grade_band: 'middle' })
    const withDetail = buildPattern(recipe, { ...recipe.defaults, detail: 1 })
    const without = buildPattern(recipe, { ...recipe.defaults, detail: 0 })
    expect(withDetail.parts[0]!.strokes.length).toBeGreaterThan(without.parts[0]!.strokes.length)
    expect(without.parts[0]!.strokes.length).toBe(1)
  })

  it('치수를 바꿔도 임계값을 지킨다 — size_range 양 끝에서 검증한다', () => {
    const shape = parse(proposal())!
    const recipe = shapeRecipe(shape, { form: 'flat', grade_band: 'elementary' })
    for (const size of recipe.size_range) {
      const { report } = validatePen(
        buildPattern(recipe, { ...recipe.defaults, size }),
        spec('elementary'),
      )
      expect(report.findings.filter((f) => f.severity === 'error')).toEqual([])
    }
  })
})

// ── 3. 3D 적층 ──────────────────────────────────────────────────────────────

describe('3D 적층 (ADR-037)', () => {
  it.each(GRADE_BANDS)('%s — 층 수가 학년대 값이고 층간 접합이 N−1 곳이다', (band) => {
    const { pattern } = errorsOf(parse(proposal()), spec(band, { form: 'solid' }), 'solid')
    const layer = pattern.parts.find((p) => p.id === 'layer')!
    expect(layer.quantity).toBe(LAYER_COUNT[band])
    const stack = pattern.joints.find((j) => j.a === 'layer' && j.b === 'layer')!
    expect(stack.count).toBe(LAYER_COUNT[band] - 1)
  })

  it('인쇄되는 고유 부품은 실루엣 한 종이다 — A4 한 장 제약이 유지된다', () => {
    const { pattern, metrics } = errorsOf(parse(proposal()), spec('middle', { form: 'solid' }), 'solid')
    const unique = pattern.parts.filter((p) => !p.optional)
    expect(unique.length).toBe(1)
    expect(metrics.part_count).toBeGreaterThan(metrics.unique_part_count)
    expect(metrics.page_fit).toBe(true)
  })

  it('측면 띠는 선택 부품이다 — extras 를 끄면 빠진다', () => {
    const shape = parse(proposal())!
    const recipe = shapeRecipe(shape, { form: 'solid', grade_band: 'high' })
    const on = buildPattern(recipe, { ...recipe.defaults, extras: true })
    const off = buildPattern(recipe, { ...recipe.defaults, extras: false })
    expect(on.parts.some((p) => p.optional)).toBe(true)
    expect(off.parts.some((p) => p.optional)).toBe(false)
    expect(off.joints.every((j) => j.a === 'layer' && j.b === 'layer')).toBe(true)
  })

  it.each(GRADE_BANDS)('%s — 적층이 검증을 통과한다', (band) => {
    const { errors } = errorsOf(parse(proposal()), spec(band, { form: 'solid' }), 'solid')
    expect(errors).toEqual([])
  })
})

// ── 4. 재현 가능성 ──────────────────────────────────────────────────────────

describe('결정론', () => {
  it('같은 모양·같은 파라미터면 좌표가 같다 — 강사에게 같은 도안을 다시 줄 수 있어야 한다', () => {
    const shape = parse(proposal())!
    const a = shapeRecipe(shape, { form: 'flat', grade_band: 'middle' })
    const b = shapeRecipe(shape, { form: 'flat', grade_band: 'middle' })
    expect(JSON.stringify(buildPattern(a, a.defaults))).toBe(
      JSON.stringify(buildPattern(b, b.defaults)),
    )
  })

  it('아틀라스 모양은 검수됨으로 들어온다', () => {
    const shape = parseShape(proposal(), {
      word: '코끼리',
      source: 'atlas',
      id: 'atlas-elephant',
      words: ['코끼리', '아기코끼리'],
    })
    expect(shape!.reviewed).toBe(true)
    expect(shape!.id).toBe('atlas-elephant')
    const recipe = shapeRecipe(shape!, { form: 'flat', grade_band: 'middle' })
    expect(recipe.keywords).toContain('아기코끼리')
  })
})

/**
 * 저장된 아틀라스 항목을 **다시 읽는** 경로 (ADR-036).
 *
 * 아틀라스는 `parseShape` 가 정규화한 값 그대로 저장한다 — 그 공간은 **"가로를 1 로"** 맞춘
 * 공간이고, 세로는 종횡비가 보존되므로 **1 을 넘는다** (`readShape` 의 `map`: 둘 다 `width` 로
 * 나눈다). 연필의 세로는 3.5 가 정상이다.
 *
 * 그런데 입력 파서의 좌표 상한은 **LLM 응답 기준(0~1)** 이다. 저장된 항목을 그 자로 다시 재면
 * 세로로 긴 실루엣이 통째로 버려진다 — 검수를 통과해 아틀라스에 들어간 모양이 조회 시점에
 * 사라진다. 두 공간은 자가 다르다.
 *
 * LLM 쪽 자는 그대로 둔다. 범위 밖 좌표를 통째로 버리는 것은 ADR-036 의 경계다.
 */
describe('저장된 아틀라스 항목 다시 읽기 — 세로로 긴 모양', () => {
  /** 가로 1 · 세로 `aspect` 인 둥근 직사각형. 아틀라스에 저장되는 바로 그 공간이다. */
  const tall = (aspect: number) => ({
    title: '연필',
    silhouette: [
      { x: 0.2, y: 0 },
      { x: 0.5, y: 0 },
      { x: 0.8, y: 0 },
      { x: 1, y: aspect * 0.05 },
      { x: 1, y: aspect * 0.5 },
      { x: 1, y: aspect * 0.95 },
      { x: 0.8, y: aspect },
      { x: 0.5, y: aspect },
      { x: 0.2, y: aspect },
      { x: 0, y: aspect * 0.95 },
      { x: 0, y: aspect * 0.5 },
      { x: 0, y: aspect * 0.05 },
    ],
    details: [],
    holes: [],
    hanger: false,
  })

  const asAtlas = { word: '연필', source: 'atlas' as const, id: 'atlas-연필', words: ['연필'] }
  const asDsl = { word: '연필', source: 'dsl' as const }

  it('아틀라스 항목은 세로가 1 을 넘어도 다시 읽힌다', () => {
    const shape = parseShape(tall(3.5), asAtlas)
    expect(shape).not.toBeNull()
    // 읽고 난 모양은 다시 "가로 1" 공간이므로 종횡비가 그대로 살아 있어야 한다.
    const ys = shape!.silhouette.points.map((p) => p.y)
    expect(Math.max(...ys)).toBeGreaterThan(3)
  })

  it('LLM 제안은 0~1 을 크게 벗어나면 그대로 버린다 — 이 경계는 그대로다 (ADR-036)', () => {
    expect(parseShape(tall(3.5), asDsl)).toBeNull()
  })

  it('종횡비 상한을 넘으면 아틀라스라도 버린다 — 임계값을 늘려서 통과시키지 않는다', () => {
    expect(parseShape(tall(6), asAtlas)).toBeNull()
  })

  it('가로가 1 을 넘는 항목은 아틀라스라도 버린다 — 가로는 언제나 0~1 이다', () => {
    const wide = tall(1.5)
    wide.silhouette = wide.silhouette.map((p) => ({ x: p.x * 2, y: p.y }))
    expect(parseShape(wide, asAtlas)).toBeNull()
  })
})
