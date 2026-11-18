/**
 * 조합 — **주제에 맞는 모양을 조각으로 짜 맞춘다** (ADR-034).
 *
 * 레시피 8종으로는 "물고기"·"토끼" 같은 주제를 만들 수 없었다. 그렇다고 LLM 에게 좌표를
 * 쓰게 하면 보기에만 그럴듯하고 선 간격이 1mm 인 도안이 나온다 (ADR-029 가 막는 것).
 *
 * 그래서 경계를 이렇게 둔다:
 * - LLM 은 **검수된 조각 목록**(`pieces.ts`)에서 고르고 **비율만** 제안한다
 * - mm·좌표·접합 규격·부품 수는 **여기서** 정한다. 비율이 작아도 조각은 하한 아래로 내려가지 않는다
 * - 목록·범위 밖의 제안은 통째로 버리고 레시피 선택으로 떨어진다 (`author.ts`)
 * - 만들어진 조합은 **레시피와 똑같은 모양**(`PenRecipe`)이라, 기존 생성→검증→개선 라운드가
 *   그대로 돌아간다. 검증기는 조합인지 레시피인지 알지 못한다
 */

import {
  COMPOSE_MAX_PIECES,
  COMPOSE_MIN_PIECE_MM,
  WELD_MIN_LENGTH_MM,
} from '@/lib/studio/constants'
import { normalizeStrokes, scaleStrokes, sizeOf, strokesBBox } from '@/lib/studio/geometry'
import { pieceById, type PenPiece } from '@/lib/studio/pen3d/pieces'
import type { PenRecipe, PenRecipeParams } from '@/lib/studio/pen3d/recipes'
import type { PenJoint, PenPart, Stroke } from '@/types/studio'

/** 붙이는 자리. 접합 문장에만 쓴다 — 좌표는 배치기가 정한다 */
export const ATTACH_POINTS = ['top', 'bottom', 'front', 'back', 'side'] as const
export type AttachPoint = (typeof ATTACH_POINTS)[number]

const ATTACH_LABEL: Record<AttachPoint, string> = {
  top: '위쪽',
  bottom: '아래쪽',
  front: '앞쪽',
  back: '뒤쪽',
  side: '양옆',
}

export type ComposedPart = {
  piece: string
  /** 몸통 기준 치수에 대한 비율 */
  ratio: number
  quantity: number
  attach: AttachPoint
  /** 시간이 모자라면 가장 먼저 떨어지는 조각인가 */
  optional: boolean
}

export type PenComposition = {
  title: string
  /** 몸통 조각 id */
  base: string
  parts: ComposedPart[]
}

const RATIO_RANGE: [number, number] = [0.12, 1.2]
const QUANTITY_RANGE: [number, number] = [1, 6]

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function numberIn(value: unknown, [lo, hi]: [number, number]): number | null {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n) || n < lo || n > hi) return null
  return n
}

/**
 * LLM 이 돌려준 조합 제안을 검사한다. **조금이라도 어긋나면 `null`** 이다 —
 * 일부만 고쳐서 쓰면 "우리가 검수하지 않은 모양"이 조용히 들어온다.
 */
export function parseComposition(raw: unknown): PenComposition | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null
  const body = raw as Record<string, unknown>

  const title = str(body.title)
  if (title.length < 1 || title.length > 40) return null

  const basePiece = pieceById(str(body.base))
  if (!basePiece || !basePiece.can_be_base) return null

  if (!Array.isArray(body.parts)) return null
  if (body.parts.length < 1 || body.parts.length > COMPOSE_MAX_PIECES - 1) return null

  const parts: ComposedPart[] = []
  for (const entry of body.parts) {
    if (typeof entry !== 'object' || entry === null) return null
    const e = entry as Record<string, unknown>

    const piece = pieceById(str(e.piece))
    if (!piece) return null

    const ratio = numberIn(e.ratio, RATIO_RANGE)
    if (ratio === null) return null

    const quantity = numberIn(e.quantity, QUANTITY_RANGE)
    if (quantity === null || !Number.isInteger(quantity)) return null

    const attach = str(e.attach) as AttachPoint
    if (!(ATTACH_POINTS as readonly string[]).includes(attach)) return null

    parts.push({ piece: piece.id, ratio, quantity, attach, optional: e.optional === true })
  }

  return { title, base: basePiece.id, parts }
}

/** 조각을 원하는 가로 치수로 만든다. **하한 아래로는 내려가지 않는다.** */
function pieceStrokes(piece: PenPiece, width: number): Stroke[] {
  const w = Math.max(COMPOSE_MIN_PIECE_MM, Math.round(width * 10) / 10)
  return piece.outline(w)
}

