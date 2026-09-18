// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as demo from '@/data/demo'

/**
 * 학생 경로 라우트 — 교실 조건에서의 동작.
 *
 * - 한 반은 학교 와이파이 하나(= 공인 IP 하나)로 들어온다. 15명이 1분 안에 제출해도 막히면 안 된다
 * - 저장이 거부되면 크래시(HTML 500)가 아니라 **JSON 안내**를 준다 — 학생 화면은 답을 들고 다시 시도한다
 * - 추천은 학생에게 보여 준 카드·출처(llm/rule)를 기록한다. 기록 실패가 학생 화면을 깨지 않는다
 */

const state = vi.hoisted(() => ({
  failSurveyInsert: false,
  failLogInsert: false,
  logs: [] as Record<string, unknown>[],
}))

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: vi.fn() }
  },
}))

vi.mock('@/lib/db/writes', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/lib/db/writes')>()
  return {
    ...mod,
    insertSurveyResponse: async (...args: Parameters<typeof mod.insertSurveyResponse>) => {
      if (state.failSurveyInsert) throw new Error('new row violates row-level security policy')
      return mod.insertSurveyResponse(...args)
    },
    insertRecommendationLog: async (row: Parameters<typeof mod.insertRecommendationLog>[0]) => {
      if (state.failLogInsert) throw new Error('log insert failed')
      state.logs.push(row as unknown as Record<string, unknown>)
    },
  }
})

const { POST: survey } = await import('@/app/api/survey/route')
const { POST: recommendRoute } = await import('@/app/api/recommend/route')
const { POST: interest } = await import('@/app/api/interest/route')
const { STUDENT_RATE_LIMITS } = await import('@/lib/validation')

const OPEN_CODE = '735104' // ls-2 · 광명시청소년수련관 · 3D 특강 (응답 받는 중)
const RESPONSE_ID = '0b6f0a8e-3c1b-4b8e-9a3e-2f7d2d9c1a11'

let ipSeq = 0
const freshIp = () => `203.0.113.${(ipSeq += 1)}`

function post(body: unknown, ip: string): Request {
  return new Request('http://localhost/api/x', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify(body),
  })
}

const surveyBody = {
  entryCode: OPEN_CODE,
  pseudoCode: null,
  grade: { band: 'middle', year: 2 },
  satisfaction: 5,
  followupIntent: 4,
  interestFields: ['3D 모델링·프린팅'],
  wantToLearn: '',
  desiredJob: '',
  availableTimes: [],
}

const recommendBody = {
  entryCode: OPEN_CODE,
  pseudoCode: null,
  grade: { band: 'middle', year: 2 },
  followupIntent: 4,
  interestFields: ['3D 모델링·프린팅'],
  wantToLearn: '',
  desiredJob: '',
}

beforeEach(() => {
  delete process.env.NEXT_PUBLIC_SUPABASE_URL
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  delete process.env.ANTHROPIC_API_KEY
  state.failSurveyInsert = false
  state.failLogInsert = false
  state.logs = []
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('교실 레이트 리밋 — 한 반 = 공인 IP 하나', () => {
  it('한도는 한 반(40명)이 1분 안에 제출해도 넉넉한 값이다', () => {
    expect(STUDENT_RATE_LIMITS.survey).toBeGreaterThanOrEqual(60)
    expect(STUDENT_RATE_LIMITS.recommend).toBeGreaterThanOrEqual(60)
    // 한 학생이 추천 카드 여러 장에 "더 배우고 싶어요"를 누를 수 있다.
    expect(STUDENT_RATE_LIMITS.interest).toBeGreaterThanOrEqual(120)
  })

  it('같은 IP 에서 15명이 연달아 제출해도 전부 받는다', async () => {
    const ip = freshIp()
    const statuses: number[] = []
    for (let i = 0; i < 15; i += 1) statuses.push((await survey(post(surveyBody, ip))).status)
    expect(statuses.every((s) => s === 200)).toBe(true)
  })

  it('같은 IP 에서 15명이 연달아 추천을 받아도 막히지 않는다', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {})
    const ip = freshIp()
    const statuses: number[] = []
    for (let i = 0; i < 15; i += 1) statuses.push((await recommendRoute(post(recommendBody, ip))).status)
    expect(statuses.every((s) => s === 200)).toBe(true)
  })
})

