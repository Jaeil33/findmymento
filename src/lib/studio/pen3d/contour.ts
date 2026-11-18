/**
 * `art` 에서 `trace` 를 **유도한다** (ADR-040) — 이 개편의 핵심 메커니즘이다.
 *
 * 순서는 여기 한 곳에 있고 바뀌지 않는다:
 *
 *   색 영역 채움 → 모폴로지 닫힘 → 가장 큰 덩어리 → 경계 추적 → 단순화 → 등간격 리샘플
 *
 * **왜 라스터를 경유하는가.** `art` 에서 덧그릴 선을 뽑는 일은 본질적으로 N 개 영역의 합집합
 * 외곽선을 구하는 것이다. `geometry.ts` 에는 폴리곤 부울 연산이 없고(`segIntersects` 는 교차
 * 여부 boolean 만 돌려준다), 견고한 부울 연산은 수치 안정성 때문에 버그가 가장 많이 나오는
 * 코드다. 비트맵에서는 겹침·분리·구멍이 **그냥 합쳐진다** — 계산할 것이 없다.
 *
 * 그리고 라스터 경계는 **구조적으로 자기교차가 불가능하다.** 그래서 `shape.ts` 의
 * "자기교차면 폐기" 가 이 경로에서는 존재할 이유가 없다.
 *
 * 결정론이다 — 같은 `art` 는 항상 같은 점 목록을 낸다. 부동소수 비교가 없고 정수 격자에서만
 * 판정하므로 플랫폼 간에도 같다. 테스트가 좌표를 고정할 수 있다.
 *
 * **서버 전용이 아니다.** `node:*` 를 import 하지 않는다 — 렌더 경로가 이 파일을 쓴다.
 */

import type { ArtRegion, NormPoint } from '@/types/studio'

// ============================================================================
// 상수 — `docs/STUDIO.md` 의 표와 일치시킨다
// ============================================================================

/** 채움 격자의 한 변. 512 면 정규화 1 당 약 2px 이라 선폭(1.6mm)보다 잘게 본다 */
export const CONTOUR_PX = 512

/**
 * 닫힘 반지름 (픽셀). **선폭보다 좁은 틈은 펜으로 그릴 수 없다** — 그 틈으로 갈라진 두 영역은
 * 도안에서 분리될 수 없으므로 비트맵에서 먼저 붙인다. 침식으로 되돌리므로 외곽은 보존된다.
 */
export const CONTOUR_CLOSE_PX = 4

/** Douglas-Peucker 허용 오차 (정규화 단위). 계단형 경계를 사람이 그린 선처럼 편다 */
export const CONTOUR_EPSILON = 0.004

/** 리샘플 뒤 점 개수. `SHAPE_POINTS` 상한 안에 있어야 `readShape` 가 솎지 않는다 */
export const CONTOUR_POINTS = 56

// ============================================================================
// 채움 — 홀수-짝수 규칙 스캔라인
// ============================================================================

type Grid = {
  size: number
  /** 1 이면 덮인 픽셀 */
  on: Uint8Array
  /** 정규화 → 픽셀 변환에 쓴 값. 되돌릴 때 같은 값을 쓴다 */
  scale: number
  offsetX: number
  offsetY: number
}

/** 한 폴리곤이 이 스캔라인을 가로지르는 x 좌표들 */
function crossings(points: NormPoint[], y: number, scale: number, ox: number, oy: number): number[] {
  const xs: number[] = []
  const n = points.length
  for (let i = 0; i < n; i += 1) {
    const a = points[i]!
    const b = points[(i + 1) % n]!
    const ay = a.y * scale + oy
    const by = b.y * scale + oy
    // 아래쪽 끝점은 포함하지 않는다 — 꼭짓점이 스캔라인에 정확히 놓일 때 두 번 세는 것을 막는다
    if (ay === by) continue
    if (y < Math.min(ay, by) || y >= Math.max(ay, by)) continue
    const ax = a.x * scale + ox
    const bx = b.x * scale + ox
    xs.push(ax + ((y - ay) / (by - ay)) * (bx - ax))
  }
  return xs.sort((p, q) => p - q)
}

/** 홀수-짝수로 한 줄을 켠다 */
function fillRow(row: Uint8Array, xs: number[], size: number): void {
  for (let i = 0; i + 1 < xs.length; i += 2) {
    const from = Math.max(0, Math.ceil(xs[i]!))
    const to = Math.min(size - 1, Math.floor(xs[i + 1]!))
    for (let x = from; x <= to; x += 1) row[x] = 1
  }
}

