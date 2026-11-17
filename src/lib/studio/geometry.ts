/**
 * mm 단위 평면 기하. 3D펜 도안 검증의 **모든 숫자가 이 파일에서 나온다.**
 *
 * 순수 함수만 둔다 — 같은 입력이면 같은 출력이어야 한다. 검증 결과가 재현되지 않으면
 * 강사에게 "왜 통과했는지"를 설명할 수 없다 (ADR-030).
 *
 * 임계값은 여기에 없다. 전부 `constants.ts` 에 있고 호출자가 넘긴다.
 */

import type { Point, Stroke } from '@/types/studio'

export type Seg = { a: Point; b: Point }
export type Box = { min: Point; max: Point }
export type Rect = { x: number; y: number; w: number; h: number }
export type Size = { w: number; h: number }

export function dist(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y)
}

/** 폴리라인을 선분 배열로. `closed` 면 마지막 점에서 첫 점으로 돌아오는 선분이 하나 더 생긴다. */
export function segments(stroke: Stroke): Seg[] {
  const pts = stroke.points
  const out: Seg[] = []
  for (let i = 0; i < pts.length - 1; i += 1) out.push({ a: pts[i]!, b: pts[i + 1]! })
  if (stroke.closed && pts.length > 2) out.push({ a: pts[pts.length - 1]!, b: pts[0]! })
  return out
}

export function strokeLength(stroke: Stroke): number {
  return segments(stroke).reduce((sum, s) => sum + dist(s.a, s.b), 0)
}

export function bbox(points: Point[]): Box {
  if (points.length === 0) return { min: { x: 0, y: 0 }, max: { x: 0, y: 0 } }
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of points) {
    if (p.x < minX) minX = p.x
    if (p.y < minY) minY = p.y
    if (p.x > maxX) maxX = p.x
    if (p.y > maxY) maxY = p.y
  }
  return { min: { x: minX, y: minY }, max: { x: maxX, y: maxY } }
}

export function strokesBBox(strokes: Stroke[]): Box {
  return bbox(strokes.flatMap((s) => s.points))
}

export function sizeOf(box: Box): Size {
  return { w: box.max.x - box.min.x, h: box.max.y - box.min.y }
}

export function translate(points: Point[], dx: number, dy: number): Point[] {
  return points.map((p) => ({ x: p.x + dx, y: p.y + dy }))
}

export function scalePoints(points: Point[], k: number): Point[] {
  return points.map((p) => ({ x: p.x * k, y: p.y * k }))
}

export function translateStrokes(strokes: Stroke[], dx: number, dy: number): Stroke[] {
  return strokes.map((s) => ({ ...s, points: translate(s.points, dx, dy) }))
}

export function scaleStrokes(strokes: Stroke[], k: number): Stroke[] {
  return strokes.map((s) => ({ ...s, points: scalePoints(s.points, k) }))
}

/** 부품 로컬 좌표를 좌상단 (0,0) 기준으로 맞춘다. 배치가 bbox 를 쓰기 때문이다. */
export function normalizeStrokes(strokes: Stroke[]): Stroke[] {
  const box = strokesBBox(strokes)
  return translateStrokes(strokes, -box.min.x, -box.min.y)
}

// ============================================================================
// 도형 생성 — 좌표를 만드는 것은 코드뿐이다 (ADR-029)
// ============================================================================

/** 중심이 원점인 정 n 각형. 꼭짓점 간 거리는 `2·r·sin(π/n)` 이다. */
export function regularPolygon(n: number, radius: number, rotation = -Math.PI / 2): Point[] {
  return Array.from({ length: n }, (_, i) => {
    const t = rotation + (i * 2 * Math.PI) / n
    return { x: radius * Math.cos(t), y: radius * Math.sin(t) }
  })
}

/** 중심이 원점인 별. 꼭짓점 `n` 개가 `rOuter`, 사이 `n` 개가 `rInner` 에 있다. */
export function starPoints(n: number, rOuter: number, rInner: number): Point[] {
  const out: Point[] = []
  for (let i = 0; i < n * 2; i += 1) {
    const r = i % 2 === 0 ? rOuter : rInner
    const t = -Math.PI / 2 + (i * Math.PI) / n
    out.push({ x: r * Math.cos(t), y: r * Math.sin(t) })
  }
  return out
}

