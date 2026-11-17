/**
 * A4 한 장에 **고유 부품을 한 번씩** 배치한다.
 *
 * 같은 모양을 수량만큼 인쇄하지 않는 이유: 3D펜 수업에서는 같은 선 위에 여러 번 덧그려
 * 필요한 개수를 만든다. 6면체 패널 6장을 전부 인쇄하면 A4 에 들어가지 않고, 들어가더라도
 * 종이만 낭비한다 (`docs/STUDIO.md`).
 */

import { PAGE, PAGE_USABLE } from '@/lib/studio/constants'
import { packShelf, sizeOf, strokesBBox, type Rect } from '@/lib/studio/geometry'
import type { PenPattern } from '@/types/studio'

export type LayoutResult = {
  /** 각 부품의 `origin` 이 채워진 패턴 */
  pattern: PenPattern
  /** 배치된 사각형. 들어가지 않은 부품은 null */
  placed: (Rect | null)[]
}

export function layoutPattern(pattern: PenPattern): LayoutResult {
  const sizes = pattern.parts.map((p) => sizeOf(strokesBBox(p.strokes)))
  const origins = packShelf(sizes, {
    width: PAGE_USABLE.width_mm,
    height: PAGE_USABLE.height_mm,
    gutter: PAGE.gutter_mm,
  })

  const placed: (Rect | null)[] = origins.map((origin, i) =>
    origin === null ? null : { x: origin.x, y: origin.y, w: sizes[i]!.w, h: sizes[i]!.h },
  )

  return {
    pattern: {
      ...pattern,
      parts: pattern.parts.map((part, i) => ({
        ...part,
        // 배치에 실패한 부품은 원점에 남겨 둔다. 검증이 PEN_PART_OUT_OF_PAGE 로 잡는다.
        origin: origins[i] ?? { x: 0, y: 0 },
      })),
    },
    placed,
  }
}
