import { Badge } from '@/components/ui/Badge'
import { PEN_LIMITS } from '@/lib/studio/constants'
import { GRADE_BAND_LABEL, type GradeBand } from '@/types/domain'
import type { Finding, StudioRound, StudioStatus } from '@/types/studio'

/**
 * 생성 → 검증 → 개선 → 재검증의 **전 과정을 그대로 보여준다** (ADR-030).
 *
 * "AI가 만들어 줬다"는 강사가 신뢰할 근거가 못 된다. "간격 2.4mm 로 미달 → 1.15배 확대 →
 * 3.1mm 통과"는 근거가 된다. 그래서 라운드를 접어 두거나 요약하지 않는다.
 *
 * 화면의 모양은 **검사 성적서**다 — 무슨 기준으로 쟀는지가 맨 위에 있고, 각 회차가 아래로
 * 쌓이고, 걸린 항목마다 측정값과 기준값이 나란히 있다.
 *
 * 실패한 경우에는 **무엇을 바꾸면 되는지**를 같이 보여준다. 실패 화면에서 다음 행동이 없으면
 * 강사는 이 도구를 다시 열지 않는다.
 */

/** 걸린 항목별로 강사가 할 수 있는 조치. 코드마다 하나씩, 추측하지 않고 실제로 효과가 있는 것만. */
const NEXT_ACTION: Record<string, string> = {
  PEN_EQUIPMENT_MISSING: '회차의 장비 목록에 3D펜과 필라멘트를 추가한 뒤 다시 만들어 주세요.',
  PEN_TIME_OVER: '수업 시간을 늘리거나, 더 단순한 도안을 고르거나, 학년대를 올려 주세요.',
  PEN_TOO_MANY_PARTS: '부품이 적은 도안을 고르거나 학년대를 올려 주세요.',
  PEN_GAP_TOO_SMALL: '도안을 더 크게 만들 수 있는 조건(시간 여유)이 필요합니다.',
  PEN_SEGMENT_TOO_SHORT: '도안을 더 크게 만들 수 있는 조건(시간 여유)이 필요합니다.',
  PEN_ANGLE_TOO_SHARP: '다른 도안을 고르거나 학년대를 올려 주세요.',
  PEN_PART_OUT_OF_PAGE: '부품이 A4 한 장에 들어가지 않습니다. 더 작은 도안을 고르세요.',
  PEN_DIFFICULTY_MISMATCH: '일부러 고른 것이면 그대로 쓰셔도 됩니다.',
  PEN_TIME_TIGHT: '먼저 끝낸 학생에게 줄 과제를 하나 준비해 주세요.',
  PEN_SELF_INTERSECT: '모양이 꼬였습니다. 주제를 더 단순한 단어로 적어 다시 만들어 주세요.',
  PEN_SHAPE_UNREVIEWED: '인쇄 전에 아래 미리보기에서 모양을 한 번 확인해 주세요.',
  PEN_SHAPE_UNRECOGNIZED:
    '주제를 더 단순한 단어로 적으면 모양이 또렷해집니다. 지금 모양이 괜찮으면 그대로 쓰셔도 됩니다.',
  PEN_SHAPE_UNAVAILABLE: '주제를 더 일반적인 단어로 적어 보거나, 3D 로 바꿔 만들어 주세요.',
  PEN_FLAT_NO_SILHOUETTE: '2D 는 떼어낼 수 있는 닫힌 윤곽이 필요합니다. 다른 주제로 만들어 주세요.',
  PEN_LAYER_COUNT_INVALID: '수업 시간을 늘리거나 2D 로 만들어 주세요.',
}

