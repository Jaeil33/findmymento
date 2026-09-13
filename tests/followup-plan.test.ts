import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as demo from '@/data/demo'
import type { Dataset } from '@/lib/db/dataset'
import { MIN_AGGREGATE_RESPONSES, containsAny, numbersWithin, sanitizeText } from '@/lib/ai/guard'
import {
  followupCandidates,
  followupDemand,
  generateFollowupPlan,
  mergeLlmFollowupPlan,
  ruleFollowupPlan,
} from '@/lib/ai/followup-plan'
import { allRegions, regionDistance } from '@/lib/region'
import { FIELDS, type FollowupPlanDraft, type Instructor, type SurveyResponse } from '@/types/domain'

/**
 * AI 후속 과정 제안 + 섭외 요청 문안 (ADR-024 기능 5).
 *
 * 여기서 반드시 지켜지는 것:
 * - 수요 숫자·분야·강사 후보는 규칙이 확정하고 LLM 이 바꿀 수 없다
 * - 후보 정렬은 거리 → 이름뿐이다. 소속 업체·구독 여부를 반영하지 않는다 (ADR-009)
 * - 후보에 연락처가 없다 (CLAUDE.md CRITICAL)
 * - 응답 5건 미만·후속 의향 응답 0건이면 제안하지 않고 LLM 도 부르지 않는다 (ADR-018)
 * - 공급 0이면 후보·문안 없이 미충족 수요로 안내한다
 * - 모집·정원·수강료·결제·신청서를 다루는 문장은 버린다 (ADR-023)
 * - 아무것도 저장하지 않는다 (ADR-024)
 *
 * Anthropic SDK 는 가짜로 바꾼다. 실제 API 를 호출하지 않는다.
 */

const createMock = vi.fn()

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: (...args: unknown[]) => createMock(...args) }
  },
}))

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

const NOTICE_DRAFT = '초안입니다. 내용을 확인한 뒤 섭외 요청 화면에서 직접 보내세요.'
const NOTICE_NO_ENROLLMENT =
  '플랫폼은 학생 모집·정원·수강료를 다루지 않습니다. 참여 학생 안내와 운영은 기관이 합니다.'
const NOTICE_NO_SUPPLY =
  '관내·인접 지역에 이 분야 승인 강사가 없습니다. 미충족 수요로 남으며, 신규 강사 발굴의 근거가 됩니다.'

const ENROLLMENT_WORDS = ['수강료', '정원', '결제', '모집', '신청서']

const LS1 = ds.lectureSessions.find((s) => s.id === 'ls-1')!
const ORG1 = ds.organizations.find((o) => o.id === LS1.org_id)!

/** 그 회차의 응답을 앞에서부터 keep 건만 남긴다. */
function keepResponses(sessionId: string, keep: number): Dataset {
  let seen = 0
  return {
    ...ds,
    surveyResponses: ds.surveyResponses.filter((r) => r.session_id !== sessionId || seen++ < keep),
  }
}

/** 그 회차의 응답을 통째로 바꾼다. */
function replaceResponses(sessionId: string, rows: SurveyResponse[], base: Dataset = ds): Dataset {
  return {
    ...base,
    surveyResponses: [...base.surveyResponses.filter((r) => r.session_id !== sessionId), ...rows],
  }
}

function row(i: number, over: Partial<SurveyResponse> = {}): SurveyResponse {
  return {
    id: `t-ls-1-${i}`,
    session_id: 'ls-1',
    student_id: null,
    grade: { band: 'middle', year: 2 },
    satisfaction: 4,
    followup_intent: 3,
    interest_fields: ['드론'],
    want_to_learn: null,
    desired_job: null,
    available_times: [],
    created_at: '2026-09-01T10:00:00+09:00',
    ...over,
  }
}

function rows(n: number, over: Partial<SurveyResponse> = {}, start = 0): SurveyResponse[] {
  return Array.from({ length: n }, (_, k) => row(start + k, over))
}

function instructor(id: string, over: Partial<Instructor> = {}): Instructor {
  return {
    id,
    provider_id: null,
    name: id,
    region_code: ORG1.region_code,
    fields: ['드론'],
    bio: '',
    career: [],
    status: 'approved',
    ...over,
  }
}

