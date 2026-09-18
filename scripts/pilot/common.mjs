/**
 * 파일럿 스크립트 공용 — 경로, 오류 출력, 스키마 허용값 읽기, HTTP, Supabase 오류 해석.
 * 키 값은 어디에서도 출력하지 않는다.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomInt } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import {
  normalizeSite,
  parseFieldUnsure,
  parseFields,
  parseSqlEnums,
  parseSqlRanges,
  parseVenues,
} from './config-lib.mjs'

export const ROOT = fileURLToPath(new URL('../../', import.meta.url))
export const PILOT_DIR = join(ROOT, 'pilot-data')
export const DEFAULT_CONFIG = join(PILOT_DIR, 'pilot.config.json')
export const MIGRATIONS_DIR = join(ROOT, 'supabase', 'migrations')

/** 사용자가 고칠 수 있는 문제. 스택 없이 한국어 문장만 출력한다. */
export class PilotError extends Error {}

export function fail(message) {
  throw new PilotError(message)
}

export async function runMain(main) {
  try {
    await main()
  } catch (e) {
    if (e instanceof PilotError) console.error(`\n✖ ${e.message}`)
    else console.error('\n✖ 예상하지 못한 오류:', e)
    process.exitCode = 1
  }
}

/** node:util parseArgs + 한국어 오류. */
export function cliArgs(options, usage) {
  try {
    const { values } = parseArgs({ options: { ...options, help: { type: 'boolean', short: 'h' } }, strict: true })
    if (values.help) {
      console.log(usage)
      process.exit(0)
    }
    return values
  } catch (e) {
    fail(`명령 옵션을 읽을 수 없어요: ${e.message}\n\n${usage}`)
  }
}

export const log = {
  ok: (msg) => console.log(`  ✔ ${msg}`),
  info: (msg) => console.log(`  · ${msg}`),
  warn: (msg) => console.log(`  ⚠ ${msg}`),
  bad: (msg) => console.log(`  ✖ ${msg}`),
  step: (msg) => console.log(`\n▶ ${msg}`),
}

// ============================================================================
// 스키마 허용값 — 마이그레이션·도메인 타입에서 직접 읽는다
// ============================================================================

export function migrationFiles() {
  if (!existsSync(MIGRATIONS_DIR)) fail(`마이그레이션 폴더가 없어요: ${MIGRATIONS_DIR}`)
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => join(MIGRATIONS_DIR, f))
}

export function loadCatalog() {
  const sql = migrationFiles()
    .map((f) => readFileSync(f, 'utf8'))
    .join('\n')
  const domain = readFileSync(join(ROOT, 'src', 'types', 'domain.ts'), 'utf8')
  const regionJson = JSON.parse(readFileSync(join(ROOT, 'src', 'data', 'region-adjacency.json'), 'utf8'))

  const catalog = {
    enums: parseSqlEnums(sql),
    ranges: parseSqlRanges(sql),
    venues: parseVenues(sql),
    fields: parseFields(domain),
    fieldUnsure: parseFieldUnsure(domain),
    regions: Array.isArray(regionJson.regions) ? regionJson.regions : [],
  }
  for (const name of ['org_type', 'grade_band', 'program_format']) {
    if (!catalog.enums[name]?.length) fail(`마이그레이션에서 ${name} 열거형을 읽지 못했어요. supabase/migrations 를 확인하세요.`)
  }
  if (catalog.fields.length === 0) fail('src/types/domain.ts 에서 FIELDS 목록을 읽지 못했어요.')
  if (catalog.regions.length === 0) fail('src/data/region-adjacency.json 에서 시군구 목록을 읽지 못했어요.')
  return catalog
}

export function readConfig(path = DEFAULT_CONFIG) {
  if (!existsSync(path)) {
    fail(
      `설정 파일이 없어요: ${path}\n  scripts/pilot/pilot.config.example.json 을 pilot-data/pilot.config.json 으로 복사해서 실제 값으로 채우세요.`,
    )
  }
  try {
    return JSON.parse(readFileSync(path, 'utf8').replace(/^﻿/, ''))
  } catch (e) {
    fail(`설정 파일이 올바른 JSON 이 아니에요 (${path}): ${e.message}`)
  }
}

