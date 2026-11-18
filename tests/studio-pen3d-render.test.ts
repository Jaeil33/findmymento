import { describe, expect, it } from 'vitest'
import { PAGE } from '@/lib/studio/constants'
import { generatePen } from '@/lib/studio/pen3d/pipeline'
import { renderPenSvg } from '@/lib/studio/pen3d/render'
import type { StudioSpec } from '@/types/studio'

/**
 * 렌더 테스트. **축척이 이 기능의 전부다** — 1:1 이 아니면 도안이 아니라 그림이다.
 */

const spec: StudioSpec = {
  kind: 'pen3d',
  grade_band: 'middle',
  student_count: 20,
  duration_minutes: 90,
  venue: '교실',
  equipment: ['3D펜', '필라멘트'],
  topic: '정육면체 조명',
  session_id: null,
}

const result = generatePen(spec)
const svg = renderPenSvg(result.artifact, { status: 'validated' })

/** d="..." 안의 좌표만 뽑는다. stroke-width 같은 값이 섞이면 범위 검사가 무의미해진다. */
function pathCoordinates(source: string): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = []
  for (const match of source.matchAll(/ d="([^"]+)"/g)) {
    for (const pair of match[1]!.matchAll(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g)) {
      out.push({ x: Number(pair[1]), y: Number(pair[2]) })
    }
  }
  return out
}

describe('A4 1:1', () => {
  it('mm 단위 크기와 viewBox 가 A4 그대로다', () => {
    expect(svg).toContain(`width="${PAGE.width_mm}mm"`)
    expect(svg).toContain(`height="${PAGE.height_mm}mm"`)
    expect(svg).toContain(`viewBox="0 0 ${PAGE.width_mm} ${PAGE.height_mm}"`)
  })

  it('xmlns 가 있어 파일로 저장해도 열린다', () => {
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"')
  })

  it('모든 좌표가 종이 안에 있고 NaN 이 없다', () => {
    const coords = pathCoordinates(svg)
    expect(coords.length).toBeGreaterThan(10)
    for (const p of coords) {
      expect(Number.isFinite(p.x)).toBe(true)
      expect(Number.isFinite(p.y)).toBe(true)
      expect(p.x).toBeGreaterThanOrEqual(0)
      expect(p.y).toBeGreaterThanOrEqual(0)
      expect(p.x).toBeLessThanOrEqual(PAGE.width_mm)
      expect(p.y).toBeLessThanOrEqual(PAGE.height_mm)
    }
    expect(svg).not.toContain('NaN')
  })

  it('부품이 여백 안쪽에 그려진다', () => {
    for (const p of pathCoordinates(svg)) {
      // 바닥 기준선·푸터는 여백에 들어가므로 윤곽선만 확인한다.
      if (p.y > PAGE.height_mm - PAGE.margin_mm) continue
      expect(p.x).toBeGreaterThanOrEqual(PAGE.margin_mm - 0.01)
      expect(p.y).toBeGreaterThanOrEqual(PAGE.margin_mm - 0.01)
    }
  })

  it('인쇄 축척 확인용 50mm 기준선이 있다 — 프린터가 축척을 바꿔 버리는 사고를 잡는다', () => {
    expect(svg).toContain('50mm')
  })
})

describe('선 종류', () => {
  it('윤곽선은 실선이고 fill 이 없다 — 덧그릴 선이기 때문이다', () => {
    expect(svg).toContain('fill="none"')
  })

  it('닫힌 윤곽은 Z 로 닫는다', () => {
    expect(svg).toMatch(/ d="M[^"]*Z"/)
  })

  it('접는 선은 파선으로 그린다', () => {
    const folded = renderPenSvg(
      {
        ...result.artifact,
        pattern: {
          ...result.artifact.pattern,
          parts: [
            {
              id: 'p',
              name: '테스트',
              quantity: 1,
              art: [],
              origin: { x: 0, y: 0 },
              optional: false,
              strokes: [
                {
                  kind: 'fold',
                  points: [
                    { x: 0, y: 0 },
                    { x: 30, y: 0 },
                  ],
                  closed: false,
                },
              ],
            },
          ],
        },
      },
      { status: 'validated' },
    )
    expect(folded).toContain('stroke-dasharray')
  })
})

