import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as demo from '@/data/demo'
import type { Dataset } from '@/lib/db/dataset'

/** Anthropic SDK 를 가짜로 바꿔 LLM 경로만 검증한다. 실제 API 를 호출하지 않는다. */
const createMock = vi.fn()

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: (...args: unknown[]) => createMock(...args) }
  },
}))

const { recommend } = await import('@/lib/ai/recommend')

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

const textBlock = (text: string) => ({ content: [{ type: 'text', text }] })

beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = 'test-key'
  createMock.mockReset()
})

afterEach(() => {
  delete process.env.ANTHROPIC_API_KEY
})

describe('LLM 순위 경로', () => {
  it('LLM 이 준 순서와 이유를 쓴다', async () => {
    createMock.mockResolvedValue(
      textBlock(
        JSON.stringify({
          ranking: [
            { id: 'pg-2', reason: '한 번만 더 해보고 싶을 때 딱 맞는 입문 수업이에요.' },
            { id: 'pg-1', reason: '직접 설계한 물건을 손에 쥐게 되는 과정이에요.' },
          ],
        }),
      ),
    )

    const r = await recommend(ds, input)
    expect(r.source).toBe('llm')
    expect(r.items.map((i) => i.program.id)).toEqual(['pg-2', 'pg-1'])
    expect(r.items[0]!.reason).toContain('입문 수업')
  })

  it('일부만 돌려줘도 나머지를 규칙 순위로 뒤에 붙이고, 중복이 생기지 않는다', async () => {
    createMock.mockResolvedValue(
      textBlock(JSON.stringify({ ranking: [{ id: 'pg-2', reason: '먼저 가볍게 해보기 좋아요.' }] })),
    )

    const r = await recommend(ds, input)
    const ids = r.items.map((i) => i.program.id)
    expect(ids[0]).toBe('pg-2')
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toContain('pg-1')
  })

  it('후보에 없는 id 를 돌려주면 무시한다 — LLM 이 없는 강사를 만들 수 없다', async () => {
    createMock.mockResolvedValue(
      textBlock(
        JSON.stringify({
          ranking: [
            { id: 'pg-does-not-exist', reason: '존재하지 않는 프로그램' },
            { id: 'pg-1', reason: '실제 프로그램' },
          ],
        }),
      ),
    )

    const r = await recommend(ds, input)
    expect(r.items.map((i) => i.program.id)).not.toContain('pg-does-not-exist')
    expect(r.items.length).toBeGreaterThan(0)
  })

  it('이유에 연락처가 섞이면 그 문구를 버리고 규칙 문구를 쓴다', async () => {
    createMock.mockResolvedValue(
      textBlock(
        JSON.stringify({
          ranking: [{ id: 'pg-1', reason: '자세한 건 010-1234-5678 로 연락주세요' }],
        }),
      ),
    )

    const r = await recommend(ds, input)
    const first = r.items.find((i) => i.program.id === 'pg-1')!
    expect(first.reason).not.toContain('1234')
    expect(first.reason.length).toBeGreaterThan(5)
  })

  it('LLM 이 던지면 규칙 순위로 떨어지고 200 을 유지한다 (E-06)', async () => {
    createMock.mockRejectedValue(new Error('rate limit'))

    const r = await recommend(ds, input)
    expect(r.source).toBe('rule')
    expect(r.items.length).toBeGreaterThan(0)
  })

  it('JSON 이 아닌 응답도 규칙 순위로 떨어진다', async () => {
    createMock.mockResolvedValue(textBlock('죄송하지만 추천을 만들 수 없습니다.'))

    const r = await recommend(ds, input)
    expect(r.source).toBe('rule')
    expect(r.items.length).toBeGreaterThan(0)
  })

  it('LLM 에 보내는 자유서술은 마스킹된 값이다 (E-08)', async () => {
    createMock.mockResolvedValue(textBlock(JSON.stringify({ ranking: [] })))

    await recommend(ds, {
      ...input,
      wantToLearn: '저는 김민준이고 광명북중학교 다녀요 010-1234-5678',
    })

    const body = JSON.stringify(createMock.mock.calls[0]?.[0] ?? {})
    expect(body).not.toContain('김민준')
    expect(body).not.toContain('광명북중학교')
    expect(body).not.toContain('1234-5678')
  })
})
