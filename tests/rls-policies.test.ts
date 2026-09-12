import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * 마이그레이션 SQL 정적 검증.
 *
 * 실 DB 가 붙으면 `tests/rls-negative.live.test.ts` 가 실제 역할 키로 네거티브 테스트를
 * 수행한다. 이 파일은 **그 전에도 정책 회귀를 잡기 위한** 구조 검증이다 —
 * RLS 를 끄거나 `inquiries` 에 anon SELECT 를 열면 여기서 먼저 터진다.
 */

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations')

const sql = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync(join(MIGRATIONS_DIR, f), 'utf8'))
  .join('\n')

/** docs/ARCHITECTURE.md 데이터 모델 표의 19개 테이블. */
const TABLES = [
  'organizations',
  'org_members',
  'admins',
  'invitations',
  'students',
  'lecture_sessions',
  'survey_responses',
  'providers',
  'instructors',
  'instructor_contacts',
  'instructor_verifications',
  'programs',
  'interests',
  'inquiries',
  'recruitment_requests',
  'consents',
  'qna_questions',
  'qna_answers',
  'moderation_reports',
]

/** `create table public.x (...)` 본문만 떼어 온다. */
function tableBody(name: string): string {
  const start = sql.indexOf(`create table public.${name} (`)
  expect(start).toBeGreaterThan(-1)
  const open = sql.indexOf('(', start)
  let depth = 0
  for (let i = open; i < sql.length; i += 1) {
    if (sql[i] === '(') depth += 1
    if (sql[i] === ')') {
      depth -= 1
      if (depth === 0) return sql.slice(open, i + 1)
    }
  }
  throw new Error(`unterminated table body: ${name}`)
}

/**
 * 한 테이블에 걸린 정책들.
 *
 * `create policy` 로 잘라서 각 조각을 첫 `;` 까지만 본다 — 정규식 하나로 훑으면
 * 앞선 정책을 같이 집어삼켜서 "anon 정책이 있다"는 오탐이 난다.
 */
function policiesFor(table: string): string[] {
  return sql
    .split('create policy')
    .slice(1)
    .map((seg) => {
      const end = seg.indexOf(';')
      return `create policy${end === -1 ? seg : seg.slice(0, end + 1)}`
    })
    .filter((p) => new RegExp(`on public\\.${table}\\b`).test(p))
}

describe('테이블 구성', () => {
  it('19개 테이블이 정확히 정의돼 있다', () => {
    expect(TABLES).toHaveLength(19)
    for (const t of TABLES) {
      expect(sql).toContain(`create table public.${t} (`)
    }
  })

  it('19개 테이블 전부 RLS 가 켜져 있다 — 예외 없음', () => {
    const missing = TABLES.filter(
      (t) => !new RegExp(`alter table public\\.${t}\\s+enable row level security`).test(sql),
    )
    expect(missing).toEqual([])
  })

  it('1:1 비공개 메시지 테이블이 없다 (ADR-006 영구 결정)', () => {
    expect(sql).not.toMatch(/create table public\.(messages|direct_messages|chats|conversations)\b/)
  })
})

describe('students — PII 금지 (ADR-003)', () => {
  const body = tableBody('students')

  it('이름·연락처·학교명·생년월일 컬럼이 없다', () => {
    for (const forbidden of [
      'name',
      'real_name',
      'phone',
      'email',
      'school',
      'school_name',
      'birth',
      'birthday',
      'birthdate',
      'address',
      'guardian',
    ]) {
      expect(body).not.toMatch(new RegExp(`\\n\\s+${forbidden}\\s`, 'i'))
    }
  })

  it('가명코드와 학년까지만 있다', () => {
    expect(body).toContain('pseudo_code')
    expect(body).toContain('grade_band')
    expect(body).toContain('grade_year')
  })

  it('가명코드는 기관 안에서 유니크하다', () => {
    expect(body).toMatch(/unique \(org_id, pseudo_code\)/)
  })
})

