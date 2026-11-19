import { describe, expect, it } from 'vitest'
import { ATLAS_RECORDS } from '@/data/atlas/records'
import { atlasShape } from '@/lib/studio/atlas'
import { atlasGate, gateSpec } from '@/lib/studio/atlas-build'
import { PAGE_USABLE, SHAPE_PAGE_FILL } from '@/lib/studio/constants'
import { partCell } from '@/lib/studio/pen3d/label'
import { generatePen } from '@/lib/studio/pen3d/pipeline'
import { buildPattern } from '@/lib/studio/pen3d/recipes'
import { shapeRecipe } from '@/lib/studio/pen3d/shape'
import { validatePen } from '@/lib/studio/pen3d/validate'
import type { PenShape } from '@/types/studio'

/**
 * **도안이 종이를 얼마나 쓰는가** (ADR-045).
 *
 * 왜 이 파일이 있는가: 2D 기본 치수가 85mm 고정이었다. A4 를 손에 들면 실루엣이 종이의
 * 1/7 이고, 그 크기에서는 색 영역 7개가 선 몇 개로 뭉친다. 이제 기본 치수는 **종이에서
 * 역산한다**(`SHAPE_PAGE_FILL`). 그 뒤로 지켜져야 하는 것이 세 가지다:
 *
 *   ① 2D 한 장이 사용 영역을 실제로 **크게 쓴다** — 숫자로 고정한다
 *   ② 색 영역이 윤곽보다 큰 모양·고리가 붙는 모양도 **기본값에서 종이를 넘지 않는다**
 *      (`partBox` 는 색 영역을 포함하고, 배치는 라벨 칸과 고리 줄까지 센다)
 *   ③ 상한에서 간격이 걸리는 모양은 **1라운드 치수를 내려** 통과한다. 임계값은 그대로다
 *
 * 임계값을 낮춰 크게 만드는 길은 없다 (CLAUDE.md · ADR-030). 통과 판정은 전부
 * `validatePen` 이 하고, 이 파일은 그 판정을 **런타임 경로로** 돌린다.
 */

const shapeOf = (word: string): PenShape => {
  const record = ATLAS_RECORDS.find((r) => r.id === `atlas-${word}`)
  if (!record) throw new Error(`아틀라스에 ${word} 가 없다`)
  const shape = atlasShape(record)
  if (!shape) throw new Error(`${word} 를 모양으로 읽을 수 없다`)
  return shape
}

const cellsAt = (word: string, form: 'flat' | 'solid' = 'flat') => {
  const recipe = shapeRecipe(shapeOf(word), { form, grade_band: 'middle' })
  const pattern = buildPattern(recipe, recipe.defaults)
  return { recipe, cells: pattern.parts.map((part) => partCell(part)) }
}

describe('① 2D 한 장이 종이를 크게 쓴다', () => {
  it('채움 목표는 2D 가 입체보다 크다 — 2D 는 조립하지 않으므로 남길 이유가 없다', () => {
    expect(SHAPE_PAGE_FILL.flat).toBeGreaterThan(SHAPE_PAGE_FILL.solid)
    expect(SHAPE_PAGE_FILL.flat).toBeLessThanOrEqual(1)
  })

  it.each(['복어', '자전거', '기린', '호랑이', '나비'])(
    '%s — 기본 치수가 100mm 를 넘는다 (예전 고정값 85mm 보다 크다)',
    (word) => {
      const { recipe } = cellsAt(word)
      expect(recipe.defaults.size).toBeGreaterThan(100)
      expect(recipe.defaults.size).toBeLessThanOrEqual(recipe.size_range[1])
    },
  )

  it('가로로 넓은 모양은 사용 폭의 90% 이상을 쓴다', () => {
    const { cells } = cellsAt('자전거')
    expect(cells[0]!.shape.w).toBeGreaterThan(PAGE_USABLE.width_mm * 0.9)
  })

  it('부품 칸이 사용 영역의 3분의 1 이상을 덮는다', () => {
    const { cells } = cellsAt('복어')
    const used = cells.reduce((sum, c) => sum + c.width_mm * c.height_mm, 0)
    expect(used / (PAGE_USABLE.width_mm * PAGE_USABLE.height_mm)).toBeGreaterThan(0.33)
  })
})

