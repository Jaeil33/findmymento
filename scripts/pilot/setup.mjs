#!/usr/bin/env node
/**
 * 파일럿 기관·강사·프로그램·회차를 Supabase 에 넣고 교실용 QR 을 만든다.
 * 여러 번 실행해도 안전하다 — 이름으로 찾아 있으면 고치고, 없으면 만든다. 입장 코드는 한 번 정해지면 유지된다.
 *
 *   npm run pilot:setup -- --dry-run     네트워크 없이 계획만 본다
 *   npm run pilot:setup                  실제 반영 + QR (+ 배포 사이트 확인)
 *
 * service_role 키를 쓴다 (RLS 우회). 이 스크립트는 운영자 PC 에서만 돈다.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import QRCode from 'qrcode'
import {
  DEFAULT_CONFIG,
  PILOT_DIR,
  ROOT,
  checkHealth,
  checkStudentPage,
  cliArgs,
  describeSupabaseError,
  fail,
  freshEntryCode,
  httpHint,
  loadCatalog,
  log,
  must,
  readConfig,
  resolveSite,
  runMain,
} from './common.mjs'
import { isLocalSite, placeholderHits, validateConfig } from './config-lib.mjs'
import { loadEnv, serviceClient, supabaseHost } from './env.mjs'
import { formatKst } from './report-lib.mjs'

const USAGE = `사용법: npm run pilot:setup -- [옵션]
  --dry-run              Supabase·사이트에 접속하지 않고 계획만 출력
  --config <경로>        설정 파일 (기본: pilot-data/pilot.config.json)
  --site <주소>          QR 이 가리킬 파일럿 사이트 (기본: .env.local 의 NEXT_PUBLIC_SITE_URL)
  --allow-custom-field   설문 선택지에 없는 분야를 경고로만 처리
  --allow-localhost      localhost 주소로 QR 만들기 허용 (내 컴퓨터 시험용)
  --skip-health          배포 사이트 확인 생략`

const SESSION_COLUMNS =
  'id, title, field, held_on, closes_at, status, entry_code, grade_band, expected_students, duration_minutes, venue, instructor_id'

await runMain(async () => {
  const args = cliArgs(
    {
      config: { type: 'string' },
      site: { type: 'string' },
      'dry-run': { type: 'boolean' },
      'allow-custom-field': { type: 'boolean' },
      'allow-localhost': { type: 'boolean' },
      'skip-health': { type: 'boolean' },
    },
    USAGE,
  )
  const dry = Boolean(args['dry-run'])
  const loaded = loadEnv()

  log.step(dry ? '계획 확인 (--dry-run: Supabase·사이트에 접속하지 않습니다)' : '파일럿 설정 반영')
  log.info(`환경 파일: ${loaded.length > 0 ? loaded.join(', ') : '없음'}`)

  // ── 1. 설정 검증
  const configPath = args.config ?? DEFAULT_CONFIG
  log.info(`설정 파일: ${relative(ROOT, configPath)}`)
  const raw = readConfig(configPath)
  const { errors, warnings, value: cfg } = validateConfig(raw, loadCatalog(), {
    allowCustomField: Boolean(args['allow-custom-field']),
  })
  for (const w of warnings) log.warn(w)
  const placeholders = placeholderHits(raw)
  if (placeholders.length > 0) {
    const msg = `예시 값이 그대로 남아 있어요 (${placeholders.join(', ')}). 학생 화면에 그대로 보이는 값이니 실제 값으로 바꾸세요.`
    if (dry) log.warn(msg)
    else errors.push(msg)
  }
  if (errors.length > 0) fail(['설정 파일을 고쳐 주세요:', ...errors.map((e) => `  - ${e}`)].join('\n'))

  // ── 2. QR 이 가리킬 주소
  let site = resolveSite(args.site)
  if (!site) {
    if (!dry) {
      fail('사이트 주소가 없어요. --site https://... 또는 .env.local 의 NEXT_PUBLIC_SITE_URL 에 파일럿 배포 주소를 넣으세요. QR 이 이 주소를 가리킵니다.')
    }
    log.warn('사이트 주소가 없어요 (--site 또는 .env.local 의 NEXT_PUBLIC_SITE_URL). 실제 실행 때는 필요합니다.')
    site = 'https://<파일럿-사이트-주소>'
  }
  if (isLocalSite(site)) {
    const msg = `QR 이 ${site} 를 가리켜요. 학생 휴대폰에서는 열리지 않습니다. 파일럿 배포 주소(https://....vercel.app)를 --site 로 주세요.`
    if (dry || args['allow-localhost']) log.warn(msg)
    else fail(`${msg}\n  (내 컴퓨터에서만 시험하려면 --allow-localhost)`)
  } else if (!site.startsWith('https://') && !site.includes('<')) {
    log.warn('https 주소가 아니에요. 일부 휴대폰 카메라 앱이 경고를 띄울 수 있어요.')
  }

  printPlan(cfg, site)
  if (dry) {
    log.step('dry-run 끝 — 아무것도 바뀌지 않았습니다. 문제가 없으면 --dry-run 없이 다시 실행하세요.')
    return
  }

  // ── 3. Supabase 반영
  const sb = serviceClient()
  log.step(`Supabase 반영 (${supabaseHost()})`)
  const org = await upsertOrg(sb, cfg.org)
  const instructor = await upsertInstructor(sb, cfg.instructor)
  await upsertPrograms(sb, instructor.id, cfg.programs)
  const session = await upsertSession(sb, org.id, instructor.id, cfg.session)
  if (cfg.orgMember) await upsertOrgMember(sb, org.id, cfg.orgMember, site)

  // ── 4. 교실용 QR
  log.step('교실용 QR')
  const qr = await writeQr({ site, code: session.entry_code, sessionTitle: session.title })
  log.ok(`QR 이미지: ${relative(ROOT, qr.png)}`)
  log.ok(`교실 화면: ${relative(ROOT, qr.html)}  (브라우저로 열고 F11 전체화면, 또는 인쇄)`)

  // ── 5. 배포 사이트 확인
  let pageFound = null
  if (!args['skip-health']) {
    log.step(`배포 사이트 확인 (${site})`)
    const { problems } = await checkHealth(site)
    for (const p of problems) log.warn(p)
    const page = await checkStudentPage(site, session.entry_code, session.title)
    pageFound = page.found
    if (page.found) log.ok(`학생 화면이 이 회차를 찾았어요 (${page.status}, ${page.ms}ms)`)
    else {
      log.warn(
        `학생 화면(${page.url})에서 이 회차를 찾지 못했어요 (${page.status || page.error}). ${httpHint(page.status)} ` +
          '배포가 같은 Supabase 를 보고 있는지, 학생 경로 수정이 배포됐는지 확인하세요.',
      )
    }
  }

  // ── 6. 요약
  const line = '━'.repeat(56)
  console.log(`\n${line}`)
  console.log(` 입장 코드   ${session.entry_code}`)
  console.log(` 학생 주소   ${qr.url}`)
  console.log(` QR 이미지   ${relative(ROOT, qr.png)}`)
  console.log(` 교실 화면   ${relative(ROOT, qr.html)}`)
  console.log(` 응답 마감   ${formatKst(session.closes_at)} (KST)`)
  console.log(line)
  if (pageFound === false) console.log('⚠ 학생 화면 확인이 실패했어요. 위 경고를 먼저 해결하세요.')
  console.log('다음: npm run pilot:rehearse   (배포 사이트에서 설문→추천→저장 리허설. 리허설 회차는 자동으로 지워집니다)')
  console.log(`수업 후: npm run pilot:export -- --code ${session.entry_code}`)
})

// ============================================================================

function printPlan(cfg, site) {
  log.step('반영할 내용')
  log.info(`기관: ${cfg.org.name} (${cfg.org.type}, 지역 ${cfg.org.region_code})`)
  log.info(`강사: ${cfg.instructor.name} (지역 ${cfg.instructor.region_code}, 분야 ${cfg.instructor.fields.join(', ') || '-'}) → 승인(approved)`)
  if (cfg.programs.length === 0) log.warn('추천 후보 프로그램: 없음 → 학생 결과 화면은 진로 카드 3장 (ADR-027)')
  for (const p of cfg.programs) {
    log.info(`추천 후보: "${p.title}" — ${p.field} · ${p.format} ${p.session_count}회 · 대상 ${p.target_grades.join('/')}`)
  }
  const s = cfg.session
  log.info(
    `회차: "${s.title}" — ${s.held_on} · ${s.field} · ${s.grade_band} · 예상 ${s.expected_students}명 · ${s.duration_minutes}분 · ${s.venue}`,
  )
  log.info(`응답 마감: ${formatKst(s.closes_at)} (KST)`)
  if (cfg.orgMember) log.info(`기관 대시보드 로그인 계정: ${cfg.orgMember.email} (${cfg.orgMember.display_name})`)
  log.info(`QR 주소: ${site}/s/<입장 코드>`)
}

/** 바뀐 칸만. closes_at 은 시간대 표기가 달라도 같은 시각이면 같다고 본다. */
function changes(current, next) {
  const patch = {}
  for (const [k, v] of Object.entries(next)) {
    const cur = current[k]
    const same =
      k === 'closes_at'
        ? new Date(cur).getTime() === new Date(v).getTime()
        : JSON.stringify(cur ?? null) === JSON.stringify(v ?? null)
    if (!same) patch[k] = v
  }
  return Object.keys(patch).length > 0 ? patch : null
}

