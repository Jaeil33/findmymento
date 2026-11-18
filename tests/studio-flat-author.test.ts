// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * 2D 요청의 저작 — **조합 지시문을 함께 보내면 2D 가 만들어지지 않는다.**
 *
 * 실제로 운영에서 터진 일이다: "물고기"·"피카츄"를 2D 로 넣으면 실패 화면이 나왔다.
 * 2D 에도 조각 조합(ADR-034) 지시문을 같이 보냈고, 그 지시문의 예시가 하필 "물고기"라서
 * 모델이 \`mode: "compose"\` 로 답했다. 조합은 접합이 있는 입체이므로 2D 경로가 쓸 수 없고,
 * 결과는 \`PEN_SHAPE_UNAVAILABLE\` 이었다.
 *
 * 그래서 고정한다: **2D 에는 조합을 제안할 길을 아예 주지 않는다.** 고를 목록이 비어 있으면
 * 프롬프트는 윤곽 제안 하나만 남는다 — 모델에게 "목록에서 고르라"와 "목록이 비었다"를
 * 동시에 주지 않는다.
 */

const createMock = vi.hoisted(() => vi.fn())
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: (...a: unknown[]) => createMock(...a) }
    beta = { messages: { create: (...a: unknown[]) => createMock(...a) } }
  },
}))
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => undefined, getAll: () => [] }),
}))

const { authorContent } = await import('@/lib/studio/author')
const { PEN_PIECES } = await import('@/lib/studio/pen3d/pieces')
const { recipeMatches } = await import('@/lib/studio/pen3d/recipes')
const { generatePen } = await import('@/lib/studio/pen3d/pipeline')

const ORIGINAL = { ...process.env }

const spec = (over: Record<string, unknown> = {}) =>
  ({
    kind: 'pen3d' as const,
    grade_band: 'middle' as const,
    student_count: 20,
    duration_minutes: 90,
    venue: '교실' as const,
    equipment: ['3D펜 20자루', 'PLA 필라멘트'],
    topic: '물고기',
    session_id: null,
    form: 'flat' as const,
    ...over,
  }) as Parameters<typeof authorContent>[0]

const pieces = PEN_PIECES.map((p) => ({
  id: p.id,
  name: p.name,
  summary: p.summary,
  can_be_base: p.can_be_base,
}))

const ring = (divisions: number, radius: number, cx = 0.5, cy = 0.5) =>
  Array.from({ length: divisions }, (_, i) => {
    const t = (2 * Math.PI * i) / divisions
    return {
      x: Number((cx + radius * Math.cos(t)).toFixed(3)),
      y: Number((cy + radius * Math.sin(t)).toFixed(3)),
    }
  })

const outlineReply = (over: Record<string, unknown> = {}) => ({
  mode: 'outline',
  outline: { title: '물고기', silhouette: ring(24, 0.45), details: [], holes: [], hanger: false, ...over },
  recipe_id: '',
  title: '물고기 만들기',
  reason: '적은 단어대로 윤곽을 만듭니다.',
  tasks: ['윤곽선을 따라 그립니다.', '식은 뒤에 떼어냅니다.'],
})

const reply = (payload: unknown) => ({
  stop_reason: 'end_turn',
  content: [{ type: 'text', text: JSON.stringify(payload) }],
})

beforeEach(() => {
  createMock.mockReset()
  process.env = { ...ORIGINAL, ANTHROPIC_API_KEY: 'sk-test', AI_DEMO: 'off' }
})
afterEach(() => {
  process.env = { ...ORIGINAL }
  createMock.mockReset()
})

const systemOf = () => (createMock.mock.calls[0]![0] as { system: string }).system

describe('2D 프롬프트', () => {
  it('조합을 제안할 길을 주지 않는다', async () => {
    createMock.mockResolvedValue(reply(outlineReply()))
    await authorContent(spec(), [], null, { outline: { allow: true, word: '물고기' } })

    expect(systemOf()).toContain('"outline"')
    expect(systemOf()).not.toContain('"compose"')
    expect(systemOf()).not.toContain('조각 목록')
  })

  it('고를 목록이 비어 있으면 "목록에서 고르라"고 하지 않는다', async () => {
    createMock.mockResolvedValue(reply(outlineReply()))
    await authorContent(spec(), [], null, { outline: { allow: true, word: '물고기' } })

    expect(systemOf()).not.toContain('검수된 레시피 목록에서 하나를 고르고')
    expect(systemOf()).toContain('윤곽')
  })

  it('목록이 있으면 고르는 길도 열어 둔다 (아틀라스 적중)', async () => {
    createMock.mockResolvedValue(reply(outlineReply()))
    await authorContent(
      spec(),
      [{ id: 'atlas-물고기', title: '물고기', summary: '물고기 실루엣', nominal_difficulty: 2 }],
      null,
      { outline: { allow: true, word: '물고기' } },
    )

    expect(systemOf()).toContain('recipe_id')
    expect(systemOf()).toContain('"outline"')
    expect(systemOf()).not.toContain('"compose"')
  })

  it('3D 에는 조합이 그대로 열려 있다 (ADR-034 는 유지)', async () => {
    createMock.mockResolvedValue(reply(outlineReply()))
    await authorContent(
      spec({ form: 'solid' }),
      recipeMatches('연필 상자', 'middle').map((r) => ({
        id: r.id,
        title: r.title,
        summary: r.summary,
        nominal_difficulty: r.nominal_difficulty,
      })),
      null,
      { outline: { allow: true, word: '연필 상자' }, pieces },
    )

    expect(systemOf()).toContain('"compose"')
    expect(systemOf()).toContain('"outline"')
  })

  it('받은 윤곽으로 2D 도안이 실제로 만들어진다', async () => {
    createMock.mockResolvedValue(reply(outlineReply()))
    const authoring = await authorContent(spec(), [], null, {
      outline: { allow: true, word: '물고기' },
    })
    const result = generatePen(spec(), { shape: authoring.shape })

    expect(authoring.shape).not.toBeNull()
    expect(result.status).toBe('validated')
    expect(result.report.findings.filter((f) => f.severity === 'error')).toEqual([])
  })
})

describe('조금 어긋난 제안은 끌어당긴다 — 통째로 버리지 않는다', () => {
  const author = () =>
    authorContent(spec(), [], null, { outline: { allow: true, word: '물고기' } })

  it('좌표가 살짝 범위를 넘으면 당겨 쓴다 (0~1 로 맞춘다)', async () => {
    createMock.mockResolvedValue(reply(outlineReply({ silhouette: ring(24, 0.55) })))
    const authoring = await author()
    expect(authoring.shape).not.toBeNull()
    const points = authoring.shape!.silhouette.points
    expect(points.every((p) => p.x >= 0 && p.y >= 0)).toBe(true)
  })

  it('많이 벗어난 제안은 여전히 버린다 — 지시를 무시한 응답이다', async () => {
    createMock.mockResolvedValue(reply(outlineReply({ silhouette: ring(24, 2.5) })))
    expect((await author()).shape ?? null).toBeNull()
  })

  it('점이 많으면 솎아서 받는다', async () => {
    createMock.mockResolvedValue(reply(outlineReply({ silhouette: ring(120, 0.45) })))
    const authoring = await author()
    expect(authoring.shape).not.toBeNull()
    expect(authoring.shape!.silhouette.points.length).toBeLessThanOrEqual(64)
  })

  it('터무니없이 많으면 버린다', async () => {
    createMock.mockResolvedValue(reply(outlineReply({ silhouette: ring(400, 0.45) })))
    expect((await author()).shape ?? null).toBeNull()
  })
})

describe('거절 이유를 되먹여 한 번 더 (ADR-036)', () => {
  const crossing = [
    { x: 0.05, y: 0.05 },
    { x: 0.95, y: 0.95 },
    { x: 0.95, y: 0.05 },
    { x: 0.05, y: 0.95 },
    { x: 0.2, y: 0.5 },
    { x: 0.3, y: 0.2 },
    { x: 0.7, y: 0.2 },
    { x: 0.8, y: 0.5 },
  ]

  it('스스로 교차한 첫 응답은 이유를 알려 주고 다시 그려 받는다', async () => {
    let call = 0
    createMock.mockImplementation(() => {
      call += 1
      return Promise.resolve(
        reply(call === 1 ? outlineReply({ silhouette: crossing }) : outlineReply()),
      )
    })

    const authoring = await authorContent(spec(), [], null, {
      outline: { allow: true, word: '물고기' },
    })

    expect(call).toBe(2)
    expect(authoring.shape).not.toBeNull()
    // 두 번째 요청에 왜 버렸는지가 들어간다
    const second = JSON.parse(
      (createMock.mock.calls[1]![0] as { messages: { content: string }[] }).messages[0]!.content,
    ) as Record<string, string>
    expect(second['지난_시도에서_걸린_것']).toContain('교차')
  })

  it('두 번 다 실패하면 규칙으로 떨어진다 — 화면은 에러를 보지 않는다', async () => {
    createMock.mockResolvedValue(reply(outlineReply({ silhouette: crossing })))
    const authoring = await authorContent(spec(), [], null, {
      outline: { allow: true, word: '물고기' },
    })
    expect(createMock).toHaveBeenCalledTimes(2)
    expect(authoring.shape ?? null).toBeNull()
    expect(authoring.source).toBe('rule')
  })

  it('타임아웃·한도는 다시 걸지 않는다 — 기다림만 두 배가 된다', async () => {
    createMock.mockRejectedValue(new Error('Request timed out.'))
    await authorContent(spec(), [], null, { outline: { allow: true, word: '물고기' } })
    expect(createMock).toHaveBeenCalledTimes(1)
  })

  it('목록에서 고르는 요청(3D)은 재시도하지 않는다', async () => {
    createMock.mockResolvedValue(reply({ recipe_id: '없는것', title: '', reason: '', tasks: [] }))
    await authorContent(spec({ form: 'solid' }), [
      { id: 'hex-box', title: '육각 보관함', summary: '상자', nominal_difficulty: 2 },
    ], null, {})
    expect(createMock).toHaveBeenCalledTimes(1)
  })
})
