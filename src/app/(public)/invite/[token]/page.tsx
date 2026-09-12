import Link from 'next/link'
import { PageHeader } from '@/components/ui/Section'
import { Badge } from '@/components/ui/Badge'
import { buttonClass } from '@/components/ui/Button'
import { loadDataset } from '@/lib/db/dataset'
import { checkInvitation, ROLE_LABEL } from '@/lib/auth/invitation'
import { IconAlert, IconShield } from '@/components/ui/Icons'

export const metadata = { title: '초대 수락' }

/**
 * 초대 수락 화면.
 *
 * 토큰은 1회용이고 만료 시각을 검증한다. 만료·사용된 토큰으로는 계정이 만들어지지 않는다 (E-12).
 * 같은 토큰을 두 번 수락해도 소속 행은 1개다 — `already_accepted` 를 에러가 아니라
 * 별도 상태로 구분하는 이유가 그것이다 (멱등).
 */
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const ds = await loadDataset()
  const invitation = ds.invitations.find((v) => v.token === token)
  const check = checkInvitation(invitation)

  if (!check.ok) {
    return (
      <div className="mx-auto max-w-xl px-4 py-14 sm:px-6">
        <div className="flex items-center gap-2 text-caution">
          <IconAlert width={20} height={20} />
          <p className="text-sm font-medium">
            {check.reason === 'expired'
              ? '만료된 초대'
              : check.reason === 'already_accepted'
                ? '이미 사용된 초대'
                : '초대를 찾을 수 없음'}
          </p>
        </div>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-ink">
          이 링크로는 계정을 만들 수 없어요
        </h1>
        <p className="mt-4 text-base leading-relaxed text-body">{check.message}</p>
        <div className="mt-8 flex gap-3">
          <Link href="/login" className={buttonClass({ variant: 'secondary' })}>
            로그인 화면으로
          </Link>
          <Link href="/" className={buttonClass({ variant: 'text' })}>
            첫 화면
          </Link>
        </div>
      </div>
    )
  }

  const inv = check.invitation
  const orgName = inv.org_id ? ds.organizations.find((o) => o.id === inv.org_id)?.name : null
  const providerName = inv.provider_id
    ? ds.providers.find((p) => p.id === inv.provider_id)?.name
    : null

  return (
    <div className="mx-auto max-w-xl px-4 py-14 sm:px-6">
      <PageHeader
        eyebrow="초대"
        title="계정을 만들고 시작하세요"
        description="초대받은 이메일로 로그인 링크를 받으면 계정이 만들어집니다. 비밀번호는 쓰지 않습니다."
      />

      <dl className="mt-8 divide-y divide-line overflow-hidden rounded-lg border border-line bg-card text-sm">
        <div className="flex items-baseline justify-between gap-4 px-5 py-3.5">
          <dt className="text-sub">역할</dt>
          <dd>
            <Badge tone="point">{ROLE_LABEL[inv.role]}</Badge>
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-4 px-5 py-3.5">
          <dt className="text-sub">이메일</dt>
          <dd className="font-medium text-ink">{inv.email}</dd>
        </div>
        {orgName ? (
          <div className="flex items-baseline justify-between gap-4 px-5 py-3.5">
            <dt className="text-sub">소속 기관</dt>
            <dd className="font-medium text-ink">{orgName}</dd>
          </div>
        ) : null}
        {providerName ? (
          <div className="flex items-baseline justify-between gap-4 px-5 py-3.5">
            <dt className="text-sub">소속 업체</dt>
            <dd className="font-medium text-ink">{providerName}</dd>
          </div>
        ) : null}
        <div className="flex items-baseline justify-between gap-4 px-5 py-3.5">
          <dt className="text-sub">만료</dt>
          <dd className="text-body tabular-nums">
            {new Date(inv.expires_at).toLocaleString('ko-KR', {
              dateStyle: 'long',
              timeStyle: 'short',
            })}
          </dd>
        </div>
      </dl>

      <div className="mt-6 flex items-start gap-2.5 rounded-md border border-line bg-muted px-4 py-3 text-xs leading-relaxed text-body">
        <IconShield width={16} height={16} className="mt-0.5 shrink-0 text-sub" />
        <p>
          이 링크는 1회용입니다. 수락하면 더 이상 쓸 수 없고, 링크를 다른 사람과 공유하면 그 사람이
          {orgName ? ` ${orgName}의 ` : ' 해당 기관의 '}
          데이터를 볼 수 있게 됩니다.
        </p>
      </div>

      <div className="mt-8">
        <Link
          href={`/login?email=${encodeURIComponent(inv.email)}`}
          className={buttonClass({ variant: 'primary' })}
        >
          {inv.email} 로 로그인 링크 받기
        </Link>
      </div>
    </div>
  )
}