// 본문(runMain)이 이 줄보다 위에서 돈다 — const 로 쓰면 초기화 전(TDZ)이라 멈춘다. function 선언으로 둔다.
function describePatch(patch) {
  return patch ? `수정 (${Object.keys(patch).join(', ')})` : '그대로'
}

async function upsertOrg(sb, o) {
  const rows = await must(sb.from('organizations').select('id, name, type, region_code').eq('name', o.name), '기관 조회')
  if (rows.length > 1) fail(`이름이 "${o.name}"인 기관이 ${rows.length}개예요. Supabase 에서 중복을 정리하거나 이름을 구분되게 바꾸세요.`)
  if (rows.length === 1) {
    const cur = rows[0]
    const patch = changes(cur, { type: o.type, region_code: o.region_code })
    if (patch) await must(sb.from('organizations').update(patch).eq('id', cur.id), '기관 수정')
    log.ok(`기관 "${o.name}" — ${describePatch(patch)}`)
    return { ...cur, ...patch }
  }
  const created = await must(
    sb.from('organizations').insert({ name: o.name, type: o.type, region_code: o.region_code }).select('id, name').single(),
    '기관 생성',
  )
  log.ok(`기관 "${o.name}" — 새로 만듦`)
  return created
}

async function upsertInstructor(sb, i) {
  const rows = await must(
    sb.from('instructors').select('id, name, region_code, fields, bio, status').eq('name', i.name).eq('region_code', i.region_code),
    '강사 조회',
  )
  if (rows.length > 1) fail(`이름·지역이 같은 강사가 ${rows.length}명이에요 ("${i.name}"). Supabase 에서 중복을 정리하세요.`)
  // 승인된 강사만 추천·공개 디렉토리에 나온다 (programs_read_public · E-11).
  const next = { fields: i.fields, bio: i.bio, status: 'approved' }
  if (rows.length === 1) {
    const cur = rows[0]
    const patch = changes(cur, next)
    if (patch) await must(sb.from('instructors').update(patch).eq('id', cur.id), '강사 수정')
    log.ok(`강사 "${i.name}" — ${describePatch(patch)}`)
    return cur
  }
  const created = await must(
    sb.from('instructors').insert({ name: i.name, region_code: i.region_code, ...next }).select('id, name').single(),
    '강사 생성',
  )
  log.ok(`강사 "${i.name}" — 새로 만듦 (승인)`)
  return created
}

