import { describe, expect, it } from 'vitest'
import { CALIBRATION_MIN_SAMPLES, SPEED_FACTOR_RANGE } from '@/lib/studio/constants'
import {
  calibrationFor,
  nextVersion,
  studioContentById,
  studioHeads,
  studioLineage,
  studioStats,
} from '@/lib/studio/library'
import type { GradeBand } from '@/types/domain'
import type { StudioContent, StudioFeedback, StudioStatus } from '@/types/studio'

/**
 * 라이브러리·버전·보정 테스트. 보는 것:
 * - 버전이 쌓였을 때 목록에 **최신 한 줄만** 나오는가
 * - 보정이 3건 미만에서는 동작하지 않는가 (ADR-032)
 */

const content = (over: Partial<StudioContent> & { id: string }): StudioContent => ({
  lineage_id: over.id,
  version: 1,
  instructor_id: 'ins-1',
  session_id: null,
  kind: 'pen3d',
  title: '정육면체 조명',
  recipe_id: 'cube-lantern',
  spec: {
    kind: 'pen3d',
    grade_band: 'middle',
    student_count: 20,
    duration_minutes: 90,
    venue: '교실',
    equipment: ['3D펜'],
    topic: '조명',
    session_id: null,
  },
  artifact: {
    kind: 'pen3d',
    pattern: { recipe_id: 'cube-lantern', title: '정육면체 조명', scale: 1, parts: [], joints: [] },
    metrics: {
      part_count: 6,
      unique_part_count: 1,
      joint_count: 12,
      total_stroke_mm: 1620,
      min_gap_mm: 7.1,
      min_segment_mm: 22.5,
      min_angle_deg: 90,
      draw_seconds: 180,
      peel_seconds: 180,
      weld_seconds: 540,
      estimated_minutes: 15,
      available_minutes: 59.5,
      difficulty: 2,
      page_fit: true,
    },
    assembly: [],
    tasks: [],
    safety_notes: [],
  },
  rounds: [],
  status: 'validated',
  source: 'rule',
  created_at: '2026-11-01T10:00:00+09:00',
  approved_at: null,
  ...over,
})

const feedback = (over: Partial<StudioFeedback> & { id: string }): StudioFeedback => ({
  content_id: 'c1',
  session_id: null,
  instructor_id: 'ins-1',
  attempted_count: 20,
  completed_count: 18,
  actual_minutes: 15,
  difficulty_vote: 'right',
  note: null,
  created_at: '2026-11-02T10:00:00+09:00',
  ...over,
})

describe('라이브러리 목록 — 버전은 최신 한 줄만', () => {
  const contents = [
    content({ id: 'a1', lineage_id: 'a', version: 1, created_at: '2026-11-01T10:00:00+09:00' }),
    content({ id: 'a2', lineage_id: 'a', version: 2, created_at: '2026-11-03T10:00:00+09:00' }),
    content({ id: 'b1', lineage_id: 'b', version: 1, created_at: '2026-11-02T10:00:00+09:00' }),
    content({ id: 'z1', lineage_id: 'z', version: 1, instructor_id: 'ins-9' }),
  ]

  it('계보마다 최신 버전 하나만, 최근 생성 순으로 나온다', () => {
    const heads = studioHeads(contents, 'ins-1')
    expect(heads.map((h) => h.content.id)).toEqual(['a2', 'b1'])
    expect(heads[0]!.version_count).toBe(2)
    expect(heads[1]!.version_count).toBe(1)
  })

  it('남의 산출물은 목록에 없다 — RLS 가 먼저 막지만 조회도 같은 경계를 쓴다', () => {
    expect(studioHeads(contents, 'ins-1').some((h) => h.content.id === 'z1')).toBe(false)
    expect(studioHeads(contents, 'ins-9').map((h) => h.content.id)).toEqual(['z1'])
  })

  it('버전 이력은 내림차순이다', () => {
    expect(studioLineage(contents, 'a').map((c) => c.version)).toEqual([2, 1])
  })

  it('다음 버전 번호는 최대값 + 1 이고, 계보가 없으면 1 이다', () => {
    expect(nextVersion(contents, 'a')).toBe(3)
    expect(nextVersion(contents, '없는계보')).toBe(1)
  })

  it('id 로 찾는다', () => {
    expect(studioContentById(contents, 'b1')?.id).toBe('b1')
    expect(studioContentById(contents, '없음')).toBeNull()
  })
})

describe('대시보드 집계', () => {
  const statuses: StudioStatus[] = ['draft', 'validated', 'failed', 'approved']
  const contents = statuses.map((status, i) =>
    content({
      id: `c${i}`,
      lineage_id: `l${i}`,
      status,
      approved_at: status === 'approved' ? '2026-11-05T10:00:00+09:00' : null,
    }),
  )

  it('상태별 개수와 수업 사용 가능 수를 센다', () => {
    const stats = studioStats(contents, 'ins-1')
    expect(stats.total).toBe(4)
    expect(stats.approved).toBe(1)
    expect(stats.failed).toBe(1)
    // validated + approved 만 수업에 쓸 수 있다 (ADR-030)
    expect(stats.usable).toBe(2)
  })

  it('남의 것은 세지 않는다', () => {
    expect(studioStats(contents, 'ins-2').total).toBe(0)
  })
})

