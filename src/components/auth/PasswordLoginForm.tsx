import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'

const ERROR_TEXT: Record<string, string> = {
  password: '아이디 또는 비밀번호가 맞지 않아요.',
  no_role: '로그인은 됐지만 연결된 기관·강사 정보가 없어요. 운영자에게 알려 주세요.',
  '1': '지금은 로그인할 수 없어요. 잠시 뒤 다시 시도해 주세요.',
}

/**
 * 아이디·비밀번호 로그인. 서버 액션으로 보낸다 — 비밀번호를 브라우저 저장소에 두지 않는다.
 * 아이디가 틀렸는지 비밀번호가 틀렸는지 구분해서 알려 주지 않는다 (등록된 아이디 노출 방지).
 */
export function PasswordLoginForm({
  action,
  enabled,
  error,
}: {
  action: (formData: FormData) => Promise<void>
  enabled: boolean
  error?: string
}) {
  const message = error ? (ERROR_TEXT[error] ?? ERROR_TEXT['1']) : null

  return (
    <form action={action} className="space-y-4">
      <Input
        label="아이디"
        name="loginId"
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        disabled={!enabled}
        hint={enabled ? undefined : '지금은 데모 데이터 모드라 로그인이 동작하지 않습니다.'}
      />
      <Input label="비밀번호" name="password" type="password" autoComplete="current-password" disabled={!enabled} />
      {message ? (
        <p role="alert" className="text-sm text-negative">
          {message}
        </p>
      ) : null}
      <Button type="submit" disabled={!enabled}>
        로그인
      </Button>
    </form>
  )
}