/** --site 인자 → .env 의 NEXT_PUBLIC_SITE_URL 순. 끝의 / 는 뗀다. 없으면 null. */
export function resolveSite(arg) {
  const raw = arg ?? process.env.NEXT_PUBLIC_SITE_URL
  if (raw === undefined || raw === null || String(raw).trim() === '') return null
  const site = normalizeSite(raw)
  if (!site) fail(`사이트 주소가 올바르지 않아요: "${raw}" (예: https://findmymento-pilot.vercel.app)`)
  return site
}

// ============================================================================
// 날짜 (한국 시간 고정 +09:00, 서머타임 없음)
// ============================================================================

export function kstDate(date = new Date()) {
  return new Date(date.getTime() + 9 * 3600_000).toISOString().slice(0, 10)
}

// ============================================================================
// Supabase — 오류를 사용자가 고칠 수 있는 문장으로
// ============================================================================

export function describeSupabaseError(error, context) {
  const code = error?.code ?? ''
  const message = String(error?.message ?? error ?? '')
  if (code === 'PGRST205' || code === '42P01' || /does not exist|schema cache/i.test(message)) {
    return new PilotError(
      `${context}: 테이블이 없어요. pilot-data/setup-all.sql 을 Supabase SQL Editor 에서 먼저 실행했는지 확인하세요. (${message})`,
    )
  }
  if (code === '42501' || /permission denied|row-level security/i.test(message)) {
    return new PilotError(
      `${context}: 권한 오류예요. SUPABASE_SERVICE_ROLE_KEY 가 service_role(secret) 키인지 확인하세요. (${message})`,
    )
  }
  if (/invalid api key|jwt|apikey|unauthorized/i.test(message)) {
    return new PilotError(`${context}: Supabase 키가 올바르지 않아요. .env.local 의 URL·키를 다시 복사해 넣으세요. (${message})`)
  }
  if (/fetch failed|ENOTFOUND|ECONNREFUSED|network/i.test(message)) {
    return new PilotError(`${context}: Supabase 에 연결하지 못했어요. NEXT_PUBLIC_SUPABASE_URL 과 인터넷 연결을 확인하세요. (${message})`)
  }
  return new PilotError(`${context}: ${message}${code ? ` (code ${code})` : ''}`)
}

/** `{ data, error }` 를 풀고 오류면 던진다. */
export async function must(query, context) {
  const { data, error } = await query
  if (error) throw describeSupabaseError(error, context)
  return data
}

/** 테이블이 아직 없으면 null (recommendation_logs 처럼 나중에 생기는 테이블용). */
export async function optionalRows(query, context) {
  const { data, error } = await query
  if (!error) return data
  const message = String(error.message ?? '')
  if (error.code === 'PGRST205' || error.code === '42P01' || /does not exist|schema cache/i.test(message)) return null
  throw describeSupabaseError(error, context)
}

/** 아직 쓰이지 않은 6자리 입장 코드. 0 으로 시작하는 코드는 만들지 않는다 (읽어 줄 때 헷갈린다). */
export async function freshEntryCode(sb) {
  for (let i = 0; i < 30; i++) {
    const code = String(randomInt(100000, 1000000))
    const rows = await must(sb.from('lecture_sessions').select('id').eq('entry_code', code).limit(1), '입장 코드 중복 확인')
    if (rows.length === 0) return code
  }
  fail('사용하지 않은 입장 코드를 찾지 못했어요. 다시 실행해 주세요.')
}

// ============================================================================
// HTTP — 배포된 사이트 확인
// ============================================================================

