'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { getBrowserSupabase } from '@/lib/supabase/client'

/**
 * 이메일 매직링크 로그인. 비밀번호를 저장하지 않는다.
 *
 * 셀프 가입이 없으므로 **초대받지 않은 이메일로는 계정이 생기지 않는다.** 다만 화면에서
 * "그 이메일은 등록되지 않았습니다"라고 알려주지 않는다 — 어떤 이메일이 등록돼 있는지
 * 알려주는 것과 같기 때문이다. 성공·실패 모두 같은 안내를 보여준다.
 */
export function MagicLinkForm({ enabled }: { enabled: boolean }) {
  const [email, setEmail] = useState('')
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const sb = getBrowserSupabase()
    if (!sb) {
      setState('error')
      return
    }
    setState('sending')
    const { error } = await sb.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/login/callback` },
    })
    setState(error ? 'error' : 'sent')
  }

  if (state === 'sent') {
    return (
      <div className="rounded-lg border border-point-line bg-point-bg px-5 py-4">
        <p className="text-sm font-medium text-ink">메일을 확인해 주세요</p>
        <p className="mt-1.5 text-sm leading-relaxed text-body">
          등록된 계정이라면 <span className="font-medium">{email}</span> 으로 로그인 링크를
          보냈습니다. 링크는 잠시 뒤 만료됩니다.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Input
        label="이메일"
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        autoComplete="email"
        placeholder="초대받은 이메일 주소"
        disabled={!enabled}
        hint={enabled ? undefined : '지금은 데모 데이터 모드라 메일 로그인이 동작하지 않습니다.'}
      />
      <Button type="submit" disabled={!enabled || state === 'sending'}>
        {state === 'sending' ? '보내고 있어요' : '로그인 링크 받기'}
      </Button>
      {state === 'error' ? (
        <p className="text-sm text-negative">
          지금은 로그인 링크를 보낼 수 없어요. 잠시 후 다시 시도해 주세요.
        </p>
      ) : null}
    </form>
  )
}
