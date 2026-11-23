// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * 윤곽 제안(DSL) 저작 — **LLM 이 0~1 좌표로 모양을 제안하는 경로** (ADR-036).
 *
 * 여기서 고정하는 것:
 * - 범위·개수를 벗어난 제안은 **통째로 버리고** 목록 선택으로 떨어진다
 * - 체험 세션에서는 윤곽 제안을 **아예 하지 않는다** (ADR-036 — 익명 공개 경로의 예산)
 * - 제안이 통과해도 mm 는 LLM 이 정하지 않는다 — 좌표는 비율이고 치수는 코드가 곱한다
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
const { recipeCandidates } = await import('@/lib/studio/pen3d/recipes')
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
    topic: '코끼리',
    session_id: null,
    form: 'flat' as const,
    ...over,
  }) as Parameters<typeof authorContent>[0]

const candidates = recipeCandidates('코끼리', 'middle').map((r) => ({
  id: r.id,
  title: r.title,
  summary: r.summary,
  nominal_difficulty: r.nominal_difficulty,
}))

const ring = (divisions: number, radius: number) =>
  Array.from({ length: divisions }, (_, i) => {
    const t = (2 * Math.PI * i) / divisions
    return {
      x: Number((0.5 + radius * Math.cos(t)).toFixed(3)),
      y: Number((0.5 + radius * Math.sin(t)).toFixed(3)),
    }
  })

const outline = (over: Record<string, unknown> = {}) => ({
  mode: 'outline',
  outline: {
    title: '코끼리',
    silhouette: ring(24, 0.45),
    details: [],
    holes: [],
    hanger: false,
    ...over,
  },
  recipe_id: 'name-keyring',
  title: '코끼리 만들기',
  reason: '주제 그대로의 모양을 만듭니다.',
  tasks: ['윤곽선을 따라 천천히 그립니다.', '식은 뒤에 떼어냅니다.'],
})

const reply = (body: unknown) => ({
  stop_reason: 'end_turn',
  content: [{ type: 'text', text: JSON.stringify(body) }],
})

beforeEach(() => {
  createMock.mockReset()
  // 스튜디오 LLM 스위치를 켠 상태를 고정한다 (ADR-046 — 기본값은 off 다)
  process.env = { ...ORIGINAL, ANTHROPIC_API_KEY: 'sk-test', AI_DEMO: 'off', STUDIO_LLM: 'on' }
})
afterEach(() => {
  process.env = { ...ORIGINAL }
  createMock.mockReset()
})

const author = (over: Record<string, unknown> = {}) =>
  authorContent(spec(), candidates, null, {
    outline: { allow: true, word: '코끼리' },
    ...over,
  })

describe('윤곽 제안', () => {
  it('제안이 범위 안이면 모양으로 받는다', async () => {
    createMock.mockResolvedValue(reply(outline()))
    const authoring = await author()
    expect(authoring.shape).not.toBeNull()
    expect(authoring.shape!.source).toBe('dsl')
    expect(authoring.shape!.reviewed).toBe(false)
    expect(authoring.source).toBe('llm')
    // 모양을 썼으면 레시피를 고른 것이 아니다
    expect(authoring.recipe_id).toBe('')
  })

  it('받은 모양으로 만든 도안은 검증을 통과한다 — 치수는 코드가 정한다', async () => {
    createMock.mockResolvedValue(reply(outline()))
    const authoring = await author()
    const result = generatePen(spec(), { shape: authoring.shape })
    expect(result.status).toBe('validated')
    expect(result.artifact.metrics.part_count).toBe(1)
  })

  it('좌표가 범위를 벗어나면 통째로 버리고 목록 선택으로 떨어진다', async () => {
    createMock.mockResolvedValue(reply(outline({ silhouette: ring(24, 0.8) })))
    const authoring = await author()
    expect(authoring.shape ?? null).toBeNull()
    expect(candidates.map((c) => c.id)).toContain(authoring.recipe_id)
  })

  it('점이 모자라면 버린다', async () => {
    createMock.mockResolvedValue(reply(outline({ silhouette: ring(5, 0.4) })))
    expect((await author()).shape ?? null).toBeNull()
  })

  it('스스로 교차하는 윤곽은 버린다 — 꼬인 선은 떼어낼 때 찢어진다', async () => {
    const bow = [
      { x: 0.05, y: 0.05 },
      { x: 0.95, y: 0.95 },
      { x: 0.95, y: 0.05 },
      { x: 0.05, y: 0.95 },
      { x: 0.2, y: 0.5 },
      { x: 0.3, y: 0.2 },
      { x: 0.7, y: 0.2 },
      { x: 0.8, y: 0.5 },
    ]
    createMock.mockResolvedValue(reply(outline({ silhouette: bow })))
    expect((await author()).shape ?? null).toBeNull()
  })

  it('제안을 허용하지 않으면 mode 가 outline 이어도 무시한다 (체험 세션)', async () => {
    createMock.mockResolvedValue(reply(outline()))
    const authoring = await authorContent(spec(), candidates, null, {
      outline: { allow: false, word: '코끼리' },
    })
    expect(authoring.shape ?? null).toBeNull()
  })

  it('체험 키로는 윤곽을 제안하지 않는다 — 익명 경로의 예산이다 (ADR-036)', async () => {
    process.env = {
      ...ORIGINAL,
      AI_DEMO: 'off',
      TOUR_ANTHROPIC_API_KEY: 'sk-tour',
      TOUR_LLM: 'on',
    }
    delete process.env.ANTHROPIC_API_KEY
    createMock.mockResolvedValue(reply(outline()))
    const authoring = await authorContent(spec(), candidates, null, {
      outline: { allow: true, word: '코끼리' },
      tourStudio: true,
    })
    expect(authoring.shape ?? null).toBeNull()
  })

  it('후보 목록이 비어 있어도 제안은 시도한다 — 2D 는 이 경로뿐이다', async () => {
    createMock.mockResolvedValue(reply(outline()))
    const authoring = await authorContent(spec(), [], null, {
      outline: { allow: true, word: '코끼리' },
    })
    expect(authoring.shape).not.toBeNull()
    expect(createMock).toHaveBeenCalled()
  })

  it('프롬프트에 mm·치수를 쓰지 말라는 지시가 들어간다', async () => {
    createMock.mockResolvedValue(reply(outline()))
    await author()
    const [body] = createMock.mock.calls[0] as [Record<string, string>]
    expect(body.system).toContain('0~1')
    expect(body.system).toContain('mm')
  })
})
