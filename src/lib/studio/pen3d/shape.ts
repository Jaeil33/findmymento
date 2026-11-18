/**
 * 모양 IR — **아틀라스와 윤곽 제안이 같은 형태로 들어와 레시피가 된다** (ADR-036).
 *
 * 경계는 ADR-029 에서 한 칸 움직였고, 움직인 폭은 정확히 이것뿐이다:
 * LLM 은 **단위 없는 0~1 좌표**를 돌려주고, **mm 는 여기서 만든다.** 간격·선분·내각·시간·A4
 * 판정은 기존 검증기가 그대로 한다 (`pen3d/validate.ts`). 임계값은 한 개도 낮추지 않는다.
 *
 * 보정 순서는 바뀌지 않는다:
 *   범위·개수 검사 → 닫힘 보정 → **자기교차면 폐기** → mm 환산 → 뾰족한 꼭짓점 둥글리기
 *   → 등간격 리샘플 → 기존 검증기
 *
 * 수선하면 "우리가 검수하지 않은 모양"이 되는 것(자기교차)은 고치지 않고 버린다 —
 * `compose.ts` 의 `parseComposition` 과 같은 정책이다.
 *
 * 내부선은 `detail` 단계에 매핑한다. 그래서 간격이 모자라면 **모양이 아니라 디테일이 먼저
 * 깎인다** — 개선 라운드(`detail-down`)가 이미 그렇게 동작한다.
 */

import {
  BEAD_WIDTH_MM,
  BAND_SEGMENTS,
  HANGER_OUTER_R_MM,
  HANGER_THICKNESS_MM,
  LAYER_COUNT,
  LAYER_WELD_RATIO,
  PAGE_USABLE,
  PEN_LIMITS,
  SHAPE_ASPECT,
  SHAPE_MARGIN,
  SHAPE_MAX_DETAILS,
  SHAPE_MAX_HOLES,
  SHAPE_POINTS,
  SHAPE_SMOOTH_MAX,
  WELD_MIN_LENGTH_MM,
  type PenLimit,
} from '@/lib/studio/constants'
import {
  bbox,
  circlePoints,
  dist,
  featureEdges,
  interiorAngles,
  minGap,
  normalizeStrokes,
  rectPoints,
  segIntersects,
  segments,
  strokeLength,
  STRAIGHT_ANGLE_DEG,
} from '@/lib/studio/geometry'
import { penGapOptions } from '@/lib/studio/pen3d/validate'
import type { PenRecipe, PenRecipeParams } from '@/lib/studio/pen3d/recipes'
import type { GradeBand } from '@/types/domain'
import type {
  NormPoint,
  PenJoint,
  PenPart,
  PenShape,
  Point,
  ShapeForm,
  ShapeOutline,
  Stroke,
} from '@/types/studio'

const round1 = (n: number) => Math.round(n * 10) / 10
const round3 = (n: number) => Math.round(n * 1000) / 1000
const closedStroke = (points: Point[]): Stroke => ({ kind: 'outline', points, closed: true })

/** 닫힌 폴리라인의 둘레 */
function closedLength(points: Point[]): number {
  return strokeLength(closedStroke(points))
}

/**
 * 윤곽이 스스로 교차하는가. 닫힌 윤곽에서 이웃한 변은 끝점을 공유하므로 건너뛴다
 * (첫 변과 마지막 변도 이웃이다). `validate.ts` 의 같은 이름 함수와 같은 판정이다.
 */
function selfIntersects(points: Point[]): boolean {
  const segs = segments(closedStroke(points))
  for (let i = 0; i < segs.length; i += 1) {
    for (let j = i + 2; j < segs.length; j += 1) {
      if (i === 0 && j === segs.length - 1) continue
      if (segIntersects(segs[i]!, segs[j]!)) return true
    }
  }
  return false
}