function FindingRow({ finding }: { finding: Finding }) {
  const action = NEXT_ACTION[finding.code]
  const blocking = finding.severity === 'error'

  return (
    <li className={`border-l-2 py-2.5 pl-3 ${blocking ? 'border-negative' : 'border-caution'}`}>
      <p className="flex flex-wrap items-baseline gap-x-2 text-sm leading-relaxed">
        <span className={`font-semibold ${blocking ? 'text-negative' : 'text-caution'}`}>
          {blocking ? '막음' : '주의'}
        </span>
        <span className="text-body">{finding.message}</span>
      </p>

      {finding.measured !== undefined ? (
        <p className="mt-1 flex flex-wrap items-baseline gap-x-3 text-sm tabular-nums">
          <span className="font-semibold text-ink">측정 {finding.measured}</span>
          {finding.limit !== undefined ? (
            <span className="text-sub">기준 {finding.limit}</span>
          ) : null}
        </p>
      ) : null}

      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-faint">
        <span>{finding.code}</span>
        {finding.where ? <span>· {finding.where}</span> : null}
      </p>

      {action ? <p className="mt-1.5 text-xs leading-relaxed text-point">{action}</p> : null}
    </li>
  )
}

export function ValidationReport({
  rounds,
  status,
  gradeBand,
}: {
  rounds: StudioRound[]
  status: StudioStatus
  gradeBand: GradeBand
}) {
  const limit = PEN_LIMITS[gradeBand]

  const criteria = [
    { label: '최소 선 간격', value: `${limit.min_gap_mm}mm` },
    { label: '최소 선 길이', value: `${limit.min_segment_mm}mm` },
    { label: '최소 내각', value: `${limit.min_angle_deg}°` },
    { label: '부품 상한', value: `${limit.max_parts}개` },
    { label: '그리기 속도', value: `${limit.draw_speed_mm_s}mm/초` },
  ]

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm font-semibold text-ink">{GRADE_BAND_LABEL[gradeBand]} 판정 기준</p>
        <dl className="mt-2.5 grid grid-cols-2 border-y border-line sm:grid-cols-5">
          {criteria.map((c) => (
            <div key={c.label} className="rule-cell px-3 py-2.5 first:pl-0 sm:first:pl-3">
              <dt className="text-xs text-sub">{c.label}</dt>
              <dd className="mt-0.5 text-sm font-semibold text-ink tabular-nums">{c.value}</dd>
            </div>
          ))}
        </dl>
      </div>

      <ol className="space-y-4">
        {rounds.map((round) => (
          <li key={round.round} className="border border-line bg-card">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-line px-4 py-2.5">
              <span className="font-display text-sm font-bold text-ink tabular-nums">
                {round.round}차
              </span>
              <span className="text-xs font-medium text-sub">
                {round.action === 'generated' ? '생성' : '치수 개선'}
              </span>
              <Badge tone={round.ok ? 'positive' : 'negative'}>
                {round.ok ? '통과' : '미통과'}
              </Badge>
              {round.params ? (
                <span className="text-xs text-sub tabular-nums">
                  치수 {String(round.params.size)}mm · 장식 {String(round.params.detail)} · 선택 부품{' '}
                  {round.params.extras ? '포함' : '제외'}
                </span>
              ) : null}
            </div>

            <div className="px-4 py-3">
              {round.repair ? (
                <p className="mb-2 text-sm leading-relaxed font-medium text-point">
                  고친 것 — {round.repair}
                </p>
              ) : null}

              {round.findings.length > 0 ? (
                <ul className="space-y-2.5">
                  {round.findings.map((finding, i) => (
                    <FindingRow key={`${finding.code}-${i}`} finding={finding} />
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-positive">걸린 항목이 없습니다.</p>
              )}
            </div>
          </li>
        ))}
      </ol>

      {status === 'failed' ? (
        <p className="border-l-2 border-negative bg-negative-bg px-3.5 py-3 text-sm leading-relaxed text-negative">
          개선 {rounds.length - 1}번으로도 기준을 넘지 못했습니다. 기준을 낮춰 통과시키지
          않습니다 — 위 조치를 적용해 다시 만들어 주세요.
        </p>
      ) : null}
    </div>
  )
}
