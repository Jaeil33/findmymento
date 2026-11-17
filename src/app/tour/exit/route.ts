import { NextResponse } from 'next/server'
import { DEMO_ROLE_COOKIE } from '@/lib/auth/actor'
import { isRouterPrefetch, TOUR_COOKIE } from '@/lib/demo/mode'

/**
 * 체험 종료. 쿠키 둘을 지우고 첫 화면으로 돌아간다.
 *
 * 이 경로가 있어야 체험 중에 **실제 계정으로 로그인하려는 사람이 막히지 않는다** —
 * 체험 쿠키가 남아 있으면 로그인해도 데모 시드를 보게 되므로, 로그인 처리도 같은 쿠키를 지운다
 * (`app/(public)/login/actions.ts`).
 */
export async function GET(request: Request) {
  // 띠의 "체험 종료" 는 모든 화면 위에 있다. 라우터가 미리 당겨 보는 것만으로 세션이 꺼지면 안 된다.
  if (isRouterPrefetch(request)) return new NextResponse(null, { status: 204 })

  const response = NextResponse.redirect(new URL('/', request.url))
  response.cookies.delete(TOUR_COOKIE)
  response.cookies.delete(DEMO_ROLE_COOKIE)
  return response
}