describe('성과 피드백 보정 (ADR-032)', () => {
  const band: GradeBand = 'middle'
  const contents = [
    content({ id: 'c1', lineage_id: 'c1' }),
    content({ id: 'c2', lineage_id: 'c2' }),
    content({ id: 'c3', lineage_id: 'c3' }),
    content({ id: 'c4', lineage_id: 'c4' }),
  ]

  it('3건 미만이면 보정하지 않는다 — 한두 번의 수업이 상수를 바꾸면 안 된다', () => {
    const rows = [
      feedback({ id: 'f1', content_id: 'c1', actual_minutes: 30 }),
      feedback({ id: 'f2', content_id: 'c2', actual_minutes: 30 }),
    ]
    expect(rows).toHaveLength(CALIBRATION_MIN_SAMPLES - 1)
    expect(calibrationFor(contents, rows, 'cube-lantern', band)).toBeNull()
  })

  it('3건 이상이면 실제/예상 비율의 중위수를 쓴다', () => {
    // 예상 15분 기준. 비율 1.0 · 1.2 · 1.4 → 중위수 1.2
    const rows = [
      feedback({ id: 'f1', content_id: 'c1', actual_minutes: 15 }),
      feedback({ id: 'f2', content_id: 'c2', actual_minutes: 18 }),
      feedback({ id: 'f3', content_id: 'c3', actual_minutes: 21 }),
    ]
    const cal = calibrationFor(contents, rows, 'cube-lantern', band)
    expect(cal).toBeTruthy()
    expect(cal!.sample_count).toBe(3)
    expect(cal!.speed_factor).toBe(1.2)
  })

  it('짝수 건이면 가운데 둘의 평균이고, 범위를 넘으면 잘린다', () => {
    const rows = [
      feedback({ id: 'f1', content_id: 'c1', actual_minutes: 15 }), // 1.0
      feedback({ id: 'f2', content_id: 'c2', actual_minutes: 18 }), // 1.2
      feedback({ id: 'f3', content_id: 'c3', actual_minutes: 21 }), // 1.4
      feedback({ id: 'f4', content_id: 'c4', actual_minutes: 45 }), // 3.0 → 중위수 1.3
    ]
    expect(calibrationFor(contents, rows, 'cube-lantern', band)!.speed_factor).toBe(1.3)
  })

  it('비율은 0.6~1.6 으로 자른다', () => {
    const slow = [1, 2, 3].map((i) =>
      feedback({ id: `f${i}`, content_id: `c${i}`, actual_minutes: 150 }),
    )
    expect(calibrationFor(contents, slow, 'cube-lantern', band)!.speed_factor).toBe(
      SPEED_FACTOR_RANGE[1],
    )
    const fast = [1, 2, 3].map((i) =>
      feedback({ id: `f${i}`, content_id: `c${i}`, actual_minutes: 1 }),
    )
    expect(calibrationFor(contents, fast, 'cube-lantern', band)!.speed_factor).toBe(
      SPEED_FACTOR_RANGE[0],
    )
  })

  it('too_hard 가 과반이면 난이도 상한을 낮춘다', () => {
    const rows = [
      feedback({ id: 'f1', content_id: 'c1', difficulty_vote: 'too_hard' }),
      feedback({ id: 'f2', content_id: 'c2', difficulty_vote: 'too_hard' }),
      feedback({ id: 'f3', content_id: 'c3', difficulty_vote: 'right' }),
    ]
    expect(calibrationFor(contents, rows, 'cube-lantern', band)!.lower_difficulty).toBe(true)
  })

  it('too_hard 가 과반이 아니면 낮추지 않는다', () => {
    const rows = [
      feedback({ id: 'f1', content_id: 'c1', difficulty_vote: 'too_hard' }),
      feedback({ id: 'f2', content_id: 'c2', difficulty_vote: 'right' }),
      feedback({ id: 'f3', content_id: 'c3', difficulty_vote: 'too_easy' }),
    ]
    expect(calibrationFor(contents, rows, 'cube-lantern', band)!.lower_difficulty).toBe(false)
  })

  it('다른 레시피·다른 학년대의 피드백은 섞지 않는다', () => {
    const rows = [1, 2, 3].map((i) =>
      feedback({ id: `f${i}`, content_id: `c${i}`, actual_minutes: 30 }),
    )
    expect(calibrationFor(contents, rows, 'house-lamp', band)).toBeNull()
    expect(calibrationFor(contents, rows, 'cube-lantern', 'elementary')).toBeNull()
  })

  it('예상 시간이 0 인 산출물은 비율을 계산하지 않는다', () => {
    const broken = contents.map((c) => ({
      ...c,
      artifact: {
        ...c.artifact,
        metrics: { ...(c.artifact as { metrics: { estimated_minutes: number } }).metrics, estimated_minutes: 0 },
      } as StudioContent['artifact'],
    }))
    const rows = [1, 2, 3].map((i) =>
      feedback({ id: `f${i}`, content_id: `c${i}`, actual_minutes: 30 }),
    )
    expect(calibrationFor(broken, rows, 'cube-lantern', band)).toBeNull()
  })
})
