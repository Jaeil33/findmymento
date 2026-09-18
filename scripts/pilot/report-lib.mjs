/**
 * 파일럿 내보내기의 **순수 함수** — CSV 만들기, 집계, 비용 추정, 요약 문서.
 * tests/pilot-report.test.ts 가 직접 검증한다. 타입 선언은 report-lib.d.mts.
 *
 * 입력은 Supabase 행 그대로(snake_case)다. student_id 는 익명 여부 판정에만 쓰고 출력하지 않는다.
 */

export const SATISFACTION_LABEL = Object.freeze({
  1: '별로였어요',
  2: '그냥 그랬어요',
  3: '보통이에요',
  4: '좋았어요',
  5: '정말 좋았어요',
})

export const FOLLOWUP_LABEL = Object.freeze({
  1: '아니요',
  2: '잘 모르겠어요',
  3: '조금 배워보고 싶어요',
  4: '많이 배워보고 싶어요',
})

export const GRADE_BAND_SHORT = Object.freeze({ elementary: '초', middle: '중', high: '고' })
export const GRADE_BAND_LABEL = Object.freeze({ elementary: '초등', middle: '중등', high: '고등' })
export const FIELD_UNSURE = '아직 잘 모르겠어요'

/** 추정 비용 단가. 실제 청구액은 Anthropic Console → Usage 에서 확인한다. */
export const OPUS5_PRICING = Object.freeze({ model: 'claude-opus-5', inputPerMTok: 5, outputPerMTok: 25 })

// ============================================================================
// CSV — UTF-8 BOM(엑셀 한글) · RFC 4180 따옴표 · 수식 주입 방지
// ============================================================================

const FORMULA_START = /^[=+\-@\t\r]/