/** 모듈 안의 가드 입력과 같은 규칙으로 만든다: 허용 숫자 · 모든 승인 강사명 + 업체명 + 발주 기관명. */
function ctxOf(d: Dataset, draft: FollowupPlanDraft) {
  const session = d.lectureSessions.find((s) => s.id === draft.session_id)!
  const org = d.organizations.find((o) => o.id === session.org_id)!
  return {
    allowed: [
      draft.response_count,
      draft.demand_count,
      draft.field_interest_count,
      session.duration_minutes,
      1,
      2,
      3,
      4,
      MIN_AGGREGATE_RESPONSES,
    ],
    banned: [
      ...d.instructors.filter((i) => i.status === 'approved').map((i) => i.name),
      ...d.providers.map((p) => p.name),
      org.name,
    ],
  }
}

function allNames(d: Dataset): string[] {
  return [...d.instructors.map((i) => i.name), ...d.providers.map((p) => p.name), ...d.organizations.map((o) => o.name)]
}

const llmText = (obj: unknown) => ({ content: [{ type: 'text', text: JSON.stringify(obj) }] })

const OK_TITLE = '드론 항공촬영 심화 과정'
const OK_OUTLINE = [
  '1차시 · 드론 비행 원리와 안전 수칙',
  '2차시 · 항공촬영 구도 실습',
  '3차시 · 모둠별 우리 동네 영상 만들기',
  '4차시 · 영상 발표와 드론 관련 직업 탐색',
]
const OK_MESSAGE =
  '안녕하세요. 저희 기관 특강 이후 더 배우고 싶다는 응답을 바탕으로 드론 후속 과정 4차시를 검토하고 있습니다. 진행 가능 여부와 일정을 회신해 주시면 감사하겠습니다.'

beforeEach(() => {
  delete process.env.ANTHROPIC_API_KEY
  createMock.mockReset()
})

afterEach(() => {
  delete process.env.ANTHROPIC_API_KEY
})

describe('수요 — 후속 의향 3점 이상 응답만 센다', () => {
  it('데모 ls-1: 전체·high 응답 수가 원본과 같고 분야 1위는 신산업 분야다', () => {
    const all = ds.surveyResponses.filter((r) => r.session_id === 'ls-1')
    const high = all.filter((r) => r.followup_intent >= 3)
    const d = followupDemand(ds, 'ls-1')!

    expect(d.total).toBe(all.length)
    expect(d.high).toBe(high.length)
    expect(FIELDS as readonly string[]).toContain(d.field)
    expect(d.fieldCount).toBe(high.filter((r) => r.interest_fields.includes(d.field!)).length)
    expect(d.topTime).not.toBe('잘 모르겠어요')
  })

  it('후속 의향 1·2 응답의 분야는 세지 않는다', () => {
    const d = replaceResponses('ls-1', [
      ...rows(3, { interest_fields: ['VR·AR'] }),
      ...rows(6, { followup_intent: 2, interest_fields: ['드론'] }, 3),
    ])
    expect(followupDemand(d, 'ls-1')).toEqual({
      total: 9,
      high: 3,
      field: 'VR·AR',
      fieldCount: 3,
      topTime: null,
    })
  })

  it('동률이면 가나다순이다 — 들어온 순서와 무관하다', () => {
    const d = replaceResponses('ls-1', [
      ...rows(2, { interest_fields: ['뷰티'] }),
      ...rows(2, { interest_fields: ['드론'] }, 2),
    ])
    expect(followupDemand(d, 'ls-1')!.field).toBe('드론')
  })

  it("'아직 잘 모르겠어요'와 목록 밖 값은 분야로 세지 않는다", () => {
    const d = replaceResponses('ls-1', [
      ...rows(3, { interest_fields: ['아직 잘 모르겠어요'] }),
      ...rows(2, { interest_fields: ['요리'] }, 3),
      row(5, { interest_fields: ['드론'] }),
    ])
    const demand = followupDemand(d, 'ls-1')!
    expect(demand.field).toBe('드론')
    expect(demand.fieldCount).toBe(1)
  })

  it("참여 가능 시간 1위는 high 응답에서만, '잘 모르겠어요'는 빼고 센다", () => {
    const d = replaceResponses('ls-1', [
      ...rows(2, { available_times: ['토요일'] }),
      ...rows(3, { available_times: ['잘 모르겠어요'] }, 2),
      ...rows(5, { followup_intent: 1, available_times: ['평일 방과후'] }, 5),
    ])
    expect(followupDemand(d, 'ls-1')!.topTime).toBe('토요일')
  })

  it('없는 회차는 null', () => {
    expect(followupDemand(ds, 'ls-없음')).toBeNull()
  })
})

