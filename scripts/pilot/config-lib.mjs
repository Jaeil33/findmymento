/**
 * 파일럿 스크립트의 **순수 함수** — 파일·네트워크를 건드리지 않는다.
 * tests/pilot-config.test.ts 가 직접 검증한다. 타입 선언은 config-lib.d.mts.
 *
 * 여기서 막는 것은 전부 "교실에 가서야 드러나는" 실수다:
 * 존재하지 않는 시군구 코드(추천이 비어 버림), 설문 선택지에 없는 분야, 이미 지난 마감 시각,
 * 예시 값이 그대로 남은 설정, NEXT_PUBLIC_ 변수에 들어간 서비스 키.
 */

// ============================================================================
// 1. .env 파일 파서 (dotenv 없이)
// ============================================================================

/** `KEY=VALUE` 줄을 읽는다. `export ` 접두사·따옴표·줄 끝 주석(따옴표 밖의 ` #`)을 처리한다. */
export function parseEnvFile(text) {
  const out = {}
  const src = String(text ?? '').replace(/^﻿/, '')
  for (const raw of src.split(/\r?\n/)) {
    const line = raw.trim()
    if (line === '' || line.startsWith('#')) continue
    const m = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line)
    if (!m) continue
    const key = m[1]
    let value = m[2] ?? ''
    const quote = value[0]
    if (quote === '"' || quote === "'") {
      const end = value.lastIndexOf(quote)
      value = end > 0 ? value.slice(1, end) : value.slice(1)
    } else {
      const hash = value.search(/\s#/)
      if (hash >= 0) value = value.slice(0, hash)
      value = value.trim()
    }
    out[key] = value
  }
  return out
}

// ============================================================================
// 2. 키 종류 판별 — 값은 절대 출력하지 않는다. 역할 이름만 돌려준다
// ============================================================================

/**
 * Supabase 키의 역할. 새 키(`sb_publishable_` / `sb_secret_`)와 예전 JWT 키(anon / service_role) 둘 다 읽는다.
 * 반환: 'missing' | 'anon' | 'service_role' | 'unknown' | (JWT 의 다른 role 값)
 */
export function keyRole(key) {
  const k = typeof key === 'string' ? key.trim() : ''
  if (k === '') return 'missing'
  if (k.startsWith('sb_publishable_')) return 'anon'
  if (k.startsWith('sb_secret_')) return 'service_role'
  const parts = k.split('.')
  if (parts.length === 3) {
    try {
      const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
      const payload = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'))
      if (payload && typeof payload.role === 'string') return payload.role
    } catch {
      // JWT 가 아니면 모른다고 답한다.
    }
  }
  return 'unknown'
}

/**
 * 환경변수 조합의 위험 신호를 문장으로 돌려준다. 빈 배열이면 안전하다.
 * - NEXT_PUBLIC_ 값은 브라우저 번들에 그대로 들어간다 (CLAUDE.md CRITICAL: service_role 노출 금지).
 */
