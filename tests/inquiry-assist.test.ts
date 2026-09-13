// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as demo from '@/data/demo'
import type { Dataset } from '@/lib/db/dataset'
import { maskForStorage } from '@/lib/moderation'
import { regionName } from '@/lib/region'
import { FIELDS } from '@/types/domain'

/** Anthropic SDK 는 가짜다. 실제 API 를 호출하지 않는다. */
const createMock = vi.fn()
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: (...args: unknown[]) => createMock(...args) }
  },
}))

const {
  INQUIRY_MESSAGE_MAX,
  buildLlmPayload,
  cleanSituation,
  extractConditions,
  generateInquiryAssist,
  ruleInquiryAssist,
} = await import('@/lib/ai/inquiry-assist')

/**
 * 보호자 문의 도우미 (ADR-026).
 *
 * 여기서 반드시 지켜지는 것:
 * - 학년대·분야·시간대·프로그램은 **규칙**이 정한다. LLM 은 문의 글 한 편만 쓰고 그 밖을 바꾸지 못한다
 * - 보호자가 적은 아이 이름·학교·연락처·나이는 LLM 에 가지 않고, 초안에도 남지 않는다
 * - 초안에 숫자가 없다 — 학년 숫자·나이·생년이 문장으로 새지 않는다 (학년대까지만)
 * - 프로그램은 공개 디렉토리와 같은 규칙(승인 강사·지역 확장·중립 정렬)으로만 고른다
 * - LLM 이 실패하거나 가드에 걸려도 규칙 초안이 나온다
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

const PILOT = '41210'

const PII_TEXT =
  '중학교 2학년 아들이에요. 이름은 민준이고 광명하안중학교 다녀요. 학교 드론 특강 듣고 영상 찍는 데 푹 빠졌어요. 주말에 다닐 수 있을까요? 010-1234-5678'
const RAW_PII = ['민준', '하안중학교', '010-1234-5678', '5678']

const VALID_LLM_MESSAGE =
  '안녕하세요. 중학생 자녀를 둔 보호자입니다. 학교에서 드론 특강을 들은 뒤로 아이가 직접 찍은 장면을 영상으로 만드는 데 관심이 커졌습니다. 주말에 참여할 수 있는 수업이 있는지, 처음 배우는 아이도 따라갈 수 있는지와 준비물, 일정과 비용을 안내해 주시면 감사하겠습니다.'

function input(
  situation: string,
  over: Partial<{ regionCode: string; gradeBand: 'elementary' | 'middle' | 'high' | null; field: (typeof FIELDS)[number] | null }> = {},
) {
  return { situation, regionCode: PILOT, gradeBand: null, field: null, ...over }
}

/** 분야명(3D 모델링·프린팅)에 든 숫자는 빼고 본다. */
function digitsOutsideFields(text: string): boolean {
  let rest = text
  for (const f of FIELDS) rest = rest.split(f).join(' ')
  return /\d/.test(rest)
}

function llmReturns(value: unknown) {
  createMock.mockResolvedValue({ content: [{ type: 'text', text: JSON.stringify(value) }] })
}

const ORIGINAL = { ...process.env }

beforeEach(() => {
  delete process.env.NEXT_PUBLIC_SUPABASE_URL
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  delete process.env.ANTHROPIC_API_KEY
  process.env.DEMO_AI = 'off'
  createMock.mockReset()
  createMock.mockRejectedValue(new Error('키 없이 SDK 를 부르면 안 된다'))
})

afterEach(() => {
  process.env = { ...ORIGINAL }
})

