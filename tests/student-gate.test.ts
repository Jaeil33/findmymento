// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * 학생 입장 게이트 (`lib/db/student-gate.ts`).
 *
 * 실 DB 에서 anon 은 lecture_sessions · students · survey_responses 를 읽을 수 없다 (RLS 설계).
 * 그래서 학생이 가진 코드의 확인은 **서버에서 service_role 로, 정확히 일치하는 한 건만** 한다.
 *
 * 여기서 반드시 지켜지는 것:
 * - 코드 형식(6자리 숫자)을 먼저 확인하고, 형식이 틀리면 DB 에 아무것도 묻지 않는다
 * - 모든 조회가 `eq` 필터를 가진 정확 일치다 — 목록을 긁는 조회가 없다
 * - service_role 키가 없으면 **닫힌 쪽으로** 실패한다 (null / false)
 * - 데모 모드에서는 기존 Dataset 동작 그대로다
 */

type Query = {
  table: string
  columns?: string
  options?: { count?: string; head?: boolean }
  filters: [string, unknown][]
}

type Reply = { data?: unknown; count?: number | null; error?: unknown }

const state = vi.hoisted(() => ({
  service: null as unknown,
}))

vi.mock('@/lib/supabase/server', () => ({
  getServiceSupabase: () => state.service,
  getServerSupabase: async () => null,
}))

const gate = await import('@/lib/db/student-gate')

/** 호출을 기록하는 가짜 service_role 클라이언트. `respond` 가 테이블·필터를 보고 결과를 정한다. */
function fakeService(respond: (q: Query) => Reply) {
  const queries: Query[] = []
  const client = {
    from(table: string) {
      const q: Query = { table, filters: [] }
      queries.push(q)
      const settle = () => Promise.resolve({ data: null, count: null, error: null, ...respond(q) })
      const builder = {
        select(columns: string, options?: Query['options']) {
          q.columns = columns
          q.options = options
          return builder
        },
        eq(col: string, val: unknown) {
          q.filters.push([col, val])
          return builder
        },
        maybeSingle: () => settle(),
        then: (ok: (v: unknown) => unknown, fail?: (e: unknown) => unknown) => settle().then(ok, fail),
      }
      return builder
    },
  }
  return { client, queries }
}

const FUTURE = new Date(Date.now() + 3 * 86_400_000).toISOString()
const PAST = new Date(Date.now() - 3 * 86_400_000).toISOString()

const SESSION_ROW = {
  id: 'a1b2c3d4-0000-4000-8000-000000000001',
  org_id: 'a1b2c3d4-0000-4000-8000-0000000000aa',
  instructor_id: 'a1b2c3d4-0000-4000-8000-0000000000bb',
  title: '3D 프린터로 내 물건 만들기',
  field: '3D 모델링·프린팅',
  held_on: '2026-09-19',
  closes_at: FUTURE,
  status: 'open',
  entry_code: '123456',
  grade_band: 'middle',
  expected_students: 15,
  duration_minutes: 90,
  venue: '교실',
  class_traits: null,
  equipment: null,
  created_at: '2026-09-18T00:00:00Z',
}

function liveReplies(overrides: Partial<Record<string, Reply>> = {}) {
  return (q: Query): Reply => {
    if (overrides[q.table]) return overrides[q.table]!
    switch (q.table) {
      case 'lecture_sessions':
        return { data: SESSION_ROW }
      case 'organizations':
        return { data: { name: '파일럿 기관', type: 'school', region_code: '41210' } }
      case 'instructors':
        return { data: { name: '김강사' } }
      case 'students':
        return { count: 0 }
      default:
        return {}
    }
  }
}

const ORIGINAL = { ...process.env }

function goLive() {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon'
}

beforeEach(() => {
  delete process.env.NEXT_PUBLIC_SUPABASE_URL
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  state.service = null
})

afterEach(() => {
  process.env = { ...ORIGINAL }
  vi.restoreAllMocks()
})

