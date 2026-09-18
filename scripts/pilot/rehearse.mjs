#!/usr/bin/env node
/**
 * 배포된 파일럿 사이트에서 학생 n명을 흉내 낸다 — 입장 화면 → 설문 제출 → 추천 → DB 저장 확인.
 *
 *   npm run pilot:rehearse                                   .env.local 의 NEXT_PUBLIC_SITE_URL 로 3명
 *   npm run pilot:rehearse -- --site https://....vercel.app --n 5 --parallel
 *   npm run pilot:rehearse -- --cleanup                      남아 있는 [리허설] 회차만 지운다
 *
 * **실제 수업 회차는 건드리지 않는다.** 같은 기관 아래 "[리허설] ..." 회차를 따로 만들고, 끝나면 지운다
 * (응답·추천 기록은 FK cascade 로 같이 지워진다). --keep 을 주면 남긴다.
 * 추천 호출은 실제 LLM 을 부른다 — 1명당 약 $0.03~0.05.
 */
import {
  checkHealth,
  checkStudentPage,
  cliArgs,
  DEFAULT_CONFIG,
  fail,
  freshEntryCode,
  http,
  httpHint,
  kstDate,
  loadCatalog,
  log,
  must,
  optionalRows,
  readConfig,
  resolveSite,
  runMain,
} from './common.mjs'
import { isLocalSite, validateConfig } from './config-lib.mjs'
import { loadEnv, serviceClient, supabaseHost } from './env.mjs'
import { FAKE_PHONE, syntheticAnswer } from './rehearse-lib.mjs'

const USAGE = `사용법: npm run pilot:rehearse -- [옵션]
  --site <주소>      리허설할 파일럿 사이트 (기본: .env.local 의 NEXT_PUBLIC_SITE_URL)
  --n <수>           가상 학생 수 (기본 3, 최대 20)
  --parallel         동시에 보내기 (교실에서 한꺼번에 제출하는 상황)
  --keep             끝나도 리허설 회차를 지우지 않기
  --cleanup          남아 있는 [리허설] 회차만 지우고 끝내기
  --config <경로>    설정 파일 (기본: pilot-data/pilot.config.json)
  --allow-localhost  localhost 사이트 허용 (내 컴퓨터 시험용)`

const PREFIX = '[리허설] '