export async function http(url, { method = 'GET', body, timeoutMs = 30_000 } = {}) {
  const t0 = performance.now()
  try {
    const res = await fetch(url, {
      method,
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    })
    const text = await res.text()
    let json = null
    try {
      json = JSON.parse(text)
    } catch {
      // HTML 응답
    }
    return { status: res.status, ok: res.ok, json, text, ms: Math.round(performance.now() - t0), error: null }
  } catch (e) {
    const timeout = e?.name === 'TimeoutError' || e?.name === 'AbortError'
    return {
      status: 0,
      ok: false,
      json: null,
      text: '',
      ms: Math.round(performance.now() - t0),
      error: timeout ? `시간 초과(${timeoutMs}ms)` : String(e?.cause?.code ?? e?.message ?? e),
    }
  }
}

/** 401/403 은 거의 항상 Vercel Deployment Protection 이다 — 학생 휴대폰에서도 똑같이 막힌다. */
export function httpHint(status) {
  if (status === 401 || status === 403) {
    return 'Vercel Deployment Protection(Vercel Authentication)이 켜져 있어요. 학생 휴대폰에서도 막힙니다. Vercel → Settings → Deployment Protection 에서 끄거나 운영(Production) 주소를 쓰세요.'
  }
  if (status === 404) return '주소가 맞는지, 배포가 끝났는지 확인하세요.'
  if (status === 0) return '사이트에 연결하지 못했어요. 주소와 인터넷 연결을 확인하세요.'
  return ''
}

/**
 * /api/health 로 배포 상태를 확인한다. 문제는 배열로 돌려준다 — 호출자가 치명 여부를 정한다.
 * mode 가 demo 면 응답이 서버 메모리에만 쓰이고 사라진다 (docs/DEPLOY.md).
 */
export async function checkHealth(site) {
  const r = await http(`${site}/api/health`, { timeoutMs: 20_000 })
  if (!r.ok || !r.json) {
    return {
      health: null,
      problems: [`${site}/api/health 확인 실패 (${r.status || r.error}). ${httpHint(r.status)}`.trim()],
    }
  }
  const h = r.json
  const c = h.config ?? {}
  const yes = (b) => (b ? '있음' : '없음')
  log.info(`배포 모드: ${h.mode} · AI: ${h.ai_mode} · 커밋: ${h.commit ?? '-'}`)
  log.info(
    `환경변수 — Supabase URL ${yes(c.supabase_url)} · anon ${yes(c.supabase_anon_key)} · service_role ${yes(c.service_role_key)} · Anthropic ${yes(c.anthropic_api_key)} · SITE_URL ${yes(c.site_url_explicit)}`,
  )

  const problems = []
  if (h.mode !== 'live') {
    problems.push(
      '사이트가 데모 모드예요 — 학생 응답이 서버 메모리에만 쓰이고 사라집니다. Vercel 파일럿 프로젝트에 NEXT_PUBLIC_SUPABASE_URL·NEXT_PUBLIC_SUPABASE_ANON_KEY 를 넣고 재배포하세요.',
    )
  }
  if (!c.service_role_key) problems.push('배포에 SUPABASE_SERVICE_ROLE_KEY 가 없어요. 학생 입장 코드 확인이 동작하지 않을 수 있어요.')
  if (!c.anthropic_api_key) problems.push('배포에 ANTHROPIC_API_KEY 가 없어요. 추천 이유가 규칙 문장으로만 나옵니다.')
  if (!c.site_url_explicit) problems.push('배포에 NEXT_PUBLIC_SITE_URL 이 없어요.')
  if (h.site_url && normalizeSite(h.site_url) !== site) {
    problems.push(`배포의 NEXT_PUBLIC_SITE_URL(${h.site_url})이 지금 쓰는 주소(${site})와 달라요.`)
  }
  return { health: h, problems }
}

/** React 서버 렌더링이 텍스트를 이스케이프하는 방식과 같게. */
const escapeHtmlText = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')

/** 학생 화면이 이 회차를 찾는지 — 제목이 HTML 에 있으면 찾은 것이다. */
export async function checkStudentPage(site, entryCode, title) {
  const url = `${site}/s/${entryCode}`
  const r = await http(url, { timeoutMs: 20_000 })
  const found = r.ok && (r.text.includes(title) || r.text.includes(escapeHtmlText(title)))
  return { url, status: r.status, ms: r.ms, found, error: r.error }
}
