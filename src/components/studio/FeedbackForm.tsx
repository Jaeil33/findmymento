'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { DIFFICULTY_VOTE_LABEL, DIFFICULTY_VOTES, type DifficultyVote } from '@/types/studio'

/**
 * 수업 후 성과 입력. **회차 단위 집계만 받는다** (ADR-032).
 *
 * 학생 이름을 적는 칸이 없다. 만들지 말 것 — 누가 완성하지 못했는지는 이 플랫폼에 들어오지
 * 않는다. 입력란을 열어 두면 친절한 강사가 적는다.
 */
export function FeedbackForm({ contentId, estimatedMinutes }: { contentId: string; estimatedMinutes: number }) {
  const router = useRouter()
  const [attempted, setAttempted] = useState('')
  const [completed, setCompleted] = useState('')
  const [minutes, setMinutes] = useState(String(Math.round(estimatedMinutes)))
  const [vote, setVote] = useState<DifficultyVote>('right')
  const [note, setNote] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  async function submit() {
    setPending(true)
    setError(null)
    try {
      const response = await fetch('/api/studio/feedback', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          contentId,
          attemptedCount: Number(attempted),
          completedCount: Number(completed),
          actualMinutes: Number(minutes),
          difficultyVote: vote,
          note: note.trim() === '' ? null : note.trim(),
        }),
      })
      const json = (await response.json()) as { ok?: boolean; message?: string }
      if (!response.ok || !json.ok) {
        setError(json.message ?? '저장하지 못했습니다.')
        return
      }
      setDone(true)
      router.refresh()
    } catch {
      setError('인터넷 연결이 끊긴 것 같습니다.')
    } finally {
      setPending(false)
    }
  }

  if (done) {
    return (
      <p className="rounded-md border border-positive/20 bg-positive-bg px-3 py-2 text-sm text-positive">
        기록했습니다. 같은 도안·같은 학년대로 세 번 이상 모이면 다음 생성의 제작 시간 계산에
        반영됩니다.
      </p>
    )
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (!pending) void submit()
      }}
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <Input
          label="시도한 학생 수"
          type="number"
          min={1}
          max={200}
          value={attempted}
          onChange={(e) => setAttempted(e.target.value)}
          required
        />
        <Input
          label="완성한 학생 수"
          type="number"
          min={0}
          max={200}
          value={completed}
          onChange={(e) => setCompleted(e.target.value)}
          required
        />
        <Input
          label="실제 걸린 시간 (분)"
          type="number"
          min={1}
          max={600}
          value={minutes}
          onChange={(e) => setMinutes(e.target.value)}
          required
        />
      </div>

      <Select
        label="체감 난이도"
        value={vote}
        onChange={(e) => setVote(e.target.value as DifficultyVote)}
        options={DIFFICULTY_VOTES.map((v) => ({ value: v, label: DIFFICULTY_VOTE_LABEL[v] }))}
      />

      <Textarea
        label="수정 의견 (선택)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={3}
        maxLength={500}
        hint="도안을 어떻게 바꾸면 좋을지 적어 주세요. 학생 이름은 적지 않아도 되고, 적어도 저장할 때 가려집니다."
      />

      {error ? (
        <p className="rounded-md border border-negative/20 bg-negative-bg px-3 py-2 text-sm text-negative">
          {error}
        </p>
      ) : null}

      <Button type="submit" disabled={pending || attempted === '' || completed === ''}>
        {pending ? '기록 중' : '수업 결과 기록'}
      </Button>
    </form>
  )
}
