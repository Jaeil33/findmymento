// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CAREERS } from '@/data/careers'

/**
 * 추천 라우트 — 추천할 수업이 0건이면 진로 카드 3장 (ADR-027).
 *
 * - 수업 후보가 있으면 기존 그대로다 (진로 카드 없음)
 * - 0건이면 진로 카드를 내려주고, **무엇을 보여 줬는지** 추천 기록에 진로 id 로 남긴다
 * - 진로 카드에는 정해진 필드만 있다 (연락처·링크·강사로 가는 값 없음)
 */

const state = vi.hoisted(() => ({ logs: [] as Record<string, unknown>[] }))

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: vi.fn() }
    beta = { messages: { create: vi.fn() } }
  },
}))

vi.mock('@/lib/db/writes', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/lib/db/writes')>()
  return {
    ...mod,
    insertRecommendationLog: async (row: Parameters<typeof mod.insertRecommendationLog>[0]) => {
      state.logs.push(row as unknown as Record<string, unknown>)
    },
  }
})

const { POST: recommendRoute } = await import('@/app/api/recommend/route')

const RESPONSE_ID = '6a1f6f2e-8f0c-4b7a-9d7e-1c2b3a4d5e6f'
let ipSeq = 0
const post = (body: unknown) =>
  new Request('http://localhost/api/recommend', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': `198.51.100.${(ipSeq += 1)}` },
    body: JSON.stringify(body),
  })

// ls-3 · VR 체험 특강 (응답 받는 중). 데모에는 VR·AR·AI·코딩 수업이 없다 → 수업 추천 0건.
const noProgramBody = {
  entryCode: '209457',
  pseudoCode: null,
  grade: { band: 'high', year: 1 },
  followupIntent: 4,
  interestFields: ['VR·AR', 'AI·코딩'],
  wantToLearn: '',
  desiredJob: '',
  responseId: RESPONSE_ID,
}

// ls-2 · 3D 특강. 3D 수업이 있다 → 기존 수업 추천.
const withProgramBody = {
  entryCode: '735104',
  pseudoCode: null,
  grade: { band: 'middle', year: 2 },
  followupIntent: 4,
  interestFields: ['3D 모델링·프린팅'],
  wantToLearn: '',
  desiredJob: '',
}

type CareerOut = { id: string; title: string; summary: string; related: string; reason: string }

beforeEach(() => {
  delete process.env.NEXT_PUBLIC_SUPABASE_URL
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  delete process.env.ANTHROPIC_API_KEY
  state.logs = []
  vi.spyOn(console, 'info').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('수업 추천 0건 → 진로 카드', () => {
  it('목록에 없는 꿈을 적으면 응원 한 줄(dreamNote)이 함께 내려간다', async () => {
    const res = await recommendRoute(post({ ...noProgramBody, desiredJob: '축구선수' }))
    const data = (await res.json()) as { dreamNote: string | null; careers: CareerOut[] }
    expect(data.careers).toHaveLength(3)
    expect(typeof data.dreamNote).toBe('string')
    expect(data.dreamNote!.length).toBeGreaterThan(0)
  })

  it('꿈을 안 적었거나 목록과 이어지면 dreamNote 는 null', async () => {
    for (const desiredJob of ['', '유튜버']) {
      const data = (await (await recommendRoute(post({ ...noProgramBody, desiredJob }))).json()) as { dreamNote: string | null }
      expect(data.dreamNote, desiredJob).toBeNull()
    }
  })

  it('진로 카드 3장을 내려주고, 카드는 검수 목록 안의 것뿐이다', async () => {
    const res = await recommendRoute(post(noProgramBody))
    const data = (await res.json()) as { ok: boolean; items: unknown[]; careers: CareerOut[] }

    expect(res.status).toBe(200)
    expect(data.items).toEqual([])
    expect(data.careers).toHaveLength(3)
    const catalog = new Set(CAREERS.map((c) => c.id))
    for (const c of data.careers) {
      expect(catalog.has(c.id)).toBe(true)
      expect(Object.keys(c).sort()).toEqual(['id', 'reason', 'related', 'summary', 'title'])
      expect(c.reason.length).toBeGreaterThan(0)
    }
  })

  it('무엇을 보여 줬는지 진로 id 로 추천 기록에 남긴다', async () => {
    const res = await recommendRoute(post(noProgramBody))
    const data = (await res.json()) as { careers: CareerOut[] }

    expect(state.logs).toHaveLength(1)
    expect(state.logs[0]).toMatchObject({
      sessionId: 'ls-3',
      responseId: RESPONSE_ID,
      source: 'rule',
      stage: 'none',
    })
    expect(state.logs[0]!.items).toEqual(
      data.careers.map((c) => ({ career_id: c.id, reason: c.reason })),
    )

    const line = (console.info as unknown as { mock: { calls: unknown[][] } }).mock.calls
      .map((c) => String(c[0]))
      .find((s) => s.includes('"event":"recommend"'))
    expect(JSON.parse(line!)).toMatchObject({ kind: 'career', items: 3 })
  })

  it('수업 후보가 있으면 기존 수업 추천 그대로이고 진로 카드는 없다', async () => {
    const res = await recommendRoute(post(withProgramBody))
    const data = (await res.json()) as { items: unknown[]; careers: CareerOut[] }

    expect(data.items.length).toBeGreaterThan(0)
    expect(data.careers).toEqual([])
    expect(state.logs[0]!.items).toEqual(
      expect.arrayContaining([expect.objectContaining({ program_id: expect.any(String) })]),
    )
  })
})
