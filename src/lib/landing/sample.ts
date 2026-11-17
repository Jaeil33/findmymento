import { cache } from 'react'
import { PEN_LIMITS } from '@/lib/studio/constants'
import { generatePen } from '@/lib/studio/pen3d/pipeline'
import { GRADE_BAND_LABEL } from '@/types/domain'
import type { PenArtifact, StudioSpec } from '@/types/studio'

/**
 * 랜딩이 보여주는 산출물 — **지금 이 요청에서 실제로 만든 것이다.**
 *
 * 강사 화면과 같은 생성기·같은 검증기를 부른다. 그래서 랜딩의 도안·수치·실패 사유가
 * 제품의 실제 동작과 어긋날 수 없다. 스크린샷을 떠다 붙이면 코드가 바뀐 날부터 거짓말이 된다.
 *
 * LLM 은 부르지 않는다. 좌표·치수·판정은 전부 규칙이 만든다 (ADR-029).
 */

/** 통과 사례 — 중등 90분, 교실, 3D펜 보유. 시드와 같은 조건이다. */
const PASS_SPEC: StudioSpec = {
  kind: 'pen3d',
  grade_band: 'middle',
  student_count: 20,
  duration_minutes: 90,
  venue: '교실',
  equipment: ['3D펜 20자루', 'PLA 필라멘트', '실리콘 매트'],
  topic: '육각 보관함',
  session_id: null,
}

/**
 * 실패 사례 — **같은 도안**을 초등 30분에 넣으면 들어가지 않는다.
 * 지어낸 예시가 아니라 레시피는 그대로 두고 조건만 바꿔 다시 돌린 결과다.
 * 랜딩이 "같은 도안을 조건만 바꿨다"고 적으므로 레시피가 갈라지면 안 된다.
 */
const FAIL_SPEC: StudioSpec = {
  ...PASS_SPEC,
  grade_band: 'elementary',
  duration_minutes: 30,
}

/** 통과 사례와 실패 사례가 같은 레시피를 써야 "조건만 바꿨다"가 사실이 된다. */
const HERO_RECIPE_ID = 'hex-box'

export type MeasuredCheck = {
  label: string
  measured: string
  limit: string
}

const mm = (v: number | null) => (v === null ? '여유 있음' : `${Math.round(v * 10) / 10}mm`)

export type LandingSample = {
  artifact: PenArtifact
  /** 검증이 실제로 잰 값과 기준 */
  checks: MeasuredCheck[]
  conditions: string
  gradeLabel: string
}

export const passSample = cache((): LandingSample => {
  const result = generatePen(PASS_SPEC, { recipeId: HERO_RECIPE_ID })
  const artifact = result.artifact as PenArtifact
  const limit = PEN_LIMITS[PASS_SPEC.grade_band]
  const m = artifact.metrics

  return {
    artifact,
    checks: [
      { label: '선 사이 간격', measured: mm(m.min_gap_mm), limit: `${limit.min_gap_mm}mm 이상` },
      { label: '가장 짧은 선', measured: mm(m.min_segment_mm), limit: `${limit.min_segment_mm}mm 이상` },
      { label: '부품 수', measured: `${m.part_count}개`, limit: `${limit.max_parts}개 이하` },
      {
        label: '예상 제작 시간',
        measured: `${Math.round(m.estimated_minutes)}분`,
        limit: `가용 ${Math.round(m.available_minutes)}분 안`,
      },
    ],
    conditions: `${GRADE_BAND_LABEL[PASS_SPEC.grade_band]} ${PASS_SPEC.student_count}명 · ${PASS_SPEC.duration_minutes}분 · ${PASS_SPEC.venue}`,
    gradeLabel: GRADE_BAND_LABEL[PASS_SPEC.grade_band],
  }
})

export type BlockedSample = {
  title: string
  conditions: string
  /** 통과하지 못한 이유. 검증기가 돌려준 문장 그대로다 */
  reasons: { message: string; measured: string | null }[]
  rounds: number
}

export const blockedSample = cache((): BlockedSample => {
  const result = generatePen(FAIL_SPEC, { recipeId: HERO_RECIPE_ID })
  const errors = result.report.findings.filter((f) => f.severity === 'error')

  return {
    title: result.artifact.kind === 'pen3d' ? result.artifact.pattern.title : FAIL_SPEC.topic,
    conditions: `${GRADE_BAND_LABEL[FAIL_SPEC.grade_band]} ${FAIL_SPEC.student_count}명 · ${FAIL_SPEC.duration_minutes}분`,
    reasons: errors.map((f) => ({
      message: f.message,
      measured:
        f.measured === undefined
          ? null
          : `${f.measured}${f.limit === undefined ? '' : ` / 기준 ${f.limit}`}`,
    })),
    rounds: result.rounds.length,
  }
})
