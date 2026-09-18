import Link from 'next/link'
import { PageHeader } from '@/components/ui/Section'
import { PasswordLoginForm } from '@/components/auth/PasswordLoginForm'
import { isDemoMode, isSupabaseConfigured } from '@/lib/supabase/env'
import { demoActorKeys, demoActorLabel } from '@/lib/auth/actor'
import { demoGuestEntries } from '@/lib/demo/guests'
import { enterDemo, signInWithPassword } from './actions'
import { IconArrowRight } from '@/components/ui/Icons'

export const metadata = { title: '로그인' }

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams

  return (
    <div className="mx-auto max-w-xl px-4 py-12 sm:px-6">
      <PageHeader
        eyebrow="담당자 · 강사"
        title="로그인"
        description={
          <>
            공개 회원가입이 없습니다. 기관·학교 담당자, 강사, 운영자 계정은 초대 링크로만
            만들어집니다. 보호자는 계정 없이{' '}
            <Link href="/inquiry" className="text-point underline underline-offset-4">
              문의 폼
            </Link>
            만 쓰시면 됩니다.
          </>
        }
      />

      <div className="mt-8">
        <PasswordLoginForm action={signInWithPassword} enabled={isSupabaseConfigured()} error={error} />
      </div>

      {isDemoMode() ? (
        <section className="mt-10 rounded-lg border border-caution/30 bg-caution-bg p-5">
          <h2 className="text-sm font-semibold text-caution">데모 데이터 모드</h2>
          <p className="mt-1.5 text-sm leading-relaxed text-body">
            Supabase 키가 설정되지 않아 데모 데이터로 동작하고 있습니다. 아래에서 둘러볼 사람을 골라
            주세요. 실제 계정 연결 뒤에는 이 블록이 사라지고 아이디·비밀번호 로그인만 남습니다.
          </p>

          <h3 className="mt-5 text-xs font-semibold text-ink">계정으로 들어가는 사람</h3>
          <ul className="mt-2 space-y-2">
            {demoActorKeys().map((key) => (
              <li key={key}>
                <form action={enterDemo}>
                  <input type="hidden" name="actor" value={key} />
                  <button
                    type="submit"
                    className="flex w-full items-center justify-between rounded-md border border-line bg-card px-4 py-3 text-left text-sm transition-colors hover:border-line-strong hover:bg-muted"
                  >
                    <span className="font-medium text-ink">{demoActorLabel(key)}</span>
                    <IconArrowRight className="text-sub" />
                  </button>
                </form>
              </li>
            ))}
          </ul>

          {/* 학생·보호자는 역할 버튼이 아니다 — 쿠키를 심지 않고 실서비스와 같은 비로그인 경로로 연다. */}
          <h3 className="mt-6 text-xs font-semibold text-ink">계정 없이 쓰는 사람</h3>
          <p className="mt-1 text-xs leading-relaxed text-body">
            학생과 보호자는 계정을 만들지 않습니다. 학생은 기관이 나눠 준 가명코드로, 보호자는 비로그인
            문의 폼으로만 들어옵니다. 실제 서비스와 같은 경로로 바로 엽니다.
          </p>
          <ul className="mt-2 space-y-2">
            {demoGuestEntries().map((entry) => (
              <li key={entry.key}>
                <Link
                  href={entry.href}
                  className="flex w-full items-center justify-between gap-3 rounded-md border border-line bg-card px-4 py-3 text-left text-sm transition-colors hover:border-line-strong"
                >
                  <span className="min-w-0">
                    <span className="block font-medium text-ink">{entry.label}</span>
                    <span className="mt-0.5 block text-xs leading-relaxed text-body">{entry.description}</span>
                    <span className="mt-1 block text-xs leading-relaxed text-sub">{entry.hint}</span>
                  </span>
                  <IconArrowRight className="shrink-0 text-sub" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <p className="mt-8 text-xs leading-relaxed text-sub">
        아이디가 없거나 비밀번호를 잊으셨다면 운영자에게 알려 주세요. 계정은 운영자가 만들어 드립니다.
      </p>
    </div>
  )
}
