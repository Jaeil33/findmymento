import Link from 'next/link'
import { PageHeader } from '@/components/ui/Section'
import { MagicLinkForm } from '@/components/auth/MagicLinkForm'
import { isDemoMode, isSupabaseConfigured } from '@/lib/supabase/env'
import { demoActorKeys, demoActorLabel } from '@/lib/auth/actor'
import { enterDemo } from './actions'
import { IconArrowRight } from '@/components/ui/Icons'

export const metadata = { title: '로그인' }

export default function LoginPage() {
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
        <MagicLinkForm enabled={isSupabaseConfigured()} />
      </div>

      {isDemoMode() ? (
        <section className="mt-10 rounded-lg border border-caution/30 bg-caution-bg p-5">
          <h2 className="text-sm font-semibold text-caution">데모 데이터 모드</h2>
          <p className="mt-1.5 text-sm leading-relaxed text-body">
            Supabase 키가 설정되지 않아 데모 데이터로 동작하고 있습니다. 아래에서 역할을 골라 화면을
            둘러보실 수 있습니다. 실제 계정 연결 뒤에는 이 블록이 사라지고 이메일 로그인만 남습니다.
          </p>

          <ul className="mt-4 space-y-2">
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
        </section>
      ) : null}

      <p className="mt-8 text-xs leading-relaxed text-sub">
        초대 메일을 받으셨다면 메일 안의 링크로 먼저 계정을 만들어 주세요. 초대 링크는 1회용이고
        만료 시각이 있습니다.
      </p>
    </div>
  )
}