/** 원의 폴리라인 근사. 3D펜 도안은 결국 사람이 긋는 선이므로 분할 수는 넉넉하면 된다. */
export function circlePoints(radius: number, divisions = 48): Point[] {
  return regularPolygon(divisions, radius)
}

/**
 * 중심이 원점인 타원. 꽃잎·잎처럼 둥근 부품에 쓴다.
 *
 * 분할 수가 기본 80 인 이유: 종횡비가 큰 타원은 뾰족한 끝의 곡률이 커서, 40분할이면 그 끝의
 * 꼭짓점 내각이 163도까지 내려가 `featureEdges` 가 코너로 오해한다. 그러면 1.4mm 짜리
 * "짧은 선"이 잡혀서 꽃잎 도안이 전부 실패한다.
 */
export function ellipsePoints(width: number, height: number, divisions = 80): Point[] {
  return Array.from({ length: divisions }, (_, i) => {
    const t = (i * 2 * Math.PI) / divisions
    return { x: (width / 2) * Math.cos(t), y: (height / 2) * Math.sin(t) }
  })
}

/** 좌상단이 원점인 직사각형. */
export function rectPoints(w: number, h: number): Point[] {
  return [
    { x: 0, y: 0 },
    { x: w, y: 0 },
    { x: w, y: h },
    { x: 0, y: h },
  ]
}

/** 이등변 삼각형 — 밑변 `base`, 높이 `height`. 좌상단이 원점이다. */
export function trianglePoints(base: number, height: number): Point[] {
  return [
    { x: base / 2, y: 0 },
    { x: base, y: height },
    { x: 0, y: height },
  ]
}

// ============================================================================
// 거리와 각도
// ============================================================================

export function pointSegDistance(p: Point, s: Seg): number {
  const dx = s.b.x - s.a.x
  const dy = s.b.y - s.a.y
  const len2 = dx * dx + dy * dy
  if (len2 === 0) return dist(p, s.a)
  // 수선의 발을 선분 안으로 자른다. 밖이면 가까운 끝점과의 거리가 답이다.
  const t = Math.max(0, Math.min(1, ((p.x - s.a.x) * dx + (p.y - s.a.y) * dy) / len2))
  return dist(p, { x: s.a.x + t * dx, y: s.a.y + t * dy })
}

function orientation(a: Point, b: Point, c: Point): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
}

function onSegment(a: Point, b: Point, p: Point): boolean {
  return (
    Math.min(a.x, b.x) - 1e-9 <= p.x &&
    p.x <= Math.max(a.x, b.x) + 1e-9 &&
    Math.min(a.y, b.y) - 1e-9 <= p.y &&
    p.y <= Math.max(a.y, b.y) + 1e-9
  )
}

export function segIntersects(s1: Seg, s2: Seg): boolean {
  const d1 = orientation(s1.a, s1.b, s2.a)
  const d2 = orientation(s1.a, s1.b, s2.b)
  const d3 = orientation(s2.a, s2.b, s1.a)
  const d4 = orientation(s2.a, s2.b, s1.b)
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true
  }
  // 한 점이 다른 선분 위에 올라간 경우(일직선 겹침 포함).
  if (Math.abs(d1) < 1e-9 && onSegment(s1.a, s1.b, s2.a)) return true
  if (Math.abs(d2) < 1e-9 && onSegment(s1.a, s1.b, s2.b)) return true
  if (Math.abs(d3) < 1e-9 && onSegment(s2.a, s2.b, s1.a)) return true
  if (Math.abs(d4) < 1e-9 && onSegment(s2.a, s2.b, s1.b)) return true
  return false
}

/** 선분과 선분의 최단거리. 교차하면 0 이다. */
export function segDistance(s1: Seg, s2: Seg): number {
  if (segIntersects(s1, s2)) return 0
  return Math.min(
    pointSegDistance(s1.a, s2),
    pointSegDistance(s1.b, s2),
    pointSegDistance(s2.a, s1),
    pointSegDistance(s2.b, s1),
  )
}

/**
 * 두 선분이 **이어져 있는가.** 끝점을 공유하거나, 한쪽 끝점이 다른 선분 위에 있으면 이어진 것이다.
 *
 * 이 판정이 없으면 모든 도안이 "간격 0mm" 로 실패한다 — 다각형의 인접한 변과, 윤곽에 끝이 닿는
 * 접는 선이 전부 걸리기 때문이다. 녹아 붙는 사고는 **이어지지 않은** 두 선 사이에서만 생긴다.
 */
