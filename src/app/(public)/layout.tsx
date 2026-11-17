import { SiteHeader } from '@/components/layout/SiteHeader'
import { SiteFooter } from '@/components/layout/SiteFooter'
import { DemoBar } from '@/components/layout/DemoBar'
import { tourActive } from '@/lib/demo/mode'
import { isDemoMode } from '@/lib/supabase/env'

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const demo = isDemoMode()
  // 데모 배포에서는 쿠키를 읽지 않는다 — 공개 화면의 정적 렌더를 그대로 둔다.
  const tour = demo ? false : await tourActive()

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <DemoBar demo={demo} tour={tour} />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  )
}
