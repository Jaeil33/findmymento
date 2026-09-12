import adjacency from '@/data/region-adjacency.json'
import type { RegionExpansion } from '@/types/domain'

export type Region = {
  code: string
  name: string
  sido: string
  label: string
  neighbors: string[]
}

const REGIONS: Region[] = adjacency.regions

const BY_CODE = new Map<string, Region>(REGIONS.map((r) => [r.code, r]))

/** 파일럿 지역 (PRD 확정 결정 9). */
export const PILOT_REGION_CODE = '41210'

export function allRegions(): Region[] {
  return REGIONS
}

export function getRegion(code: string): Region | undefined {
  return BY_CODE.get(code)
}

/** 화면에 쓰는 표기. 코드가 없으면 코드를 그대로 보여준다 — 빈 문자열을 렌더하지 않는다. */
export function regionLabel(code: string | null | undefined): string {
  if (!code) return '지역 미지정'
  return BY_CODE.get(code)?.label ?? code
}

/** 시군구 이름만. 카드에서는 `광명시`처럼 짧게 쓴다. */
export function regionName(code: string | null | undefined): string {
  if (!code) return '지역 미지정'
  return BY_CODE.get(code)?.name ?? code
}

export function neighbors(code: string): string[] {
  return BY_CODE.get(code)?.neighbors ?? []
}

/**
 * 인접의 인접(2-hop). 자기 자신과 1-hop 은 제외한다.
 *
 * "같은 시도" 단계를 만들지 않는다 — 광명시 인접 5곳 중 2곳이 서울이라
 * 행정 경계로 넓히면 구로구보다 양평군이 먼저 나온다 (PRD 확정 결정 9 / ADR-005).
 */
export function twoHopNeighbors(code: string): string[] {
  const first = new Set(neighbors(code))
  const out = new Set<string>()
  for (const n of first) {
    for (const nn of neighbors(n)) {
      if (nn !== code && !first.has(nn)) out.add(nn)
    }
  }
  return [...out].sort()
}

/**
 * 결과가 비면 단계적으로 넓힌다. 빈 화면을 절대 보여주지 않는다.
 *
 * `같은 시군구 → 인접(1-hop) → 인접의 인접(2-hop) → none`
 *
 * `none` 에 도달한 사실 자체가 미충족 수요 데이터다 (E-07·E-16).
 * 호출자는 stage 를 화면에 그대로 노출해야 한다 — "광명시에는 아직 없어요,
 * 가까운 구로구·시흥시에서 찾았어요"가 빈 결과보다 훨씬 낫다.
 */
export function expandRegion(
  code: string,
  hasResults: (codes: string[]) => boolean,
): RegionExpansion {
  if (!BY_CODE.has(code)) return { stage: 'none', codes: [] }

  const same = [code]
  if (hasResults(same)) return { stage: 'same', codes: same }

  const adjacent = neighbors(code)
  if (adjacent.length > 0 && hasResults(adjacent)) return { stage: 'adjacent', codes: adjacent }

  const twoHop = twoHopNeighbors(code)
  if (twoHop.length > 0 && hasResults(twoHop)) return { stage: 'two_hop', codes: twoHop }

  return { stage: 'none', codes: [] }
}

/** 확장 단계를 사람 말로. 화면 문구를 컴포넌트마다 다시 쓰지 않게 한 곳에 둔다. */
export function expansionMessage(origin: string, e: RegionExpansion): string {
  const here = regionName(origin)
  switch (e.stage) {
    case 'same':
      return `${here}에서 찾았어요.`
    case 'adjacent':
      return `${here}에는 아직 없어요. 가까운 ${labelList(e.codes, 2)}에서 찾았어요.`
    case 'two_hop':
      return `${here}와 바로 옆 지역에는 아직 없어요. 조금 더 넓혀 ${labelList(e.codes, 2)}에서 찾았어요.`
    case 'none':
      return `${here}와 주변 지역에 아직 이 분야 강사가 없어요.`
  }
}

/** 지역 거리. 추천 카드 정렬과 "우리 동네" 배지에 쓴다. */
export function regionDistance(origin: string, target: string): 0 | 1 | 2 | 3 {
  if (origin === target) return 0
  if (neighbors(origin).includes(target)) return 1
  if (twoHopNeighbors(origin).includes(target)) return 2
  return 3
}

function labelList(codes: string[], max: number): string {
  const names = codes.slice(0, max).map(regionName)
  const rest = codes.length - names.length
  return rest > 0 ? `${names.join('·')} 등 ${codes.length}곳` : names.join('·')
}
