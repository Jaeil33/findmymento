// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * 조합 저작 (ADR-034) — **LLM 이 조각을 고르고 비율을 제안하는 경로.**
 *
 * 여기서 고정하는 것:
 * - 목록 밖 조각·범위 밖 비율이면 조합을 통째로 버리고 **레시피 선택으로 떨어진다**
 * - LLM 이 없거나 실패해도 화면은 달라지지 않는다 (규칙 선택)
 * - 체험·데모 세션에서는 LLM 을 부르지 않고 시연용 조합을 쓴다 (ADR-025·033)
 * - 캐릭터·상표 이름은 일반 형태로 바꿔 나간다
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
const { parseComposition } = await import('@/lib/studio/pen3d/compose')
const { PEN_PIECES } = await import('@/lib/studio/pen3d/pieces')
const { recipeCandidates } = await import('@/lib/studio/pen3d/recipes')
const { generalizeCharacter } = await import('@/lib/studio/topic')
const { generatePen } = await import('@/lib/studio/pen3d/pipeline')

const ORIGINAL = { ...process.env }

const spec = (topic: string) =>
  ({
    kind: 'pen3d' as const,
    grade_band: 'middle' as const,
    student_count: 20,
    duration_minutes: 90,
    venue: '교실' as const,
    equipment: ['3D펜 20자루', 'PLA 필라멘트'],
    topic,
    session_id: null,
  })

const candidates = (topic: string) =>
  recipeCandidates(topic, 'middle').map((r) => ({
    id: r.id,
    title: r.title,
    summary: r.summary,
    nominal_difficulty: r.nominal_difficulty,
  }))

const pieces = () =>
  PEN_PIECES.map((p) => ({ id: p.id, name: p.name, summary: p.summary, can_be_base: p.can_be_base }))

function llmReturns(json: unknown) {
  createMock.mockResolvedValue({
    stop_reason: 'end_turn',
    content: [{ type: 'text', text: JSON.stringify(json) }],
  })
}

beforeEach(() => {
  createMock.mockReset()
  process.env.ANTHROPIC_API_KEY = 'sk-ant-test'
  delete process.env.DEMO_AI
})

afterEach(() => {
  process.env = { ...ORIGINAL }
})

describe('조합 제안을 받는다', () => {
  it('목록 안 조각으로 조합하면 그대로 쓴다', async () => {
    llmReturns({
      mode: 'compose',
      composition: {
        title: '물고기',
        base: 'oval-body',
        parts: [
          { piece: 'tail-trapezoid', ratio: 0.5, quantity: 1, attach: 'back' },
          { piece: 'fin-triangle', ratio: 0.35, quantity: 2, attach: 'top' },
        ],
      },
      title: '물고기 만들기',
      reason: '몸통에 꼬리와 지느러미를 붙여 만듭니다.',
      tasks: ['몸통을 먼저 그립니다.', '꼬리를 몸통 뒤에 붙입니다.'],
    })

    const result = await authorContent(spec('물고기 만들기'), candidates('물고기'), null, {
      pieces: pieces(),
    })
    expect(result.source).toBe('llm')
    expect(result.composition).not.toBeNull()
    expect(result.composition!.base).toBe('oval-body')
    expect(result.composition!.parts).toHaveLength(2)
  })

  it('목록 밖 조각을 제안하면 조합을 버리고 레시피로 떨어진다', async () => {
    llmReturns({
      mode: 'compose',
      composition: {
        title: '피카츄',
        base: 'pikachu-body',
        parts: [{ piece: 'lightning-tail', ratio: 0.5, quantity: 1, attach: 'back' }],
      },
      recipe_id: 'cube-lantern',
      title: '정육면체 조명',
      reason: '주제에 가까운 검수된 도안입니다.',
      tasks: ['패널을 그립니다.', '모서리를 붙입니다.'],
    })

    const result = await authorContent(spec('피카츄 만들기'), candidates('피카츄'), null, {
      pieces: pieces(),
    })
    expect(result.composition).toBeNull()
    expect(result.recipe_id).toBe('cube-lantern')
  })

  it('조각 목록을 주지 않으면 조합을 쓰지 않는다 — 드론 등 다른 종류는 그대로다', async () => {
    llmReturns({
      mode: 'compose',
      composition: {
        title: '물고기',
        base: 'oval-body',
        parts: [{ piece: 'fin-triangle', ratio: 0.4, quantity: 2, attach: 'top' }],
      },
      recipe_id: 'cube-lantern',
      title: '정육면체',
      reason: '검수된 도안입니다.',
      tasks: ['그립니다.', '붙입니다.'],
    })

    const result = await authorContent(spec('물고기'), candidates('물고기'), null)
    expect(result.composition ?? null).toBeNull()
  })

  it('LLM 이 실패해도 규칙 선택으로 떨어진다 — 화면은 에러를 보지 않는다', async () => {
    createMock.mockRejectedValue(new Error('timeout'))
    const result = await authorContent(spec('물고기'), candidates('물고기'), null, {
      pieces: pieces(),
    })
    expect(result.source).toBe('rule')
    expect(result.composition ?? null).toBeNull()
    expect(result.recipe_id).not.toBe('')
  })
})

