import { describe, expect, it } from 'vitest'
import { rateLimit, validateInquiry, validateQuestion, validateSurvey } from '@/lib/validation'

const validSurvey = {
  entryCode: '482913',
  pseudoCode: '481000',
  grade: { band: 'middle', year: 2 },
  satisfaction: 4,
  followupIntent: 3,
  interestFields: ['드론'],
  wantToLearn: '',
  desiredJob: '',
  availableTimes: ['토요일'],
}

describe('설문 검증 (SURVEY.md)', () => {
  it('정상 값을 통과시킨다', () => {
    const r = validateSurvey(validSurvey)
    expect(r.ok).toBe(true)
  })

  it('만족도와 후속 의향을 각각 따로 검증한다 — 합쳐진 값이 아니다', () => {
    expect(validateSurvey({ ...validSurvey, satisfaction: 6 }).ok).toBe(false)
    expect(validateSurvey({ ...validSurvey, followupIntent: 5 }).ok).toBe(false)
    // 만족도 5점 척도 · 후속 의향 4점 척도가 서로 다른 범위임을 고정한다
    expect(validateSurvey({ ...validSurvey, satisfaction: 5, followupIntent: 4 }).ok).toBe(true)
    expect(validateSurvey({ ...validSurvey, followupIntent: 0 }).ok).toBe(false)
  })

  it('관심 분야는 최대 3개다', () => {
    const r = validateSurvey({
      ...validSurvey,
      interestFields: ['드론', '3D 모델링·프린팅', 'VR·AR', 'AI·코딩'],
    })
    expect(r.ok).toBe(false)
  })

  it('"아직 잘 모르겠어요"는 단독 선택이다', () => {
    expect(
      validateSurvey({ ...validSurvey, interestFields: ['아직 잘 모르겠어요'] }).ok,
    ).toBe(true)
    expect(
      validateSurvey({ ...validSurvey, interestFields: ['아직 잘 모르겠어요', '드론'] }).ok,
    ).toBe(false)
  })

  it('공급이 없는 분야도 선택할 수 있다 — 미충족 수요를 버리지 않는다', () => {
    for (const f of ['VR·AR', 'AI·코딩', '뷰티']) {
      expect(validateSurvey({ ...validSurvey, interestFields: [f] }).ok).toBe(true)
    }
  })

  it('가명코드 없이도 제출할 수 있다 (익명 응답)', () => {
    const r = validateSurvey({ ...validSurvey, pseudoCode: '' })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.pseudoCode).toBeNull()
  })

  it('자유서술은 선택이고 길이 제한이 있다', () => {
    expect(validateSurvey({ ...validSurvey, wantToLearn: '' }).ok).toBe(true)
    expect(validateSurvey({ ...validSurvey, wantToLearn: 'ㄱ'.repeat(201) }).ok).toBe(false)
    expect(validateSurvey({ ...validSurvey, desiredJob: 'ㄱ'.repeat(51) }).ok).toBe(false)
  })

  it('학년은 학년대와 숫자 조합이 맞아야 한다', () => {
    expect(validateSurvey({ ...validSurvey, grade: { band: 'middle', year: 5 } }).ok).toBe(false)
    expect(validateSurvey({ ...validSurvey, grade: { band: 'elementary', year: 5 } }).ok).toBe(true)
  })

  it('입장 코드는 6자리 숫자다', () => {
    expect(validateSurvey({ ...validSurvey, entryCode: '48291' }).ok).toBe(false)
    expect(validateSurvey({ ...validSurvey, entryCode: 'abcdef' }).ok).toBe(false)
  })

  it('이름·학교 같은 추가 필드를 보내도 무시된다', () => {
    const r = validateSurvey({ ...validSurvey, name: '김민준', school: '광명북중학교' })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(Object.keys(r.value)).not.toContain('name')
      expect(Object.keys(r.value)).not.toContain('school')
    }
  })
})

const validInquiry = {
  guardianName: '김보호',
  guardianContact: '010-1234-5678',
  regionCode: '41210',
  gradeBand: 'middle',
  field: '드론',
  targetType: 'program',
  targetId: 'pg-3',
  message: '주말 수업이 있는지 궁금합니다',
  consent: true,
}

describe('보호자 문의 검증 (ADR-014)', () => {
  it('정상 값을 통과시킨다', () => {
    expect(validateInquiry(validInquiry).ok).toBe(true)
  })

  it('동의하지 않으면 접수되지 않는다', () => {
    const r = validateInquiry({ ...validInquiry, consent: false })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.field).toBe('consent')
  })

  it('연락처는 휴대폰 또는 이메일이어야 한다', () => {
    expect(validateInquiry({ ...validInquiry, guardianContact: 'parent@example.com' }).ok).toBe(true)
    expect(validateInquiry({ ...validInquiry, guardianContact: '그냥 연락주세요' }).ok).toBe(false)
  })

  it('아이 이름·학교·생년월일을 보내도 저장 대상에 들어가지 않는다', () => {
    const r = validateInquiry({
      ...validInquiry,
      childName: '김민준',
      childSchool: '광명북중학교',
      childBirthday: '2012-03-04',
    })
    expect(r.ok).toBe(true)
    if (r.ok) {
      const keys = Object.keys(r.value)
      expect(keys).not.toContain('childName')
      expect(keys).not.toContain('childSchool')
      expect(keys).not.toContain('childBirthday')
      // 아이에 대해 남는 것은 학년대뿐이다
      expect(keys.filter((k) => k.toLowerCase().includes('child'))).toEqual([])
      expect(r.value.gradeBand).toBe('middle')
    }
  })

  it('지역코드는 수도권 66개 안이어야 한다', () => {
    expect(validateInquiry({ ...validInquiry, regionCode: '99999' }).ok).toBe(false)
  })

  it('요청 내용은 300자까지다', () => {
    expect(validateInquiry({ ...validInquiry, message: 'ㄱ'.repeat(301) }).ok).toBe(false)
  })

  it('대상이 없으면 targetId 는 null 로 정규화된다', () => {
    const r = validateInquiry({ ...validInquiry, targetType: 'none', targetId: 'pg-3' })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.targetId).toBeNull()
  })
})

describe('Q&A 질문 검증', () => {
  it('분야와 학년대가 필수다', () => {
    expect(validateQuestion({ field: '드론', body: '자격증 문의입니다', gradeBand: 'middle' }).ok).toBe(
      true,
    )
    expect(validateQuestion({ field: '없는분야', body: '질문입니다요', gradeBand: 'middle' }).ok).toBe(
      false,
    )
    expect(validateQuestion({ field: '드론', body: '질문입니다요', gradeBand: 'x' }).ok).toBe(false)
  })

  it('너무 짧은 질문을 거부한다', () => {
    expect(validateQuestion({ field: '드론', body: '?', gradeBand: 'middle' }).ok).toBe(false)
  })
})

describe('레이트 리밋 (E-21)', () => {
  it('한도를 넘으면 거부한다', () => {
    const key = `test-${Math.random()}`
    expect(rateLimit(key, 2, 60_000)).toBe(true)
    expect(rateLimit(key, 2, 60_000)).toBe(true)
    expect(rateLimit(key, 2, 60_000)).toBe(false)
  })

  it('키가 다르면 독립적으로 센다', () => {
    const a = `a-${Math.random()}`
    const b = `b-${Math.random()}`
    expect(rateLimit(a, 1, 60_000)).toBe(true)
    expect(rateLimit(a, 1, 60_000)).toBe(false)
    expect(rateLimit(b, 1, 60_000)).toBe(true)
  })
})
