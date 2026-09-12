/** 클래스 합치기. 외부 의존성을 두지 않는다. */
export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ')
}
