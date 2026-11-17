import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { tourActive } from '@/lib/demo/mode'
import { isSupabaseConfigured, supabaseAnonKey, supabaseUrl } from './env'

/**
 * 서버에서 쓰는 Supabase 클라이언트. **anon 키 + 사용자 세션**으로 만든다.
 * 따라서 모든 조회에 RLS 가 적용된다 — 단순 조회를 API 라우트로 한 겹 더 감싸지 않는 이유가 이것이다.
 *
 * 키가 없으면 `null` 을 돌려준다. 호출자는 데모 데이터로 분기한다.
 *
 * **체험 세션에서도 `null` 이다** (ADR-033). 체험 쿠키는 권한이 아니라 데이터 출처를 바꾸는
 * 쿠키이고, 그 보장을 여기 한 곳에서 강제한다 — 어느 코드가 분기를 빼먹어도 실 DB 핸들을
 * 얻지 못한다. `tests/tour-mode.test.ts` 가 이것을 고정한다.
 */
export async function getServerSupabase(): Promise<SupabaseClient | null> {
  if (!isSupabaseConfigured()) return null
  if (await tourActive()) return null

  const store = await cookies()

  return createServerClient(supabaseUrl()!, supabaseAnonKey()!, {
    cookies: {
      getAll() {
        return store.getAll()
      },
      setAll(list) {
        try {
          for (const { name, value, options } of list) store.set(name, value, options)
        } catch {
          // Server Component 에서는 쿠키를 쓸 수 없다. 미들웨어·라우트 핸들러에서만 갱신된다.
        }
      },
    },
  })
}

/**
 * `service_role` 클라이언트. **라우트 핸들러·서버 액션에서만** 호출한다.
 *
 * 키에 `NEXT_PUBLIC_` 접두사가 없으므로 값이 번들에 들어갈 수는 없지만,
 * 호출 지점을 서버로 제한하는 것이 1차 방어다 (CLAUDE.md CRITICAL).
 * RLS 를 우회하므로 운영자 작업(심사·초대·문의 배정)에만 쓴다.
 *
 * **체험 세션에서는 `null` 이다** (ADR-033). RLS 를 우회하는 핸들이므로 이쪽이 더 중요하다 —
 * 체험으로 들어온 운영자 화면이 실 DB 의 심사·초대를 건드릴 수 있으면 그건 권한 상승이다.
 */
export async function getServiceSupabase(): Promise<SupabaseClient | null> {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  const url = supabaseUrl()
  if (!url || !key || key.trim() === '') return null
  if (await tourActive()) return null

  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}
