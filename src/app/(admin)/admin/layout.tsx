import { redirect } from 'next/navigation'
import { DashboardShell, type NavItem } from '@/components/layout/DashboardShell'
import { getActor } from '@/lib/auth/actor'

const NAV: NavItem[] = [
  { href: '/admin', label: '요약' },
  { href: '/admin/instructors', label: '강사 심사' },
  { href: '/admin/inquiries', label: '보호자 문의' },
  { href: '/admin/qna', label: '미답변 큐' },
  { href: '/admin/invitations', label: '초대·계정' },
]

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const actor = await getActor()
  if (!actor || actor.role !== 'admin') redirect('/login')

  return (
    <DashboardShell roleLabel="운영자" userName={actor.displayName} nav={NAV}>
      {children}
    </DashboardShell>
  )
}
