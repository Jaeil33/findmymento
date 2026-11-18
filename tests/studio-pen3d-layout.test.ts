import { describe, expect, it } from 'vitest'
import { PAGE, PAGE_USABLE } from '@/lib/studio/constants'
import { packShelf, rectPoints, sizeOf, strokesBBox } from '@/lib/studio/geometry'
import { parseComposition } from '@/lib/studio/pen3d/compose'
import { textWidthMm } from '@/lib/studio/pen3d/label'
import { generatePen } from '@/lib/studio/pen3d/pipeline'
import { renderPenSvg } from '@/lib/studio/pen3d/render'
import type { PenArtifact, StudioSpec } from '@/types/studio'

/**
 * **종이 위에서 무엇도 다른 것 위에 올라가지 않는다.**
 *
 * 이 테스트가 있는 이유: 배치기(`layout.ts`)는 부품의 윤곽 bbox 만 보고 자리를 잡았는데
 * 렌더(`render.ts`)는 부품마다 번호 배지·이름·치수를 **추가로** 그렸다. 그 라벨 블록이
 * 배치에 없는 공간이라 ① 아랫줄 부품의 라벨이 윗줄 부품의 선 위로 올라가고 ② 윗줄의
 * 아래쪽 라벨과 아랫줄의 위쪽 라벨이 같은 자리에 겹쳐 찍혔다. 인쇄하면 어느 선을 그어야
 * 하는지 알 수 없는 종이가 된다.
 *
 * 그래서 판정은 **렌더된 SVG 좌표**로만 한다 — 배치기가 무엇을 예약했는지는 보지 않는다.
 */

const EPS = 0.2

type Rect = { x: number; y: number; w: number; h: number; what: string }

function overlap(a: Rect, b: Rect): number {
  const dx = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
  const dy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
  return Math.min(dx, dy)
}

/** `<style>` 에서 클래스별 글자 크기를 읽는다. SVG 좌표 1 = 1mm 이므로 px 값이 곧 mm 다. */
function fontSizes(svg: string): Record<string, number> {
  const out: Record<string, number> = {}
  for (const m of svg.matchAll(/\.([a-z]+)\{[^}]*font-size:([\d.]+)px/g)) {
    out[m[1]!] = Number(m[2])
  }
  return out
}

/** 글자 상자. 윗선은 기준선 위 0.8em, 아랫선은 0.2em 으로 본다. */
function textRect(
  text: string,
  x: number,
  y: number,
  font: number,
  middle: boolean,
  what: string,
): Rect {
  const w = textWidthMm(text, font)
  return { x: middle ? x - w / 2 : x, y: y - font * 0.8, w, h: font, what }
}

function unescapeXml(text: string): string {
  return text
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&amp;', '&')
}

type Measured = { drawings: Rect[]; labels: Rect[]; legend: Rect[] }