export function connected(s1: Seg, s2: Seg, tol: number): boolean {
  const ends1 = [s1.a, s1.b]
  const ends2 = [s2.a, s2.b]
  for (const p of ends1) for (const q of ends2) if (dist(p, q) <= tol) return true
  for (const p of ends1) if (pointSegDistance(p, s2) <= tol) return true
  for (const q of ends2) if (pointSegDistance(q, s1) <= tol) return true
  return false
}

export type SamplePoint = { x: number; y: number; stroke: number; arc: number }

/**
 * 선을 일정 간격 점으로 쪼갠다. `arc` 는 그 선 시작점부터의 누적 길이다.
 * 간격 판정을 선분 쌍이 아니라 **점 쌍**으로 하기 위한 것이다 — 이유는 {@link minGap} 에 있다.
 */
export function sampleStrokes(
  strokes: Stroke[],
  step: number,
): { points: SamplePoint[]; totals: number[] } {
  const points: SamplePoint[] = []
  const totals: number[] = []

  strokes.forEach((stroke, index) => {
    let arc = 0
    const segs = segments(stroke)
    for (const seg of segs) {
      const len = dist(seg.a, seg.b)
      const n = Math.max(1, Math.ceil(len / step))
      for (let k = 0; k < n; k += 1) {
        const t = k / n
        points.push({
          x: seg.a.x + (seg.b.x - seg.a.x) * t,
          y: seg.a.y + (seg.b.y - seg.a.y) * t,
          stroke: index,
          arc: arc + len * t,
        })
      }
      arc += len
    }
    // 열린 선은 마지막 끝점이 어느 선분의 t=0 도 아니므로 따로 넣는다.
    if (!stroke.closed && stroke.points.length > 0) {
      const last = stroke.points[stroke.points.length - 1]!
      points.push({ x: last.x, y: last.y, stroke: index, arc })
    }
    totals.push(arc)
  })

  return { points, totals }
}

export type MinGapOptions = {
  /** 점 간격 (mm) */
  step?: number
  /** 같은 선 위에서 경로 거리가 이 값 이하인 쌍은 보지 않는다 — 곡률이지 두 개의 선이 아니다 */
  pathSkip?: number
  /** 이 거리보다 먼 쌍은 보지 않는다. 임계값 판정에 필요한 범위만 본다 */
  radius?: number
  /** 이 거리 안이면 "닿아 있다"(접합부)로 본다 */
  tol?: number
  /** 두 선이 만나는 지점 주변 이 거리 안은 보지 않는다 — T자 접합은 사고가 아니다 */
  junctionSkip?: number
}

/**
 * **녹아 붙을 위험이 있는 두 선 사이의 최단거리.** 이 값이 학년 임계값 미달이면 도안이 실패한다.
 *
 * 선분 쌍을 그냥 비교하면 못 쓴다. 두 가지가 전부 거짓 양성으로 걸리기 때문이다:
 *
 * 1. **곡률** — 원을 폴리라인으로 근사하면 이웃하지 않은 선분끼리 현 길이만큼 가까워진다.
 *    r=17 원을 72분할하면 1.48mm 가 나오는데, 실제로는 한 줄의 매끄러운 원이고 위험이 없다.
 *    → 같은 선 위에서 **경로 거리**가 `pathSkip` 이하인 쌍을 제외한다. 볼록한 곡선에서 경로
 *    거리 s 만큼 떨어진 두 점의 직선거리는 0.6s 이상이므로, 이 제외가 실제 위험을 가리지 않는다.
 *    반대로 머리핀처럼 선이 되돌아와 나란히 지나가면 경로 거리가 커서 그대로 잡힌다.
 *
 * 2. **접합부** — 접는 선의 끝이 윤곽선 위에 닿는 T자 접합은 모든 입체 도안에 있다. 거리가
 *    0 이라고 실패시키면 아무 도안도 통과하지 못한다.
 *    → 두 선이 닿는 지점을 먼저 찾고, 그 주변 `junctionSkip` 안의 점은 보지 않는다.
 *
 * `radius`(기본 8mm) 밖은 비교하지 않으므로, 가까운 선이 없으면 `Infinity` 다.
 */