await runMain(async () => {
  const args = cliArgs(
    {
      site: { type: 'string' },
      n: { type: 'string' },
      parallel: { type: 'boolean' },
      keep: { type: 'boolean' },
      cleanup: { type: 'boolean' },
      config: { type: 'string' },
      'allow-localhost': { type: 'boolean' },
    },
    USAGE,
  )
  loadEnv()

  const n = args.n === undefined ? 3 : Number(args.n)
  if (!Number.isInteger(n) || n < 1 || n > 20) fail(`--n 은 1~20 사이 정수여야 해요 (지금 "${args.n}").`)

  const catalog = loadCatalog()
  const raw = readConfig(args.config ?? DEFAULT_CONFIG)
  const { errors } = validateConfig(raw, catalog)
  // 마감 시각이 지난 설정이어도 리허설은 자기 회차로 하므로 그 오류만은 넘어간다.
  const blocking = errors.filter((e) => !e.startsWith('session.closes_at'))
  if (blocking.length > 0) {
    fail(['설정 파일을 먼저 고쳐 주세요 (npm run pilot:setup -- --dry-run 으로 확인):', ...blocking.map((e) => `  - ${e}`)].join('\n'))
  }
  const orgName = String(raw.org?.name ?? '').trim()
  const instructorName = String(raw.instructor?.name ?? '').trim()
  const instructorRegion = String(raw.instructor?.region_code ?? '').trim()
  const sessionCfg = raw.session ?? {}

  const sb = serviceClient()
  log.step(`리허설 준비 (${supabaseHost()})`)

  const orgs = await must(sb.from('organizations').select('id, name').eq('name', orgName), '기관 조회')
  if (orgs.length !== 1) fail(`기관 "${orgName}"을(를) ${orgs.length === 0 ? '찾지 못했어요' : `${orgs.length}개 찾았어요`}. 먼저 npm run pilot:setup 을 실행하세요.`)
  const org = orgs[0]

  if (args.cleanup) {
    await cleanupLeftovers(sb, org.id)
    return
  }

  const site = resolveSite(args.site)
  if (!site) fail('사이트 주소가 없어요. --site https://... 또는 .env.local 의 NEXT_PUBLIC_SITE_URL 을 넣으세요.')
  if (isLocalSite(site) && !args['allow-localhost']) {
    fail(`${site} 는 내 컴퓨터 주소예요. 배포된 파일럿 사이트로 리허설하세요. (로컬 서버 시험이면 --allow-localhost)`)
  }

  log.step(`배포 사이트 확인 (${site})`)
  const { health, problems } = await checkHealth(site)
  if (!health) fail(problems.join('\n'))
  if (health.mode !== 'live') fail(problems.join('\n'))
  for (const p of problems) log.warn(p)

  const instructors = await must(
    sb.from('instructors').select('id').eq('name', instructorName).eq('region_code', instructorRegion),
    '강사 조회',
  )

  // ── 리허설 회차 — 실제 회차와 입장 코드·제목이 다르다
  const band = String(sessionCfg.grade_band ?? 'middle')
  const title = `${PREFIX}${String(sessionCfg.title ?? '파일럿').trim()}`
  const entryCode = await freshEntryCode(sb)
  const created = await must(
    sb
      .from('lecture_sessions')
      .insert({
        org_id: org.id,
        instructor_id: instructors[0]?.id ?? null,
        title,
        field: String(sessionCfg.field ?? catalog.fields[0]),
        held_on: kstDate(),
        closes_at: new Date(Date.now() + 2 * 3600_000).toISOString(),
        status: 'open',
        entry_code: entryCode,
        grade_band: band,
        expected_students: n,
        ...(sessionCfg.duration_minutes ? { duration_minutes: Number(sessionCfg.duration_minutes) } : {}),
        ...(sessionCfg.venue ? { venue: String(sessionCfg.venue) } : {}),
      })
      .select('id, title, entry_code')
      .single(),
    '리허설 회차 만들기',
  )
  log.ok(`리허설 회차 "${created.title}" · 입장 코드 ${entryCode}`)

  const checks = []
  const check = (ok, msg, level = ok ? 'ok' : 'bad') => {
    checks.push({ ok, msg, level })
    log[level](msg)
  }
  const results = []

  try {
    // ── 1. 입장 화면
    log.step('1. 학생 입장 화면')
    const page = await checkStudentPage(site, entryCode, title)
    check(
      page.found,
      page.found
        ? `학생 화면이 리허설 회차를 찾았어요 (${page.status}, ${page.ms}ms)`
        : `학생 화면에서 회차를 찾지 못했어요 (${page.status || page.error}). ${httpHint(page.status)} 학생 경로 수정이 배포됐는지 확인하세요.`,
    )

    // ── 2. 설문 → 추천
    log.step(`2. 가상 학생 ${n}명 — 설문 제출 → 추천 (${args.parallel ? '동시에' : '한 명씩'})`)
    const ctx = { entryCode, band, field: sessionCfg.field, fields: catalog.fields, fieldUnsure: catalog.fieldUnsure }
    const run = (i) => runStudent(site, syntheticAnswer(i, ctx), i)
    if (args.parallel) results.push(...(await Promise.all(Array.from({ length: n }, (_, i) => run(i)))))
    else for (let i = 0; i < n; i++) results.push(await run(i))

    const submitted = results.filter((r) => r.surveyOk)
    const recommended = results.filter((r) => r.recOk)
    const avg = (xs) => (xs.length > 0 ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0)

    log.step('3. 결과')
    check(submitted.length === n, `설문 제출 ${submitted.length}/${n} (평균 ${avg(submitted.map((r) => r.surveyMs))}ms)`)
    if (submitted.length > 0) {
      check(
        recommended.length === submitted.length,
        `추천 응답 ${recommended.length}/${submitted.length} (평균 ${(avg(recommended.map((r) => r.recMs)) / 1000).toFixed(1)}초 · 최대 ${(Math.max(0, ...recommended.map((r) => r.recMs)) / 1000).toFixed(1)}초)`,
      )
      // 수업 추천이 0건인 회차는 진로 카드 3장이 나간다 (ADR-027). 둘 다 없을 때만 빈 화면이다.
      const empty = recommended.filter((r) => r.items === 0)
      if (empty.length > 0) {
        check(false, `카드가 0개인 응답 ${empty.length}건 — 수업 추천도 진로 카드도 없어요. 회차 분야와 프로그램의 대상 학년·분야·강사 지역을 확인하세요.`, 'warn')
      }
      const sample = recommended.find((r) => r.firstReason)
      if (sample) log.info(`추천 이유 예시 (${sample.kind}): "${sample.firstReason}"`)
    }

    // ── 4. DB 에 실제로 남았는지
    log.step('4. DB 저장 확인 (service_role 로 직접 조회)')
    const stored = await must(
      sb.from('survey_responses').select('id, want_to_learn').eq('session_id', created.id),
      '리허설 응답 조회',
    )
    check(stored.length === submitted.length, `DB 에 저장된 응답 ${stored.length}건 (제출 성공 ${submitted.length}건)`)
    // 구분자만 바뀐 채 숫자가 남아도 누출이다 — 뒤 8자리 숫자로 확인한다.
    const digits = FAKE_PHONE.replace(/\D/g, '').slice(-8)
    const leaked = stored.filter((r) => String(r.want_to_learn ?? '').replace(/\D/g, '').includes(digits))
    if (results.some((r) => r.probedMasking && r.surveyOk)) {
      check(leaked.length === 0, leaked.length === 0 ? '자유서술 마스킹 확인 — 전화번호가 저장되지 않았어요' : '자유서술에 전화번호가 그대로 저장됐어요!')
    }
    const logs = await optionalRows(
      sb.from('recommendation_logs').select('id, source, latency_ms, error').eq('session_id', created.id),
      '추천 기록 조회',
    )
    if (logs === null) {
      check(false, 'recommendation_logs 테이블이 없어요 — 최신 마이그레이션(pilot-data/setup-all.sql)을 적용하세요.', 'warn')
    } else {
      check(
        logs.length >= recommended.length,
        `추천 기록 ${logs.length}건 저장 (추천 응답 ${recommended.length}건)` +
          (logs.some((l) => l.error) ? ` · 오류 기록: ${[...new Set(logs.map((l) => l.error).filter(Boolean))].join(', ')}` : ''),
        logs.length >= recommended.length ? 'ok' : 'warn',
      )
    }
    // AI 가 실제로 돌았는지는 **추천 기록의 source** 로 본다. 응답의 source 는 수업 추천 기준이라
    // 진로 카드(ADR-027)를 보여 준 경우를 모른다. 기록 테이블이 없을 때만 응답으로 대신 센다.
    if (recommended.length > 0) {
      const judged = logs ?? recommended
      const llm = judged.filter((r) => r.source === 'llm')
      const aiOk = judged.length > 0 && llm.length === judged.length
      check(
        aiOk,
        `AI 생성(llm) ${llm.length}/${judged.length}${logs ? ' (추천 기록 기준)' : ''}` +
          (aiOk ? '' : ' — 나머지는 규칙 문장이에요. 배포의 ANTHROPIC_API_KEY·ANTHROPIC_WORKSPACE_ID, 크레딧, 시간 초과를 확인하세요.'),
        aiOk ? 'ok' : 'warn',
      )
    }
  } finally {
    if (args.keep) log.warn(`--keep: 리허설 회차를 남겨 둡니다 (입장 코드 ${entryCode}). 지우려면 npm run pilot:rehearse -- --cleanup`)
    else await removeRehearsal(sb, created.id, check)
  }

  const failed = checks.filter((c) => c.level === 'bad')
  const warned = checks.filter((c) => c.level === 'warn')
  console.log('')
  if (failed.length === 0 && warned.length === 0) console.log('✔ 리허설 통과 — 수업에서 그대로 쓰면 됩니다.')
  else if (failed.length === 0) console.log(`⚠ 저장은 되지만 확인할 것이 ${warned.length}개 있어요 (위 ⚠ 항목).`)
  else {
    console.log(`✖ 리허설 실패 ${failed.length}개 — 위 ✖ 항목을 해결하기 전에는 수업에 쓰지 마세요.`)
    process.exitCode = 1
  }
})

