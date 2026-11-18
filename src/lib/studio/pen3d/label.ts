/**
 * 부품 라벨 — **배치와 렌더가 같은 글자를 같은 크기로 본다.**
 *
 * 이 파일이 있는 이유: 라벨(번호 배지·이름·수량·치수)은 부품 윤곽 밖에 그려지는데,
 * 배치기가 그 자리를 예약하지 않으면 라벨이 옆 부품의 선 위나 아랫줄 라벨 위로 올라간다.
 * 인쇄된 종이에서 그건 "어느 선을 그어야 하는지 알 수 없다"는 뜻이다.
 *
 * 그래서 `layout.ts`(자리 예약)와 `render.ts`(그리기)가 **둘 다 이 함수를 호출한다.**
 * 치수·글자 크기는 `constants.ts` 의 `PEN_LABEL` 한 곳에서만 온다.
 *
 * SVG 에는 글자 폭을 재는 수단이 없으므로 폭은 추정한다. 추정은 **항상 실제보다 넉넉하게**
 * 나오도록 잡는다 — 좁게 잡으면 글자가 예약한 칸을 넘어가고, 그게 바로 막으려는 사고다.
 */

import { PEN_LABEL } from '@/lib/studio/constants'
import { bbox, sizeOf, strokesBBox } from '@/lib/studio/geometry'
import type { Box } from '@/lib/studio/geometry'
import type { PenPart } from '@/types/studio'

/**
 * 부품이 종이에서 차지하는 박스 — **덧그릴 선과 색 영역의 합집합이다** (ADR-039).
 *
 * 색 영역만 보는 함수를 따로 두지 않는 이유: 배치기와 렌더가 **다른 박스**를 쓰면 색이 칸을
 * 넘어 옆 부품 위로 번지거나, 색과 선이 서로 어긋난 자리에 찍힌다. 둘 다 인쇄한 뒤에야 보인다.
 *
 * `art` 가 비어 있으면 지금까지와 똑같이 윤곽 박스다.
 */
export function partBox(part: PenPart): Box {
  const box = strokesBBox(part.strokes)
  if (part.art.length === 0) return box

  const points = part.art.flatMap((region) => [...region.outline, ...region.holes.flat()])
  if (points.length === 0) return box

  const art = bbox(points)
  return {
    min: { x: Math.min(box.min.x, art.min.x), y: Math.min(box.min.y, art.min.y) },
    max: { x: Math.max(box.max.x, art.max.x), y: Math.max(box.max.y, art.max.y) },
  }
}

/** 한글·한자·전각 글자. Malgun Gothic 에서 글자 크기와 같은 폭을 쓴다 */
const FULL_WIDTH = /[ᄀ-ᇿ⺀-〿㄰-㆏ㇰ-鿿가-힣豈-﫿＀-｠]/

/** 글자 하나의 가로 폭 (글자 크기 배수). 실제 폰트 메트릭이 아니라 **상한**이다 */
function advance(ch: string): number {
  if (FULL_WIDTH.test(ch)) return 1
  if (ch === ' ') return 0.3
  return 0.6
}

export function textWidthMm(text: string, fontMm: number): number {
  let width = 0
  for (const ch of text) width += advance(ch) * fontMm
  return width
}

/**
 * 폭(mm)에 맞춰 줄을 나눈다. 띄어쓰기에서 먼저 끊고, 한 낱말이 한 줄보다 길면 글자에서 끊는다.
 * 한국어는 띄어쓰기 없이 길게 이어지는 구간이 흔하므로 글자 단위 폴백이 필요하다.
 */
export function wrapToWidth(
  text: string,
  fontMm: number,
  widthAt: (line: number) => number,
): string[] {
  const out: string[] = []
  let line = ''

  const room = () => widthAt(out.length)
  const push = () => {
    out.push(line)
    line = ''
  }

  for (const word of text.split(' ')) {
    const candidate = line === '' ? word : `${line} ${word}`
    if (textWidthMm(candidate, fontMm) <= room()) {
      line = candidate
      continue
    }
    if (line !== '') push()
    // 낱말 하나가 한 줄을 넘으면 글자에서 끊는다.
    for (const ch of word) {
      if (line !== '' && textWidthMm(line + ch, fontMm) > room()) push()
      line += ch
    }
  }
  if (line !== '') push()
  return out.length > 0 ? out : ['']
}

