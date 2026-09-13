import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as demo from '@/data/demo'
import type { Dataset } from '@/lib/db/dataset'
import { sessionReport } from '@/lib/db/queries'
import { MIN_AGGREGATE_RESPONSES, containsAny, numbersWithin } from '@/lib/ai/guard'
import { generateDebrief, mergeLlmDebrief, ruleDebrief } from '@/lib/ai/session-debrief'
import {
  FIELDS,
  type LessonPlan,
  type SessionDebriefDraft,
  type SurveyResponse,
} from '@/types/domain'

/**
 * AI 수업 회고 + 학교 제출용 결과 요약 (ADR-024 기능 6).
 *
 * 여기서 반드시 지켜지는 것:
 * - 지표와 트리거(무엇을 지적할지)는 규칙이 정하고 LLM 이 바꿀 수 없다
 * - 응답 5건 미만 회차는 통계를 싣지 않고 LLM 도 부르지 않는다 (ADR-018)
 * - LLM 입력에 학생 인용문·student_id·가명코드·강사명·기관명이 없다
 * - 학교 제출 요약에 강사명·기관명·학생 인용문이 없다
 * - 강사 평가 표현(점수·등급·순위)을 만들지 않는다
 * - 교안은 읽기만 하고 아무것도 저장하지 않는다 (ADR-019, ADR-024)
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

const NOTICE_DRAFT = '초안입니다. 수업의 최종 판단과 책임은 강사에게 있습니다.'
const NOTICE_AGGREGATE = '학생 개인을 평가하는 내용이 아니라 이 회차 응답의 집계입니다.'
const NOTICE_SMALL = '응답이 5건 미만이라 통계를 싣지 않았습니다.'
const SMALL_CHANGE =
  '응답이 5건 미만입니다. 다음 회차에는 수업 마무리 3분 전에 QR 안내를 먼저 하세요.'

const EVALUATION_WORDS = ['점수', '등급', '순위', '평점']

const LS1 = ds.lectureSessions.find((s) => s.id === 'ls-1')!
const INSTRUCTOR = ds.instructors.find((i) => i.id === LS1.instructor_id)!
const ORG = ds.organizations.find((o) => o.id === LS1.org_id)!
const PROVIDER = ds.providers.find((p) => p.id === INSTRUCTOR.provider_id)!

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

/** 모듈 안의 가드 입력과 같은 규칙으로 만든다: 지표·시수·예상 인원·날짜·임계치 · 배정 강사·기관·업체명. */
function ctxOf(d: Dataset, draft: SessionDebriefDraft) {
  const session = d.lectureSessions.find((s) => s.id === draft.session_id)!
  const m = draft.metrics
  const nums = [
    m.response_count,
    m.response_rate_pct,
    m.satisfaction_avg,
    m.high_satisfaction_pct,
    m.low_satisfaction_pct,
    m.followup_high_pct,
    session.duration_minutes,
    session.expected_students,
    ...session.held_on.split('-').map(Number),
    40,
    50,
    70,
    20,
    3,
    5,
    1,
    2,
    4,
  ]
  const instructor = d.instructors.find((i) => i.id === session.instructor_id)
  const provider = d.providers.find((p) => p.id === instructor?.provider_id)
  const org = d.organizations.find((o) => o.id === session.org_id)
  return {
    allowed: nums.filter((v): v is number => typeof v === 'number'),
    banned: [instructor?.name, org?.name, provider?.name].filter((v): v is string => !!v),
  }
}

/** 규칙 문장 전체 — 잘 된 점·바꿀 점·학교 제출 요약 */
function ruleSentences(draft: SessionDebriefDraft): string[] {
  return [...draft.went_well, ...draft.change_next, draft.school_summary]
}

const llmText = (obj: unknown) => ({ content: [{ type: 'text', text: JSON.stringify(obj) }] })

const OK_WELL = '학생들이 촬영 활동에 적극적으로 참여했습니다.'
const OK_CHANGE = '마무리에 후속 과정 안내를 한 번 더 넣어 보세요.'
const OK_SUMMARY =
  '드론 분야 특강을 중등 학생 대상으로 진행했습니다. 학생 설문 응답을 집계한 결과 후속 과정에 대한 관심이 확인됐습니다.'

beforeEach(() => {
  delete process.env.ANTHROPIC_API_KEY
  createMock.mockReset()
})