// ============================================================================

async function runStudent(site, { payload, probedMasking }, i) {
  const row = { i: i + 1, probedMasking, surveyOk: false, recOk: false, surveyMs: 0, recMs: 0, items: 0, kind: '-', source: '-', firstReason: '' }

  const s = await http(`${site}/api/survey`, { method: 'POST', body: payload, timeoutMs: 30_000 })
  row.surveyOk = s.status === 200 && s.json?.ok === true
  row.surveyMs = s.ms
  if (!row.surveyOk) {
    log.bad(`#${row.i} 설문 ${s.status || s.error} ${s.json?.message ?? ''} ${httpHint(s.status)}`.trim())
    return row
  }

  const r = await http(`${site}/api/recommend`, {
    method: 'POST',
    body: { ...payload, responseId: s.json.responseId },
    timeoutMs: 60_000,
  })
  row.recOk = r.status === 200 && r.json?.ok === true
  row.recMs = r.ms
  // 수업 추천(items)이 0건이면 진로 카드(careers)가 화면을 채운다 (ADR-027).
  const items = Array.isArray(r.json?.items) ? r.json.items : []
  const careers = Array.isArray(r.json?.careers) ? r.json.careers : []
  row.source = r.json?.source ?? '-'
  row.kind = items.length > 0 ? '수업' : careers.length > 0 ? '진로' : '-'
  row.items = items.length > 0 ? items.length : careers.length
  row.firstReason = (items[0] ?? careers[0])?.reason ?? ''
  const line = `#${row.i} 설문 ${s.status} (${s.ms}ms) → 추천 ${r.status || r.error} (${(r.ms / 1000).toFixed(1)}초) 카드 ${row.items}개(${row.kind}) stage=${r.json?.stage ?? '-'}`
  if (row.recOk) log.info(line)
  else log.bad(`${line} ${r.json?.message ?? ''}`.trim())
  return row
}

