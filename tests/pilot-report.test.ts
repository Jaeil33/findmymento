import { describe, expect, it } from 'vitest'
import {
  FIELD_UNSURE,
  RECOMMENDATION_HEADERS,
  RESPONSE_HEADERS,
  csvCell,
  estimateCostUsd,
  formatKst,
  gradeLabel,
  interestRows,
  kstStamp,
  recommendationRows,
  renderSummaryMarkdown,
  responseRows,
  summarize,
  toCsv,
  type RecommendationLogRow,
  type ResponseRow,
} from '../scripts/pilot/report-lib.mjs'

/**
 * 파일럿 내보내기(scripts/pilot/export.mjs)의 순수 함수.
 * 수업 다음 날 이 숫자가 지원서·결과보고서에 들어간다 — 집계가 틀리면 되돌릴 방법이 없다.
 */

const R = (over: Partial<ResponseRow> & { id: string }): ResponseRow => ({
  created_at: '2026-09-19T01:30:00Z',
  student_id: null,
  grade_band: 'middle',
  grade_year: 1,
  satisfaction: 4,
  followup_intent: 3,
  interest_fields: [],
  want_to_learn: null,
  desired_job: null,
  available_times: [],
  ...over,
})

const responses: ResponseRow[] = [
  R({
    id: 'r1',
    satisfaction: 5,
    followup_intent: 4,
    interest_fields: ['3D 모델링·프린팅', 'AI·코딩'],
    want_to_learn: '내 물건을 설계해 보고 싶어요 | 진짜로',
    available_times: ['토요일'],
  }),
  R({
    id: 'r2',
    student_id: 'st-1',
    grade_year: 2,
    satisfaction: 4,
    followup_intent: 3,
    interest_fields: ['3D 모델링·프린팅'],
    desired_job: '제품 디자이너',
    available_times: ['토요일', '방학 중'],
  }),
  R({ id: 'r3', satisfaction: 2, followup_intent: 1, interest_fields: [FIELD_UNSURE] }),
  R({ id: 'r4', grade_year: 3, satisfaction: 3, followup_intent: 2, interest_fields: ['AI·코딩'] }),
]

const logs: RecommendationLogRow[] = [
  {
    id: 'l1',
    created_at: '2026-09-19T01:31:00Z',
    response_id: 'r1',
    source: 'llm',
    stage: 'same',
    items: [{ program_id: 'p1', reason: '설계해 보고 싶다고 했죠.' }],
    model: 'claude-opus-5',
    latency_ms: 3000,
    input_tokens: 3000,
    output_tokens: 500,
    error: null,
  },
  {
    id: 'l2',
    created_at: '2026-09-19T01:32:00Z',
    response_id: 'r2',
    source: 'rule',
    stage: 'none',
    items: [],
    model: null,
    latency_ms: 8000,
    input_tokens: null,
    output_tokens: null,
    error: 'APIConnectionTimeoutError',
  },
]

