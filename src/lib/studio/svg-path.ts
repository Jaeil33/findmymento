/**
 * SVG `d` 속성 → 폴리곤 (ADR-041).
 *
 * 벡터 아트 코퍼스를 색 영역(`ArtRegion`)으로 바꾸는 첫 단계다. 사람이 그린 아트를 쓰는 것이
 * 이 개편의 품질 근거이고(베이스라인에서 LLM 윤곽의 알아봄 통과율이 `held-out` 45.1% 였다),
 * 그 아트는 전부 베지어 곡선으로 되어 있다.
 *
 * **외부 의존성을 쓰지 않는다.** 이 파일이 하는 일은 셋뿐이고 전부 결정론이다:
 *   ① `d` 를 명령으로 쪼갠다  ② 곡선을 직선으로 펴 폴리라인을 만든다  ③ 서브패스로 나눈다
 *
 * 구멍 판정(어느 서브패스가 바퀴의 안쪽인가)은 여기서 하지 않는다 — 그건 포함 관계의 문제이고
 * `svg-art.ts` 가 맡는다. 이 파일은 좌표만 다룬다.
 *
 * 단위는 **입력 좌표 그대로**다. Twemoji 는 `viewBox="0 0 36 36"` 이라 0~36 이 나온다.
 * 정규화는 호출자가 한다 — 여기서 1 로 맞추면 viewBox 가 다른 소스를 섞을 수 없다.
 */

export type Pt = { x: number; y: number }

/** 곡선 하나를 몇 조각 직선으로 펴는가. 36×36 공간에서 이 정도면 계단이 보이지 않는다 */
export const CURVE_STEPS = 12

// ============================================================================
// 토크나이저
// ============================================================================

type Command = { code: string; args: number[] }

const COMMAND_ARGS: Readonly<Record<string, number>> = {
  M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0,
}

/**
 * `d` 를 명령 목록으로 쪼갠다.
 *
 * 숫자 표기가 험하다 — `1.5.5` 는 `1.5` 와 `.5` 두 개이고, `1e-5` 는 하나이며, `3-4` 는
 * `3` 과 `-4` 두 개다. 정규식 하나로 숫자를 뽑아야 이것들이 전부 맞는다.
 */
export function parsePath(d: string): Command[] {
  const out: Command[] = []
  const tokens = d.match(/[MmLlHhVvCcSsQqTtAaZz]|-?\d*\.?\d+(?:[eE][-+]?\d+)?/g)
  if (!tokens) return out

  /**
   * 명령어인가. **글자를 포함하는가로 판정하면 안 된다** — 지수 표기 `1e2` 가 명령으로
   * 읽히고, 그 path 는 통째로 망가진다. 한 글자이고 명령 목록에 있어야 명령이다.
   */
  const isCommand = (token: string): boolean =>
    token.length === 1 && COMMAND_ARGS[token.toUpperCase()] !== undefined

  let i = 0
  let previous = ''
  while (i < tokens.length) {
    let code = tokens[i]!
    if (isCommand(code)) {
      i += 1
    } else {
      // 명령을 생략하고 좌표만 이어 쓴 경우 — 앞 명령이 반복된다 (M 뒤는 L 이다)
      if (previous === '') return out
      code = previous === 'M' ? 'L' : previous === 'm' ? 'l' : previous
    }

    const need = COMMAND_ARGS[code.toUpperCase()]
    if (need === undefined) return out

    const args: number[] = []
    for (let k = 0; k < need; k += 1) {
      const value = tokens[i]
      if (value === undefined || isCommand(value)) break
      args.push(Number(value))
      i += 1
    }
    if (args.length < need) break

    out.push({ code, args })
    previous = code
  }
  return out
}

// ============================================================================
// 곡선 펴기
// ============================================================================

function cubic(p0: Pt, p1: Pt, p2: Pt, p3: Pt, steps: number): Pt[] {
  const out: Pt[] = []
  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps
    const u = 1 - t
    out.push({
      x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
      y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
    })
  }
  return out
}