afterEach(() => {
  delete process.env.ANTHROPIC_API_KEY
})

describe('규칙 — 지표는 sessionReport 에서 확정된다', () => {
  it('데모 ls-1: 표본 충분이고 지표가 sessionReport 값(반올림 규칙)과 같다', () => {
    const report = sessionReport(ds, 'ls-1')!
    const draft = ruleDebrief(ds, 'ls-1')!
    const n = report.responseCount
    const countSat = (pred: (v: number) => boolean) =>
      report.satisfactionDist.filter((d) => pred(d.value)).reduce((a, d) => a + d.count, 0)

    expect(draft.session_id).toBe('ls-1')
    expect(draft.sample_sufficient).toBe(true)
    expect(draft.metrics).toEqual({
      response_count: n,
      response_rate_pct: Math.round(report.responseRate * 100),
      satisfaction_avg: Math.round(report.satisfactionAvg * 10) / 10,
      high_satisfaction_pct: Math.round((countSat((v) => v >= 4) / n) * 100),
      low_satisfaction_pct: Math.round((countSat((v) => v <= 2) / n) * 100),
      followup_high_pct: Math.round(report.followupHighRate * 100),
      top_field: '드론',
    })
    expect(draft.source).toBe('rule')
  })

  it('데모 ls-1: 목록은 각 3개 이하, 요약은 400자 이하, 고지문은 두 줄이다', () => {
    const draft = ruleDebrief(ds, 'ls-1')!
    expect(draft.went_well.length).toBeGreaterThan(0)
    expect(draft.went_well.length).toBeLessThanOrEqual(3)
    expect(draft.change_next.length).toBeLessThanOrEqual(3)
    expect(draft.school_summary.length).toBeGreaterThan(0)
    expect(draft.school_summary.length).toBeLessThanOrEqual(400)
    expect(draft.notices).toEqual([NOTICE_DRAFT, NOTICE_AGGREGATE])
  })

  it('관심 분야 1위는 신산업 분야만 센다 — 동률이면 분야 목록 순서다', () => {
    const d = replaceResponses('ls-1', [
      ...rows(3, { interest_fields: ['아직 잘 모르겠어요'] }),
      ...rows(2, { interest_fields: ['뷰티'] }, 3),
      ...rows(2, { interest_fields: ['VR·AR'] }, 5),
    ])
    // VR·AR 이 FIELDS 에서 뷰티보다 앞이다.
    expect(ruleDebrief(d, 'ls-1')!.metrics.top_field).toBe('VR·AR')
  })

  it('신산업 분야 선택이 하나도 없으면 관심 분야 1위는 null 이고 분야 트리거가 나오지 않는다', () => {
    const d = replaceResponses('ls-1', rows(20, { interest_fields: ['아직 잘 모르겠어요'] }))
    const draft = ruleDebrief(d, 'ls-1')!
    expect(draft.sample_sufficient).toBe(true)
    expect(draft.metrics.top_field).toBeNull()
    expect(draft.change_next.some((s) => s.includes('직업을 소개'))).toBe(false)
    expect(draft.school_summary.length).toBeLessThanOrEqual(400)
  })

  it('없는 회차는 null', () => {
    expect(ruleDebrief(ds, 'ls-없음')).toBeNull()
  })
})

