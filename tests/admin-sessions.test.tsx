import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { Dataset } from '@/lib/db/dataset'
import { adminSessionRows, aiSummary, type RecommendationLogRow } from '@/lib/report/admin-session'
import { AdminResponseTable } from '@/components/report/AdminResponseTable'

/**
 * 운영자 — 수업별 설문 전체 자료.
 * 응답 하나하나(학년·만족도·후속 의향·관심 분야·자유서술·관심 직업·가능 시간)와
 * 그 학생에게 **실제로 보여 준** 카드·이유·AI 여부를 한 줄에 붙여 보여 준다.
 */

const response = (over: Record<string, unknown>) => ({
  id: 'r',
  session_id: 'ls-1',
  student_id: null,
  grade: { band: 'elementary', year: 5 },
  satisfaction: 5,
  followup_intent: 4,
  interest_fields: ['드론'],
  want_to_learn: null,
  desired_job: null,
  available_times: [],
  created_at: '2026-09-19T02:50:00Z',
  ...over,
})

const ds = {
  lectureSessions: [{ id: 'ls-1' }],
  programs: [{ id: 'p-1', title: '드론 심화반' }],
  surveyResponses: [
    response({ id: 'r2', created_at: '2026-09-19T02:51:30Z', grade: { band: 'middle', year: 1 } }),
    response({ id: 'r1', want_to_learn: '드론 레이싱', desired_job: '변호사', available_times: ['토요일 오전'] }),
    response({ id: 'r3', session_id: 'ls-other' }),
  ],
} as unknown as Dataset

const log = (over: Partial<RecommendationLogRow>): RecommendationLogRow => ({
  id: 'l',
  session_id: 'ls-1',
  response_id: 'r1',
  source: 'llm',
  stage: 'none',
  items: [],
  model: 'claude-opus-5',
  latency_ms: 4000,
  input_tokens: 1600,
  output_tokens: 200,
  error: null,
  created_at: '2026-09-19T02:50:05Z',
  ...over,
})

const logs = [
  log({
    items: [
      { career_id: 'legal-tech', reason: '변호사 꿈과 드론 규칙이 만나요.' },
      { career_id: 'drone-pilot', reason: '직접 띄워 보는 일이에요.' },
    ],
  }),
  log({ id: 'l2', response_id: 'r2', source: 'rule', items: [{ program_id: 'p-1', reason: '가까운 수업이에요.' }], latency_ms: 12000, input_tokens: null, output_tokens: null, error: 'timeout' }),
]

describe('adminSessionRows', () => {
  it('그 회차의 응답만, 시간순, 한국 시간으로', () => {
    const rows = adminSessionRows(ds, 'ls-1', logs)
    expect(rows.map((r) => r.id)).toEqual(['r1', 'r2'])
    expect(rows[0]!.time).toBe('11:50')
    expect(rows[0]!.grade).toBe('초등 5학년')
    expect(rows[1]!.grade).toBe('중등 1학년')
  })

  it('보여 준 카드를 직업·수업 이름과 이유로 붙인다', () => {
    const [r1, r2] = adminSessionRows(ds, 'ls-1', logs)
    expect(r1!.cards).toEqual([
      { kind: '진로', title: '기술 전문 변호사', reason: '변호사 꿈과 드론 규칙이 만나요.' },
      { kind: '진로', title: '드론 조종사', reason: '직접 띄워 보는 일이에요.' },
    ])
    expect(r1!.source).toBe('llm')
    expect(r2!.cards).toEqual([{ kind: '수업', title: '드론 심화반', reason: '가까운 수업이에요.' }])
    expect(r2!.error).toBe('timeout')
  })

  it('추천 기록이 없는 응답도 빠뜨리지 않는다', () => {
    const rows = adminSessionRows(ds, 'ls-1', [])
    expect(rows).toHaveLength(2)
    expect(rows[0]!.cards).toEqual([])
    expect(rows[0]!.source).toBeNull()
  })
})

describe('aiSummary', () => {
  it('건수·AI 비율·평균 시간·예상 비용', () => {
    const s = aiSummary(logs)
    expect(s).toMatchObject({ total: 2, llm: 1, rule: 1, avgLatencyMs: 8000, inputTokens: 1600, outputTokens: 200 })
    expect(s.usd).toBeCloseTo((1600 * 5 + 200 * 25) / 1_000_000)
    expect(s.errors).toEqual({ timeout: 1 })
  })
})

describe('AdminResponseTable', () => {
  it('응답마다 꿈·배우고 싶은 것·카드·이유·AI 여부가 보인다', () => {
    render(<AdminResponseTable rows={adminSessionRows(ds, 'ls-1', logs)} />)
    expect(screen.getByText('변호사')).toBeInTheDocument()
    expect(screen.getByText('드론 레이싱')).toBeInTheDocument()
    expect(screen.getByText('기술 전문 변호사')).toBeInTheDocument()
    expect(screen.getByText('변호사 꿈과 드론 규칙이 만나요.')).toBeInTheDocument()
    expect(screen.getByText('드론 심화반')).toBeInTheDocument()
    expect(screen.getAllByText('AI').length).toBe(1)
    expect(screen.getByText('규칙 (timeout)')).toBeInTheDocument()
  })

  it('응답이 없으면 빈 안내', () => {
    render(<AdminResponseTable rows={[]} />)
    expect(screen.getByText('아직 응답이 없어요.')).toBeInTheDocument()
  })
})