describe('강사 후보 — 규칙이 고른다, 거리 → 이름 (ADR-009)', () => {
  it('데모 ls-1: 모두 그 분야 승인 강사이고 2-hop 이내, 거리 오름차순, 최대 3명이다', () => {
    const draft = ruleFollowupPlan(ds, 'ls-1')!
    expect(draft.eligible).toBe(true)
    expect(draft.supply_status).toBe('available')
    expect(draft.candidates.length).toBeGreaterThan(0)
    expect(draft.candidates.length).toBeLessThanOrEqual(3)

    for (const c of draft.candidates) {
      const ins = ds.instructors.find((i) => i.id === c.instructor_id)!
      expect(ins.status).toBe('approved')
      expect(ins.fields as readonly string[]).toContain(draft.field)
      expect(c.distance).toBeLessThanOrEqual(2)
      expect(c.distance).toBe(regionDistance(ORG1.region_code, ins.region_code))
      expect(c.name).toBe(ins.name)
    }
    for (let i = 1; i < draft.candidates.length; i += 1) {
      const a = draft.candidates[i - 1]!
      const b = draft.candidates[i]!
      expect(a.distance <= b.distance).toBe(true)
      if (a.distance === b.distance) expect(a.name.localeCompare(b.name, 'ko')).toBeLessThanOrEqual(0)
    }
  })

  it('후보 객체에는 id·이름·지역·거리만 있고 연락처 키가 없다', () => {
    for (const c of ruleFollowupPlan(ds, 'ls-1')!.candidates) {
      expect(Object.keys(c).sort()).toEqual(['distance', 'instructor_id', 'name', 'region_label'])
      expect(JSON.stringify(c)).not.toMatch(/phone|email|contact/i)
    }
  })

  it('중립성: 거리가 같으면 소속 업체와 무관하게 이름순이다', () => {
    const a = instructor('in-a', { name: '가람', provider_id: null })
    const b = instructor('in-b', { name: '나래', provider_id: 'pv-1' })
    const order = (list: Instructor[]) =>
      followupCandidates({ ...ds, instructors: list }, ORG1.id, '드론').map((c) => c.name)

    expect(order([b, a])).toEqual(['가람', '나래'])
    // 업체를 뒤바꿔도 순서가 같다.
    expect(
      order([
        { ...b, provider_id: null },
        { ...a, provider_id: 'pv-1' },
      ]),
    ).toEqual(['가람', '나래'])
  })

  it('가까운 강사가 이름보다 먼저다', () => {
    const neighbor = allRegions().find((r) => regionDistance(ORG1.region_code, r.code) === 1)!
    const near = instructor('in-near', { name: '하늘', region_code: ORG1.region_code })
    const far = instructor('in-far', { name: '가온', region_code: neighbor.code })
    const out = followupCandidates({ ...ds, instructors: [far, near] }, ORG1.id, '드론')
    expect(out.map((c) => [c.name, c.distance])).toEqual([
      ['하늘', 0],
      ['가온', 1],
    ])
  })

  it('미승인·2-hop 밖·다른 분야 강사는 후보가 아니고, 최대 3명이다', () => {
    const outside = allRegions().find((r) => regionDistance(ORG1.region_code, r.code) === 3)!
    const list = [
      instructor('in-p', { name: '가가', status: 'pending' }),
      instructor('in-s', { name: '가나', status: 'suspended' }),
      instructor('in-o', { name: '가다', region_code: outside.code }),
      instructor('in-v', { name: '가라', fields: ['VR·AR'] }),
      instructor('in-1', { name: '나나' }),
      instructor('in-2', { name: '다다' }),
      instructor('in-3', { name: '라라' }),
      instructor('in-4', { name: '마마' }),
    ]
    const out = followupCandidates({ ...ds, instructors: list }, ORG1.id, '드론')
    expect(out.map((c) => c.name)).toEqual(['나나', '다다', '라라'])
  })

  it('없는 기관이면 후보가 없다', () => {
    expect(followupCandidates(ds, 'org-없음', '드론')).toEqual([])
  })
})