async function upsertPrograms(sb, instructorId, programs) {
  const existing = await must(
    sb.from('programs').select('id, title, field, target_grades, format, session_count, summary, outline').eq('instructor_id', instructorId),
    '프로그램 조회',
  )
  for (const p of programs) {
    const next = {
      field: p.field,
      target_grades: p.target_grades,
      format: p.format,
      session_count: p.session_count,
      summary: p.summary,
      outline: p.outline,
    }
    const same = existing.filter((e) => e.title === p.title)
    if (same.length > 1) fail(`제목이 "${p.title}"인 프로그램이 ${same.length}개예요. Supabase 에서 중복을 정리하세요.`)
    if (same.length === 1) {
      const patch = changes(same[0], next)
      if (patch) await must(sb.from('programs').update(patch).eq('id', same[0].id), '프로그램 수정')
      log.ok(`추천 후보 "${p.title}" — ${describePatch(patch)}`)
    } else {
      await must(sb.from('programs').insert({ instructor_id: instructorId, title: p.title, ...next }), '프로그램 생성')
      log.ok(`추천 후보 "${p.title}" — 새로 만듦`)
    }
  }
  const extra = existing.filter((e) => !programs.some((p) => p.title === e.title))
  if (extra.length > 0) {
    log.warn(
      `설정에 없는 이 강사의 기존 프로그램 ${extra.length}개는 그대로 둡니다 — 계속 추천 후보로 나옵니다: ` +
        `${extra.map((e) => `"${e.title}"`).join(', ')}. 빼려면 Supabase Table Editor 에서 지우세요.`,
    )
  }
}