describe('② 기본값에서 종이를 넘지 않는다', () => {
  /**
   * 재활용표시는 **색 영역이 윤곽보다 2배 높다.** `shape.aspect`(들어온 윤곽의 종횡비)로
   * 상한을 잡으면 색까지 합친 칸이 종이를 넘는다 — 실측으로 걸렸던 자리다.
   */
  it('색 영역이 윤곽보다 큰 모양도 칸이 사용 영역 안에 들어온다', () => {
    const { cells } = cellsAt('재활용표시')
    expect(cells[0]!.height_mm).toBeLessThanOrEqual(PAGE_USABLE.height_mm)
    expect(cells[0]!.width_mm).toBeLessThanOrEqual(PAGE_USABLE.width_mm)
  })

  it('고리가 붙는 2D 모양은 두 칸이 한 장에 들어간다', () => {
    const shape = shapeOf('눈사람')
    expect(shape.hanger).toBe(true)
    const { report } = validatePen(
      (() => {
        const recipe = shapeRecipe(shape, { form: 'flat', grade_band: 'middle' })
        return buildPattern(recipe, recipe.defaults)
      })(),
      gateSpec('middle', 'flat'),
    )
    const codes = report.findings.filter((f) => f.severity === 'error').map((f) => f.code)
    expect(codes).not.toContain('PEN_PART_OUT_OF_PAGE')
    expect(codes).not.toContain('PEN_PARTS_OVERLAP')
  })
})

describe('③ 상한에서 걸리는 모양은 치수를 내려 통과한다 — 임계값은 그대로다', () => {
  /**
   * 호랑이 수염·게 다리 사이처럼 **큰 치수에서만 살아남는 좁은 틈**이 있는 모양들이다.
   * 보정 단계가 치수에 따라 선을 다르게 합치기 때문에, 이 모양들은 상한에서 간격 검사에
   * 걸리고 치수를 내리면 통과한다. 개선 라운드는 간격 항목에 확대만 시도하므로(그쪽이
   * 물리적으로 맞다) 1라운드 치수 탐색이 이 경우를 받는다.
   */
  it('호랑이 고등·2D — 1라운드에서 통과한 치수를 찾고, 상한보다 작다', () => {
    const shape = shapeOf('호랑이')
    const recipe = shapeRecipe(shape, { form: 'flat', grade_band: 'high' })
    const atCeiling = validatePen(
      buildPattern(recipe, recipe.defaults),
      gateSpec('high', 'flat'),
    ).report
    // 상한에서는 간격이 걸린다 — 이 모양이 이 테스트의 대상인 이유다
    expect(atCeiling.findings.some((f) => f.code === 'PEN_GAP_TOO_SMALL')).toBe(true)

    const run = generatePen(gateSpec('high', 'flat'), { shape })
    expect(run.status).toBe('validated')
    expect(run.params.size).toBeLessThan(recipe.size_range[1])
    expect(run.params.size).toBeGreaterThanOrEqual(recipe.size_range[0])
    // 개선 라운드를 쓰지 않고 1라운드에서 끝난다
    expect(run.rounds.length).toBe(1)
  })

  it.each(['호랑이', '게', '나비', '코끼리', '포크', '눈사람', '재활용표시', '시계'])(
    '%s — 세 학년대 · 2D·3D 전부 통과한다',
    (word) => {
      const gate = atlasGate(shapeOf(word))
      expect(gate.failures).toEqual([])
      expect(gate.ok).toBe(true)
      expect(gate.flat_size_mm).toBeGreaterThan(0)
      expect(gate.flat_page_ratio).toBeGreaterThan(0.1)
    },
  )
})
