/**
 * 패턴 → A4 1:1 SVG.
 *
 * **축척이 이 기능의 전부다.** `width="210mm"` + `viewBox="0 0 210 297"` 이므로 SVG 좌표
 * 1 단위가 정확히 1mm 다. 프린터가 "용지에 맞추기"로 축척을 바꾸는 사고는 소프트웨어로 막을
 * 수 없으므로, 종이 아래쪽에 **50mm 기준선**을 함께 그린다. 강사가 자로 한 번 재면 끝난다.
 *
 * **두 레이어를 그린다** (ADR-039). `art` 는 색으로 채운 영역이고 먼저 깔린다. `trace`
 * (= `part.strokes`)는 학생이 덧그릴 선이고 그 **위에** 올라간다 — 순서를 뒤집으면 진한 색이
 * 윤곽선을 덮어 따라갈 선이 보이지 않는다.
 *
 * 덧그릴 선은 `stroke` 만 쓰고 `fill` 은 없다. 윤곽은 실선, 접는 선은 파선이다.
 * 색 영역이 없으면(`art: []`) 지금까지와 같은 흑백 도안이다 — 레시피·조각 조합이 그 경우다.
 *
 * 인쇄는 컬러 전제다 (ADR-039). 흑백 프린터에서는 색 영역이 회색으로 깔린다.
 */

import { PAGE, PAGE_USABLE, PEN_LABEL, PEN_SAFETY_NOTES } from '@/lib/studio/constants'
import { hexFor, needsEdge, PALETTE } from '@/lib/studio/palette'
import { clampToWidth, partBox, partCell, wrapToWidth } from '@/lib/studio/pen3d/label'
import { layoutPattern } from '@/lib/studio/pen3d/layout'
import type { PenArtifact, Point, Stroke, StudioStatus } from '@/types/studio'
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

/**
 * 한 줄이 종이 폭을 넘지 않게 자른다. SVG 에는 줄바꿈이 없다.
 *
 * 글자 수로 자르면 안 된다 — 한글 한 글자는 2.9mm 고 숫자·영문은 1.7mm 라서, 같은 글자 수의
 * 두 줄이 종이에서 2배 가까이 차이난다. 그래서 `label.ts` 의 폭 추정으로 **mm 기준**으로 자른다.
 */
function wrap(text: string, fontMm: number, widthMm: number): string[] {
  return wrapToWidth(text, fontMm, () => widthMm)
}

/** 점 목록을 그대로 path 로. 색 영역은 `Stroke` 가 아니라 점 목록이다 */
function polyData(points: Point[]): string {
  if (points.length === 0) return ''
  const [first, ...rest] = points
  return `M${n(first!.x)},${n(first!.y)}${rest.map((p) => `L${n(p.x)},${n(p.y)}`).join('')}`
}

function pathData(stroke: Stroke, dx: number, dy: number): string {
  if (stroke.points.length === 0) return ''
  const [first, ...rest] = stroke.points
  const head = `M${n(first!.x + dx)},${n(first!.y + dy)}`
  const body = rest.map((p) => `L${n(p.x + dx)},${n(p.y + dy)}`).join('')
  return `${head}${body}${stroke.closed ? 'Z' : ''}`
}

