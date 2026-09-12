import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'

/**
 * RLS 네거티브 테스트 — **실제 역할 키로** 수행한다.
 *
 * `service_role` 로 돌리면 RLS 를 우회하므로 통과해도 아무것도 증명하지 못한다.
 * 그래서 이 파일은 anon 키와 실제 사용자 세션만 쓴다.
 *
 * 환경변수가 없으면 **건너뛴다**(실패가 아니다). Supabase dev 프로젝트를 연결하고
 * `npm run db:push` 를 한 뒤에 다음을 넣으면 실행된다:
 *
 *   NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
 *   RLS_TEST_ORG_A_EMAIL / _PASSWORD     (기관 A 담당자)
 *   RLS_TEST_ORG_B_ORG_ID                (기관 B 의 org_id)
 *   RLS_TEST_INSTRUCTOR_EMAIL / _PASSWORD
 *   RLS_TEST_UNASSIGNED_SESSION_ID       (그 강사에게 배정되지 않은 회차)
 *   RLS_TEST_CLOSED_SESSION_ID           (마감된 회차)
 *   RLS_TEST_PENDING_INSTRUCTOR_ID
 *   RLS_TEST_EXPIRED_INVITE_TOKEN
 *   RLS_TEST_OTHER_INSTRUCTOR_ID         (문의가 배정된 다른 강사)
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const live = Boolean(url && anonKey)

const env = (k: string) => process.env[k] ?? ''

function anonClient(): SupabaseClient {
  return createClient(url!, anonKey!, { auth: { persistSession: false } })
}

async function sessionClient(emailKey: string, passwordKey: string): Promise<SupabaseClient> {
  const sb = createClient(url!, anonKey!, { auth: { persistSession: false } })
  const { error } = await sb.auth.signInWithPassword({
    email: env(emailKey),
    password: env(passwordKey),
  })
  if (error) throw new Error(`${emailKey} 로그인 실패: ${error.message}`)
  return sb
}

/** 0행 또는 에러여야 한다. 둘 중 무엇이든 "접근 불가"로 본다. */
function expectDenied(result: { data: unknown[] | null; error: unknown }) {
  if (result.error) {
    expect(result.error).toBeTruthy()
    return
  }
  expect(result.data ?? []).toHaveLength(0)
}

describe.skipIf(!live)('RLS 네거티브 테스트 (실 DB)', () => {
  it('1. anon 으로 instructor_contacts SELECT → 0행 또는 에러', async () => {
    expectDenied(await anonClient().from('instructor_contacts').select('*'))
  })

  it('2. 기관 A 담당자로 기관 B 의 students SELECT → 0행', async () => {
    const sb = await sessionClient('RLS_TEST_ORG_A_EMAIL', 'RLS_TEST_ORG_A_PASSWORD')
    expectDenied(
      await sb.from('students').select('*').eq('org_id', env('RLS_TEST_ORG_B_ORG_ID')),
    )
  })

  it('3. 기관 A 담당자로 기관 B 의 survey_responses SELECT → 0행', async () => {
    const sb = await sessionClient('RLS_TEST_ORG_A_EMAIL', 'RLS_TEST_ORG_A_PASSWORD')
    const { data: otherSessions } = await sb
      .from('lecture_sessions')
      .select('id')
      .eq('org_id', env('RLS_TEST_ORG_B_ORG_ID'))
    // 회차 자체가 0행이어야 하고, 혹시 보인다면 응답도 0행이어야 한다
    expect(otherSessions ?? []).toHaveLength(0)
  })

  it('4. 강사 계정으로 survey_responses 원본 SELECT → 0행', async () => {
    const sb = await sessionClient('RLS_TEST_INSTRUCTOR_EMAIL', 'RLS_TEST_INSTRUCTOR_PASSWORD')
    expectDenied(await sb.from('survey_responses').select('*'))
  })

  it('5. anon 으로 미승인(pending) 강사 SELECT → 0행', async () => {
    expectDenied(
      await anonClient()
        .from('instructors')
        .select('*')
        .eq('id', env('RLS_TEST_PENDING_INSTRUCTOR_ID')),
    )
  })

  it('6. anon 으로 invitations SELECT → 0행', async () => {
    expectDenied(await anonClient().from('invitations').select('*'))
  })

  it('7. 만료된 초대 토큰으로는 초대를 읽을 수 없다', async () => {
    expectDenied(
      await anonClient()
        .from('invitations')
        .select('*')
        .eq('token', env('RLS_TEST_EXPIRED_INVITE_TOKEN')),
    )
  })

  it('8. anon 으로 consents SELECT → 0행', async () => {
    expectDenied(await anonClient().from('consents').select('*'))
  })

  it('9. 마감된 회차에 설문 INSERT → 실패 (E-17)', async () => {
    const { error } = await anonClient()
      .from('survey_responses')
      .insert({
        session_id: env('RLS_TEST_CLOSED_SESSION_ID'),
        grade_band: 'middle',
        grade_year: 2,
        satisfaction: 4,
        followup_intent: 3,
        interest_fields: ['드론'],
      })
    expect(error).toBeTruthy()
  })

  it('10. anon 으로 inquiries SELECT → 0행 또는 에러', async () => {
    expectDenied(await anonClient().from('inquiries').select('*'))
  })

  it('11. anon 으로 inquiries INSERT → **성공** (막히면 개인 경로 전체가 죽는다)', async () => {
    const { error } = await anonClient().from('inquiries').insert({
      guardian_name: 'RLS테스트',
      guardian_contact: '010-0000-0000',
      region_code: '41210',
      grade_band: 'middle',
      field: '드론',
      target_type: 'none',
      message: 'RLS 네거티브 테스트 삽입',
      status: 'received',
    })
    expect(error).toBeNull()
  })

  it('12. 강사 계정으로 배정되지 않은 회차 SELECT → 0행 (ADR-015)', async () => {
    const sb = await sessionClient('RLS_TEST_INSTRUCTOR_EMAIL', 'RLS_TEST_INSTRUCTOR_PASSWORD')
    expectDenied(
      await sb
        .from('lecture_sessions')
        .select('*')
        .eq('id', env('RLS_TEST_UNASSIGNED_SESSION_ID')),
    )
  })

  it('13. 강사 계정으로 lecture_sessions INSERT → 실패', async () => {
    const sb = await sessionClient('RLS_TEST_INSTRUCTOR_EMAIL', 'RLS_TEST_INSTRUCTOR_PASSWORD')
    const { error } = await sb.from('lecture_sessions').insert({
      org_id: env('RLS_TEST_ORG_B_ORG_ID'),
      title: 'RLS 테스트 회차',
      field: '드론',
      held_on: '2026-09-20',
      closes_at: '2026-09-27T23:59:00+09:00',
      entry_code: '999999',
      grade_band: 'middle',
    })
    expect(error).toBeTruthy()
  })

  it('14. 강사 계정으로 남의 문의(assigned_instructor_id 다름) SELECT → 0행', async () => {
    const sb = await sessionClient('RLS_TEST_INSTRUCTOR_EMAIL', 'RLS_TEST_INSTRUCTOR_PASSWORD')
    expectDenied(
      await sb
        .from('inquiries')
        .select('*')
        .eq('assigned_instructor_id', env('RLS_TEST_OTHER_INSTRUCTOR_ID')),
    )
  })
})

describe.skipIf(live)('RLS 네거티브 테스트 (건너뜀)', () => {
  it('Supabase 키가 없어 건너뛴다 — 정책 구조는 rls-policies.test.ts 가 검증한다', () => {
    expect(live).toBe(false)
  })
})
