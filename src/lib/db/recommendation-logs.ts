import type { RecommendationLogRow } from '@/lib/report/admin-session'
import { isDemoMode } from '@/lib/supabase/env'
import { getServerSupabase } from '@/lib/supabase/server'

/**
 * 추천 기록 읽기. 로그인한 사용자의 세션으로 읽으므로 RLS 가 그대로 걸린다 —
 * 기관 담당자는 자기 기관 회차만, 운영자는 전부, 강사·anon 은 0행이다.
 * 데모 모드에는 추천 기록이 없다 (쓰기도 하지 않는다).
 */
export async function loadRecommendationLogs(sessionIds?: string[]): Promise<RecommendationLogRow[]> {
  if (isDemoMode()) return []
  const sb = await getServerSupabase()
  if (!sb) return []

  let query = sb
    .from('recommendation_logs')
    .select('id, session_id, response_id, source, stage, items, model, latency_ms, input_tokens, output_tokens, error, created_at')
    .order('created_at')
    .limit(5000)
  if (sessionIds) query = query.in('session_id', sessionIds)

  const { data, error } = await query
  if (error) return []
  return (data ?? []) as RecommendationLogRow[]
}
