// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as demo from '@/data/demo'
import type { Dataset } from '@/lib/db/dataset'

/**
 * 추천의 **메타 기록** — 학생에게 실제로 AI 문장이 나갔는지, 아니면 규칙 문장으로 떨어졌는지.
 *
 * LLM 실패는 조용히 규칙 문장으로 떨어진다(E-06). 화면은 멀쩡하므로 **메타가 없으면 교실에서 AI 가
 * 한 번도 안 돌았어도 아무도 모른다.** 그래서 모델·지연·토큰·실패 분류를 결과에 싣는다.
 * 실패 분류에는 에러 **메시지 본문을 넣지 않는다** — 분류명과 HTTP 상태만.
 */

const createMock = vi.hoisted(() => vi.fn())

vi.mock('@anthropic-ai/sdk', () => {
  class APIConnectionError extends Error {}
  class APIConnectionTimeoutError extends APIConnectionError {}
  return {
    default: class {
      static APIConnectionError = APIConnectionError
      static APIConnectionTimeoutError = APIConnectionTimeoutError
      messages = { create: (...args: unknown[]) => createMock(...args) }
    },
  }
})

const { recommend } = await import('@/lib/ai/recommend')
const Anthropic = (await import('@anthropic-ai/sdk')).default as unknown as {
  APIConnectionTimeoutError: new (message?: string) => Error
}

const ds: Dataset = {
  organizations: demo.organizations,
  orgMembers: demo.orgMembers,
  providers: demo.providers,
  instructors: demo.instructors,
  instructorVerifications: demo.instructorVerifications,
  programs: demo.programs,
  lectureSessions: demo.lectureSessions,
  lessonPlans: demo.lessonPlans,
  students: demo.students,
  surveyResponses: demo.surveyResponses,
  interests: demo.interests,
  consents: demo.consents,
  recruitmentRequests: demo.recruitmentRequests,
  qnaQuestions: demo.qnaQuestions,
  qnaAnswers: demo.qnaAnswers,
  inquiries: demo.inquiries,
  invitations: demo.invitations,
}

const input = {
  regionCode: '41210',
  gradeBand: 'middle' as const,
  sessionField: '3D 모델링·프린팅' as const,
  followupIntent: 4,
  interestFields: ['3D 모델링·프린팅'],
  wantToLearn: null,
  desiredJob: null,
}

const ok = (text: string, extra: Record<string, unknown> = {}) => ({
  content: [{ type: 'text', text }],
  stop_reason: 'end_turn',
  usage: { input_tokens: 2345, output_tokens: 321 },
  ...extra,
})

const RANKING = JSON.stringify({
  ranking: [{ id: 'pg-1', reason: '직접 설계한 물건을 손에 쥐게 되는 과정이에요.' }],
})

beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = 'test-key'
  delete process.env.ANTHROPIC_MODEL
  createMock.mockReset()
})

afterEach(() => {
  delete process.env.ANTHROPIC_API_KEY
  delete process.env.ANTHROPIC_MODEL
})

describe('LLM 성공 — 모델·지연·토큰을 싣는다', () => {
  it('source 가 llm 이고 사용량이 meta 에 들어간다', async () => {
    createMock.mockResolvedValue(ok(RANKING))

    const r = await recommend(ds, input)

    expect(r.source).toBe('llm')
    expect(r.meta.model).toBe('claude-opus-5')
    expect(r.meta.inputTokens).toBe(2345)
    expect(r.meta.outputTokens).toBe(321)
    expect(typeof r.meta.latencyMs).toBe('number')
    expect(r.meta.latencyMs).toBeGreaterThanOrEqual(0)
    expect(r.meta.error).toBeNull()
  })

  it('ANTHROPIC_MODEL 로 바꾼 모델명이 기록된다', async () => {
    process.env.ANTHROPIC_MODEL = 'claude-sonnet-5'
    createMock.mockResolvedValue(ok(RANKING))

    const r = await recommend(ds, input)
    expect(r.meta.model).toBe('claude-sonnet-5')
    expect(createMock.mock.calls[0]?.[0]).toMatchObject({ model: 'claude-sonnet-5' })
  })

  it('max_tokens 는 4000 — 적응형 사고 토큰이 한도를 먹어 JSON 이 잘리지 않게', async () => {
    createMock.mockResolvedValue(ok(RANKING))
    await recommend(ds, input)
    expect(createMock.mock.calls[0]?.[0]).toMatchObject({ max_tokens: 4000 })
  })
})

describe('LLM 실패 — 규칙으로 떨어지되 이유를 남긴다', () => {
  it('429 → RateLimitError:429', async () => {
    createMock.mockRejectedValue(Object.assign(new Error('secret body'), { status: 429 }))
    const r = await recommend(ds, input)
    expect(r.source).toBe('rule')
    expect(r.items.length).toBeGreaterThan(0)
    expect(r.meta.error).toBe('RateLimitError:429')
  })

  it('401 → AuthenticationError:401 (키 오타·폐기)', async () => {
    createMock.mockRejectedValue(Object.assign(new Error('x'), { status: 401 }))
    expect((await recommend(ds, input)).meta.error).toBe('AuthenticationError:401')
  })

  it('400 → BadRequestError:400 (크레딧 소진·파라미터 오류)', async () => {
    createMock.mockRejectedValue(Object.assign(new Error('x'), { status: 400 }))
    expect((await recommend(ds, input)).meta.error).toBe('BadRequestError:400')
  })

  it('타임아웃 → APIConnectionTimeoutError', async () => {
    createMock.mockRejectedValue(new Anthropic.APIConnectionTimeoutError('Request timed out.'))
    expect((await recommend(ds, input)).meta.error).toBe('APIConnectionTimeoutError')
  })

  it('에러 메시지 본문은 기록하지 않는다', async () => {
    createMock.mockRejectedValue(Object.assign(new Error('학생 김민준 010-1234-5678'), { status: 500 }))
    const r = await recommend(ds, input)
    expect(r.meta.error).toBe('InternalServerError:500')
    expect(JSON.stringify(r.meta)).not.toContain('김민준')
  })

  it('JSON 이 아니면 ParseError, 잘렸으면 멈춘 이유를 붙인다', async () => {
    createMock.mockResolvedValue(ok('{"ranking":[{"id":"pg-1","reason":"잘린', { stop_reason: 'max_tokens' }))
    const r = await recommend(ds, input)
    expect(r.source).toBe('rule')
    expect(r.meta.error).toBe('ParseError:max_tokens')
    expect(r.meta.inputTokens).toBe(2345)
  })

  it('정상 종료인데 JSON 이 없으면 ParseError', async () => {
    createMock.mockResolvedValue(ok('추천을 만들 수 없습니다.'))
    expect((await recommend(ds, input)).meta.error).toBe('ParseError')
  })

  it('키가 없으면 NoApiKey — 배포 환경변수 누락을 로그로 알 수 있다', async () => {
    delete process.env.ANTHROPIC_API_KEY
    const r = await recommend(ds, input)
    expect(r.source).toBe('rule')
    expect(r.meta.error).toBe('NoApiKey')
    expect(r.meta.model).toBeNull()
    expect(createMock).not.toHaveBeenCalled()
  })

  it('후보가 0개면 LLM 을 부르지 않고 meta 가 비어 있다', async () => {
    const r = await recommend(ds, { ...input, interestFields: ['뷰티'] })
    expect(r.items).toHaveLength(0)
    expect(createMock).not.toHaveBeenCalled()
    expect(r.meta).toEqual({
      model: null,
      latencyMs: null,
      inputTokens: null,
      outputTokens: null,
      error: null,
    })
  })
})
