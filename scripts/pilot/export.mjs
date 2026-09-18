#!/usr/bin/env node
/**
 * 한 회차의 파일럿 데이터를 내보낸다 — 엑셀용 CSV + raw.json + summary.md.
 *
 *   npm run pilot:export -- --code 123456
 *
 * 결과는 pilot-data/export-<입장코드>-<시각>/ 에 쓴다 (git 에 올라가지 않는 폴더).
 * Supabase 무료 플랜은 백업을 내려받을 수 없다 — 수업이 끝나면 바로 한 번 실행해 두자.
 *
 * 그 회차 행만 읽는다. student_id(가명 연결 키)는 내보내지 않고 익명 여부만 남긴다.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { PILOT_DIR, ROOT, cliArgs, fail, log, must, optionalRows, runMain } from './common.mjs'
import { loadEnv, serviceClient, supabaseHost } from './env.mjs'
import {
  INTEREST_HEADERS,
  RECOMMENDATION_HEADERS,
  RESPONSE_HEADERS,
  interestRows,
  kstStamp,
  recommendationRows,
  renderSummaryMarkdown,
  responseRows,
  summarize,
  toCsv,
} from './report-lib.mjs'

const USAGE = `사용법: npm run pilot:export -- --code <입장 코드 6자리> [--out <폴더>]
  결과: pilot-data/export-<코드>-<시각>/ (responses.csv · interests.csv · recommendations.csv · raw.json · summary.md)`

const PAGE = 1000

/** PostgREST 기본 1000행 제한을 넘어도 전부 읽는다. */
async function fetchAll(makeQuery, context) {
  const out = []
  for (let from = 0; ; from += PAGE) {
    const rows = await must(makeQuery().range(from, from + PAGE - 1), context)
    out.push(...rows)
    if (rows.length < PAGE) return out
  }
}

/** recommendation_logs 처럼 아직 없을 수 있는 테이블. 없으면 null. */
async function fetchAllOptional(makeQuery, context) {
  const first = await optionalRows(makeQuery().range(0, PAGE - 1), context)
  if (first === null) return null
  const out = [...first]
  // 앞 페이지가 꽉 찼을 때만 다음 페이지를 읽는다.
  for (let from = PAGE; out.length === from; from += PAGE) {
    out.push(...(await must(makeQuery().range(from, from + PAGE - 1), context)))
  }
  return out
}

