/**
 * Supabase 설정 여부 판별 한 곳.
 *
 * 키가 없으면 앱은 **데모 데이터 모드**로 동작한다 (읽기 전용 시드, 쓰기는 메모리에만).
 * 파일럿 전에 화면을 공유하고 Vercel 에 올려 검수하기 위한 모드이고,
 * 키가 들어오면 같은 코드가 실 DB(RLS 적용)로 붙는다.
 *
 * 서버 전용 키는 이 파일에서 읽되 **절대 export 하지 않는다.**
 * `NEXT_PUBLIC_` 이 붙지 않은 값은 클라이언트 번들에 포함되지 않는다.
 */

export function supabaseUrl(): string | null {
  const v = process.env.NEXT_PUBLIC_SUPABASE_URL
  return v && v.trim() !== '' ? v.trim() : null
}

export function supabaseAnonKey(): string | null {
  const v = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  return v && v.trim() !== '' ? v.trim() : null
}

/** 설정돼 있으면 실 DB, 아니면 데모 모드. */
export function isSupabaseConfigured(): boolean {
  return supabaseUrl() !== null && supabaseAnonKey() !== null
}

export function isDemoMode(): boolean {
  return !isSupabaseConfigured()
}

/** 공개 도메인. QR 이 가리킬 주소를 하드코딩하지 않는다 (step 15). */
export function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim()
  if (explicit) return explicit.replace(/\/$/, '')
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL
  if (vercel) return `https://${vercel.replace(/\/$/, '')}`
  return 'http://localhost:3000'
}
