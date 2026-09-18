import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CAREERS } from '@/data/careers'
import { FIELDS, FIELD_UNSURE } from '@/types/domain'
import { maskForStorage } from '@/lib/moderation'

/**
 * 진로 방향 카드 (ADR-027). 추천할 수업이 0건일 때 학생 결과 화면을 채운다.
 *
 * 핵심 경계: **후보는 검수된 목록(규칙)만**, LLM 은 그 안에서 고르고 이유 한 줄만 쓴다.
 * 학생 수준 평가·학습 순서 제시는 하지 않는다 (CLAUDE.md CRITICAL, AI.md 기능 1).
 * 실제 API 를 호출하지 않는다 — SDK 를 가짜로 바꾼다.
 */
const createMock = vi.fn()

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    beta = { messages: { create: (...args: unknown[]) => createMock(...args) } }
    messages = { create: (...args: unknown[]) => createMock(...args) }
  },
}))

const { careerCandidates, pickCareers, CAREER_PICKS, MAX_CAREER_CANDIDATES } = await import(
  '@/lib/ai/career'
)

const base = {
  gradeBand: 'elementary' as const,
  sessionField: '드론',
  interestFields: ['드론', 'AI·코딩'],
  followupIntent: 4,
  wantToLearn: null as string | null,
  desiredJob: null as string | null,
}

const reply = (obj: unknown, extra: Record<string, unknown> = {}) => ({
  model: 'claude-opus-5',
  content: [{ type: 'text', text: typeof obj === 'string' ? obj : JSON.stringify(obj) }],
  stop_reason: 'end_turn',
  usage: { input_tokens: 900, output_tokens: 150 },
  ...extra,
})

const ids = (items: { id: string }[]) => items.map((i) => i.id)

beforeEach(() => {
  createMock.mockReset()
  delete process.env.ANTHROPIC_API_KEY
  delete process.env.ANTHROPIC_MODEL
})

afterEach(() => {
  delete process.env.ANTHROPIC_API_KEY
})

// ────────────────────────────────────────────────────────────
describe('검수된 진로 목록', () => {
  it('id 가 겹치지 않는다', () => {
    expect(new Set(ids(CAREERS)).size).toBe(CAREERS.length)
  })

  it('설문 분야마다 진로가 2개 이상 있다 — 어느 회차에서도 빈 화면이 나오지 않는다', () => {
    for (const f of FIELDS) {
      expect(CAREERS.filter((c) => c.fields.includes(f)).length, f).toBeGreaterThanOrEqual(2)
    }
  })

  it('소개 문장에 연락처·링크·숫자(3D 제외)가 없다', () => {
    for (const c of CAREERS) {
      for (const text of [c.title, c.summary, c.related]) {
        expect(maskForStorage(text), c.id).toBe(text)
        expect(text.replace(/3D/g, ''), c.id).not.toMatch(/\d/)
      }
    }
  })
})

// ────────────────────────────────────────────────────────────
describe('후보 확정 (규칙)', () => {
  it('목록 안에서만, 고른 분야·오늘 분야와 관련된 진로만 후보가 된다', () => {
    const list = careerCandidates(base)
    expect(list.length).toBeGreaterThanOrEqual(CAREER_PICKS)
    expect(list.length).toBeLessThanOrEqual(MAX_CAREER_CANDIDATES)
    for (const c of list) {
      expect(CAREERS).toContain(c)
      expect(c.fields.some((f) => ['드론', 'AI·코딩'].includes(f))).toBe(true)
    }
  })

  it('관심 직업에 적은 말과 맞는 진로가 맨 앞으로 온다', () => {
    const list = careerCandidates({ ...base, desiredJob: '유튜버' })
    expect(list[0]!.id).toBe('aerial-film')
  })

  it('"아직 잘 모르겠어요"만 골라도 오늘 분야로 후보를 찾는다', () => {
    const list = careerCandidates({ ...base, interestFields: [FIELD_UNSURE] })
    expect(list.length).toBeGreaterThanOrEqual(CAREER_PICKS)
    expect(list.every((c) => c.fields.includes('드론'))).toBe(true)
  })

  it('목록에 없는 분야이고 맞는 말도 없으면 후보가 없다', () => {
    expect(careerCandidates({ ...base, sessionField: '요리', interestFields: [FIELD_UNSURE] })).toEqual([])
  })
})

// ────────────────────────────────────────────────────────────
describe('LLM 없이 (키 없음)', () => {
  it('규칙으로 3개를 고르고 이유 문장을 반드시 채운다. API 를 부르지 않는다', async () => {
    const r = await pickCareers(base)
    expect(createMock).not.toHaveBeenCalled()
    expect(r.source).toBe('rule')
    expect(r.items).toHaveLength(CAREER_PICKS)
    for (const item of r.items) {
      expect(item.reason.length).toBeGreaterThan(0)
      expect(item.summary.length).toBeGreaterThan(0)
      expect(item.related.length).toBeGreaterThan(0)
    }
    expect(r.meta.model).toBeNull()
  })

  it('후보가 없으면 빈 목록을 돌려준다 (호출자가 기존 0건 화면을 쓴다)', async () => {
    const r = await pickCareers({ ...base, sessionField: '요리', interestFields: [FIELD_UNSURE] })
    expect(r.items).toEqual([])
  })
})

