import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { isSupabaseConfigured, supabaseAnonKey, supabaseUrl } from '@/lib/supabase/env'

/**
 * 하는 일은 하나다 — **Supabase 세션 쿠키 갱신.**
 *
 * Server Component 는 쿠키를 쓸 수 없다(`lib/supabase/server.ts` 의 setAll catch).
 * 그래서 access token 이 만료되면 refresh token 이 멀쩡해도 갱신할 지점이 없고,
 * 기관·강사·운영자가 한 시간쯤 뒤 화면을 누르면 전부 `/login` 으로 튕긴다.
 * 그 갱신을 여기서 한 번 한다.
 *
 * **역할 판단은 여기서 하지 않는다.** 역할은 `auth_user_id` 가
 * `org_members`/`instructors`/`admins` 중 어디에 있는지로만 판별하고(CLAUDE.md CRITICAL),
 * 그 판단은 각 layout 의 `getActor()` 가 한다. 미들웨어가 같은 판단을 흉내내면
 * 권한 로직이 두 곳으로 갈라지고, 갈라진 쪽은 반드시 한쪽이 먼저 낡는다.
 * 그래서 여기에는 리다이렉트가 없다.
 */

/**
 * 갱신할 세션이 있는 요청만 고른다.
 *
 * 학생 설문(`/s/[code]`) · 프로그램 디렉토리 · 보호자 문의는 **비로그인 경로**다.
 * 이쪽에 Supabase 왕복을 끼우면 교실에서 30명이 동시에 QR 을 찍는 순간 그대로 손해다.
 */
export function needsSessionRefresh(cookies: { name: string }[]): boolean {
  return cookies.some((c) => c.name.startsWith('sb-'))
}

export async function middleware(request: NextRequest) {
  // 데모 모드에는 갱신할 세션이 없다. 역할은 데모 쿠키가 들고 있고 만료가 없다.
  if (!isSupabaseConfigured()) return NextResponse.next({ request })
  if (!needsSessionRefresh(request.cookies.getAll())) return NextResponse.next({ request })

  let response = NextResponse.next({ request })

  const supabase = createServerClient(supabaseUrl()!, supabaseAnonKey()!, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(list) {
        for (const { name, value } of list) request.cookies.set(name, value)
        response = NextResponse.next({ request })
        for (const { name, value, options } of list) response.cookies.set(name, value, options)
      },
    },
  })

  // 이 한 줄이 만료된 토큰을 갱신해 쿠키에 다시 심는다. 결과는 쓰지 않는다.
  try {
    await supabase.auth.getUser()
  } catch {
    // Supabase 가 안 뜨거나 URL 이 잘못됐을 때 **사이트 전체가 500 이 되지 않게** 한다.
    // 갱신에 실패하면 로그인되지 않은 상태로 흘러가고, 각 layout 의 getActor() 가 /login 으로 보낸다.
    // 비로그인 경로(학생 설문·디렉토리·보호자 문의)는 영향을 받지 않는다.
  }

  return response
}

export const config = {
  // 정적 자산과 이미지 최적화 경로는 제외한다. QR·설문은 매 요청이 곧 교실의 대기 시간이다.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)',
  ],
}