/** 점이 닫힌 다각형 안에 있는가 (ray casting). 경계 위는 안으로 본다 */
function inside(polygon: NormPoint[], p: NormPoint): boolean {
  let hit = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const a = polygon[i]!
    const b = polygon[j]!
    if (a.y > p.y !== b.y > p.y) {
      const x = a.x + ((p.y - a.y) * (b.x - a.x)) / (b.y - a.y)
      if (p.x < x) hit = !hit
    }
  }
  return hit
}

/** 붙어 있는 점을 지운다. 길이 0 선분은 각도·간격 계산을 망친다 */
function dedupe(points: Point[], tolerance: number): Point[] {
  const out: Point[] = []
  for (const p of points) {
    const last = out[out.length - 1]
    if (last && dist(last, p) < tolerance) continue
    out.push(p)
  }
  while (out.length > 2 && dist(out[0]!, out[out.length - 1]!) < tolerance) out.pop()
  return out
}

/** 문자열 해시 (FNV-1a). `node:crypto` 를 쓰지 않는 이유는 클라이언트 번들 경계다 */
function fnv1a(text: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

// ============================================================================
// 제안 읽기 — 하나라도 어긋나면 통째로 버린다
// ============================================================================

export type ShapeMeta = {
  /** 입력 단어 (일반화를 통과한 값) */
  word: string
  source: 'atlas' | 'dsl'
  /** 아틀라스면 고정 id. 없으면 좌표 해시로 만든다 */
  id?: string
  /** 아틀라스 동의어 */
  words?: string[]
}

function pointsIn(raw: unknown, min: number, max: number): NormPoint[] | null {
  if (!Array.isArray(raw)) return null
  if (raw.length < min || raw.length > max) return null
  const out: NormPoint[] = []
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) return null
    const { x, y } = entry as Record<string, unknown>
    if (typeof x !== 'number' || typeof y !== 'number') return null
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null
    if (x < 0 || x > 1 || y < 0 || y > 1) return null
    out.push({ x, y })
  }
  return out
}

function outlineList(raw: unknown, max: number): NormPoint[][] | null {
  if (raw === undefined || raw === null) return []
  if (!Array.isArray(raw)) return null
  if (raw.length > max) return null
  const out: NormPoint[][] = []
  for (const entry of raw) {
    const points = pointsIn(entry, 3, SHAPE_POINTS[1])
    if (!points) return null
    out.push(points)
  }
  return out
}

/**
 * 윤곽 제안을 읽는다. **조금이라도 어긋나면 `null`** 이고, 그때 호출자는 다음 순서로 간다.
 *
 * 돌려주는 좌표는 **가로 1 로 정규화**된 값이다 (y 는 0~`aspect`). mm 는 `shapeRecipe` 가
 * `params.size` 를 곱해 만든다.
 */