export function keyProblems(env) {
  const problems = []
  const e = env ?? {}
  for (const [name, value] of Object.entries(e)) {
    if (!name.startsWith('NEXT_PUBLIC_')) continue
    if (/SERVICE_ROLE|SECRET|ANTHROPIC/.test(name)) {
      problems.push(`${name}: NEXT_PUBLIC_ 접두사가 붙은 비밀 값은 브라우저 번들에 들어갑니다. 접두사를 빼세요.`)
      continue
    }
    if (typeof value !== 'string') continue
    if (keyRole(value) === 'service_role') {
      problems.push(
        `${name} 에 service_role(secret) 키가 들어가 있어요. NEXT_PUBLIC_ 값은 브라우저에 그대로 노출됩니다. anon(publishable) 키로 바꾸세요.`,
      )
    } else if (value.trim().startsWith('sk-ant-')) {
      problems.push(`${name} 에 Anthropic API 키가 들어가 있어요. 브라우저에 노출됩니다. ANTHROPIC_API_KEY 로 옮기세요.`)
    }
  }
  const service = keyRole(e.SUPABASE_SERVICE_ROLE_KEY)
  if (service === 'anon') {
    problems.push('SUPABASE_SERVICE_ROLE_KEY 자리에 anon(publishable) 키가 들어가 있어요. service_role(secret) 키를 넣으세요.')
  }
  const anon = keyRole(e.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  if (anon !== 'missing' && anon !== 'anon' && anon !== 'unknown' && anon !== 'service_role') {
    problems.push(`NEXT_PUBLIC_SUPABASE_ANON_KEY 의 역할이 '${anon}' 이에요. anon(publishable) 키를 넣으세요.`)
  }
  return problems
}

// ============================================================================
// 3. 스키마에서 허용값 읽기 — 목록을 여기에 복사해 두면 마이그레이션과 어긋난다
// ============================================================================

const quoted = (s) => [...String(s).matchAll(/'([^']*)'/g)].map((m) => m[1])

/** `create type x as enum ('a', 'b')` → { x: ['a', 'b'] } */
export function parseSqlEnums(sql) {
  const out = {}
  for (const m of String(sql).matchAll(/create\s+type\s+(?:public\.)?(\w+)\s+as\s+enum\s*\(([^)]*)\)/gi)) {
    out[m[1]] = quoted(m[2])
  }
  return out
}

/** `check (col between 1 and 60)` → { col: { min: 1, max: 60 } } */
export function parseSqlRanges(sql) {
  const out = {}
  for (const m of String(sql).matchAll(/(\w+)\s+between\s+(-?\d+)\s+and\s+(-?\d+)/gi)) {
    out[m[1]] = { min: Number(m[2]), max: Number(m[3]) }
  }
  return out
}

/** `venue in ('교실', ...)` 체크 제약의 허용값 */
export function parseVenues(sql) {
  const m = /venue\s+in\s*\(([^)]*)\)/i.exec(String(sql))
  return m ? quoted(m[1]) : []
}

/** src/types/domain.ts 의 `export const FIELDS = [...]` — 설문 Q4 선택지와 같은 목록 */
export function parseFields(domainTs) {
  const m = /export\s+const\s+FIELDS\s*=\s*\[([^\]]*)\]/.exec(String(domainTs))
  return m ? quoted(m[1]) : []
}

export function parseFieldUnsure(domainTs) {
  const m = /export\s+const\s+FIELD_UNSURE\s*=\s*'([^']*)'/.exec(String(domainTs))
  return m ? m[1] : null
}

// ============================================================================
// 4. 작은 도우미
// ============================================================================

/** 이름·라벨이 겹치는 시군구를 `경기 광명시 = 41210` 꼴로. */
export function suggestRegions(regions, query) {
  const q = String(query ?? '').replace(/\s+/g, '')
  if (q === '') return []
  return (regions ?? [])
    .filter((r) => {
      const label = String(r.label ?? '').replace(/\s+/g, '')
      const name = String(r.name ?? '').replace(/\s+/g, '')
      return label.includes(q) || name.includes(q) || (q.length >= 2 && q.includes(name))
    })
    .map((r) => `${r.label} = ${r.code}`)
}

/** 끝의 `/` 를 떼고 http(s) 주소인지 확인한다. 아니면 null. */
export function normalizeSite(url) {
  const s = typeof url === 'string' ? url.trim().replace(/\/+$/, '') : ''
  return /^https?:\/\/[^\s/]+/.test(s) ? s : null
}