/**
 * 영역들을 격자에 채운다. **영역마다 따로 채운 뒤 OR 로 합친다** —
 * 전부를 한 번에 홀수-짝수로 채우면 겹친 두 영역이 서로를 지운다.
 * 구멍은 그 영역 안에서만 뺀다.
 */
function fill(regions: ArtRegion[], size: number): Grid | null {
  const all = regions.flatMap((r) => r.outline.points)
  if (all.length < 3) return null

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of all) {
    if (p.x < minX) minX = p.x
    if (p.x > maxX) maxX = p.x
    if (p.y < minY) minY = p.y
    if (p.y > maxY) maxY = p.y
  }
  const spanX = Math.max(maxX - minX, 1e-6)
  const spanY = Math.max(maxY - minY, 1e-6)

  // 테두리를 비워 둔다 — 경계 추적이 격자 밖을 보지 않게 하고, 닫힘의 팽창 여유도 된다
  const pad = CONTOUR_CLOSE_PX + 2
  const scale = Math.min((size - pad * 2) / spanX, (size - pad * 2) / spanY)
  const offsetX = pad - minX * scale
  const offsetY = pad - minY * scale

  const on = new Uint8Array(size * size)
  const regionRow = new Uint8Array(size)
  const holeRow = new Uint8Array(size)

  for (const region of regions) {
    if (region.outline.points.length < 3) continue
    for (let y = 0; y < size; y += 1) {
      regionRow.fill(0)
      fillRow(regionRow, crossings(region.outline.points, y + 0.5, scale, offsetX, offsetY), size)

      if (region.holes.length > 0) {
        holeRow.fill(0)
        for (const hole of region.holes) {
          if (hole.points.length < 3) continue
          fillRow(holeRow, crossings(hole.points, y + 0.5, scale, offsetX, offsetY), size)
        }
        for (let x = 0; x < size; x += 1) if (holeRow[x] === 1) regionRow[x] = 0
      }

      const base = y * size
      for (let x = 0; x < size; x += 1) if (regionRow[x] === 1) on[base + x] = 1
    }
  }

  return { size, on, scale, offsetX, offsetY }
}

// ============================================================================
// 모폴로지 닫힘 — 선폭보다 좁은 틈을 붙인다
// ============================================================================

/** 체비셰프 거리 `r` 로 팽창하거나 침식한다. 분리 가능한 커널이라 두 번 훑으면 된다 */
function morph(src: Uint8Array, size: number, r: number, dilate: boolean): Uint8Array {
  const hit = dilate ? 1 : 0
  const miss = dilate ? 0 : 1

  const pass = (input: Uint8Array, horizontal: boolean): Uint8Array => {
    const out = new Uint8Array(size * size)
    for (let a = 0; a < size; a += 1) {
      for (let b = 0; b < size; b += 1) {
        let value = miss
        for (let d = -r; d <= r; d += 1) {
          const c = b + d
          if (c < 0 || c >= size) {
            // 격자 밖은 "꺼짐" 이다. 침식에서는 테두리가 깎이지만 테두리는 비워 두었다.
            if (!dilate) {
              value = 0
              break
            }
            continue
          }
          const index = horizontal ? a * size + c : c * size + a
          if (input[index] === hit) {
            value = hit
            break
          }
        }
        out[horizontal ? a * size + b : b * size + a] = value
      }
    }
    return out
  }

  return pass(pass(src, true), false)
}

// ============================================================================
// 가장 큰 덩어리 — `silhouette` 는 닫힌 윤곽 **하나**다
// ============================================================================

type Component = { pixels: Uint8Array; area: number }

