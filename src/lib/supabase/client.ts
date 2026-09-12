'use client'

import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import { isSupabaseConfigured, supabaseAnonKey, supabaseUrl } from './env'

let cached: SupabaseClient | null = null

/**
 * 브라우저 클라이언트. **로그인(매직링크)에만** 쓴다.
 *
 * 데이터 쓰기를 여기서 하지 않는다 — 설문 제출·Q&A 작성·보호자 문의는
 * 서버 검증(금칙어 필터·중복 제출·레이트 리밋)을 거쳐야 하므로 API 라우트를 경유한다.
 */
export function getBrowserSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null
  if (!cached) cached = createBrowserClient(supabaseUrl()!, supabaseAnonKey()!)
  return cached
}
