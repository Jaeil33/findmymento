/**
 * 벡터 아트 SVG → 색 영역 (`ArtRegion[]`) — 코퍼스 적재의 핵심 (ADR-041).
 *
 * **왜 코퍼스인가.** 베이스라인에서 LLM 윤곽의 알아봄 통과율이 `held-out` 45.1%(pass@1)
 * 였다. 사람이 그린 아트는 애초에 그 단어로 보이게 그려진 것이라 그 관문을 통과할 필요가
 * 없다 — 통과한 상태로 들어온다. 그리고 적중하면 **LLM 호출이 0회**다.
 *
 * 입력은 `<path fill="#HEX" d="..."/>` 가 여러 개인 평평한 SVG 다 (Twemoji 가 그 형태다).
 * 그 구조가 그대로 `ArtRegion[]` 이 된다 — path 하나가 색 영역 하나다.
 *
 * **구멍 판정이 이 파일의 핵심이다.** Twemoji 의 바퀴는 한 `path` 안에 바깥 원과 안쪽 원이
 * 두 서브패스로 들어 있다. 안쪽을 구멍으로 알아보지 못하면 바퀴가 꽉 찬 원이 되고, 자전거는
 * 다시 덩어리가 된다 — 측정에서 실제로 그 문구를 받았다("바퀴 둘과 뼈대가 보이지 않습니다").
 *
 * 판정 규칙: **다른 서브패스 안에 들어 있으면 구멍이다.** 감는 방향(`signedArea` 부호)으로
 * 판정하는 쪽이 명세에는 더 맞지만, 실제 아트는 방향이 일관되지 않아 자주 틀린다. 포함
 * 관계는 눈으로 보이는 것과 같고 결정론이다.
 *
 * **외부 의존성을 쓰지 않는다.** XML 파서도 쓰지 않는다 — 읽어야 하는 것이 `fill` 과 `d`
 * 두 속성뿐이라, 정규식이 파서보다 작고 깨질 구석이 적다. 대신 **읽을 수 없는 입력은 조용히
 * 건너뛴다**: 코퍼스 적재는 오프라인 배치이고, 한 파일이 이상해서 전체가 멈추면 안 된다.
 */

import { nearestPaletteName } from '@/lib/studio/palette'
import { flattenPath, pointInPolygon, type Pt, type SubPath } from '@/lib/studio/svg-path'
import type { ArtRegion, NormPoint } from '@/types/studio'

/**
 * 한 영역의 점 개수 상한.
 *
 * 160 으로 시작했다가 48 로 내렸다. 적재 결과가 `records.ts` **3.6MB**(항목당 505점)가 됐고,
 * 그 파일은 번들에 들어가는 TS 배열이다. 85mm 도안에서 한 고리에 160점은 점 간격 0.5mm —
 * 인쇄되는 색 면에 그만한 해상도가 필요하지 않다.
 *
 * 덧그릴 선의 품질은 이 값과 무관하다. 그 선은 라스터 등고선에서 다시 뽑고(ADR-040)
 * `CONTOUR_POINTS` 로 리샘플된다.
 */
const MAX_POINTS_PER_RING = 48

/** 영역 개수 상한 — `shape.ts` 의 `ART_MAX_REGIONS` 와 같은 값이어야 한다 */
const MAX_REGIONS = 14

/**
 * 무시할 만큼 작은 조각. 전체 면적 대비 비율이다.
 *
 * Twemoji 에는 눈동자 반사광 같은 1px 짜리 흰 점이 들어 있다. 그런 조각은 종이에서 보이지
 * 않고 영역 개수 상한만 잡아먹는다 — 정말 중요한 영역이 상한에 밀려 빠진다.
 */
const MIN_AREA_RATIO = 0.004

type RawPath = { fill: string; d: string }

/** `<path>` 에서 `fill` 과 `d` 만 뽑는다. 순서는 문서 순서이고 그것이 곧 `z` 다 */
export function readPaths(svg: string): RawPath[] {
  const out: RawPath[] = []
  for (const match of svg.matchAll(/<path\b([^>]*)\/?>/g)) {
    const attrs = match[1] ?? ''
    const d = /\bd\s*=\s*"([^"]*)"/.exec(attrs)?.[1]
    if (!d) continue
    // fill 이 없으면 SVG 기본값은 검정이다
    const fill = /\bfill\s*=\s*"([^"]*)"/.exec(attrs)?.[1]?.trim() ?? '#000000'
    if (fill.toLowerCase() === 'none') continue
    out.push({ fill, d })
  }
  return out
}

/** 폴리곤의 면적 (부호 없음) */
function area(points: Pt[]): number {
  let sum = 0
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i]!
    const b = points[(i + 1) % points.length]!
    sum += a.x * b.y - b.x * a.y
  }
  return Math.abs(sum / 2)
}

