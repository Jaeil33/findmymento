import { SiteHeader } from '@/components/layout/SiteHeader'
import { SiteFooter } from '@/components/layout/SiteFooter'
import { DemoBar } from '@/components/layout/DemoBar'

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <DemoBar />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  )
}
