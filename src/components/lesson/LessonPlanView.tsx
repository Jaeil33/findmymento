'use client'

import { useState } from 'react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Panel } from '@/components/ui/Section'
import type { LessonPlan, LessonStep } from '@/types/domain'

type Skeleton = Pick<LessonPlan, 'title' | 'objectives' | 'steps' | 'materials' | 'safety_notes'>

type Props = {
  sessionId: string
  initialPlan: Skeleton | null
  initialSource: 'llm' | 'rule' | null
  /** 이 교안에 반영된 지난 회차 응답 수. 0이면 아직 반영할 응답이 없다는 뜻이다. */
  initialPriorResponses: number
  /** 회차 조건 요약 — 무엇을 근거로 만드는지 버튼 옆에 그대로 보여준다. */
  conditions: string[]
  classTraits: string[]
  /** 데모 배포의 시연용 AI 응답 여부 (ADR-025). */
  demoAi?: boolean
}

/**
 * 교안 초안 화면.
 *
 * **"초안"이라는 사실을 화면에서 숨기지 않는다** (ADR-017). 최종 책임은 강사에게 있고,
 * 검토 없이 그대로 쓰도록 유도하는 문구를 쓰지 않는다. 특히 접근성 대응 문구는 틀리면
 * 현장에서 실제 피해가 생긴다.
 */
export function LessonPlanView({
  sessionId,
  initialPlan,
  initialSource,
  initialPriorResponses,
  conditions,
  classTraits,
  demoAi = false,
}: Props) {
  const [plan, setPlan] = useState<Skeleton | null>(initialPlan)
  const [source, setSource] = useState<'llm' | 'rule' | null>(initialSource)
  const [prior, setPrior] = useState(initialPriorResponses)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function generate() {
    setError(null)
    setPending(true)
    try {
      const res = await fetch('/api/lesson-plan', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      })
      const data = (await res.json()) as {
        ok: boolean
        message?: string
        source?: 'llm' | 'rule'
        priorResponses?: number
        plan?: Skeleton
      }
      if (!res.ok || !data.ok || !data.plan) {
        setError(data.message ?? '초안을 만들지 못했습니다.')
        return
      }
      setPlan(data.plan)
      setSource(data.source ?? 'rule')
      setPrior(data.priorResponses ?? 0)
    } catch {
      setError('인터넷 연결이 끊긴 것 같습니다. 다시 시도해 주세요.')
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="space-y-6">
      <Panel
        title="무엇을 근거로 만드나요"
        description="이 회차의 조건과 같은 기관·같은 분야의 지난 회차 응답을 씁니다."
      >
        <ul className="space-y-1.5 text-sm leading-relaxed text-body">
          {conditions.map((c) => (
            <li key={c}>· {c}</li>
          ))}
          <li className={prior > 0 ? 'font-medium text-ink' : 'text-sub'}>
            ·{' '}
            {prior > 0
              ? `지난 회차 응답 ${prior}건을 반영합니다`
              : '아직 반영할 지난 회차 응답이 없습니다 (5건 이상 모이면 반영됩니다)'}
          </li>
        </ul>

        {classTraits.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {classTraits.map((t) => (
              <Badge key={t} tone="caution">
                {t}
              </Badge>
            ))}
          </div>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button onClick={generate} disabled={pending}>
            {pending ? '만드는 중…' : plan ? '다시 만들기' : '교안 초안 만들기'}
          </Button>
          {source && (
            <span className="text-xs text-sub">
              {source === 'llm'
                ? demoAi
                  ? '시연용 AI 문장입니다'
                  : 'AI가 문장을 채웠습니다'
                : '기본 템플릿으로 만들었습니다'}
            </span>
          )}
        </div>

        {error && <p className="mt-3 text-sm text-negative">{error}</p>}
      </Panel>

      {plan && <PlanBody plan={plan} />}
    </div>
  )
}

function PlanBody({ plan }: { plan: Skeleton }) {
  const total = plan.steps.reduce((a, s) => a + s.minutes, 0)

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-caution/30 bg-caution-bg px-4 py-3 text-sm leading-relaxed text-body">
        <strong className="font-semibold text-ink">이것은 초안입니다.</strong> 그대로 쓰지 말고
        반드시 확인하세요. 특히 학급 특성에 대한 대응은 담당 선생님과 한 번 맞춰 보시기 바랍니다.
        수업의 최종 책임은 강사에게 있습니다.
      </div>

      <Panel title={plan.title} description={`총 ${total}분`}>
        <div className="space-y-1.5 text-sm leading-relaxed text-body">
          <p className="font-medium text-ink">학습 목표</p>
          {plan.objectives.map((o) => (
            <p key={o}>· {o}</p>
          ))}
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 text-sm leading-relaxed text-body">
            <p className="font-medium text-ink">준비물</p>
            {plan.materials.map((m) => (
              <p key={m}>· {m}</p>
            ))}
          </div>
          <div className="space-y-1.5 text-sm leading-relaxed text-body">
            <p className="font-medium text-ink">안전 수칙</p>
            {plan.safety_notes.map((s) => (
              <p key={s}>· {s}</p>
            ))}
          </div>
        </div>
      </Panel>

      <div className="space-y-4">
        {plan.steps.map((step, i) => (
          <StepCard key={`${step.phase}-${i}`} step={step} />
        ))}
      </div>
    </div>
  )
}

function StepCard({ step }: { step: LessonStep }) {
  return (
    <article className="rounded-xl border border-line bg-card p-5">
      <header className="mb-3 flex flex-wrap items-center gap-2">
        <Badge tone={step.phase === '마무리' ? 'point' : 'neutral'}>{step.phase}</Badge>
        <h3 className="text-base font-semibold tracking-tight text-ink">{step.title}</h3>
        <span className="text-sm text-sub">{step.minutes}분</span>
      </header>

      <p className="text-sm leading-relaxed text-body">{step.base}</p>

      <dl className="mt-3 grid gap-2 text-sm leading-relaxed sm:grid-cols-2">
        <div className="rounded-lg bg-muted px-3 py-2">
          <dt className="text-xs font-medium text-sub">빨리 끝낸 학생</dt>
          <dd className="text-body">{step.fast}</dd>
        </div>
        <div className="rounded-lg bg-muted px-3 py-2">
          <dt className="text-xs font-medium text-sub">어려워하는 학생</dt>
          <dd className="text-body">{step.slow}</dd>
        </div>
      </dl>

      {step.accommodations.length > 0 && (
        <dl className="mt-2 space-y-2 text-sm leading-relaxed">
          {step.accommodations.map((a) => (
            <div key={a.trait} className="rounded-lg border border-caution/30 bg-caution-bg px-3 py-2">
              <dt className="text-xs font-medium text-sub">{a.trait}</dt>
              <dd className="text-body">{a.how}</dd>
            </div>
          ))}
        </dl>
      )}
    </article>
  )
}
