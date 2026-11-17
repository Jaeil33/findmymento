/**
 * 패턴 → A4 1:1 SVG.
 *
 * **축척이 이 기능의 전부다.** `width="210mm"` + `viewBox="0 0 210 297"` 이므로 SVG 좌표
 * 1 단위가 정확히 1mm 다. 프린터가 "용지에 맞추기"로 축척을 바꾸는 사고는 소프트웨어로 막을
 * 수 없으므로, 종이 아래쪽에 **50mm 기준선**을 함께 그린다. 강사가 자로 한 번 재면 끝난다.
 *
 * 선은 `stroke` 만 쓰고 `fill` 은 없다 — 덧그릴 선이기 때문이다.
 * 윤곽은 실선, 접는 선은 파선이다.
 */

import { PAGE, PEN_SAFETY_NOTES } from '@/lib/studio/constants'
import { sizeOf, strokesBBox } from '@/lib/studio/geometry'
import type { PenArtifact, Stroke, StudioStatus } from '@/types/studio'
import { isUsable } from '@/types/studio'

export type RenderOptions = {
  /** 검증 상태. 통과하지 않은 산출물에는 워터마크를 찍는다 (ADR-030) */
  status: StudioStatus
}

const n = (value: number) => Math.round(value * 100) / 100

function esc(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

/** 한 줄이 종이 폭을 넘지 않게 자른다. SVG 에는 줄바꿈이 없다. */
function wrap(text: string, max: number): string[] {
  const out: string[] = []
  let line = ''
  for (const word of text.split(' ')) {
    const next = line === '' ? word : `${line} ${word}`
    if (next.length > max && line !== '') {
      out.push(line)
      line = word
    } else {
      line = next
    }
  }
  if (line !== '') out.push(line)
  return out
}

function pathData(stroke: Stroke, dx: number, dy: number): string {
  if (stroke.points.length === 0) return ''
  const [first, ...rest] = stroke.points
  const head = `M${n(first!.x + dx)},${n(first!.y + dy)}`
  const body = rest.map((p) => `L${n(p.x + dx)},${n(p.y + dy)}`).join('')
  return `${head}${body}${stroke.closed ? 'Z' : ''}`
}

export function renderPenSvg(artifact: PenArtifact, options: RenderOptions): string {
  const { pattern, metrics } = artifact
  const margin = PAGE.margin_mm
  const lines: string[] = []

  lines.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${PAGE.width_mm}mm" height="${PAGE.height_mm}mm" viewBox="0 0 ${PAGE.width_mm} ${PAGE.height_mm}">`,
  )
  lines.push(
    '<style>text{font-family:"Malgun Gothic","Noto Sans KR",sans-serif;fill:#111}' +
      '.lbl{font-size:3.4px;font-weight:600}.sub{font-size:2.9px;fill:#777}.num{font-size:3.2px;font-weight:700}' +
      '.ft{font-size:3.4px}.leg{font-size:2.9px;fill:#777}.wm{font-size:11px;fill:#d11;opacity:.55}</style>',
  )
  lines.push(`<rect x="0" y="0" width="${PAGE.width_mm}" height="${PAGE.height_mm}" fill="#fff"/>`)

  /**
   * 부품 번호. 조립 순서·접합 범례가 같은 번호를 가리킨다 — 교실에서 이 종이 한 장만 보고도
   * "3번 두 장을 1번 옆면에 붙인다"가 통해야 한다.
   */
  const numberOf = new Map(pattern.parts.map((p, i) => [p.id, i + 1]))

  /** 부품 아래쪽에 남는 여백. 하단 범례를 여기에 넣는다 */
  let lowest: number = margin

  for (const part of pattern.parts) {
    const dx = margin + part.origin.x
    const dy = margin + part.origin.y
    const box = strokesBBox(part.strokes)
    const size = sizeOf(box)
    const num = numberOf.get(part.id) ?? 0
    // 위에 자리가 없으면 라벨 두 줄이 부품 아래로 내려간다. 범례가 그 위에 겹치면 안 된다.
    const labelBelow = !(dy > margin + 5)
    lowest = Math.max(lowest, dy + size.h + (labelBelow ? 8 : 0))

    lines.push(`<g id="part-${esc(part.id)}">`)
    for (const stroke of part.strokes) {
      const dash = stroke.kind === 'fold' ? ' stroke-dasharray="3 2"' : ''
      lines.push(
        `<path d="${pathData(stroke, dx, dy)}" fill="none" stroke="#111" stroke-width="0.4" stroke-linejoin="round" stroke-linecap="round"${dash}/>`,
      )
    }

    // 번호 배지 + 이름·개수 + 치수. 위쪽에 자리가 없으면 부품 아래로 내린다.
    const above = !labelBelow
    const labelY = above ? dy - 3.8 : dy + size.h + 3.6
    const subY = above ? dy - 0.8 : dy + size.h + 6.6
    lines.push(
      `<circle cx="${n(dx + 2)}" cy="${n(labelY - 1.1)}" r="2.3" fill="none" stroke="#111" stroke-width="0.3"/>`,
    )
    lines.push(
      `<text class="num" x="${n(dx + 2)}" y="${n(labelY)}" text-anchor="middle">${num}</text>`,
    )
    lines.push(
      `<text class="lbl" x="${n(dx + 5.6)}" y="${n(labelY)}">${esc(part.name)} ${part.quantity}장${part.optional ? ' (선택)' : ''}</text>`,
    )
    lines.push(
      `<text class="sub" x="${n(dx)}" y="${n(subY)}">${n(size.w)}×${n(size.h)}mm · 같은 선 위에 ${part.quantity}번 덧그려 ${part.quantity}장을 만듭니다</text>`,
    )
    lines.push('</g>')
  }

  // ── 접합 범례 — 어느 부품끼리 어떻게 붙는지 ────────────────────────────────
  //    부품 아래 남은 자리에만 넣는다. 자리가 없으면 적지 않는다 — 도안 위에 글자를
  //    겹쳐 쓰면 그리는 선과 섞인다.
  const legendTop = lowest + 9
  const legendRoom = PAGE.height_mm - margin - 8 - legendTop
  const legendLines = [
    `접합 ${pattern.joints.length}종 (숫자는 부품 번호) · 실선은 그리는 선, 파선은 접는 선입니다. 회색 글자는 안내입니다.`,
    ...pattern.joints.map((j) => {
      const a = numberOf.get(j.a) ?? 0
      const b = numberOf.get(j.b) ?? 0
      const kind = j.kind === 'slot' ? '끼움' : j.flush ? '맞댐' : '겹침'
      return `${a}-${b} · ${j.count}곳 · ${kind} · 길이 ${j.length_mm}mm`
    }),
    // 조립 순서까지 있어야 **이 종이 한 장으로** 수업이 된다. 화면을 못 보는 교실이 있다.
    '조립 순서',
    ...artifact.assembly.flatMap((step, i) => wrap(`${i + 1}. ${step}`, 92)),
    // 안전 문구는 한 곳에서만 만든다 (`lib/studio/constants.ts`). 종이에는 첫 줄을 싣는다.
    PEN_SAFETY_NOTES[0],
  ]
  if (legendRoom >= legendLines.length * 4) {
    lines.push(`<path d="M${n(margin)},${n(legendTop - 4)}L${n(PAGE.width_mm - margin)},${n(legendTop - 4)}" stroke="#777" stroke-width="0.2" stroke-dasharray="2 2"/>`)
    legendLines.forEach((text, i) => {
      lines.push(`<text class="leg" x="${n(margin)}" y="${n(legendTop + i * 4)}">${esc(text)}</text>`)
    })
  }

  // ── 푸터: 제목·분량·예상 시간 + 인쇄 축척 기준선 ──────────────────────────
  const footerY = PAGE.height_mm - 4.5
  const barY = PAGE.height_mm - 2.5
  const barX = PAGE.width_mm - margin - 50
  lines.push(
    `<text class="ft" x="${margin}" y="${n(footerY)}">${esc(pattern.title)} · 부품 ${metrics.part_count}개 · 접합 ${metrics.joint_count}곳 · 예상 ${Math.round(metrics.estimated_minutes)}분</text>`,
  )
  lines.push(
    `<path d="M${n(barX)},${n(barY)}L${n(barX + 50)},${n(barY)}" stroke="#111" stroke-width="0.4"/>`,
  )
  lines.push(
    `<path d="M${n(barX)},${n(barY - 1.2)}L${n(barX)},${n(barY + 1.2)}" stroke="#111" stroke-width="0.4"/>`,
  )
  lines.push(
    `<path d="M${n(barX + 50)},${n(barY - 1.2)}L${n(barX + 50)},${n(barY + 1.2)}" stroke="#111" stroke-width="0.4"/>`,
  )
  lines.push(
    `<text class="ft" x="${n(barX)}" y="${n(barY - 2)}">50mm (자로 재서 1:1 인쇄 확인)</text>`,
  )

  // ── 검증 미통과 워터마크 ──────────────────────────────────────────────────
  if (!isUsable(options.status)) {
    lines.push(
      `<text class="wm" x="${PAGE.width_mm / 2}" y="${PAGE.height_mm / 2}" text-anchor="middle" transform="rotate(-30 ${PAGE.width_mm / 2} ${PAGE.height_mm / 2})">검증 미통과 — 수업에 사용하지 마세요</text>`,
    )
  }

  lines.push('</svg>')
  return lines.join('\n')
}
