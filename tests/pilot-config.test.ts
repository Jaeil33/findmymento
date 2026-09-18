import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { FIELDS, FIELD_UNSURE } from '@/types/domain'
import {
  isLocalSite,
  keyProblems,
  keyRole,
  normalizeSite,
  parseEnvFile,
  parseFieldUnsure,
  parseFields,
  parseSqlEnums,
  parseSqlRanges,
  parseVenues,
  placeholderHits,
  validateConfig,
  type Catalog,
} from '../scripts/pilot/config-lib.mjs'

/**
 * 파일럿 설정 검증(scripts/pilot/setup.mjs). 여기서 막는 실수는 전부 교실에 가서야 드러난다 —
 * 없는 시군구 코드(추천이 빔), 설문 선택지에 없는 분야, 지난 마감 시각, 예시 값, 브라우저로 새는 서비스 키.
 */

const root = process.cwd()
const sql = readdirSync(join(root, 'supabase', 'migrations'))
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync(join(root, 'supabase', 'migrations', f), 'utf8'))
  .join('\n')
const domain = readFileSync(join(root, 'src', 'types', 'domain.ts'), 'utf8')
const regions = (JSON.parse(readFileSync(join(root, 'src', 'data', 'region-adjacency.json'), 'utf8')) as {
  regions: Catalog['regions']
}).regions

const catalog: Catalog = {
  enums: parseSqlEnums(sql),
  ranges: parseSqlRanges(sql),
  venues: parseVenues(sql),
  fields: parseFields(domain),
  fieldUnsure: parseFieldUnsure(domain),
  regions,
}

const NOW = new Date('2026-09-18T15:00:00Z') // 2026-09-19 00:00 KST

const valid = () => ({
  org: { name: '광명하안중학교', type: 'school', region_code: '41210' },
  instructor: { name: '김지은', region_code: '41210', fields: ['3D 모델링·프린팅'], bio: '3D 프린팅 강사' },
  programs: [
    {
      title: '3D 프린팅 심화 4회',
      field: '3D 모델링·프린팅',
      target_grades: ['middle'],
      format: 'short_course',
      session_count: 4,
      summary: '내 물건을 설계해 출력까지',
      outline: ['기초', '설계', '출력', '발표'],
    },
  ],
  session: {
    title: '3D 프린터 진로체험',
    field: '3D 모델링·프린팅',
    held_on: '2026-09-19',
    closes_at: null,
    grade_band: 'middle',
    expected_students: 15,
    venue: '교실',
  },
})

describe('스키마 허용값은 마이그레이션·도메인 타입에서 직접 읽는다', () => {
  it('열거형', () => {
    expect(catalog.enums.org_type).toEqual(['school', 'youth_center', 'edu_company', 'local_gov'])
    expect(catalog.enums.grade_band).toEqual(['elementary', 'middle', 'high'])
    expect(catalog.enums.program_format).toEqual(['short_course', 'one_off', 'club'])
  })

  it('범위 제약과 장소 목록', () => {
    expect(catalog.ranges.session_count).toEqual({ min: 1, max: 60 })
    expect(catalog.ranges.expected_students).toEqual({ min: 1, max: 500 })
    expect(catalog.ranges.duration_minutes).toEqual({ min: 20, max: 300 })
    expect(catalog.venues).toContain('교실')
    expect(catalog.venues).toContain('메이커실')
  })

  it('관심 분야는 설문 Q4 선택지(FIELDS)와 같다', () => {
    expect(catalog.fields).toEqual([...FIELDS])
    expect(catalog.fieldUnsure).toBe(FIELD_UNSURE)
  })
})

describe('validateConfig', () => {
  it('올바른 설정은 통과하고, 마감 시각·장소·시수 기본값을 채운다', () => {
    const cfg = valid()
    const { errors, value } = validateConfig({ ...cfg, session: { ...cfg.session, venue: undefined } }, catalog, { now: NOW })
    expect(errors).toEqual([])
    expect(value?.session.closes_at).toBe('2026-09-19T23:59:00+09:00')
    expect(value?.session.venue).toBe('교실')
    expect(value?.session.duration_minutes).toBe(50)
    expect(value?.instructor.fields).toEqual(['3D 모델링·프린팅'])
    expect(value?.orgMember).toBeNull()
  })

  it('허용되지 않는 열거형 값은 오류', () => {
    const cfg = valid()
    const { errors } = validateConfig({ ...cfg, org: { ...cfg.org, type: 'academy' } }, catalog, { now: NOW })
    expect(errors.some((e) => e.startsWith('org.type'))).toBe(true)
  })

  it('시군구 이름을 적으면 코드를 알려준다', () => {
    const cfg = valid()
    const { errors } = validateConfig({ ...cfg, org: { ...cfg.org, region_code: '광명' } }, catalog, { now: NOW })
    expect(errors.join('\n')).toContain('경기 광명시 = 41210')
  })

  it('설문 선택지에 없는 분야는 오류 — 옵션을 주면 경고로만', () => {
    const cfg = valid()
    const custom = { ...cfg, session: { ...cfg.session, field: '요리' } }
    expect(validateConfig(custom, catalog, { now: NOW }).errors.some((e) => e.startsWith('session.field'))).toBe(true)
    const relaxed = validateConfig(custom, catalog, { now: NOW, allowCustomField: true })
    expect(relaxed.errors).toEqual([])
    expect(relaxed.warnings.some((w) => w.startsWith('session.field'))).toBe(true)
  })

  it('이미 지난 마감 시각은 오류 — 학생에게 마감 화면이 나온다', () => {
    const cfg = valid()
    const { errors } = validateConfig({ ...cfg, session: { ...cfg.session, held_on: '2026-09-17' } }, catalog, { now: NOW })
    expect(errors.some((e) => e.startsWith('session.closes_at'))).toBe(true)
  })

  it('프로그램이 없으면 경고 — 학생 추천 카드도 AI 추천도 없다', () => {
    const { errors, warnings } = validateConfig({ ...valid(), programs: [] }, catalog, { now: NOW })
    expect(errors).toEqual([])
    expect(warnings.join('\n')).toContain('0개')
  })

  it('회차 학년대를 대상으로 하는 프로그램이 없으면 경고', () => {
    const cfg = valid()
    const { warnings } = validateConfig(
      { ...cfg, programs: [{ ...cfg.programs[0]!, target_grades: ['high'] }] },
      catalog,
      { now: NOW },
    )
    expect(warnings.join('\n')).toContain('학생 추천이 비어 버립니다')
  })

  it('중복 프로그램 제목·정수가 아닌 회차 수·잘못된 이메일은 오류', () => {
    const cfg = valid()
    const program = cfg.programs[0]!
    const { errors } = validateConfig(
      {
        ...cfg,
        programs: [program, { ...program, session_count: 2.5 }],
        orgMember: { email: 'not-an-email', display_name: '담당' },
      },
      catalog,
      { now: NOW },
    )
    expect(errors.some((e) => e.startsWith('programs:') && e.includes('겹쳐요'))).toBe(true)
    expect(errors.some((e) => e.startsWith('programs[1].session_count'))).toBe(true)
    expect(errors.some((e) => e.startsWith('orgMember.email'))).toBe(true)
  })
})