describe('규칙 트리거 — 무엇을 지적할지는 규칙이 정한다', () => {
  it('후속 의향이 높은 응답만 있으면 잘 된 점에 후속 문장, 바꿀 점에 다음 단계 안내가 없다', () => {
    // 20건 / 예상 32명 = 63% — 응답률 트리거는 나오지 않는다.
    const d = replaceResponses('ls-1', rows(20, { followup_intent: 4, satisfaction: 3 }))
    const draft = ruleDebrief(d, 'ls-1')!
    expect(draft.metrics.followup_high_pct).toBe(100)
    expect(draft.went_well.some((s) => s.includes('후속 과정 제안의 근거'))).toBe(true)
    expect(draft.change_next.some((s) => s.includes('다음 단계'))).toBe(false)
    expect(draft.change_next).toEqual([])
  })

  it('후속 의향이 낮은 응답만 있으면 반대다', () => {
    const d = replaceResponses('ls-1', rows(20, { followup_intent: 2, satisfaction: 3 }))
    const draft = ruleDebrief(d, 'ls-1')!
    expect(draft.metrics.followup_high_pct).toBe(0)
    expect(draft.went_well.some((s) => s.includes('후속 과정 제안의 근거'))).toBe(false)
    expect(draft.change_next.some((s) => s.includes('다음 단계'))).toBe(true)
  })

  it('만족도 4·5점 비율이 70% 이상이면 잘 된 점에 만족 응답 비율이 나온다', () => {
    const d = replaceResponses('ls-1', [
      ...rows(14, { satisfaction: 5, followup_intent: 2 }),
      ...rows(6, { satisfaction: 3, followup_intent: 2 }, 14),
    ])
    const draft = ruleDebrief(d, 'ls-1')!
    expect(draft.metrics.high_satisfaction_pct).toBe(70)
    expect(draft.went_well).toHaveLength(1)
    expect(draft.went_well[0]).toContain('만족도 4·5점')
    expect(draft.went_well[0]).toContain('70%')
  })

  it('만족·후속 트리거가 둘 다 아니면 응답 수를 확보했다는 문장 하나다', () => {
    const d = replaceResponses('ls-1', rows(20, { satisfaction: 3, followup_intent: 2 }))
    const draft = ruleDebrief(d, 'ls-1')!
    expect(draft.went_well).toHaveLength(1)
    expect(draft.went_well[0]).toContain('20건')
  })

  it('만족도 1·2점 비율이 20% 이상이면 어려워하는 학생용 분기를 제안한다', () => {
    const d = replaceResponses('ls-1', [
      ...rows(4, { satisfaction: 1 }),
      ...rows(16, { satisfaction: 4 }, 4),
    ])
    const draft = ruleDebrief(d, 'ls-1')!
    expect(draft.metrics.low_satisfaction_pct).toBe(20)
    expect(draft.change_next.some((s) => s.includes('어려워하는 학생'))).toBe(true)
  })

  it('관심 분야 1위가 회차 분야와 다르면 그 분야와 이어지는 직업 소개를 제안한다', () => {
    const d = replaceResponses('ls-1', rows(20, { interest_fields: ['3D 모델링·프린팅'] }))
    const draft = ruleDebrief(d, 'ls-1')!
    expect(draft.metrics.top_field).toBe('3D 모델링·프린팅')
    const s = draft.change_next.find((x) => x.includes('직업을 소개'))
    expect(s).toBeDefined()
    // 조사가 받침에 따라 틀리지 않도록 "관심 분야 1위: {분야}" 형태로 쓴다.
    expect(s).toContain('관심 분야 1위: 3D 모델링·프린팅')
  })

  it('관심 분야 1위가 회차 분야와 같으면 직업 소개 제안이 없다', () => {
    const draft = ruleDebrief(replaceResponses('ls-1', rows(20)), 'ls-1')!
    expect(draft.change_next.some((s) => s.includes('직업을 소개'))).toBe(false)
  })

  it('응답률이 50% 미만이면 QR 안내를 수업 종료 3분 전에 하라고 한다', () => {
    // 10건 / 예상 32명 = 31%
    const draft = ruleDebrief(replaceResponses('ls-1', rows(10)), 'ls-1')!
    expect(draft.metrics.response_rate_pct).toBe(31)
    expect(draft.change_next.some((s) => s.includes('QR 안내') && s.includes('종료 3분 전'))).toBe(true)
  })

  it('트리거가 넷 다 걸려도 바꿀 점은 순서대로 최대 3개다', () => {
    // 10건 / 32명 = 31%, 후속 의향 전원 낮음, 만족도 1점 40%, 관심 분야 1위 VR·AR
    const d = replaceResponses('ls-1', [
      ...rows(4, { satisfaction: 1, followup_intent: 1, interest_fields: ['VR·AR'] }),
      ...rows(6, { satisfaction: 4, followup_intent: 2, interest_fields: ['VR·AR'] }, 4),
    ])
    const draft = ruleDebrief(d, 'ls-1')!
    expect(draft.change_next).toHaveLength(3)
    expect(draft.change_next[0]).toContain('다음 단계')
    expect(draft.change_next[1]).toContain('어려워하는 학생')
    expect(draft.change_next[2]).toContain('직업을 소개')
  })

  it('데모 ls-4: 만족도 1·2점 비율 20% 이상 → 분기 제안, 후속 의향 40% 이상 → 잘 된 점', () => {
    const draft = ruleDebrief(ds, 'ls-4')!
    expect(draft.metrics.low_satisfaction_pct!).toBeGreaterThanOrEqual(20)
    expect(draft.change_next.some((s) => s.includes('어려워하는 학생'))).toBe(true)
    expect(draft.went_well.some((s) => s.includes('후속 과정 제안의 근거'))).toBe(true)
  })

  it('규칙 문장은 각 100자 이하이고 숫자 가드·이름 가드를 통과한다 — 데모 전 회차', () => {
    for (const session of ds.lectureSessions) {
      const draft = ruleDebrief(ds, session.id)!
      const ctx = ctxOf(ds, draft)
      for (const s of [...draft.went_well, ...draft.change_next]) {
        expect(s.length, s).toBeLessThanOrEqual(100)
        expect(numbersWithin(s, ctx.allowed, FIELDS), s).toBe(true)
        expect(containsAny(s, ctx.banned), s).toBe(false)
      }
      expect(numbersWithin(draft.school_summary, ctx.allowed, FIELDS), draft.school_summary).toBe(true)
    }
  })
})

