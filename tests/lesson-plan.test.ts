import { beforeEach, describe, expect, it } from 'vitest'
import * as demo from '@/data/demo'
import type { Dataset } from '@/lib/db/dataset'
import {
  PRIOR_MIN_RESPONSES,
  buildInputs,
  generateLessonPlan,
  mergeLlmSteps,
  priorFeedback,
  ruleSkeleton,
} from '@/lib/ai/lesson-plan'
import type { LectureSession, LessonPlanInputs, SurveyResponse } from '@/types/domain'

/**
 * AI 수업 설계 도우미 (ADR-016·017·018).
 *
 * 여기서 반드시 지켜지는 것:
 * - LLM 이 없어도 교안 골격이 나온다
 * - 과거 설문 응답이 5건 미만이면 집계가 만들어지지 않는다
 * - LLM 이 무엇을 돌려주든 차시 구조·시간·QR 안내는 깨지지 않는다
 */

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

const demoDs: Dataset = { ...empty, ...demo }

function session(over: Partial<LectureSession> = {}): LectureSession {
  return {
    id: 'ls-test',
    org_id: 'org-1',
    instructor_id: 'in-2',
    title: '드론 특강',
    field: '드론',
    held_on: '2026-09-01',
    closes_at: '2026-09-08T23:59:00+09:00',
    status: 'open',
    entry_code: '111111',
    grade_band: 'middle',
    expected_students: 25,
    duration_minutes: 90,
    venue: '운동장',
    class_traits: [],
    equipment: ['드론 10대'],
    ...over,
  }
}

function response(sessionId: string, over: Partial<SurveyResponse> = {}): SurveyResponse {
  return {
    id: `sr-${Math.random()}`,
    session_id: sessionId,
    student_id: null,
    grade: { band: 'middle', year: 2 },
    satisfaction: 4,
    followup_intent: 3,
    interest_fields: ['드론'],
    want_to_learn: null,
    desired_job: null,
    available_times: [],
    created_at: '2026-09-02T10:00:00+09:00',
    ...over,
  }
}

function inputs(over: Partial<LessonPlanInputs> = {}): LessonPlanInputs {
  return {
    session_title: '드론 특강',
    field: '드론',
    grade_band: 'middle',
    expected_students: 25,
    duration_minutes: 90,
    venue: '운동장',
    class_traits: [],
    equipment: ['드론 10대'],
    program_title: null,
    program_outline: ['기체 이해', '호버링 연습', '미션 비행'],
    prior: null,
    ...over,
  }
}

// ============================================================================

describe('과거 설문 집계 — k-익명성 임계치 (ADR-018)', () => {
  const past = session({ id: 'ls-past' })
  const current = session({ id: 'ls-now' })

  function withResponses(n: number): Dataset {
    return {
      ...empty,
      lectureSessions: [past, current],
      surveyResponses: Array.from({ length: n }, () => response('ls-past')),
    }
  }

  it(`응답이 ${PRIOR_MIN_RESPONSES}건 미만이면 집계를 만들지 않는다`, () => {
    for (let n = 0; n < PRIOR_MIN_RESPONSES; n += 1) {
      const ds = withResponses(n)
      expect(priorFeedback(ds, 'org-1', '드론', 'ls-now'), `${n}건`).toBeNull()
    }
  })

  it(`응답이 ${PRIOR_MIN_RESPONSES}건이면 집계가 나온다`, () => {
    const r = priorFeedback(withResponses(PRIOR_MIN_RESPONSES), 'org-1', '드론', 'ls-now')
    expect(r).not.toBeNull()
    expect(r!.response_count).toBe(PRIOR_MIN_RESPONSES)
  })

  it('임계치는 정확히 5다 — 4건에서 새지 않는다', () => {
    expect(PRIOR_MIN_RESPONSES).toBe(5)
    expect(priorFeedback(withResponses(4), 'org-1', '드론', 'ls-now')).toBeNull()
  })

  it('현재 회차의 응답은 집계에 넣지 않는다', () => {
    const ds: Dataset = {
      ...empty,
      lectureSessions: [past, current],
      surveyResponses: Array.from({ length: 9 }, () => response('ls-now')),
    }
    expect(priorFeedback(ds, 'org-1', '드론', 'ls-now')).toBeNull()
  })

  it('다른 기관의 응답을 끌어오지 않는다', () => {
    const other = session({ id: 'ls-other', org_id: 'org-999' })
    const ds: Dataset = {
      ...empty,
      lectureSessions: [other, current],
      surveyResponses: Array.from({ length: 9 }, () => response('ls-other')),
    }
    expect(priorFeedback(ds, 'org-1', '드론', 'ls-now')).toBeNull()
  })

  it('다른 분야의 응답을 끌어오지 않는다', () => {
    const other = session({ id: 'ls-3d', field: '3D 모델링·프린팅' })
    const ds: Dataset = {
      ...empty,
      lectureSessions: [other, current],
      surveyResponses: Array.from({ length: 9 }, () => response('ls-3d')),
    }
    expect(priorFeedback(ds, 'org-1', '드론', 'ls-now')).toBeNull()
  })

  it('개별 응답 원문을 그대로 내보내지 않는다 — 두 번 이상 나온 표현만', () => {
    const ds: Dataset = {
      ...empty,
      lectureSessions: [past, current],
      surveyResponses: [
        response('ls-past', { want_to_learn: '조립 해보고 싶어요' }),
        response('ls-past', { want_to_learn: '조립 더 하고 싶어요' }),
        response('ls-past', { want_to_learn: '촬영 배우고 싶어요' }),
        response('ls-past', { want_to_learn: null }),
        response('ls-past', { want_to_learn: null }),
      ],
    }
    const r = priorFeedback(ds, 'org-1', '드론', 'ls-now')!
    expect(r.repeated_phrases).toContain('조립')
    // 한 번만 나온 말은 버린다.
    expect(r.repeated_phrases).not.toContain('촬영')
  })

  it('연락처가 섞인 자유서술은 통째로 제외한다 (E-08)', () => {
    const ds: Dataset = {
      ...empty,
      lectureSessions: [past, current],
      surveyResponses: [
        response('ls-past', { want_to_learn: '연락처 010-1234-5678 로 주세요' }),
        response('ls-past', { want_to_learn: '연락처 010-1234-5678 로 주세요' }),
        ...Array.from({ length: 3 }, () => response('ls-past')),
      ],
    }
    const r = priorFeedback(ds, 'org-1', '드론', 'ls-now')!
    expect(JSON.stringify(r)).not.toContain('010')
    expect(JSON.stringify(r)).not.toContain('1234')
  })
})