describe('표본·수요 부족 — 제안하지 않는다 (ADR-018)', () => {
  it('응답 4건 회차는 eligible 이 아니고 수요·후보·문안이 비어 있다', () => {
    const small = keepResponses('ls-1', MIN_AGGREGATE_RESPONSES - 1)
    const draft = ruleFollowupPlan(small, 'ls-1')!
    expect(draft.eligible).toBe(false)
    expect(draft.response_count).toBe(4)
    expect(draft.demand_count).toBe(0)
    expect(draft.field).toBeNull()
    expect(draft.field_interest_count).toBe(0)
    expect(draft.top_time).toBeNull()
    expect(draft.candidates).toEqual([])
    expect(draft.request_message).toBe('')
    expect(draft.reason).toContain('4건')
    expect(draft.reason).toContain('5건 이상 모여야 후속 수요를 판단합니다')
    expect(draft.notices).toEqual([NOTICE_DRAFT, NOTICE_NO_ENROLLMENT])
  })

  it('응답 0건 회차도 같다 (E-24)', () => {
    const draft = ruleFollowupPlan(ds, 'ls-3')!
    expect(draft.eligible).toBe(false)
    expect(draft.response_count).toBe(0)
    expect(draft.candidates).toEqual([])
  })

  it('경계: 정확히 5건이면 판단한다', () => {
    const d = replaceResponses('ls-1', rows(MIN_AGGREGATE_RESPONSES))
    const draft = ruleFollowupPlan(d, 'ls-1')!
    expect(draft.eligible).toBe(true)
    expect(draft.reason).toBeNull()
    expect(draft.demand_count).toBe(5)
  })

  it('응답은 충분하지만 전원 후속 의향 1·2면 제안하지 않는다', () => {
    const d = replaceResponses('ls-1', [
      ...rows(4, { followup_intent: 1 }),
      ...rows(4, { followup_intent: 2 }, 4),
    ])
    const draft = ruleFollowupPlan(d, 'ls-1')!
    expect(draft.eligible).toBe(false)
    expect(draft.reason).toContain('더 배우고 싶다는 응답이 없습니다')
    expect(draft.demand_count).toBe(0)
    expect(draft.field).toBeNull()
    expect(draft.candidates).toEqual([])
    expect(draft.request_message).toBe('')
  })

  it("후속 의향 응답이 전부 '아직 잘 모르겠어요'면 분야를 정할 수 없어 제안하지 않는다", () => {
    const d = replaceResponses('ls-1', rows(6, { interest_fields: ['아직 잘 모르겠어요'] }))
    const draft = ruleFollowupPlan(d, 'ls-1')!
    expect(draft.eligible).toBe(false)
    expect(draft.reason).toContain('분야')
    expect(draft.field).toBeNull()
    expect(draft.candidates).toEqual([])
    expect(draft.request_message).toBe('')
  })

  it('키가 있어도 제안하지 않는 회차는 LLM 을 부르지 않고, 병합도 무시한다', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    createMock.mockResolvedValue(llmText({ suggested_title: OK_TITLE, request_message: OK_MESSAGE }))
    const small = keepResponses('ls-1', MIN_AGGREGATE_RESPONSES - 1)

    const draft = await generateFollowupPlan(small, 'ls-1')
    expect(createMock).not.toHaveBeenCalled()
    expect(draft!.source).toBe('rule')
    expect(draft!.request_message).toBe('')

    const rule = ruleFollowupPlan(small, 'ls-1')!
    expect(
      mergeLlmFollowupPlan(rule, { suggested_title: OK_TITLE, request_message: OK_MESSAGE }, ctxOf(small, rule)),
    ).toEqual(rule)
  })
})

