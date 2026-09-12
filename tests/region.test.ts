import { describe, expect, it } from 'vitest'
import {
  allRegions,
  expandRegion,
  expansionMessage,
  neighbors,
  PILOT_REGION_CODE,
  regionDistance,
  regionName,
  twoHopNeighbors,
} from '@/lib/region'

const GWANGMYEONG = PILOT_REGION_CODE // 41210
const GURO = '11530'
const GEUMCHEON = '11545'
const YANGPYEONG = '41830'

describe('지역 데이터', () => {
  it('수도권 66개 시군구가 있다', () => {
    expect(allRegions()).toHaveLength(66)
  })

  it('시도별 개수가 맞다 (서울 25 · 인천 10 · 경기 31)', () => {
    const count = (sido: string) => allRegions().filter((r) => r.sido === sido).length
    expect(count('서울특별시')).toBe(25)
    expect(count('인천광역시')).toBe(10)
    expect(count('경기도')).toBe(31)
  })

  it('인접 관계가 대칭이다 — 한쪽만 적혀 있으면 확장 결과가 방향에 따라 달라진다', () => {
    const asymmetric: string[] = []
    for (const r of allRegions()) {
      for (const n of r.neighbors) {
        if (!neighbors(n).includes(r.code)) asymmetric.push(`${r.code} -> ${n}`)
      }
    }
    expect(asymmetric).toEqual([])
  })

  it('고립된 시군구가 없다', () => {
    expect(allRegions().filter((r) => r.neighbors.length === 0)).toEqual([])
  })

  it('자기 자신을 인접으로 갖지 않는다', () => {
    for (const r of allRegions()) expect(r.neighbors).not.toContain(r.code)
  })
})

describe('광명시 인접 (PRD 확정 결정 9)', () => {
  it('인접은 구로구·금천구·시흥시·부천시·안양시 5곳이다', () => {
    expect(neighbors(GWANGMYEONG).map(regionName).sort()).toEqual(
      ['구로구', '금천구', '부천시', '시흥시', '안양시'].sort(),
    )
  })

  it('인접 5곳 중 2곳이 서울이다 — 그래서 "같은 시도" 확장이 의미가 없다', () => {
    const seoul = neighbors(GWANGMYEONG).filter((c) => c.startsWith('11'))
    expect(seoul).toHaveLength(2)
    expect(seoul.sort()).toEqual([GURO, GEUMCHEON].sort())
  })

  it('같은 경기도인 양평군은 1-hop 도 2-hop 도 아니다', () => {
    expect(neighbors(GWANGMYEONG)).not.toContain(YANGPYEONG)
    expect(twoHopNeighbors(GWANGMYEONG)).not.toContain(YANGPYEONG)
    expect(regionDistance(GWANGMYEONG, YANGPYEONG)).toBe(3)
  })

  it('서울 구로구는 양평군보다 가깝다 — 행정 경계가 아니라 인접 관계로 넓힌다', () => {
    expect(regionDistance(GWANGMYEONG, GURO)).toBeLessThan(
      regionDistance(GWANGMYEONG, YANGPYEONG),
    )
  })
})

describe('2-hop 확장', () => {
  it('자기 자신과 1-hop 을 제외한다', () => {
    const two = twoHopNeighbors(GWANGMYEONG)
    expect(two).not.toContain(GWANGMYEONG)
    for (const n of neighbors(GWANGMYEONG)) expect(two).not.toContain(n)
  })

  it('2-hop 은 1-hop 의 인접에서만 나온다', () => {
    const firstRing = neighbors(GWANGMYEONG)
    for (const code of twoHopNeighbors(GWANGMYEONG)) {
      expect(firstRing.some((n) => neighbors(n).includes(code))).toBe(true)
    }
  })
})

describe('expandRegion — 빈 화면을 만들지 않는다 (E-07)', () => {
  it('같은 시군구에 결과가 있으면 same 에서 멈춘다', () => {
    const r = expandRegion(GWANGMYEONG, (codes) => codes.includes(GWANGMYEONG))
    expect(r.stage).toBe('same')
    expect(r.codes).toEqual([GWANGMYEONG])
  })

  it('같은 시군구가 0건이면 인접으로 넓힌다', () => {
    const r = expandRegion(GWANGMYEONG, (codes) => codes.includes(GURO))
    expect(r.stage).toBe('adjacent')
    expect(r.codes).toContain(GURO)
  })

  it('인접도 0건이면 2-hop 으로 넓힌다', () => {
    const target = twoHopNeighbors(GWANGMYEONG)[0]!
    const r = expandRegion(GWANGMYEONG, (codes) => codes.includes(target))
    expect(r.stage).toBe('two_hop')
  })

  it('세 단계 모두 0건이면 none — 이 도달 자체가 미충족 수요 데이터다', () => {
    const r = expandRegion(GWANGMYEONG, () => false)
    expect(r.stage).toBe('none')
    expect(r.codes).toEqual([])
  })

  it('모르는 지역코드는 none 으로 떨어지고 던지지 않는다', () => {
    expect(expandRegion('99999', () => true).stage).toBe('none')
  })

  it('확장 단계가 사람이 읽을 문장으로 나온다', () => {
    const msg = expansionMessage(
      GWANGMYEONG,
      expandRegion(GWANGMYEONG, (codes) => codes.includes(GURO)),
    )
    expect(msg).toContain('광명시')
    expect(msg).toContain('구로구')
  })
})
