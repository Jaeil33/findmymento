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

import { PAGE } from '@/lib/studio/constants'
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
      '.lbl{font-size:3.2px}.ft{font-size:3.4px}.wm{font-size:11px;fill:#d11;opacity:.55}</style>',
  )
  lines.push(`<rect x="0" y="0" width="${PAGE.width_mm}" height="${PAGE.height_mm}" fill="#fff"/>`)

  for (const part of pattern.parts) {
    const dx = margin + part.origin.x
    const dy = margin + part.origin.y
    const box = strokesBBox(part.strokes)
    const size = sizeOf(box)

    lines.push(`<g id="part-${esc(part.id)}">`)
    for (const stroke of part.strokes) {
      const dash = stroke.kind === 'fold' ? ' stroke-dasharray="3 2"' : ''
      lines.push(
        `<path d="${pathData(stroke, dx, dy)}" fill="none" stroke="#111" stroke-width="0.4" stroke-linejoin="round" stroke-linecap="round"${dash}/>`,
      )
    }
    // 부품 이름과 수량. 같은 선 위에 몇 번 덧그려야 하는지가 도안의 정보다.
    const labelY = dy > margin + 3 ? dy - 1.2 : dy + size.h + 3.2
    lines.push(
      `<text class="lbl" x="${n(dx)}" y="${n(labelY)}">${esc(part.name)} ×${part.quantity} · ${n(size.w)}×${n(size.h)}mm</text>`,
    )
    lines.push('</g>')
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