describe('체험·데모 세션 (ADR-025·033)', () => {
  it('키가 없고 데모 AI 가 켜져 있으면 LLM 을 부르지 않고 시연용 조합을 쓴다', async () => {
    delete process.env.ANTHROPIC_API_KEY
    process.env.DEMO_AI = 'on'

    const result = await authorContent(spec('물고기 만들기'), candidates('물고기'), null, {
      pieces: pieces(),
    })
    expect(createMock).not.toHaveBeenCalled()
    expect(result.composition).not.toBeNull()
    expect(result.composition!.parts.length).toBeGreaterThan(0)
  })
})

describe('캐릭터·상표 이름', () => {
  /**
   * **치환하지 않는다** (ADR-043). 이 플랫폼은 무엇이 저작권 침해인지 판정하지 않는다.
   * 예전에는 "피카츄" 를 "둥근 귀 동물" 로 바꾸고 화면에 문구를 띄웠다.
   */
  it('캐릭터 이름을 바꾸지 않는다 — 강사가 적은 그대로 쓴다', () => {
    const out = generalizeCharacter('피카츄 만들기')
    expect(out.text).toBe('피카츄 만들기')
    expect(out.replaced).toBe(false)
    expect(out.note).toBeNull()
  })

  it('어떤 주제에도 화면 문구를 띄우지 않는다 — 책임 고지조차 판정의 흔적이다', () => {
    for (const topic of ['피카츄', '마리오 키링', '헬로키티', '물고기']) {
      expect(generalizeCharacter(topic).note).toBeNull()
      expect(generalizeCharacter(topic).replaced).toBe(false)
    }
  })

  it('일반 주제는 그대로 둔다', () => {
    const out = generalizeCharacter('물고기 만들기')
    expect(out.replaced).toBe(false)
    expect(out.text).toBe('물고기 만들기')
  })

  it('공백만 정리한다 — 그것이 남은 유일한 일이다', () => {
    expect(generalizeCharacter('  피카츄   키링  ').text).toBe('피카츄 키링')
  })
})

describe('조합은 레시피와 같은 길을 간다', () => {
  it('조합으로 만든 산출물도 검증을 거치고 라운드가 남는다', () => {
    const composition = parseComposition({
      title: '물고기',
      base: 'oval-body',
      parts: [
        { piece: 'tail-trapezoid', ratio: 0.5, quantity: 1, attach: 'back' },
        { piece: 'fin-triangle', ratio: 0.35, quantity: 2, attach: 'top' },
      ],
    })!

    const result = generatePen(spec('물고기 만들기'), { composition })
    expect(result.rounds.length).toBeGreaterThanOrEqual(1)
    expect(['validated', 'failed']).toContain(result.status)
    expect(result.recipe_id.startsWith('composed')).toBe(true)
    expect(result.artifact.pattern.parts.length).toBeGreaterThan(1)
    // 통과했다면 error 가 하나도 없어야 한다 (ADR-030).
    if (result.status === 'validated') {
      expect(result.report.findings.filter((f) => f.severity === 'error')).toHaveLength(0)
    }
  })

  it('초등 45분에서도 통과하거나, 실패 이유가 남는다', () => {
    const composition = parseComposition({
      title: '토끼',
      base: 'round-body',
      parts: [{ piece: 'ear-pointed', ratio: 0.4, quantity: 2, attach: 'top' }],
    })!
    const result = generatePen(
      { ...spec('토끼 만들기'), grade_band: 'elementary', duration_minutes: 45 },
      { composition },
    )
    if (result.status === 'failed') {
      expect(result.report.findings.some((f) => f.severity === 'error')).toBe(true)
    } else {
      expect(result.report.findings.filter((f) => f.severity === 'error')).toHaveLength(0)
    }
  })
})
