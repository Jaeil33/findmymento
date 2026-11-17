'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'

/**
 * 강사 승인. **검증을 통과한 산출물에서만 보여준다** — 실패한 산출물에 이 버튼이 보이면
 * 강사는 "그래도 쓸 수 있나 보다"로 읽는다 (ADR-030). 서버와 DB 트리거가 한 번 더 막지만,
 * 버튼을 보여주지 않는 것이 첫 번째 방어선이다.
 */
export function ApproveButton({ id }: { id: string }) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function approve() {
    setPending(true)
    setError(null)
    try {
      const response = await fetch('/api/studio/approve', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      const json = (await response.json()) as { ok?: boolean; message?: string }
      if (!response.ok || !json.ok) {
        setError(json.message ?? '승인하지 못했습니다.')
        return
      }
      router.refresh()
    } catch {
      setError('인터넷 연결이 끊긴 것 같습니다.')
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button onClick={() => void approve()} disabled={pending}>
        {pending ? '승인 중' : '확인했습니다 — 수업에 쓰기'}
      </Button>
      {error ? <span className="text-xs text-negative">{error}</span> : null}
    </div>
  )
}