describe('조건 정리 — 규칙', () => {
  it('중학생 · 드론 · 주말을 읽는다', () => {
    expect(extractConditions('중학교 2학년 아들이 드론 특강 듣고 주말마다 날리고 싶어해요')).toEqual({
      gradeBand: 'middle',
      field: '드론',
      times: ['토요일', '일요일'],
    })
  })

  it('초등학생 · 3D · 평일 방과후를 읽는다', () => {
    expect(
      extractConditions('초등학생 딸이 3D 프린터로 피규어 만드는 걸 좋아해요. 평일 방과후에 가능해요'),
    ).toEqual({ gradeBand: 'elementary', field: '3D 모델링·프린팅', times: ['평일 방과후'] })
  })

  it('고1 · 코딩 · 방학을 읽는다', () => {
    expect(extractConditions('고1인데 코딩으로 게임 만들고 싶대요. 방학 때 다니고 싶어요')).toEqual({
      gradeBand: 'high',
      field: 'AI·코딩',
      times: ['방학 중'],
    })
  })

  it('VR·AR 과 뷰티도 읽는다', () => {
    expect(extractConditions('VR 체험을 또 해 보고 싶어해요').field).toBe('VR·AR')
    expect(extractConditions('메이크업에 관심이 많아요').field).toBe('뷰티')
  })

  it('단서가 없으면 비워 둔다 — 추측하지 않는다', () => {
    expect(extractConditions('요즘 아이가 뭘 좋아하는지 잘 모르겠어요')).toEqual({
      gradeBand: null,
      field: null,
      times: [],
    })
  })

  it('"화장실" 같은 말로 뷰티를 고르지 않는다', () => {
    expect(extractConditions('수업 중에 화장실을 자주 가요').field).toBeNull()
  })
})

describe('아이 식별 정보 — LLM 에 가지 않는다', () => {
  it('이름·학교·연락처를 가리고, 가렸다고 표시한다', () => {
    const { clean, masked } = cleanSituation(PII_TEXT)
    expect(masked).toBe(true)
    for (const raw of RAW_PII) expect(clean).not.toContain(raw)
    expect(clean).toContain('드론')
  })

  it('"광명중 2학년"처럼 줄여 쓴 학교명도 가린다', () => {
    const { clean, masked } = cleanSituation('광명중 2학년이고 드론을 좋아해요')
    expect(masked).toBe(true)
    expect(clean).not.toContain('광명중')
  })

  it('나이·생년·학년 숫자를 남기지 않는다', () => {
    const { clean } = cleanSituation('2013년생이고 12살, 중2예요. 드론 좋아해요')
    expect(digitsOutsideFields(clean)).toBe(false)
    expect(clean).toContain('드론')
  })

  it('가릴 것이 없으면 그대로 두고 masked=false', () => {
    const { clean, masked } = cleanSituation('드론으로 영상 찍는 걸 좋아해요')
    expect(masked).toBe(false)
    expect(clean).toBe('드론으로 영상 찍는 걸 좋아해요')
  })

  it('LLM 페이로드에는 가린 설명과 규칙 조건만 있다 — 원문·강사명이 없다', () => {
    const draft = ruleInquiryAssist(ds, input(PII_TEXT))
    const sent = JSON.stringify(buildLlmPayload(input(PII_TEXT), draft))
    for (const raw of RAW_PII) expect(sent).not.toContain(raw)
    for (const i of demo.instructors) expect(sent).not.toContain(i.name)
    expect(sent).toContain('중학생')
    expect(sent).toContain('드론')
  })
})

