import { beforeEach, describe, expect, it } from 'vitest'
import * as demo from '@/data/demo'
import type { Dataset } from '@/lib/db/dataset'
import {
  generateSessionPlan,
  mergeLlmDraft,
  pickField,
  ruleDraft,
  supplyCount,
  unmetInterest,
} from '@/lib/ai/session-plan'
import type { SessionPlanInput } from '@/lib/ai/session-plan'

/**
 * AI 회차 기획 도우미 (ADR-021).
 *
 * 여기서 반드시 지켜지는 것:
 * - 관내에 공급이 없는 분야를 "열 수 있다"고 제안하지 않는다
 * - LLM 이 무엇을 돌려주든 공급 수치와 미충족 수요는 규칙 값이 남는다
 * - LLM 이 없어도 담당자가 볼 숫자는 그대로 나온다
 */

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

const org = demo.organizations[0]!

function input(over: Partial<SessionPlanInput> = {}): SessionPlanInput {
  return {
    orgId: org.id,
    regionCode: org.region_code,
    gradeBand: 'middle',
    expectedStudents: 30,
    durationMinutes: 50,
    purpose: null,
    ...over,
  }
}

describe('공급 확정 — 열 수 없는 회차를 제안하지 않는다', () => {
  it('제안 분야는 반드시 관내 공급이 1 이상이다', () => {
    const supply = supplyCount(ds, org.region_code)
    const field = pickField(ds, org.id, supply)
    if (field) expect(supply[field]).toBeGreaterThan(0)
  })

  it('공급이 0인 분야는 후보가 될 수 없다', () => {
    // 공급을 전부 0으로 만들면 후보가 사라진다.
    const empty = Object.fromEntries(Object.keys(supplyCount(ds, org.region_code)).map((f) => [f, 0]))
    expect(pickField(ds, org.id, empty)).toBeNull()
  })

  it('공급이 하나도 없으면 제안 대신 미충족 수요로 안내한다', () => {
    const noSupply: Dataset = { ...ds, instructors: [] }
    const draft = ruleDraft(noSupply, input())
    expect(draft.suggested_field).toBeNull()
    expect(draft.suggested_title).toBe('')
    expect(draft.rationale).toContain('공급이 아직 없습니다')
  })

  it('미충족 수요는 공급 0인 분야만 센다', () => {
    const supply = supplyCount(ds, org.region_code)
    for (const u of unmetInterest(ds, org.id, supply)) {
      expect(supply[u.field] ?? 0, u.field).toBe(0)
      expect(u.interest_count).toBeGreaterThan(0)
    }
  })

  it('다른 기관의 관심을 끌어오지 않는다', () => {
    const supply = supplyCount(ds, org.region_code)
    const mine = unmetInterest(ds, org.id, supply)
    const other = unmetInterest(ds, 'org-없음', supply)
    expect(other).toEqual([])
    expect(mine.length).toBeGreaterThanOrEqual(0)
  })
})

describe('LLM 병합 — 숫자는 규칙이 지킨다', () => {
  const base = ruleDraft(ds, input())

  it('LLM 이 공급 수치나 미충족 수요를 바꿀 수 없다', () => {
    const merged = mergeLlmDraft(base, {
      rationale: '정상 문장입니다.',
      supply_by_field: { 드론: 999 },
      unmet: [{ field: '뷰티', interest_count: 9999 }],
      suggested_field: 'VR·AR',
    })
    expect(merged.supply_by_field).toEqual(base.supply_by_field)
    expect(merged.unmet).toEqual(base.unmet)
    expect(merged.suggested_field).toBe(base.suggested_field)
  })

  it('연락처가 섞인 문장은 버리고 규칙 문장을 쓴다', () => {
    const merged = mergeLlmDraft(base, {
      rationale: '문의는 010-1234-5678 로 주세요',
      instructor_requirements: ['http://example.com 참고'],
    })
    expect(merged.rationale).toBe(base.rationale)
    expect(merged.instructor_requirements).toEqual(base.instructor_requirements)
  })

  it('배열이 아니거나 비어 있으면 규칙 값이 남는다', () => {
    const merged = mergeLlmDraft(base, { instructor_requirements: 'not an array', preparations: [] })
    expect(merged.instructor_requirements).toEqual(base.instructor_requirements)
    expect(merged.preparations).toEqual(base.preparations)
  })

  it('객체가 아닌 응답은 통째로 무시한다', () => {
    expect(mergeLlmDraft(base, null)).toEqual(base)
    expect(mergeLlmDraft(base, '문자열')).toEqual(base)
  })
})

describe('전체 — 키가 없을 때 (E-06)', () => {
  beforeEach(() => {
    delete process.env.ANTHROPIC_API_KEY
  })

  it('API 키가 없어도 담당자가 볼 숫자는 그대로 나온다', async () => {
    const draft = await generateSessionPlan(ds, input())
    expect(draft.source).toBe('rule')
    expect(draft.rationale.length).toBeGreaterThan(5)
    expect(Object.keys(draft.supply_by_field).length).toBeGreaterThan(0)
  })

  it('제안에 연락처·업체명이 섞이지 않는다', async () => {
    const text = JSON.stringify(await generateSessionPlan(ds, input()))
    expect(text).not.toMatch(/\d{2,3}-\d{3,4}-\d{4}/)
    expect(text).not.toMatch(/@[a-z]+\./i)
  })
})
