/**
 * 색 영역이 **종이까지 도달하는가** (ADR-039).
 *
 * `art` 를 타입에만 더하고 렌더에 잇지 않으면 아무것도 바뀌지 않는다. 이 파일이 고정하는 것:
 *   ① hex 는 팔레트에서만 온다 — 모델이 준 이름이 아무리 이상해도
 *   ② 색이 **먼저** 깔리고 덧그릴 선이 그 위에 온다
 *   ③ 구멍은 `fill-rule="evenodd"` 로 빠진다 — 흰 도형으로 덮지 않는다
 *   ④ 색 영역이 칸 크기에 반영된다 (배치기와 렌더가 같은 박스를 본다)
 *   ⑤ `art: []` 면 지금까지와 같은 흑백 도안이다
 */

import { describe, expect, it } from 'vitest'
import { hexFor, snapColor, DEFAULT_COLOR, PALETTE } from '@/lib/studio/palette'
import { partBox, partCell } from '@/lib/studio/pen3d/label'
import { rectPoints } from '@/lib/studio/geometry'
import type { PartArt, PenPart, Point, Stroke } from '@/types/studio'

const outline = (points: Point[]): Stroke => ({ kind: 'outline', points, closed: true })

function mkPart(art: PartArt[]): PenPart {
  return {
    id: 'body',
    name: '몸통',
    quantity: 1,
    strokes: [outline(rectPoints(40, 30))],
    art,
    origin: { x: 0, y: 0 },
    optional: false,
  }
}

function shifted(points: Point[], dx: number, dy: number): Point[] {
  return points.map((p) => ({ x: p.x + dx, y: p.y + dy }))
}

describe('팔레트 — hex 의 결정권은 코드에 있다', () => {
  it('목록 안의 이름은 그 색이 된다', () => {
    expect(snapColor('주황')).toBe('주황')
    expect(hexFor('주황')).toBe(PALETTE.주황)
  })

  it('"초록색" · "진한 초록" 처럼 꾸며 써도 같은 색으로 스냅된다', () => {
    expect(snapColor('초록색')).toBe('초록')
    expect(snapColor('진한 초록')).toBe('초록')
  })

  it('영어 이름도 받는다 — 받아주지 않으면 그 영역이 통째로 회색이 된다', () => {
    expect(snapColor('orange')).toBe('주황')
    expect(snapColor('navy')).toBe('남색')
  })

  it('목록 밖이면 기본색이다 — 모델이 hex 를 보내도 팔레트를 벗어나지 못한다', () => {
    expect(snapColor('#ff8a3d')).toBe(DEFAULT_COLOR)
    expect(snapColor('형광 네온 뿅뿅')).toBe(DEFAULT_COLOR)
    expect(snapColor(null)).toBe(DEFAULT_COLOR)
    expect(snapColor(42)).toBe(DEFAULT_COLOR)
  })

  it('모든 팔레트 이름에 hex 가 있다 — 빠진 이름이 있으면 그 색이 투명해진다', () => {
    for (const name of Object.keys(PALETTE)) {
      expect(PALETTE[name as keyof typeof PALETTE]).toMatch(/^#[0-9a-f]{6}$/)
    }
  })
})

describe('칸 크기 — 배치기와 렌더가 같은 박스를 본다', () => {
  it('색 영역이 윤곽보다 크면 칸도 커진다', () => {
    const bare = partCell(mkPart([]))
    const wide = partCell(
      mkPart([{ outline: rectPoints(60, 30), holes: [], color: '주황', z: 0 }]),
    )
    expect(wide.shape.w).toBeGreaterThan(bare.shape.w)
    expect(wide.shape.w).toBeCloseTo(60, 1)
  })

  it('색 영역이 윤곽 안에 있으면 칸이 그대로다', () => {
    const inner = shifted(rectPoints(10, 10), 5, 5)
    const bare = partCell(mkPart([]))
    const same = partCell(mkPart([{ outline: inner, holes: [], color: '하늘', z: 0 }]))
    expect(same.shape.w).toBeCloseTo(bare.shape.w, 3)
    expect(same.shape.h).toBeCloseTo(bare.shape.h, 3)
  })

  it('art 가 비면 윤곽 박스와 같다 — 기존 도안의 배치가 바뀌지 않는다', () => {
    const box = partBox(mkPart([]))
    expect(box.min).toEqual({ x: 0, y: 0 })
    expect(box.max).toEqual({ x: 40, y: 30 })
  })
})

describe('렌더 — 색이 먼저, 덧그릴 선이 위', () => {
  /** 렌더 전체는 `PenArtifact` 를 요구하므로 여기서는 부품 단위 SVG 조립 규칙만 본다 */
  it('색 영역의 hex 가 그대로 쓰이고 덧그릴 선은 검정으로 남는다', async () => {
    const { renderPenSvg } = await import('@/lib/studio/pen3d/render')
    const { buildPattern, recipeById } = await import('@/lib/studio/pen3d/recipes')
    const { validatePen } = await import('@/lib/studio/pen3d/validate')

    const recipe = recipeById('name-keyring')!
    const pattern = buildPattern(recipe, recipe.defaults)

    // 첫 부품에 색 영역을 싣는다 — 파이프라인의 나머지는 건드리지 않는다
    const painted = {
      ...pattern,
      parts: pattern.parts.map((p, i) =>
        i === 0
          ? { ...p, art: [{ outline: rectPoints(20, 10), holes: [], color: '주황' as const, z: 0 }] }
          : p,
      ),
    }

    // 직접 만들지 않고 이미 있는 것을 쓴다 — spec 의 필수 필드가 늘면 여기도 따라와야 한다
    const { gateSpec } = await import('@/lib/studio/atlas-build')
    const spec = gateSpec('middle', 'flat')

    const { metrics } = validatePen(painted, spec)
    // 픽스처를 완전하게 만든다 — `assembly` 를 빼고 `as never` 로 가리면 렌더가 그 자리에서
    // 터지고, 터진 이유가 색 영역처럼 보인다 (실제로 한 번 그렇게 헤맸다)
    const svg = renderPenSvg(
      {
        kind: 'pen3d',
        pattern: painted,
        metrics,
        assembly: ['고리를 이름판에 붙입니다.'],
        tasks: ['이름판 윤곽을 따라 그립니다.'],
        safety_notes: [],
      },
      { status: 'validated' },
    )

    expect(svg).toContain(`fill="${PALETTE.주황}"`)
    expect(svg).toContain('fill-rule="evenodd"')
    // 덧그릴 선은 여전히 검정 stroke + fill 없음이다
    expect(svg).toContain('stroke="#111"')

    // 색이 **먼저** 나온다 — 뒤집히면 진한 색이 윤곽선을 덮는다
    const artAt = svg.indexOf('class="art"')
    const strokeAt = svg.indexOf('fill="none" stroke="#111"')
    expect(artAt).toBeGreaterThan(-1)
    expect(strokeAt).toBeGreaterThan(artAt)
  })
})
