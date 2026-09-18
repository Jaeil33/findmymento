import { describe, expect, it } from 'vitest'
import { FIELDS, FIELD_UNSURE } from '@/types/domain'
import { maskForStorage } from '@/lib/moderation'
import { validateSurvey } from '@/lib/validation'
import { FAKE_PHONE, syntheticAnswer } from '../scripts/pilot/rehearse-lib.mjs'

/**
 * 리허설(scripts/pilot/rehearse.mjs)의 가상 학생 답은 **실제 서버 검증을 그대로 통과해야** 한다.
 * 통과하지 못하면 리허설이 배포 문제가 아니라 가짜 답 때문에 실패하고, 수업 전에 엉뚱한 곳을 고치게 된다.
 */

const ctx = (band: string, field: string) => ({
  entryCode: '123456',
  band,
  field,
  fields: [...FIELDS],
  fieldUnsure: FIELD_UNSURE,
})

describe('syntheticAnswer — /api/survey 의 validateSurvey 를 통과한다', () => {
  for (const band of ['elementary', 'middle', 'high']) {
    for (const field of [...FIELDS, '요리']) {
      it(`${band} · ${field}`, () => {
        for (let i = 0; i < 9; i++) {
          const { payload } = syntheticAnswer(i, ctx(band, field))
          const parsed = validateSurvey(payload)
          expect(parsed.ok, `#${i} ${JSON.stringify(payload)}`).toBe(true)
        }
      })
    }
  }

  it('후속 의향 2 이하면 선택 문항을 비운다 (설문 분기와 같게)', () => {
    for (let i = 0; i < 9; i++) {
      const { payload } = syntheticAnswer(i, ctx('middle', '드론'))
      if (payload.followupIntent < 3) {
        expect(payload.wantToLearn).toBe('')
        expect(payload.desiredJob).toBe('')
        expect(payload.availableTimes).toEqual([])
      }
    }
  })

  it('첫 학생은 전화번호를 적는다 — 서버 마스킹이 지우는 형식이어야 한다', () => {
    const first = syntheticAnswer(0, ctx('middle', '드론'))
    expect(first.probedMasking).toBe(true)
    expect(first.payload.wantToLearn).toContain(FAKE_PHONE)
    expect(maskForStorage(first.payload.wantToLearn) ?? '').not.toContain('1234-5678')
    expect(syntheticAnswer(1, ctx('middle', '드론')).probedMasking).toBe(false)
  })

  it('익명 응답이다 (가명코드 없음)', () => {
    expect(syntheticAnswer(0, ctx('middle', '드론')).payload.pseudoCode).toBeNull()
  })
})
