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
}

function FindingRow({ finding }: { finding: Finding }) {
  const action = NEXT_ACTION[finding.code]
  return (
    <li className="flex gap-2.5 py-2">
      <Badge tone={finding.severity === 'error' ? 'negative' : 'caution'}>
        {finding.severity === 'error' ? '막음' : '주의'}
      </Badge>
      <div className="min-w-0 flex-1">
        <p className="text-sm leading-relaxed text-body">{finding.message}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-sub">
          <span className="font-mono">{finding.code}</span>
          {finding.where ? <span>· {finding.where}</span> : null}
          {finding.measured !== undefined ? (
            <span className="tabular-nums">
              · 측정 {finding.measured}
              {finding.limit !== undefined ? ` / 기준 ${finding.limit}` : ''}
            </span>
          ) : null}
        </p>
        {action ? <p className="mt-1 text-xs leading-relaxed text-point">{action}</p> : null}
      </div>
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

  return (
    <div className="space-y-4">
      <p className="rounded-md border border-line bg-muted px-3 py-2 text-xs leading-relaxed text-body">
        {GRADE_BAND_LABEL[gradeBand]} 기준으로 검사했습니다 — 최소 선 간격 {limit.min_gap_mm}mm ·
        최소 선 길이 {limit.min_segment_mm}mm · 최소 내각 {limit.min_angle_deg}도 · 부품 상한{' '}
        {limit.max_parts}개 · 그리기 속도 {limit.draw_speed_mm_s}mm/초.
      </p>

      <ol className="space-y-3">
        {rounds.map((round) => (
          <li key={round.round} className="rounded-md border border-line bg-card p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-ink">{round.round}차</span>
              <Badge tone={round.action === 'generated' ? 'neutral' : 'caution'}>
                {round.action === 'generated' ? '생성' : '개선'}
              </Badge>
              <Badge tone={round.ok ? 'positive' : 'negative'}>
                {round.ok ? '통과' : '미통과'}
              </Badge>
              {round.params ? (
                <span className="text-xs tabular-nums text-sub">
                  치수 {String(round.params.size)}mm · 장식 {String(round.params.detail)} ·
                  선택 부품 {round.params.extras ? '포함' : '제외'}
                </span>
              ) : null}
            </div>

            {round.repair ? (
              <p className="mt-2 text-sm leading-relaxed text-point">↳ {round.repair}</p>
            ) : null}

            {round.findings.length > 0 ? (
              <ul className="mt-2 divide-y divide-line">
                {round.findings.map((finding, i) => (
                  <FindingRow key={`${finding.code}-${i}`} finding={finding} />
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-body">걸린 항목이 없습니다.</p>
            )}
          </li>
        ))}
      </ol>

      {status === 'failed' ? (
        <p className="rounded-md border border-negative/20 bg-negative-bg px-3 py-2 text-xs leading-relaxed text-negative">
          개선을 {rounds.length - 1}번 시도했지만 기준을 넘지 못했습니다. 기준을 낮춰 통과시키지
          않습니다 — 선 간격과 제작 시간은 교실에서 그대로 드러나기 때문입니다. 위 조치를 적용해
          다시 만들어 주세요.
        </p>
      ) : null}
    </div>
  )
}