describe('csvCell — 엑셀에서 깨지지 않는 칸', () => {
  it('평범한 값은 그대로, 쉼표·따옴표·줄바꿈이 있으면 RFC 4180 으로 감싼다', () => {
    expect(csvCell('드론')).toBe('드론')
    expect(csvCell('a,b')).toBe('"a,b"')
    expect(csvCell('그가 "좋다"')).toBe('"그가 ""좋다"""')
    expect(csvCell('첫 줄\n둘째 줄')).toBe('"첫 줄\n둘째 줄"')
    expect(csvCell(' 앞 공백')).toBe('" 앞 공백"')
  })

  it('= + - @ 로 시작하는 학생 자유서술은 수식으로 실행되지 않게 막는다', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`)
    expect(csvCell('-드론 조종')).toBe("'-드론 조종")
    expect(csvCell('@아이디')).toBe("'@아이디")
    expect(csvCell('+82')).toBe("'+82")
  })

  it('숫자·빈 값·배열', () => {
    expect(csvCell(3)).toBe('3')
    expect(csvCell(-3)).toBe('-3')
    expect(csvCell(Number.NaN)).toBe('')
    expect(csvCell(null)).toBe('')
    expect(csvCell(undefined)).toBe('')
    expect(csvCell(['드론', 'VR·AR'])).toBe('"드론, VR·AR"')
    expect(csvCell([])).toBe('')
  })

  it('toCsv 는 UTF-8 BOM 과 CRLF 로 끝난다 — 엑셀이 한글을 깨지 않고 연다', () => {
    const csv = toCsv(['이름', '값'], [['a', 1], ['b,c', null]])
    expect(csv.startsWith('﻿')).toBe(true)
    expect(csv).toBe('﻿이름,값\r\na,1\r\n"b,c",\r\n')
  })
})

describe('날짜 — 한국 시간', () => {
  it('formatKst 는 UTC 를 +9 시간으로 바꾼다', () => {
    expect(formatKst('2026-09-19T01:30:00Z')).toBe('2026-09-19 10:30:00')
    expect(formatKst('2026-09-18T15:00:00Z')).toBe('2026-09-19 00:00:00')
    expect(formatKst('2026-09-19T23:59:00+09:00')).toBe('2026-09-19 23:59:00')
    expect(formatKst('아님')).toBe('')
    expect(formatKst(null)).toBe('')
  })

  it('kstStamp 는 폴더 이름용', () => {
    expect(kstStamp(new Date('2026-09-19T01:05:00Z'))).toBe('20260919-1005')
  })

  it('gradeLabel', () => {
    expect(gradeLabel({ grade_band: 'middle', grade_year: 2 })).toBe('중2')
    expect(gradeLabel({ grade_band: 'elementary', grade_year: 6 })).toBe('초6')
  })
})

describe('estimateCostUsd — claude-opus-5 단가 ($5 / $25 per 1M)', () => {
  it('입력·출력 단가를 따로 곱한다', () => {
    expect(estimateCostUsd({ inputTokens: 1_000_000 })).toBe(5)
    expect(estimateCostUsd({ outputTokens: 1_000_000 })).toBe(25)
    expect(estimateCostUsd({ inputTokens: 3000, outputTokens: 500 })).toBe(0.0275)
    expect(estimateCostUsd({})).toBe(0)
  })
})

describe('summarize — 파일럿 지표', () => {
  const s = summarize({ responses, interests: [], logs, expectedStudents: 5, suppliedFields: ['3D 모델링·프린팅'] })

  it('응답 수·익명 수·응답률', () => {
    expect(s.responseCount).toBe(4)
    expect(s.anonymousCount).toBe(3)
    expect(s.responseRatePct).toBe(80)
  })

  it('만족도와 후속 의향을 따로 센다 — 후속 의향 3점 이상이 1차 전환 지표다', () => {
    expect(s.satisfaction.dist).toEqual({ 1: 0, 2: 1, 3: 1, 4: 1, 5: 1 })
    expect(s.satisfaction.average).toBe(3.5)
    expect(s.satisfaction.topTwoPct).toBe(50)
    expect(s.followup.dist).toEqual({ 1: 1, 2: 1, 3: 1, 4: 1 })
    expect(s.followup.atLeast3Count).toBe(2)
    expect(s.followup.atLeast3Pct).toBe(50)
  })

  it('관심 분야는 공급 여부를 표시하고, "잘 모르겠어요"는 따로 센다', () => {
    expect(s.interestFields).toEqual([
      { field: '3D 모델링·프린팅', count: 2, supplied: true },
      { field: 'AI·코딩', count: 2, supplied: false },
    ])
    expect(s.unmetFields).toEqual(['AI·코딩'])
    expect(s.unsureCount).toBe(1)
  })

  it('학년·참여 가능 시간·자유서술', () => {
    expect(s.grades).toEqual([
      { label: '중1', count: 2 },
      { label: '중2', count: 1 },
      { label: '중3', count: 1 },
    ])
    expect(s.availableTimes).toEqual([
      { time: '토요일', count: 2 },
      { time: '방학 중', count: 1 },
    ])
    expect(s.freeTexts.map((t) => t.grade)).toEqual(['중1', '중2'])
  })

  it('AI 추천 기록 — llm/rule, 지연, 토큰, 추정 비용, 오류, 기록 없는 응답', () => {
    expect(s.ai).toEqual({
      total: 2,
      llm: 1,
      rule: 1,
      responsesWithoutLog: 2,
      avgLatencyMs: 5500,
      maxLatencyMs: 8000,
      inputTokens: 3000,
      outputTokens: 500,
      costUsd: 0.0275,
      errors: [{ error: 'APIConnectionTimeoutError', count: 1 }],
      models: ['claude-opus-5'],
    })
  })

  it('작은 표본(5건 미만)을 표시한다', () => {
    expect(s.smallSample).toBe(true)
  })

  it('추천 기록 테이블이 없으면 ai 는 null', () => {
    expect(summarize({ responses, logs: null }).ai).toBeNull()
  })

  it('응답 0건이어도 NaN 이 나오지 않는다', () => {
    const empty = summarize({ responses: [], expectedStudents: 15 })
    expect(empty.responseRatePct).toBe(0)
    expect(empty.satisfaction.average).toBeNull()
    expect(empty.satisfaction.topTwoPct).toBeNull()
    expect(empty.followup.atLeast3Pct).toBeNull()
    expect(JSON.stringify(empty)).not.toContain('NaN')
  })
})

describe('CSV 행', () => {
  it('응답 행은 student_id 를 내보내지 않고 익명 여부만 남긴다', () => {
    const rows = responseRows(responses)
    expect(RESPONSE_HEADERS).toHaveLength(rows[0]!.length)
    expect(rows[1]).toEqual([
      'r2',
      '2026-09-19 10:30:00',
      '아니요',
      '중2',
      4,
      '좋았어요',
      3,
      '조금 배워보고 싶어요',
      ['3D 모델링·프린팅'],
      '',
      '제품 디자이너',
      ['토요일', '방학 중'],
    ])
    expect(JSON.stringify(rows)).not.toContain('st-1')
  })

  it('추천 기록은 순위별로 펴고, 카드가 0개인 기록도 한 줄 남긴다', () => {
    const rows = recommendationRows(logs, { p1: '3D 심화 과정' })
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveLength(RECOMMENDATION_HEADERS.length)
    expect(rows[0]!.slice(3, 9)).toEqual(['llm', 'same', 1, 'p1', '3D 심화 과정', '설계해 보고 싶다고 했죠.'])
    expect(rows[1]!.slice(3, 9)).toEqual(['rule', 'none', null, '', '', ''])
    expect(rows[1]![13]).toBe('APIConnectionTimeoutError')
  })

  it('직업 탐색 카드(career_id)는 career:<id> 로 적는다', () => {
    const rows = recommendationRows([
      { id: 'l3', source: 'llm', stage: 'none', items: [{ career_id: 'drone-pilot', reason: '드론 조종사가 하는 일' }] },
    ])
    expect(rows[0]!.slice(5, 9)).toEqual([1, 'career:drone-pilot', '', '드론 조종사가 하는 일'])
  })

  it('관심 표현 행에 프로그램 제목을 붙인다', () => {
    const rows = interestRows([{ id: 'i1', target_type: 'program', target_id: 'p1', student_alias: '중1 학생 A', status: 'expressed' }], {
      p1: '3D 심화 과정',
    })
    expect(rows[0]).toEqual(['i1', '', '중1 학생 A', 'program', 'p1', '3D 심화 과정', 'expressed'])
  })
})

describe('renderSummaryMarkdown', () => {
  const md = renderSummaryMarkdown({
    stats: summarize({ responses, logs, expectedStudents: 5, suppliedFields: ['3D 모델링·프린팅'] }),
    session: { title: '3D 프린터 특강', field: '3D 모델링·프린팅', held_on: '2026-09-19', entry_code: '123456', grade_band: 'middle' },
    orgName: '테스트 기관',
    instructorName: '테스트 강사',
    exportedAt: new Date('2026-09-19T03:00:00Z'),
  })

  it('핵심 지표를 맨 위에 둔다', () => {
    expect(md).toContain('## 핵심 지표')
    expect(md).toContain('**후속 의향 3점 이상** (파일럿 1차 전환 지표) | **2명 (50%)**')
    expect(md).toContain('4명 (예상 5명 · 응답률 80%)')
    expect(md).toContain('2026-09-19 12:00:00')
  })

  it('공급 없는 분야를 미충족 수요로 표시한다', () => {
    expect(md).toContain('| AI·코딩 | 2 | **없음 (미충족 수요)** |')
  })

  it('작은 표본 경고, AI 기록, 추정 비용', () => {
    expect(md).toContain('5건 미만')
    expect(md).toContain('AI 생성 llm 1 · 규칙 문장 rule 1')
    expect(md).toContain('$0.0275')
  })

  it('자유서술의 | 는 표를 깨지 않게 이스케이프한다', () => {
    expect(md).toContain('내 물건을 설계해 보고 싶어요 \\| 진짜로')
  })
})
