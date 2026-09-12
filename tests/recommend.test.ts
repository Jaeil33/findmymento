import { beforeEach, describe, expect, it } from 'vitest'
import * as demo from '@/data/demo'
import type { Dataset } from '@/lib/db/dataset'
import { recommend } from '@/lib/ai/recommend'

const ds: Dataset = {
  organizations: demo.organizations,
  orgMembers: demo.orgMembers,
  providers: demo.providers,
  instructors: demo.instructors,
  instructorVerifications: demo.instructorVerifications,
  programs: demo.programs,
  lectureSessions: demo.lectureSessions,
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

const base = {
  regionCode: '41210',
  gradeBand: 'middle' as const,
  sessionField: '드론' as const,
  followupIntent: 4,
  wantToLearn: null,
  desiredJob: null,
}

describe('추천 — LLM 키가 없을 때 (E-06 · ADR-004)', () => {
  beforeEach(() => {
    delete process.env.ANTHROPIC_API_KEY
  })

  it('키가 없어도 규칙 기반으로 결과를 준다', async () => {
    const r = await recommend(ds, { ...base, interestFields: ['드론'] })
    expect(r.source).toBe('rule')
    expect(r.items.length).toBeGreaterThan(0)
  })

  it('모든 카드에 읽을 수 있는 이유 한 줄이 있다', async () => {
    const r = await recommend(ds, { ...base, interestFields: ['드론'] })
    for (const item of r.items) {
      expect(item.reason.length).toBeGreaterThan(5)
      expect(item.reason).not.toContain('undefined')
      expect(item.reason).not.toMatch(/AI가|인공지능이 분석/)
    }
  })

  it('최대 5장까지만 준다', async () => {
    const r = await recommend(ds, { ...base, interestFields: ['드론', '3D 모델링·프린팅'] })
    expect(r.items.length).toBeLessThanOrEqual(5)
  })

  it('가까운 지역이 먼저 온다', async () => {
    const r = await recommend(ds, { ...base, interestFields: ['드론'] })
    const distances = r.items.map((i) => i.distance)
    expect([...distances]).toEqual([...distances].sort((a, b) => a - b))
  })
})

describe('추천 후보는 규칙이 확정한다', () => {
  it('승인된 강사의 프로그램만 후보가 된다 (E-11)', async () => {
    const r = await recommend(ds, { ...base, interestFields: ['드론', 'VR·AR'] })
    for (const item of r.items) expect(item.instructor.status).toBe('approved')
  })

  it('대상 학년이 맞지 않는 프로그램은 제외된다', async () => {
    const r = await recommend(ds, { ...base, gradeBand: 'elementary', interestFields: ['드론'] })
    for (const item of r.items) expect(item.program.target_grades).toContain('elementary')
  })

  it('공급이 없는 분야는 미충족 수요로 돌려준다 (E-16)', async () => {
    const r = await recommend(ds, { ...base, interestFields: ['VR·AR'] })
    expect(r.items).toEqual([])
    expect(r.stage).toBe('none')
    expect(r.unmetFields).toContain('VR·AR')
  })

  it('"아직 잘 모르겠어요"만 고르면 회차 분야로 추천한다', async () => {
    const r = await recommend(ds, { ...base, interestFields: ['아직 잘 모르겠어요'] })
    expect(r.items.length).toBeGreaterThan(0)
    expect(r.items.every((i) => i.program.field === '드론')).toBe(true)
  })

  it('누적 이력이 있으면 후보 폭이 넓어진다 (E-18)', async () => {
    const withoutHistory = await recommend(ds, { ...base, interestFields: ['드론'] })
    const withHistory = await recommend(ds, {
      ...base,
      interestFields: ['드론'],
      history: ['3D 모델링·프린팅'],
    })
    const fieldsWith = new Set(withHistory.items.map((i) => i.program.field))
    expect(fieldsWith.size).toBeGreaterThanOrEqual(
      new Set(withoutHistory.items.map((i) => i.program.field)).size,
    )
  })
})

describe('추천 결과에 없어야 하는 것', () => {
  it('연락처·사진·평점 필드가 없다', async () => {
    const r = await recommend(ds, { ...base, interestFields: ['드론'] })
    const serialized = JSON.stringify(r.items)
    expect(serialized).not.toContain('phone')
    expect(serialized).not.toContain('rating')
    expect(serialized).not.toContain('photo')
    expect(serialized).not.toContain('@example.invalid')
  })

  it('강사 연락처 테이블을 전혀 건드리지 않는다', async () => {
    const r = await recommend(ds, { ...base, interestFields: ['드론'] })
    for (const contact of demo.instructorContacts) {
      expect(JSON.stringify(r.items)).not.toContain(contact.email)
    }
  })
})