export function csvCell(value) {
  if (value === null || value === undefined) return ''
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : ''
  let s = Array.isArray(value)
    ? value.map((v) => (v === null || v === undefined ? '' : String(v))).join(', ')
    : typeof value === 'boolean'
      ? value
        ? 'TRUE'
        : 'FALSE'
      : String(value)
  // 엑셀이 = + - @ 로 시작하는 칸을 수식으로 실행하지 않게 한다 (학생 자유서술이 들어가는 칸이다).
  if (FORMULA_START.test(s)) s = `'${s}`
  return /[",\r\n]|^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv(headers, rows) {
  const lines = [headers, ...rows].map((r) => r.map(csvCell).join(','))
  return `﻿${lines.join('\r\n')}\r\n`
}

// ============================================================================
// 날짜·숫자
// ============================================================================

const KST_MS = 9 * 3600_000

/** `2026-09-19 10:30:00` (한국 시간). 잘못된 값이면 빈 문자열. */
export function formatKst(value) {
  if (value === null || value === undefined || value === '') return ''
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return new Date(d.getTime() + KST_MS).toISOString().slice(0, 19).replace('T', ' ')
}

/** 폴더 이름용 `20260919-1030` (한국 시간). */
export function kstStamp(date = new Date()) {
  const k = new Date(date.getTime() + KST_MS).toISOString()
  return `${k.slice(0, 4)}${k.slice(5, 7)}${k.slice(8, 10)}-${k.slice(11, 13)}${k.slice(14, 16)}`
}

const pct = (n, d) => (d > 0 ? Math.round((n / d) * 1000) / 10 : null)
const round2 = (x) => Math.round(x * 100) / 100
const isNum = (v) => typeof v === 'number' && Number.isFinite(v)
const sum = (xs) => xs.reduce((a, b) => a + b, 0)
const fmtInt = (n) => (isNum(n) ? n.toLocaleString('en-US') : '-')

export function gradeLabel(row) {
  const band = row?.grade_band ?? ''
  const year = row?.grade_year ?? ''
  return `${GRADE_BAND_SHORT[band] ?? band}${year}`
}

export function estimateCostUsd({ inputTokens = 0, outputTokens = 0 } = {}, pricing = OPUS5_PRICING) {
  const cost = (inputTokens / 1e6) * pricing.inputPerMTok + (outputTokens / 1e6) * pricing.outputPerMTok
  return Math.round(cost * 10000) / 10000
}

// ============================================================================
// CSV 행
// ============================================================================

export const RESPONSE_HEADERS = Object.freeze([
  '응답ID',
  '제출 시각(KST)',
  '익명',
  '학년',
  '만족도(1-5)',
  '만족도',
  '후속 의향(1-4)',
  '후속 의향',
  '관심 분야',
  '배우고 싶은 내용',
  '관심 직업',
  '참여 가능 시간',
])

export function responseRows(responses) {
  return responses.map((r) => [
    r.id,
    formatKst(r.created_at),
    r.student_id ? '아니요' : '예',
    gradeLabel(r),
    r.satisfaction ?? null,
    SATISFACTION_LABEL[r.satisfaction] ?? '',
    r.followup_intent ?? null,
    FOLLOWUP_LABEL[r.followup_intent] ?? '',
    r.interest_fields ?? [],
    r.want_to_learn ?? '',
    r.desired_job ?? '',
    r.available_times ?? [],
  ])
}

export const INTEREST_HEADERS = Object.freeze([
  '관심 표현ID',
  '시각(KST)',
  '화면 표시 이름',
  '대상 유형',
  '대상 ID',
  '대상 프로그램',
  '상태',
])

export function interestRows(interests, titleById = {}) {
  return interests.map((i) => [
    i.id,
    formatKst(i.created_at),
    i.student_alias ?? '',
    i.target_type ?? '',
    i.target_id ?? '',
    (i.target_id && titleById[i.target_id]) || '',
    i.status ?? '',
  ])
}

export const RECOMMENDATION_HEADERS = Object.freeze([
  '기록ID',
  '시각(KST)',
  '응답ID',
  '생성 방식(llm/rule)',
  '지역 단계',
  '순위',
  '카드ID (프로그램 또는 career:직업)',
  '프로그램',
  '추천 이유',
  '모델',
  '지연(ms)',
  '입력 토큰',
  '출력 토큰',
  '오류',
])

/**
 * 한 기록의 items 를 순위별 행으로 편다. 추천이 0건인 기록도 한 줄은 남긴다.
 * 카드는 프로그램(`program_id`)이거나 직업 탐색 카드(`career_id`)다 — 직업 카드는 `career:<id>` 로 적는다.
 */
export function recommendationRows(logs, titleById = {}) {
  const rows = []
  for (const l of logs) {
    const base = [l.id, formatKst(l.created_at), l.response_id ?? '', l.source ?? '', l.stage ?? '']
    const tail = [l.model ?? '', l.latency_ms ?? null, l.input_tokens ?? null, l.output_tokens ?? null, l.error ?? '']
    const items = Array.isArray(l.items) ? l.items : []
    if (items.length === 0) {
      rows.push([...base, null, '', '', '', ...tail])
      continue
    }
    items.forEach((item, k) => {
      const pid = item?.program_id ?? item?.programId ?? ''
      const cid = item?.career_id ?? item?.careerId ?? ''
      const id = pid || (cid ? `career:${cid}` : '')
      rows.push([...base, k + 1, id, (id && titleById[id]) || '', item?.reason ?? '', ...tail])
    })
  }
  return rows
}

// ============================================================================
// 집계
// ============================================================================

const countBy = (values) => {
  const m = new Map()
  for (const v of values) m.set(v, (m.get(v) ?? 0) + 1)
  return m
}
const byCountThenName = (a, b) => b.count - a.count || String(a.key).localeCompare(String(b.key), 'ko')

/**
 * @param logs recommendation_logs 행. 테이블이 없으면 null — 그러면 ai 요약도 null.
 * @param suppliedFields 승인 강사의 프로그램이 있는 분야
 */
export function summarize({ responses = [], interests = [], logs = null, expectedStudents = null, suppliedFields = [] } = {}) {
  const n = responses.length
  const satDist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
  const fuDist = { 1: 0, 2: 0, 3: 0, 4: 0 }
  let satSum = 0

  for (const r of responses) {
    const sat = Number(r.satisfaction)
    if (Number.isInteger(sat) && sat >= 1 && sat <= 5) {
      satDist[sat] += 1
      satSum += sat
    }
    const fu = Number(r.followup_intent)
    if (Number.isInteger(fu) && fu >= 1 && fu <= 4) fuDist[fu] += 1
  }
  const satCounted = sum(Object.values(satDist))
  const atLeast3 = fuDist[3] + fuDist[4]

  const supplied = new Set(suppliedFields)
  const allFields = responses.flatMap((r) => r.interest_fields ?? [])
  const interestFields = [...countBy(allFields.filter((f) => f !== FIELD_UNSURE))]
    .map(([key, count]) => ({ key, count }))
    .sort(byCountThenName)
    .map(({ key, count }) => ({ field: key, count, supplied: supplied.has(key) }))

  const grades = [...countBy(responses.map(gradeLabel))]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => String(a.key).localeCompare(String(b.key), 'ko'))
    .map(({ key, count }) => ({ label: key, count }))

  const availableTimes = [...countBy(responses.flatMap((r) => r.available_times ?? []))]
    .map(([key, count]) => ({ key, count }))
    .sort(byCountThenName)
    .map(({ key, count }) => ({ time: key, count }))

  const freeTexts = responses
    .map((r) => ({
      at: r.created_at ?? null,
      grade: gradeLabel(r),
      wantToLearn: String(r.want_to_learn ?? '').trim(),
      desiredJob: String(r.desired_job ?? '').trim(),
    }))
    .filter((t) => t.wantToLearn !== '' || t.desiredJob !== '')

  const byTarget = [...countBy(interests.map((i) => i.target_id ?? ''))]
    .map(([key, count]) => ({ key, count }))
    .sort(byCountThenName)
    .map(({ key, count }) => ({ targetId: key, count }))

  return {
    responseCount: n,
    anonymousCount: responses.filter((r) => !r.student_id).length,
    expectedStudents: isNum(expectedStudents) ? expectedStudents : null,
    responseRatePct: isNum(expectedStudents) ? pct(n, expectedStudents) : null,
    satisfaction: {
      dist: satDist,
      average: satCounted > 0 ? round2(satSum / satCounted) : null,
      topTwoPct: pct(satDist[4] + satDist[5], satCounted),
    },
    followup: { dist: fuDist, atLeast3Count: atLeast3, atLeast3Pct: pct(atLeast3, n) },
    grades,
    interestFields,
    unsureCount: allFields.filter((f) => f === FIELD_UNSURE).length,
    unmetFields: interestFields.filter((f) => !f.supplied).map((f) => f.field),
    availableTimes,
    freeTexts,
    interests: { total: interests.length, byTarget },
    ai: logs === null ? null : summarizeAi(logs, responses),
    smallSample: n < 5,
  }
}

