import { redirect } from 'next/navigation'
import { DashboardShell, type NavItem } from '@/components/layout/DashboardShell'
import { getActor } from '@/lib/auth/actor'
import { loadDataset } from '@/lib/db/dataset'

const NAV: NavItem[] = [
  { href: '/instructor', label: '요약' },
  { href: '/instructor/sessions', label: '배정 회차' },
  { href: '/instructor/demand', label: '지역 수요' },
  { href: '/instructor/recruitment', label: '섭외 요청' },
  { href: '/instructor/leads', label: '문의 리드' },
  { href: '/instructor/qna', label: 'Q&A 답변' },
  { href: '/instructor/profile', label: '프로필' },
]

export default async function InstructorLayout({ children }: { children: React.ReactNode }) {
  const actor = await getActor()
  if (!actor || actor.role !== 'instructor') redirect('/login')

  const ds = await loadDataset()
  const instructor = ds.instructors.find((i) => i.id === actor.instructorId)
  const provider = instructor?.provider_id
    ? ds.providers.find((p) => p.id === instructor.provider_id)
    : undefined

  return (
    <DashboardShell
      roleLabel="강사"
      orgLabel={provider?.name ?? '프리랜서'}
      userName={actor.displayName}
      nav={NAV}
    >
      {children}
    </DashboardShell>
  )
}
