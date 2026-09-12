import { NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase/server'
import { getActor, homePathFor } from '@/lib/auth/actor'

/**
 * 매직링크 콜백. 코드를 세션으로 교환한 뒤 **역할을 테이블 조회로 판별해** 분기한다.
 * 쿼리스트링의 `role` 같은 값을 믿지 않는다.
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')

  const sb = await getServerSupabase()
  if (!sb || !code) {
    return NextResponse.redirect(new URL('/login?error=1', url.origin))
  }

  const { error } = await sb.auth.exchangeCodeForSession(code)
  if (error) {
    return NextResponse.redirect(new URL('/login?error=1', url.origin))
  }

  const actor = await getActor()
  if (!actor) {
    // 인증은 됐지만 어느 테이블에도 없다 = 초대를 수락하지 않은 계정.
    return NextResponse.redirect(new URL('/login?error=no_role', url.origin))
  }

  return NextResponse.redirect(new URL(homePathFor(actor.role), url.origin))
}