describe('instructor_contacts — 분리와 anon 차단', () => {
  it('instructors 테이블에 연락처 컬럼이 없다', () => {
    const body = tableBody('instructors')
    expect(body).not.toMatch(/\n\s+phone\s/)
    expect(body).not.toMatch(/\n\s+email\s/)
    expect(body).not.toMatch(/\n\s+sns/)
    expect(body).not.toMatch(/\n\s+photo/)
  })

  it('연락처는 별도 테이블이다', () => {
    expect(tableBody('instructor_contacts')).toContain('phone')
  })

  it('anon 에게 어떤 정책도 주지 않는다 — RLS 가 전부 막는다', () => {
    for (const policy of policiesFor('instructor_contacts')) {
      expect(policy).not.toMatch(/to\s+[^;]*\banon\b/)
    }
  })
})

describe('inquiries — anon INSERT 만, SELECT 는 차단 (ADR-014)', () => {
  const policies = policiesFor('inquiries')

  it('아이 식별 컬럼이 없다', () => {
    const body = tableBody('inquiries')
    for (const forbidden of ['child_name', 'student_name', 'school', 'birth']) {
      expect(body).not.toMatch(new RegExp(forbidden, 'i'))
    }
    expect(body).toContain('grade_band')
  })

  it('anon INSERT 정책이 있다 — 없으면 개인 경로 전체가 죽는다', () => {
    const insertPolicies = policies.filter((p) => /for insert/.test(p))
    expect(insertPolicies.length).toBeGreaterThan(0)
    expect(insertPolicies.some((p) => /to\s+anon/.test(p))).toBe(true)
  })

  it('anon SELECT 정책이 **없다** — 있으면 아무나 보호자 연락처를 전부 읽는다', () => {
    const selectPolicies = policies.filter((p) => /for select/.test(p))
    for (const p of selectPolicies) {
      expect(p).not.toMatch(/to\s+[^;]*\banon\b/)
    }
  })

  it('INSERT 와 SELECT 정책이 각각 따로 쓰여 있다 — for all 로 뭉개지 않는다', () => {
    expect(policies.some((p) => /for insert/.test(p))).toBe(true)
    expect(policies.some((p) => /for select/.test(p))).toBe(true)
    const selectAll = policies.filter((p) => /for all/.test(p) && /to\s+[^;]*anon/.test(p))
    expect(selectAll).toEqual([])
  })
})

describe('lecture_sessions — 회차 생성은 기관만 (ADR-015)', () => {
  const policies = policiesFor('lecture_sessions')

  it('배정 컬럼이 nullable 로 있다', () => {
    expect(tableBody('lecture_sessions')).toMatch(
      /instructor_id uuid references public\.instructors/,
    )
  })

  it('응답 마감이 NOT NULL 이다 (E-17)', () => {
    expect(tableBody('lecture_sessions')).toMatch(/closes_at timestamptz not null/)
  })

  it('INSERT 정책이 current_org_id 로만 열린다 — 강사 경로가 없다', () => {
    const inserts = policies.filter((p) => /for insert/.test(p))
    expect(inserts.length).toBeGreaterThan(0)
    for (const p of inserts) {
      expect(p).toContain('app.current_org_id()')
      expect(p).not.toContain('app.current_instructor_id()')
    }
  })

  it('강사는 SELECT 에서만 등장한다', () => {
    for (const p of policies) {
      if (p.includes('app.current_instructor_id()')) {
        expect(p).toMatch(/for select/)
      }
    }
  })
})