describe('표본 부족 — 응답 5건 미만은 통계를 싣지 않는다 (ADR-018)', () => {
  const small = keepResponses('ls-1', MIN_AGGREGATE_RESPONSES - 1)

  it('응답 4건이면 비율·평균·관심 분야가 null 이고 잘 된 점이 비어 있다', () => {
    const draft = ruleDebrief(small, 'ls-1')!
    expect(draft.sample_sufficient).toBe(false)
    expect(draft.metrics.response_count).toBe(4)
    expect(draft.metrics.satisfaction_avg).toBeNull()
    expect(draft.metrics.high_satisfaction_pct).toBeNull()
    expect(draft.metrics.low_satisfaction_pct).toBeNull()
    expect(draft.metrics.followup_high_pct).toBeNull()
    expect(draft.metrics.top_field).toBeNull()
    expect(draft.went_well).toEqual([])
  })

  it('바꿀 점은 QR 안내 한 줄이고, 표본 부족 고지문이 세 번째 줄로 붙는다', () => {
    const draft = ruleDebrief(small, 'ls-1')!
    expect(draft.change_next).toEqual([SMALL_CHANGE])
    expect(draft.notices).toEqual([NOTICE_DRAFT, NOTICE_AGGREGATE, NOTICE_SMALL])
  })

  it('학교 제출 요약은 응답 수만 알리고 통계를 싣지 않는다', () => {
    const s = ruleDebrief(small, 'ls-1')!.school_summary
    expect(s).toContain('4건')
    expect(s).not.toContain('%')
    expect(s).not.toContain('만점')
    expect(s).not.toContain('평균')
    expect(s).not.toContain('관심 분야 1위')
    expect(s.length).toBeLessThanOrEqual(400)
  })

  it('응답 0건 회차도 같은 규칙이다 (E-24)', () => {
    const draft = ruleDebrief(ds, 'ls-3')!
    expect(draft.sample_sufficient).toBe(false)
    expect(draft.metrics.response_count).toBe(0)
    expect(draft.metrics.response_rate_pct).toBe(0)
    expect(draft.went_well).toEqual([])
    expect(draft.change_next).toEqual([SMALL_CHANGE])
  })

  it('경계: 정확히 5건이면 표본 충분이다', () => {
    const draft = ruleDebrief(keepResponses('ls-1', MIN_AGGREGATE_RESPONSES), 'ls-1')!
    expect(draft.sample_sufficient).toBe(true)
    expect(draft.metrics.satisfaction_avg).not.toBeNull()
  })

  it('LLM 이 무엇을 주든 표본 부족 초안은 바뀌지 않는다', () => {
    const draft = ruleDebrief(small, 'ls-1')!
    const merged = mergeLlmDebrief(
      draft,
      { went_well: [OK_WELL], change_next: [OK_CHANGE], school_summary: OK_SUMMARY },
      ctxOf(small, draft),
    )
    expect(merged).toEqual(draft)
  })

  it('키가 있어도 응답 4건 회차는 LLM 을 부르지 않는다', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    createMock.mockResolvedValue(llmText({ went_well: [OK_WELL] }))
    const draft = await generateDebrief(small, 'ls-1')
    expect(createMock).not.toHaveBeenCalled()
    expect(draft).toEqual(ruleDebrief(small, 'ls-1'))
  })
})