/** 렌더된 SVG 를 사각형 목록으로 바꾼다. 워터마크(의도적으로 도안 위에 찍는다)는 뺀다. */
function measure(svg: string): Measured {
  const fonts = fontSizes(svg)
  const drawings: Rect[] = []
  const labels: Rect[] = []
  const legend: Rect[] = []

  const groups = [...svg.matchAll(/<g id="part-([^"]+)">([\s\S]*?)<\/g>/g)]
  expect(groups.length, 'SVG 에 부품 그룹이 없다').toBeGreaterThan(0)

  for (const group of groups) {
    const id = group[1]!
    const body = group[2]!

    const xs: number[] = []
    const ys: number[] = []
    for (const path of body.matchAll(/ d="([^"]+)"/g)) {
      for (const pair of path[1]!.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)) {
        xs.push(Number(pair[1]))
        ys.push(Number(pair[2]))
      }
    }
    expect(xs.length, id + ' 에 그리는 선이 없다').toBeGreaterThan(1)
    drawings.push({
      x: Math.min(...xs),
      y: Math.min(...ys),
      w: Math.max(...xs) - Math.min(...xs),
      h: Math.max(...ys) - Math.min(...ys),
      what: id + ' 윤곽',
    })

    // 번호 배지(원)도 라벨 블록의 일부다. 부품 선 위로 올라가면 안 된다.
    for (const c of body.matchAll(/<circle cx="([\d.]+)" cy="([\d.]+)" r="([\d.]+)"/g)) {
      const cx = Number(c[1])
      const cy = Number(c[2])
      const r = Number(c[3])
      labels.push({ x: cx - r, y: cy - r, w: r * 2, h: r * 2, what: id + ' 번호 배지' })
    }

    for (const t of body.matchAll(
      /<text class="([a-z]+)" x="([\d.]+)" y="([\d.]+)"( text-anchor="middle")?>([^<]*)<\/text>/g,
    )) {
      const cls = t[1]!
      const font = fonts[cls]
      expect(font, '.' + cls + ' 글자 크기가 style 에 없다').toBeTruthy()
      const text = unescapeXml(t[5]!)
      const rect = textRect(
        text,
        Number(t[2]),
        Number(t[3]),
        font as number,
        Boolean(t[4]),
        id + ' "' + text + '"',
      )
      // 부품 번호는 배지(원) 안에 들어가는 글자다. 배지와 겹치는 것이 정상이므로
      // 배지 사각형에 합친다 — 대신 번호가 배지 밖으로 나가지 않는지는 여기서 본다.
      if (cls === 'num') {
        const badge = labels.find((l) => l.what === id + ' 번호 배지')
        expect(badge, id + ' 에 번호 배지가 없다').toBeTruthy()
        const b = badge as Rect
        expect(rect.x, '번호가 배지 왼쪽으로 나간다').toBeGreaterThanOrEqual(b.x - EPS)
        expect(rect.x + rect.w, '번호가 배지 오른쪽으로 나간다').toBeLessThanOrEqual(b.x + b.w + EPS)
        continue
      }
      labels.push(rect)
    }
  }

  for (const t of svg.matchAll(
    /<text class="(leg|ft)" x="([\d.]+)" y="([\d.]+)">([^<]*)<\/text>/g,
  )) {
    const text = unescapeXml(t[4]!)
    legend.push(
      textRect(text, Number(t[2]), Number(t[3]), fonts[t[1]!] as number, false, '범례 "' + text + '"'),
    )
  }

  return { drawings, labels, legend }
}