/** 4-이웃 연결 성분 중 가장 큰 것. 버린 면적 비율을 같이 돌려준다 */
function largestComponent(on: Uint8Array, size: number): { best: Component; droppedRatio: number } | null {
  const label = new Int32Array(size * size).fill(-1)
  const stack: number[] = []
  let total = 0
  let best: Component | null = null

  for (let start = 0; start < on.length; start += 1) {
    if (on[start] !== 1 || label[start] !== -1) continue

    const pixels = new Uint8Array(size * size)
    let area = 0
    stack.push(start)
    label[start] = start

    while (stack.length > 0) {
      const index = stack.pop()!
      pixels[index] = 1
      area += 1
      const x = index % size
      const y = (index - x) / size
      const push = (nx: number, ny: number) => {
        if (nx < 0 || ny < 0 || nx >= size || ny >= size) return
        const next = ny * size + nx
        if (on[next] !== 1 || label[next] !== -1) return
        label[next] = start
        stack.push(next)
      }
      push(x + 1, y)
      push(x - 1, y)
      push(x, y + 1)
      push(x, y - 1)
    }

    total += area
    if (!best || area > best.area) best = { pixels, area }
  }

  if (!best || total === 0) return null
  return { best, droppedRatio: (total - best.area) / total }
}

// ============================================================================
// 경계 추적 — Moore 이웃, 시계방향
// ============================================================================

/** 8-이웃 시계 순서 (오른쪽부터) */
const NEIGHBORS: readonly [number, number][] = [
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
  [0, -1],
  [1, -1],
]

/**
 * 덩어리의 바깥 경계를 **정확히 한 바퀴** 돈다.
 *
 * 멈추는 조건은 `(픽셀, 진입 방향)` 상태의 반복이다. 걷기가 결정론이므로 같은 상태에 두 번
 * 서면 그 뒤는 앞서 걸은 길과 똑같다 — 거기서 끊으면 고리가 정확히 한 바퀴다.
 *
 * "시작 픽셀을 다시 밟으면 멈춘다" 는 8자 경계에서 반 바퀴만 돌고 끝나고, 반대로 "시작
 * 픽셀에 같은 방향으로 다시 들어오면 멈춘다" 는 **두 바퀴를 돈다** — 시작 진입 방향은
 * 추측값이라 첫 바퀴에서 맞지 않기 때문이다. 둘 다 실제로 틀렸다.
 */
function traceBoundary(pixels: Uint8Array, size: number): [number, number][] | null {
  let startIndex = -1
  for (let i = 0; i < pixels.length; i += 1) {
    if (pixels[i] === 1) {
      startIndex = i
      break
    }
  }
  if (startIndex < 0) return null

  const sx = startIndex % size
  const sy = (startIndex - sx) / size
  const at = (x: number, y: number): boolean =>
    x >= 0 && y >= 0 && x < size && y < size && pixels[y * size + x] === 1

  const path: [number, number][] = []
  let cx = sx
  let cy = sy
  // 위에서 아래로 훑어 처음 만난 픽셀이므로 바로 위는 비어 있다. 거기서 들어온 것으로 둔다.
  let entry = 6
  const seen = new Set<number>()
  const limit = size * size * 8

  for (let step = 0; step < limit; step += 1) {
    const state = (cy * size + cx) * 8 + entry
    if (seen.has(state)) break
    seen.add(state)
    path.push([cx, cy])

    let moved = false
    // 들어온 방향의 다음 이웃부터 시계방향으로 돈다
    for (let k = 1; k <= 8; k += 1) {
      const dir = (entry + k) % 8
      const [dx, dy] = NEIGHBORS[dir]!
      const nx = cx + dx
      const ny = cy + dy
      if (!at(nx, ny)) continue
      // 다음 칸에서 보면 우리가 온 방향은 반대쪽이다
      entry = (dir + 4) % 8
      cx = nx
      cy = ny
      moved = true
      break
    }

    if (!moved) break // 외톨이 픽셀
  }

  return path.length >= 3 ? path : null
}

// ============================================================================
// 단순화와 리샘플
// ============================================================================

function perpendicular(p: NormPoint, a: NormPoint, b: NormPoint): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = Math.hypot(dx, dy)
  if (len < 1e-9) return Math.hypot(p.x - a.x, p.y - a.y)
  return Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / len
}