describe('공급 0 — 미충족 수요로 안내한다', () => {
  const noSupply: Dataset = { ...ds, instructors: [] }

  it('후보·문안 없이 공급 없음 고지문이 붙고, 수요 판단은 유지된다', () => {
    const draft = ruleFollowupPlan(noSupply, 'ls-1')!
    expect(draft.eligible).toBe(true)
    expect(draft.field).not.toBeNull()
    expect(draft.demand_count).toBeGreaterThan(0)
    expect(draft.supply_status).toBe('none')
    expect(draft.candidates).toEqual([])
    expect(draft.request_message).toBe('')
    expect(draft.notices).toEqual([NOTICE_DRAFT, NOTICE_NO_ENROLLMENT, NOTICE_NO_SUPPLY])
  })

  it('키가 있어도 LLM 을 부르지 않는다', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    createMock.mockResolvedValue(llmText({ request_message: OK_MESSAGE }))
    const draft = await generateFollowupPlan(noSupply, 'ls-1')
    expect(createMock).not.toHaveBeenCalled()
    expect(draft!.request_message).toBe('')
  })

  it('아무 기록도 만들지 않는다', async () => {
    const before = JSON.stringify(noSupply)
    await generateFollowupPlan(noSupply, 'ls-1')
    expect(JSON.stringify(noSupply)).toBe(before)
  })
})

describe('규칙 과정안·섭외 문안', () => {
  const draft = ruleFollowupPlan(ds, 'ls-1')!

  it('제목은 `${분야} 심화 과정`, 차시는 1~4차시이고 회당 시간이 원 회차 시수다', () => {
    expect(draft.suggested_title).toBe(`${draft.field} 심화 과정`)
    expect(draft.outline).toHaveLength(4)
    draft.outline.forEach((line, i) => {
      expect(line.startsWith(`${i + 1}차시`)).toBe(true)
      expect(line).toContain(`${LS1.duration_minutes}분`)
      expect(line.length).toBeLessThanOrEqual(60)
    })
    expect(draft.outline.join(' ')).toContain('소그룹 프로젝트')
    expect(draft.outline[3]).toContain('진로 탐색')
  })

  it('문안에 원 회차 제목·수요 숫자·4차시·회당 시간·회신 요청이 들어 있다', () => {
    const m = draft.request_message
    expect(m.length).toBeGreaterThan(0)
    expect(m.length).toBeLessThanOrEqual(400)
    expect(m).toContain(LS1.title)
    expect(m).toContain(`${draft.demand_count}건`)
    expect(m).toContain(`${draft.field_interest_count}건`)
    expect(m).toContain('4차시')
    expect(m).toContain(`${LS1.duration_minutes}분`)
    expect(m).toContain('저희 기관')
    expect(m).toContain('회신')
    if (draft.top_time) expect(m).toContain(draft.top_time)
  })

  it('규칙 문안에 발주 기관명·강사명·업체명·연락처·모집 관련 단어가 없다', () => {
    const m = draft.request_message
    for (const name of allNames(ds)) expect(m, name).not.toContain(name)
    expect(sanitizeText(m, 400)).toBe(m)
    expect(containsAny(m, ENROLLMENT_WORDS)).toBe(false)
  })

  it('규칙 문안도 숫자 가드를 통과한다 — 분야명 3D 의 3 은 숫자가 아니다', () => {
    for (const id of ['ls-1', 'ls-2', 'ls-4']) {
      const d = ruleFollowupPlan(ds, id)!
      expect(d.eligible, id).toBe(true)
      expect(numbersWithin(d.request_message, ctxOf(ds, d).allowed, FIELDS), id).toBe(true)
      for (const line of d.outline) expect(numbersWithin(line, ctxOf(ds, d).allowed, FIELDS), line).toBe(true)
    }
  })

  it("제목이 '특강'으로 끝나면 '특강'을 한 번만 쓴다", () => {
    const m = ruleFollowupPlan(ds, 'ls-4')!.request_message
    const title = ds.lectureSessions.find((s) => s.id === 'ls-4')!.title
    expect(title.endsWith('특강')).toBe(true)
    expect(m).toContain(`「${title}」에`)
    expect(m).not.toContain('특강」 특강')
  })

  it('참여 가능 시간 응답이 없으면 시간대 문장을 넣지 않는다', () => {
    const d = replaceResponses('ls-1', rows(6))
    const plan = ruleFollowupPlan(d, 'ls-1')!
    expect(plan.top_time).toBeNull()
    expect(plan.request_message).not.toContain('참여 가능 시간')
  })

  it('회차 제목에 기관명이 들어 있으면 문안에 제목을 싣지 않는다', () => {
    const titled: Dataset = {
      ...ds,
      lectureSessions: ds.lectureSessions.map((s) =>
        s.id === 'ls-1' ? { ...s, title: `${ORG1.name} 드론 특강` } : s,
      ),
    }
    const m = ruleFollowupPlan(titled, 'ls-1')!.request_message
    expect(m.length).toBeGreaterThan(0)
    expect(m).not.toContain(ORG1.name)
  })

  it('표본이 충분하고 공급이 있으면 고지문은 두 줄이다', () => {
    expect(draft.notices).toEqual([NOTICE_DRAFT, NOTICE_NO_ENROLLMENT])
    expect(draft.source).toBe('rule')
  })

  it('출력에 정원·수강료·신청·결제 필드가 없다 (ADR-023)', () => {
    expect(Object.keys(draft).join(' ')).not.toMatch(/capacity|seat|fee|price|tuition|payment|apply|enroll|application/i)
  })

  it('없는 회차는 null', () => {
    expect(ruleFollowupPlan(ds, 'ls-없음')).toBeNull()
  })
})