function quadratic(p0: Pt, p1: Pt, p2: Pt, steps: number): Pt[] {
  // 2차는 3차로 올려서 같은 코드로 편다 — 제어점 공식은 고정이다
  return cubic(
    p0,
    { x: p0.x + (2 / 3) * (p1.x - p0.x), y: p0.y + (2 / 3) * (p1.y - p0.y) },
    { x: p2.x + (2 / 3) * (p1.x - p2.x), y: p2.y + (2 / 3) * (p1.y - p2.y) },
    p2,
    steps,
  )
}

/**
 * 타원 호 (`A`). 아트에서 드물지만 나오면 **그 서브패스가 통째로 망가지므로** 처리한다.
 * SVG 명세의 끝점 → 중심점 변환을 그대로 쓴다.
 */
function arc(
  from: Pt,
  rx: number,
  ry: number,
  rotationDeg: number,
  largeArc: boolean,
  sweep: boolean,
  to: Pt,
  steps: number,
): Pt[] {
  if (rx === 0 || ry === 0) return [to]

  const phi = (rotationDeg * Math.PI) / 180
  const cos = Math.cos(phi)
  const sin = Math.sin(phi)

  const dx2 = (from.x - to.x) / 2
  const dy2 = (from.y - to.y) / 2
  const x1 = cos * dx2 + sin * dy2
  const y1 = -sin * dx2 + cos * dy2

  let ax = Math.abs(rx)
  let ay = Math.abs(ry)
  // 반지름이 모자라면 명세대로 키운다
  const lambda = (x1 * x1) / (ax * ax) + (y1 * y1) / (ay * ay)
  if (lambda > 1) {
    const k = Math.sqrt(lambda)
    ax *= k
    ay *= k
  }

  const sign = largeArc === sweep ? -1 : 1
  const numerator = ax * ax * ay * ay - ax * ax * y1 * y1 - ay * ay * x1 * x1
  const denominator = ax * ax * y1 * y1 + ay * ay * x1 * x1
  const factor = sign * Math.sqrt(Math.max(0, numerator / denominator))

  const cx1 = (factor * ax * y1) / ay
  const cy1 = (-factor * ay * x1) / ax
  const cx = cos * cx1 - sin * cy1 + (from.x + to.x) / 2
  const cy = sin * cx1 + cos * cy1 + (from.y + to.y) / 2

  const angle = (ux: number, uy: number, vx: number, vy: number): number => {
    const dot = ux * vx + uy * vy
    const len = Math.hypot(ux, uy) * Math.hypot(vx, vy)
    const value = Math.acos(Math.min(1, Math.max(-1, len === 0 ? 1 : dot / len)))
    return ux * vy - uy * vx < 0 ? -value : value
  }

  const theta = angle(1, 0, (x1 - cx1) / ax, (y1 - cy1) / ay)
  let delta = angle(
    (x1 - cx1) / ax,
    (y1 - cy1) / ay,
    (-x1 - cx1) / ax,
    (-y1 - cy1) / ay,
  )
  if (!sweep && delta > 0) delta -= Math.PI * 2
  if (sweep && delta < 0) delta += Math.PI * 2

  const out: Pt[] = []
  for (let i = 1; i <= steps; i += 1) {
    const t = theta + delta * (i / steps)
    const px = ax * Math.cos(t)
    const py = ay * Math.sin(t)
    out.push({ x: cos * px - sin * py + cx, y: sin * px + cos * py + cy })
  }
  return out
}

// ============================================================================
// 서브패스
// ============================================================================

export type SubPath = {
  points: Pt[]
  /** `Z` 로 닫혔는가. 아트의 면은 전부 닫혀 있다 */
  closed: boolean
}

/**
 * `d` 를 닫힌 폴리곤 목록으로 만든다.
 *
 * 서브패스가 여러 개인 것이 **중요하다** — Twemoji 의 바퀴는 한 `path` 안에 바깥 원과
 * 안쪽 원 두 서브패스로 들어 있다. 하나로 합치면 바퀴가 꽉 찬 원이 된다.
 */