function summarizeAi(logs, responses) {
  const latencies = logs.map((l) => l.latency_ms).filter(isNum)
  const inputTokens = sum(logs.map((l) => l.input_tokens).filter(isNum))
  const outputTokens = sum(logs.map((l) => l.output_tokens).filter(isNum))
  const logged = new Set(logs.map((l) => l.response_id).filter(Boolean))
  return {
    total: logs.length,
    llm: logs.filter((l) => l.source === 'llm').length,
    rule: logs.filter((l) => l.source === 'rule').length,
    responsesWithoutLog: responses.filter((r) => !logged.has(r.id)).length,
    avgLatencyMs: latencies.length > 0 ? Math.round(sum(latencies) / latencies.length) : null,
    maxLatencyMs: latencies.length > 0 ? Math.max(...latencies) : null,
    inputTokens,
    outputTokens,
    costUsd: estimateCostUsd({ inputTokens, outputTokens }),
    errors: [...countBy(logs.map((l) => l.error).filter((e) => typeof e === 'string' && e !== ''))]
      .map(([key, count]) => ({ key, count }))
      .sort(byCountThenName)
      .map(({ key, count }) => ({ error: key, count })),
    models: [...new Set(logs.map((l) => l.model).filter((m) => typeof m === 'string' && m !== ''))],
  }
}

// ============================================================================
// 요약 문서 (summary.md)
// ============================================================================

const mdCell = (v) => String(v ?? '').replace(/\r?\n/g, ' ').replace(/\|/g, '\\|')
const pctText = (v) => (v === null || v === undefined ? '-' : `${v}%`)
const secText = (ms) => (isNum(ms) ? `${(ms / 1000).toFixed(1)}초` : '-')