describe('병합 — LLM 은 제목·차시·문안 문장만 바꾼다', () => {
  const base = ruleFollowupPlan(ds, 'ls-1')!
  const ctx = ctxOf(ds, base)

  it('가드를 통과한 제목·차시·문안은 채택하고 source 는 llm 이다', () => {
    const merged = mergeLlmFollowupPlan(
      base,
      { suggested_title: OK_TITLE, outline: OK_OUTLINE, request_message: OK_MESSAGE },
      ctx,
    )
    expect(merged.suggested_title).toBe(OK_TITLE)
    expect(merged.outline).toEqual(OK_OUTLINE)
    expect(merged.request_message).toBe(OK_MESSAGE)
    expect(merged.source).toBe('llm')
  })

  it('LLM 이 후보를 추가하거나 분야·수요 숫자를 바꿔도 무시한다', () => {
    const merged = mergeLlmFollowupPlan(
      base,
      {
        session_id: 'ls-조작',
        eligible: false,
        reason: '조작',
        response_count: 999,
        demand_count: 999,
        field: 'VR·AR',
        field_interest_count: 999,
        top_time: '일요일',
        supply_status: 'none',
        candidates: [
          ...base.candidates,
          { instructor_id: 'in-7', name: '오세진', region_label: '광명시', distance: 0 },
        ],
        notices: [],
        suggested_title: OK_TITLE,
      },
      ctx,
    )
    expect(merged).toEqual({ ...base, suggested_title: OK_TITLE, source: 'llm' })
  })

  it('차시 개수가 규칙과 다르면 규칙 차시를 유지한다', () => {
    expect(mergeLlmFollowupPlan(base, { outline: OK_OUTLINE.slice(0, 3) }, ctx).outline).toEqual(base.outline)
    expect(
      mergeLlmFollowupPlan(base, { outline: [...OK_OUTLINE, '5차시 · 추가 활동'] }, ctx).outline,
    ).toEqual(base.outline)
  })

  it('차시 한 줄이라도 가드에 걸리면 차시 전체가 규칙 값이다', () => {
    const outline = [...OK_OUTLINE.slice(0, 3), '4차시 · 박서연 강사와 영상 발표']
    const merged = mergeLlmFollowupPlan(base, { outline }, ctx)
    expect(merged.outline).toEqual(base.outline)
    expect(merged.source).toBe('rule')
  })

  it('전화번호가 든 문안은 규칙 문안이 남는다', () => {
    const merged = mergeLlmFollowupPlan(
      base,
      { request_message: '저희 기관 후속 과정 섭외 요청입니다. 010-1234-5678 로 회신 부탁드립니다.' },
      ctx,
    )
    expect(merged.request_message).toBe(base.request_message)
  })

  it("'30명 모집' 문안은 규칙 문안이 남는다 — 숫자와 금지어 둘 다 걸린다", () => {
    const merged = mergeLlmFollowupPlan(
      base,
      { request_message: '드론 후속 과정 참여 학생을 30명 모집하려 합니다. 가능 여부를 회신해 주세요.' },
      ctx,
    )
    expect(merged.request_message).toBe(base.request_message)
  })

  it('숫자가 없어도 모집·정원·수강료·결제·신청서가 들어가면 버린다', () => {
    for (const word of ENROLLMENT_WORDS) {
      const s = `드론 후속 과정의 ${word} 관련 내용을 함께 정하고 싶습니다. 회신 부탁드립니다.`
      expect(mergeLlmFollowupPlan(base, { request_message: s }, ctx).request_message, word).toBe(
        base.request_message,
      )
    }
  })

  it('규칙에 없는 숫자가 든 제목은 버린다', () => {
    expect(mergeLlmFollowupPlan(base, { suggested_title: '드론 8주 심화 과정' }, ctx).suggested_title).toBe(
      base.suggested_title,
    )
  })

  it('강사명이 든 제목은 버린다 — 배정 강사가 아닌 승인 강사명도 막는다', () => {
    expect(
      mergeLlmFollowupPlan(base, { suggested_title: '박서연의 드론 심화 과정' }, ctx).suggested_title,
    ).toBe(base.suggested_title)
    expect(
      mergeLlmFollowupPlan(base, { suggested_title: '한지우 선생님 드론 심화 과정' }, ctx).suggested_title,
    ).toBe(base.suggested_title)
  })

  it('기관명·업체명이 든 문안은 버린다', () => {
    for (const name of [ORG1.name, '3DNFLY']) {
      const s = `${name} 드론 후속 과정 섭외 요청입니다. 회신 부탁드립니다.`
      expect(mergeLlmFollowupPlan(base, { request_message: s }, ctx).request_message, name).toBe(
        base.request_message,
      )
    }
  })

  it('길이 제한을 넘으면 버린다 — 제목 40자, 차시 60자, 문안 400자', () => {
    const merged = mergeLlmFollowupPlan(
      base,
      {
        suggested_title: '드'.repeat(41),
        outline: [...OK_OUTLINE.slice(0, 3), '드'.repeat(61)],
        request_message: '드'.repeat(401),
      },
      ctx,
    )
    expect(merged).toEqual(base)
  })

  it('null·문자열·배열·빈 값이면 규칙 초안이 그대로 남는다', () => {
    expect(mergeLlmFollowupPlan(base, null, ctx)).toEqual(base)
    expect(mergeLlmFollowupPlan(base, '문자열', ctx)).toEqual(base)
    expect(mergeLlmFollowupPlan(base, [OK_TITLE], ctx)).toEqual(base)
    expect(
      mergeLlmFollowupPlan(base, { suggested_title: '', outline: [], request_message: '' }, ctx),
    ).toEqual(base)
  })

  it('공급 0 초안에는 LLM 문안을 합치지 않는다', () => {
    const d: Dataset = { ...ds, instructors: [] }
    const rule = ruleFollowupPlan(d, 'ls-1')!
    expect(mergeLlmFollowupPlan(rule, { request_message: OK_MESSAGE }, ctxOf(d, rule))).toEqual(rule)
  })
})