describe('표기', () => {
  it('부품 이름과 수량이 적힌다 — 같은 선 위에 몇 번 덧그려야 하는지가 도안의 정보다', () => {
    for (const part of result.artifact.pattern.parts) {
      expect(svg).toContain(part.name)
      expect(svg).toContain(`${part.quantity}장`)
    }
  })

  it('제목과 예상 시간이 푸터에 들어간다', () => {
    expect(svg).toContain(result.artifact.pattern.title)
    expect(svg).toMatch(/예상 \d+분/)
  })

  it('XML 특수문자를 이스케이프한다', () => {
    const risky = renderPenSvg(
      {
        ...result.artifact,
        pattern: { ...result.artifact.pattern, title: '<script>alert("x")</script> & 조명' },
      },
      { status: 'validated' },
    )
    expect(risky).not.toContain('<script>')
    expect(risky).toContain('&lt;script&gt;')
    expect(risky).toContain('&amp;')
  })
})

describe('검증 미통과 표시 (ADR-030)', () => {
  it('validated·approved 에는 워터마크가 없다', () => {
    expect(renderPenSvg(result.artifact, { status: 'validated' })).not.toContain('사용하지')
    expect(renderPenSvg(result.artifact, { status: 'approved' })).not.toContain('사용하지')
  })

  it('failed·draft 에는 "수업에 사용하지 마세요" 워터마크가 찍힌다', () => {
    for (const status of ['failed', 'draft'] as const) {
      const marked = renderPenSvg(result.artifact, { status })
      expect(marked).toContain('수업에 사용하지 마세요')
    }
  })
})

describe('결정론', () => {
  it('같은 산출물이면 같은 SVG 다', () => {
    expect(renderPenSvg(result.artifact, { status: 'validated' })).toBe(svg)
  })
})

describe('도안 한 장이 수업에서 그대로 읽히는가', () => {
  /**
   * 교실에서는 이 종이 한 장이 전부다. 강사가 화면을 보고 설명해 주지 않아도
   * **무엇을 몇 개 그리고, 어느 변끼리 붙이는지**가 종이에 있어야 한다.
   */
  it('부품마다 번호가 붙는다 — 조립 순서가 그 번호를 가리킨다', () => {
    for (let i = 1; i <= result.artifact.pattern.parts.length; i += 1) {
      expect(svg).toContain(`>${i}</text>`)
    }
  })

  it('부품 이름·필요 개수·치수를 같이 적는다', () => {
    const part = result.artifact.pattern.parts[0]!
    expect(svg).toContain(part.name)
    expect(svg).toContain(`${part.quantity}장`)
    expect(svg).toMatch(/\d+(\.\d+)?×\d+(\.\d+)?mm/)
  })

  it('같은 선 위에 몇 번 덧그리는지 적는다 — 한 장만 인쇄하는 이유다', () => {
    expect(svg).toContain('덧그려')
  })

  it('접합을 부품 번호로 적는다 — 어느 변끼리 붙는지가 종이에 있어야 한다', () => {
    const joint = result.artifact.pattern.joints[0]!
    expect(svg).toContain('접합')
    expect(svg).toContain(`${joint.count}곳`)
  })

  it('선 종류를 밝힌다 — 실선은 그리는 선, 파선은 접는 선이다', () => {
    expect(svg).toContain('실선')
    expect(svg).toContain('접는 선')
  })

  it('안전 문구 한 줄이 종이에 남는다', () => {
    expect(svg).toMatch(/환기|화상|노즐/)
  })

  it('설명 글자가 도안 선으로 오해되지 않게 회색으로만 쓴다', () => {
    // 그리는 선은 #111 이다. 안내 글자는 다른 색이어야 한다.
    expect(svg).toContain('#777')
  })
})

describe('한 장으로 수업이 되는가', () => {
  it('자리가 남으면 조립 순서를 종이에 싣는다 — 화면을 못 보는 교실이 있다', () => {
    expect(svg).toContain('조립 순서')
    expect(svg).toContain('1.')
  })

  it('범례가 도안 선 위에 겹치지 않는다 — 가장 아래 부품보다 아래에서 시작한다', () => {
    const bottoms = result.artifact.pattern.parts.map((p) => {
      const heights = p.strokes.flatMap((s) => s.points.map((pt) => pt.y))
      return p.origin.y + Math.max(...heights)
    })
    const lowestPart = Math.max(...bottoms) + PAGE.margin_mm
    const legendYs = [...svg.matchAll(/class="leg" x="[\d.]+" y="([\d.]+)"/g)].map((m) =>
      Number(m[1]),
    )
    expect(legendYs.length).toBeGreaterThan(0)
    for (const y of legendYs) expect(y).toBeGreaterThan(lowestPart)
  })
})