describe('데모 모드 — 기존 Dataset 동작 그대로', () => {
  it('열린 회차 코드로 회차·기관·강사·지역을 돌려준다', async () => {
    const ctx = await gate.loadEntryContext('735104')
    expect(ctx).not.toBeNull()
    expect(ctx!.session.id).toBe('ls-2')
    expect(ctx!.closed).toBe(false)
    expect(ctx!.orgName).toBe('광명시청소년수련관')
    expect(ctx!.orgRegionCode).toBe('41210')
    expect(ctx!.instructorName).not.toBeNull()
  })

  it('가명코드를 발급한 기관이면 pseudoCodesIssued 가 true 다', async () => {
    const ctx = await gate.loadEntryContext('735104')
    expect(ctx!.pseudoCodesIssued).toBe(true)
  })

  it('마감된 회차는 closed, 없는 코드는 null', async () => {
    expect((await gate.loadEntryContext('482913'))!.closed).toBe(true)
    expect(await gate.loadEntryContext('000000')).toBeNull()
  })

  it('가명코드·응답 여부·누적 분야를 Dataset 에서 찾는다', async () => {
    const student = await gate.findStudentByPseudoCode('org-1', '311009')
    expect(student).not.toBeNull()
    expect(await gate.hasResponded('ls-2', student!.id)).toBe(false)
    expect(await gate.studentFieldHistory(student!.id)).toContain('드론')
  })
})

