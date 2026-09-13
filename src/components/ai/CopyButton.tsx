'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'

type Status = 'idle' | 'copied' | 'failed'

const MESSAGE: Record<Status, string> = {
  idle: '',
  copied: '복사했습니다',
  failed: '복사하지 못했습니다. 직접 선택해 복사해 주세요.',
}

/**
 * 복사 버튼. 수업 후 AI 초안은 저장하지 않으므로 가져가는 방법은 복사뿐이다 (ADR-024).
 * 클립보드 외의 곳(브라우저 저장소·쿠키)에 초안을 남기지 않는다.
 */
export function CopyButton({ text, label }: { text: string; label: string }) {
  const [status, setStatus] = useState<Status>('idle')

  // 초안을 다시 만들면 이전 결과 문구를 지운다 — 새 문안을 이미 복사한 것처럼 보이면 안 된다.
  useEffect(() => {
    setStatus('idle')
  }, [text])

  async function copy() {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable')
      await navigator.clipboard.writeText(text)
      setStatus('copied')
    } catch {
      setStatus('failed')
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="secondary" onClick={copy}>
        {label}
      </Button>
      <span
        role="status"
        className={status === 'failed' ? 'text-sm text-negative' : 'text-sm text-positive'}
      >
        {MESSAGE[status]}
      </span>
    </div>
  )
}