/** 안쪽 장식 선. 테두리에서 떨어진 폭이 곧 선 간격이므로 넉넉히 둔다. */
function decoStroke(strokes: Stroke[]): Stroke | null {
  const box = strokesBBox(strokes)
  const size = sizeOf(box)
  if (Math.min(size.w, size.h) < COMPOSE_MIN_PIECE_MM * 2.2) return null

  const outer = strokes[0]
  if (!outer) return null
  const cx = box.min.x + size.w / 2
  const cy = box.min.y + size.h / 2
  const [shrunk] = scaleStrokes([outer], 0.5)
  if (!shrunk) return null

  const inner = strokesBBox([shrunk])
  const innerSize = sizeOf(inner)
  const dx = cx - (inner.min.x + innerSize.w / 2)
  const dy = cy - (inner.min.y + innerSize.h / 2)
  return {
    kind: 'outline',
    points: shrunk.points.map((p) => ({ x: p.x + dx, y: p.y + dy })),
    closed: true,
  }
}

const slug = (text: string) =>
  text
    .replace(/[^a-z0-9-]/gi, '')
    .slice(0, 12)
    .toLowerCase()

/**
 * 조합을 **레시피로** 바꾼다. 이 뒤로는 기존 코드가 조합이라는 사실을 알 필요가 없다 —
 * `generatePen` 의 개선 라운드(확대·축소·장식 제거·선택 부품 제거)가 그대로 적용된다.
 */
export function compositionRecipe(composition: PenComposition): PenRecipe {
  const basePiece = pieceById(composition.base)!
  const id = `composed-${slug(composition.base)}-${composition.parts.map((p) => slug(p.piece)).join('-')}`.slice(0, 60)

  /** 가장 작은 조각이 하한을 지키는 기준 치수. 이보다 작게 시작할 이유가 없다 */
  const smallestRatio = Math.min(...composition.parts.map((p) => p.ratio), 1)
  const minSize = Math.max(
    COMPOSE_MIN_PIECE_MM,
    Math.ceil(COMPOSE_MIN_PIECE_MM / Math.max(smallestRatio, 0.12)),
  )

  return {
    id,
    title: composition.title,
    summary: `${basePiece.name}에 ${composition.parts.map((p) => pieceById(p.piece)!.name).join(' · ')}을 붙여 만듭니다.`,
    keywords: [],
    defaults: { size: Math.min(Math.max(minSize, 55), 90), detail: 1, extras: true },
    size_range: [minSize, Math.max(minSize * 2, 110)],
    nominal_difficulty: Math.min(5, 2 + Math.floor(composition.parts.length / 2)),

    build: ({ size, detail, extras }: PenRecipeParams) => {
      const baseStrokes = pieceStrokes(basePiece, size)
      if (detail >= 1) {
        const deco = decoStroke(baseStrokes)
        if (deco) baseStrokes.push(deco)
      }

      const parts: PenPart[] = [
        {
          id: 'base',
          name: basePiece.name,
          quantity: 1,
          // 레시피와 같은 규칙 — 부품 좌표는 (0,0) 기준이다 (`recipes.ts` 머리말).
          strokes: normalizeStrokes(baseStrokes),
          // 조각 조합은 검수된 조각의 기하이고 색 영역이 없다 (ADR-039).
          art: [],
          origin: { x: 0, y: 0 },
          optional: false,
        },
      ]
      const joints: PenJoint[] = []

      composition.parts.forEach((entry, index) => {
        if (entry.optional && !extras) return
        const piece = pieceById(entry.piece)!
        const strokes = pieceStrokes(piece, size * entry.ratio)
        const partId = `p${index + 1}`
        const partSize = sizeOf(strokesBBox(strokes))

        parts.push({
          id: partId,
          name: piece.name,
          quantity: entry.quantity,
          strokes: normalizeStrokes(strokes),
          art: [],
          origin: { x: 0, y: 0 },
          optional: entry.optional,
        })

        /**
         * 조합의 접합은 **겹쳐 붙이는 접합**이다 (`flush: false`).
         *
         * 몸통이 타원·원처럼 곡선이면 조각과 변끼리 딱 맞는 자리가 없다. 실제로도 지느러미는
         * 몸통 위에 겹쳐 올려 녹여 붙인다. 겹치는 길이는 조각의 짧은 쪽을 넘을 수 없고,
         * 최소 접합 길이(8mm)보다 짧으면 떼어낼 때 떨어진다.
         */
        const contact = Math.max(
          WELD_MIN_LENGTH_MM,
          Math.round(Math.min(partSize.w, partSize.h) * 0.6 * 10) / 10,
        )
        joints.push({
          id: `base-${partId}`,
          kind: 'weld',
          a: 'base',
          b: partId,
          count: entry.quantity,
          length_mm: contact,
          flush: false,
          how: `${piece.name}을 ${basePiece.name} ${ATTACH_LABEL[entry.attach]}에 ${contact}mm 쯤 겹쳐 올리고, 겹친 자리를 펜으로 녹여 붙입니다.`,
        })
      })

      return { parts, joints }
    },
  }
}
