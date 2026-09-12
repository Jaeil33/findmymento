import { describe, expect, it } from 'vitest'
import { maskForStorage, moderate, studentAlias } from '@/lib/moderation'

describe('연락처 마스킹 (E-08)', () => {
  it('휴대폰 번호를 지운다', () => {
    const r = moderate('연락처는 010-1234-5678 이에요')
    expect(r.findings).toContain('phone')
    expect(r.clean).not.toContain('1234')
    expect(r.clean).toContain('[연락처 삭제]')
  })

  it('구분자 없는 번호도 지운다', () => {
    expect(moderate('01012345678').clean).not.toMatch(/\d{8}/)
  })

  it('공백·점으로 끊어 적은 번호도 지운다', () => {
    expect(moderate('010 1234 5678').findings).toContain('phone')
    expect(moderate('010.1234.5678').findings).toContain('phone')
  })

  it('한글로 적은 번호 우회도 잡는다', () => {
    expect(moderate('공일공일이삼사오육칠팔').findings).toContain('phone')
  })

  it('이메일을 지운다', () => {
    const r = moderate('메일 주세요 hello@example.com')
    expect(r.findings).toContain('email')
    expect(r.clean).not.toContain('example.com')
  })

  it('골뱅이로 적은 이메일도 잡는다', () => {
    expect(moderate('hello 골뱅이 example 점 com').findings).toContain('email')
  })
})

describe('외부 링크 차단', () => {
  it('http 링크를 지운다', () => {
    expect(moderate('여기 보세요 https://example.com/abc').findings).toContain('url')
  })

  it('맨눈에 링크로 보이는 도메인도 지운다', () => {
    expect(moderate('example.com 으로 오세요').findings).toContain('url')
  })

  it('메신저 아이디 유도를 잡는다', () => {
    expect(moderate('카톡으로 연락주세요').findings).toContain('messenger')
    expect(moderate('인스타 @myhandle 입니다').findings).toContain('messenger')
  })
})

describe('학교명·이름 마스킹 (E-22)', () => {
  it('학교명을 지운다 — 아이를 특정할 수 있는 가장 흔한 정보다', () => {
    const r = moderate('광명북중학교 2학년이에요')
    expect(r.findings).toContain('school')
    expect(r.clean).not.toContain('광명북')
    expect(r.clean).toContain('2학년')
  })

  it('소개 어구가 붙은 이름을 지운다', () => {
    const r = moderate('제 이름은 김민준 이고 드론을 좋아해요')
    expect(r.findings).toContain('name')
    expect(r.clean).not.toContain('김민준')
  })

  it('일반 본문의 한글 단어를 이름으로 오인하지 않는다', () => {
    const r = moderate('드론으로 영상 찍는 법을 배우고 싶어요')
    expect(r.findings).toEqual([])
    expect(r.clean).toBe('드론으로 영상 찍는 법을 배우고 싶어요')
  })
})

describe('block 모드 (E-09 · E-10)', () => {
  it('연락처가 있으면 차단한다', () => {
    const r = moderate('010-1234-5678 로 연락주세요', 'block')
    expect(r.blocked).toBe(true)
    expect(r.message).toBeTruthy()
  })

  it('차단 안내에 규칙 상세를 적지 않는다 — 우회 방법을 알려주는 것과 같다', () => {
    const r = moderate('제 번호는 010-1234-5678', 'block')
    expect(r.message).not.toMatch(/정규식|패턴|regex|필터 규칙/)
    expect(r.message!.length).toBeLessThan(60)
  })

  it('학교명만 있으면 차단하지 않고 가린다', () => {
    const r = moderate('광명북중학교 다녀요', 'block')
    expect(r.blocked).toBe(false)
    expect(r.clean).toContain('[학교명 삭제]')
  })

  it('깨끗한 글은 통과한다', () => {
    const r = moderate('드론 자격증은 몇 살부터 딸 수 있어요?', 'block')
    expect(r.blocked).toBe(false)
    expect(r.message).toBeNull()
  })
})

describe('maskForStorage', () => {
  it('빈 값은 null 로 정규화한다', () => {
    expect(maskForStorage('')).toBeNull()
    expect(maskForStorage('   ')).toBeNull()
    expect(maskForStorage(null)).toBeNull()
    expect(maskForStorage(undefined)).toBeNull()
  })

  it('원문을 돌려주지 않는다', () => {
    const stored = maskForStorage('저는 김민준이고 010-1234-5678 입니다')
    expect(stored).not.toContain('김민준')
    expect(stored).not.toContain('1234')
  })
})

describe('studentAlias — 가명코드 원문을 노출하지 않는다', () => {
  it('`중2 학생 A` 형식을 쓴다', () => {
    expect(studentAlias('중2', 0)).toBe('중2 학생 A')
    expect(studentAlias('고1', 2)).toBe('고1 학생 C')
  })

  it('26명을 넘어도 중복되지 않는다', () => {
    const aliases = new Set(Array.from({ length: 60 }, (_, i) => studentAlias('중2', i)))
    expect(aliases.size).toBe(60)
  })
})
