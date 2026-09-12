'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Input, Textarea } from '@/components/ui/Input'
import { FIELDS, GRADE_BAND_LABEL, type Field, type GradeBand } from '@/types/domain'
import { IconCheck } from '@/components/ui/Icons'

const BANDS: GradeBand[] = ['elementary', 'middle', 'high']

/**
 * Q&A 질문 작성.
 *
 * **공개 범위 고지를 입력란 바로 위에 둔다.** 작은 회색 각주로 숨기지 않는다
 * (UI_GUIDE 안전규칙 3). 연락처·링크는 서버에서 차단된다 (E-09).
 */
export function QuestionForm({ defaultField }: { defaultField?: string }) {
  const router = useRouter()
  const [gradeBand, setGradeBand] = useState<GradeBand | ''>('')
  const [field, setField] = useState<Field | ''>(
    (FIELDS as readonly string[]).includes(defaultField ?? '') ? (defaultField as Field) : '',
  )
  const [entryCode, setEntryCode] = useState('')
  const [body, setBody] = useState('')
  const [error, setError] = useState<{ field?: string; message: string } | null>(null)
  const [pending, setPending] = useState(false)
  const [done, setDone] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setPending(true)
    try {
      const res = await fetch('/api/qna', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ gradeBand, field, body, entryCode: entryCode || null }),
      })
      const data = (await res.json()) as { ok: boolean; field?: string; message?: string; alias?: string }
      if (!res.ok || !data.ok) {
        setError({ field: data.field, message: data.message ?? '올리지 못했어요.' })
        return
      }
      setDone(data.alias ?? null)
      setTimeout(() => router.push('/qna'), 1600)
    } catch {
      setError({ message: '인터넷 연결이 끊긴 것 같아요. 다시 시도해 주세요.' })
    } finally {
      setPending(false)
    }
  }

  if (done) {
    return (
      <div className="animate-fade-in rounded-lg border border-point-line bg-point-bg px-5 py-4">
        <p className="flex items-center gap-1.5 text-sm font-medium text-point">
          <IconCheck width={16} height={16} />
          질문을 올렸어요
        </p>
        <p className="mt-1.5 text-sm leading-relaxed text-body">
          {done ? `${done} 이름으로 올라갔어요. ` : ''}지역 강사가 확인하면 답변이 달려요. 답변은
          Q&amp;A 목록에서 볼 수 있어요.
        </p>
      </div>
    )
  }

  const fieldError = (name: string) => (error?.field === name ? error.message : undefined)

  return (
    <form onSubmit={submit} className="space-y-6" noValidate>
      <fieldset>
        <legend className="text-sm font-medium text-body">
          학년대 <span className="text-negative">*</span>
        </legend>
        <p className="mt-1 text-xs text-sub">
          화면에는 `중등 학생 A` 처럼만 표시돼요. 학년·이름은 공개되지 않아요.
        </p>
        <div className="mt-2.5 flex flex-wrap gap-2">
          {BANDS.map((b) => (
            <Chip key={b} selected={gradeBand === b} onClick={() => setGradeBand(b)}>
              {GRADE_BAND_LABEL[b]}
            </Chip>
          ))}
        </div>
        {fieldError('gradeBand') ? (
          <p className="mt-1.5 text-xs text-negative">{fieldError('gradeBand')}</p>
        ) : null}
      </fieldset>

      <fieldset>
        <legend className="text-sm font-medium text-body">
          분야 <span className="text-negative">*</span>
        </legend>
        <div className="mt-2.5 flex flex-wrap gap-2">
          {FIELDS.map((f) => (
            <Chip key={f} selected={field === f} onClick={() => setField(f)}>
              {f}
            </Chip>
          ))}
        </div>
        {fieldError('field') ? (
          <p className="mt-1.5 text-xs text-negative">{fieldError('field')}</p>
        ) : null}
      </fieldset>

      <Textarea
        label="질문"
        required
        size="student"
        maxLength={500}
        counter={{ value: body.length, max: 500 }}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        notice="이 질문은 모두에게 공개되며 기관 선생님도 봅니다. 이름·연락처·학교는 쓰지 마세요."
        error={fieldError('body')}
        placeholder="예) 드론 자격증은 몇 살부터 딸 수 있어요?"
      />

      <Input
        label="참여 코드 (선택)"
        inputMode="numeric"
        maxLength={6}
        value={entryCode}
        onChange={(e) => setEntryCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
        hint="특강에서 받은 6자리 코드를 넣으면 그 기관 선생님이 함께 확인해요."
      />

      {error && !error.field ? (
        <p className="rounded-md border border-negative/25 bg-negative-bg px-4 py-3 text-sm text-negative">
          {error.message}
        </p>
      ) : null}

      <Button type="submit" size="student" disabled={pending}>
        {pending ? '올리고 있어요' : '질문 올리기'}
      </Button>
    </form>
  )
}
