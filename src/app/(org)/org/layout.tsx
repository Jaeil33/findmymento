import { redirect } from 'next/navigation'
import { DashboardShell, type NavItem } from '@/components/layout/DashboardShell'
import { getActor } from '@/lib/auth/actor'
import { loadDataset } from '@/lib/db/dataset'
import { ORG_TYPE_LABEL } from '@/types/domain'

const NAV: NavItem[] = [
  { href: '/org', label: '요약' },
  { href: '/org/sessions', label: '특강 회차' },
  { href: '/org/demand', label: '수요' },
  { href: '/org/interests', label: '관심 표현' },
  { href: '/org/recruitment', label: '섭외' },
  { href: '/programs', label: '강사 찾기' },
]

export default async function OrgLayout({ children }: { children: React.ReactNode }) {
  const actor = await getActor()
  if (!actor || actor.role !== 'org_member') redirect('/login')

  const ds = await loadDataset()
  const org = ds.organizations.find((o) => o.id === actor.orgId)

  return (
    <DashboardShell
      // `organizations.type` 은 이렇게 화면 문구에만 쓴다. 권한 판단에 쓰지 않는다 (ADR-013).
      roleLabel={org ? `${ORG_TYPE_LABEL[org.type]} 담당자` : '기관 담당자'}
      orgLabel={org?.name}
      userName={actor.displayName}
      nav={NAV}
    >
      {children}
    </DashboardShell>
  )
}