// ────────────────────────────────────────────────────────────
describe('LLM 경로', () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
  })

  it('LLM 이 고른 순서와 이유를 쓰고, 요청 모양을 지킨다', async () => {
    createMock.mockResolvedValue(
      reply({
        picks: [
          { id: 'drone-software', reason: '코딩으로 드론을 움직여 봤으니, 비행 프로그램을 만드는 일이 이어져요.' },
          { id: 'robotics-engineer', reason: '스스로 움직이는 기계를 만드는 일이라 오늘 수업과 닮았어요.' },
          { id: 'drone-pilot', reason: '직접 날려 본 경험이 현장 조종 일로 이어져요.' },
        ],
      }),
    )

    const r = await pickCareers(base)
    expect(r.source).toBe('llm')
    expect(ids(r.items)).toEqual(['drone-software', 'robotics-engineer', 'drone-pilot'])
    expect(r.items[0]!.reason).toContain('비행 프로그램')
    expect(r.meta).toMatchObject({ model: 'claude-opus-5', inputTokens: 900, outputTokens: 150, error: null })
    expect(typeof r.meta.latencyMs).toBe('number')

    const [params, options] = createMock.mock.calls[0]! as [Record<string, unknown>, Record<string, unknown>]
    expect(params.model).toBe('claude-opus-5')
    expect(params.output_config).toEqual({ effort: 'low' })
    expect(params.fallbacks).toBe('default')
    expect(params.betas).toContain('server-side-fallback-2026-07-01')
    expect(options.maxRetries).toBe(1)
    expect(options.timeout as number).toBeLessThanOrEqual(20_000)
  })

  it('ANTHROPIC_MODEL 이 있으면 그 모델을 쓴다', async () => {
    process.env.ANTHROPIC_MODEL = 'claude-sonnet-5'
    createMock.mockResolvedValue(reply({ picks: [] }))
    await pickCareers(base)
    expect((createMock.mock.calls[0]![0] as { model: string }).model).toBe('claude-sonnet-5')
  })

  it('목록에 없는 id 와 중복은 버리고, 모자라면 규칙 후보로 3개를 채운다', async () => {
    createMock.mockResolvedValue(
      reply({
        picks: [
          { id: 'astronaut', reason: '우주비행사가 딱이에요.' },
          { id: 'drone-software', reason: '비행 프로그램을 만드는 일이에요.' },
          { id: 'drone-software', reason: '중복' },
        ],
      }),
    )

    const r = await pickCareers(base)
    expect(r.items).toHaveLength(CAREER_PICKS)
    expect(ids(r.items)[0]).toBe('drone-software')
    expect(ids(r.items)).not.toContain('astronaut')
    expect(new Set(ids(r.items)).size).toBe(CAREER_PICKS)
    const allowed = new Set(ids(careerCandidates(base)))
    expect(r.items.every((i) => allowed.has(i.id))).toBe(true)
  })

  it('연락처·링크·숫자·수준 평가가 섞인 이유는 버리고 그 카드만 규칙 문장을 쓴다', async () => {
    createMock.mockResolvedValue(
      reply({
        picks: [
          { id: 'drone-software', reason: '궁금하면 010-1234-5678로 물어봐요.' },
          { id: 'robotics-engineer', reason: '연봉이 5000만원이 넘는 인기 직업이에요.' },
          { id: 'drone-pilot', reason: '아직 실력이 부족하지만 연습하면 돼요.' },
        ],
      }),
    )

    const r = await pickCareers(base)
    expect(ids(r.items)).toEqual(['drone-software', 'robotics-engineer', 'drone-pilot'])
    for (const item of r.items) {
      expect(item.reason).not.toMatch(/010|5000|실력/)
      expect(item.reason.length).toBeGreaterThan(0)
    }
  })

  it('API 오류면 규칙 결과로 내려가고 오류 종류만 기록한다', async () => {
    class RateLimited extends Error {
      status = 429
    }
    createMock.mockRejectedValue(new RateLimited('rate limited: secret details'))

    const r = await pickCareers(base)
    expect(r.source).toBe('rule')
    expect(r.items).toHaveLength(CAREER_PICKS)
    expect(r.meta.error).toBe('http_429')
  })

  it('타임아웃도 규칙 결과로 내려간다', async () => {
    createMock.mockRejectedValue(new Error('Request timed out.'))
    const r = await pickCareers(base)
    expect(r.source).toBe('rule')
    expect(r.meta.error).toBe('timeout')
  })

  it('거절(refusal)이면 규칙 결과로 내려간다', async () => {
    createMock.mockResolvedValue(reply('', { content: [], stop_reason: 'refusal' }))
    const r = await pickCareers(base)
    expect(r.source).toBe('rule')
    expect(r.meta.error).toBe('refusal')
  })

  it('JSON 이 아니면 규칙 결과로 내려간다', async () => {
    createMock.mockResolvedValue(reply('죄송해요, 잘 모르겠어요.'))
    const r = await pickCareers(base)
    expect(r.source).toBe('rule')
    expect(r.meta.error).toBe('parse')
  })

  it('LLM 에는 가린 자유서술과 정해진 항목만 간다', async () => {
    createMock.mockResolvedValue(reply({ picks: [] }))
    await pickCareers({
      ...base,
      wantToLearn: '드론 촬영 배우고 싶어요 010-1234-5678 로 연락 주세요',
      desiredJob: '저는 김민수 유튜버',
    })

    const params = createMock.mock.calls[0]![0] as { messages: { content: string }[] }
    const payload = JSON.parse(params.messages[0]!.content) as {
      학생: Record<string, unknown>
      후보: Record<string, unknown>[]
    }
    const sent = JSON.stringify(payload)
    expect(sent).not.toContain('010-1234-5678')
    expect(sent).not.toContain('김민수')
    expect(Object.keys(payload.학생).sort()).toEqual(
      ['고른_관심분야', '관심_직업', '더_배우고_싶은_정도', '오늘_들은_분야', '직접_쓴_말', '학년대'].sort(),
    )
    for (const c of payload.후보) {
      expect(Object.keys(c).sort()).toEqual(['id', '관련', '직업', '하는_일'].sort())
    }
  })
})