export function flattenPath(d: string, steps = CURVE_STEPS): SubPath[] {
  const commands = parsePath(d)
  const out: SubPath[] = []

  let current: Pt[] = []
  let cursor: Pt = { x: 0, y: 0 }
  let start: Pt = { x: 0, y: 0 }
  /** 마지막 3차 곡선의 두 번째 제어점 — `S` 가 이것을 반사해 쓴다 */
  let lastCubicControl: Pt | null = null
  let lastQuadControl: Pt | null = null

  const flush = (closed: boolean) => {
    if (current.length >= 3) out.push({ points: current, closed })
    current = []
  }

  for (const { code, args } of commands) {
    const relative = code === code.toLowerCase() && code.toUpperCase() !== 'Z'
    const upper = code.toUpperCase()
    const rx = relative ? cursor.x : 0
    const ry = relative ? cursor.y : 0

    if (upper === 'M') {
      flush(false)
      cursor = { x: args[0]! + rx, y: args[1]! + ry }
      start = cursor
      current = [cursor]
      lastCubicControl = null
      lastQuadControl = null
      continue
    }

    if (upper === 'Z') {
      flush(true)
      cursor = start
      lastCubicControl = null
      lastQuadControl = null
      continue
    }

    if (current.length === 0) current = [cursor]

    switch (upper) {
      case 'L': {
        cursor = { x: args[0]! + rx, y: args[1]! + ry }
        current.push(cursor)
        lastCubicControl = null
        lastQuadControl = null
        break
      }
      case 'H': {
        cursor = { x: args[0]! + rx, y: cursor.y }
        current.push(cursor)
        lastCubicControl = null
        lastQuadControl = null
        break
      }
      case 'V': {
        cursor = { x: cursor.x, y: args[0]! + ry }
        current.push(cursor)
        lastCubicControl = null
        lastQuadControl = null
        break
      }
      case 'C': {
        const c1 = { x: args[0]! + rx, y: args[1]! + ry }
        const c2 = { x: args[2]! + rx, y: args[3]! + ry }
        const end = { x: args[4]! + rx, y: args[5]! + ry }
        current.push(...cubic(cursor, c1, c2, end, steps))
        cursor = end
        lastCubicControl = c2
        lastQuadControl = null
        break
      }
      case 'S': {
        // 제어점이 없으면 현재 점이 제어점이다 (명세)
        const c1 = lastCubicControl
          ? { x: 2 * cursor.x - lastCubicControl.x, y: 2 * cursor.y - lastCubicControl.y }
          : cursor
        const c2 = { x: args[0]! + rx, y: args[1]! + ry }
        const end = { x: args[2]! + rx, y: args[3]! + ry }
        current.push(...cubic(cursor, c1, c2, end, steps))
        cursor = end
        lastCubicControl = c2
        lastQuadControl = null
        break
      }
      case 'Q': {
        const c = { x: args[0]! + rx, y: args[1]! + ry }
        const end = { x: args[2]! + rx, y: args[3]! + ry }
        current.push(...quadratic(cursor, c, end, steps))
        cursor = end
        lastQuadControl = c
        lastCubicControl = null
        break
      }
      case 'T': {
        const c: Pt = lastQuadControl
          ? { x: 2 * cursor.x - lastQuadControl.x, y: 2 * cursor.y - lastQuadControl.y }
          : cursor
        const end = { x: args[0]! + rx, y: args[1]! + ry }
        current.push(...quadratic(cursor, c, end, steps))
        cursor = end
        lastQuadControl = c
        lastCubicControl = null
        break
      }
      case 'A': {
        const end = { x: args[5]! + rx, y: args[6]! + ry }
        current.push(
          ...arc(cursor, args[0]!, args[1]!, args[2]!, args[3]! !== 0, args[4]! !== 0, end, steps),
        )
        cursor = end
        lastCubicControl = null
        lastQuadControl = null
        break
      }
    }
  }

  flush(false)
  return out
}

/** 폴리곤의 부호 있는 면적. 양수·음수로 **감는 방향**을 알 수 있다 */
export function signedArea(points: Pt[]): number {
  let sum = 0
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i]!
    const b = points[(i + 1) % points.length]!
    sum += a.x * b.y - b.x * a.y
  }
  return sum / 2
}

/** 점이 폴리곤 안에 있는가 (ray casting) */
export function pointInPolygon(polygon: Pt[], p: Pt): boolean {
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
