import { Badge } from '@/components/ui/Badge'
import { Panel } from '@/components/ui/Section'
import type { LessonPackage, VerificationState } from '@/types/studio'

/**
 * 수업 패키지 화면 — **무엇이 검증됐고 무엇이 아직 아닌지를 먼저 적는다** (개발명세서 §6).
 *
 * 이 화면이 지켜야 하는 것:
 * - **기하 통과를 수업 검증으로 적지 않는다.** 네 가지(기하·시간·주제 일치·현장)를 따로 적고,
 *   추정은 "추정" 이라고 쓴다. 한 줄로 합쳐 "검증 완료" 라고 쓰면 그게 거짓말이 된다
 * - 입력으로 알 수 없는 것은 **확인 항목으로 보여준다.** 숨기면 강사가 교실에서 발견한다
 * - 문장을 누가 썼는지 적는다 — 미리 써 둔 문장을 실시간 AI 가 쓴 것처럼 보이게 두지 않는다
 *   (ADR-025·044)
 */

const VERIFICATION_ROWS: {
  key: keyof Omit<VerificationState, 'unconfirmed'>
  label: string
  value: Record<string, { tone: 'positive' | 'caution' | 'negative'; text: string }>
}[] = [
  {
    key: 'geometry',
    label: '기하·물리 검증',
    value: {
      passed: { tone: 'positive', text: '통과 — 선 간격·선분·내각·A4·시간 전수 검사' },
      failed: { tone: 'negative', text: '실패 — 걸린 항목은 위 검증 결과에 있습니다' },
    },
  },
  {
    key: 'time',
    label: '제작 시간',
    value: {
      calibrated: { tone: 'positive', text: '지난 수업 실측으로 보정한 값입니다' },
      estimated: { tone: 'caution', text: '추정값입니다 — 실제로 재어 본 시간이 아닙니다' },
      unknown: { tone: 'caution', text: '계산할 수 없었습니다' },
    },
  },
  {
    key: 'topic_match',
    label: '주제 일치',
    value: {
      reviewed: { tone: 'positive', text: '사람이 검수한 모양이고 주제와 같은 단어입니다' },
      needs_review: { tone: 'caution', text: '인쇄 전에 모양이 주제에 맞는지 확인해 주세요' },
    },
  },
  {
    key: 'field',
    label: '현장 결과',
    value: {
      verified: { tone: 'positive', text: '같은 도안·학년대의 수업 결과가 쌓여 있습니다' },
      unverified: { tone: 'caution', text: '아직 수업에서 써 본 기록이 없습니다' },
    },
  },
]

const AUTHOR_LABEL: Record<LessonPackage['authored_by'], string> = {
  pack: '미리 만들어 둔 도안의 문장입니다 (이번에 생성한 문장이 아닙니다)',
  llm: 'AI가 이번 요청을 읽고 문장을 썼습니다',
  demo: '시연용 AI 문장입니다',
  rule: '규칙이 만든 문장입니다',
}