/** 학생 휴대폰에서 열리지 않는 주소 (내 컴퓨터·사설망). */
export function isLocalSite(url) {
  return /^https?:\/\/(localhost|127\.|0\.0\.0\.0|\[::1\]|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(
    String(url ?? ''),
  )
}

/** 마감 시각을 비우면 수업 날 한국 시간 23:59 에 닫는다. */
export function defaultClosesAt(heldOn) {
  return `${heldOn}T23:59:00+09:00`
}

/** 예시 파일 값이 그대로 남은 곳. 실제 학생에게 가짜 강사·과정이 보이면 안 된다. */
export function placeholderHits(raw) {
  const hits = []
  const walk = (v, path) => {
    if (typeof v === 'string') {
      if (/OO|○○|example\.com|담당자 이름/.test(v)) hits.push(path)
    } else if (Array.isArray(v)) {
      v.forEach((x, i) => walk(x, `${path}[${i}]`))
    } else if (v && typeof v === 'object') {
      for (const [k, x] of Object.entries(v)) if (!k.startsWith('_')) walk(x, path ? `${path}.${k}` : k)
    }
  }
  walk(raw, '')
  return hits
}

// ============================================================================
// 5. 파일럿 설정 검증
// ============================================================================

const isObj = (v) => typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v) => (typeof v === 'string' ? v.trim() : '')

/**
 * pilot-data/pilot.config.json 을 검증하고 정규화한다.
 * @param raw JSON.parse 결과
 * @param catalog loadCatalog() 결과 — { enums, ranges, venues, fields, regions }
 * @param opts { now?: Date, allowCustomField?: boolean }
 * @returns { errors: string[], warnings: string[], value: 정규화된 설정 | null }
 */
