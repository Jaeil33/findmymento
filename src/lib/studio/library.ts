/**
 * 스튜디오 라이브러리 조회와 성과 보정. **순수 함수만** 둔다 (`docs/ARCHITECTURE.md` 패턴).
 *
 * 데이터 출처는 `lib/db/dataset.ts` 가 가른다 — 여기서는 행 배열만 받는다. 실 DB 에서는 RLS 가
 * 이미 남의 산출물을 0행으로 만들지만, 이 함수들도 같은 경계(`instructor_id`)를 다시 적용한다.
 * 데모 모드에는 RLS 가 없으므로 그때는 이것이 유일한 경계다.
 */

import { CALIBRATION_MIN_SAMPLES, SPEED_FACTOR_RANGE } from '@/lib/studio/constants'
import type { GradeBand } from '@/types/domain'
import { isUsable, type StudioCalibration, type StudioContent, type StudioFeedback } from '@/types/studio'

export type StudioHead = {
  content: StudioContent
  /** 같은 계보에 쌓인 버전 수 */
  version_count: number
}

/** 계보마다 **최신 버전 하나만.** 최근 생성 순. */
export function studioHeads(contents: StudioContent[], instructorId: string): StudioHead[] {
  const mine = contents.filter((c) => c.instructor_id === instructorId)
  const byLineage = new Map<string, StudioContent[]>()
  for (const c of mine) {
    const bucket = byLineage.get(c.lineage_id)
    if (bucket) bucket.push(c)
    else byLineage.set(c.lineage_id, [c])
  }

  return [...byLineage.values()]
    .map((versions) => {
      const head = versions.reduce((a, b) => (b.version > a.version ? b : a))
      return { content: head, version_count: versions.length }
    })
    .sort(
      (a, b) =>
        b.content.created_at.localeCompare(a.content.created_at) ||
        a.content.id.localeCompare(b.content.id),
    )
}

/** 한 산출물의 버전 이력. 최신 버전부터. */
export function studioLineage(contents: StudioContent[], lineageId: string): StudioContent[] {
  return contents
    .filter((c) => c.lineage_id === lineageId)
    .sort((a, b) => b.version - a.version)
}

export function nextVersion(contents: StudioContent[], lineageId: string): number {
  const versions = contents.filter((c) => c.lineage_id === lineageId).map((c) => c.version)
  return versions.length === 0 ? 1 : Math.max(...versions) + 1
}

export function studioContentById(contents: StudioContent[], id: string): StudioContent | null {
  return contents.find((c) => c.id === id) ?? null
}

export type StudioStats = {
  total: number
  draft: number
  validated: number
  failed: number
  approved: number
  /** 수업에 쓸 수 있다고 표시되는 것 (validated + approved) */
  usable: number
}

export function studioStats(contents: StudioContent[], instructorId: string): StudioStats {
  const mine = contents.filter((c) => c.instructor_id === instructorId)
  const count = (status: StudioContent['status']) => mine.filter((c) => c.status === status).length
  return {
    total: mine.length,
    draft: count('draft'),
    validated: count('validated'),
    failed: count('failed'),
    approved: count('approved'),
    usable: mine.filter((c) => isUsable(c.status)).length,
  }
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[mid] as number
  return (((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2)
}

const clamp = (value: number, [lo, hi]: [number, number]) => Math.min(hi, Math.max(lo, value))

/**
 * 같은 레시피·같은 학년대의 성과 피드백으로 만든 보정 (ADR-032).
 *
 * **{@link CALIBRATION_MIN_SAMPLES}건 미만이면 `null`** — 한두 번의 수업이 물리 상수를
 * 바꾸면 안 된다 (ADR-018 과 같은 이유). 느린 쪽으로 틀리는 편이 수업이 안 끝나는 쪽으로
 * 틀리는 것보다 낫다.
 */
export function calibrationFor(
  contents: StudioContent[],
  feedback: StudioFeedback[],
  recipeId: string,
  gradeBand: GradeBand,
): StudioCalibration | null {
  const matching = new Map(
    contents
      .filter((c) => c.recipe_id === recipeId && c.spec.grade_band === gradeBand)
      .map((c) => [c.id, c]),
  )

  const rows = feedback.filter((f) => matching.has(f.content_id))
  if (rows.length < CALIBRATION_MIN_SAMPLES) return null

  const ratios: number[] = []
  for (const row of rows) {
    const content = matching.get(row.content_id)
    const expected = content?.artifact.metrics.estimated_minutes ?? 0
    if (expected <= 0) continue
    ratios.push(row.actual_minutes / expected)
  }
  if (ratios.length < CALIBRATION_MIN_SAMPLES) return null

  const tooHard = rows.filter((f) => f.difficulty_vote === 'too_hard').length

  return {
    recipe_id: recipeId,
    grade_band: gradeBand,
    sample_count: rows.length,
    speed_factor: Math.round(clamp(median(ratios), SPEED_FACTOR_RANGE) * 100) / 100,
    lower_difficulty: tooHard * 2 > rows.length,
  }
}