describe('학교 제출 요약 (규칙) — 이름·학생 인용문이 없다', () => {
  it('데모 ls-1: 제목·일시·학년대·시수·응답 수·응답률·만족도 평균·후속 의향 비율·관심 분야 1위가 들어 있다', () => {
    const draft = ruleDebrief(ds, 'ls-1')!
    const m = draft.metrics
    const s = draft.school_summary
    expect(s).toContain(LS1.title)
    expect(s).toContain(LS1.held_on)
    expect(s).toContain('중등')
    expect(s).toContain(`${LS1.duration_minutes}분`)
    expect(s).toContain(`${m.response_count}건`)
    expect(s).toContain(`${m.response_rate_pct}%`)
    expect(s).toContain('5점 만점')
    expect(s).toContain(`${m.satisfaction_avg}점`)
    expect(s).toContain(`${m.followup_high_pct}%`)
    expect(s).toContain(`관심 분야 1위: ${m.top_field}`)
  })

  it('강사명·기관명·업체명·학생 인용문·가명코드가 없다', () => {
    const d = replaceResponses('ls-1', [
      ...rows(3, { want_to_learn: '드론이 스스로 나는 원리를 알고 싶어요' }),
      ...rows(3, { want_to_learn: '항공촬영으로 돈 버는 직업이 궁금해요' }, 3),
    ])
    for (const [data, id] of [
      [ds, 'ls-1'],
      [d, 'ls-1'],
      [ds, 'ls-2'],
      [ds, 'ls-4'],
    ] as const) {
      const s = ruleDebrief(data, id)!.school_summary
      for (const name of [
        ...data.instructors.map((i) => i.name),
        ...data.organizations.map((o) => o.name),
        ...data.providers.map((p) => p.name),
      ]) {
        expect(s, name).not.toContain(name)
      }
      const sessionRows = data.surveyResponses.filter((r) => r.session_id === id)
      for (const r of sessionRows) {
        if (r.want_to_learn) expect(s).not.toContain(r.want_to_learn)
        if (r.desired_job) expect(s).not.toContain(r.desired_job)
      }
      const ids = sessionRows.map((r) => r.student_id).filter((v): v is string => v !== null)
      for (const code of data.students.filter((x) => ids.includes(x.id)).map((x) => x.pseudo_code)) {
        expect(s).not.toContain(code)
      }
    }
  })

  it('회차 제목에 기관명이 들어 있으면 요약에 제목을 싣지 않는다', () => {
    const titled: Dataset = {
      ...ds,
      lectureSessions: ds.lectureSessions.map((s) =>
        s.id === 'ls-1' ? { ...s, title: `${ORG.name} 드론 특강` } : s,
      ),
    }
    const s = ruleDebrief(titled, 'ls-1')!.school_summary
    expect(s.length).toBeGreaterThan(0)
    expect(s).not.toContain(ORG.name)
  })
})

describe('강사 평가 표현이 없다 — 회고는 강사 자신을 위한 집계다', () => {
  it('출력 키에 점수·등급·순위 필드가 없다', () => {
    const draft = ruleDebrief(ds, 'ls-1')!
    const keys = [...Object.keys(draft), ...Object.keys(draft.metrics)].join(' ')
    expect(keys).not.toMatch(/score|grade|rank|rating/i)
  })

  it('규칙 문장 어디에도 점수·등급·순위·평점이 없다 — 데모 전 회차와 트리거 조합', () => {
    const variants: [Dataset, string][] = [
      ...ds.lectureSessions.map((s) => [ds, s.id] as [Dataset, string]),
      [keepResponses('ls-1', 4), 'ls-1'],
      [replaceResponses('ls-1', rows(20, { followup_intent: 4 })), 'ls-1'],
      [replaceResponses('ls-1', rows(20, { satisfaction: 3, followup_intent: 2 })), 'ls-1'],
      [
        replaceResponses('ls-1', [
          ...rows(4, { satisfaction: 1, followup_intent: 1, interest_fields: ['VR·AR'] }),
          ...rows(6, { satisfaction: 4, followup_intent: 2, interest_fields: ['VR·AR'] }, 4),
        ]),
        'ls-1',
      ],
    ]
    for (const [data, id] of variants) {
      const draft = ruleDebrief(data, id)!
      for (const s of [...ruleSentences(draft), ...draft.notices]) {
        expect(containsAny(s, EVALUATION_WORDS), s).toBe(false)
      }
    }
  })
})