// ============================================================================

describe('규칙 골격 — LLM 없이도 나오는 것 (ADR-017)', () => {
  it('도입·전개·마무리가 모두 있다', () => {
    const phases = new Set(ruleSkeleton(inputs()).steps.map((s) => s.phase))
    expect(phases).toEqual(new Set(['도입', '전개', '마무리']))
  })

  it('단계 시간의 합이 회차 시수와 같다', () => {
    for (const total of [50, 90, 100, 120]) {
      const steps = ruleSkeleton(inputs({ duration_minutes: total })).steps
      expect(steps.reduce((a, s) => a + s.minutes, 0), `${total}분`).toBe(total)
    }
  })

  it('모든 단계에 난이도 분기가 있다 — 이게 이 기능의 존재 이유다', () => {
    for (const step of ruleSkeleton(inputs()).steps) {
      expect(step.base.length).toBeGreaterThan(5)
      expect(step.fast.length).toBeGreaterThan(5)
      expect(step.slow.length).toBeGreaterThan(5)
    }
  })

  it('마무리 단계에 QR 안내가 반드시 들어간다 (ADR-015)', () => {
    const last = ruleSkeleton(inputs()).steps.at(-1)!
    expect(last.phase).toBe('마무리')
    expect(last.base).toContain('QR')
  })

  it('학급 특성이 없으면 대응 줄이 붙지 않는다', () => {
    for (const step of ruleSkeleton(inputs({ class_traits: [] })).steps) {
      expect(step.accommodations).toEqual([])
    }
  })

  it('학급 특성이 있는 회차에만, 있는 항목만 대응 줄이 붙는다', () => {
    const steps = ruleSkeleton(inputs({ class_traits: ['통합학급 포함'] })).steps
    for (const step of steps) {
      expect(step.accommodations.map((a) => a.trait)).toEqual(['통합학급 포함'])
      expect(step.accommodations[0]!.how.length).toBeGreaterThan(5)
    }
  })

  it('프로그램 outline 이 없어도 골격이 나온다', () => {
    const s = ruleSkeleton(inputs({ program_outline: [] }))
    expect(s.steps.length).toBeGreaterThanOrEqual(3)
  })

  it('교안 어디에도 강사 연락처가 없다', () => {
    const text = JSON.stringify(ruleSkeleton(inputs()))
    expect(text).not.toMatch(/\d{2,3}-\d{3,4}-\d{4}/)
    expect(text).not.toMatch(/@[a-z]+\./i)
  })
})

// ============================================================================