export function minGap(strokes: Stroke[], options: MinGapOptions = {}): number {
  const {
    step = 0.6,
    pathSkip = 10,
    radius = 8,
    tol = 0.2,
    junctionSkip = 6,
  } = options

  const total = strokes.reduce((sum, s) => sum + strokeLength(s), 0)
  if (total === 0) return Number.POSITIVE_INFINITY
  // 아무리 큰 도안이어도 점 개수를 묶어 둔다. 생성은 한 요청 안에서 네 번까지 돈다.
  const effectiveStep = Math.max(step, total / 20_000)

  const { points, totals } = sampleStrokes(strokes, effectiveStep)
  const cell = Math.max(radius, 1)
  const grid = new Map<string, SamplePoint[]>()
  const key = (x: number, y: number) => `${Math.floor(x / cell)},${Math.floor(y / cell)}`

  for (const p of points) {
    const k = key(p.x, p.y)
    const bucket = grid.get(k)
    if (bucket) bucket.push(p)
    else grid.set(k, [p])
  }

  /** 같은 선 위 두 점의 경로 거리. 닫힌 선은 반대쪽으로 돌아가는 길도 본다. */
  const pathDistance = (a: SamplePoint, b: SamplePoint): number => {
    const d = Math.abs(a.arc - b.arc)
    if (!strokes[a.stroke]!.closed) return d
    return Math.min(d, totals[a.stroke]! - d)
  }

  /** 각 점의 이웃 후보. 격자 3×3 만 본다. */
  const neighbors = (p: SamplePoint): SamplePoint[] => {
    const cx = Math.floor(p.x / cell)
    const cy = Math.floor(p.y / cell)
    const out: SamplePoint[] = []
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        const bucket = grid.get(`${cx + dx},${cy + dy}`)
        if (bucket) out.push(...bucket)
      }
    }
    return out
  }

  // 1차 — 서로 다른 선이 닿는 지점(접합부)을 모은다.
  const junctions: SamplePoint[] = []
  for (const p of points) {
    for (const q of neighbors(p)) {
      if (q.stroke <= p.stroke) continue
      if (dist(p, q) <= tol) junctions.push(p)
    }
  }

  const nearJunction = (p: SamplePoint): boolean =>
    junctions.some((j) => dist(p, j) <= junctionSkip)

  // 2차 — 실제 최단거리.
  let min = Number.POSITIVE_INFINITY
  for (const p of points) {
    for (const q of neighbors(p)) {
      if (q.stroke < p.stroke) continue
      if (q.stroke === p.stroke) {
        if (q.arc <= p.arc) continue
        if (pathDistance(p, q) <= pathSkip) continue
      } else {
        if (dist(p, q) <= tol) continue
        if (nearJunction(p) || nearJunction(q)) continue
      }
      const d = dist(p, q)
      if (d <= radius && d < min) min = d
    }
  }

  return min
}

/** 각 꼭짓점에서 두 변이 이루는 각(도). 0~180 이고, 작을수록 뾰족하다. */
export function interiorAngles(stroke: Stroke): number[] {
  const pts = stroke.points
  if (pts.length < 3) return []
  const out: number[] = []
  const last = stroke.closed ? pts.length : pts.length - 1
  const from = stroke.closed ? 0 : 1
  for (let i = from; i < last; i += 1) {
    const prev = pts[(i - 1 + pts.length) % pts.length]!
    const cur = pts[i % pts.length]!
    const next = pts[(i + 1) % pts.length]!
    const v1 = { x: prev.x - cur.x, y: prev.y - cur.y }
    const v2 = { x: next.x - cur.x, y: next.y - cur.y }
    const n1 = Math.hypot(v1.x, v1.y)
    const n2 = Math.hypot(v2.x, v2.y)
    if (n1 === 0 || n2 === 0) continue
    const cos = Math.max(-1, Math.min(1, (v1.x * v2.x + v1.y * v2.y) / (n1 * n2)))
    out.push((Math.acos(cos) * 180) / Math.PI)
  }
  return out
}

/**
 * 윤곽이 닫혔는가. `closed` 플래그가 있거나 끝점이 허용 오차 안이면 닫힌 것이다.
 * 점이 3개 미만이면 면이 되지 않으므로 닫힌 윤곽이 아니다.
 */
export function isClosedPath(stroke: Stroke, tol: number): boolean {
  if (stroke.points.length < 3) return false
  if (stroke.closed) return true
  return dist(stroke.points[0]!, stroke.points[stroke.points.length - 1]!) <= tol
}