/** 만든 리허설 회차만 지운다. 제목 접두사를 한 번 더 확인해 실제 회차를 지우는 사고를 막는다. */
async function removeRehearsal(sb, id, check) {
  const rows = await must(sb.from('lecture_sessions').select('id, title').eq('id', id), '리허설 회차 확인')
  if (rows.length === 0) return
  if (!String(rows[0].title).startsWith(PREFIX)) fail('리허설 회차가 아닌 회차를 지우려 했어요 — 중단합니다.')
  await must(sb.from('lecture_sessions').delete().eq('id', id), '리허설 회차 삭제')
  const { count, error } = await sb.from('survey_responses').select('id', { count: 'exact', head: true }).eq('session_id', id)
  if (error) {
    log.warn(`리허설 응답이 지워졌는지 확인하지 못했어요: ${error.message}`)
    return
  }
  check(count === 0, count === 0 ? '리허설 회차 삭제 (응답·추천 기록도 함께 삭제됨)' : `리허설 회차를 지웠는데 응답 ${count}건이 남았어요`)
}

/** 제목 접두사는 JS 에서 비교한다 — LIKE 패턴의 대괄호 해석에 기대지 않는다. */
async function cleanupLeftovers(sb, orgId) {
  const all = await must(sb.from('lecture_sessions').select('id, title, entry_code').eq('org_id', orgId), '남은 리허설 회차 조회')
  const rows = all.filter((r) => String(r.title).startsWith(PREFIX))
  if (rows.length === 0) {
    log.ok('남아 있는 리허설 회차가 없어요.')
    return
  }
  for (const r of rows) {
    await must(sb.from('lecture_sessions').delete().eq('id', r.id), '리허설 회차 삭제')
    log.ok(`삭제: "${r.title}" (입장 코드 ${r.entry_code})`)
  }
}
