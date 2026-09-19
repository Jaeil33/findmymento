import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as demo from '@/data/demo'
import type { Dataset } from '@/lib/db/dataset'
import type { LectureSession } from '@/types/domain'

/**
 * 교안 초안의 LLM 호출 (ADR-017). 실제 API 를 호출하지 않는다 — SDK 를 가짜로 바꾼다.
 *
 * 2026-09-19 첫 파일럿에서 교안이 규칙 골격(기본 템플릿)으로만 나왔다. effort 를 비워 두면 Opus 5 는
 * high 로 생각하는데, 같은 입력이 23.8초 걸려 20초 제한에 걸렸다 (low 10.5초). 그래서 요청 모양을
 * 다른 AI 호출(진로 카드·수업 후 AI)과 같게 고정한다.
 */
const createMock = vi.fn()

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    beta = { messages: { create: (...args: unknown[]) => createMock(...args) } }
    messages = { create: (...args: unknown[]) => createMock(...args) }
  },
}))

const { generateLessonPlan } = await import('@/lib/ai/lesson-plan')

const empty: Dataset = {
  organizations: [],
  orgMembers: [],
  providers: [],
  instructors: [],
  instructorVerifications: [],
  programs: [],
  lectureSessions: [],
  students: [],
  surveyResponses: [],
  interests: [],
  consents: [],
  recruitmentRequests: [],
  lessonPlans: [],
  qnaQuestions: [],
  qnaAnswers: [],
  inquiries: [],
  invitations: [],
}

const ds: Dataset = { ...empty, ...demo }

const session: LectureSession = {
  id: 'ls-llm',
  org_id: 'org-1',
  instructor_id: 'in-2',
  title: '드론 특강',
  field: '드론',
  held_on: '2026-09-19',
  closes_at: '2026-09-19T23:59:00+09:00',
  status: 'open',
  entry_code: '222222',
  grade_band: 'middle',
  expected_students: 15,
  duration_minutes: 120,
  venue: '교실',
  class_traits: [],
  equipment: [],
}

const reply = (text: string, extra: Record<string, unknown> = {}) => ({
  model: 'claude-opus-5',
  content: [{ type: 'text', text }],
  stop_reason: 'end_turn',
  usage: { input_tokens: 930, output_tokens: 750 },
  ...extra,
})

const llmSteps = (n: number) =>
  JSON.stringify({
    steps: Array.from({ length: n }, (_, i) => ({
      base: `${i + 1}단계에서 학생이 직접 드론을 다뤄 봅니다.`,
      fast: '먼저 끝낸 학생은 경로를 하나 더 만들어 봅니다.',
      slow: '범위를 절반으로 줄여 따라 하게 합니다.',
      accommodations: [],
    })),
  })

describe('교안 LLM 호출', () => {
  beforeEach(() => {
    createMock.mockReset()
    process.env.ANTHROPIC_API_KEY = 'test-key'
    delete process.env.ANTHROPIC_MODEL
  })

  it('effort low · 기본 모델 · 20초 제한 · 재시도 1회 · 거절 시 대체 모델로 요청한다', async () => {
    createMock.mockResolvedValue(reply(llmSteps(4)))
    const draft = await generateLessonPlan(ds, session)

    expect(draft.source).toBe('llm')
    expect(draft.skeleton.steps[0]!.base).toBe('1단계에서 학생이 직접 드론을 다뤄 봅니다.')

    const [params, options] = createMock.mock.calls[0]! as [Record<string, unknown>, Record<string, unknown>]
    expect(params.model).toBe('claude-opus-5')
    expect(params.max_tokens).toBe(4000)
    expect(params.output_config).toEqual({ effort: 'low' })
    expect(params.fallbacks).toBe('default')
    expect(params.betas).toContain('server-side-fallback-2026-07-01')
    expect(options).toEqual({ timeout: 20_000, maxRetries: 1 })
  })

  it('거절(refusal)이면 규칙 골격으로 내려간다', async () => {
    createMock.mockResolvedValue(reply(llmSteps(4), { stop_reason: 'refusal' }))
    const draft = await generateLessonPlan(ds, session)
    expect(draft.source).toBe('rule')
  })

  it('시간 초과면 규칙 골격으로 내려간다 — 화면은 뜬다', async () => {
    createMock.mockRejectedValue(new Error('Request timed out.'))
    const draft = await generateLessonPlan(ds, session)
    expect(draft.source).toBe('rule')
    expect(draft.skeleton.steps.length).toBeGreaterThanOrEqual(3)
  })
})
