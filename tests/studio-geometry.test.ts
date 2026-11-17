import { describe, expect, it } from 'vitest'
import {
  bbox,
  circlePoints,
  connected,
  dist,
  interiorAngles,
  isClosedPath,
  minGap,
  packShelf,
  pointSegDistance,
  rectPoints,
  rectsOverlap,
  regularPolygon,
  scalePoints,
  segDistance,
  segments,
  starPoints,
  strokeLength,
  translate,
} from '@/lib/studio/geometry'
import type { Stroke } from '@/types/studio'

/**
 * 기하 연산의 known-answer 테스트.
 *
 * 검증기(선 간격·내각·제작 시간·A4 적합)의 **전부가 이 함수들의 출력에 걸려 있다.**
 * 여기서 1mm 가 틀리면 교실에서 도안이 녹아 붙거나 수업이 안 끝난다.
 */

const square = (side: number): Stroke => ({
  kind: 'outline',
  points: rectPoints(side, side),
  closed: true,
})

describe('기본 측정', () => {
  it('두 점 거리 — 3·4·5', () => {
    expect(dist({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5)
  })

  it('닫힌 사각형의 선분은 4개고 길이 합은 둘레다', () => {
    const s = square(10)
    expect(segments(s)).toHaveLength(4)
    expect(strokeLength(s)).toBeCloseTo(40, 6)
  })

  it('열린 폴리라인은 선분이 하나 적다', () => {
    const open: Stroke = {
      kind: 'fold',
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
      ],
      closed: false,
    }
    expect(segments(open)).toHaveLength(2)
    expect(strokeLength(open)).toBeCloseTo(20, 6)
  })

  it('bbox 는 최소·최대 점이다', () => {
    const box = bbox(rectPoints(30, 20))
    expect(box).toEqual({ min: { x: 0, y: 0 }, max: { x: 30, y: 20 } })
  })

  it('평행이동과 배율', () => {
    expect(translate(rectPoints(10, 10), 5, 7)[0]).toEqual({ x: 5, y: 7 })
    const scaled = bbox(scalePoints(rectPoints(10, 10), 2))
    expect(scaled.max).toEqual({ x: 20, y: 20 })
  })
})

describe('정다각형·별·원', () => {
  it('정사각형 — 반지름 10 이면 한 변이 10√2 다', () => {
    const pts = regularPolygon(4, 10)
    expect(pts).toHaveLength(4)
    expect(dist(pts[0]!, pts[1]!)).toBeCloseTo(10 * Math.SQRT2, 6)
  })

  it('정육각형 — 한 변이 반지름과 같다', () => {
    const pts = regularPolygon(6, 20)
    expect(dist(pts[0]!, pts[1]!)).toBeCloseTo(20, 6)
  })

  it('정삼각형의 내각은 60도다', () => {
    const tri: Stroke = { kind: 'outline', points: regularPolygon(3, 30), closed: true }
    for (const a of interiorAngles(tri)) expect(a).toBeCloseTo(60, 4)
  })

  it('정사각형의 내각은 90도다', () => {
    for (const a of interiorAngles(square(25))) expect(a).toBeCloseTo(90, 4)
  })

  it('별의 뾰족한 꼭짓점은 내각이 작다 — 이게 PEN_ANGLE_TOO_SHARP 의 근거다', () => {
    const sharp: Stroke = { kind: 'outline', points: starPoints(5, 30, 8), closed: true }
    expect(Math.min(...interiorAngles(sharp))).toBeLessThan(40)
    const blunt: Stroke = { kind: 'outline', points: starPoints(5, 30, 20), closed: true }
    expect(Math.min(...interiorAngles(blunt))).toBeGreaterThan(40)
  })

  it('원 근사 폴리라인의 길이는 2πr 보다 조금 짧다 (내접 다각형)', () => {
    const c: Stroke = { kind: 'outline', points: circlePoints(20, 64), closed: true }
    const exact = 2 * Math.PI * 20
    expect(strokeLength(c)).toBeLessThan(exact)
    expect(strokeLength(c)).toBeCloseTo(exact, 0)
  })
})

describe('선분 거리 — 선 간격 검증의 핵심', () => {
  const h = (y: number, x0 = 0, x1 = 10) => ({ a: { x: x0, y }, b: { x: x1, y } })

  it('평행한 두 선분의 거리', () => {
    expect(segDistance(h(0), h(3))).toBeCloseTo(3, 6)
  })

  it('교차하면 0 이다', () => {
    const cross = { a: { x: 5, y: -5 }, b: { x: 5, y: 5 } }
    expect(segDistance(h(0), cross)).toBe(0)
  })

  it('떨어진 두 선분은 끝점 사이 거리다', () => {
    expect(segDistance(h(0, 0, 10), h(0, 14, 20))).toBeCloseTo(4, 6)
  })

  it('점-선분 거리는 수직 거리이고, 수선의 발이 밖이면 끝점 거리다', () => {
    expect(pointSegDistance({ x: 5, y: 4 }, h(0))).toBeCloseTo(4, 6)
    expect(pointSegDistance({ x: -3, y: 0 }, h(0))).toBeCloseTo(3, 6)
  })
})

describe('최소 선 간격', () => {
  it('고리 모양 — 바깥 원과 안쪽 원의 간격이 그대로 나온다', () => {
    const outer: Stroke = { kind: 'outline', points: circlePoints(20, 72), closed: true }
    const inner: Stroke = { kind: 'outline', points: circlePoints(17, 72), closed: true }
    expect(minGap([outer, inner])).toBeCloseTo(3, 0)
  })

  it('원 하나는 자기 자신과 걸리지 않는다 — 곡률은 두 개의 선이 아니다', () => {
    // 선분 쌍을 그냥 비교하면 r=17·72분할에서 현 길이 1.48mm 가 간격으로 잡힌다.
    const circle: Stroke = { kind: 'outline', points: circlePoints(17, 72), closed: true }
    expect(minGap([circle])).toBeGreaterThan(5)
  })

  it('머리핀처럼 선이 되돌아와 나란히 지나가면 잡는다 — 이건 실제로 녹아 붙는다', () => {
    const hairpin: Stroke = {
      kind: 'outline',
      points: [
        { x: 0, y: 0 },
        { x: 40, y: 0 },
        { x: 40, y: 2 },
        { x: 0, y: 2 },
      ],
      closed: false,
    }
    expect(minGap([hairpin])).toBeCloseTo(2, 1)
  })

  it('이어진 선분은 간격 0 으로 치지 않는다 — 꼭짓점을 공유하기 때문이다', () => {
    expect(minGap([square(20)])).toBeGreaterThan(1)
  })

  it('윤곽에 끝이 닿는 접는 선도 이어진 선으로 본다', () => {
    const outline = square(30)
    const fold: Stroke = {
      kind: 'fold',
      points: [
        { x: 0, y: 15 },
        { x: 30, y: 15 },
      ],
      closed: false,
    }
    // 접는 선의 양 끝이 윤곽선 위에 있다. 이걸 간격 위반으로 잡으면 모든 입체 도안이 실패한다.
    expect(minGap([outline, fold])).toBeGreaterThan(1)
  })

  it('이어지지 않고 가까운 두 선은 그대로 잡힌다', () => {
    const a = square(20)
    const b: Stroke = { kind: 'outline', points: translate(rectPoints(20, 20), 0, 22), closed: true }
    expect(minGap([a, b])).toBeCloseTo(2, 6)
  })

  it('선이 하나도 없거나 선분이 하나면 Infinity 다', () => {
    expect(minGap([])).toBe(Number.POSITIVE_INFINITY)
  })

  it('connected — 끝점을 공유하거나 끝이 다른 선분 위에 있으면 true', () => {
    const s1 = { a: { x: 0, y: 0 }, b: { x: 10, y: 0 } }
    const s2 = { a: { x: 10, y: 0 }, b: { x: 10, y: 10 } }
    const s3 = { a: { x: 5, y: 0 }, b: { x: 5, y: 10 } }
    const s4 = { a: { x: 0, y: 5 }, b: { x: 10, y: 5 } }
    expect(connected(s1, s2, 0.1)).toBe(true)
    expect(connected(s1, s3, 0.1)).toBe(true)
    expect(connected(s1, s4, 0.1)).toBe(false)
  })
})

describe('배치 (A4 선반 채우기)', () => {
  it('부품들이 사용 영역 안에 들어가고 서로 겹치지 않는다', () => {
    const sizes = [
      { w: 60, h: 40 },
      { w: 60, h: 40 },
      { w: 60, h: 40 },
      { w: 90, h: 50 },
      { w: 30, h: 30 },
    ]
    const placed = packShelf(sizes, { width: 190, height: 277, gutter: 6 })
    expect(placed).toHaveLength(sizes.length)
    expect(placed.every((p) => p !== null)).toBe(true)

    for (const [i, p] of placed.entries()) {
      expect(p!.x).toBeGreaterThanOrEqual(0)
      expect(p!.y).toBeGreaterThanOrEqual(0)
      expect(p!.x + sizes[i]!.w).toBeLessThanOrEqual(190)
      expect(p!.y + sizes[i]!.h).toBeLessThanOrEqual(277)
    }

    for (let i = 0; i < sizes.length; i += 1) {
      for (let j = i + 1; j < sizes.length; j += 1) {
        const a = { x: placed[i]!.x, y: placed[i]!.y, w: sizes[i]!.w, h: sizes[i]!.h }
        const b = { x: placed[j]!.x, y: placed[j]!.y, w: sizes[j]!.w, h: sizes[j]!.h }
        expect(rectsOverlap(a, b)).toBe(false)
      }
    }
  })

  it('들어가지 않는 부품은 null 이다 — 거짓으로 겹쳐 놓지 않는다', () => {
    const placed = packShelf([{ w: 300, h: 10 }], { width: 190, height: 277, gutter: 6 })
    expect(placed[0]).toBeNull()
  })

  it('같은 입력이면 같은 배치다 (결정론)', () => {
    const sizes = [
      { w: 40, h: 30 },
      { w: 70, h: 20 },
      { w: 50, h: 60 },
    ]
    const page = { width: 190, height: 277, gutter: 6 }
    expect(packShelf(sizes, page)).toEqual(packShelf(sizes, page))
  })

  it('rectsOverlap — 변이 닿기만 하면 겹침이 아니다', () => {
    expect(rectsOverlap({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 0, w: 10, h: 10 })).toBe(false)
    expect(rectsOverlap({ x: 0, y: 0, w: 10, h: 10 }, { x: 9, y: 0, w: 10, h: 10 })).toBe(true)
  })
})

describe('닫힘 판정', () => {
  it('closed 플래그가 있으면 닫힌 것이다', () => {
    expect(isClosedPath(square(10), 0.1)).toBe(true)
  })

  it('플래그가 없어도 끝점이 허용 오차 안이면 닫힌 것으로 본다', () => {
    const almost: Stroke = {
      kind: 'outline',
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0.05, y: 0 },
      ],
      closed: false,
    }
    expect(isClosedPath(almost, 0.1)).toBe(true)
  })

  it('끝이 벌어져 있으면 닫히지 않은 것이다 — 떼어낼 때 분해된다', () => {
    const open: Stroke = {
      kind: 'outline',
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 3, y: 0 },
      ],
      closed: false,
    }
    expect(isClosedPath(open, 0.1)).toBe(false)
  })

  it('점이 3개 미만이면 닫힌 윤곽이 아니다', () => {
    const line: Stroke = {
      kind: 'outline',
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ],
      closed: true,
    }
    expect(isClosedPath(line, 0.1)).toBe(false)
  })
})