const CASES: [string, Partial<StudioSpec>, unknown?][] = [
  ['이름 키링', { topic: '이름 키링', grade_band: 'elementary', duration_minutes: 45 }],
  ['정육면체 조명', { topic: '정육면체 조명' }],
  ['집 모형', { topic: '우리 동네 집 모형' }],
  ['육각 보관함', { topic: '육각 보관함', grade_band: 'high', duration_minutes: 120 }],
  ['드론 프레임', { topic: '드론 프로펠러 모형', grade_band: 'high', duration_minutes: 120 }],
  ['꽃 한 송이', { topic: '꽃 한 송이', grade_band: 'elementary', duration_minutes: 60 }],
  ['십자 끼움', { topic: '십자 끼움 장식', grade_band: 'high', duration_minutes: 90 }],
  ['사각뿔', { topic: '사각뿔 피라미드', duration_minutes: 60 }],
  ['에펠탑 (탑 레시피)', { topic: '에펠탑 만들기' }],
  ['에펠탑 (탑 레시피 · 초등 45분)', { topic: '에펠탑 만들기', grade_band: 'elementary', duration_minutes: 45 }],
  [
    '물고기 (조합)',
    { topic: '물고기 만들기' },
    {
      title: '물고기',
      base: 'oval-body',
      parts: [
        { piece: 'tail-trapezoid', ratio: 0.5, quantity: 1, attach: 'back' },
        { piece: 'fin-triangle', ratio: 0.35, quantity: 2, attach: 'top' },
      ],
    },
  ],
  [
    '토끼 (조합)',
    { topic: '토끼 만들기', grade_band: 'elementary', duration_minutes: 60 },
    {
      title: '토끼',
      base: 'round-body',
      parts: [
        { piece: 'ear-pointed', ratio: 0.4, quantity: 2, attach: 'top' },
        { piece: 'limb-bar', ratio: 0.28, quantity: 2, attach: 'bottom', optional: true },
      ],
    },
  ],
  [
    '새 (조합 · 부품 5종)',
    { topic: '새 만들기', grade_band: 'high', duration_minutes: 120 },
    {
      title: '새',
      base: 'drop-body',
      parts: [
        { piece: 'wing-drop', ratio: 0.6, quantity: 2, attach: 'side' },
        { piece: 'fin-triangle', ratio: 0.2, quantity: 1, attach: 'front' },
        { piece: 'limb-bar', ratio: 0.15, quantity: 2, attach: 'bottom' },
        { piece: 'tail-trapezoid', ratio: 0.4, quantity: 1, attach: 'back' },
      ],
    },
  ],
  [
    // 실제로 강사가 "에펠탑 만들기"를 넣었을 때 나온 조합이다. 109mm 짜리 긴 막대가 1행에
    // 들어가면서 2행 부품의 라벨과 같은 자리에 찍혔다 — 이 조합이 그 사고의 원본이다.
    '에펠탑 (조합 · 긴 막대 + 2행)',
    { topic: '에펠탑 만들기' },
    {
      title: '세워 보는 철탑 모형',
      base: 'plate-rect',
      parts: [
        { piece: 'limb-bar', ratio: 0.89, quantity: 4, attach: 'top' },
        { piece: 'tail-trapezoid', ratio: 0.7, quantity: 1, attach: 'bottom' },
        { piece: 'fin-triangle', ratio: 0.35, quantity: 1, attach: 'top' },
        { piece: 'ring-hoop', ratio: 0.25, quantity: 2, attach: 'side', optional: true },
      ],
    },
  ],
  [
    '꽃다발 (조합 · 좁은 조각 여러 개 · 긴 제목)',
    { topic: '꽃다발', grade_band: 'elementary', duration_minutes: 90 },
    {
      // 제목은 LLM 이 지은 문장이다. 길이 상한(40자)까지 와도 종이가 깨지지 않아야 한다.
      title: '우리 반 모두가 하나씩 만들어 교실 창가에 두는 종이 꽃다발 도안',
      base: 'plate-rect',
      parts: [
        { piece: 'drop-body', ratio: 0.3, quantity: 5, attach: 'top' },
        { piece: 'limb-bar', ratio: 0.12, quantity: 3, attach: 'bottom' },
        { piece: 'ring-hoop', ratio: 0.25, quantity: 1, attach: 'front', optional: true },
      ],
    },
  ],
]

function svgOf(over: Partial<StudioSpec>, raw: unknown): string {
  const spec: StudioSpec = {
    kind: 'pen3d',
    grade_band: 'middle',
    student_count: 20,
    duration_minutes: 90,
    venue: '교실',
    equipment: ['3D펜 20자루', 'PLA 필라멘트', '실리콘 매트'],
    topic: '',
    session_id: null,
    ...over,
  }
  const composition = raw === undefined ? null : parseComposition(raw)
  if (raw !== undefined) expect(composition, '조합 제안이 거부됐다').not.toBeNull()
  const result = generatePen(spec, { composition })
  return renderPenSvg(result.artifact, { status: result.status })
}

/**
 * **저장된 산출물은 예전 배치로 계산된 `origin` 을 들고 있다.**
 *
 * 산출물은 생성할 때 한 번 배치되고 그 좌표가 DB 에 그대로 저장된다. 배치 규칙이 바뀌면
 * 이미 저장된 행의 좌표는 옛 규칙 그대로여서, 새 렌더가 그 좌표를 믿고 그리면 라벨이 다시
 * 겹친다. 강사가 어제 만든 도안을 오늘 다시 열면 겹친 종이가 나온다는 뜻이다.
 *
 * 그래서 렌더는 저장된 `origin` 을 믿지 않고 **그릴 때 다시 배치한다.** 배치는 윤곽만 보는
 * 순수 함수라 몇 번 돌려도 같은 결과다.
 */