describe('실 DB — service_role 로 정확히 일치하는 한 건만', () => {
  it('입장 코드로 회차를 찾고, 기관·강사 이름·지역·가명코드 발급 여부를 채운다', async () => {
    goLive()
    const { client, queries } = fakeService(liveReplies())
    state.service = client

    const ctx = await gate.loadEntryContext('123456')

    expect(ctx).not.toBeNull()
    expect(ctx!.session.id).toBe(SESSION_ROW.id)
    expect(ctx!.session.entry_code).toBe('123456')
    expect(ctx!.session.class_traits).toEqual([])
    expect(ctx!.session.equipment).toEqual([])
    expect(ctx!.orgName).toBe('파일럿 기관')
    expect(ctx!.orgRegionCode).toBe('41210')
    expect(ctx!.instructorName).toBe('김강사')
    expect(ctx!.closed).toBe(false)
    expect(ctx!.pseudoCodesIssued).toBe(false)

    const sessionQuery = queries.find((q) => q.table === 'lecture_sessions')!
    expect(sessionQuery.filters).toEqual([['entry_code', '123456']])
  })

  it('모든 조회가 eq 필터를 가진다 — 목록을 긁는 조회가 없다', async () => {
    goLive()
    const { client, queries } = fakeService(liveReplies())
    state.service = client

    await gate.loadEntryContext('123456')

    expect(queries.length).toBeGreaterThan(0)
    for (const q of queries) expect(q.filters.length, q.table).toBeGreaterThan(0)
  })

  it('가명코드 발급 여부는 행을 읽지 않고 개수만 센다', async () => {
    goLive()
    const { client, queries } = fakeService(liveReplies({ students: { count: 3 } }))
    state.service = client

    const ctx = await gate.loadEntryContext('123456')

    expect(ctx!.pseudoCodesIssued).toBe(true)
    const count = queries.find((q) => q.table === 'students')!
    expect(count.options).toMatchObject({ head: true })
    expect(count.filters).toEqual([['org_id', SESSION_ROW.org_id]])
  })

  it('개수를 못 세면 코드 입력을 보여주는 쪽(기존 흐름)으로 둔다', async () => {
    goLive()
    const { client } = fakeService(liveReplies({ students: { error: { message: 'x' } } }))
    state.service = client

    expect((await gate.loadEntryContext('123456'))!.pseudoCodesIssued).toBe(true)
  })

  it.each(['12345', '1234567', 'abcdef', "123456' or '1'='1", '', ' 12 34 '])(
    '형식이 틀린 코드(%j)는 DB 에 묻지 않고 null',
    async (code) => {
      goLive()
      const { client, queries } = fakeService(liveReplies())
      state.service = client

      expect(await gate.loadEntryContext(code)).toBeNull()
      expect(queries).toHaveLength(0)
    },
  )

  it('앞뒤 공백은 정리한다', async () => {
    goLive()
    const { client } = fakeService(liveReplies())
    state.service = client

    expect(await gate.loadEntryContext(' 123456 ')).not.toBeNull()
  })

  it('service_role 키가 없으면 닫힌 쪽으로 실패하고 설정 경고를 남긴다', async () => {
    goLive()
    state.service = null
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(await gate.loadEntryContext('123456')).toBeNull()
    expect(await gate.findStudentByPseudoCode('org', '481000')).toBeNull()
    expect(error).toHaveBeenCalled()
    expect(String(error.mock.calls[0]?.[0])).toContain('SUPABASE_SERVICE_ROLE_KEY')
  })

  it('없는 코드면 null', async () => {
    goLive()
    const { client } = fakeService(liveReplies({ lecture_sessions: { data: null } }))
    state.service = client

    expect(await gate.loadEntryContext('123456')).toBeNull()
  })

  it('조회 에러면 null — 학생에게는 "코드를 다시 확인" 안내가 나간다', async () => {
    goLive()
    const { client } = fakeService(liveReplies({ lecture_sessions: { error: { message: 'boom' } } }))
    state.service = client

    expect(await gate.loadEntryContext('123456')).toBeNull()
  })

  it('status 가 closed 이거나 마감 시각이 지났으면 closed', async () => {
    goLive()
    state.service = fakeService(
      liveReplies({ lecture_sessions: { data: { ...SESSION_ROW, status: 'closed' } } }),
    ).client
    expect((await gate.loadEntryContext('123456'))!.closed).toBe(true)

    state.service = fakeService(
      liveReplies({ lecture_sessions: { data: { ...SESSION_ROW, closes_at: PAST } } }),
    ).client
    expect((await gate.loadEntryContext('123456'))!.closed).toBe(true)
  })

  it('배정 강사가 없으면 강사 이름을 묻지 않는다', async () => {
    goLive()
    const { client, queries } = fakeService(
      liveReplies({ lecture_sessions: { data: { ...SESSION_ROW, instructor_id: null } } }),
    )
    state.service = client

    const ctx = await gate.loadEntryContext('123456')
    expect(ctx!.instructorName).toBeNull()
    expect(queries.some((q) => q.table === 'instructors')).toBe(false)
  })

  it('가명코드는 기관 + 코드 정확 일치로만 찾는다', async () => {
    goLive()
    const { client, queries } = fakeService(() => ({
      data: { id: 'st-1', grade_band: 'middle', grade_year: 2 },
    }))
    state.service = client

    const student = await gate.findStudentByPseudoCode('org-uuid', '481000')

    expect(student).toEqual({ id: 'st-1', grade: { band: 'middle', year: 2 } })
    expect(queries).toHaveLength(1)
    expect(queries[0]!.table).toBe('students')
    expect(queries[0]!.filters).toEqual([
      ['org_id', 'org-uuid'],
      ['pseudo_code', '481000'],
    ])
  })

  it('형식이 틀린 가명코드는 DB 에 묻지 않는다', async () => {
    goLive()
    const { client, queries } = fakeService(() => ({ data: { id: 'x' } }))
    state.service = client

    expect(await gate.findStudentByPseudoCode('org-uuid', '48100')).toBeNull()
    expect(queries).toHaveLength(0)
  })

  it('중복 응답 확인은 회차 + 학생 정확 일치로 개수만 센다', async () => {
    goLive()
    const { client, queries } = fakeService(() => ({ count: 1 }))
    state.service = client

    expect(await gate.hasResponded('ses-1', 'st-1')).toBe(true)
    expect(queries[0]!.table).toBe('survey_responses')
    expect(queries[0]!.options).toMatchObject({ head: true })
    expect(queries[0]!.filters).toEqual([
      ['session_id', 'ses-1'],
      ['student_id', 'st-1'],
    ])

    state.service = fakeService(() => ({ count: 0 })).client
    expect(await gate.hasResponded('ses-1', 'st-1')).toBe(false)
  })

  it('누적 관심 분야는 그 학생의 응답에서 분야만 모아 중복 없이 돌려준다', async () => {
    goLive()
    const { client, queries } = fakeService(() => ({
      data: [{ interest_fields: ['드론', '3D 모델링·프린팅'] }, { interest_fields: ['드론'] }],
    }))
    state.service = client

    expect(await gate.studentFieldHistory('st-1')).toEqual(['드론', '3D 모델링·프린팅'])
    expect(queries[0]!.columns).toBe('interest_fields')
    expect(queries[0]!.filters).toEqual([['student_id', 'st-1']])
  })
})