export function validateConfig(raw, catalog, opts = {}) {
  const now = opts.now instanceof Date ? opts.now : new Date()
  const allowCustomField = Boolean(opts.allowCustomField)
  const errors = []
  const warnings = []
  const err = (path, msg) => errors.push(`${path}: ${msg}`)
  const warn = (path, msg) => warnings.push(`${path}: ${msg}`)

  if (!isObj(raw)) {
    return { errors: ['설정 파일의 최상위가 JSON 객체({ ... })가 아니에요.'], warnings, value: null }
  }

  const enums = catalog.enums ?? {}
  const ranges = catalog.ranges ?? {}
  const regions = catalog.regions ?? []
  const fieldList = catalog.fields ?? []
  const venueList = catalog.venues ?? []
  const regionCodes = new Set(regions.map((r) => r.code))

  const known = new Set(['org', 'instructor', 'programs', 'session', 'orgMember'])
  for (const k of Object.keys(raw)) {
    if (!k.startsWith('_') && !known.has(k)) warn(k, '알 수 없는 항목이라 무시합니다.')
  }

  const text = (path, v, { required = false, max = 200 } = {}) => {
    if (v !== undefined && v !== null && typeof v !== 'string') {
      err(path, '문자열이어야 해요.')
      return ''
    }
    const s = str(v)
    if (required && s === '') err(path, '비어 있어요.')
    if (s.length > max) err(path, `${max}자 이내로 써 주세요 (지금 ${s.length}자).`)
    return s
  }

  const oneOf = (path, v, list, label) => {
    const s = str(v)
    if (!list.includes(s)) err(path, `"${s}"는 쓸 수 없는 값이에요. ${label}: ${list.join(' / ')}`)
    return s
  }

  const region = (path, v) => {
    const code = str(v)
    if (regionCodes.has(code)) return code
    const hints = suggestRegions(regions, code)
    err(
      path,
      `시군구 코드 "${code}"를 찾을 수 없어요.` +
        (hints.length > 0
          ? ` 혹시: ${hints.slice(0, 5).join(', ')}`
          : ' src/data/region-adjacency.json 의 5자리 code 를 쓰세요 (예: 경기 광명시 = 41210). 수도권 66개 시군구만 지원합니다.'),
    )
    return code
  }

  const field = (path, v) => {
    const s = str(v)
    if (s === '') {
      err(path, '분야가 비어 있어요.')
      return s
    }
    if (!fieldList.includes(s)) {
      const msg = `"${s}"는 설문 관심 분야 선택지(${fieldList.join(' / ')})에 없어요. 학생이 고를 수 없는 분야라 추천이 맞춰지지 않습니다.`
      if (allowCustomField) warn(path, msg)
      else err(path, `${msg} 그래도 쓰려면 --allow-custom-field 를 붙이세요.`)
    }
    return s
  }

  const int = (path, v, rangeKey, fallback) => {
    if ((v === undefined || v === null || v === '') && fallback !== undefined) return fallback
    const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v
    const r = ranges[rangeKey]
    if (typeof n !== 'number' || !Number.isInteger(n)) {
      err(path, '정수여야 해요.')
      return fallback ?? 0
    }
    if (r && (n < r.min || n > r.max)) err(path, `${r.min}~${r.max} 사이여야 해요 (지금 ${n}).`)
    return n
  }

  const strList = (path, v) => {
    if (v === undefined || v === null) return []
    if (!Array.isArray(v)) {
      err(path, '배열이어야 해요 (예: ["...", "..."]).')
      return []
    }
    const out = []
    v.forEach((x, i) => {
      if (typeof x !== 'string' || x.trim() === '') err(`${path}[${i}]`, '비어 있지 않은 문자열이어야 해요.')
      else out.push(x.trim())
    })
    return out
  }

  // ── 기관
  const o = isObj(raw.org) ? raw.org : (err('org', '기관 정보가 없어요.'), {})
  const org = {
    name: text('org.name', o.name, { required: true, max: 100 }),
    type: oneOf('org.type', o.type, enums.org_type ?? [], '기관 유형'),
    region_code: region('org.region_code', o.region_code),
  }

  // ── 강사
  const i = isObj(raw.instructor) ? raw.instructor : (err('instructor', '강사 정보가 없어요.'), {})
  const instructorFields = strList('instructor.fields', i.fields)
  instructorFields.forEach((f, k) => field(`instructor.fields[${k}]`, f))
  if (instructorFields.length === 0) warn('instructor.fields', '강사 분야가 비어 있어요. 기관 화면의 공급 요약에 이 강사가 잡히지 않습니다.')
  const instructor = {
    name: text('instructor.name', i.name, { required: true, max: 40 }),
    region_code: region('instructor.region_code', i.region_code),
    fields: [...new Set(instructorFields)],
    bio: text('instructor.bio', i.bio, { max: 500 }),
  }

  // ── 프로그램 (학생 추천 후보. 실제로 운영하는 과정만 넣는다)
  let rawPrograms = []
  if (Array.isArray(raw.programs)) rawPrograms = raw.programs
  else if (raw.programs !== undefined) err('programs', '배열이어야 해요.')
  if (rawPrograms.length === 0) {
    warn('programs', '프로그램이 0개예요. 학생 결과 화면은 수업 추천 대신 진로 카드 3장이 나갑니다 (ADR-027).')
  }
  const programs = rawPrograms.map((p, k) => {
    const path = `programs[${k}]`
    if (!isObj(p)) {
      err(path, '객체여야 해요.')
      return null
    }
    const grades = strList(`${path}.target_grades`, p.target_grades)
    if (grades.length === 0) err(`${path}.target_grades`, '대상 학년대를 하나 이상 적어 주세요.')
    grades.forEach((g, n) => oneOf(`${path}.target_grades[${n}]`, g, enums.grade_band ?? [], '학년대'))
    const summary = text(`${path}.summary`, p.summary, { max: 300 })
    if (summary === '') warn(`${path}.summary`, 'AI 추천 이유가 이 소개를 근거로 씁니다. 한 줄이라도 적어 주세요.')
    const outline = strList(`${path}.outline`, p.outline)
    if (outline.length === 0) warn(`${path}.outline`, '차시 구성이 비어 있어요. AI 가 학생 답과 연결할 근거가 줄어듭니다.')
    return {
      title: text(`${path}.title`, p.title, { required: true, max: 120 }),
      field: field(`${path}.field`, p.field),
      target_grades: [...new Set(grades)],
      format: oneOf(`${path}.format`, p.format, enums.program_format ?? [], '형태'),
      session_count: int(`${path}.session_count`, p.session_count, 'session_count'),
      summary,
      outline,
    }
  })
  const titles = programs.filter(Boolean).map((p) => p.title)
  const dup = titles.filter((t, k) => titles.indexOf(t) !== k)
  if (dup.length > 0) err('programs', `제목이 겹쳐요: ${[...new Set(dup)].join(', ')}`)

  // ── 회차
  const s = isObj(raw.session) ? raw.session : (err('session', '회차 정보가 없어요.'), {})
  const heldOn = str(s.held_on)
  const heldOk = /^\d{4}-\d{2}-\d{2}$/.test(heldOn) && !Number.isNaN(new Date(`${heldOn}T00:00:00+09:00`).getTime())
  if (!heldOk) err('session.held_on', `날짜는 YYYY-MM-DD 로 써 주세요 (지금 "${heldOn}").`)
  let closesAt = str(s.closes_at)
  if (closesAt === '' && heldOk) closesAt = defaultClosesAt(heldOn)
  const closesTime = new Date(closesAt).getTime()
  if (closesAt !== '' && Number.isNaN(closesTime)) {
    err('session.closes_at', `시각 형식이 올바르지 않아요 (예: ${defaultClosesAt('2026-09-19')}).`)
  } else if (heldOk) {
    if (closesTime <= now.getTime()) {
      err('session.closes_at', `마감 시각(${closesAt})이 이미 지났어요. 학생에게 "응답 기간이 끝났어요" 화면이 나옵니다.`)
    }
    if (closesTime < new Date(`${heldOn}T00:00:00+09:00`).getTime()) {
      err('session.closes_at', '마감 시각이 수업 날짜보다 앞서요.')
    }
  }
  const session = {
    title: text('session.title', s.title, { required: true, max: 120 }),
    field: field('session.field', s.field),
    held_on: heldOn,
    closes_at: closesAt,
    grade_band: oneOf('session.grade_band', s.grade_band, enums.grade_band ?? [], '학년대'),
    expected_students: int('session.expected_students', s.expected_students, 'expected_students'),
    duration_minutes: int('session.duration_minutes', s.duration_minutes, 'duration_minutes', 50),
    venue: s.venue === undefined || s.venue === null || s.venue === '' ? '교실' : oneOf('session.venue', s.venue, venueList, '장소'),
  }

  // ── 교차 확인 — 추천이 비는 조합을 미리 알린다
  const valid = programs.filter(Boolean)
  if (valid.length > 0 && session.grade_band !== '') {
    if (!valid.some((p) => p.target_grades.includes(session.grade_band))) {
      warn('programs', `회차 학년대(${session.grade_band})를 대상으로 하는 프로그램이 없어요. 학생 추천이 비어 버립니다.`)
    }
    if (session.field !== '' && !valid.some((p) => p.field === session.field)) {
      warn('programs', `회차 분야(${session.field})와 같은 분야의 프로그램이 없어요. 관심 분야를 "잘 모르겠어요"로 고른 학생에게는 추천이 비어요.`)
    }
  }
  if (org.region_code !== '' && instructor.region_code !== '' && org.region_code !== instructor.region_code) {
    const near = regions.find((r) => r.code === org.region_code)?.neighbors?.includes(instructor.region_code)
    warn(
      'instructor.region_code',
      near
        ? '강사 지역이 기관 지역과 달라 추천 카드에 "바로 옆 지역"으로 표시돼요.'
        : '강사 지역이 기관 지역과 인접하지 않아 추천이 "조금 떨어진 지역"으로 나오거나 비어 버릴 수 있어요.',
    )
  }

  // ── 기관 담당자 로그인 계정 (선택)
  let orgMember = null
  if (raw.orgMember !== undefined && raw.orgMember !== null) {
    const m = isObj(raw.orgMember) ? raw.orgMember : (err('orgMember', '객체여야 해요.'), {})
    const email = str(m.email).toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) err('orgMember.email', `이메일 형식이 아니에요 ("${email}").`)
    orgMember = { email, display_name: text('orgMember.display_name', m.display_name, { required: true, max: 40 }) }
  }

  return {
    errors,
    warnings,
    value: errors.length > 0 ? null : { org, instructor, programs: valid, session, orgMember },
  }
}