/**
 * 폭(mm)을 넘으면 잘라서 `…` 를 붙인다. 줄을 바꿀 자리가 없는 한 줄(푸터)에만 쓴다 —
 * 제목은 LLM 이 지은 문장이라 길이를 신뢰할 수 없고, 넘치면 50mm 기준선 위로 올라간다.
 */
export function clampToWidth(text: string, fontMm: number, widthMm: number): string {
  if (textWidthMm(text, fontMm) <= widthMm) return text
  const room = widthMm - textWidthMm('…', fontMm)
  let out = ''
  for (const ch of text) {
    if (textWidthMm(out + ch, fontMm) > room) break
    out += ch
  }
  return `${out}…`
}

export type LabelLine = {
  text: string
  /** 칸 왼쪽 끝에서의 가로 offset (mm) */
  dx: number
  /** 칸 위쪽(부품 아래 끝)에서 기준선까지의 세로 offset (mm) */
  dy: number
  font_mm: number
  /** SVG class — 이름 줄은 `lbl`, 치수 줄은 `sub` */
  cls: 'lbl' | 'sub'
}

export type LabelBlock = {
  lines: LabelLine[]
  /** 부품 아래로 이 블록이 쓰는 높이 (mm) */
  height_mm: number
}

/** 이름 줄 — "정사각 패널 6장". 수량이 곧 같은 선 위에 몇 번 덧그리는지다 */
export function labelNameText(part: PenPart): string {
  return `${part.name} ${part.quantity}장${part.optional ? ' (선택)' : ''}`
}

const mm1 = (value: number) => Math.round(value * 10) / 10

/** 치수 줄 — "45×45mm · 6번 덧그리기" */
export function labelDimText(part: PenPart): string {
  const size = sizeOf(strokesBBox(part.strokes))
  const repeat = part.quantity > 1 ? ` · ${part.quantity}번 덧그리기` : ''
  return `${mm1(size.w)}×${mm1(size.h)}mm${repeat}`
}

/**
 * 부품 아래에 들어갈 라벨 블록. `cellWidth` 는 배치가 그 부품에 준 칸의 폭이고,
 * 글자는 **그 폭 안에서만** 흐른다. 넘치면 줄을 바꾼다 — 옆으로 삐져나가지 않는다.
 */
export function labelBlock(part: PenPart, cellWidth: number): LabelBlock {
  const { name_font_mm, dim_font_mm, line_mm, lead_mm, descent_mm, badge_text_x_mm } = PEN_LABEL

  // 첫 줄만 번호 배지를 비켜 시작한다.
  const nameLines = wrapToWidth(labelNameText(part), name_font_mm, (i) =>
    i === 0 ? cellWidth - badge_text_x_mm : cellWidth,
  )
  const dimLines = wrapToWidth(labelDimText(part), dim_font_mm, () => cellWidth)

  const lines: LabelLine[] = []
  nameLines.forEach((text, i) => {
    lines.push({
      text,
      dx: i === 0 ? badge_text_x_mm : 0,
      dy: lead_mm + line_mm * lines.length,
      font_mm: name_font_mm,
      cls: 'lbl',
    })
  })
  dimLines.forEach((text) => {
    lines.push({ text, dx: 0, dy: lead_mm + line_mm * lines.length, font_mm: dim_font_mm, cls: 'sub' })
  })

  return { lines, height_mm: lead_mm + line_mm * (lines.length - 1) + descent_mm }
}

/** 부품이 종이에서 차지하는 칸 — 윤곽 + 그 아래 라벨 블록. 배치와 렌더가 같이 쓴다. */
export function partCell(part: PenPart): {
  width_mm: number
  height_mm: number
  /** 윤곽 크기 */
  shape: { w: number; h: number }
  label: LabelBlock
} {
  const shape = sizeOf(partBox(part))
  const width_mm = Math.max(shape.w, PEN_LABEL.min_width_mm)
  const label = labelBlock(part, width_mm)
  return { width_mm, height_mm: shape.h + label.height_mm, shape, label }
}
