// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

/**
 * 학생 경로 — **실 DB 로** 확인한다 (파일럿 전 필수).
 *
 * 정적 검증(rls-policies.test.ts)과 모의 테스트는 SQL 과 호출 모양만 본다. 이 파일은 실제 Supabase 에서
 * 비로그인 학생이 설문을 내고 추천 후보를 읽을 수 있는지, 그리고 읽으면 안 되는 것은 못 읽는지를 본다.
 *
 * 실행 조건 — 기본은 **건너뛴다**:
 *   LIVE_STUDENT_PATH_TEST=1
 *   NEXT_PUBLIC_SUPABASE_URL · NEXT_PUBLIC_SUPABASE_ANON_KEY · SUPABASE_SERVICE_ROLE_KEY
 * 값은 셸 환경변수 또는 `.env.local` 에서 읽는다.
 *
 *   LIVE_STUDENT_PATH_TEST=1 npx vitest run tests/student-path.live.test.ts
 *
 * 이 테스트가 만드는 행은 전부 이름이 `__live_test__` 로 시작하고, 끝나면 **자기가 만든 것만** 지운다.
 * 실제 파일럿 회차·응답은 건드리지 않는다.
 */

function loadEnvLocal() {
  const file = join(process.cwd(), '.env.local')
  if (!existsSync(file)) return
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (!m) continue
    const [, key, raw] = m
    const value = raw!.replace(/^(['"])(.*)\1$/, '$2')
    if (process.env[key!] === undefined || process.env[key!] === '') process.env[key!] = value
  }
}
loadEnvLocal()

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const live = process.env.LIVE_STUDENT_PATH_TEST === '1' && Boolean(url && anonKey && serviceKey)

// 게이트는 서버 모듈(next/headers)을 import 한다. 여기서는 service_role 경로만 쓰므로 쿠키는 필요 없다.
vi.mock('next/headers', () => ({ cookies: async () => ({ getAll: () => [], set: () => {} }) }))

const TAG = '__live_test__'

function anon(): SupabaseClient {
  return createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
}
function service(): SupabaseClient {
  return createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
}

/** 0행 또는 에러 — 둘 다 "읽을 수 없음"이다. */
function expectDenied(result: { data: unknown[] | null; error: unknown }) {
  if (result.error) return
  expect(result.data ?? []).toHaveLength(0)
}

const created = {
  orgId: '',
  instructorId: '',
  pendingInstructorId: '',
  programId: '',
  openSessionId: '',
  closedSessionId: '',
  openCode: '',
  closedCode: '',
}

async function uniqueEntryCode(sb: SupabaseClient): Promise<string> {
  for (let i = 0; i < 20; i += 1) {
    const code = `9${String(Math.floor(Math.random() * 100_000)).padStart(5, '0')}`
    const { data } = await sb.from('lecture_sessions').select('id').eq('entry_code', code).maybeSingle()
    if (!data) return code
  }
  throw new Error('빈 입장 코드를 찾지 못했습니다')
}

describe.skipIf(!live)('학생 경로 (실 DB)', () => {
  beforeAll(async () => {
    const sb = service()
    const org = await sb
      .from('organizations')
      .insert({ name: `${TAG} 기관`, type: 'youth_center', region_code: '41210' })
      .select('id')
      .single()
    if (org.error) throw new Error(`org: ${org.error.message}`)
    created.orgId = org.data.id

    const ins = await sb
      .from('instructors')
      .insert({ name: `${TAG} 강사`, region_code: '41210', fields: ['드론'], status: 'approved' })
      .select('id')
      .single()
    if (ins.error) throw new Error(`instructor: ${ins.error.message}`)
    created.instructorId = ins.data.id

    const pending = await sb
      .from('instructors')
      .insert({ name: `${TAG} 심사중 강사`, region_code: '41210', fields: ['드론'], status: 'pending' })
      .select('id')
      .single()
    if (pending.error) throw new Error(`pending instructor: ${pending.error.message}`)
    created.pendingInstructorId = pending.data.id

    const program = await sb
      .from('programs')
      .insert({
        instructor_id: created.instructorId,
        title: `${TAG} 드론 심화`,
        field: '드론',
        target_grades: ['middle'],
        format: 'short_course',
        session_count: 4,
        summary: '테스트',
        outline: ['1차시'],
      })
      .select('id')
      .single()
    if (program.error) throw new Error(`program: ${program.error.message}`)
    created.programId = program.data.id

    created.openCode = await uniqueEntryCode(sb)
    const open = await sb
      .from('lecture_sessions')
      .insert({
        org_id: created.orgId,
        instructor_id: created.instructorId,
        title: `${TAG} 열린 회차`,
        field: '드론',
        held_on: new Date().toISOString().slice(0, 10),
        closes_at: new Date(Date.now() + 3_600_000).toISOString(),
        status: 'open',
        entry_code: created.openCode,
        grade_band: 'middle',
        expected_students: 15,
      })
      .select('id')
      .single()
    if (open.error) throw new Error(`open session: ${open.error.message}`)
    created.openSessionId = open.data.id

    created.closedCode = await uniqueEntryCode(sb)
    const closed = await sb
      .from('lecture_sessions')
      .insert({
        org_id: created.orgId,
        title: `${TAG} 마감 회차`,
        field: '드론',
        held_on: new Date().toISOString().slice(0, 10),
        closes_at: new Date(Date.now() - 3_600_000).toISOString(),
        status: 'closed',
        entry_code: created.closedCode,
        grade_band: 'middle',
        expected_students: 15,
      })
      .select('id')
      .single()
    if (closed.error) throw new Error(`closed session: ${closed.error.message}`)
    created.closedSessionId = closed.data.id
  })

  afterAll(async () => {
    const sb = service()
    // 기관을 지우면 회차 → 응답 → 추천 기록이 cascade 로 지워진다. 강사는 따로 지운다(프로그램 cascade).
    if (created.orgId) await sb.from('organizations').delete().eq('id', created.orgId)
    for (const id of [created.instructorId, created.pendingInstructorId]) {
      if (id) await sb.from('instructors').delete().eq('id', id)
    }
  })

  // ── 읽으면 안 되는 것 (네거티브) ───────────────────────────────

  it('anon 은 회차를 읽을 수 없다 — 입장 코드 확인은 서버 게이트만 한다', async () => {
    expectDenied(await anon().from('lecture_sessions').select('*').eq('id', created.openSessionId))
  })

  it('anon 은 설문 응답을 읽을 수 없다', async () => {
    expectDenied(await anon().from('survey_responses').select('*').eq('session_id', created.openSessionId))
  })

  it('anon 은 추천 기록을 읽을 수 없다', async () => {
    expectDenied(await anon().from('recommendation_logs').select('*').eq('session_id', created.openSessionId))
  })

  it('anon 에게 심사 중 강사는 보이지 않는다 (E-11)', async () => {
    expectDenied(await anon().from('instructors').select('id').eq('id', created.pendingInstructorId))
  })

  it('마감된 회차에는 설문을 낼 수 없다 (E-17)', async () => {
    const id = randomUUID()
    const { error } = await anon().from('survey_responses').insert({
      id,
      session_id: created.closedSessionId,
      grade_band: 'middle',
      grade_year: 2,
      satisfaction: 4,
      followup_intent: 3,
      interest_fields: ['드론'],
    })
    expect(error).not.toBeNull()
    const { data } = await service().from('survey_responses').select('id').eq('id', id)
    expect(data ?? []).toHaveLength(0)
  })

  it('마감된 회차에는 추천 기록도 남길 수 없다', async () => {
    const { error } = await anon().from('recommendation_logs').insert({
      id: randomUUID(),
      session_id: created.closedSessionId,
      source: 'rule',
      stage: 'none',
      items: [],
    })
    expect(error).not.toBeNull()
  })

  // ── 되어야 하는 것 (파일럿 당일 경로) ───────────────────────────

  it('anon 이 승인된 강사와 그 프로그램을 읽는다 — 추천 후보의 원천', async () => {
    const ins = await anon().from('instructors').select('id, name').eq('id', created.instructorId)
    expect(ins.error).toBeNull()
    expect(ins.data).toHaveLength(1)

    const pg = await anon().from('programs').select('id').eq('id', created.programId)
    expect(pg.error).toBeNull()
    expect(pg.data).toHaveLength(1)
  })

  it('anon 이 열린 회차에 설문을 낸다 — 행을 돌려받지 않는 INSERT', async () => {
    const id = randomUUID()
    const { error } = await anon().from('survey_responses').insert({
      id,
      session_id: created.openSessionId,
      grade_band: 'middle',
      grade_year: 2,
      satisfaction: 5,
      followup_intent: 4,
      interest_fields: ['드론'],
      want_to_learn: null,
      desired_job: null,
      available_times: ['토요일'],
    })
    expect(error).toBeNull()

    const { data } = await service().from('survey_responses').select('id, satisfaction').eq('id', id)
    expect(data).toEqual([{ id, satisfaction: 5 }])
  })

  it('anon 이 열린 회차에 추천 기록을 남긴다', async () => {
    const id = randomUUID()
    const { error } = await anon().from('recommendation_logs').insert({
      id,
      session_id: created.openSessionId,
      response_id: null,
      source: 'llm',
      stage: 'same',
      items: [{ program_id: created.programId, reason: '테스트 이유' }],
      model: 'claude-opus-5',
      latency_ms: 1234,
      input_tokens: 100,
      output_tokens: 20,
    })
    expect(error).toBeNull()
    const { data } = await service().from('recommendation_logs').select('id, source').eq('id', id)
    expect(data).toEqual([{ id, source: 'llm' }])
  })

  it('서버 게이트가 입장 코드로 회차를 찾는다 (service_role, 정확 일치)', async () => {
    const { loadEntryContext } = await import('@/lib/db/student-gate')

    const open = await loadEntryContext(created.openCode)
    expect(open).not.toBeNull()
    expect(open!.session.id).toBe(created.openSessionId)
    expect(open!.closed).toBe(false)
    expect(open!.orgName).toBe(`${TAG} 기관`)
    expect(open!.orgRegionCode).toBe('41210')
    expect(open!.instructorName).toBe(`${TAG} 강사`)
    expect(open!.pseudoCodesIssued).toBe(false)

    const closed = await loadEntryContext(created.closedCode)
    expect(closed!.closed).toBe(true)
  })
})
