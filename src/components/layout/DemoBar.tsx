import Link from 'next/link'
import { isDemoMode } from '@/lib/supabase/env'

/**
 * 계정 없는 화면(학생·보호자·공개)의 데모 안내 한 줄.
 *
 * 대시보드에는 `DashboardShell` 이 같은 안내와 "역할 바꾸기"를 둔다. 학생·보호자에게는 로그아웃할
 * 계정이 없으므로 역할 고르기로 돌아가는 링크만 둔다. **실 DB 에 붙으면 렌더되지 않는다.**
 */
export function DemoBar() {
  if (!isDemoMode()) return null
  return (
    <div className="border-b border-caution/25 bg-caution-bg">
      <p className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 py-2 text-center text-xs text-caution sm:px-6">
        <span>데모 데이터 모드입니다. 화면의 숫자·이름과 AI 문장은 시연용 예시입니다.</span>
        <Link href="/login" className="font-medium underline underline-offset-4 hover:text-ink">
          역할 다시 고르기
        </Link>
      </p>
    </div>
  )
}
