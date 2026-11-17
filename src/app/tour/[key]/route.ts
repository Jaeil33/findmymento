import { NextResponse } from 'next/server'
import { DEMO_ROLE_COOKIE } from '@/lib/auth/actor'
import { TOUR_COOKIE, TOUR_MAX_AGE_SECONDS } from '@/lib/demo/mode'
import { tourEntry } from '@/lib/demo/tour'

/**
 * 체험 입장 — **체험 쿠키를 심는 유일한 지점이다** (ADR-033).
 *
 * `/tour/instructor` 처럼 주소 하나로 들어온다. 링크로 공유할 수 있어야 하기 때문이다 —
 * 심사·시연에서 "이 주소를 누르면 강사 화면이 열립니다"가 설명의 전부여야 한다.
 *
 * 이 쿠키는 **권한이 아니라 데이터 출처**를 바꾼다. 쿠키가 있는 요청은 실 DB 클라이언트를
 * 아예 만들지 못하고(`lib/supabase/server.ts`) 모든 조회·쓰기가 데모 시드로 간다. 그래서
 * 역할을 쿠키로 정해도 실 DB 의 권한이 생기지 않는다 (CLAUDE.md CRITICAL 유지).
 *
 * 학생 체험에는 역할 쿠키를 심지 않는다. 학생은 계정을 만들지 않으므로(CLAUDE.md CRITICAL)
 * 실서비스와 같은 비로그인 경로(`/s/{입장코드}`)로 그대로 들여보낸다.
 */
export async function GET(request: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params
  const entry = tourEntry(key)
  if (!entry) return NextResponse.redirect(new URL('/', request.url))

  const options = {
    httpOnly: true,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: TOUR_MAX_AGE_SECONDS,
  }

  const response = NextResponse.redirect(new URL(entry.destination, request.url))
  response.cookies.set(TOUR_COOKIE, '1', options)
  if (entry.actor) response.cookies.set(DEMO_ROLE_COOKIE, entry.actor, options)
  else response.cookies.delete(DEMO_ROLE_COOKIE)
  return response
}