describe('survey_responses', () => {
  it('만족도와 후속 의향이 별개 컬럼이다', () => {
    const body = tableBody('survey_responses')
    expect(body).toMatch(/satisfaction int not null check \(satisfaction between 1 and 5\)/)
    expect(body).toMatch(/followup_intent int not null check \(followup_intent between 1 and 4\)/)
  })

  it('student_id 는 nullable 이고 (session_id, student_id) 가 유니크다', () => {
    const body = tableBody('survey_responses')
    expect(body).toMatch(/student_id uuid references public\.students/)
    expect(body).not.toMatch(/student_id uuid not null/)
    expect(body).toMatch(/unique \(session_id, student_id\)/)
  })

  it('INSERT 는 열린 회차에만 허용된다 (E-17)', () => {
    const inserts = policiesFor('survey_responses').filter((p) => /for insert/.test(p))
    expect(inserts.length).toBeGreaterThan(0)
    for (const p of inserts) expect(p).toContain('app.session_accepts_responses')
  })

  it('원본 SELECT 정책에 강사 경로가 없다', () => {
    const selects = policiesFor('survey_responses').filter((p) => /for select/.test(p))
    for (const p of selects) expect(p).not.toContain('app.current_instructor_id()')
  })

  it('강사용 집계 뷰에 student_id 가 없고 anon 권한이 없다', () => {
    const viewStart = sql.indexOf('create view public.instructor_session_responses')
    expect(viewStart).toBeGreaterThan(-1)
    const view = sql.slice(viewStart, sql.indexOf(';', viewStart))
    expect(view).not.toMatch(/r\.student_id\s*,/)
    expect(view).toContain('app.current_instructor_id()')
    expect(sql).toContain('revoke all on public.instructor_session_responses from anon')
  })
})

describe('invitations — 1회용 · 만료 필수 (ADR-011 · E-12)', () => {
  it('token 유니크 · expires_at NOT NULL · accepted_at nullable', () => {
    const body = tableBody('invitations')
    expect(body).toMatch(/token text not null unique/)
    expect(body).toMatch(/expires_at timestamptz not null/)
    expect(body).toMatch(/accepted_at timestamptz,/)
  })

  it('anon 이 초대를 읽을 수 없다 — 토큰 목록이 새면 아무나 기관 담당자가 된다', () => {
    for (const p of policiesFor('invitations')) {
      expect(p).not.toMatch(/to\s+[^;]*\banon\b/)
    }
  })
})

describe('역할 판별 함수', () => {
  it('세 함수가 정의돼 있다', () => {
    expect(sql).toContain('create or replace function app.current_org_id()')
    expect(sql).toContain('create or replace function app.current_instructor_id()')
    expect(sql).toContain('create or replace function app.is_admin()')
  })

  it('auth.uid() 를 테이블과 대조한다 — JWT 커스텀 클레임을 읽지 않는다', () => {
    expect(sql).toContain('m.auth_user_id = auth.uid()')
    expect(sql).toContain('i.auth_user_id = auth.uid()')
    expect(sql).toContain('a.auth_user_id = auth.uid()')
    expect(sql).not.toMatch(/request\.jwt\.claims?[^;]*role/)
  })

  it('비활성 담당자는 current_org_id 에서 빠진다 (E-13)', () => {
    const fn = sql.slice(
      sql.indexOf('create or replace function app.current_org_id()'),
      sql.indexOf('create or replace function app.current_instructor_id()'),
    )
    expect(fn).toContain('m.active')
  })

  it('organizations.type 으로 권한을 분기하지 않는다 (ADR-013)', () => {
    const policyBlocks = sql.match(/create policy[\s\S]*?;/g) ?? []
    for (const p of policyBlocks) {
      expect(p).not.toMatch(/\btype\s*=\s*'(school|youth_center|edu_company|local_gov)'/)
    }
  })
})

describe('consents · interests', () => {
  it('anon 은 동의 기록을 읽을 수 없다', () => {
    for (const p of policiesFor('consents')) {
      expect(p).not.toMatch(/to\s+[^;]*\banon\b/)
    }
  })

  it('관심 표현 SELECT 에 강사 경로가 없다 — 학생 버튼이 강사에게 직접 닿지 않는다', () => {
    const selects = policiesFor('interests').filter((p) => /for select/.test(p))
    for (const p of selects) expect(p).not.toContain('app.current_instructor_id()')
  })
})