describe('규칙 초안', () => {
  it('조건에 맞는 프로그램을 공개 디렉토리 규칙으로 최대 3개 고른다', () => {
    const draft = ruleInquiryAssist(ds, input(PII_TEXT))
    expect(draft.grade_band).toBe('middle')
    expect(draft.field).toBe('드론')
    expect(draft.times).toEqual(['토요일', '일요일'])
    expect(draft.stage).toBe('same')
    expect(draft.stage_message).toContain(regionName(PILOT))
    expect(draft.matches.length).toBeGreaterThan(0)
    expect(draft.matches.length).toBeLessThanOrEqual(3)

    const approved = new Set(demo.instructors.filter((i) => i.status === 'approved').map((i) => i.name))
    for (const m of draft.matches) {
      const program = demo.programs.find((p) => p.id === m.program_id)!
      expect(m.field).toBe('드론')
      expect(program.target_grades).toContain('middle')
      expect(approved.has(m.instructor_name)).toBe(true)
      expect(m.region_label).toBe(regionName(PILOT))
    }
  })

  it('정렬은 회차 수 → 제목뿐이다 (같은 단계 안에서, ADR-009)', () => {
    const draft = ruleInquiryAssist(ds, input('중학생 드론'))
    const counts = draft.matches.map((m) => m.session_count)
    expect(counts).toEqual([...counts].sort((a, b) => b - a))
  })

  it('초안·프로그램 어디에도 연락처가 없다', () => {
    const text = JSON.stringify(ruleInquiryAssist(ds, input(PII_TEXT)))
    expect(text).not.toMatch(/phone|email|contact|010-|@example/)
  })

  it('승인되지 않은 강사뿐인 분야는 프로그램 없이 "아직 없음"으로 안내한다', () => {
    for (const text of ['VR 체험을 좋아해요', '코딩 배우고 싶대요', '메이크업 배우고 싶대요']) {
      const draft = ruleInquiryAssist(ds, input(text))
      expect(draft.matches).toEqual([])
      expect(draft.stage).toBe('none')
      expect(draft.stage_message).toContain('아직')
    }
  })

  it('분야를 못 찾으면 프로그램을 고르지 않는다', () => {
    const draft = ruleInquiryAssist(ds, input('아이가 뭘 좋아하는지 모르겠어요'))
    expect(draft.field).toBeNull()
    expect(draft.matches).toEqual([])
    expect(draft.stage).toBeNull()
    expect(draft.stage_message).toBeNull()
  })

  it('글에 단서가 없으면 폼에서 고른 학년대·분야를 쓴다', () => {
    const draft = ruleInquiryAssist(ds, input('특강 듣고 관심이 생겼대요', { gradeBand: 'elementary', field: '드론' }))
    expect(draft.grade_band).toBe('elementary')
    expect(draft.field).toBe('드론')
  })

  it('글에 적힌 분야가 폼 선택보다 우선한다', () => {
    const draft = ruleInquiryAssist(ds, input('3D 프린터에 푹 빠졌어요', { field: '드론' }))
    expect(draft.field).toBe('3D 모델링·프린팅')
  })

  it('문의 글은 300자 이내, 숫자·아이 정보 없이 학년대와 분야를 담는다', () => {
    const draft = ruleInquiryAssist(ds, input(PII_TEXT))
    expect(draft.source).toBe('rule')
    expect(draft.message.length).toBeLessThanOrEqual(INQUIRY_MESSAGE_MAX)
    expect(draft.message).toContain('중학생')
    expect(draft.message).toContain('드론')
    expect(digitsOutsideFields(draft.message)).toBe(false)
    expect(maskForStorage(draft.message)).toBe(draft.message)
    for (const raw of RAW_PII) expect(draft.message).not.toContain(raw)
  })

  it('3D 분야여도 문의 글이 숫자 가드에 걸리지 않는다', () => {
    const draft = ruleInquiryAssist(ds, input('고등학생이고 3D 모델링 좋아해요'))
    expect(draft.message).toContain('3D 모델링·프린팅')
    expect(digitsOutsideFields(draft.message)).toBe(false)
  })

  it('가렸으면 가렸다고 고지하고, 설명은 저장하지 않는다고 고지한다', () => {
    const masked = ruleInquiryAssist(ds, input(PII_TEXT))
    const plain = ruleInquiryAssist(ds, input('드론으로 영상 찍는 걸 좋아해요'))
    expect(masked.masked).toBe(true)
    expect(masked.notices.join(' ')).toContain('빼고 정리했습니다')
    expect(plain.masked).toBe(false)
    expect(plain.notices.join(' ')).not.toContain('빼고 정리했습니다')
    for (const d of [masked, plain]) {
      expect(d.notices[0]).toContain('초안입니다')
      expect(d.notices.join(' ')).toContain('저장되지 않습니다')
    }
  })
})

