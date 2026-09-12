import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import adjacency from '@/data/region-adjacency.json'

/**
 * 배포용 SQL 2종 정적 검증.
 *
 * - `supabase/bootstrap.sql` — 첫 운영자 계정 연결 + 파일럿 기관 1개. **실 운영 경로.**
 * - `supabase/seed.sql` — 검수·RLS 네거티브 테스트용 픽스처. **선택.**
 *
 * 마이그레이션(`rls-policies.test.ts`)이 스키마의 안전 설계를 고정한다면, 이 파일은
 * **그 스키마에 넣는 데이터**가 규칙을 넘지 않는지 고정한다. 파일럿 준비 중에 급하게
 * "테스트용으로 학생 이름만 잠깐" 같은 일이 벌어지는 지점이 정확히 여기다.
 */

const SUPABASE = join(process.cwd(), 'supabase')
const read = (f: string) => readFileSync(join(SUPABASE, f), 'utf8')

const bootstrap = read('bootstrap.sql')
const seed = read('seed.sql')
const both = [
  ['bootstrap.sql', bootstrap],
  ['seed.sql', seed],
] as const

const REGION_CODES = new Set((adjacency.regions as { code: string }[]).map((r) => r.code))

describe('파일 존재', () => {
  it('bootstrap.sql 과 seed.sql 이 supabase/ 에 있다', () => {
    expect(existsSync(join(SUPABASE, 'bootstrap.sql'))).toBe(true)
    expect(existsSync(join(SUPABASE, 'seed.sql'))).toBe(true)
  })
})

describe('학생 PII 금지 (ADR-003)', () => {
  it('students 에 이름·연락처·학교·생년월일 컬럼을 넣지 않는다', () => {
    for (const [name, sql] of both) {
      const inserts = sql.match(/insert\s+into\s+public\.students[\s\S]*?;/gi) ?? []
      for (const stmt of inserts) {
        for (const banned of ['name', 'phone', 'contact', 'school', 'birth']) {
          expect(stmt.toLowerCase(), `${name}: students INSERT`).not.toContain(banned)
        }
      }
    }
  })

  it('보호자 문의 픽스처에 아이 이름·학교 컬럼이 없다 (ADR-014)', () => {
    const inserts = seed.match(/insert\s+into\s+public\.inquiries[\s\S]*?;/gi) ?? []
    for (const stmt of inserts) {
      const lower = stmt.toLowerCase()
      expect(lower).not.toContain('student_name')
      expect(lower).not.toContain('child_name')
      expect(lower).not.toContain('school')
      expect(lower).not.toContain('birth')
    }
  })
})

describe('계정 생성 경로 (ADR-011)', () => {
  it('auth.users 에 직접 INSERT 하지 않는다 — 계정은 Supabase Auth 가 만든다', () => {
    for (const [name, sql] of both) {
      expect(sql.toLowerCase(), name).not.toMatch(/insert\s+into\s+auth\.users/)
    }
  })

  it('비밀번호 해시를 SQL 에 적지 않는다', () => {
    for (const [name, sql] of both) {
      const lower = sql.toLowerCase()
      expect(lower, name).not.toContain('encrypted_password')
      expect(lower, name).not.toContain('crypt(')
    }
  })

  it('bootstrap 은 auth.users 를 이메일로 찾아 admins 에 연결한다', () => {
    expect(bootstrap).toMatch(/from\s+auth\.users/i)
    expect(bootstrap).toMatch(/insert\s+into\s+public\.admins/i)
  })

  it('bootstrap 은 이메일이 편집되지 않으면 실패한다 (더미 계정으로 운영자가 생기지 않게)', () => {
    expect(bootstrap).toMatch(/raise\s+exception/i)
    expect(bootstrap).toContain('CHANGE_ME')
  })

  it('초대 토큰 픽스처는 만료시각을 갖는다 (E-12)', () => {
    const inserts = seed.match(/insert\s+into\s+public\.invitations[\s\S]*?;/gi) ?? []
    expect(inserts.length).toBeGreaterThan(0)
    for (const stmt of inserts) expect(stmt.toLowerCase()).toContain('expires_at')
  })
})

describe('다시 실행해도 안전하다', () => {
  it('모든 INSERT 가 on conflict 로 멱등이다', () => {
    for (const [name, sql] of both) {
      const inserts = sql.match(/insert\s+into\s+[\s\S]*?;/gi) ?? []
      expect(inserts.length, name).toBeGreaterThan(0)
      for (const stmt of inserts) {
        expect(stmt.toLowerCase(), `${name}: ${stmt.slice(0, 60)}`).toContain('on conflict')
      }
    }
  })

  it('DROP / TRUNCATE 로 기존 데이터를 날리지 않는다', () => {
    for (const [name, sql] of both) {
      const lower = sql.toLowerCase()
      expect(lower, name).not.toMatch(/\bdrop\s+table\b/)
      expect(lower, name).not.toMatch(/\btruncate\b/)
      expect(lower, name).not.toMatch(/\bdelete\s+from\b/)
    }
  })
})

describe('픽스처 정합성', () => {
  it('region_code 가 region-adjacency.json 에 있는 코드다', () => {
    for (const [name, sql] of both) {
      const codes = [...sql.matchAll(/region_code[^;]*?'(\d{5})'/gi)].map((m) => m[1]!)
      const literal = [...sql.matchAll(/'(\d{5})'/g)].map((m) => m[1]!)
      for (const code of new Set([...codes, ...literal])) {
        expect(REGION_CODES.has(code), `${name}: ${code}`).toBe(true)
      }
    }
  })

  it('seed 는 RLS 네거티브 테스트가 요구하는 환경변수 값을 출력한다', () => {
    for (const key of [
      'RLS_TEST_ORG_B_ORG_ID',
      'RLS_TEST_UNASSIGNED_SESSION_ID',
      'RLS_TEST_CLOSED_SESSION_ID',
      'RLS_TEST_PENDING_INSTRUCTOR_ID',
      'RLS_TEST_EXPIRED_INVITE_TOKEN',
      'RLS_TEST_OTHER_INSTRUCTOR_ID',
    ]) {
      expect(seed).toContain(key)
    }
  })

  it('seed 에 미승인 강사 · 마감 회차 · 미배정 회차가 들어 있다 (네거티브 테스트 대상)', () => {
    expect(seed).toMatch(/'pending'/)
    expect(seed).toMatch(/'closed'/)
  })

  it('강사 연락처는 instructor_contacts 에만 넣는다 (CLAUDE.md CRITICAL)', () => {
    const instructorInserts = seed.match(/insert\s+into\s+public\.instructors[\s\S]*?;/gi) ?? []
    for (const stmt of instructorInserts) {
      const lower = stmt.toLowerCase()
      expect(lower).not.toContain('phone')
      expect(lower).not.toMatch(/\bemail\b/)
      expect(lower).not.toContain('photo')
    }
    expect(seed).toMatch(/insert\s+into\s+public\.instructor_contacts/i)
  })
})
