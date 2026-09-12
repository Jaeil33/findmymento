import { redirect } from 'next/navigation'
import { Badge } from '@/components/ui/Badge'
import { PageHeader, Panel } from '@/components/ui/Section'
import { Table, Td, Th } from '@/components/ui/Table'
import { getActor } from '@/lib/auth/actor'
import { loadDataset } from '@/lib/db/dataset'
import { invitationRows } from '@/lib/db/queries'
import { ROLE_LABEL } from '@/lib/auth/invitation'
import { sendInvitation, toggleMemberActive } from '../actions'
import { IconAlert } from '@/components/ui/Icons'
import { isDemoMode } from '@/lib/supabase/env'

export const metadata = { title: '초대 · 계정' }

/**
 * 초대 발송과 계정 관리.
 *
 * **셀프 가입이 없으므로 모든 계정이 이 화면에서 출발한다** (ADR-011).
 * 토큰은 1회용이고 만료 시각이 있다. 이직한 담당자는 삭제가 아니라 비활성화한다 (E-13).
 */
export default async function AdminInvitationsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const sp = await searchParams
  const actor = await getActor()
  if (!actor || actor.role !== 'admin') redirect('/login')

  const ds = await loadDataset()
  const rows = invitationRows(ds)

  return (
    <div className="space-y-8">
      <PageHeader
        title="초대 · 계정"
        description="공개 회원가입이 없습니다. 기관·학교 담당자, 강사, 운영자 계정은 전부 초대로만 만들어집니다."
      />

      {sp.error === 'email' ? (
        <p className="flex items-center gap-2 rounded-md border border-negative/25 bg-negative-bg px-4 py-3 text-sm text-negative">
          <IconAlert width={16} height={16} />
          이메일 형식을 확인해 주세요.
        </p>
      ) : null}

      <Panel title="초대 보내기" description="토큰은 1회용이고 7일 뒤 만료됩니다.">
        <form action={sendInvitation} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="space-y-1.5 lg:col-span-2">
            <span className="block text-sm font-medium text-body">이메일</span>
            <input
              type="email"
              name="email"
              required
              placeholder="person@example.org"
              className="block w-full rounded-lg border border-line-strong bg-card px-4 py-2.5 text-sm text-ink focus:border-point focus:ring-1 focus:ring-point focus:outline-none"
            />
          </label>

          <label className="space-y-1.5">
            <span className="block text-sm font-medium text-body">역할</span>
            <select
              name="role"
              defaultValue="org_member"
              className="block w-full rounded-lg border border-line-strong bg-card px-4 py-2.5 text-sm text-ink focus:border-point focus:ring-1 focus:ring-point focus:outline-none"
            >
              <option value="org_member">기관·학교 담당자</option>
              <option value="instructor">강사</option>
              <option value="admin">운영자</option>
            </select>
          </label>

          <label className="space-y-1.5">
            <span className="block text-sm font-medium text-body">소속 기관 (담당자)</span>
            <select
              name="orgId"
              defaultValue=""
              className="block w-full rounded-lg border border-line-strong bg-card px-4 py-2.5 text-sm text-ink focus:border-point focus:ring-1 focus:ring-point focus:outline-none"
            >
              <option value="">선택 없음</option>
              {ds.organizations.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1.5">
            <span className="block text-sm font-medium text-body">소속 업체 (강사)</span>
            <select
              name="providerId"
              defaultValue=""
              className="block w-full rounded-lg border border-line-strong bg-card px-4 py-2.5 text-sm text-ink focus:border-point focus:ring-1 focus:ring-point focus:outline-none"
            >
              <option value="">프리랜서</option>
              {ds.providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>

          <div className="flex items-end lg:col-span-2">
            <button
              type="submit"
              className="rounded-lg bg-point px-4 py-2.5 text-sm font-medium text-white hover:bg-point-hover"
            >
              초대 보내기
            </button>
          </div>
        </form>
      </Panel>

      <Panel title="초대 목록" description="수락된 토큰은 다시 쓸 수 없습니다.">
        <Table>
          <thead>
            <tr>
              <Th>이메일</Th>
              <Th>역할</Th>
              <Th>소속</Th>
              <Th>만료</Th>
              <Th>상태</Th>
              {isDemoMode() ? <Th>초대 링크</Th> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.invitation.id}>
                <Td className="text-ink">{r.invitation.email}</Td>
                <Td className="text-sub">{ROLE_LABEL[r.invitation.role]}</Td>
                <Td className="text-sub">{r.orgName ?? r.providerName ?? '-'}</Td>
                <Td className="whitespace-nowrap text-sub tabular-nums">
                  {r.invitation.expires_at.slice(0, 10)}
                </Td>
                <Td>
                  {r.accepted ? (
                    <Badge tone="positive">수락됨</Badge>
                  ) : r.expired ? (
                    <Badge tone="negative">만료</Badge>
                  ) : (
                    <Badge tone="caution">대기</Badge>
                  )}
                </Td>
                {isDemoMode() ? (
                  <Td className="text-xs break-all text-faint">
                    /invite/{r.invitation.token}
                  </Td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </Table>
        {isDemoMode() ? (
          <p className="mt-3 text-xs text-sub">
            데모 모드라 초대 링크를 그대로 보여 줍니다. 실제 운영에서는 메일로만 전달되고 이 열은
            사라집니다.
          </p>
        ) : null}
      </Panel>

      <Panel
        title="기관 담당자 계정"
        description="이직한 담당자는 계정을 삭제하지 않고 접근을 차단합니다. 남긴 기록은 그대로 보존됩니다."
      >
        <Table>
          <thead>
            <tr>
              <Th>담당자</Th>
              <Th>기관</Th>
              <Th>역할</Th>
              <Th>상태</Th>
              <Th className="text-right">작업</Th>
            </tr>
          </thead>
          <tbody>
            {ds.orgMembers.map((m) => {
              const org = ds.organizations.find((o) => o.id === m.org_id)
              return (
                <tr key={m.id}>
                  <Td className="text-ink">{m.display_name}</Td>
                  <Td className="text-sub">{org?.name ?? '-'}</Td>
                  <Td className="text-sub">{m.role === 'manager' ? '담당자' : '교사'}</Td>
                  <Td>
                    {m.active ? <Badge tone="positive">활성</Badge> : <Badge>접근 차단</Badge>}
                  </Td>
                  <Td className="text-right">
                    <form action={toggleMemberActive}>
                      <input type="hidden" name="memberId" value={m.id} />
                      <input type="hidden" name="active" value={m.active ? 'false' : 'true'} />
                      <button
                        type="submit"
                        className="rounded-md border border-line-strong bg-card px-2.5 py-1 text-xs font-medium text-body hover:bg-muted"
                      >
                        {m.active ? '접근 차단' : '접근 복구'}
                      </button>
                    </form>
                  </Td>
                </tr>
              )
            })}
          </tbody>
        </Table>
      </Panel>
    </div>
  )
}