describe('LLM 경로 — 문의 글 한 편만, 가드 통과분만', () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'sk-test'
  })

  it('가드를 통과한 글을 채택하고 source=llm', async () => {
    llmReturns({ message: VALID_LLM_MESSAGE })
    const draft = await generateInquiryAssist(ds, input(PII_TEXT))
    expect(draft.source).toBe('llm')
    expect(draft.message).toBe(VALID_LLM_MESSAGE)
  })

  it('SDK 에 보내는 내용에 원문 아이 정보가 없다', async () => {
    llmReturns({ message: VALID_LLM_MESSAGE })
    await generateInquiryAssist(ds, input(PII_TEXT))
    expect(createMock).toHaveBeenCalledTimes(1)
    const sent = JSON.stringify(createMock.mock.calls[0]![0])
    for (const raw of RAW_PII) expect(sent).not.toContain(raw)
  })

  it('LLM 이 분야·학년대·프로그램을 바꿀 수 없다', async () => {
    const rule = ruleInquiryAssist(ds, input(PII_TEXT))
    llmReturns({ message: VALID_LLM_MESSAGE, field: 'VR·AR', grade_band: 'high', matches: [], times: ['일요일'] })
    const draft = await generateInquiryAssist(ds, input(PII_TEXT))
    expect(draft.field).toBe(rule.field)
    expect(draft.grade_band).toBe(rule.grade_band)
    expect(draft.times).toEqual(rule.times)
    expect(draft.matches).toEqual(rule.matches)
    expect(draft.stage_message).toBe(rule.stage_message)
    expect(draft.notices).toEqual(rule.notices)
  })

  it.each([
    ['학년 숫자', '안녕하세요. 중2 아들을 둔 보호자입니다. 드론 수업을 찾고 있습니다. 일정과 비용을 알려 주세요.'],
    ['생년', '안녕하세요. 2013년생 아이 보호자입니다. 드론 수업을 찾고 있습니다. 일정과 비용을 알려 주세요.'],
    ['학교 전체 이름', '안녕하세요. 광명하안중학교에 다니는 아이 보호자입니다. 드론 수업 일정과 비용을 알려 주세요.'],
    ['줄여 쓴 학교명', '안녕하세요. 광명중 다니는 아이 보호자입니다. 드론 수업 일정과 비용을 알려 주세요.'],
    ['가림 표시', '안녕하세요. [이름 삭제] 보호자입니다. 드론 수업을 찾고 있습니다. 일정과 비용을 알려 주세요.'],
    ['한글로 적은 연락처', '안녕하세요. 드론 수업을 찾고 있습니다. 공일공일이삼사오육칠팔로 연락 주세요.'],
    ['메신저', '안녕하세요. 드론 수업을 찾고 있습니다. 자세한 건 카톡으로 이야기 나눠요.'],
    ['링크', '안녕하세요. 드론 수업을 찾고 있습니다. 자세한 건 www.example.com 을 봐 주세요.'],
    ['너무 긴 글', `안녕하세요. ${'드론 수업을 찾고 있습니다. '.repeat(30)}`],
    ['빈 글', '   '],
    ['문자열이 아님', 42],
  ])('%s → 버리고 규칙 글', async (_name, message) => {
    const rule = ruleInquiryAssist(ds, input(PII_TEXT))
    llmReturns({ message })
    const draft = await generateInquiryAssist(ds, input(PII_TEXT))
    expect(draft.source).toBe('rule')
    expect(draft.message).toBe(rule.message)
  })

  it('SDK 가 실패해도 던지지 않고 규칙 초안', async () => {
    createMock.mockRejectedValue(new Error('timeout'))
    const draft = await generateInquiryAssist(ds, input(PII_TEXT))
    expect(draft.source).toBe('rule')
    expect(draft.message).toBe(ruleInquiryAssist(ds, input(PII_TEXT)).message)
  })

  it('가리고 나서 남는 설명이 없으면 LLM 을 부르지 않는다', async () => {
    llmReturns({ message: VALID_LLM_MESSAGE })
    const draft = await generateInquiryAssist(ds, input('010-1234-5678'))
    expect(createMock).not.toHaveBeenCalled()
    expect(draft.source).toBe('rule')
  })
})

describe('키가 없으면', () => {
  it('SDK 를 부르지 않고 규칙 초안 (DEMO_AI=off)', async () => {
    const draft = await generateInquiryAssist(ds, input(PII_TEXT))
    expect(createMock).not.toHaveBeenCalled()
    expect(draft.source).toBe('rule')
  })
})
