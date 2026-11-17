import { describe, expect, it } from 'vitest'
import { PEN_PIECES, pieceById } from '@/lib/studio/pen3d/pieces'
import { COMPOSE_MIN_PIECE_MM, PEN_LIMITS } from '@/lib/studio/constants'
import {
  featureEdges,
  interiorAngles,
  isClosedPath,
  minGap,
  segIntersects,
  segments,
  sizeOf,
  strokesBBox,
} from '@/lib/studio/geometry'

/**
 * 조각(프리미티브) 라이브러리 — **LLM 이 고를 수 있는 전부다** (ADR-034).
 *
 * 레시피 목록과 같은 지위다: 목록 밖의 모양은 존재할 수 없고, 그래서 모든 조합이 검증 가능하다.
 * 여기서 보는 것은 "모양이 예쁜가"가 아니라 **가장 작게 썼을 때도 3D펜으로 그릴 수 있는가**다.
 */

const strict = {
  gap: Math.max(...(['elementary', 'middle', 'high'] as const).map((b) => PEN_LIMITS[b].min_gap_mm)),
  segment: Math.max(
    ...(['elementary', 'middle', 'high'] as const).map((b) => PEN_LIMITS[b].min_segment_mm),
  ),
  angle: Math.max(
    ...(['elementary', 'middle', 'high'] as const).map((b) => PEN_LIMITS[b].min_angle_deg),
  ),
}

describe('조각 목록', () => {
  it('비어 있지 않고 id 가 중복되지 않는다', () => {
    expect(PEN_PIECES.length).toBeGreaterThan(5)
    expect(new Set(PEN_PIECES.map((p) => p.id)).size).toBe(PEN_PIECES.length)
  })

  it('몸통이 될 수 있는 조각과 붙이는 조각이 모두 있다', () => {
    expect(PEN_PIECES.some((p) => p.can_be_base)).toBe(true)
    expect(PEN_PIECES.some((p) => !p.can_be_base)).toBe(true)
  })

  it('이름과 설명이 있다 — LLM 이 고르는 근거이자 강사가 읽는 문구다', () => {
    for (const piece of PEN_PIECES) {
      expect(piece.name.length).toBeGreaterThan(0)
      expect(piece.summary.length).toBeGreaterThan(0)
    }
  })

  it('pieceById — 목록 밖 id 는 null 이다', () => {
    expect(pieceById('pikachu')).toBeNull()
    expect(pieceById(PEN_PIECES[0]!.id)?.id).toBe(PEN_PIECES[0]!.id)
  })
})

describe('가장 작게 써도 3D펜으로 그릴 수 있는가', () => {
  /**
   * 조합은 조각을 `COMPOSE_MIN_PIECE_MM` 까지 줄일 수 있다. 그 크기에서 가장 빡빡한 학년
   * 임계값(간격 4mm · 선분 8mm · 내각 40도)을 만족하지 못하면, 개선 라운드가 도안을 키워도
   * 그 조각이 들어간 조합은 영원히 실패한다 — 레시피 쪽과 같은 가드다.
   */
  it.each(PEN_PIECES.map((p) => [p.id, p] as const))('%s', (_id, piece) => {
    const strokes = piece.outline(COMPOSE_MIN_PIECE_MM)
    expect(strokes.length).toBeGreaterThan(0)

    for (const stroke of strokes) {
      expect(isClosedPath(stroke, 0.1), '윤곽이 닫혀 있다').toBe(true)
      for (const edge of featureEdges(stroke)) {
        expect(edge, '선분 길이').toBeGreaterThanOrEqual(strict.segment)
      }
      for (const angle of interiorAngles(stroke)) {
        expect(angle, '내각').toBeGreaterThanOrEqual(strict.angle)
      }
    }

    const gap = minGap(strokes, { pathSkip: Math.max(10, strict.gap * 3) })
    expect(gap, '선 간격').toBeGreaterThanOrEqual(strict.gap)

    const size = sizeOf(strokesBBox(strokes))
    expect(size.w).toBeGreaterThan(0)
    expect(size.h).toBeGreaterThan(0)
  })

  it('윤곽이 스스로 교차하지 않는다 — 꼬인 선은 떼어낼 때 찢어진다', () => {
    for (const piece of PEN_PIECES) {
      for (const stroke of piece.outline(40)) {
        const segs = segments(stroke)
        for (let i = 0; i < segs.length; i += 1) {
          for (let j = i + 2; j < segs.length; j += 1) {
            // 닫힌 윤곽의 첫 변과 마지막 변은 끝점을 공유한다.
            if (i === 0 && j === segs.length - 1) continue
            expect(segIntersects(segs[i]!, segs[j]!), `${piece.id} ${i}-${j}`).toBe(false)
          }
        }
      }
    }
  })
})

describe('치수', () => {
  it('기준 치수를 키우면 조각도 같은 비율로 커진다 (결정론)', () => {
    for (const piece of PEN_PIECES) {
      const small = sizeOf(strokesBBox(piece.outline(30)))
      const big = sizeOf(strokesBBox(piece.outline(60)))
      expect(big.w / small.w).toBeCloseTo(2, 1)
      expect(big.h / small.h).toBeCloseTo(2, 1)
    }
  })

  it('가로 기준 치수를 그대로 쓴다 — 조합이 mm 를 정할 수 있어야 한다', () => {
    for (const piece of PEN_PIECES) {
      const size = sizeOf(strokesBBox(piece.outline(40)))
      expect(size.w, piece.id).toBeCloseTo(40, 1)
    }
  })

  it('같은 입력이면 같은 좌표다', () => {
    for (const piece of PEN_PIECES) {
      expect(piece.outline(37)).toEqual(piece.outline(37))
    }
  })
})