await runMain(async () => {
  const args = cliArgs({ code: { type: 'string' }, out: { type: 'string' } }, USAGE)
  const code = String(args.code ?? '').trim()
  if (!/^\d{6}$/.test(code)) fail(`입장 코드 6자리를 --code 로 주세요 (지금 "${code}").\n\n${USAGE}`)

  loadEnv()
  const sb = serviceClient()
  log.step(`내보내기 — 입장 코드 ${code} (${supabaseHost()})`)

  const sessions = await must(sb.from('lecture_sessions').select('*').eq('entry_code', code), '회차 조회')
  if (sessions.length === 0) fail(`입장 코드 ${code} 인 회차가 없어요. 코드를 다시 확인하세요.`)
  const session = sessions[0]

  const [org] = await must(sb.from('organizations').select('id, name, type, region_code').eq('id', session.org_id), '기관 조회')
  let instructorName = null
  if (session.instructor_id) {
    const [inst] = await must(sb.from('instructors').select('name').eq('id', session.instructor_id), '강사 조회')
    instructorName = inst?.name ?? null
  }

  const responses = await fetchAll(
    () => sb.from('survey_responses').select('*').eq('session_id', session.id).order('created_at', { ascending: true }),
    '설문 응답 조회',
  )
  const interests = await fetchAll(
    () => sb.from('interests').select('*').eq('session_id', session.id).order('created_at', { ascending: true }),
    '관심 표현 조회',
  )
  const logs = await fetchAllOptional(
    () => sb.from('recommendation_logs').select('*').eq('session_id', session.id).order('created_at', { ascending: true }),
    '추천 기록 조회',
  )
  if (logs === null) log.warn('recommendation_logs 테이블이 없어 AI 추천 기록은 빼고 내보냅니다.')

  // 공급 판정: 승인된 강사의 프로그램이 있는 분야. 요약에서 "미충족 수요"를 가르는 기준이다.
  const programs = await fetchAll(() => sb.from('programs').select('id, title, field, instructor_id'), '프로그램 조회')
  const instructors = await fetchAll(() => sb.from('instructors').select('id, status'), '강사 상태 조회')
  const approved = new Set(instructors.filter((i) => i.status === 'approved').map((i) => i.id))
  const suppliedFields = [...new Set(programs.filter((p) => approved.has(p.instructor_id)).map((p) => p.field))]
  const titleById = Object.fromEntries(programs.map((p) => [p.id, p.title]))

  const stats = summarize({
    responses,
    interests,
    logs,
    expectedStudents: session.expected_students,
    suppliedFields,
  })
  const exportedAt = new Date()

  const dir = args.out ?? join(PILOT_DIR, `export-${code}-${kstStamp(exportedAt)}`)
  mkdirSync(dir, { recursive: true })

  writeFileSync(join(dir, 'responses.csv'), toCsv(RESPONSE_HEADERS, responseRows(responses)), 'utf8')
  writeFileSync(join(dir, 'interests.csv'), toCsv(INTEREST_HEADERS, interestRows(interests, titleById)), 'utf8')
  writeFileSync(
    join(dir, 'recommendations.csv'),
    toCsv(RECOMMENDATION_HEADERS, logs === null ? [] : recommendationRows(logs, titleById)),
    'utf8',
  )

  // 가명 연결 키(student_id)는 빼고 익명 여부만 남긴다.
  const withoutStudent = (rows) =>
    rows.map(({ student_id: studentId, ...rest }) => ({ ...rest, is_anonymous: !studentId }))
  const referenced = new Set([
    ...interests.map((i) => i.target_id),
    ...(logs ?? []).flatMap((l) => (Array.isArray(l.items) ? l.items.map((it) => it?.program_id ?? it?.programId) : [])),
  ])
  const raw = {
    exported_at: exportedAt.toISOString(),
    session,
    organization: org ?? null,
    instructor_name: instructorName,
    survey_responses: withoutStudent(responses),
    interests: withoutStudent(interests),
    recommendation_logs: logs,
    programs: programs.filter((p) => referenced.has(p.id)),
  }
  writeFileSync(join(dir, 'raw.json'), `${JSON.stringify(raw, null, 2)}\n`, 'utf8')

  writeFileSync(
    join(dir, 'summary.md'),
    renderSummaryMarkdown({ stats, session, orgName: org?.name ?? '', instructorName, exportedAt, titleById }),
    'utf8',
  )

  const pct = (v) => (v === null ? '-' : `${v}%`)
  log.ok(`내보냄: ${relative(ROOT, dir)}`)
  log.info(
    `응답 ${stats.responseCount}명` +
      (stats.expectedStudents !== null ? ` (예상 ${stats.expectedStudents}명 · 응답률 ${pct(stats.responseRatePct)})` : ''),
  )
  log.info(`후속 의향 3점 이상: ${stats.followup.atLeast3Count}명 (${pct(stats.followup.atLeast3Pct)})  ← 핵심 지표`)
  log.info(`만족도 평균: ${stats.satisfaction.average ?? '-'} / 5 · 관심 표현 ${stats.interests.total}건`)
  if (stats.ai) {
    log.info(`AI 추천 기록: llm ${stats.ai.llm} · rule ${stats.ai.rule} · 추정 비용 $${stats.ai.costUsd.toFixed(4)}`)
    if (stats.ai.responsesWithoutLog > 0) log.warn(`추천 기록이 없는 응답이 ${stats.ai.responsesWithoutLog}건 있어요.`)
  }
  if (stats.smallSample) log.warn('응답이 5건 미만이에요. 작은 표본 집계는 외부 자료에 쓰지 마세요.')
  log.info('파일: responses.csv · interests.csv · recommendations.csv · raw.json · summary.md')
  log.info('이 폴더는 학생 응답 원본입니다. 메일·메신저로 돌리지 말고, 필요하면 summary.md 의 집계만 공유하세요.')
})
