import { NextResponse } from 'next/server'
import { getActor } from '@/lib/auth/actor'
import { landingPathFor } from '@/lib/auth/landing'
import { loadDataset } from '@/lib/db/dataset'
import { getServerSupabase } from '@/lib/supabase/server'

/**
 * 아이디·비밀번호 로그인 직후. **새 요청에서** 방금 심은 세션으로 역할을 테이블 조회로 판별한다.
 * 쿼리스트링·폼 값의 역할을 믿지 않는다 (CLAUDE.md CRITICAL).
 */
export async function GET(request: Request) {
  const origin = new URL(request.url).origin

  const actor = await getActor()
  if (!actor) {
    // 인증은 됐지만 어느 테이블에도 없다 = 기관·강사로 연결되지 않은 계정. 세션을 남기지 않는다.
    const sb = await getServerSupabase()
    await sb?.auth.signOut()
    return NextResponse.redirect(new URL('/login?error=no_role', origin))
  }

  const ds = await loadDataset()
  return NextResponse.redirect(new URL(landingPathFor(actor, ds), origin))
}