describe('예전 배치로 저장된 산출물도 겹치지 않게 그린다', () => {
  /** 윤곽 bbox 만 보고 자리를 잡던 예전 배치. 라벨 자리를 예약하지 않는다. */
  function layoutByShapeOnly(artifact: PenArtifact): PenArtifact {
    const sizes = artifact.pattern.parts.map((p) => sizeOf(strokesBBox(p.strokes)))
    const origins = packShelf(sizes, {
      width: PAGE_USABLE.width_mm,
      height: PAGE_USABLE.height_mm,
      gutter: PAGE.gutter_mm,
    })
    return {
      ...artifact,
      pattern: {
        ...artifact.pattern,
        parts: artifact.pattern.parts.map((part, i) => ({
          ...part,
          origin: origins[i] ?? { x: 0, y: 0 },
        })),
      },
    }
  }

  const spec: StudioSpec = {
    kind: 'pen3d',
    grade_band: 'high',
    student_count: 20,
    duration_minutes: 120,
    venue: '교실',
    equipment: ['3D펜', 'PLA 필라멘트'],
    topic: '새 만들기',
    session_id: null,
  }
  const composition = parseComposition({
    title: '새',
    base: 'drop-body',
    parts: [
      { piece: 'wing-drop', ratio: 0.6, quantity: 2, attach: 'side' },
      { piece: 'fin-triangle', ratio: 0.2, quantity: 1, attach: 'front' },
      { piece: 'limb-bar', ratio: 0.15, quantity: 2, attach: 'bottom' },
      { piece: 'tail-trapezoid', ratio: 0.4, quantity: 1, attach: 'back' },
    ],
  })
  const fresh = generatePen(spec, { composition })
  const stale = layoutByShapeOnly(fresh.artifact)

  it('옛 좌표가 실제로 다르다 — 이 테스트가 헛돌지 않게 먼저 확인한다', () => {
    const before = fresh.artifact.pattern.parts.map((p) => `${p.origin.x},${p.origin.y}`)
    const after = stale.pattern.parts.map((p) => `${p.origin.x},${p.origin.y}`)
    expect(after).not.toEqual(before)
  })

  it('옛 좌표로 저장된 산출물을 그려도 라벨이 부품 선 위로 올라가지 않는다', () => {
    const { drawings, labels } = measure(renderPenSvg(stale, { status: 'validated' }))
    for (const label of labels) {
      for (const drawing of drawings) {
        const hit = overlap(label, drawing)
        expect(
          hit,
          `${label.what} 가 ${drawing.what} 위로 ${hit.toFixed(1)}mm 올라간다`,
        ).toBeLessThanOrEqual(EPS)
      }
    }
    for (let i = 0; i < labels.length; i += 1) {
      for (let j = i + 1; j < labels.length; j += 1) {
        const hit = overlap(labels[i]!, labels[j]!)
        expect(
          hit,
          `${labels[i]!.what} ↔ ${labels[j]!.what} 가 ${hit.toFixed(1)}mm 겹친다`,
        ).toBeLessThanOrEqual(EPS)
      }
    }
  })

  it('같은 산출물이면 몇 번 그려도 같은 SVG 다 — 렌더가 배치를 다시 해도 결정론이다', () => {
    const once = renderPenSvg(fresh.artifact, { status: 'validated' })
    expect(renderPenSvg(fresh.artifact, { status: 'validated' })).toBe(once)
    // 옛 좌표로 저장된 것과 새로 배치한 것이 같은 종이가 된다.
    expect(renderPenSvg(stale, { status: 'validated' })).toBe(once)
  })
})

/**
 * **종이에 들어가지 않는 부품을 원점에 쌓아 그리지 않는다.**
 *
 * 배치에 실패한 부품은 `origin` 이 (0,0) 이다. 그걸 그대로 그리면 부품 여러 장이 왼쪽 위에
 * 포개져서 선과 글자가 전부 겹친 종이가 나온다. 검증이 `PEN_PART_OUT_OF_PAGE` 로 실패시키지만
 * 미리보기는 실패한 산출물도 보여주므로 (ADR-030), 그 화면에 겹친 도안이 그대로 뜬다.
 */