export function renderPenSvg(artifact: PenArtifact, options: RenderOptions): string {
  const { metrics } = artifact
  /**
   * **저장된 `origin` 을 믿지 않고 그릴 때 다시 배치한다.**
   *
   * 산출물은 생성 시점에 한 번 배치되고 그 좌표가 그대로 저장된다. 배치 규칙이 바뀌면 이미
   * 저장된 행은 옛 좌표를 들고 있어서, 그 좌표대로 그리면 라벨이 다시 부품 선 위로 올라간다.
   * 배치는 윤곽만 보는 순수 함수이므로 다시 돌려도 같은 결과고, 그래서 어제 만든 도안도
   * 오늘의 규칙으로 멀쩡하게 나온다.
   */
  const laid = layoutPattern(artifact.pattern)
  const pattern = laid.pattern
  const margin = PAGE.margin_mm
  const lines: string[] = []

  lines.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${PAGE.width_mm}mm" height="${PAGE.height_mm}mm" viewBox="0 0 ${PAGE.width_mm} ${PAGE.height_mm}">`,
  )
  // 글자 크기는 배치가 예약한 칸 크기와 같은 상수에서 온다. 여기서 숫자를 쓰면 어긋난다.
  lines.push(
    '<style>text{font-family:"Malgun Gothic","Noto Sans KR",sans-serif;fill:#111}' +
      `.lbl{font-size:${PEN_LABEL.name_font_mm}px;font-weight:600}` +
      `.sub{font-size:${PEN_LABEL.dim_font_mm}px;fill:#777}` +
      `.num{font-size:${PEN_LABEL.num_font_mm}px;font-weight:700}` +
      `.ft{font-size:${PEN_LABEL.name_font_mm}px}.leg{font-size:${PEN_LABEL.dim_font_mm}px;fill:#777}` +
      '.wm{font-size:11px;fill:#d11;opacity:.55}</style>',
  )
  lines.push(`<rect x="0" y="0" width="${PAGE.width_mm}" height="${PAGE.height_mm}" fill="#fff"/>`)

  /**
   * 부품 번호. 조립 순서·접합 범례가 같은 번호를 가리킨다 — 교실에서 이 종이 한 장만 보고도
   * "3번 두 장을 1번 옆면에 붙인다"가 통해야 한다.
   */
  const numberOf = new Map(pattern.parts.map((p, i) => [p.id, i + 1]))

  /** 부품 칸 아래쪽에 남는 여백. 하단 범례를 여기에 넣는다 */
  let lowest: number = margin
  /** 종이에 들어가지 않아 싣지 못한 부품. 범례에 적는다 — 말없이 빼지 않는다 */
  const dropped: string[] = []

  pattern.parts.forEach((part, index) => {
    const num = numberOf.get(part.id) ?? 0
    /**
     * 배치에 실패한 부품은 그리지 않는다. 좌표가 (0,0) 이므로 그대로 그리면 왼쪽 위에
     * 여러 장이 포개져서 선과 글자가 전부 겹친 종이가 된다. 검증은 이미
     * `PEN_PART_OUT_OF_PAGE` 로 실패시켰고, 빠진 사실은 아래 범례에 적는다.
     */
    if (laid.placed[index] === null) {
      dropped.push(`${num}번 ${part.name}`)
      return
    }

    const dx = margin + part.origin.x
    const dy = margin + part.origin.y
    // 배치기와 **같은 박스**다 (`label.ts` 의 `partBox`) — 색 영역까지 포함한 합집합이다
    const box = partBox(part)

    /**
     * 칸은 배치기(`layout.ts`)가 예약한 것과 **같은 함수**에서 나온다. 라벨은 윤곽 아래의
     * 예약된 블록 안에서만 흐르고, 칸 폭을 넘으면 줄을 바꾼다 — 옆 부품 위로 넘어가지 않는다.
     */
    const cell = partCell(part)
    const labelTop = dy + cell.shape.h
    lowest = Math.max(lowest, labelTop + cell.label.height_mm)

    lines.push(`<g id="part-${esc(part.id)}">`)

    /**
     * 색 영역을 **먼저** 깐다 (ADR-039). 덧그릴 선이 그 위에 올라가야 학생이 따라갈 선을
     * 색에 묻히지 않고 본다 — 순서를 뒤집으면 진한 색 영역이 윤곽선을 덮는다.
     *
     * `z` 오름차순이다. 같은 `z` 는 배열 순서를 유지한다(안정 정렬).
     */
    const regions = [...part.art].sort((a, b) => a.z - b.z)
    for (const region of regions) {
      if (region.outline.length < 3) continue
      const shift = (points: Point[]) =>
        points.map((p) => ({ x: p.x + dx - box.min.x, y: p.y + dy - box.min.y }))
      // 구멍은 같은 path 의 서브패스로 넣고 `fill-rule="evenodd"` 로 뺀다 — 겹쳐 그린
      // 흰 도형으로 가리면 그 아래의 다른 색 영역까지 지워진다.
      const subpaths = [shift(region.outline), ...region.holes.map(shift)]
        .filter((points) => points.length >= 3)
        .map((points) => `${polyData(points)}Z`)
        .join('')
      const edge = needsEdge(region.color)
        ? ` stroke="${PALETTE.연회색}" stroke-width="0.2"`
        : ' stroke="none"'
      lines.push(
        `<path class="art" d="${subpaths}" fill="${hexFor(region.color)}" fill-rule="evenodd"${edge}/>`,
      )
    }

    for (const stroke of part.strokes) {
      // 윤곽 좌표가 (0,0) 기준이 아니어도 칸 왼쪽 위에 맞춘다. 배치는 bbox 로 자리를 잡는다.
      const dash = stroke.kind === 'fold' ? ' stroke-dasharray="3 2"' : ''
      lines.push(
        `<path d="${pathData(stroke, dx - box.min.x, dy - box.min.y)}" fill="none" stroke="#111" stroke-width="0.4" stroke-linejoin="round" stroke-linecap="round"${dash}/>`,
      )
    }

    // 번호 배지 — 칸 왼쪽 끝에 맞춘다. 중심을 반지름만큼 들여야 여백을 넘지 않는다.
    const firstBaseline = labelTop + PEN_LABEL.lead_mm
    const badgeX = dx + PEN_LABEL.badge_radius_mm
    lines.push(
      `<circle cx="${n(badgeX)}" cy="${n(firstBaseline - PEN_LABEL.name_font_mm / 3)}" r="${PEN_LABEL.badge_radius_mm}" fill="none" stroke="#111" stroke-width="0.3"/>`,
    )
    lines.push(
      `<text class="num" x="${n(badgeX)}" y="${n(firstBaseline)}" text-anchor="middle">${num}</text>`,
    )
    for (const line of cell.label.lines) {
      lines.push(
        `<text class="${line.cls}" x="${n(dx + line.dx)}" y="${n(labelTop + line.dy)}">${esc(line.text)}</text>`,
      )
    }
    lines.push('</g>')
  })

  // ── 접합 범례 — 어느 부품끼리 어떻게 붙는지 ────────────────────────────────
  //    부품 아래 남은 자리에만 넣는다. 자리가 없으면 적지 않는다 — 도안 위에 글자를
  //    겹쳐 쓰면 그리는 선과 섞인다.
  const legendTop = lowest + 9
  const legendRoom = PAGE.height_mm - margin - 8 - legendTop
  // 범례도 사용 영역 안에서만 흐른다. 한 줄이 길면 잘리는 게 아니라 종이 밖으로 나간다.
  const legendWrap = (text: string) => wrap(text, PEN_LABEL.dim_font_mm, PAGE_USABLE.width_mm)
  const legendLines = [
    ...legendWrap(
      `접합 ${pattern.joints.length}종 (숫자는 부품 번호) · 실선은 그리는 선, 파선은 접는 선입니다. 회색 글자는 안내입니다.`,
    ),
    // 싣지 못한 부품을 먼저 적는다. 종이에 없는 부품을 찾다가 수업이 멈추면 안 된다.
    ...(dropped.length > 0
      ? legendWrap(
          `${dropped.join(' · ')}은 A4 한 장에 들어가지 않아 이 종이에 싣지 못했습니다. 크기를 줄이거나 부품을 나눠 다시 만들어 주세요.`,
        )
      : []),
    ...pattern.joints.flatMap((j) => {
      const a = numberOf.get(j.a) ?? 0
      const b = numberOf.get(j.b) ?? 0
      const kind = j.kind === 'slot' ? '끼움' : j.flush ? '맞댐' : '겹침'
      return legendWrap(`${a}-${b} · ${j.count}곳 · ${kind} · 길이 ${j.length_mm}mm`)
    }),
    // 조립 순서까지 있어야 **이 종이 한 장으로** 수업이 된다. 화면을 못 보는 교실이 있다.
    '조립 순서',
    ...artifact.assembly.flatMap((step, i) => legendWrap(`${i + 1}. ${step}`)),
    // 안전 문구는 한 곳에서만 만든다 (`lib/studio/constants.ts`). 종이에는 첫 줄을 싣는다.
    ...legendWrap(PEN_SAFETY_NOTES[0]),
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
  // 제목은 LLM 이 지은 문장이다. 길면 오른쪽 50mm 기준선 위로 올라가므로 폭에서 자른다.
  const footer = clampToWidth(
    `${pattern.title} · 부품 ${metrics.part_count}개 · 접합 ${metrics.joint_count}곳 · 예상 ${Math.round(metrics.estimated_minutes)}분`,
    PEN_LABEL.name_font_mm,
    barX - margin - 4,
  )
  lines.push(`<text class="ft" x="${margin}" y="${n(footerY)}">${esc(footer)}</text>`)
  lines.push(
    `<path d="M${n(barX)},${n(barY)}L${n(barX + 50)},${n(barY)}" stroke="#111" stroke-width="0.4"/>`,
  )
  lines.push(
    `<path d="M${n(barX)},${n(barY - 1.2)}L${n(barX)},${n(barY + 1.2)}" stroke="#111" stroke-width="0.4"/>`,
  )
  lines.push(
    `<path d="M${n(barX + 50)},${n(barY - 1.2)}L${n(barX + 50)},${n(barY + 1.2)}" stroke="#111" stroke-width="0.4"/>`,
  )
  // 기준선 위 글자는 기준선(50mm)보다 길면 종이를 넘는다. 같은 폭 안에서만 적는다.
  lines.push(
    `<text class="ft" x="${n(barX)}" y="${n(barY - 2)}">${esc(clampToWidth('50mm · 자로 재서 1:1 확인', PEN_LABEL.name_font_mm, 50))}</text>`,
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
