/**
 * 로그인 아이디 → Supabase Auth 로그인 주소.
 *
 * 아이디·비밀번호 로그인은 Supabase 의 이메일+비밀번호 로그인 위에 얹는다.
 * - `@` 가 있으면 이메일 그대로 쓴다.
 * - 없으면 영문 소문자·숫자 아이디를 **예약 도메인(.invalid)** 주소로 바꾼다. RFC 2606 예약어라
 *   이 주소로는 어떤 메일도 배달되지 않는다 — 누가 비밀번호 재설정을 요청해도 남의 메일함으로 가지 않는다.
 *
 * 역할 판별은 여기와 무관하다. 여전히 org_members/instructors/admins 조회로만 정한다 (CLAUDE.md CRITICAL).
 */
export const LOGIN_ID_DOMAIN = 'findmymento.invalid'

const LOGIN_ID = /^[a-z0-9][a-z0-9._-]{2,29}$/
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function loginEmailFor(raw: string): string | null {
  const value = raw.trim().toLowerCase()
  if (value.includes('@')) return EMAIL.test(value) ? value : null
  return LOGIN_ID.test(value) ? `${value}@${LOGIN_ID_DOMAIN}` : null
}