// ============================================================================
// 배치 — A4 한 장에 고유 부품을 채운다
// ============================================================================

/** 변이 닿기만 한 것은 겹침이 아니다. */
export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
}

/**
 * 선반(shelf) 채우기. 높은 부품부터 한 줄에 왼쪽부터 놓고, 줄이 차면 다음 줄로 내린다.
 *
 * **들어가지 않는 부품은 `null`이다.** 억지로 겹쳐 놓지 않는다 — 겹친 도안은 인쇄하면
 * 두 부품의 선이 섞여서 어느 선을 그어야 하는지 알 수 없게 된다.
 *
 * 입력 순서대로 결과를 돌려주고, 같은 입력이면 같은 배치다.
 */
export function packShelf(
  sizes: Size[],
  page: { width: number; height: number; gutter: number },
): (Point | null)[] {
  const order = sizes
    .map((s, i) => ({ s, i }))
    .sort((p, q) => q.s.h - p.s.h || q.s.w - p.s.w || p.i - q.i)

  const out: (Point | null)[] = sizes.map(() => null)
  let cursorX = 0
  let rowY = 0
  let rowH = 0

  for (const { s, i } of order) {
    if (s.w > page.width || s.h > page.height) continue

    if (cursorX > 0 && cursorX + s.w > page.width) {
      rowY += rowH + page.gutter
      cursorX = 0
      rowH = 0
    }
    if (rowY + s.h > page.height) continue

    out[i] = { x: cursorX, y: rowY }
    cursorX += s.w + page.gutter
    rowH = Math.max(rowH, s.h)
  }

  return out
}

/**
 * **사람이 한 번에 긋는 선** 단위의 길이 목록.
 *
 * 선분 길이를 그냥 재면 못 쓴다 — 원을 48분할하면 2mm 짜리 현이 48개 나오는데, 실제로는
 * 한 번에 긋는 하나의 원이다. 그걸 "짧은 선"으로 잡으면 모든 곡선 도안이 실패한다.
 *
 * 그래서 내각이 `straightAngleDeg` 보다 큰 꼭짓점은 **코너가 아니라고 보고 이어 붙인다.**
 * 남은 코너 사이의 길이가 학생이 실제로 인식하는 "선 하나"의 길이다.
 *
 * 생성기 쪽 규칙: 매끄러운 곡선은 꼭짓점 내각이 165도를 넘도록 충분히 쪼갠다.
 * (원은 48분할이면 172.5도, 종횡비가 큰 타원은 80분할이 필요하다.)
 */
export function featureEdges(stroke: Stroke, straightAngleDeg = 165): number[] {
  const pts = stroke.points
  const n = pts.length
  if (n < 2) return []
  const closed = stroke.closed && n > 2
  const segs = segments(stroke)

  const angleAt = (i: number): number => {
    const prev = pts[(i - 1 + n) % n]!
    const cur = pts[i]!
    const next = pts[(i + 1) % n]!
    const v1 = { x: prev.x - cur.x, y: prev.y - cur.y }
    const v2 = { x: next.x - cur.x, y: next.y - cur.y }
    const n1 = Math.hypot(v1.x, v1.y)
    const n2 = Math.hypot(v2.x, v2.y)
    if (n1 === 0 || n2 === 0) return 180
    const cos = Math.max(-1, Math.min(1, (v1.x * v2.x + v1.y * v2.y) / (n1 * n2)))
    return (Math.acos(cos) * 180) / Math.PI
  }

  const corner = Array.from({ length: n }, (_, i) =>
    !closed && (i === 0 || i === n - 1) ? true : angleAt(i) <= straightAngleDeg,
  )

  const out: number[] = []
  let acc = 0

  if (closed) {
    const start = corner.findIndex(Boolean)
    if (start < 0) return [strokeLength(stroke)]
    for (let k = 0; k < segs.length; k += 1) {
      const index = (start + k) % segs.length
      acc += dist(segs[index]!.a, segs[index]!.b)
      if (corner[(index + 1) % n]) {
        out.push(acc)
        acc = 0
      }
    }
  } else {
    for (let i = 0; i < segs.length; i += 1) {
      acc += dist(segs[i]!.a, segs[i]!.b)
      if (corner[i + 1]) {
        out.push(acc)
        acc = 0
      }
    }
  }
  if (acc > 0.001) out.push(acc)
  return out
}