export function parseShape(raw: unknown, meta: ShapeMeta): PenShape | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null
  const body = raw as Record<string, unknown>

  const title = typeof body.title === 'string' ? body.title.trim() : ''
  if (title.length < 1 || title.length > 40) return null

  const silhouette = pointsIn(body.silhouette, SHAPE_POINTS[0], SHAPE_POINTS[1])
  if (!silhouette) return null

  const details = outlineList(body.details, SHAPE_MAX_DETAILS)
  const holes = outlineList(body.holes, SHAPE_MAX_HOLES)
  if (!details || !holes) return null

  // 정규화 공간에서의 붙은 점 정리 — 0.2% 보다 가까운 점은 같은 점이다
  const outer = dedupe(silhouette, 0.002)
  if (outer.length < SHAPE_POINTS[0]) return null
  if (selfIntersects(outer)) return null

  const box = bbox(outer)
  const width = box.max.x - box.min.x
  const height = box.max.y - box.min.y
  if (width < 0.05 || height < 0.05) return null
  const aspect = round3(height / width)
  if (aspect < SHAPE_ASPECT[0] || aspect > SHAPE_ASPECT[1]) return null

  // 가로를 1 로 맞춘다. 세로는 같은 배율이므로 종횡비가 보존된다.
  const map = (p: NormPoint): NormPoint => ({
    x: round3((p.x - box.min.x) / width),
    y: round3((p.y - box.min.y) / width),
  })
  const mapped = outer.map(map)

  /** 실루엣 **안에** 있고 스스로 교차하지 않는 것만 남긴다. 어긋난 선은 그 선만 버린다 */
  const keep = (list: NormPoint[][]): ShapeOutline[] =>
    list
      .map((points) => dedupe(points.map(map), 0.002))
      .filter((points) => points.length >= 3)
      .filter((points) => !selfIntersects(points))
      .filter((points) => points.every((p) => inside(mapped, p)))
      .map((points) => ({ points, closed: true as const }))

  const shape: PenShape = {
    id: meta.id ?? '',
    word: meta.word,
    title,
    words: meta.words ?? [meta.word],
    silhouette: { points: mapped, closed: true },
    details: keep(details),
    holes: keep(holes),
    hanger: body.hanger === true,
    aspect,
    source: meta.source,
    reviewed: meta.source === 'atlas',
  }

  if (shape.id === '') {
    const signature = JSON.stringify([shape.silhouette.points, shape.details, shape.holes])
    shape.id = `dsl-${fnv1a(signature)}`
  }
  return shape
}

// ============================================================================
// 보정 — 뾰족한 꼭짓점을 둥글리고 등간격으로 다시 찍는다
// ============================================================================

type Limits = { gap: number; segment: number; angle: number }

function limitsOf(limit: PenLimit): Limits {
  return {
    gap: limit.min_gap_mm + SHAPE_MARGIN.gap_mm,
    segment: limit.min_segment_mm + SHAPE_MARGIN.segment_mm,
    angle: limit.min_angle_deg + SHAPE_MARGIN.angle_deg,
  }
}

/** 사람이 한 번에 긋는 선 하나의 구간. `featureEdges` 와 **같은 코너 규칙**을 쓴다 */
type Span = { start: number; end: number; length: number }

function featureSpans(points: Point[]): Span[] {
  const n = points.length
  if (n < 3) return []
  const angles = interiorAngles(closedStroke(points))
  const corners: number[] = []
  for (let i = 0; i < n; i += 1) {
    if ((angles[i] ?? 180) <= STRAIGHT_ANGLE_DEG) corners.push(i)
  }
  // 코너가 없으면 한 바퀴가 하나의 선이다 (매끄러운 원)
  if (corners.length === 0) {
    return [{ start: 0, end: 0, length: closedLength(points) }]
  }
  const spans: Span[] = []
  for (let k = 0; k < corners.length; k += 1) {
    const from = corners[k]!
    const to = corners[(k + 1) % corners.length]!
    let length = 0
    for (let i = from; i !== to; i = (i + 1) % n) {
      length += dist(points[i]!, points[(i + 1) % n]!)
    }
    spans.push({ start: from, end: to, length })
  }
  return spans
}

/**
 * 뾰족한 꼭짓점을 **평평하게 자른다.** 자른 면의 길이가 `length` 다.
 *
 * 양쪽 변에서 떼어내야 하는 길이가 변의 45% 를 넘으면 `null` — 그 꼭짓점은 버린다.
 * 둥글려서 각도 숫자만 올리는 선택은 하지 않는다. 20도짜리 끝은 비드 폭 1.6mm 로는
 * 어떻게 그려도 덩어리가 되고, 검증기를 속이면 그 덩어리가 교실로 간다.
 */
