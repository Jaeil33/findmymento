/**
 * 리허설의 가상 학생 답 — 순수 함수. tests/pilot-rehearse.test.ts 가 서버 검증(validateSurvey)을
 * 그대로 통과하는지 확인한다. 통과하지 못하면 리허설이 엉뚱한 이유로 실패한다.
 */

/** 자유서술 마스킹(E-08)이 실제로 걸리는지 보기 위한 가짜 번호. 저장된 값에 남으면 실패다. */
export const FAKE_PHONE = '010-1234-5678'

/**
 * 교실에서 나올 법한 답을 돌아가며 만든다. 후속 의향 2 이하면 선택 문항을 비운다 (설문 분기와 같게).
 * @param i 0부터
 * @param ctx { entryCode, band, field, fields, fieldUnsure }
 * @returns { probedMasking, payload } — payload 는 SurveyFlow 가 /api/survey 에 보내는 모양과 같다
 */
export function syntheticAnswer(i, { entryCode, band, field, fields, fieldUnsure }) {
  const years = band === 'elementary' ? [5, 6, 4, 3] : [1, 2, 3]
  const primary = fields.includes(field) ? field : null
  const other = fields.find((f) => f !== primary) ?? null
  const unsure = fieldUnsure ?? '아직 잘 모르겠어요'
  const fieldSets = [primary ? [primary] : [unsure], [...new Set([primary, other].filter(Boolean))], [unsure]]
  const followupIntent = [4, 3, 2][i % 3]
  const optional = followupIntent >= 3
  const probedMasking = i === 0 && optional
  const chosen = fieldSets[i % 3]
  return {
    probedMasking,
    payload: {
      entryCode,
      pseudoCode: null,
      grade: { band, year: years[i % years.length] },
      satisfaction: [5, 4, 3][i % 3],
      followupIntent,
      interestFields: chosen.length > 0 ? chosen : [unsure],
      wantToLearn: optional
        ? probedMasking
          ? `직접 설계해서 결과물까지 만들어 보고 싶어요 ${FAKE_PHONE}`
          : ['영상으로 찍어서 편집도 해 보고 싶어요', '원리가 궁금해서 더 배워 보고 싶어요'][i % 2]
        : '',
      desiredJob: optional ? ['제품 디자이너', '드론 조종사'][i % 2] : '',
      availableTimes: optional ? [['토요일'], ['평일 방과후', '방학 중']][i % 2] : [],
    },
  }
}
