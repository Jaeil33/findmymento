import { cookies } from 'next/headers'
import { isDemoMode } from '@/lib/supabase/env'

/**
 * 체험 모드 — **로그인 없이 둘러보는 세션** (ADR-033).
 *
 * 쿠키 하나로 결정되고, 쿠키가 있으면 그 요청은 **실 DB 를 보지 않는다.** 읽기도 쓰기도 데모
 * 시드(메모리)로 간다. 그래서 체험 쿠키는 권한이 아니라 **데이터 출처**를 바꾼다 —
 * 쿠키로 실 DB 의 권한을 얻는 경로를 만들지 않는다는 규칙(CLAUDE.md CRITICAL)이 그대로 유지된다.
 *
 * 그 보장은 한 곳에서 강제된다: `lib/supabase/server.ts` 의 두 클라이언트 팩토리가 체험
 * 세션에서 `null` 을 돌려준다. 어느 코드가 분기를 빼먹어도 실 DB 핸들을 얻지 못한다.
 * `tests/tour-mode.test.ts` 가 이 두 가지를 고정한다.
 */

export const TOUR_COOKIE = 'fmm_tour'

/** 체험 세션의 수명. 둘러보기용이므로 짧게 둔다. */
export const TOUR_MAX_AGE_SECONDS = 60 * 60 * 2

/**
 * 체험 쿠키가 있는가. **쿠키만 본다** — 데모 데이터 모드 여부와 섞지 않는다.
 * 화면이 "데모 배포"와 "체험 세션"을 구분해 안내해야 하기 때문이다.
 */
export async function tourActive(): Promise<boolean> {
  try {
    const store = await cookies()
    return store.get(TOUR_COOKIE)?.value === '1'
  } catch {
    // 쿠키를 읽을 수 없는 렌더 환경(정적 생성 등)에서는 체험 세션이 아니다.
    return false
  }
}

/**
 * Next 라우터가 **사람 대신** 보낸 요청인가 (프리페치·클라이언트 내비게이션).
 *
 * `/tour/*` 는 페이지가 아니라 쿠키를 심고 지우는 라우트 핸들러다. 링크가 화면에 들어오면
 * 라우터는 그 주소를 미리 한 번 호출하는데(`?_rsc=`), 그 호출이 그대로 쿠키를 바꾼다 —
 * 누르기도 전에 여섯 입구가 전부 실행돼 역할이 뒤섞이고, 띠의 "체험 종료" 는 둘러보는
 * 도중에 세션을 끈다. 그래서 **이런 요청에는 쿠키를 건드리지 않는다.**
 *
 * 입구를 평범한 `<a>` 로 두는 것이 1차 방어이고(`tests/tour-mode.test.ts` 가 고정한다),
 * 이것은 누군가 다시 `next/link` 로 바꿔도 세션이 깨지지 않게 하는 2차 방어다.
 */
export function isRouterPrefetch(request: Request): boolean {
  const h = request.headers
  return h.get('rsc') === '1' || h.get('next-router-prefetch') === '1'
}

/**
 * 데모 시드로 읽고 쓸지. **데이터 계층의 유일한 분기 조건이다.**
 *
 * Supabase 키가 없으면 쿠키를 읽지 않고 곧장 true — 데모 배포에서 모든 페이지가
 * 쿠키 접근 때문에 동적 렌더로 바뀌는 것을 막는다.
 */
export async function demoDataMode(): Promise<boolean> {
  if (isDemoMode()) return true
  return tourActive()
}
