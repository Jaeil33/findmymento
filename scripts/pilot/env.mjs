/**
 * .env.local 읽기 + Supabase 클라이언트. dotenv 없이 동작한다.
 *
 * **키 값은 절대 출력하지 않는다.** 확인용으로 보여 주는 것은 Supabase 프로젝트 호스트와
 * "있음/없음" 뿐이다. service_role 키는 RLS 를 우회하므로 이 스크립트(로컬)와 서버 라우트에서만 쓴다.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { PilotError, ROOT } from './common.mjs'
import { keyProblems, parseEnvFile } from './config-lib.mjs'

/** 프로젝트 루트의 .env.local → .env 순으로 읽어 비어 있는 process.env 만 채운다. */
export function loadEnv(files = ['.env.local', '.env']) {
  const loaded = []
  for (const f of files) {
    const path = join(ROOT, f)
    if (!existsSync(path)) continue
    const parsed = parseEnvFile(readFileSync(path, 'utf8'))
    for (const [k, v] of Object.entries(parsed)) {
      if (process.env[k] === undefined || process.env[k] === '') process.env[k] = v
    }
    loaded.push(f)
  }
  return loaded
}

const clean = (v) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)

export function supabaseUrl() {
  return clean(process.env.NEXT_PUBLIC_SUPABASE_URL) ?? clean(process.env.SUPABASE_URL)
}

/** 출력용 — 키가 아니라 프로젝트 주소의 호스트만. */
export function supabaseHost() {
  const url = supabaseUrl()
  if (!url) return '(설정 안 됨)'
  try {
    return new URL(url).host
  } catch {
    return '(주소 형식 오류)'
  }
}

/** NEXT_PUBLIC_ 에 비밀 키가 들어간 조합 등 위험한 설정이면 멈춘다. */
export function assertSafeKeys(env = process.env) {
  const problems = keyProblems(env)
  if (problems.length > 0) {
    throw new PilotError(['환경변수 설정이 위험해요. 고친 뒤 다시 실행하세요:', ...problems.map((p) => `  - ${p}`)].join('\n'))
  }
}

function missingMessage(names) {
  return (
    `${names.join(', ')} 가 비어 있어요. 프로젝트 루트의 .env.local 에 넣어 주세요.\n` +
    '  값 위치: Supabase 대시보드 → Project Settings → API Keys (자세한 순서는 scripts/pilot/README.md)'
  )
}

/** service_role 클라이언트. RLS 를 우회한다 — 로컬 스크립트 전용. */
export function serviceClient() {
  const url = supabaseUrl()
  const key = clean(process.env.SUPABASE_SERVICE_ROLE_KEY)
  const missing = [!url && 'NEXT_PUBLIC_SUPABASE_URL', !key && 'SUPABASE_SERVICE_ROLE_KEY'].filter(Boolean)
  if (missing.length > 0) throw new PilotError(missingMessage(missing))
  assertSafeKeys()
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

/** anon 클라이언트 — 학생(비로그인)과 같은 권한. RLS 가 그대로 걸린다. */
export function anonClient() {
  const url = supabaseUrl()
  const key = clean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  const missing = [!url && 'NEXT_PUBLIC_SUPABASE_URL', !key && 'NEXT_PUBLIC_SUPABASE_ANON_KEY'].filter(Boolean)
  if (missing.length > 0) throw new PilotError(missingMessage(missing))
  assertSafeKeys()
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}
