/**
 * 벡터 아트 SVG → 색 영역 (ADR-041).
 *
 * 이 파일이 고정하는 계약:
 *   ① path 명령을 전부 읽는다 (상대·생략·곡선·호). 하나라도 틀리면 그 영역이 망가진다
 *   ② **구멍을 알아본다** — 바퀴의 안쪽. 못 알아보면 자전거가 꽉 찬 원 두 개가 된다
 *   ③ 색은 **팔레트로 스냅된다** — 원본 hex 가 새어 나오지 않는다
 *   ④ 겹침 순서는 **문서 순서**다 (작가의 의도)
 *   ⑤ 읽을 수 없는 입력은 조용히 건너뛴다 (오프라인 배치가 한 파일로 멈추지 않는다)
 */

import { describe, expect, it } from 'vitest'
import { importSvgArt, readPaths } from '@/lib/studio/svg-art'
import { flattenPath, parsePath, signedArea } from '@/lib/studio/svg-path'
import { nearestPaletteName, PALETTE } from '@/lib/studio/palette'

const wrap = (body: string, viewBox = '0 0 36 36') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${body}</svg>`

describe('parsePath — 숫자 표기가 험하다', () => {
  it('붙여 쓴 소수를 둘로 읽는다 ("1.5.5" → 1.5, 0.5)', () => {
    const [cmd] = parsePath('M1.5.5')
    expect(cmd!.args).toEqual([1.5, 0.5])
  })

  it('음수 부호가 구분자 역할을 한다 ("M3-4")', () => {
    const [cmd] = parsePath('M3-4')
    expect(cmd!.args).toEqual([3, -4])
  })

  it('지수 표기를 하나로 읽는다', () => {
    const [cmd] = parsePath('M1e2 5')
    expect(cmd!.args).toEqual([100, 5])
  })

  it('명령을 생략하고 좌표만 이어 쓰면 앞 명령이 반복된다 (M 뒤는 L)', () => {
    const cmds = parsePath('M0 0 10 0 10 10')
    expect(cmds.map((c) => c.code)).toEqual(['M', 'L', 'L'])
  })
})

describe('flattenPath — 서브패스를 합치지 않는다', () => {
  it('M 이 두 번이면 폴리곤이 둘이다 — 합치면 바퀴가 꽉 찬 원이 된다', () => {
    const subs = flattenPath('M0 0H10V10H0Z M3 3H7V7H3Z')
    expect(subs).toHaveLength(2)
  })

  it('곡선을 직선으로 편다 — 점이 늘어난다', () => {
    const subs = flattenPath('M0 0C5 0 10 5 10 10C10 15 5 20 0 20Z')
    expect(subs).toHaveLength(1)
    expect(subs[0]!.points.length).toBeGreaterThan(10)
  })

  it('상대 좌표 명령을 누적한다', () => {
    const subs = flattenPath('M0 0 l10 0 l0 10 z')
    const points = subs[0]!.points
    expect(points[1]).toEqual({ x: 10, y: 0 })
    expect(points[2]).toEqual({ x: 10, y: 10 })
  })

  it('호(A)를 편다 — 반원이 직선 하나로 뭉개지지 않는다', () => {
    const subs = flattenPath('M0 10 A10 10 0 0 1 20 10 Z')
    expect(subs[0]!.points.length).toBeGreaterThan(5)
    // 반원의 꼭대기가 지나간다
    expect(Math.min(...subs[0]!.points.map((p) => p.y))).toBeLessThan(5)
  })

  it('점이 3개 미만인 서브패스는 버린다 — 면이 아니다', () => {
    expect(flattenPath('M0 0 L5 5')).toHaveLength(0)
  })

  it('감는 방향을 부호로 알 수 있다', () => {
    expect(signedArea([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }])).toBeGreaterThan(0)
    expect(signedArea([{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 10, y: 0 }])).toBeLessThan(0)
  })
})

describe('readPaths — fill 과 d 만 읽는다', () => {
  it('fill 이 없으면 검정이다 (SVG 기본값)', () => {
    expect(readPaths('<path d="M0 0H1V1Z"/>')[0]!.fill).toBe('#000000')
  })

  it('fill="none" 인 path 는 면이 아니다', () => {
    expect(readPaths('<path fill="none" d="M0 0H1V1Z"/>')).toHaveLength(0)
  })

  it('d 가 없는 path 는 건너뛴다', () => {
    expect(readPaths('<path fill="#fff"/>')).toHaveLength(0)
  })
})

describe('importSvgArt — 구멍과 색', () => {
  it('바깥 고리 안의 고리는 **구멍**이다 (바퀴의 안쪽)', () => {
    const svg = wrap('<path fill="#292F33" d="M2 18A16 16 0 1 1 34 18A16 16 0 1 1 2 18Z M8 18A10 10 0 1 1 28 18A10 10 0 1 1 8 18Z"/>')
    const art = importSvgArt(svg)
    expect(art).not.toBeNull()
    expect(art!.regions).toHaveLength(1)
    expect(art!.regions[0]!.holes).toHaveLength(1)
  })

  it('떨어져 있는 같은 색 고리 둘은 **영역 둘**이다 (바퀴 두 개)', () => {
    const svg = wrap(
      '<path fill="#292F33" d="M0 0H10V10H0Z M20 0H30V10H20Z"/>',
    )
    const art = importSvgArt(svg)
    expect(art!.regions).toHaveLength(2)
    expect(art!.regions[0]!.holes).toHaveLength(0)
  })

  it('원본 hex 가 아니라 **팔레트 색**이 들어간다', () => {
    const art = importSvgArt(wrap('<path fill="#EA596E" d="M0 0H36V36H0Z"/>'))
    const color = art!.regions[0]!.color
    expect(Object.keys(PALETTE)).toContain(color)
    expect(color).toBe(nearestPaletteName('#EA596E'))
  })

  it('겹침 순서는 문서 순서다 — 작가가 나중에 그린 것이 위다', () => {
    const art = importSvgArt(
      wrap('<path fill="#ff0000" d="M0 0H36V36H0Z"/><path fill="#0000ff" d="M10 10H20V20H10Z"/>'),
    )
    expect(art!.regions[0]!.z).toBeLessThan(art!.regions[1]!.z)
    expect(art!.regions[0]!.color).toBe(nearestPaletteName('#ff0000'))
  })

  it('티끌(눈동자 반사광 같은 것)은 빠진다 — 영역 상한을 그런 것에 쓰지 않는다', () => {
    const art = importSvgArt(
      wrap('<path fill="#000" d="M0 0H36V36H0Z"/><path fill="#fff" d="M1 1H1.2V1.2H1Z"/>'),
    )
    expect(art!.regions).toHaveLength(1)
  })

  it('viewBox 가 없으면 읽지 않는다 — 자가 없으면 정규화할 수 없다', () => {
    expect(importSvgArt('<svg><path fill="#000" d="M0 0H1V1Z"/></svg>')).toBeNull()
  })

  it('면이 하나도 없으면 null — 호출자가 그 파일을 건너뛴다', () => {
    expect(importSvgArt(wrap('<path fill="none" d="M0 0H1V1Z"/>'))).toBeNull()
    expect(importSvgArt(wrap(''))).toBeNull()
  })

  it('좌표는 **원본 viewBox 공간 그대로**다 — 자를 두 개 만들지 않는다', () => {
    const art = importSvgArt(wrap('<path fill="#000" d="M0 0H36V36H0Z"/>'))
    expect(art!.width).toBe(36)
    const xs = art!.regions[0]!.outline.points.map((p) => p.x)
    expect(Math.max(...xs)).toBeCloseTo(36, 3)
  })
})

describe('nearestPaletteName — 명도에 가중을 준다', () => {
  it('정확히 일치하는 색은 그 이름이다', () => {
    expect(nearestPaletteName(PALETTE.주황)).toBe('주황')
    expect(nearestPaletteName(PALETTE.남색)).toBe('남색')
  })

  it('#rgb 짧은 표기도 읽는다', () => {
    expect(nearestPaletteName('#f00')).toBe(nearestPaletteName('#ff0000'))
  })

  it('진한 남색이 검정으로 뭉치지 않는다 — 가중 없이 재면 그렇게 된다', () => {
    expect(nearestPaletteName('#2a3f7a')).not.toBe('검정')
  })

  it('읽을 수 없는 표기는 기본색이다', () => {
    expect(nearestPaletteName('rgb(1,2,3)')).toBe('회색')
    expect(nearestPaletteName('')).toBe('회색')
  })
})