async function upsertSession(sb, orgId, instructorId, s) {
  const rows = await must(
    sb.from('lecture_sessions').select(SESSION_COLUMNS).eq('org_id', orgId).eq('title', s.title).eq('held_on', s.held_on),
    '회차 조회',
  )
  if (rows.length > 1) fail(`같은 날 제목이 "${s.title}"인 회차가 ${rows.length}개예요. Supabase 에서 중복을 정리하세요.`)
  const next = {
    instructor_id: instructorId,
    field: s.field,
    closes_at: s.closes_at,
    grade_band: s.grade_band,
    expected_students: s.expected_students,
    duration_minutes: s.duration_minutes,
    venue: s.venue,
  }
  if (rows.length === 1) {
    const cur = rows[0]
    const patch = changes(cur, next)
    if (patch) await must(sb.from('lecture_sessions').update(patch).eq('id', cur.id), '회차 수정')
    log.ok(`회차 "${s.title}" (${s.held_on}) — ${describePatch(patch)} · 입장 코드 ${cur.entry_code} 유지`)
    if (cur.status !== 'open') {
      log.warn(`이 회차는 status='${cur.status}' 라 학생이 응답할 수 없어요. 다시 열려면 Supabase 에서 status 를 open 으로 바꾸세요.`)
    }
    return { ...cur, ...patch }
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    const entryCode = await freshEntryCode(sb)
    const { data, error } = await sb
      .from('lecture_sessions')
      .insert({ org_id: orgId, title: s.title, held_on: s.held_on, status: 'open', entry_code: entryCode, ...next })
      .select(SESSION_COLUMNS)
      .single()
    if (!error) {
      log.ok(`회차 "${s.title}" (${s.held_on}) — 새로 만듦 · 입장 코드 ${entryCode}`)
      return data
    }
    // 동시에 같은 코드를 잡은 경우만 다시 뽑는다.
    if (error.code === '23505' && /entry_code/.test(`${error.message} ${error.details ?? ''}`)) continue
    throw describeSupabaseError(error, '회차 생성')
  }
  fail('입장 코드가 계속 겹쳐요. 다시 실행해 주세요.')
}

async function findOrCreateAuthUser(sb, email) {
  const perPage = 200
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage })
    if (error) throw describeSupabaseError(error, '로그인 계정 조회')
    const users = data?.users ?? []
    const hit = users.find((u) => (u.email ?? '').toLowerCase() === email)
    if (hit) return { user: hit, created: false }
    if (users.length < perPage) break
  }
  const { data, error } = await sb.auth.admin.createUser({ email, email_confirm: true })
  if (error) throw describeSupabaseError(error, '로그인 계정 생성')
  return { user: data.user, created: true }
}

/**
 * 수업 후 기관 리포트를 볼 로그인 계정. 역할은 org_members 행으로만 정해진다 (CLAUDE.md CRITICAL) —
 * 공개 가입 화면 없이 운영자가 직접 연결한다.
 */
