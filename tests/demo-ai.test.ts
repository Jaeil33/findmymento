// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as demo from '@/data/demo'
import type { Dataset } from '@/lib/db/dataset'

/** SDK 는 가짜다. 시연 모드에서는 **한 번도 불리면 안 된다.** */
const createMock = vi.fn()
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: (...args: unknown[]) => createMock(...args) }
  },
}))

const { demoAiEnabled, demoInquiryMessage, demoResultReport } = await import('@/lib/ai/demo-writer')
const {
  buildLlmPayload: inquiryPayload,
  generateInquiryAssist,
  ruleInquiryAssist,
} = await import('@/lib/ai/inquiry-assist')
const { buildLlmPayload, generateResultReport, ruleResultReport } = await import('@/lib/ai/result-report')
const { generateFollowupPlan, ruleFollowupPlan } = await import('@/lib/ai/followup-plan')
const { generateDebrief, ruleDebrief } = await import('@/lib/ai/session-debrief')
const { generateSessionPlan, ruleDraft } = await import('@/lib/ai/session-plan')
const { generateLessonPlan } = await import('@/lib/ai/lesson-plan')
const { recommend } = await import('@/lib/ai/recommend')

/**
 * 시연용 AI 응답 (ADR-025).
 *
 * 여기서 반드시 지켜지는 것:
 * - 데모 데이터 모드 + 키 없음 + DEMO_AI≠off 일 때만 켜진다. 실 DB 배포에서는 절대 켜지지 않는다
 * - 시연 문장도 실제 LLM 응답과 **같은 가드**를 통과한다 — 숫자·후보·항목은 규칙 값 그대로다
 * - 시연 문장이 가드에 걸려 조용히 버려지지 않는다 (걸리면 시연 화면이 규칙 문장으로 돌아간다)
 * - 표본 5건 미만 회차는 시연 모드에서도 규칙 결과다
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

const SUFFICIENT = ['ls-0', 'ls-1', 'ls-2', 'ls-4'].filter(
  (id) => ruleResultReport(ds, id)?.sample_sufficient,
)
const names = [...demo.instructors.map((i) => i.name), ...demo.providers.map((p) => p.name), ...demo.organizations.map((o) => o.name)]
const CONTACT_RE = /010-|@|https?:\/\//

beforeEach(() => {
  delete process.env.ANTHROPIC_API_KEY
  delete process.env.NEXT_PUBLIC_SUPABASE_URL
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  process.env.DEMO_AI = 'on'
  createMock.mockReset()
})

afterEach(() => {
  process.env.DEMO_AI = 'off'
  delete process.env.ANTHROPIC_API_KEY
  delete process.env.NEXT_PUBLIC_SUPABASE_URL
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
})

describe('켜지는 조건', () => {
  it('데모 데이터 모드 + 키 없음이면 켜진다', () => {
    expect(demoAiEnabled()).toBe(true)
  })

  it('DEMO_AI=off 면 꺼진다', () => {
    process.env.DEMO_AI = 'off'
    expect(demoAiEnabled()).toBe(false)
  })

  it('LLM 키가 있으면 꺼진다 — 실제 LLM 이 우선이다', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-test'
    expect(demoAiEnabled()).toBe(false)
  })

  it('실 DB(Supabase)에 붙은 배포에서는 꺼진다', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon'
    expect(demoAiEnabled()).toBe(false)
    const draft = await generateResultReport(ds, 'ls-1')
    expect(draft?.source).toBe('rule')
  })
})

describe('결과보고서 (기능 4)', () => {
  it('데모 회차 중 표본이 충분한 회차가 있다', () => {
    expect(SUFFICIENT.length).toBeGreaterThan(0)
  })

  it.each(SUFFICIENT)('%s — 시연 문장이 가드를 전부 통과해 채택된다', async (id) => {
    const rule = ruleResultReport(ds, id)!
    const raw = demoResultReport(buildLlmPayload(ds, rule)) as Record<string, unknown>
    const draft = (await generateResultReport(ds, id))!

    expect(draft.source).toBe('llm')
    expect(draft.outcomes).toEqual(raw.outcomes)
    expect(draft.improvements).toEqual(raw.improvements)
    expect(draft.next_steps).toEqual((raw.next_steps as string[]).slice(0, 4))
    expect(draft.record_reference).toBe(raw.record_reference)
    if (rule.student_voice.length > 0) expect(draft.student_voice).toEqual(raw.student_voice)
    expect(draft.record_reference.endsWith('함.')).toBe(true)
  })

  it.each(SUFFICIENT)('%s — 숫자·개요·고지문은 규칙 값 그대로다', async (id) => {
    const rule = ruleResultReport(ds, id)!
    const draft = (await generateResultReport(ds, id))!
    expect(draft.metrics).toEqual(rule.metrics)
    expect(draft.overview).toEqual(rule.overview)
    expect(draft.notices).toEqual(rule.notices)
  })

  it('SDK 를 부르지 않는다', async () => {
    await generateResultReport(ds, 'ls-1')
    expect(createMock).not.toHaveBeenCalled()
  })

  it('응답 0건 회차(ls-3)는 시연 모드에서도 규칙 결과다', async () => {
    const draft = (await generateResultReport(ds, 'ls-3'))!
    expect(draft.source).toBe('rule')
    expect(draft.student_voice).toEqual([])
  })

  it.each(SUFFICIENT)('%s — 문장에 이름·연락처가 없다', async (id) => {
    const d = (await generateResultReport(ds, id))!
    const text = [...d.outcomes, ...d.student_voice, ...d.improvements, ...d.next_steps, d.record_reference].join(' ')
    expect(CONTACT_RE.test(text)).toBe(false)
    for (const n of names) expect(text).not.toContain(n)
  })
})

describe('후속 과정 제안 (기능 5)', () => {
  const eligible = SUFFICIENT.filter((id) => {
    const r = ruleFollowupPlan(ds, id)
    return r?.eligible && r.supply_status === 'available'
  })

  it('제안 가능한 데모 회차가 있다', () => {
    expect(eligible.length).toBeGreaterThan(0)
  })

  it.each(eligible)('%s — 제목·차시·문안이 모두 시연 문장으로 바뀐다', async (id) => {
    const rule = ruleFollowupPlan(ds, id)!
    const draft = (await generateFollowupPlan(ds, id))!
    expect(draft.source).toBe('llm')
    expect(draft.suggested_title).not.toBe(rule.suggested_title)
    expect(draft.outline).toHaveLength(rule.outline.length)
    expect(draft.outline).not.toEqual(rule.outline)
    expect(draft.request_message).not.toBe(rule.request_message)
    expect(draft.request_message.length).toBeLessThanOrEqual(400)
  })

  it.each(eligible)('%s — 수요·후보·고지문은 규칙 값 그대로이고 모집 단어가 없다', async (id) => {
    const rule = ruleFollowupPlan(ds, id)!
    const draft = (await generateFollowupPlan(ds, id))!
    expect(draft.candidates).toEqual(rule.candidates)
    expect(draft.demand_count).toBe(rule.demand_count)
    expect(draft.notices).toEqual(rule.notices)
    const text = [draft.suggested_title, ...draft.outline, draft.request_message].join(' ')
    for (const w of ['수강료', '정원', '결제', '모집', '신청서']) expect(text).not.toContain(w)
    for (const n of names) expect(text).not.toContain(n)
    expect(CONTACT_RE.test(text)).toBe(false)
  })
})

describe('수업 회고 (기능 6)', () => {
  it.each(SUFFICIENT)('%s — 잘 된 점·요약이 시연 문장으로 바뀌고 지표는 그대로다', async (id) => {
    const rule = ruleDebrief(ds, id)!
    const draft = (await generateDebrief(ds, id))!
    expect(draft.source).toBe('llm')
    expect(draft.metrics).toEqual(rule.metrics)
    expect(draft.went_well).not.toEqual(rule.went_well)
    expect(draft.went_well.length).toBe(rule.went_well.length)
    expect(draft.change_next.length).toBe(rule.change_next.length)
    if (rule.change_next.length > 0) expect(draft.change_next).not.toEqual(rule.change_next)
    expect(draft.school_summary).not.toBe(rule.school_summary)
    expect(draft.school_summary.length).toBeLessThanOrEqual(400)
  })

  it.each(SUFFICIENT)('%s — 강사 평가 표현·이름이 없다', async (id) => {
    const d = (await generateDebrief(ds, id))!
    const text = [...d.went_well, ...d.change_next, d.school_summary].join(' ')
    for (const w of ['점수', '등급', '순위', '평점']) expect(text).not.toContain(w)
    for (const n of names) expect(text).not.toContain(n)
  })
})

describe('회차 기획 (기능 3)', () => {
  it('근거 문장·조건·준비물이 시연 문장으로 바뀌고 공급 숫자는 그대로다', async () => {
    const org = demo.organizations.find((o) => o.id === 'org-1')!
    const input = {
      orgId: org.id,
      regionCode: org.region_code,
      gradeBand: 'middle' as const,
      expectedStudents: 30,
      durationMinutes: 90,
      purpose: null,
    }
    const rule = ruleDraft(ds, input)
    const draft = await generateSessionPlan(ds, input)
    expect(draft.source).toBe('llm')
    expect(draft.rationale).not.toBe(rule.rationale)
    expect(draft.suggested_field).toBe(rule.suggested_field)
    expect(draft.supply_by_field).toEqual(rule.supply_by_field)
    expect(draft.unmet).toEqual(rule.unmet)
  })
})

describe('수업 설계 (기능 2)', () => {
  it('ls-1 교안의 문장이 바뀌고 단계·시간·QR 안내는 유지된다', async () => {
    const session = demo.lectureSessions.find((s) => s.id === 'ls-1')!
    process.env.DEMO_AI = 'off'
    const rule = await generateLessonPlan(ds, session)
    process.env.DEMO_AI = 'on'
    const draft = await generateLessonPlan(ds, session)

    expect(draft.source).toBe('llm')
    expect(draft.skeleton.steps.map((s) => [s.phase, s.title, s.minutes])).toEqual(
      rule.skeleton.steps.map((s) => [s.phase, s.title, s.minutes]),
    )
    expect(draft.skeleton.steps.map((s) => s.base)).not.toEqual(rule.skeleton.steps.map((s) => s.base))
    expect(draft.skeleton.steps.at(-1)!.base).toContain('QR')
    for (const step of draft.skeleton.steps) {
      expect(step.accommodations.map((a) => a.trait)).toEqual(session.class_traits)
    }
  })
})

describe('학생 추천 (기능 1)', () => {
  it('후보 집합은 규칙 그대로이고 이유 한 줄만 바뀐다', async () => {
    const input = {
      regionCode: '41210',
      gradeBand: 'middle' as const,
      sessionField: '드론' as const,
      followupIntent: 4,
      interestFields: ['드론'],
      wantToLearn: '드론으로 영상 찍는 법 더 배우고 싶어요',
      desiredJob: null,
    }
    process.env.DEMO_AI = 'off'
    const rule = await recommend(ds, input)
    process.env.DEMO_AI = 'on'
    const r = await recommend(ds, input)

    expect(r.source).toBe('llm')
    expect(new Set(r.items.map((i) => i.program.id))).toEqual(new Set(rule.items.map((i) => i.program.id)))
    expect(r.items.some((i) => i.reason.includes('영상'))).toBe(true)
    for (const i of r.items) {
      expect(i.reason.length).toBeLessThanOrEqual(120)
      expect(CONTACT_RE.test(i.reason)).toBe(false)
    }
    expect(createMock).not.toHaveBeenCalled()
  })
})

describe('보호자 문의 도우미 (기능 7)', () => {
  const SITUATIONS = [
    '중학교 2학년 아들이에요. 이름은 민준이고 광명하안중학교 다녀요. 학교 드론 특강 듣고 영상 찍는 데 푹 빠졌어요. 주말에 다닐 수 있을까요?',
    '초등학생 딸이 3D 프린터로 피규어 만드는 걸 좋아해요. 처음 배우는 거라 잘 따라갈지 걱정돼요. 평일 방과후면 좋겠어요.',
    '고등학생인데 코딩으로 게임 만들고 싶대요. 방학 때 다닐 곳을 찾아요.',
    '아이가 VR 체험을 또 해 보고 싶어해요. 중학생입니다.',
    '특강 듣고 나서 뭔가 더 배우고 싶다고 하는데 뭘 좋아하는지는 잘 모르겠어요.',
  ]
  const inputOf = (situation: string) => ({ situation, regionCode: '41210', gradeBand: null, field: null })
  const digitsOutsideFields = (text: string) =>
    /\d/.test(['드론', '3D 모델링·프린팅', 'VR·AR', 'AI·코딩', '뷰티'].reduce((t, f) => t.split(f).join(' '), text))

  it.each(SITUATIONS)('%s — 시연 글이 가드를 통과해 채택된다', async (situation) => {
    const input = inputOf(situation)
    const rule = ruleInquiryAssist(ds, input)
    const raw = demoInquiryMessage(inquiryPayload(input, rule)) as { message: string }
    const draft = await generateInquiryAssist(ds, input)

    expect(draft.source).toBe('llm')
    expect(draft.message).toBe(raw.message)
    expect(draft.message).not.toBe(rule.message)
    expect(draft.message.length).toBeLessThanOrEqual(300)
  })

  it.each(SITUATIONS)('%s — 조건·프로그램·고지는 규칙 값 그대로이고 아이 정보·숫자가 없다', async (situation) => {
    const input = inputOf(situation)
    const rule = ruleInquiryAssist(ds, input)
    const draft = await generateInquiryAssist(ds, input)

    expect(draft.grade_band).toBe(rule.grade_band)
    expect(draft.field).toBe(rule.field)
    expect(draft.times).toEqual(rule.times)
    expect(draft.matches).toEqual(rule.matches)
    expect(draft.notices).toEqual(rule.notices)
    for (const raw of ['민준', '하안중학교']) expect(draft.message).not.toContain(raw)
    for (const n of names) expect(draft.message).not.toContain(n)
    expect(digitsOutsideFields(draft.message)).toBe(false)
    expect(CONTACT_RE.test(draft.message)).toBe(false)
    expect(createMock).not.toHaveBeenCalled()
  })
})