/** Douglas-Peucker. 닫힌 경계이므로 가장 먼 두 점으로 잘라 두 번 돌린다 */
function simplify(points: NormPoint[], epsilon: number): NormPoint[] {
  if (points.length < 4) return points

  const run = (list: NormPoint[]): NormPoint[] => {
    if (list.length < 3) return list
    let worst = 0
    let index = 0
    const first = list[0]!
    const last = list[list.length - 1]!
    for (let i = 1; i < list.length - 1; i += 1) {
      const d = perpendicular(list[i]!, first, last)
      if (d > worst) {
        worst = d
        index = i
      }
    }
    if (worst <= epsilon) return [first, last]
    return [...run(list.slice(0, index + 1)).slice(0, -1), ...run(list.slice(index))]
  }

  // 닫힌 고리는 끝점이 없다 — 서로 가장 먼 두 점을 끝점으로 삼는다
  let far = 0
  let farIndex = 0
  const origin = points[0]!
  for (let i = 1; i < points.length; i += 1) {
    const d = Math.hypot(points[i]!.x - origin.x, points[i]!.y - origin.y)
    if (d > far) {
      far = d
      farIndex = i
    }
  }

  const headArc = points.slice(0, farIndex + 1)
  const tailArc = [...points.slice(farIndex), origin]
  const head = run(headArc)
  const tail = run(tailArc)
  return [...head.slice(0, -1), ...tail.slice(0, -1)]
}

/** 둘레를 따라 등간격으로 `count` 개를 뽑는다. 선분 길이가 고르면 검증이 안정된다 */
function resample(points: NormPoint[], count: number): NormPoint[] {
  const n = points.length
  if (n < 3) return points

  const lengths: number[] = []
  let total = 0
  for (let i = 0; i < n; i += 1) {
    const a = points[i]!
    const b = points[(i + 1) % n]!
    const d = Math.hypot(b.x - a.x, b.y - a.y)
    lengths.push(d)
    total += d
  }
  if (total < 1e-9) return points

  const out: NormPoint[] = []
  const step = total / count
  let edge = 0
  let walked = 0

  for (let i = 0; i < count; i += 1) {
    const target = i * step
    while (edge < n - 1 && walked + lengths[edge]! < target) {
      walked += lengths[edge]!
      edge += 1
    }
    const a = points[edge]!
    const b = points[(edge + 1) % n]!
    const span = lengths[edge]!
    const t = span < 1e-9 ? 0 : (target - walked) / span
    out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
  }

  return out
}

// ============================================================================
// 공개 함수
// ============================================================================

export type TraceResult = {
  /** 유도된 덧그릴 윤곽. 정규화 좌표이고 **닫힌 고리다** (첫 점을 끝에 다시 쓰지 않는다) */
  points: NormPoint[]
  /** 가장 큰 덩어리를 고르면서 버린 면적 비율. 0 이면 전부 하나로 이어져 있었다 */
  dropped_ratio: number
}

/**
 * 색 영역들에서 덧그릴 윤곽 하나를 유도한다 (ADR-040).
 *
 * 돌려주는 좌표계는 **입력과 같다** — 정규화 비율이고 mm 가 아니다. mm 환산·접합·배치·판정은
 * 전부 뒤의 코드가 한다 (`shapeRecipe` → `buildPattern` → `validatePen`).
 *
 * 유도할 수 없으면 `null` 이다 — 영역이 비었거나 점이 3개 미만인 경우다. 호출자는 그때
 * 폴백 사슬의 다음 순서로 내려간다.
 */
export function traceFromArt(
  regions: ArtRegion[],
  options: { size?: number; epsilon?: number; points?: number } = {},
): TraceResult | null {
  const size = Math.max(64, Math.min(1024, Math.round(options.size ?? CONTOUR_PX)))
  const epsilon = options.epsilon ?? CONTOUR_EPSILON
  const count = Math.max(8, Math.round(options.points ?? CONTOUR_POINTS))

  const grid = fill(regions, size)
  if (!grid) return null

  // 선폭보다 좁은 틈을 붙인다. 침식으로 되돌리므로 외곽 위치는 보존된다.
  const closed = morph(morph(grid.on, size, CONTOUR_CLOSE_PX, true), size, CONTOUR_CLOSE_PX, false)

  const component = largestComponent(closed, size)
  if (!component) return null

  const boundary = traceBoundary(component.best.pixels, size)
  if (!boundary) return null

  // 픽셀 중심을 정규화 좌표로 되돌린다 — 채울 때 쓴 값을 그대로 역으로 쓴다
  const normalized: NormPoint[] = boundary.map(([px, py]) => ({
    x: (px + 0.5 - grid.offsetX) / grid.scale,
    y: (py + 0.5 - grid.offsetY) / grid.scale,
  }))

  const simplified = simplify(normalized, epsilon)
  if (simplified.length < 3) return null

  return {
    points: resample(simplified, count),
    dropped_ratio: Math.round(component.droppedRatio * 1000) / 1000,
  }
}