export function VerificationPanel({ pkg }: { pkg: LessonPackage }) {
  return (
    <Panel
      title="무엇이 검증됐는가"
      description="기하 검증을 통과한 것이 수업 전체가 검증됐다는 뜻은 아닙니다. 항목별로 따로 적습니다."
    >
      <ul className="divide-y divide-line">
        {VERIFICATION_ROWS.map((row) => {
          const state = pkg.verification[row.key]
          const cell = row.value[state]
          if (!cell) return null
          return (
            <li key={row.key} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2.5 first:pt-0">
              <span className="w-28 shrink-0 text-sm font-semibold text-ink">{row.label}</span>
              <Badge tone={cell.tone}>
                {cell.tone === 'positive' ? '확인됨' : cell.tone === 'negative' ? '실패' : '확인 필요'}
              </Badge>
              <span className="text-sm leading-relaxed text-body">{cell.text}</span>
            </li>
          )
        })}
      </ul>

      {pkg.verification.unconfirmed.length > 0 ? (
        <div className="mt-4 border-t border-line pt-4">
          <p className="text-sm font-semibold text-ink">입력으로 알 수 없어 확인이 필요한 것</p>
          <ul className="mt-2 space-y-1.5">
            {pkg.verification.unconfirmed.map((item, i) => (
              <li key={i} className="text-sm leading-relaxed text-body">
                · {item}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4">
        <Badge tone="neutral">{AUTHOR_LABEL[pkg.authored_by]}</Badge>
        {pkg.evidence.map((e, i) => (
          <Badge key={i} tone="neutral">
            출처 {e.source_id}
            {e.license ? ` · ${e.license}` : ''}
            {e.attribution && !e.license ? ` · ${e.attribution}` : ''}
          </Badge>
        ))}
      </div>
    </Panel>
  )
}

export function StudentGuidePanel({ pkg }: { pkg: LessonPackage }) {
  return (
    <Panel
      title="학생용 사용법"
      description="단계마다 어느 부품을 쓰는지 도안의 번호와 같습니다. 그대로 읽어 주셔도 됩니다."
    >
      <ol className="space-y-3">
        {pkg.student_guide.map((step) => (
          <li key={step.step} className="flex gap-3">
            <span className="mt-0.5 shrink-0 rounded bg-muted px-1.5 text-xs font-semibold tabular-nums text-sub">
              {step.step}
            </span>
            <div className="min-w-0">
              <p className="text-sm leading-relaxed text-body">{step.text}</p>
              {step.caution ? (
                <p className="mt-1 text-xs leading-relaxed text-caution">주의 · {step.caution}</p>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </Panel>
  )
}

export function LessonPlanPanel({
  pkg,
  durationMinutes,
}: {
  pkg: LessonPackage
  durationMinutes: number
}) {
  const plan = pkg.lesson_plan
  const blocks = [
    { label: '도입', value: plan.intro_minutes },
    { label: '안전·시범', value: plan.demo_minutes },
    { label: '제작 실습', value: plan.making_minutes },
    { label: '정리·발표', value: plan.wrap_minutes },
  ]

  return (
    <Panel
      title="강사용 수업 지도안"
      description={`수업 ${durationMinutes}분을 네 칸으로 나눈 값입니다. 합은 수업 시간과 같습니다.`}
    >
      {pkg.objectives.length > 0 ? (
        <div className="mb-4">
          <p className="text-sm font-semibold text-ink">수업 목표</p>
          <ul className="mt-1.5 space-y-1">
            {pkg.objectives.map((objective, i) => (
              <li key={i} className="text-sm leading-relaxed text-body">
                · {objective}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {blocks.map((block) => (
          <div key={block.label} className="rounded-sm border border-line bg-muted px-3 py-2">
            <p className="text-xs text-sub">{block.label}</p>
            <p className="text-sm font-semibold tabular-nums text-ink">{block.value}분</p>
          </div>
        ))}
      </div>

      <ul className="mt-4 space-y-1.5">
        {pkg.lesson_notes.map((note, i) => (
          <li key={i} className="text-sm leading-relaxed text-body">
            · {note}
          </li>
        ))}
      </ul>

      <div className="mt-4 border-t border-line pt-4">
        <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-ink">
          장비 운영
          {pkg.equipment_plan.pen_count !== null ? (
            <Badge tone="neutral">
              3D펜 {pkg.equipment_plan.pen_count}자루 · 교대 {pkg.equipment_plan.rotations}조
            </Badge>
          ) : (
            <Badge tone="caution">수량 확인 필요</Badge>
          )}
        </p>
        <ul className="mt-2 space-y-1.5">
          {pkg.equipment_plan.notes.map((note, i) => (
            <li key={i} className="text-sm leading-relaxed text-body">
              · {note}
            </li>
          ))}
        </ul>
      </div>
    </Panel>
  )
}