async function upsertOrgMember(sb, orgId, m, site) {
  const { user, created } = await findOrCreateAuthUser(sb, m.email)

  const admins = await must(sb.from('admins').select('auth_user_id').eq('auth_user_id', user.id), '운영자 여부 확인')
  if (admins.length > 0) {
    log.warn(`${m.email} 은 운영자(admins)로도 등록돼 있어 로그인하면 운영자 화면으로 갑니다. 기관 리포트용으로는 다른 이메일을 쓰세요.`)
  }

  const rows = await must(
    sb.from('org_members').select('id, org_id, display_name, active').eq('auth_user_id', user.id),
    '기관 담당자 조회',
  )
  if (rows.length > 0 && rows[0].org_id !== orgId) {
    fail(`${m.email} 은 이미 다른 기관의 담당자로 연결돼 있어요. 다른 이메일을 쓰거나 Supabase 에서 org_members 를 정리하세요.`)
  }
  if (rows.length > 0) {
    const patch = changes(rows[0], { display_name: m.display_name, active: true })
    if (patch) await must(sb.from('org_members').update(patch).eq('id', rows[0].id), '기관 담당자 수정')
    log.ok(`기관 대시보드 계정 ${m.email} — ${describePatch(patch)}`)
  } else {
    await must(
      sb.from('org_members').insert({ auth_user_id: user.id, org_id: orgId, role: 'manager', display_name: m.display_name, active: true }),
      '기관 담당자 연결',
    )
    log.ok(`기관 대시보드 계정 ${m.email} — ${created ? '로그인 계정을 만들고 ' : ''}기관에 연결`)
  }
  log.info(
    `로그인: ${site}/login 에서 이 이메일로 로그인 링크를 받습니다. 먼저 Supabase → Authentication → URL Configuration 에 ` +
      `Site URL(${site})과 Redirect URL(${site}/login/callback)을 넣어 두세요.`,
  )
}

// ============================================================================
// QR
// ============================================================================

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

async function writeQr({ site, code, sessionTitle }) {
  mkdirSync(PILOT_DIR, { recursive: true })
  const url = `${site}/s/${code}`
  const opts = { width: 1200, margin: 2, errorCorrectionLevel: 'M' }
  const png = join(PILOT_DIR, `qr-${code}.png`)
  await QRCode.toFile(png, url, { ...opts, type: 'png' })
  const dataUrl = await QRCode.toDataURL(url, opts)
  const html = join(PILOT_DIR, `qr-${code}.html`)
  writeFileSync(html, qrPage({ url, code, dataUrl, sessionTitle }), 'utf8')
  return { url, png, html }
}

/**
 * 교실 화면·인쇄용 한 장. 기준은 "교실 뒤쪽 좌석에서 보이는가"다 (UI_GUIDE 안전규칙 9).
 * 학생에게 이 화면은 "만족도 조사"가 아니다 — 문구는 다음 교육 찾기 쪽으로 쓴다 (SURVEY.md 원칙 7).
 */
function qrPage({ url, code, dataUrl, sessionTitle }) {
  const withoutScheme = url.replace(/^https?:\/\//, '')
  const prefix = withoutScheme.slice(0, withoutScheme.length - code.length)
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>교실 QR · ${esc(sessionTitle)}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; padding: 3vh 4vw;
    display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2vh;
    background: #fff; color: #111; text-align: center;
    font-family: Pretendard, "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", system-ui, sans-serif;
  }
  .eyebrow { margin: 0; font-size: clamp(16px, 2.4vh, 28px); color: #555; }
  h1 { margin: 0; font-size: clamp(28px, 5.2vh, 64px); letter-spacing: -0.02em; }
  img.qr { width: min(58vh, 86vw); height: auto; image-rendering: pixelated; }
  .url { margin: 0; font-size: clamp(18px, 3.2vh, 40px); font-weight: 600; word-break: break-all; }
  .url b { font-size: 1.3em; letter-spacing: 0.08em; color: #0b57d0; }
  ul { margin: 0; padding: 0; list-style: none; font-size: clamp(20px, 3.1vh, 38px); line-height: 1.55; }
  .note { margin: 0; font-size: clamp(14px, 1.9vh, 22px); color: #555; }
  @media print {
    body { min-height: auto; padding: 12mm; gap: 6mm; }
    img.qr { width: 150mm; }
  }
</style>
</head>
<body>
  <p class="eyebrow">${esc(sessionTitle)}</p>
  <h1>나에게 맞는 다음 교육 찾기</h1>
  <img class="qr" src="${dataUrl}" alt="휴대폰 카메라로 찍는 QR 코드">
  <p class="url">${esc(prefix)}<b>${esc(code)}</b></p>
  <ul>
    <li>휴대폰 카메라로 QR을 찍어요</li>
    <li>이름·학교·연락처는 묻지 않아요</li>
    <li>3분이면 끝나고, 나에게 맞는 다음 교육을 알려줘요</li>
  </ul>
  <p class="note">QR이 안 찍히면 위 주소를 그대로 입력하세요. '참여 코드' 칸이 보이면 <b>코드 없이 참여하기</b>를 누르면 돼요.</p>
</body>
</html>
`
}
