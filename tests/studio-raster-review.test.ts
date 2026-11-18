// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * 래스터 + 이미지 2차 검토 (ADR-038).
 *
 * 여기서 고정하는 것:
 * - 그림은 **결정론적**이다. 같은 도안이면 바이트까지 같다 (강사에게 같은 판정을 다시 줄 수 있다)
 * - 검토 실패는 **부정 판정이 아니다.** 못 한 것(`skipped`)과 안 닮은 것(`unrecognized`)은 다르다
 * - 모델에게 가는 것은 이미지와 단어뿐이고, 받는 것은 판정과 한 줄뿐이다 (좌표가 없다)
 */

const createMock = vi.hoisted(() => vi.fn())
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: (...a: unknown[]) => createMock(...a) }
    beta = { messages: { create: (...a: unknown[]) => createMock(...a) } }
  },
}))

const { encodePng, inkRatio, rasterize, rasterPngBase64, RASTER_PX } = await import(
  '@/lib/studio/pen3d/raster'
)
const { reviewShape } = await import('@/lib/studio/pen3d/review')

const square = (side: number) => ({
  kind: 'outline' as const,
  closed: true,
  points: [
    { x: 0, y: 0 },
    { x: side, y: 0 },
    { x: side, y: side },
    { x: 0, y: side },
  ],
})

const text = (body: unknown) => ({
  stop_reason: 'end_turn',
  content: [{ type: 'text', text: typeof body === 'string' ? body : JSON.stringify(body) }],
})

describe('래스터', () => {
  it('PNG 머리글과 크기가 맞다', () => {
    const png = encodePng(rasterize([square(60)]))
    expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    expect(png.subarray(12, 16).toString('ascii')).toBe('IHDR')
    expect(png.readUInt32BE(16)).toBe(RASTER_PX)
    expect(png.readUInt32BE(20)).toBe(RASTER_PX)
    // 회색조 8비트
    expect(png[24]).toBe(8)
    expect(png[25]).toBe(0)
  })

  it('같은 도안이면 바이트까지 같고, 다른 도안이면 다르다', () => {
    expect(rasterPngBase64([square(60)])).toBe(rasterPngBase64([square(60)]))
    const circle = {
      kind: 'outline' as const,
      closed: true,
      points: Array.from({ length: 40 }, (_, i) => {
        const t = (2 * Math.PI * i) / 40
        return { x: 30 + 30 * Math.cos(t), y: 30 + 30 * Math.sin(t) }
      }),
    }
    expect(rasterPngBase64([circle])).not.toBe(rasterPngBase64([square(60)]))
  })

  it('윤곽만 그리고 채우지 않는다 — 인쇄되는 것과 같아야 한다', () => {
    const bitmap = rasterize([square(60)])
    const ratio = inkRatio(bitmap)
    // 테두리만 칠하면 전체의 몇 %다. 채우면 70% 를 넘는다
    expect(ratio).toBeGreaterThan(0)
    expect(ratio).toBeLessThan(0.25)
  })

  it('작은 도안은 선이 더 굵게 보인다 — 비드 폭 1.6mm 는 치수에 비례하지 않는다', () => {
    // 종이에서도 그렇다. 40mm 조각에 깔리는 1.6mm 선은 120mm 조각에서보다 상대적으로 굵다.
    expect(inkRatio(rasterize([square(40)]))).toBeGreaterThan(inkRatio(rasterize([square(120)])))
  })

  it('빈 도안도 흰 그림을 돌려준다 (터지지 않는다)', () => {
    const bitmap = rasterize([])
    expect(inkRatio(bitmap)).toBe(0)
    expect(encodePng(bitmap).length).toBeGreaterThan(8)
  })
})

describe('검토', () => {
  beforeEach(() => createMock.mockReset())
  afterEach(() => createMock.mockReset())

  const run = (over: Record<string, unknown> = {}) =>
    reviewShape({ word: '코끼리', strokes: [square(60)], apiKey: 'sk-test', ...over })

  it('키가 없으면 부르지 않고 skipped', async () => {
    const review = await run({ apiKey: null })
    expect(review.verdict).toBe('skipped')
    expect(createMock).not.toHaveBeenCalled()
  })

  it('닮았다고 하면 looks_like', async () => {
    createMock.mockResolvedValue(text({ looks_like: true, missing: '' }))
    expect((await run()).verdict).toBe('looks_like')
  })

  it('안 닮았다고 하면 unrecognized 이고 빠진 것을 그대로 전한다', async () => {
    createMock.mockResolvedValue(text({ looks_like: false, missing: '코가 없습니다' }))
    const review = await run()
    expect(review.verdict).toBe('unrecognized')
    expect(review.missing).toBe('코가 없습니다')
  })

  it('이미지와 단어만 보낸다 — 좌표를 보내지 않는다', async () => {
    createMock.mockResolvedValue(text({ looks_like: true }))
    await run()
    const [body] = createMock.mock.calls[0] as [Record<string, any>]
    const content = body.messages[0].content as Array<Record<string, any>>
    expect(content[0]!.type).toBe('image')
    expect(content[0]!.source.media_type).toBe('image/png')
    expect(content[0]!.source.data.length).toBeGreaterThan(100)
    expect(JSON.stringify(content[1])).toContain('코끼리')
    expect(JSON.stringify(content[1])).not.toContain('points')
  })

  it('거절·깨진 JSON·호출 실패는 모두 skipped — 못 한 것을 안 닮았다고 적지 않는다', async () => {
    createMock.mockResolvedValue({ stop_reason: 'refusal', content: [] })
    expect((await run()).verdict).toBe('skipped')

    createMock.mockResolvedValue(text('판정하기 어렵습니다'))
    expect((await run()).verdict).toBe('skipped')

    createMock.mockResolvedValue(text({ looks_like: 'maybe' }))
    expect((await run()).verdict).toBe('skipped')

    createMock.mockRejectedValue(new Error('timeout'))
    expect((await run()).verdict).toBe('skipped')
  })

  it('런타임에서는 재시도하지 않는다 — 예산이 30초다', async () => {
    createMock.mockResolvedValue(text({ looks_like: true }))
    await run()
    const [, options] = createMock.mock.calls[0] as [unknown, Record<string, number>]
    expect(options.maxRetries).toBe(0)
    expect(options.timeout).toBeLessThanOrEqual(8_000)
  })
})