describe('병합 — 가드를 통과한 LLM 문장만 쓴다', () => {
  // 트리거가 양쪽 목록에 다 걸리는 회차 — 병합 대상 필드가 비어 있지 않게.
  const mixed = replaceResponses('ls-1', [
    ...rows(4, { satisfaction: 1 }),
    ...rows(16, { satisfaction: 5 }, 4),
  ])
  const base = ruleDebrief(mixed, 'ls-1')!
  const ctx = ctxOf(mixed, base)

  it('전제: 잘 된 점과 바꿀 점이 모두 규칙으로 채워져 있다', () => {
    expect(base.went_well.length).toBeGreaterThan(0)
    expect(base.change_next.length).toBeGreaterThan(0)
  })

  it('가드를 통과한 문장은 채택하고 source 는 llm 이다', () => {
    const merged = mergeLlmDebrief(
      base,
      { went_well: [OK_WELL], change_next: [OK_CHANGE], school_summary: OK_SUMMARY },
      ctx,
    )
    expect(merged.went_well).toEqual([OK_WELL])
    expect(merged.change_next).toEqual([OK_CHANGE])
    expect(merged.school_summary).toBe(OK_SUMMARY)
    expect(merged.source).toBe('llm')
  })

  it('숫자가 전부 규칙 값이면 채택한다', () => {
    const s = `만족도 4·5점 응답이 ${base.metrics.high_satisfaction_pct}%로 높았습니다.`
    expect(mergeLlmDebrief(base, { went_well: [s] }, ctx).went_well).toEqual([s])
  })

  it('규칙에 없는 숫자가 든 문장은 버린다', () => {
    expect(ctx.allowed).not.toContain(93)
    const merged = mergeLlmDebrief(
      base,
      { went_well: ['만족 응답이 93%로 매우 높았습니다.', OK_WELL] },
      ctx,
    )
    expect(merged.went_well).toEqual([OK_WELL])
  })

  it('문장이 전부 버려지면 그 필드는 규칙 값이 남는다', () => {
    const merged = mergeLlmDebrief(base, { went_well: ['만족 응답이 93%로 매우 높았습니다.'] }, ctx)
    expect(merged.went_well).toEqual(base.went_well)
    expect(merged.source).toBe('rule')
  })

  it('강사명·기관명·업체명이 든 문장은 버린다', () => {
    const merged = mergeLlmDebrief(
      base,
      {
        went_well: [`${INSTRUCTOR.name} 강사의 시범이 효과적이었습니다.`],
        change_next: [`${ORG.name} 담당자와 마무리 안내를 맞춰 보세요.`],
        school_summary: `${PROVIDER.name} 소속 강사가 드론 특강을 진행했습니다.`,
      },
      ctx,
    )
    expect(merged).toEqual(base)
  })

  it('연락처·링크가 든 문장은 버린다', () => {
    const merged = mergeLlmDebrief(
      base,
      { change_next: ['자세한 내용은 https://example.com 을 참고해 보세요.'] },
      ctx,
    )
    expect(merged.change_next).toEqual(base.change_next)
  })

  it('강사 평가 표현(점수·등급·순위)이 든 문장은 버린다', () => {
    const merged = mergeLlmDebrief(
      base,
      { went_well: ['이번 수업은 강사 등급 상위에 해당합니다.', '강사 순위가 올랐습니다.'] },
      ctx,
    )
    expect(merged.went_well).toEqual(base.went_well)
  })

  it('학생 개인을 지목하는 문장은 버린다', () => {
    const merged = mergeLlmDebrief(
      base,
      { change_next: ['중2 학생 A가 어려워해 분기를 앞에 두세요.'] },
      ctx,
    )
    expect(merged.change_next).toEqual(base.change_next)
  })

  it('100자를 넘는 항목은 버리고, 401자 요약은 규칙 요약이 남는다', () => {
    const merged = mergeLlmDebrief(
      base,
      { went_well: ['드'.repeat(101)], school_summary: '드'.repeat(401) },
      ctx,
    )
    expect(merged.went_well).toEqual(base.went_well)
    expect(merged.school_summary).toBe(base.school_summary)
    expect(merged.source).toBe('rule')
    // 경계: 400자는 채택한다.
    expect(mergeLlmDebrief(base, { school_summary: '드'.repeat(400) }, ctx).school_summary).toBe(
      '드'.repeat(400),
    )
  })

  it('LLM 은 규칙이 정한 항목 수보다 늘릴 수 없다 — 최대 3', () => {
    const many = Array.from({ length: 5 }, (_, i) => `잘 된 점 ${'가'.repeat(i + 1)}입니다.`)
    const merged = mergeLlmDebrief(base, { went_well: many, change_next: many }, ctx)
    expect(merged.went_well).toHaveLength(Math.min(3, base.went_well.length))
    expect(merged.change_next).toHaveLength(Math.min(3, base.change_next.length))
  })

  it('규칙 트리거가 없는 바꿀 점은 LLM 이 만들 수 없다', () => {
    const rule = ruleDebrief(ds, 'ls-1')!
    expect(rule.change_next).toEqual([])
    const merged = mergeLlmDebrief(rule, { change_next: [OK_CHANGE] }, ctxOf(ds, rule))
    expect(merged.change_next).toEqual([])
    expect(merged.source).toBe('rule')
  })

  it('LLM 이 metrics·sample_sufficient·notices·session_id 를 보내도 무시한다', () => {
    const merged = mergeLlmDebrief(
      base,
      {
        session_id: 'ls-조작',
        sample_sufficient: false,
        metrics: { response_count: 999, satisfaction_avg: 4.9, top_field: 'VR·AR' },
        notices: [],
        source: 'rule',
        went_well: [OK_WELL],
      },
      ctx,
    )
    expect(merged).toEqual({ ...base, went_well: [OK_WELL], source: 'llm' })
  })

  it('null·문자열·배열·빈 값이면 규칙 초안이 그대로 남는다', () => {
    expect(mergeLlmDebrief(base, null, ctx)).toEqual(base)
    expect(mergeLlmDebrief(base, '문자열', ctx)).toEqual(base)
    expect(mergeLlmDebrief(base, [OK_WELL], ctx)).toEqual(base)
    expect(mergeLlmDebrief(base, { went_well: [], change_next: [], school_summary: '' }, ctx)).toEqual(
      base,
    )
  })
})

