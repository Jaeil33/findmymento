/**
 * A4 한 장에 **고유 부품을 한 번씩** 배치한다.
 *
 * 같은 모양을 수량만큼 인쇄하지 않는 이유: 3D펜 수업에서는 같은 선 위에 여러 번 덧그려
 * 필요한 개수를 만든다. 6면체 패널 6장을 전부 인쇄하면 A4 에 들어가지 않고, 들어가더라도
 * 종이만 낭비한다 (`docs/STUDIO.md`).
 *
 * **배치 단위는 윤곽이 아니라 "칸"이다** — 윤곽 + 그 아래 라벨 블록(번호·이름·수량·치수).
 * 라벨은 렌더가 반드시 그리는 것이므로, 배치가 그 자리를 예약하지 않으면 라벨이 옆 부품의
 * 선 위나 아랫줄 라벨 위로 올라간다. 칸 크기는 `label.ts` 의 `partCell` 한 곳에서만 나오고
 * 렌더도 같은 함수를 쓴다.
 */

import { PAGE, PAGE_USABLE } from '@/lib/studio/constants'
import { packShelf, type Rect } from '@/lib/studio/geometry'
import { partCell } from '@/lib/studio/pen3d/label'
import type { PenPattern } from '@/types/studio'

export type LayoutResult = {
  /** 각 부품의 `origin` 이 채워진 패턴 */
  pattern: PenPattern
  /** 배치된 칸(윤곽 + 라벨 블록). 들어가지 않은 부품은 null */
  placed: (Rect | null)[]
}

export function layoutPattern(pattern: PenPattern): LayoutResult {
  const cells = pattern.parts.map((part) => partCell(part))
  const origins = packShelf(
    cells.map((c) => ({ w: c.width_mm, h: c.height_mm })),
    {
      width: PAGE_USABLE.width_mm,
      height: PAGE_USABLE.height_mm,
      gutter: PAGE.gutter_mm,
    },
  )

  const placed: (Rect | null)[] = origins.map((origin, i) =>
    origin === null
      ? null
      : { x: origin.x, y: origin.y, w: cells[i]!.width_mm, h: cells[i]!.height_mm },
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