describe('전체 — generateFollowupPlan', () => {
  it('ANTHROPIC_API_KEY 없이도 규칙 초안이 나온다 (E-06)', async () => {
    const draft = await generateFollowupPlan(ds, 'ls-1')
    expect(draft).not.toBeNull()
    expect(draft!.source).toBe('rule')
    expect(draft).toEqual(ruleFollowupPlan(ds, 'ls-1'))
    expect(createMock).not.toHaveBeenCalled()
  })

  it('없는 회차는 null', async () => {
    expect(await generateFollowupPlan(ds, 'ls-없음')).toBeNull()
  })

  it('LLM 입력에 강사명·기관명·업체명·student_id·가명코드가 없다', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    createMock.mockResolvedValue(llmText({ suggested_title: OK_TITLE }))
    await generateFollowupPlan(ds, 'ls-1')

    expect(createMock).toHaveBeenCalledTimes(1)
    const sent = JSON.stringify(createMock.mock.calls[0])
    for (const name of allNames(ds)) expect(sent, name).not.toContain(name)

    const sessionRows = ds.surveyResponses.filter((r) => r.session_id === 'ls-1')
    const studentIds = sessionRows.map((r) => r.student_id).filter((v): v is string => v !== null)
    const codes = ds.students.filter((s) => studentIds.includes(s.id)).map((s) => s.pseudo_code)
    expect(studentIds.length).toBeGreaterThan(0)
    for (const id of studentIds) expect(sent).not.toContain(id)
    for (const code of codes) expect(sent).not.toContain(code)
    expect(sent).not.toContain('student_id')
    expect(sent).not.toContain('instructor_id')
  })

  it('학생 인용은 high 응답에서 마스킹을 통과한 것만, 최대 5개다', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    createMock.mockResolvedValue(llmText({}))
    const d = replaceResponses('ls-1', [
      row(0, { want_to_learn: '드론 영상 편집을 배우고 싶어요 010-1234-5678 로 연락 주세요' }),
      row(1, { want_to_learn: '박서연 선생님처럼 항공촬영을 하고 싶어요' }),
      row(2, { want_to_learn: '저는 [이름 삭제] 인데요 드론 계속 하고 싶어요' }),
      row(3, { followup_intent: 1, want_to_learn: '의향이 낮은 학생의 문장입니다' }),
      ...Array.from({ length: 8 }, (_, k) =>
        row(10 + k, { want_to_learn: `드론이 스스로 나는 원리를 알고 싶어요 ${'가'.repeat(k + 1)}` }),
      ),
    ])
    await generateFollowupPlan(d, 'ls-1')

    const body = createMock.mock.calls[0]![0] as { messages: { content: string }[] }
    const payload = JSON.parse(body.messages[0]!.content) as Record<string, unknown>
    const quotes = payload['학생_자유서술'] as string[]
    const text = JSON.stringify(payload)

    expect(quotes.length).toBeGreaterThan(0)
    expect(quotes.length).toBeLessThanOrEqual(5)
    for (const q of quotes) expect(q).toContain('원리를 알고 싶어요')
    expect(text).not.toContain('010-1234-5678')
    expect(text).not.toContain('박서연')
    expect(text).not.toContain('삭제]')
    expect(text).not.toContain('의향이 낮은')
  })

  it('LLM 이 성공하면 가드를 통과한 필드만 병합하고 후보·수요는 규칙 값이다', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    createMock.mockResolvedValue(
      llmText({
        suggested_title: '정하윤 드론 심화 과정',
        outline: OK_OUTLINE,
        request_message: '드론 후속 과정 참여 학생을 30명 모집하려 합니다. 회신 부탁드립니다.',
        candidates: [{ instructor_id: 'in-7', name: '오세진', region_label: '광명시', distance: 0 }],
      }),
    )
    const base = ruleFollowupPlan(ds, 'ls-1')!
    const draft = (await generateFollowupPlan(ds, 'ls-1'))!

    expect(draft.source).toBe('llm')
    expect(draft.outline).toEqual(OK_OUTLINE)
    expect(draft.suggested_title).toBe(base.suggested_title)
    expect(draft.request_message).toBe(base.request_message)
    expect(draft.candidates).toEqual(base.candidates)
    expect(draft.demand_count).toBe(base.demand_count)
  })

  it('LLM 호출이 실패해도 throw 하지 않고 규칙 초안을 반환한다', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    createMock.mockRejectedValue(new Error('rate limited'))
    expect(await generateFollowupPlan(ds, 'ls-1')).toEqual(ruleFollowupPlan(ds, 'ls-1'))
  })

  it('아무것도 저장하지 않는다 — Dataset 과 섭외 요청이 그대로다 (ADR-024)', async () => {
    const before = JSON.stringify(ds)
    const requests = ds.recruitmentRequests.length
    await generateFollowupPlan(ds, 'ls-1')
    expect(JSON.stringify(ds)).toBe(before)
    expect(ds.recruitmentRequests).toHaveLength(requests)
  })
})