describe('전체 — generateDebrief', () => {
  it('ANTHROPIC_API_KEY 없이도 규칙 초안이 나온다 (E-06)', async () => {
    const draft = await generateDebrief(ds, 'ls-1')
    expect(draft).not.toBeNull()
    expect(draft!.source).toBe('rule')
    expect(draft).toEqual(ruleDebrief(ds, 'ls-1'))
    expect(createMock).not.toHaveBeenCalled()
  })

  it('없는 회차는 null', async () => {
    expect(await generateDebrief(ds, 'ls-없음')).toBeNull()
  })

  it('LLM 입력에 학생 인용문·student_id·가명코드·강사명·기관명·업체명이 없다', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    createMock.mockResolvedValue(llmText({}))
    await generateDebrief(ds, 'ls-1')

    expect(createMock).toHaveBeenCalledTimes(1)
    const sent = JSON.stringify(createMock.mock.calls[0])
    for (const name of [INSTRUCTOR.name, ORG.name, PROVIDER.name]) expect(sent, name).not.toContain(name)

    const sessionRows = ds.surveyResponses.filter((r) => r.session_id === 'ls-1')
    const quotes = sessionRows.map((r) => r.want_to_learn).filter((v): v is string => !!v)
    const studentIds = sessionRows.map((r) => r.student_id).filter((v): v is string => v !== null)
    const codes = ds.students.filter((s) => studentIds.includes(s.id)).map((s) => s.pseudo_code)
    expect(quotes.length).toBeGreaterThan(0)
    expect(studentIds.length).toBeGreaterThan(0)
    for (const q of quotes) expect(sent).not.toContain(q)
    for (const id of studentIds) expect(sent).not.toContain(id)
    for (const code of codes) expect(sent).not.toContain(code)
    expect(sent).not.toContain('student_id')
    expect(sent).not.toContain('pseudo_code')
    expect(sent).not.toContain('학생_자유서술')
  })

  it('LLM 입력에 회차 조건·지표·규칙 판단이 들어 있다', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    createMock.mockResolvedValue(llmText({}))
    await generateDebrief(ds, 'ls-1')

    const body = createMock.mock.calls[0]![0] as { messages: { content: string }[] }
    const payload = JSON.parse(body.messages[0]!.content) as Record<string, Record<string, unknown>>
    const rule = ruleDebrief(ds, 'ls-1')!
    expect(payload['회차']).toMatchObject({
      분야: LS1.field,
      학년대: '중등',
      시수_분: LS1.duration_minutes,
      장소: LS1.venue,
      학급_특성: LS1.class_traits,
    })
    expect(JSON.stringify(payload['지표'])).toContain(String(rule.metrics.response_rate_pct))
    expect(payload['규칙_판단']).toEqual({ 잘된_점: rule.went_well, 바꿀_점: rule.change_next })
    // ls-1 에는 교안이 없다.
    expect(payload['교안_단계']).toBeUndefined()
  })

  it('그 회차 배정 강사의 교안이 있으면 단계의 구분·제목만 넣는다 — 다른 강사의 교안은 넣지 않는다', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    createMock.mockResolvedValue(llmText({}))
    const own = ds.lessonPlans.find((p) => p.session_id === 'ls-2')!
    const foreign: LessonPlan = {
      ...own,
      id: 'lp-타강사',
      instructor_id: 'in-9',
      steps: own.steps.map((s) => ({ ...s, title: `타강사 비공개 단계 ${s.phase}` })),
    }
    const d: Dataset = { ...ds, lessonPlans: [foreign, ...ds.lessonPlans] }
    const before = JSON.stringify(d.lessonPlans)
    await generateDebrief(d, 'ls-2')

    const body = createMock.mock.calls[0]![0] as { messages: { content: string }[] }
    const payload = JSON.parse(body.messages[0]!.content) as Record<string, unknown>
    expect(payload['교안_단계']).toEqual(own.steps.map((s) => ({ 구분: s.phase, 제목: s.title })))
    const text = JSON.stringify(payload)
    expect(text).not.toContain('타강사 비공개')
    for (const s of own.steps) {
      expect(text).not.toContain(s.base)
      expect(text).not.toContain(s.fast)
      expect(text).not.toContain(s.slow)
    }
    // 교안은 읽기만 한다 (ADR-019).
    expect(JSON.stringify(d.lessonPlans)).toBe(before)
  })

  it('LLM 이 성공하면 가드를 통과한 필드만 병합하고 지표는 규칙 값이다', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    createMock.mockResolvedValue(
      llmText({
        went_well: [OK_WELL, `${INSTRUCTOR.name} 강사의 설명이 좋았습니다.`],
        change_next: [OK_CHANGE],
        school_summary: `응답 999건, 만족도 평균 4.9점입니다.`,
        metrics: { response_count: 999 },
      }),
    )
    const base = ruleDebrief(ds, 'ls-1')!
    const draft = (await generateDebrief(ds, 'ls-1'))!

    expect(createMock).toHaveBeenCalledTimes(1)
    expect(draft.source).toBe('llm')
    expect(draft.went_well).toEqual([OK_WELL])
    // ls-1 은 바꿀 점 트리거가 없다 — LLM 이 만들 수 없다.
    expect(draft.change_next).toEqual(base.change_next)
    expect(draft.school_summary).toBe(base.school_summary)
    expect(draft.metrics).toEqual(base.metrics)
    expect(draft.notices).toEqual(base.notices)
  })

  it('LLM 호출이 실패해도 throw 하지 않고 규칙 초안을 반환한다', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    createMock.mockRejectedValue(new Error('rate limited'))
    expect(await generateDebrief(ds, 'ls-1')).toEqual(ruleDebrief(ds, 'ls-1'))
  })

  it('아무것도 저장하지 않는다 — Dataset 이 그대로다 (ADR-024)', async () => {
    const before = JSON.stringify(ds)
    await generateDebrief(ds, 'ls-1')
    await generateDebrief(ds, 'ls-2')
    expect(JSON.stringify(ds)).toBe(before)
  })
})
