// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as demo from '@/data/demo'

/**
 * anon 쓰기 경로 (`lib/db/writes.ts`) — 실 DB 모드.
 *
 * anon 은 survey_responses · interests · inquiries · recommendation_logs 를 **읽을 수 없다.**
 * INSERT 뒤에 `.select()` 로 행을 돌려받으면 PostgREST 가 RETURNING 을 쓰고, RETURNING 은
 * SELECT 정책을 요구하므로 **모든 제출이 RLS 에러(42501)로 실패한다.**
 * 그래서 id 를 서버에서 만들고, 행을 돌려받지 않는다.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

const state = vi.hoisted(() => ({
  inserts: [] as { table: string; row: Record<string, unknown> }[],
  selectCalls: 0,
  insertError: null as unknown,
  serverCalls: 0,
}))

vi.mock('@/lib/supabase/server', () => ({
  getServiceSupabase: () => null,
  getServerSupabase: async () => {
    state.serverCalls += 1
    return {
      from(table: string) {
        return {
          insert(row: Record<string, unknown>) {
            state.inserts.push({ table, row })
            const result = Promise.resolve({ data: null, error: state.insertError })
            // `.select()` 를 부르면 기록한다 — 불리면 안 된다.
            return Object.assign(result, {
              select: () => {
                state.selectCalls += 1
                return { single: () => result }
              },
            })
          },
        }
      },
    }
  },
}))

const writes = await import('@/lib/db/writes')

const ORIGINAL = { ...process.env }

function goLive() {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon'
}

beforeEach(() => {
  state.inserts = []
  state.selectCalls = 0
  state.insertError = null
  state.serverCalls = 0
})

afterEach(() => {
  process.env = { ...ORIGINAL }
})

const survey = {
  sessionId: 'a1b2c3d4-0000-4000-8000-000000000001',
  studentId: null,
  grade: { band: 'middle' as const, year: 2 },
  satisfaction: 5,
  followupIntent: 4,
  interestFields: ['3D 모델링·프린팅'],
  wantToLearn: '피규어 만들고 싶어요',
  desiredJob: null,
  availableTimes: ['토요일'],
}

describe('실 DB — anon INSERT 는 행을 돌려받지 않는다', () => {
  it('설문: id 를 서버에서 만들어 넣고, 같은 id 를 돌려준다', async () => {
    goLive()
    const { id } = await writes.insertSurveyResponse(survey)

    expect(id).toMatch(UUID)
    expect(state.selectCalls).toBe(0)
    expect(state.inserts).toHaveLength(1)
    const { table, row } = state.inserts[0]!
    expect(table).toBe('survey_responses')
    expect(row.id).toBe(id)
    expect(row).toMatchObject({
      session_id: survey.sessionId,
      student_id: null,
      grade_band: 'middle',
      grade_year: 2,
      satisfaction: 5,
      followup_intent: 4,
    })
  })

  it('설문: INSERT 가 거부되면 던진다 — 라우트가 학생에게 다시 시도 안내를 준다', async () => {
    goLive()
    state.insertError = { code: '42501', message: 'new row violates row-level security policy' }
    await expect(writes.insertSurveyResponse(survey)).rejects.toThrow()
  })

  it('관심 표현: 행을 돌려받지 않는다', async () => {
    goLive()
    const { id } = await writes.insertInterest({
      sessionId: survey.sessionId,
      studentId: null,
      targetType: 'program',
      targetId: 'a1b2c3d4-0000-4000-8000-0000000000cc',
      alias: '중2 학생 A',
    })
    expect(id).toMatch(UUID)
    expect(state.selectCalls).toBe(0)
    expect(state.inserts[0]!.table).toBe('interests')
    expect(state.inserts[0]!.row.id).toBe(id)
  })

  it('보호자 문의: 행을 돌려받지 않는다 — anon 은 문의를 읽을 수 없다 (ADR-014)', async () => {
    goLive()
    const { id } = await writes.insertInquiry({
      guardianName: '김보호',
      guardianContact: '010-0000-0000',
      regionCode: '41210',
      gradeBand: 'middle',
      field: '드론',
      targetType: 'none',
      targetId: null,
      message: '주말 수업이 있을까요?',
    })
    expect(id).toMatch(UUID)
    expect(state.selectCalls).toBe(0)
    expect(state.inserts[0]!.table).toBe('inquiries')
    expect(state.inserts[0]!.row.id).toBe(id)
  })

  it('추천 기록: 보여 준 카드와 순위를 만든 주체·지연·토큰만 남긴다', async () => {
    goLive()
    await writes.insertRecommendationLog({
      sessionId: survey.sessionId,
      responseId: 'a1b2c3d4-0000-4000-8000-0000000000dd',
      source: 'llm',
      stage: 'same',
      items: [{ program_id: 'pg-1', reason: '직접 설계해서 출력까지 해 볼 수 있어요.' }],
      model: 'claude-opus-5',
      latencyMs: 3120,
      inputTokens: 2400,
      outputTokens: 310,
      error: null,
    })

    expect(state.selectCalls).toBe(0)
    expect(state.inserts).toHaveLength(1)
    const { table, row } = state.inserts[0]!
    expect(table).toBe('recommendation_logs')
    expect(row).toEqual({
      id: expect.stringMatching(UUID),
      session_id: survey.sessionId,
      response_id: 'a1b2c3d4-0000-4000-8000-0000000000dd',
      source: 'llm',
      stage: 'same',
      items: [{ program_id: 'pg-1', reason: '직접 설계해서 출력까지 해 볼 수 있어요.' }],
      model: 'claude-opus-5',
      latency_ms: 3120,
      input_tokens: 2400,
      output_tokens: 310,
      error: null,
    })
  })

  it('추천 기록: INSERT 가 거부되면 던진다 — 라우트가 삼키고 학생 응답은 그대로 나간다', async () => {
    goLive()
    state.insertError = { code: '42501', message: 'rls' }
    await expect(
      writes.insertRecommendationLog({
        sessionId: survey.sessionId,
        responseId: null,
        source: 'rule',
        stage: 'none',
        items: [],
        model: null,
        latencyMs: null,
        inputTokens: null,
        outputTokens: null,
        error: null,
      }),
    ).rejects.toThrow()
  })
})

describe('데모 모드 — 기존 동작 그대로', () => {
  it('설문은 시드 배열에 들어간다', async () => {
    const before = demo.surveyResponses.length
    const { id } = await writes.insertSurveyResponse({ ...survey, sessionId: 'ls-2' })
    expect(demo.surveyResponses).toHaveLength(before + 1)
    expect(demo.surveyResponses.at(-1)!.id).toBe(id)
    expect(state.serverCalls).toBe(0)
  })

  it('추천 기록은 저장하지 않는다 (DB 가 없다)', async () => {
    await writes.insertRecommendationLog({
      sessionId: 'ls-2',
      responseId: null,
      source: 'rule',
      stage: 'same',
      items: [],
      model: null,
      latencyMs: null,
      inputTokens: null,
      outputTokens: null,
      error: null,
    })
    expect(state.serverCalls).toBe(0)
    expect(state.inserts).toHaveLength(0)
  })
})
