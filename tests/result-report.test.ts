import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as demo from '@/data/demo'
import type { Dataset } from '@/lib/db/dataset'
import { sessionReport } from '@/lib/db/queries'
import { MIN_AGGREGATE_RESPONSES, containsAny, numbersWithin } from '@/lib/ai/guard'
import {
  allowedNumbers,
  bannedNames,
  buildLlmPayload,
  generateResultReport,
  mergeLlmResultReport,
  ruleResultReport,
} from '@/lib/ai/result-report'
import { FIELDS, type SurveyResponse } from '@/types/domain'

/**
 * AI 결과보고서 초안 (ADR-024 기능 4).
 *
 * 여기서 반드시 지켜지는 것:
 * - 숫자·개요·고지문은 규칙이 확정하고 LLM 이 바꿀 수 없다 — 보고서의 틀린 숫자는 결재선을 탄다
 * - 응답 5건 미만 회차는 통계·학생 의견을 싣지 않고 LLM 도 부르지 않는다 (ADR-018)
 * - LLM 입력에 강사명·기관명·업체명·student_id·가명코드·연락처가 없다
 * - 규칙에 없는 숫자, 금지된 이름, 학생 개인 지목이 든 LLM 문장은 버린다
 * - 창체 기록 참고 문구에 숫자·이름이 없다 (2026 기재요령)
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

const NOTICE_DRAFT = '초안입니다. 수치와 표현을 확인한 뒤 사용하세요.'
const NOTICE_RECORD =
  '창체 기록 참고 문구는 학교가 주최·주관한 활동에만 쓸 수 있고, AI가 만든 문장을 학교생활기록부에 그대로 입력하면 안 됩니다(2026 기재요령). 강사명·기관명·상호명은 기재할 수 없어 넣지 않았습니다.'
const NOTICE_SMALL = '응답이 5건 미만이라 만족도·후속 의향·학생 의견을 싣지 않았습니다.'

/** 그 회차의 응답을 앞에서부터 keep 건만 남긴다. */
function keepResponses(sessionId: string, keep: number): Dataset {
  let seen = 0
  return {
    ...ds,
    surveyResponses: ds.surveyResponses.filter((r) => r.session_id !== sessionId || seen++ < keep),
  }
}

/** 그 회차의 응답을 통째로 바꾼다. */
function replaceResponses(sessionId: string, rows: SurveyResponse[]): Dataset {
  return {
    ...ds,
    surveyResponses: [...ds.surveyResponses.filter((r) => r.session_id !== sessionId), ...rows],
  }
}