describe('A4 에 들어가지 않는 부품', () => {
  const spec: StudioSpec = {
    kind: 'pen3d',
    grade_band: 'high',
    student_count: 20,
    duration_minutes: 120,
    venue: '교실',
    equipment: ['3D펜', 'PLA 필라멘트'],
    topic: '큰 판',
    session_id: null,
  }
  const base = generatePen(spec)

  /** 들어가는 판 1장 + 종이보다 큰 판 2장. 큰 판은 배치되지 않는다. */
  const oversized: PenArtifact = {
    ...base.artifact,
    pattern: {
      ...base.artifact.pattern,
      parts: [
        {
          id: 'fits',
          name: '들어가는 판',
          quantity: 1,
          optional: false,
          origin: { x: 0, y: 0 },
          strokes: [{ kind: 'outline' as const, points: rectPoints(60, 60), closed: true }],
        },
        ...[1, 2].map((i) => ({
          id: `big${i}`,
          name: `큰 판 ${i}`,
          quantity: 1,
          optional: false,
          origin: { x: 0, y: 0 },
          strokes: [{ kind: 'outline' as const, points: rectPoints(260, 260), closed: true }],
        })),
      ],
    },
  }
  const svg = renderPenSvg(oversized, { status: 'failed' })

  it('들어가지 않은 부품을 포개서 그리지 않는다', () => {
    const { drawings, labels } = measure(svg)
    expect(drawings.map((d) => d.what)).toEqual(['fits 윤곽'])
    for (let i = 0; i < drawings.length; i += 1) {
      for (let j = i + 1; j < drawings.length; j += 1) {
        const hit = overlap(drawings[i]!, drawings[j]!)
        expect(
          hit,
          `${drawings[i]!.what} ↔ ${drawings[j]!.what} 가 ${hit.toFixed(1)}mm 겹친다`,
        ).toBeLessThanOrEqual(EPS)
      }
    }
    for (let i = 0; i < labels.length; i += 1) {
      for (let j = i + 1; j < labels.length; j += 1) {
        const hit = overlap(labels[i]!, labels[j]!)
        expect(
          hit,
          `${labels[i]!.what} ↔ ${labels[j]!.what} 가 ${hit.toFixed(1)}mm 겹친다`,
        ).toBeLessThanOrEqual(EPS)
      }
    }
  })

  it('싣지 못한 부품을 종이에 적는다 — 빠진 것을 말없이 빼지 않는다', () => {
    expect(svg).toContain('큰 판 1')
    expect(svg).toMatch(/들어가지 않/)
  })
})