describe('placeholderHits — 예시 값이 실제 학생 화면에 나가지 않게', () => {
  it('예시 설정 파일의 값을 잡는다', () => {
    const example = JSON.parse(readFileSync(join(root, 'scripts', 'pilot', 'pilot.config.example.json'), 'utf8'))
    const hits = placeholderHits(example)
    expect(hits).toContain('org.name')
    expect(hits).toContain('orgMember.email')
    expect(hits.some((h) => h.startsWith('_'))).toBe(false)
  })

  it('실제 값만 있으면 비어 있다', () => {
    expect(placeholderHits(valid())).toEqual([])
  })
})

describe('.env 파서와 키 안전 확인 — 값은 출력하지 않는다', () => {
  it('parseEnvFile', () => {
    const env = parseEnvFile('﻿A=1\nexport B="two words" # 주석\nC=\'x#y\'\n# comment\nD=plain # trailing\r\nE=\nnot a line\n')
    expect(env).toEqual({ A: '1', B: 'two words', C: 'x#y', D: 'plain', E: '' })
  })

  const jwt = (role: string) => ['e30', btoa(JSON.stringify({ role })).replace(/=+$/, ''), 'sig'].join('.')

  it('keyRole — 새 키와 예전 JWT 키', () => {
    expect(keyRole('sb_publishable_abc')).toBe('anon')
    expect(keyRole('sb_secret_abc')).toBe('service_role')
    expect(keyRole(jwt('service_role'))).toBe('service_role')
    expect(keyRole(jwt('anon'))).toBe('anon')
    expect(keyRole('garbage')).toBe('unknown')
    expect(keyRole('')).toBe('missing')
    expect(keyRole(undefined)).toBe('missing')
  })

  it('NEXT_PUBLIC_ 에 비밀 키가 들어가면 막는다 (CLAUDE.md: service_role 번들 노출 금지)', () => {
    expect(keyProblems({ NEXT_PUBLIC_SUPABASE_ANON_KEY: 'sb_secret_x' })).toHaveLength(1)
    expect(keyProblems({ NEXT_PUBLIC_SUPABASE_ANON_KEY: jwt('service_role') })).toHaveLength(1)
    expect(keyProblems({ NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY: 'x' })).toHaveLength(1)
    expect(keyProblems({ NEXT_PUBLIC_ANTHROPIC_API_KEY: 'x' })).toHaveLength(1)
    expect(keyProblems({ NEXT_PUBLIC_SOMETHING: 'sk-ant-api03-x' })).toHaveLength(1)
    expect(keyProblems({ SUPABASE_SERVICE_ROLE_KEY: 'sb_publishable_x' })).toHaveLength(1)
    expect(
      keyProblems({
        NEXT_PUBLIC_SUPABASE_URL: 'https://x.supabase.co',
        NEXT_PUBLIC_SUPABASE_ANON_KEY: 'sb_publishable_x',
        SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_x',
        ANTHROPIC_API_KEY: 'sk-ant-x',
      }),
    ).toEqual([])
  })

  it('문제 문장에 키 값이 들어가지 않는다', () => {
    const secret = 'sb_secret_DO_NOT_PRINT'
    expect(keyProblems({ NEXT_PUBLIC_SUPABASE_ANON_KEY: secret }).join('\n')).not.toContain(secret)
  })
})

describe('사이트 주소', () => {
  it('normalizeSite 는 끝의 / 를 떼고 http(s) 만 받는다', () => {
    expect(normalizeSite('https://findmymento-pilot.vercel.app/')).toBe('https://findmymento-pilot.vercel.app')
    expect(normalizeSite('findmymento-pilot.vercel.app')).toBeNull()
    expect(normalizeSite('')).toBeNull()
  })

  it('isLocalSite — 학생 휴대폰에서 열리지 않는 주소', () => {
    expect(isLocalSite('http://localhost:3000')).toBe(true)
    expect(isLocalSite('http://192.168.0.10:3000')).toBe(true)
    expect(isLocalSite('https://findmymento-pilot.vercel.app')).toBe(false)
  })
})