function row(sessionId: string, i: number, over: Partial<SurveyResponse> = {}): SurveyResponse {
  return {
    id: `t-${sessionId}-${i}`,
    session_id: sessionId,
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

const llmText = (obj: unknown) => ({ content: [{ type: 'text', text: JSON.stringify(obj) }] })

const OK_SENTENCE = '학생들이 촬영 활동에 적극적으로 참여했습니다.'

beforeEach(() => {
  delete process.env.ANTHROPIC_API_KEY
  createMock.mockReset()
})

afterEach(() => {
  delete process.env.ANTHROPIC_API_KEY
})

describe('규칙 — 숫자·개요·고지문은 규칙이 확정한다', () => {
  it('데모 ls-1 의 지표가 sessionReport 값(반올림 규칙 적용)과 같다', () => {
    const report = sessionReport(ds, 'ls-1')!
    const draft = ruleResultReport(ds, 'ls-1')!

    expect(draft.session_id).toBe('ls-1')
    expect(draft.sample_sufficient).toBe(true)
    expect(draft.metrics.response_count).toBe(report.responseCount)
    expect(draft.metrics.expected).toBe(report.expected)
    expect(draft.metrics.response_rate_pct).toBe(Math.round(report.responseRate * 100))
    expect(draft.metrics.satisfaction_avg).toBe(Math.round(report.satisfactionAvg * 10) / 10)
    expect(draft.metrics.followup_high_count).toBe(report.followupHighCount)
    expect(draft.metrics.followup_high_pct).toBe(Math.round(report.followupHighRate * 100))
    expect(draft.source).toBe('rule')
  })

  it('관심 분야 상위는 최대 3개, 신산업 분야만, 많은 순이다', () => {
    const { top_fields } = ruleResultReport(ds, 'ls-1')!.metrics
    expect(top_fields.length).toBeGreaterThan(0)
    expect(top_fields.length).toBeLessThanOrEqual(3)
    for (const f of top_fields) expect(FIELDS as readonly string[]).toContain(f.field)
    for (let i = 1; i < top_fields.length; i += 1) {
      expect(top_fields[i - 1]!.count).toBeGreaterThanOrEqual(top_fields[i]!.count)
    }
  })

  it('제목과 운영 개요 7항목을 규칙으로 채운다', () => {
    const session = ds.lectureSessions.find((s) => s.id === 'ls-1')!
    const draft = ruleResultReport(ds, 'ls-1')!
    expect(draft.title).toBe(`${session.title} 운영 결과보고(초안)`)
    expect(draft.overview.map((o) => o.label)).toEqual([
      '일시',
      '장소',
      '대상',
      '예상 인원',
      '시수',
      '분야',
      '배정 강사',
    ])
    const value = (label: string) => draft.overview.find((o) => o.label === label)!.value
    expect(value('장소')).toBe(session.venue)
    expect(value('대상')).toContain('중등')
    expect(value('예상 인원')).toContain(String(session.expected_students))
    expect(value('시수')).toContain(String(session.duration_minutes))
    expect(value('분야')).toBe(session.field)
    expect(value('배정 강사')).toBe('박서연')
  })

  it('배정 강사가 없는 회차는 개요에 미배정으로 쓴다 (E-23)', () => {
    const draft = ruleResultReport(ds, 'ls-3')!
    expect(draft.overview.find((o) => o.label === '배정 강사')!.value).toBe('미배정')
  })

  it('표본이 충분하면 고지문은 초안·창체 두 줄이다', () => {
    expect(ruleResultReport(ds, 'ls-1')!.notices).toEqual([NOTICE_DRAFT, NOTICE_RECORD])
  })

  it('성과·개선점·후속 계획이 비지 않고 각 4개 이하다', () => {
    const draft = ruleResultReport(ds, 'ls-1')!
    for (const list of [draft.outcomes, draft.improvements, draft.next_steps]) {
      expect(list.length).toBeGreaterThan(0)
      expect(list.length).toBeLessThanOrEqual(4)
    }
    expect(draft.student_voice.length).toBeLessThanOrEqual(4)
  })

  it('없는 회차는 null', () => {
    expect(ruleResultReport(ds, 'ls-없음')).toBeNull()
  })
})

describe('표본 부족 — 응답 5건 미만은 통계를 싣지 않는다 (ADR-018)', () => {
  const small = keepResponses('ls-1', MIN_AGGREGATE_RESPONSES - 1)

  it('응답 4건이면 통계·관심 분야·학생 의견이 비어 있다', () => {
    const draft = ruleResultReport(small, 'ls-1')!
    expect(draft.sample_sufficient).toBe(false)
    expect(draft.metrics.response_count).toBe(4)
    expect(draft.metrics.satisfaction_avg).toBeNull()
    expect(draft.metrics.followup_high_count).toBeNull()
    expect(draft.metrics.followup_high_pct).toBeNull()
    expect(draft.metrics.top_fields).toEqual([])
    expect(draft.student_voice).toEqual([])
  })

  it('성과는 응답 수와 통계 미기재 사유 한 문장이다', () => {
    const draft = ruleResultReport(small, 'ls-1')!
    expect(draft.outcomes).toHaveLength(1)
    expect(draft.outcomes[0]).toContain('4건')
    expect(draft.outcomes[0]).toContain('5건 미만이라 통계를 싣지 않습니다')
  })

  it('개선점에 마무리 3분 전 QR 안내 문장이 들어간다', () => {
    const draft = ruleResultReport(small, 'ls-1')!
    expect(draft.improvements.some((s) => s.includes('마무리 3분 전') && s.includes('QR 안내'))).toBe(
      true,
    )
  })

  it('표본 부족 고지문이 세 번째 줄로 붙는다', () => {
    expect(ruleResultReport(small, 'ls-1')!.notices).toEqual([
      NOTICE_DRAFT,
      NOTICE_RECORD,
      NOTICE_SMALL,
    ])
  })

  it('LLM 입력을 만들지 않는다', () => {
    expect(buildLlmPayload(small, ruleResultReport(small, 'ls-1')!)).toBeNull()
  })

  it('응답 0건 회차도 같은 규칙이다 (E-24)', () => {
    const draft = ruleResultReport(ds, 'ls-3')!
    expect(draft.sample_sufficient).toBe(false)
    expect(draft.metrics.response_count).toBe(0)
    expect(draft.metrics.response_rate_pct).toBe(0)
    expect(buildLlmPayload(ds, draft)).toBeNull()
  })

  it('경계: 정확히 5건이면 표본 충분이다', () => {
    const five = keepResponses('ls-1', MIN_AGGREGATE_RESPONSES)
    const draft = ruleResultReport(five, 'ls-1')!
    expect(draft.sample_sufficient).toBe(true)
    expect(draft.metrics.satisfaction_avg).not.toBeNull()
    expect(buildLlmPayload(five, draft)).not.toBeNull()
  })

  it('LLM 이 무엇을 주든 표본 부족 초안의 학생 의견은 비어 있다', () => {
    const draft = ruleResultReport(small, 'ls-1')!
    const merged = mergeLlmResultReport(
      draft,
      { student_voice: ['학생들은 촬영을 더 배우고 싶어 했습니다.'] },
      { allowed: allowedNumbers(small, draft), banned: bannedNames(small, 'ls-1') },
    )
    expect(merged.student_voice).toEqual([])
  })

  it('키가 있어도 응답 4건 회차는 LLM 을 부르지 않는다', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    createMock.mockResolvedValue(llmText({ outcomes: [OK_SENTENCE] }))
    const draft = await generateResultReport(small, 'ls-1')
    expect(createMock).not.toHaveBeenCalled()
    expect(draft!.source).toBe('rule')
    expect(draft!.student_voice).toEqual([])
  })
})

describe('LLM 입력 — 이름·학생 식별값·연락처가 없다', () => {
  const session = ds.lectureSessions.find((s) => s.id === 'ls-1')!
  const instructor = ds.instructors.find((i) => i.id === session.instructor_id)!
  const provider = ds.providers.find((p) => p.id === instructor.provider_id)!
  const org = ds.organizations.find((o) => o.id === session.org_id)!

  it('강사명·기관명·업체명·student_id·가명코드가 들어가지 않는다', () => {
    const payload = buildLlmPayload(ds, ruleResultReport(ds, 'ls-1')!)
    expect(payload).not.toBeNull()
    const text = JSON.stringify(payload)

    for (const name of [instructor.name, org.name, provider.name]) {
      expect(text, name).not.toContain(name)
    }

    const rows = ds.surveyResponses.filter((r) => r.session_id === 'ls-1')
    const studentIds = rows.map((r) => r.student_id).filter((v): v is string => v !== null)
    const codes = ds.students.filter((s) => studentIds.includes(s.id)).map((s) => s.pseudo_code)
    expect(studentIds.length).toBeGreaterThan(0)
    expect(codes.length).toBeGreaterThan(0)
    for (const id of studentIds) expect(text).not.toContain(id)
    for (const code of codes) expect(text).not.toContain(code)
    expect(text).not.toContain('student_id')
    expect(text).not.toContain('pseudo_code')
  })

  it('학생 인용은 5개 이하다', () => {
    const rows = Array.from({ length: 9 }, (_, i) =>
      row('ls-1', i, { want_to_learn: `드론 촬영 기법을 더 배우고 싶어요 ${'가'.repeat(i + 1)}` }),
    )
    const d = replaceResponses('ls-1', rows)
    const payload = buildLlmPayload(d, ruleResultReport(d, 'ls-1')!) as Record<string, unknown>
    const quotes = payload['학생_자유서술'] as string[]
    expect(quotes.length).toBeGreaterThan(0)
    expect(quotes.length).toBeLessThanOrEqual(5)
  })

  it('연락처·강사명이 섞인 인용은 빠진다', () => {
    const rows = [
      row('ls-1', 0, { want_to_learn: '드론 영상 편집을 배우고 싶어요 010-1234-5678 로 연락 주세요' }),
      row('ls-1', 1, { want_to_learn: `${instructor.name} 선생님처럼 항공촬영을 하고 싶어요` }),
      row('ls-1', 2, { want_to_learn: '드론이 스스로 나는 원리를 알고 싶어요' }),
      row('ls-1', 3),
      row('ls-1', 4),
      row('ls-1', 5),
    ]
    const d = replaceResponses('ls-1', rows)
    const payload = buildLlmPayload(d, ruleResultReport(d, 'ls-1')!) as Record<string, unknown>
    const text = JSON.stringify(payload)
    expect(text).not.toContain('010-1234-5678')
    expect(text).not.toContain(instructor.name)
    expect(payload['학생_자유서술']).toEqual(['드론이 스스로 나는 원리를 알고 싶어요'])
  })

  it('규칙 초안의 학생 의견에도 걸러진 인용이 새지 않는다', () => {
    const rows = [
      row('ls-1', 0, { want_to_learn: '드론 영상 편집을 배우고 싶어요 010-1234-5678 로 연락 주세요' }),
      row('ls-1', 1, { want_to_learn: `${instructor.name} 선생님처럼 항공촬영을 하고 싶어요` }),
      row('ls-1', 2),
      row('ls-1', 3),
      row('ls-1', 4),
    ]
    const d = replaceResponses('ls-1', rows)
    const text = JSON.stringify(ruleResultReport(d, 'ls-1')!.student_voice)
    expect(text).not.toContain('010-1234-5678')
    expect(text).not.toContain(instructor.name)
  })
})

describe('병합 — 가드를 통과한 LLM 문장만 쓴다', () => {
  const base = ruleResultReport(ds, 'ls-1')!
  const ctx = { allowed: allowedNumbers(ds, base), banned: bannedNames(ds, 'ls-1') }

  it('허용 숫자에 지표·시수·예상 인원·날짜·임계치·1~4가 들어 있다', () => {
    const session = ds.lectureSessions.find((s) => s.id === 'ls-1')!
    const [y, m, d] = session.held_on.split('-').map(Number)
    for (const n of [
      base.metrics.response_count,
      base.metrics.expected,
      base.metrics.response_rate_pct,
      base.metrics.satisfaction_avg!,
      base.metrics.followup_high_count!,
      base.metrics.followup_high_pct!,
      ...base.metrics.top_fields.map((f) => f.count),
      session.duration_minutes,
      session.expected_students,
      y!,
      m!,
      d!,
      MIN_AGGREGATE_RESPONSES,
      1,
      2,
      3,
      4,
    ]) {
      expect(ctx.allowed).toContain(n)
    }
  })

  it('금지 이름은 배정 강사명·발주 기관명·소속 업체명이다', () => {
    expect(ctx.banned).toEqual(expect.arrayContaining(['박서연', '광명시청소년수련관', '3DNFLY']))
    // 미배정 회차는 기관명만 남는다.
    expect(bannedNames(ds, 'ls-3')).toEqual(['광명시청소년수련관'])
    expect(bannedNames(ds, 'ls-없음')).toEqual([])
  })

  it('규칙에 없는 숫자가 든 문장은 버린다', () => {
    expect(ctx.allowed).not.toContain(4.9)
    const merged = mergeLlmResultReport(
      base,
      { outcomes: ['만족도 평균 4.9점으로 높았습니다.', OK_SENTENCE] },
      ctx,
    )
    expect(merged.outcomes).toEqual([OK_SENTENCE])
    expect(merged.source).toBe('llm')
  })

  it('숫자가 전부 규칙 값이면 채택한다', () => {
    const s = `응답 ${base.metrics.response_count}건 중 후속 의향 3점 이상이 ${base.metrics.followup_high_pct}%였습니다.`
    const merged = mergeLlmResultReport(base, { outcomes: [s] }, ctx)
    expect(merged.outcomes).toEqual([s])
  })

  it('문장이 전부 버려지면 그 필드는 규칙 값이 남는다', () => {
    const merged = mergeLlmResultReport(base, { outcomes: ['만족도 평균 4.9점으로 높았습니다.'] }, ctx)
    expect(merged.outcomes).toEqual(base.outcomes)
    expect(merged.source).toBe('rule')
  })

  it('강사명·기관명이 든 문장은 버린다', () => {
    const merged = mergeLlmResultReport(
      base,
      {
        improvements: ['박서연 강사의 시범 시간을 늘립니다.'],
        next_steps: ['광명시청소년수련관 에서 후속 과정을 검토합니다.'],
      },
      ctx,
    )
    expect(merged.improvements).toEqual(base.improvements)
    expect(merged.next_steps).toEqual(base.next_steps)
  })

  it('연락처·링크가 든 문장은 버린다', () => {
    const merged = mergeLlmResultReport(
      base,
      { next_steps: ['자세한 내용은 https://example.com 을 참고합니다.'] },
      ctx,
    )
    expect(merged.next_steps).toEqual(base.next_steps)
  })

  it('학생 개인을 지목하는 문장은 버린다', () => {
    const merged = mergeLlmResultReport(
      base,
      { student_voice: ['중2 학생 A는 촬영에 가장 적극적이었습니다.'] },
      ctx,
    )
    expect(merged.student_voice).toEqual(base.student_voice)
  })

  it('목록은 최대 4개다', () => {
    const merged = mergeLlmResultReport(
      base,
      { next_steps: Array.from({ length: 7 }, (_, i) => `후속 검토 항목 ${'가'.repeat(i + 1)}입니다.`) },
      ctx,
    )
    expect(merged.next_steps).toHaveLength(4)
  })

  it('창체 참고 문구에 기관명이 들어가면 규칙 문구가 남는다', () => {
    const merged = mergeLlmResultReport(
      base,
      { record_reference: '광명시청소년수련관에서 진행한 드론 특강에 참여하여 직업 세계를 탐색함.' },
      ctx,
    )
    expect(merged.record_reference).toBe(base.record_reference)
  })

  it('창체 참고 문구에 숫자가 들어가면 규칙 문구가 남는다 — 지표 숫자도 안 된다', () => {
    const merged = mergeLlmResultReport(
      base,
      { record_reference: `진로활동으로 드론 특강에 참여하여 ${base.metrics.response_count}명과 직업 세계를 탐색함.` },
      ctx,
    )
    expect(merged.record_reference).toBe(base.record_reference)
  })

  it('창체 참고 문구가 두 문장이면 규칙 문구가 남는다', () => {
    const merged = mergeLlmResultReport(
      base,
      { record_reference: '드론 특강에 참여함. 항공촬영 직업을 탐색함.' },
      ctx,
    )
    expect(merged.record_reference).toBe(base.record_reference)
  })

  it('가드를 통과한 창체 참고 문구는 채택한다', () => {
    const s = '진로활동으로 드론 분야 직업인 특강에 참여하여 항공촬영 직업의 역할을 탐색함.'
    const merged = mergeLlmResultReport(base, { record_reference: s }, ctx)
    expect(merged.record_reference).toBe(s)
    expect(merged.source).toBe('llm')
  })

  it('LLM 이 제목·개요·지표·고지문을 보내도 무시한다', () => {
    const merged = mergeLlmResultReport(
      base,
      {
        session_id: 'ls-조작',
        title: '조작된 제목',
        overview: [{ label: '일시', value: '조작' }],
        sample_sufficient: false,
        metrics: { response_count: 999, satisfaction_avg: 4.9 },
        notices: [],
        source: 'rule',
        outcomes: [OK_SENTENCE],
      },
      ctx,
    )
    expect(merged.session_id).toBe(base.session_id)
    expect(merged.title).toBe(base.title)
    expect(merged.overview).toEqual(base.overview)
    expect(merged.sample_sufficient).toBe(base.sample_sufficient)
    expect(merged.metrics).toEqual(base.metrics)
    expect(merged.notices).toEqual(base.notices)
    expect(merged.outcomes).toEqual([OK_SENTENCE])
  })

  it('null·문자열·배열·빈 배열 응답이면 규칙 값이 그대로 남는다', () => {
    expect(mergeLlmResultReport(base, null, ctx)).toEqual(base)
    expect(mergeLlmResultReport(base, '문자열', ctx)).toEqual(base)
    expect(mergeLlmResultReport(base, [OK_SENTENCE], ctx)).toEqual(base)
    expect(
      mergeLlmResultReport(
        base,
        { outcomes: [], student_voice: [], improvements: [], next_steps: [], record_reference: '' },
        ctx,
      ),
    ).toEqual(base)
  })
})

describe('전체 — generateResultReport', () => {
  it('ANTHROPIC_API_KEY 없이도 규칙 초안이 나온다 (E-06)', async () => {
    const draft = await generateResultReport(ds, 'ls-1')
    expect(draft).not.toBeNull()
    expect(draft!.source).toBe('rule')
    expect(draft!.metrics.response_count).toBeGreaterThan(0)
    expect(createMock).not.toHaveBeenCalled()
  })

  it('없는 회차는 null', async () => {
    expect(await generateResultReport(ds, 'ls-없음')).toBeNull()
  })

  it('LLM 이 성공하면 가드를 통과한 문장만 병합하고 source 는 llm 이다', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    createMock.mockResolvedValue(
      llmText({
        outcomes: [OK_SENTENCE, '만족도 평균 4.9점으로 높았습니다.'],
        student_voice: ['박서연 선생님 수업이 좋았다는 의견이 많았습니다.'],
        improvements: ['마무리에 다음 단계 교육 안내를 더 분명히 합니다.'],
        next_steps: ['후속 과정 개설 여부를 담당 부서와 검토합니다.'],
        record_reference: '진로활동으로 드론 분야 직업인 특강에 참여하여 직업 세계를 탐색함.',
      }),
    )
    const base = ruleResultReport(ds, 'ls-1')!
    const draft = await generateResultReport(ds, 'ls-1')

    expect(createMock).toHaveBeenCalledTimes(1)
    expect(draft!.source).toBe('llm')
    expect(draft!.outcomes).toEqual([OK_SENTENCE])
    expect(draft!.student_voice).toEqual(base.student_voice)
    expect(draft!.improvements).toEqual(['마무리에 다음 단계 교육 안내를 더 분명히 합니다.'])
    expect(draft!.metrics).toEqual(base.metrics)

    // 실제로 모델에 나간 요청에도 이름이 없다.
    const sent = JSON.stringify(createMock.mock.calls[0])
    for (const name of ['박서연', '광명시청소년수련관', '3DNFLY']) expect(sent).not.toContain(name)
  })

  it('LLM 호출이 실패해도 throw 하지 않고 규칙 초안을 반환한다', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    createMock.mockRejectedValue(new Error('rate limited'))
    const draft = await generateResultReport(ds, 'ls-1')
    expect(draft).toEqual(ruleResultReport(ds, 'ls-1'))
  })

  it('아무것도 저장하지 않는다 — Dataset 이 그대로다 (ADR-024)', async () => {
    const before = JSON.stringify(ds)
    await generateResultReport(ds, 'ls-1')
    expect(JSON.stringify(ds)).toBe(before)
  })
})

describe('창체 진로활동 기록 참고 문구 — 데모 전 회차', () => {
  for (const session of demo.lectureSessions) {
    it(`${session.id}: 한 문장이고 숫자·강사명·기관명·업체명이 없다`, () => {
      const ref = ruleResultReport(ds, session.id)!.record_reference
      expect(ref.length).toBeGreaterThan(0)
      expect(ref.length).toBeLessThanOrEqual(150)
      // 분야명 '3D 모델링·프린팅' 의 3 은 숫자가 아니다.
      expect(numbersWithin(ref, [], FIELDS)).toBe(true)
      expect(containsAny(ref, bannedNames(ds, session.id))).toBe(false)
      for (const p of ds.providers) expect(ref).not.toContain(p.name)
      for (const o of ds.organizations) expect(ref).not.toContain(o.name)
      expect(ref).not.toMatch(/[.!?]\s+\S/)
    })
  }
})