describe('설문 제출', () => {
  it('저장이 거부되면 JSON 안내를 준다 (크래시 아님)', async () => {
    state.failSurveyInsert = true
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})

    const res = await survey(post(surveyBody, freshIp()))

    expect(res.status).toBe(503)
    const data = (await res.json()) as { ok: boolean; message: string }
    expect(data.ok).toBe(false)
    expect(data.message).toContain('다시')
    // 서버 로그에는 사유만 — 학생 답 본문을 남기지 않는다.
    expect(JSON.stringify(error.mock.calls)).not.toContain('3D 모델링·프린팅')
  })

  it('이미 응답한 가명코드는 같은 회차에 다시 낼 수 없다 (E-03)', async () => {
    const answered = demo.surveyResponses.find((r) => r.session_id === 'ls-2' && r.student_id)
    expect(answered).toBeDefined()
    const code = demo.students.find((s) => s.id === answered!.student_id)!.pseudo_code

    const res = await survey(post({ ...surveyBody, pseudoCode: code }, freshIp()))
    expect(res.status).toBe(409)
    expect(((await res.json()) as { reason: string }).reason).toBe('duplicate')
  })

  it('없는 가명코드는 unknown_code 로 안내한다', async () => {
    const res = await survey(post({ ...surveyBody, pseudoCode: '999999' }, freshIp()))
    expect(res.status).toBe(404)
    expect(((await res.json()) as { reason: string }).reason).toBe('unknown_code')
  })

  it('마감된 회차는 거부한다 (E-17)', async () => {
    const res = await survey(post({ ...surveyBody, entryCode: '482913' }, freshIp()))
    expect(res.status).toBe(409)
  })
})

describe('추천 — 학생에게 보여 준 것을 기록한다', () => {
  it('응답 id·카드·출처를 기록하고, 한 줄 요약 로그를 남긴다', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})

    const res = await recommendRoute(post({ ...recommendBody, responseId: RESPONSE_ID }, freshIp()))
    const data = (await res.json()) as { ok: boolean; items: { programId: string; reason: string }[] }

    expect(res.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(data.items.length).toBeGreaterThan(0)

    expect(state.logs).toHaveLength(1)
    const log = state.logs[0]!
    expect(log).toMatchObject({
      sessionId: 'ls-2',
      responseId: RESPONSE_ID,
      source: 'rule',
      stage: 'same',
      error: 'NoApiKey',
    })
    expect(log.items).toEqual(data.items.map((i) => ({ program_id: i.programId, reason: i.reason })))

    const line = info.mock.calls.map((c) => String(c[0])).find((s) => s.includes('"event":"recommend"'))
    expect(line).toBeDefined()
    expect(JSON.parse(line!)).toMatchObject({ event: 'recommend', sessionId: 'ls-2', source: 'rule' })
  })

  it('형식이 틀린 responseId 는 기록하지 않는다', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {})
    await recommendRoute(post({ ...recommendBody, responseId: "1; drop table x" }, freshIp()))
    expect(state.logs[0]!.responseId).toBeNull()
  })

  it('기록이 실패해도 학생은 추천을 받는다', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    state.failLogInsert = true

    const res = await recommendRoute(post({ ...recommendBody, responseId: RESPONSE_ID }, freshIp()))
    expect(res.status).toBe(200)
    expect(((await res.json()) as { items: unknown[] }).items.length).toBeGreaterThan(0)
  })

  it('가명코드의 지난 기록이 이어진다 — 3D 를 골라도 드론 과정이 나온다 (E-18)', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {})
    const res = await recommendRoute(post({ ...recommendBody, pseudoCode: '311009' }, freshIp()))
    const data = (await res.json()) as { items: { field: string }[] }
    expect(data.items.map((i) => i.field)).toContain('드론')
  })

  it('없는 입장 코드는 404', async () => {
    const res = await recommendRoute(post({ ...recommendBody, entryCode: '000000' }, freshIp()))
    expect(res.status).toBe(404)
  })
})

describe('관심 표현', () => {
  it('열린 회차의 승인된 프로그램에 관심을 남기고, 기관 경유를 안내한다', async () => {
    const res = await interest(
      post({ entryCode: OPEN_CODE, grade: { band: 'middle', year: 2 }, programId: 'pg-1' }, freshIp()),
    )
    expect(res.status).toBe(200)
    expect(((await res.json()) as { message: string }).message).toContain('선생님께 전달')
  })

  it('마감된 회차에는 남길 수 없다', async () => {
    const res = await interest(
      post({ entryCode: '482913', grade: { band: 'middle', year: 2 }, programId: 'pg-1' }, freshIp()),
    )
    expect(res.status).toBe(409)
  })
})
