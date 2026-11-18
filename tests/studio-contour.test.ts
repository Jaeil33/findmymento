/**
 * `art` → `trace` 유도 (ADR-040).
 *
 * 이 파일이 고정하는 계약 넷:
 *   ① 외곽 위치가 보존된다 — 닫힘(팽창→침식)이 모양을 부풀리지 않는다
 *   ② **자기교차가 구조적으로 불가능하다** — 꼬인 입력을 줘도 꼬이지 않은 윤곽이 나온다
 *   ③ 선폭보다 좁은 틈은 붙고, 넓은 틈은 가장 큰 덩어리만 남는다
 *   ④ 결정론 — 같은 입력이면 좌표까지 같다
 */

import { describe, expect, it } from 'vitest'
import { traceFromArt } from '@/lib/studio/pen3d/contour'
import { segIntersects, type Seg } from '@/lib/studio/geometry'
import type { ArtRegion, NormPoint, ShapeOutline } from '@/types/studio'

function outline(points: NormPoint[]): ShapeOutline {
  return { points, closed: true }
}

function region(points: NormPoint[], holes: NormPoint[][] = []): ArtRegion {
  return { outline: outline(points), holes: holes.map(outline), color: '주황', z: 0 }
}

function rect(x: number, y: number, w: number, h: number): NormPoint[] {
  return [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
  ]
}

function circle(cx: number, cy: number, r: number, n = 32): NormPoint[] {
  return Array.from({ length: n }, (_, i) => {
    const t = (i / n) * Math.PI * 2
    return { x: cx + Math.cos(t) * r, y: cy + Math.sin(t) * r }
  })
}

function bboxOf(points: NormPoint[]) {
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) }
}

/** 닫힌 고리가 스스로 교차하는가. 이웃하지 않은 선분끼리만 본다 */
function selfIntersects(points: NormPoint[]): boolean {
  const n = points.length
  const segs: Seg[] = Array.from({ length: n }, (_, i) => ({
    a: points[i]!,
    b: points[(i + 1) % n]!,
  }))
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 2; j < n; j += 1) {
      if (i === 0 && j === n - 1) continue // 첫 선분과 마지막 선분은 끝점을 공유한다
      if (segIntersects(segs[i]!, segs[j]!)) return true
    }
  }
  return false
}

describe('traceFromArt — 외곽 보존', () => {
  it('정사각형 영역의 윤곽은 같은 자리에 선다', () => {
    const result = traceFromArt([region(rect(0.2, 0.2, 0.6, 0.6))])
    expect(result).not.toBeNull()

    const box = bboxOf(result!.points)
    // 닫힘이 팽창만 하고 침식하지 않으면 여기서 0.02 이상 부풀어 터진다
    expect(box.minX).toBeCloseTo(0.2, 1)
    expect(box.maxX).toBeCloseTo(0.8, 1)
    expect(box.minY).toBeCloseTo(0.2, 1)
    expect(box.maxY).toBeCloseTo(0.8, 1)
  })

  it('겹친 두 영역은 하나의 윤곽이 된다 — 합집합을 계산하지 않아도', () => {
    const result = traceFromArt([
      region(rect(0, 0, 0.6, 0.3)),
      region(rect(0.4, 0, 0.6, 0.3)),
    ])
    expect(result).not.toBeNull()
    expect(result!.dropped_ratio).toBe(0)

    const box = bboxOf(result!.points)
    expect(box.minX).toBeCloseTo(0, 1)
    expect(box.maxX).toBeCloseTo(1, 1)
  })

  it('구멍은 바깥 윤곽에 나타나지 않는다 — 도넛의 trace 는 바깥 원이다', () => {
    const result = traceFromArt([region(circle(0.5, 0.5, 0.45), [circle(0.5, 0.5, 0.2)])])
    expect(result).not.toBeNull()

    const box = bboxOf(result!.points)
    expect(box.maxX - box.minX).toBeCloseTo(0.9, 1)
    // 모든 점이 바깥 원 둘레에 있다 — 안쪽 구멍 둘레로 내려온 점이 없다
    for (const p of result!.points) {
      const r = Math.hypot(p.x - 0.5, p.y - 0.5)
      expect(r).toBeGreaterThan(0.3)
    }
  })
})

describe('traceFromArt — 자기교차가 불가능하다', () => {
  it('나비넥타이(스스로 교차하는 입력)를 줘도 꼬이지 않은 윤곽이 나온다', () => {
    // 이 점 순서는 X 자로 교차한다 — `readShape` 는 이것을 통째로 버린다
    const bowtie: NormPoint[] = [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
    ]
    const result = traceFromArt([region(bowtie)])
    expect(result).not.toBeNull()
    expect(selfIntersects(result!.points)).toBe(false)
  })

  it('가는 돌기가 되돌아 겹치는 입력도 꼬이지 않는다', () => {
    const spike: NormPoint[] = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0.5, y: 0.02 },
      { x: 0.5, y: 1 },
      { x: 0, y: 1 },
    ]
    const result = traceFromArt([region(spike)])
    expect(result).not.toBeNull()
    expect(selfIntersects(result!.points)).toBe(false)
  })
})

describe('traceFromArt — 틈', () => {
  it('선폭보다 좁은 틈은 붙는다 (닫힘)', () => {
    const result = traceFromArt([
      region(rect(0, 0, 0.49, 0.4)),
      region(rect(0.503, 0, 0.497, 0.4)),
    ])
    expect(result).not.toBeNull()
    // 붙었으므로 버린 면적이 없다
    expect(result!.dropped_ratio).toBe(0)
  })

  it('멀리 떨어진 조각은 가장 큰 덩어리만 남고 버린 비율이 기록된다', () => {
    const result = traceFromArt([
      region(rect(0, 0, 0.5, 0.5)), // 큰 것
      region(rect(0.8, 0.8, 0.1, 0.1)), // 작고 떨어진 것
    ])
    expect(result).not.toBeNull()
    expect(result!.dropped_ratio).toBeGreaterThan(0)

    // 남은 것은 큰 쪽이다
    const box = bboxOf(result!.points)
    expect(box.maxX).toBeLessThan(0.7)
  })
})

describe('traceFromArt — 결정론과 경계 조건', () => {
  it('같은 입력은 좌표까지 같은 결과를 낸다', () => {
    const regions = [region(circle(0.5, 0.5, 0.4)), region(rect(0.4, 0.6, 0.2, 0.35))]
    const a = traceFromArt(regions)
    const b = traceFromArt(regions)
    expect(a).toEqual(b)
  })

  it('점 개수는 요청한 수다 — 뒤의 검증이 선분 길이를 고르게 본다', () => {
    const result = traceFromArt([region(circle(0.5, 0.5, 0.4))], { points: 24 })
    expect(result!.points).toHaveLength(24)
  })

  it('영역이 없으면 null — 호출자가 폴백 사슬의 다음으로 내려간다', () => {
    expect(traceFromArt([])).toBeNull()
    expect(traceFromArt([region([{ x: 0, y: 0 }, { x: 1, y: 1 }])])).toBeNull()
  })

  it('윤곽은 닫힌 고리다 — 첫 점을 끝에 다시 쓰지 않는다', () => {
    const result = traceFromArt([region(rect(0.1, 0.1, 0.8, 0.8))])
    const first = result!.points[0]!
    const last = result!.points[result!.points.length - 1]!
    expect(first.x === last.x && first.y === last.y).toBe(false)
  })
})