describe('LLM 문장 병합 — 구조는 규칙이 지킨다', () => {
  const skeleton = ruleSkeleton(inputs({ class_traits: ['통합학급 포함'] }))

  it('LLM 이 단계를 더 줘도 단계 수가 늘지 않는다', () => {
    const merged = mergeLlmSteps(
      skeleton,
      Array.from({ length: 20 }, () => ({ base: '추가 단계' })),
    )
    expect(merged.steps.length).toBe(skeleton.steps.length)
  })

  it('LLM 이 단계를 적게 줘도 나머지는 규칙 문장을 유지한다', () => {
    const merged = mergeLlmSteps(skeleton, [{ base: '첫 단계만 바꿈' }])
    expect(merged.steps[0]!.base).toBe('첫 단계만 바꿈')
    expect(merged.steps[1]!.base).toBe(skeleton.steps[1]!.base)
  })

  it('시간·순서·단계 이름은 LLM 이 바꿀 수 없다', () => {
    const merged = mergeLlmSteps(
      skeleton,
      skeleton.steps.map(() => ({ base: 'x'.repeat(20) })),
    )
    expect(merged.steps.map((s) => s.minutes)).toEqual(skeleton.steps.map((s) => s.minutes))
    expect(merged.steps.map((s) => s.phase)).toEqual(skeleton.steps.map((s) => s.phase))
    expect(merged.steps.map((s) => s.title)).toEqual(skeleton.steps.map((s) => s.title))
  })

  it('연락처가 섞인 문장은 버리고 규칙 문장을 쓴다', () => {
    const merged = mergeLlmSteps(skeleton, [
      { base: '궁금하면 010-1234-5678 로 연락하세요', fast: 'http://example.com 참고' },
    ])
    expect(merged.steps[0]!.base).toBe(skeleton.steps[0]!.base)
    expect(merged.steps[0]!.fast).toBe(skeleton.steps[0]!.fast)
  })

  it('LLM 이 QR 안내를 지우면 규칙 문장으로 되돌린다', () => {
    const last = skeleton.steps.length - 1
    const llm = skeleton.steps.map(() => ({ base: '정리하고 인사합니다.' }))
    const merged = mergeLlmSteps(skeleton, llm)
    expect(merged.steps[last]!.base).toContain('QR')
  })

  it('회차에 없는 학급 특성을 LLM 이 만들어내도 버린다', () => {
    const merged = mergeLlmSteps(skeleton, [
      {
        base: '정상 문장입니다.',
        accommodations: [
          { trait: '통합학급 포함', how: '역할을 둘로 나눕니다.' },
          { trait: '휠체어 사용 학생 있음', how: '있지도 않은 특성' },
        ],
      },
    ])
    expect(merged.steps[0]!.accommodations.map((a) => a.trait)).toEqual(['통합학급 포함'])
  })

  it('빈 문자열·숫자·null 을 돌려줘도 규칙 문장이 남는다', () => {
    const merged = mergeLlmSteps(skeleton, [
      { base: '', fast: 42 as unknown as string, slow: null as unknown as string },
    ])
    expect(merged.steps[0]!.base).toBe(skeleton.steps[0]!.base)
    expect(merged.steps[0]!.fast).toBe(skeleton.steps[0]!.fast)
    expect(merged.steps[0]!.slow).toBe(skeleton.steps[0]!.slow)
  })
})

// ============================================================================

describe('교안 생성 전체 — 키가 없을 때 (E-06)', () => {
  beforeEach(() => {
    delete process.env.ANTHROPIC_API_KEY
  })

  it('API 키가 없어도 200 짜리 결과가 나온다', async () => {
    const draft = await generateLessonPlan(demoDs, session())
    expect(draft.source).toBe('rule')
    expect(draft.skeleton.steps.length).toBeGreaterThanOrEqual(3)
  })

  it('생성에 쓴 조건이 그대로 기록된다 (재현·검수용)', async () => {
    const s = session({ class_traits: ['첫 경험 다수'], duration_minutes: 120 })
    const draft = await generateLessonPlan(demoDs, s)
    expect(draft.inputs.class_traits).toEqual(['첫 경험 다수'])
    expect(draft.inputs.duration_minutes).toBe(120)
  })

  it('데모 회차에도 프로그램 outline 이 반영된다', () => {
    const built = buildInputs(demoDs, demo.lectureSessions[0]!)
    expect(built.field).toBe(demo.lectureSessions[0]!.field)
    expect(built.class_traits).toEqual(demo.lectureSessions[0]!.class_traits)
  })
})

describe('문장 품질 — 강사가 신뢰할 수 있는 한국어', () => {
  it('조사가 받침에 맞는다 — "드론로" 같은 문장이 나오지 않는다', () => {
    const drone = ruleSkeleton(inputs({ field: '드론' }))
    expect(JSON.stringify(drone)).not.toContain('드론로')
    expect(drone.steps[0]!.base).toContain('드론으로')

    // 받침 없는 분야는 "로" 를 쓴다.
    const beauty = ruleSkeleton(inputs({ field: '뷰티' }))
    expect(beauty.steps[0]!.base).toContain('뷰티로')
    expect(JSON.stringify(beauty)).not.toContain('뷰티으로')
  })

  it('목적격 조사도 받침에 맞는다', () => {
    const s = ruleSkeleton(inputs({ program_outline: ['기체 이해', '호버링'] }))
    const text = JSON.stringify(s)
    expect(text).toContain('기체 이해를')
    expect(text).toContain('호버링을')
    expect(text).not.toContain('을(를)')
  })

  it('단기과정 회차 번호가 차시 제목으로 새지 않는다', () => {
    const s = ruleSkeleton(
      inputs({ program_outline: ['1~2회 · 실내 호버링', '3~4회 · 항로 계획'] }),
    )
    const titles = s.steps.filter((x) => x.phase === '전개').map((x) => x.title)
    expect(titles).toEqual(['실내 호버링', '항로 계획'])
  })

  it('회차 번호가 없는 outline 은 그대로 쓴다', () => {
    const s = ruleSkeleton(inputs({ program_outline: ['3D 모델링 기초'] }))
    expect(s.steps.find((x) => x.phase === '전개')!.title).toBe('3D 모델링 기초')
  })
})
