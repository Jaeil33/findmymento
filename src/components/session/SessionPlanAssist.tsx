'use client'

import { useRef, useState } from 'react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Panel } from '@/components/ui/Section'
import type { SessionPlanDraft } from '@/types/domain'

/**
 * 회차 기획 도우미 (ADR-021).
 *
 * 폼 안에 들어가서 **이미 입력된 값을 읽고, 결과를 같은 폼에 채워 넣는다.** 별도 화면을 만들지
 * 않는 이유는 담당자가 회차를 만들려고 이미 여기 와 있기 때문이다.
 *
 * JS 가 꺼져 있어도 회차 생성 폼 자체는 그대로 동작한다 — 이 컴포넌트는 보조일 뿐이다.
 */
export function SessionPlanAssist({ demoAi = false }: { demoAi?: boolean } = {}) {
  const anchor = useRef<HTMLDivElement>(null)
  const [draft, setDraft] = useState<SessionPlanDraft | null>(null)
  const [source, setSource] = useState<'llm' | 'rule' | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function form(): HTMLFormElement | null {
    return anchor.current?.closest('form') ?? null
  }

  function value(name: string): string {
    const el = form()?.elements.namedItem(name)
    return el instanceof HTMLInputElement || el instanceof HTMLSelectElement ? el.value : ''
  }

  async function suggest() {
    setError(null)
    setPending(true)
    try {
      const res = await fetch('/api/session-plan', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          gradeBand: value('gradeBand') || 'middle',
          expectedStudents: Number(value('expectedStudents') || 30),
          durationMinutes: Number(value('durationMinutes') || 50),
          purpose: value('title') || null,
        }),
      })
      const data = (await res.json()) as {
        ok: boolean
        message?: string
        source?: 'llm' | 'rule'
        draft?: SessionPlanDraft
      }
      if (!res.ok || !data.ok || !data.draft) {
        setError(data.message ?? '제안을 만들지 못했습니다.')
        return
      }
      setDraft(data.draft)
      setSource(data.source ?? 'rule')
    } catch {
      setError('인터넷 연결이 끊긴 것 같습니다. 다시 시도해 주세요.')
    } finally {
      setPending(false)
    }
  }

  function applyToForm() {
    if (!draft?.suggested_field) return
    const f = form()
    if (!f) return
    const title = f.elements.namedItem('title')
    const field = f.elements.namedItem('field')
    if (title instanceof HTMLInputElement && title.value.trim() === '') {
      title.value = draft.suggested_title
    }
    if (field instanceof HTMLSelectElement) field.value = draft.suggested_field
  }

  return (
    <div ref={anchor}>
      <Panel
        title="어떤 특강을 열지 모르겠다면"
        description="학년·인원·시수를 먼저 채우면 관내 공급을 보고 제안해 드립니다."
      >
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="secondary" onClick={suggest} disabled={pending}>
            {pending ? '보는 중…' : '관내 공급 보고 제안받기'}
          </Button>
          {source && (
            <span className="text-xs text-sub">
              {source === 'llm'
                ? demoAi
                  ? '시연용 AI 문장입니다'
                  : 'AI가 문장을 정리했습니다'
                : '공급 현황으로 계산했습니다'}
            </span>
          )}
        </div>

        {error && <p className="mt-3 text-sm text-negative">{error}</p>}

        {draft && (
          <div className="mt-4 space-y-4 border-t border-line pt-4">
            <p className="text-sm leading-relaxed text-body">{draft.rationale}</p>

            {draft.suggested_field && (
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="point">{draft.suggested_field}</Badge>
                <span className="text-sm text-body">{draft.suggested_title}</span>
                <Button type="button" variant="text" onClick={applyToForm}>
                  이 제안으로 폼 채우기
                </Button>
              </div>
            )}

            {draft.instructor_requirements.length > 0 && (
              <div className="space-y-1.5 text-sm leading-relaxed text-body">
                <p className="font-medium text-ink">강사에게 요구할 조건</p>
                {draft.instructor_requirements.map((r) => (
                  <p key={r}>· {r}</p>
                ))}
              </div>
            )}

            {draft.preparations.length > 0 && (
              <div className="space-y-1.5 text-sm leading-relaxed text-body">
                <p className="font-medium text-ink">기관이 미리 준비할 것</p>
                {draft.preparations.map((p) => (
                  <p key={p}>· {p}</p>
                ))}
              </div>
            )}

            {draft.unmet.length > 0 && (
              <div className="rounded-lg border border-caution/30 bg-caution-bg px-3.5 py-3 text-sm leading-relaxed text-body">
                <p className="font-medium text-ink">지금은 열 수 없지만, 수요는 있습니다</p>
                {draft.unmet.map((u) => (
                  <p key={u.field}>
                    · {u.field} 관심 {u.interest_count}명 · 관내 공급 0
                  </p>
                ))}
                <p className="mt-2 text-xs text-sub">
                  예산 기안과 신규 강사 발굴의 근거로 그대로 쓰실 수 있는 숫자입니다.
                </p>
              </div>
            )}
          </div>
        )}
      </Panel>
    </div>
  )
}
