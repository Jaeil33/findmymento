import { redirect } from 'next/navigation'
import { DashboardShell, type NavItem } from '@/components/layout/DashboardShell'
import { getActor } from '@/lib/auth/actor'
import { tourActive } from '@/lib/demo/mode'
import { loadDataset } from '@/lib/db/dataset'

/**
 * 제품의 중심이 콘텐츠 제작으로 옮겨졌다 (ADR-028). 매칭 화면은 그대로 두고 순서만 뒤로 간다.
 * `group: 'matching'` 이 그 경계를 탭 줄에 선 하나로 그린다 — 탭 8개가 같은 무게로 늘어서면
 * 진입 순서가 화면에서 사라진다.
 */
const NAV: NavItem[] = [
  { href: '/instructor', label: '요약' },
  { href: '/instructor/studio', label: '콘텐츠 스튜디오' },
  { href: '/instructor/sessions', label: '배정 회차', group: 'matching' },
  { href: '/instructor/demand', label: '지역 수요', group: 'matching' },
  { href: '/instructor/recruitment', label: '섭외 요청', group: 'matching' },
  { href: '/instructor/leads', label: '문의 리드', group: 'matching' },
  { href: '/instructor/qna', label: 'Q&A 답변', group: 'matching' },
  { href: '/instructor/profile', label: '프로필', group: 'matching' },
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
      demo={actor.demo}
      tour={await tourActive()}
    >
      {children}
    </DashboardShell>
  )
}