export function renderSummaryMarkdown({ stats, session = {}, orgName = '', instructorName = null, exportedAt = new Date(), titleById = {} }) {
  const s = stats
  const out = []
  const band = GRADE_BAND_LABEL[session.grade_band] ?? session.grade_band ?? ''

  out.push(`# 파일럿 결과 요약 — ${mdCell(session.title ?? '')}`, '')
  out.push(`- 기관: ${mdCell(orgName)} · 강사: ${mdCell(instructorName ?? '미배정')}`)
  out.push(`- 수업일: ${session.held_on ?? '-'} · 분야: ${mdCell(session.field ?? '')} · 대상: ${band} · 입장 코드: ${session.entry_code ?? '-'}`)
  out.push(`- 내보낸 시각: ${formatKst(exportedAt)} (KST)`, '')

  if (s.smallSample) {
    out.push('> ⚠ 응답이 5건 미만입니다. 작은 표본의 집계는 개인이 드러날 수 있으니 외부 자료(지원서·보고서)에 쓰지 마세요.', '')
  }

  out.push('## 핵심 지표', '', '| 항목 | 값 |', '|---|---|')
  const expected = s.expectedStudents !== null ? ` (예상 ${s.expectedStudents}명 · 응답률 ${pctText(s.responseRatePct)})` : ''
  out.push(`| 응답 수 | ${s.responseCount}명${expected} |`)
  out.push(`| **후속 의향 3점 이상** (파일럿 1차 전환 지표) | **${s.followup.atLeast3Count}명 (${pctText(s.followup.atLeast3Pct)})** |`)
  out.push(
    `| 만족도 평균 | ${s.satisfaction.average ?? '-'} / 5 (4·5점 ${pctText(s.satisfaction.topTwoPct)}) |`,
  )
  out.push(`| 관심 표현 ("더 배우고 싶어요" 버튼) | ${s.interests.total}건 |`)
  out.push(`| 익명 응답 | ${s.anonymousCount}건 |`, '')

  out.push('## 만족도 분포', '', '| 점수 | 라벨 | 응답 | 비율 |', '|---|---|---|---|')
  for (const k of [5, 4, 3, 2, 1]) {
    const c = s.satisfaction.dist[k]
    out.push(`| ${k} | ${SATISFACTION_LABEL[k]} | ${c} | ${pctText(pct(c, s.responseCount))} |`)
  }
  out.push('')

  out.push('## 후속 의향 분포 ("이 분야를 더 배워보고 싶어요?")', '', '| 점수 | 라벨 | 응답 | 비율 |', '|---|---|---|---|')
  for (const k of [4, 3, 2, 1]) {
    const c = s.followup.dist[k]
    out.push(`| ${k} | ${FOLLOWUP_LABEL[k]} | ${c} | ${pctText(pct(c, s.responseCount))} |`)
  }
  out.push('')

  out.push('## 학년', '')
  out.push(s.grades.length > 0 ? s.grades.map((g) => `- ${g.label}: ${g.count}명`).join('\n') : '- 응답 없음')
  out.push('')

  out.push('## 관심 분야 (최대 3개 복수 선택)', '', '| 분야 | 응답 | 강사 공급 |', '|---|---|---|')
  for (const f of s.interestFields) {
    out.push(`| ${mdCell(f.field)} | ${f.count} | ${f.supplied ? '있음' : '**없음 (미충족 수요)**'} |`)
  }
  if (s.interestFields.length === 0) out.push('| - | 0 | - |')
  out.push('', `- "${FIELD_UNSURE}": ${s.unsureCount}명`, '')

  out.push('## 참여 가능 시간 (후속 수업이 열린다면)', '')
  out.push(s.availableTimes.length > 0 ? s.availableTimes.map((t) => `- ${mdCell(t.time)}: ${t.count}명`).join('\n') : '- 응답 없음')
  out.push('')

  out.push('## 학생이 직접 쓴 말', '', '저장 전에 이름·연락처·학교 등이 가려진(마스킹) 값입니다.', '')
  if (s.freeTexts.length === 0) out.push('- 없음')
  s.freeTexts.forEach((t, k) => {
    const parts = []
    if (t.wantToLearn) parts.push(`배우고 싶은 것: ${mdCell(t.wantToLearn)}`)
    if (t.desiredJob) parts.push(`관심 직업: ${mdCell(t.desiredJob)}`)
    out.push(`${k + 1}. [${t.grade}] ${parts.join(' / ')}`)
  })
  out.push('')

  out.push('## AI 추천 기록', '')
  if (s.ai === null) {
    out.push('recommendation_logs 테이블이 없어 AI 추천 기록은 포함하지 못했어요.')
  } else {
    const a = s.ai
    out.push('| 항목 | 값 |', '|---|---|')
    out.push(`| 추천 기록 | ${a.total}건 (AI 생성 llm ${a.llm} · 규칙 문장 rule ${a.rule}) |`)
    out.push(`| 추천 기록이 없는 응답 | ${a.responsesWithoutLog}건 |`)
    out.push(`| 평균 / 최대 지연 | ${secText(a.avgLatencyMs)} / ${secText(a.maxLatencyMs)} |`)
    out.push(`| 토큰 (입력 / 출력) | ${fmtInt(a.inputTokens)} / ${fmtInt(a.outputTokens)} |`)
    out.push(
      `| 추정 비용 | $${a.costUsd.toFixed(4)} (${OPUS5_PRICING.model} 단가 입력 $${OPUS5_PRICING.inputPerMTok} · 출력 $${OPUS5_PRICING.outputPerMTok} / 100만 토큰 기준. 실제 청구는 Anthropic Console → Usage) |`,
    )
    out.push(`| 오류 | ${a.errors.length > 0 ? a.errors.map((e) => `${mdCell(e.error)} ${e.count}건`).join(', ') : '없음'} |`)
    out.push(`| 모델 | ${a.models.length > 0 ? a.models.map(mdCell).join(', ') : '-'} |`)
  }
  out.push('')

  out.push('## 관심 표현 (프로그램별)', '')
  if (s.interests.byTarget.length === 0) out.push('- 없음')
  for (const t of s.interests.byTarget) out.push(`- ${mdCell(titleById[t.targetId] || t.targetId || '(대상 없음)')}: ${t.count}건`)
  out.push('')

  return out.join('\n')
}
