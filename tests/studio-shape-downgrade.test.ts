// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import type { PenGenerateOptions } from '@/lib/studio/pen3d/pipeline'
import type { NormPoint, PenShape, StudioSpec } from '@/types/studio'

/**
 * **검수되지 않은 제안이 검증에 걸리면 검수된 모양으로 내려간다** (ADR-046).
 *
 * 왜 이 테스트가 필요한가: ADR-046 은 제안(DSL)을 검수된 아틀라스보다 **먼저** 쓴다. 그
 * 결정이 안전한 근거가 이 분기다 — 제안이 물리 검증에 떨어지면 같은 단어의 검수된 모양으로
 * 내려가므로, 스위치를 켠 것만으로 `failed` 가 나가는 요청이 생기지 않는다.
 *
 * 실제 입력으로는 이 분기에 닿기 어렵다. 제안은 `shape.ts` 의 보정(범위 당기기·점 솎기·
 * 닫힘 보정·내부선 솎기)과 `generatePen` 의 치수 탐색·개선 라운드를 지나므로 거의 전부
 * 통과한다 — 그래서 **생성기를 감싸서** 떨어지는 경우를 만든다. 감싸는 것은 판정 결과뿐이고
 * 임계값은 건드리지 않는다.
 */

const calls = vi.hoisted(() => ({ shapes: [] as (string | null)[] }))

vi.mock('@/lib/studio/pen3d/pipeline', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/lib/studio/pen3d/pipeline')>()
  return {
    ...mod,
    generatePen: (spec: StudioSpec, options: PenGenerateOptions = {}) => {
      calls.shapes.push(options.shape?.source ?? null)
      const result = mod.generatePen(spec, options)
      // 제안(검수 전)으로 만든 것만 떨어뜨린다. 검수된 모양은 그대로 통과한다.
      if (options.shape?.source !== 'dsl') return result
      return {
        ...result,
        status: 'failed' as const,
        report: {
          ...result.report,
          ok: false,
          findings: [
            ...result.report.findings,
            { code: 'PEN_GAP_TOO_SMALL', severity: 'error' as const, message: '시험용 강제 실패' },
          ],
        },
      }
    },
  }
})

const { penHarness } = await import('@/lib/studio/harness/pipeline')
const { retrieveDesign } = await import('@/lib/studio/harness/retrieve')

const outline = (points: NormPoint[]) => ({ points, closed: true as const })
const ring = (n: number, r: number) =>
  Array.from({ length: n }, (_, i) => {
    const t = (2 * Math.PI * i) / n
    return {
      x: Number((0.5 + r * Math.cos(t)).toFixed(4)),
      y: Number((0.5 + r * Math.sin(t)).toFixed(4)),
    }
  }) as NormPoint[]

const proposed: PenShape = {
  id: 'dsl-test',
  word: '자전거',
  title: '자전거',
  words: [],
  silhouette: outline(ring(40, 0.48)),
  details: [],
  holes: [],
  art: [],
  hanger: false,
  aspect: 1,
  source: 'dsl',
  reviewed: false,
}

const spec = {
  kind: 'pen3d',
  grade_band: 'middle',
  student_count: 20,
  duration_minutes: 90,
  venue: '교실',
  equipment: ['3D펜 20자루', 'PLA 필라멘트'],
  topic: '자전거',
  session_id: null,
  form: 'flat',
} as StudioSpec

describe('제안이 검증에 걸리면 — 검수된 모양으로 내려간다 (ADR-046)', () => {
  it('같은 단어의 검수된 모양이 있으면 그 모양으로 바꿔 만든다', () => {
    calls.shapes.length = 0
    const result = penHarness(spec, {
      proposedShape: proposed,
      retrieved: retrieveDesign('자전거'),
    })

    // 제안으로 한 번, 검수된 모양으로 한 번 — 생성기는 두 번 돈다 (LLM 호출은 0회다)
    expect(calls.shapes).toEqual(['dsl', 'atlas'])

    expect(result.status).toBe('validated')
    expect(result.shape_source).toBe('pack')
    expect(result.report.ok).toBe(true)
  })

  it('내려갔다는 사실을 warn 으로 남긴다 — 강사가 제안을 받은 줄 알면 안 된다', () => {
    calls.shapes.length = 0
    const result = penHarness(spec, {
      proposedShape: proposed,
      retrieved: retrieveDesign('자전거'),
    })

    const notice = result.report.findings.find((f) => f.code === 'PEN_SHAPE_DOWNGRADED')
    expect(notice).toBeTruthy()
    expect(notice!.severity).toBe('warn')
    // 라운드에도 남는다 — 상세 화면이 라운드를 보여준다 (ADR-030)
    const last = result.rounds[result.rounds.length - 1]
    expect(last!.findings.some((f) => f.code === 'PEN_SHAPE_DOWNGRADED')).toBe(true)
  })

  it('검수되지 않았다는 표시는 남지 않는다 — 나간 모양은 검수된 것이다', () => {
    calls.shapes.length = 0
    const result = penHarness(spec, {
      proposedShape: proposed,
      retrieved: retrieveDesign('자전거'),
    })
    expect(result.evidence.some((e) => e.trust_level === 'reviewed')).toBe(true)
  })

  it('검수된 모양이 없으면 2D 는 명패로 내려간다 — 그 고지는 PEN_SHAPE_FALLBACK 이 한다', () => {
    calls.shapes.length = 0
    const result = penHarness(spec, { proposedShape: proposed, retrieved: null })

    // 2D 는 `failed` 로 끝나지 않는다 (CLAUDE.md · ADR-042)
    expect(result.status).toBe('validated')
    expect(result.shape_source).toBe('fallback')
    expect(result.report.findings.some((f) => f.code === 'PEN_SHAPE_FALLBACK')).toBe(true)
    // 나간 것이 검수된 모양이 아니므로 내려감 고지는 적지 않는다 — 문장이 사실과 달라진다
    expect(result.report.findings.some((f) => f.code === 'PEN_SHAPE_DOWNGRADED')).toBe(false)
  })

  it('입체 요청은 검수된 레시피로 내려간다 — 레시피도 사람이 검수한 모양이다', () => {
    calls.shapes.length = 0
    const solid = { ...spec, form: 'solid' } as StudioSpec
    const result = penHarness(solid, { proposedShape: proposed, retrieved: null })

    expect(calls.shapes).toEqual(['dsl', null])
    expect(result.status).toBe('validated')
    expect(result.shape_source).toBe('recipe')
    expect(result.report.findings.some((f) => f.code === 'PEN_SHAPE_DOWNGRADED')).toBe(true)
  })
})