function chamfer(prev: Point, vertex: Point, next: Point, length: number): [Point, Point] | null {
  const toPrev = { x: prev.x - vertex.x, y: prev.y - vertex.y }
  const toNext = { x: next.x - vertex.x, y: next.y - vertex.y }
  const lenPrev = Math.hypot(toPrev.x, toPrev.y)
  const lenNext = Math.hypot(toNext.x, toNext.y)
  if (lenPrev === 0 || lenNext === 0) return null

  const u = { x: toPrev.x / lenPrev, y: toPrev.y / lenPrev }
  const w = { x: toNext.x / lenNext, y: toNext.y / lenNext }
  const cos = Math.max(-1, Math.min(1, u.x * w.x + u.y * w.y))
  const half = Math.acos(cos) / 2
  const sin = Math.sin(half)
  if (sin <= 0) return null

  const setback = length / (2 * sin)
  if (setback > 0.45 * Math.min(lenPrev, lenNext)) return null
  return [
    { x: vertex.x + u.x * setback, y: vertex.y + u.y * setback },
    { x: vertex.x + w.x * setback, y: vertex.y + w.y * setback },
  ]
}

/** 뾰족한 꼭짓점 전부를 한 번에 자른다. 자를 자리가 없는 꼭짓점은 버린다 */
function cutSharp(points: Point[], target: Limits): Point[] {
  const n = points.length
  const angles = interiorAngles(closedStroke(points))
  const out: Point[] = []
  for (let i = 0; i < n; i += 1) {
    if ((angles[i] ?? 180) >= target.angle) {
      out.push(points[i]!)
      continue
    }
    const cut = chamfer(points[(i - 1 + n) % n]!, points[i]!, points[(i + 1) % n]!, target.segment)
    if (cut) out.push(...cut)
  }
  return dedupe(out, 0.1)
}

/**
 * 임계값보다 짧은 선을 **접어 없앤다.** 그 선의 양 끝 코너를 가운데 한 점으로 모은다.
 * 꼭짓점 수가 반드시 줄어들므로 반복이 끝난다.
 */