describe.each(CASES)('%s — 종이 위에서 겹치는 것이 없다', (_name, over, raw) => {
  const svg = svgOf(over, raw)
  const { drawings, labels, legend } = measure(svg)

  it('부품의 그리는 선끼리 겹치지 않는다', () => {
    for (let i = 0; i < drawings.length; i += 1) {
      for (let j = i + 1; j < drawings.length; j += 1) {
        const hit = overlap(drawings[i]!, drawings[j]!)
        expect(
          hit,
          `${drawings[i]!.what} ↔ ${drawings[j]!.what} 가 ${hit.toFixed(1)}mm 겹친다`,
        ).toBeLessThanOrEqual(EPS)
      }
    }
  })

  it('부품끼리 배치 간격만큼 떨어져 있다 — 번호가 옆 부품에 붙으면 어느 모양인지 안 읽힌다', () => {
    for (let i = 0; i < drawings.length; i += 1) {
      for (let j = i + 1; j < drawings.length; j += 1) {
        const a = drawings[i]!
        const b = drawings[j]!
        // 가로·세로 중 **떨어진 쪽**의 간격을 본다. 한 축만 벌어져 있으면 겹치지 않는다.
        const gapX = Math.max(a.x - (b.x + b.w), b.x - (a.x + a.w))
        const gapY = Math.max(a.y - (b.y + b.h), b.y - (a.y + a.h))
        const gap = Math.max(gapX, gapY)
        expect(
          gap,
          `${a.what} ↔ ${b.what} 사이가 ${gap.toFixed(1)}mm 밖에 안 된다`,
        ).toBeGreaterThanOrEqual(PAGE.gutter_mm - EPS)
      }
    }
  })

  it('라벨도 남의 부품에서 배치 간격만큼 떨어져 있다', () => {
    for (const label of labels) {
      for (const drawing of drawings) {
        // 자기 부품의 선과는 라벨 블록 간격(lead)만큼만 떨어져 있으면 된다.
        if (label.what.startsWith(drawing.what.replace(' 윤곽', ' '))) continue
        const gapX = Math.max(label.x - (drawing.x + drawing.w), drawing.x - (label.x + label.w))
        const gapY = Math.max(label.y - (drawing.y + drawing.h), drawing.y - (label.y + label.h))
        const gap = Math.max(gapX, gapY)
        expect(
          gap,
          `${label.what} 와 ${drawing.what} 사이가 ${gap.toFixed(1)}mm 밖에 안 된다`,
        ).toBeGreaterThanOrEqual(PAGE.gutter_mm - EPS)
      }
    }
  })

  it('라벨(번호·이름·치수)이 어떤 부품의 그리는 선 위에도 올라가지 않는다', () => {
    for (const label of labels) {
      for (const drawing of drawings) {
        const hit = overlap(label, drawing)
        expect(
          hit,
          `${label.what} 가 ${drawing.what} 위로 ${hit.toFixed(1)}mm 올라간다`,
        ).toBeLessThanOrEqual(EPS)
      }
    }
  })

  it('라벨끼리 겹치지 않는다', () => {
    for (let i = 0; i < labels.length; i += 1) {
      for (let j = i + 1; j < labels.length; j += 1) {
        const hit = overlap(labels[i]!, labels[j]!)
        expect(
          hit,
          `${labels[i]!.what} ↔ ${labels[j]!.what} 가 ${hit.toFixed(1)}mm 겹친다`,
        ).toBeLessThanOrEqual(EPS)
      }
    }
  })

  it('하단 범례·푸터가 도안과 라벨 아래에만 있다', () => {
    for (const line of legend) {
      for (const other of [...drawings, ...labels]) {
        const hit = overlap(line, other)
        expect(hit, `${line.what} 가 ${other.what} 와 ${hit.toFixed(1)}mm 겹친다`).toBeLessThanOrEqual(
          EPS,
        )
      }
    }
  })

  it('범례·푸터끼리 겹치지 않는다 — 제목이 길면 50mm 기준선 글자 위로 올라간다', () => {
    for (let i = 0; i < legend.length; i += 1) {
      for (let j = i + 1; j < legend.length; j += 1) {
        const hit = overlap(legend[i]!, legend[j]!)
        expect(
          hit,
          `${legend[i]!.what} ↔ ${legend[j]!.what} 가 ${hit.toFixed(1)}mm 겹친다`,
        ).toBeLessThanOrEqual(EPS)
      }
    }
  })

  it('모든 글자와 선이 종이 폭 안에 있다 — 넘치면 인쇄에서 잘린다', () => {
    for (const r of [...drawings, ...labels, ...legend]) {
      expect(r.x, `${r.what} 가 왼쪽 여백을 넘는다`).toBeGreaterThanOrEqual(PAGE.margin_mm - EPS)
      expect(
        r.x + r.w,
        `${r.what} 가 오른쪽으로 ${(r.x + r.w - (PAGE.width_mm - PAGE.margin_mm)).toFixed(1)}mm 넘친다`,
      ).toBeLessThanOrEqual(PAGE.width_mm - PAGE.margin_mm + EPS)
    }
  })

  it('부품과 라벨이 하단 여백을 침범하지 않는다', () => {
    for (const r of [...drawings, ...labels]) {
      expect(r.y + r.h, `${r.what} 가 종이 아래로 넘친다`).toBeLessThanOrEqual(
        PAGE.height_mm - PAGE.margin_mm + EPS,
      )
    }
  })
})