/** 점이 너무 많으면 등간격으로 솎는다. 모양은 거의 그대로다 */
function thin(points: Pt[], max: number): Pt[] {
  if (points.length <= max) return points
  const out: Pt[] = []
  const step = points.length / max
  for (let i = 0; i < max; i += 1) out.push(points[Math.floor(i * step)]!)
  return out
}

/**
 * 한 `path` 의 서브패스들을 **바깥 + 구멍** 묶음으로 가른다.
 *
 * 바깥이 여러 개일 수 있다 — 자전거의 바퀴 둘이 같은 색이라 한 `path` 에 들어 있는 식이다.
 * 그래서 돌려주는 것은 묶음의 배열이다.
 */
function groupRings(subpaths: SubPath[]): { outer: Pt[]; holes: Pt[][] }[] {
  const rings = subpaths
    .map((sub) => sub.points)
    .filter((points) => points.length >= 3)
    .map((points) => ({ points, size: area(points) }))
    .filter((ring) => ring.size > 0)
    .sort((a, b) => b.size - a.size)

  const groups: { outer: Pt[]; holes: Pt[][] }[] = []

  for (const ring of rings) {
    // 자기 자신보다 큰 고리 안에 들어 있으면 구멍이다. 큰 것부터 보므로 바깥이 먼저 등록된다.
    const probe = ring.points[0]!
    const container = groups.find((group) => pointInPolygon(group.outer, probe))
    if (container) container.holes.push(ring.points)
    else groups.push({ outer: ring.points, holes: [] })
  }

  return groups
}

export type ArtImport = {
  regions: ArtRegion[]
  /** 원본 viewBox 의 가로·세로. 정규화에 쓴다 */
  width: number
  height: number
}

/**
 * SVG 문서를 색 영역으로 바꾼다.
 *
 * 좌표는 **원본 viewBox 공간 그대로** 돌려준다. 정규화는 `readShape` 가 두 레이어를 한꺼번에
 * 하므로 여기서 하지 않는다 — 여기서 1 로 맞추면 자가 두 개가 된다.
 *
 * 읽을 수 없으면 `null` 이다. 호출자(적재 스크립트)는 그 파일을 건너뛰고 보고서에 적는다.
 */
export function importSvgArt(svg: string): ArtImport | null {
  const viewBox = /\bviewBox\s*=\s*"([^"]*)"/.exec(svg)?.[1]?.trim().split(/[\s,]+/).map(Number)
  const width = viewBox && viewBox.length === 4 && viewBox[2]! > 0 ? viewBox[2]! : 0
  const height = viewBox && viewBox.length === 4 && viewBox[3]! > 0 ? viewBox[3]! : 0
  if (width === 0 || height === 0) return null

  const paths = readPaths(svg)
  if (paths.length === 0) return null

  type Candidate = { outer: Pt[]; holes: Pt[][]; color: string; size: number }
  const candidates: Candidate[] = []

  for (const path of paths) {
    for (const group of groupRings(flattenPath(path.d))) {
      candidates.push({
        outer: group.outer,
        holes: group.holes,
        color: path.fill,
        size: area(group.outer),
      })
    }
  }
  if (candidates.length === 0) return null

  // 눈동자 반사광 같은 티끌을 뺀다 — 영역 상한을 그런 것에 쓰지 않는다
  const largest = Math.max(...candidates.map((c) => c.size))
  const kept = candidates.filter((c) => c.size / largest >= MIN_AREA_RATIO)
  if (kept.length === 0) return null

  /**
   * `z` 는 **문서 순서**다 (먼저 그린 것이 아래). 면적 순서로 바꾸면 안 된다 — 아트는
   * 큰 도형 위에 작은 무늬를 얹는 식으로도, 작은 도형을 큰 것으로 감싸는 식으로도 그려진다.
   * 원본의 겹침 순서가 곧 작가의 의도다.
   *
   * 상한을 넘으면 **큰 영역부터** 남긴다. 작은 무늬보다 몸통이 중요하다.
   */
  const ordered = kept
    .map((candidate, index) => ({ candidate, index }))
    .sort((a, b) => b.candidate.size - a.candidate.size)
    .slice(0, MAX_REGIONS)
    .sort((a, b) => a.index - b.index)

  const toNorm = (points: Pt[]): NormPoint[] =>
    thin(points, MAX_POINTS_PER_RING).map((p) => ({ x: p.x, y: p.y }))

  const regions: ArtRegion[] = ordered.map(({ candidate }, z) => ({
    outline: { points: toNorm(candidate.outer), closed: true as const },
    holes: candidate.holes
      .map((hole) => ({ points: toNorm(hole), closed: true as const }))
      .filter((hole) => hole.points.length >= 3),
    color: nearestPaletteName(candidate.color),
    z,
  }))

  return { regions, width, height }
}