function collapseShort(points: Point[], spans: Span[], minLength: number): Point[] | null {
  const n = points.length
  const drop = new Set<number>()
  const replace = new Map<number, Point>()
  const touched = new Set<number>()

  for (const span of [...spans].sort((a, b) => a.length - b.length)) {
    if (span.length >= minLength) continue
    if (span.start === span.end) continue
    const indices: number[] = [span.start]
    for (let i = (span.start + 1) % n; i !== span.end; i = (i + 1) % n) indices.push(i)
    indices.push(span.end)
    if (indices.some((i) => touched.has(i))) continue
    if (n - (indices.length - 1) < 3) continue

    for (const i of indices) touched.add(i)
    for (const i of indices.slice(1)) drop.add(i)
    const a = points[span.start]!
    const b = points[span.end]!
    replace.set(span.start, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
  }

  if (replace.size === 0) return null
  const out: Point[] = []
  for (let i = 0; i < n; i += 1) {
    if (drop.has(i)) continue
    out.push(replace.get(i) ?? points[i]!)
  }
  return dedupe(out, 0.1)
}

/**
 * mm 윤곽을 학년 임계값 안으로 넣는다. **임계값을 낮추지 않는다** — 넣지 못하면 못 넣은
 * 상태로 돌려주고 검증기가 실패로 잡는다 (ADR-030).
 *
 * 수단은 둘뿐이다:
 * - 뾰족한 꼭짓점을 평평하게 **자른다**(없으면 그 꼭짓점을 버린다)
 * - 코너 사이가 너무 짧은 선을 **접어 없앤다**
 *
 * 간격만 모자란 경우에는 손대지 않는다 — 간격은 치수에 비례하므로 개선 라운드의 확대가 고친다.
 * 자르다 선이 스스로 교차하면 직전 결과를 쓴다. 꼬인 윤곽은 떼어낼 때 찢어진다.
 */
function sanitize(points: Point[], limit: PenLimit): Point[] {
  const target = limitsOf(limit)
  let current = dedupe(points, 0.1)

  for (let round = 0; round < SHAPE_SMOOTH_MAX; round += 1) {
    const angles = interiorAngles(closedStroke(current))
    const spans = featureSpans(current)
    const sharp = angles.length > 0 && Math.min(...angles) < target.angle
    const short = spans.some((s) => s.length < target.segment && s.start !== s.end)
    if (!sharp && !short) break

    const next = sharp ? cutSharp(current, target) : collapseShort(current, spans, target.segment)
    if (!next || next.length < 3 || selfIntersects(next)) break
    current = next
  }

  return current.map((p) => ({ x: round3(p.x), y: round3(p.y) }))
}

// ============================================================================
// 모양 → 레시피
// ============================================================================

function mkPart(
  id: string,
  name: string,
  quantity: number,
  strokes: Stroke[],
  optional = false,
): PenPart {
  return {
    id,
    name,
    quantity,
    strokes: normalizeStrokes(strokes),
    origin: { x: 0, y: 0 },
    optional,
  }
}

function mkWeld(
  id: string,
  a: string,
  b: string,
  count: number,
  length_mm: number,
  how: string,
): PenJoint {
  return { id, kind: 'weld', a, b, count, length_mm: round1(length_mm), flush: false, how }
}

/** 고리 — 바깥 원과 안쪽 원. 두께가 곧 선 간격이다 */
function hangerStrokes(): Stroke[] {
  return [
    closedStroke(circlePoints(HANGER_OUTER_R_MM, 48)),
    closedStroke(circlePoints(HANGER_OUTER_R_MM - HANGER_THICKNESS_MM, 32)),
  ]
}

const scaleTo = (points: NormPoint[], size: number): Point[] =>
  points.map((p) => ({ x: p.x * size, y: p.y * size }))

/**
 * 내부선 하나를 받아들일 수 있는가. 간격·선분·내각 중 하나라도 걸리면 **그 선만** 버린다 —
 * 모양을 버리지 않는다. 치수를 키우면 들어오고, 줄이면 빠진다.
 */
function acceptsExtra(kept: Stroke[], candidate: Stroke, limit: PenLimit): boolean {
  const target = limitsOf(limit)
  const box = bbox(candidate.points)
  const span = Math.min(box.max.x - box.min.x, box.max.y - box.min.y)
  // 선 두 줄과 그 사이 간격이 들어가지 않는 폭은 그려 놓으면 덩어리가 된다
  if (span < limit.min_gap_mm + BEAD_WIDTH_MM * 2) return false
  const features = featureEdges(candidate)
  if (features.length > 0 && Math.min(...features) < target.segment) return false
  const angles = interiorAngles(candidate)
  if (angles.length > 0 && Math.min(...angles) < target.angle) return false
  return minGap([...kept, candidate], penGapOptions(limit)) >= target.gap
}

export type ShapeRecipeOptions = {
  form: ShapeForm
  grade_band: GradeBand
}

/**
 * 모양을 **레시피로** 바꾼다. 이 뒤로는 기존 코드가 모양의 출처를 알 필요가 없다 —
 * `generatePen` 의 개선 라운드(확대·축소·장식 제거·선택 부품 제거)가 그대로 적용된다.
 * `compose.ts` 의 `compositionRecipe` 와 같은 역할이다.
 */
export function shapeRecipe(shape: PenShape, options: ShapeRecipeOptions): PenRecipe {
  const { form, grade_band } = options
  const limit = PEN_LIMITS[grade_band]
  const layers = LAYER_COUNT[grade_band]
  const flat = form === 'flat'

  const normPerimeter = closedLength(shape.silhouette.points)
  const extras = [...shape.details, ...shape.holes]

  // 치수 상한은 종이에서 나온다. 라벨 칸이 들어갈 자리를 남긴다 (`pen3d/label.ts`).
  const maxWidth = PAGE_USABLE.width_mm - 14
  const maxHeight = PAGE_USABLE.height_mm - 40
  let maxSize = Math.min(maxWidth, maxHeight / shape.aspect)
  // 측면 띠 한 토막이 종이 폭을 넘으면 적층이 영구 실패한다
  if (!flat) maxSize = Math.min(maxSize, (maxWidth * BAND_SEGMENTS) / normPerimeter)
  maxSize = Math.max(30, Math.floor(maxSize))
  const minSize = Math.min(45, maxSize)
  const size = Math.max(minSize, Math.min(maxSize, flat ? 85 : 70))

  return {
    id: shape.id,
    title: shape.title,
    summary: flat
      ? `${shape.title} 실루엣 한 장을 그려 떼어냅니다.`
      : `${shape.title} 실루엣을 ${layers}장 그려 겹쳐 붙여 두께를 만듭니다.`,
    keywords: shape.words,
    defaults: { size, detail: extras.length > 0 ? 1 : 0, extras: !flat && layers > 3 },
    size_range: [minSize, maxSize],
    nominal_difficulty: flat ? (extras.length > 0 ? 2 : 1) : 3,

    build: ({ size: width, detail, extras: withExtras }: PenRecipeParams) => {
      const outline = sanitize(scaleTo(shape.silhouette.points, width), limit)
      const strokes: Stroke[] = [closedStroke(outline)]

      if (detail >= 1) {
        for (const extra of extras) {
          const candidate = closedStroke(sanitize(scaleTo(extra.points, width), limit))
          if (!acceptsExtra(strokes, candidate, limit)) continue
          strokes.push(candidate)
        }
      }

      const perimeter = closedLength(outline)

      // ── 2D — 조립하지 않는다 (ADR-037) ───────────────────────────────────
      if (flat) {
        const parts = [mkPart('body', shape.title, 1, strokes)]
        const joints: PenJoint[] = []
        if (shape.hanger) {
          parts.push(mkPart('hoop', '고리', 1, hangerStrokes()))
          joints.push(
            mkWeld(
              'body-hoop',
              'body',
              'hoop',
              1,
              Math.max(WELD_MIN_LENGTH_MM, HANGER_THICKNESS_MM * 2),
              `고리를 ${shape.title} 윤곽의 위쪽 가장자리에 세워 대고 맞닿은 부분을 녹여 붙입니다.`,
            ),
          )
        }
        return { parts, joints }
      }

      // ── 3D 적층 — 같은 실루엣을 겹친다. 인쇄는 한 번이다 ─────────────────
      const stackWeld = Math.min(
        Math.max(WELD_MIN_LENGTH_MM, perimeter * LAYER_WELD_RATIO),
        perimeter / 2 - 0.1,
      )
      const parts = [mkPart('layer', `${shape.title} 층`, layers, strokes)]
      const joints = [
        mkWeld(
          'layer-stack',
          'layer',
          'layer',
          layers - 1,
          stackWeld,
          `같은 모양 ${layers}장을 포개어 맞추고, 맞닿은 테두리를 돌아가며 녹여 붙입니다.`,
        ),
      ]

      if (withExtras) {
        const segment = perimeter / BAND_SEGMENTS
        // 띠 높이는 적층 두께보다 작을 수 없고, 학년 최소 선분 길이도 지켜야 한다
        const bandHeight = Math.max(limit.min_segment_mm, layers * BEAD_WIDTH_MM)
        parts.push(
          mkPart(
            'band',
            '측면 띠',
            BAND_SEGMENTS,
            [closedStroke(rectPoints(round1(segment), round1(bandHeight)))],
            true,
          ),
        )
        joints.push(
          mkWeld(
            'layer-band',
            'layer',
            'band',
            BAND_SEGMENTS,
            Math.min(segment, perimeter / 2 - 0.1, segment + bandHeight - 0.1),
            `띠 ${BAND_SEGMENTS}장을 포갠 층의 옆면에 둘러 대고 이어 붙여 측면을 막습니다.`,
          ),
        )
      }

      return { parts, joints }
    },
  }
}
