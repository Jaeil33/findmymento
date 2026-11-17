import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  BEAD_WIDTH_MM,
  CLASS_OVERHEAD_MINUTES,
  CLOSED_TOLERANCE_MM,
  DRONE_FINDING_SEVERITY,
  DRONE_MIN_ALTITUDE_CM,
  DRONE_MODELS,
  DRONE_OBSTACLE_CLEARANCE_CM,
  DRONE_SAFETY_NOTES,
  DRONE_WALL_CLEARANCE_CM,
  PAGE,
  PEEL_SECONDS_PER_PART,
  PEN_FINDING_SEVERITY,
  PEN_LIMITS,
  SLOT_CLEARANCE_MM,
  TIME_SAFETY,
  TIME_TIGHT_RATIO,
  VENUE_DIMENSIONS,
  WELD_MIN_LENGTH_MM,
  WELD_SECONDS_PER_JOINT,
} from '@/lib/studio/constants'
import { VENUES } from '@/types/domain'

/**
 * 상수 ↔ 문서 일치 테스트.
 *
 * `docs/STUDIO.md` 의 표가 임계값의 유일한 출처이고, 이 테스트가 그걸 강제한다.
 * 검증을 통과시키려고 코드에서 임계값을 몰래 낮추면 여기서 먼저 터진다 (ADR-030).
 */

const DOC = readFileSync(join(process.cwd(), 'docs', 'STUDIO.md'), 'utf8')

type Row = string[]

const rows: Row[] = DOC.split('\n')
  .filter((line) => line.trim().startsWith('|'))
  .map((line) =>
    line
      .trim()
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map((c) => c.trim()),
  )
  .filter((cells) => !cells.every((c) => /^-*:?-*$/.test(c) || c === ''))

/** 라벨로 행을 찾는다. 문서에서 그 줄이 사라지면 테스트가 먼저 터진다. */
function row(label: string): Row {
  const found = rows.find((cells) => cells[0] === label)
  expect(found, `docs/STUDIO.md 에 "${label}" 행이 없다`).toBeTruthy()
  return found as Row
}

/** 셀에서 숫자를 순서대로 뽑는다. `4.0 / 3.0 / 3.0mm` → [4, 3, 3] */
function nums(cell: string | undefined): number[] {
  return (cell?.match(/\d+(?:\.\d+)?/g) ?? []).map(Number)
}

describe('3D펜 물리 상수가 docs/STUDIO.md 와 일치한다', () => {
  it('압출 선폭', () => {
    expect(nums(row('압출 선폭')[1])).toEqual([BEAD_WIDTH_MM])
  })

  it('최소 선 간격 (초/중/고)', () => {
    expect(nums(row('최소 선 간격 (초/중/고)')[1])).toEqual([
      PEN_LIMITS.elementary.min_gap_mm,
      PEN_LIMITS.middle.min_gap_mm,
      PEN_LIMITS.high.min_gap_mm,
    ])
  })

  it('최소 선분 길이 (초/중/고)', () => {
    expect(nums(row('최소 선분 길이 (초/중/고)')[1])).toEqual([
      PEN_LIMITS.elementary.min_segment_mm,
      PEN_LIMITS.middle.min_segment_mm,
      PEN_LIMITS.high.min_segment_mm,
    ])
  })

  it('최소 내각 (초/중/고)', () => {
    expect(nums(row('최소 내각 (초/중/고)')[1])).toEqual([
      PEN_LIMITS.elementary.min_angle_deg,
      PEN_LIMITS.middle.min_angle_deg,
      PEN_LIMITS.high.min_angle_deg,
    ])
  })

  it('그리기 속도는 학년이 올라갈수록 빠르다', () => {
    expect(nums(row('그리기 속도 (초/중/고)')[1])).toEqual([
      PEN_LIMITS.elementary.draw_speed_mm_s,
      PEN_LIMITS.middle.draw_speed_mm_s,
      PEN_LIMITS.high.draw_speed_mm_s,
    ])
    expect(PEN_LIMITS.elementary.draw_speed_mm_s).toBeLessThan(PEN_LIMITS.middle.draw_speed_mm_s)
    expect(PEN_LIMITS.middle.draw_speed_mm_s).toBeLessThan(PEN_LIMITS.high.draw_speed_mm_s)
  })

  it('조립 시간 상수', () => {
    expect(nums(row('부품 떼어내기')[1])).toEqual([PEEL_SECONDS_PER_PART])
    expect(nums(row('접합 1건')[1])).toEqual([WELD_SECONDS_PER_JOINT])
  })

  it('최소 접합 길이', () => {
    expect(nums(row('최소 접합 길이')[1])).toEqual([WELD_MIN_LENGTH_MM])
  })

  it('수업 오버헤드와 안전 계수', () => {
    expect(nums(row('수업 오버헤드')[1])).toEqual([CLASS_OVERHEAD_MINUTES])
    expect(nums(row('시간 안전 계수')[1])).toEqual([TIME_SAFETY])
    expect(TIME_SAFETY).toBeLessThan(1)
    expect(TIME_TIGHT_RATIO).toBeLessThan(1)
  })

  it('부품 수 상한 (초/중/고)', () => {
    expect(nums(row('부품 수 상한 (초/중/고)')[1])).toEqual([
      PEN_LIMITS.elementary.max_parts,
      PEN_LIMITS.middle.max_parts,
      PEN_LIMITS.high.max_parts,
    ])
  })

  it('A4 사용 영역은 여백을 뺀 값이다', () => {
    const [w, h] = nums(row('A4 사용 영역')[1])
    expect(w).toBe(PAGE.width_mm - PAGE.margin_mm * 2)
    expect(h).toBe(PAGE.height_mm - PAGE.margin_mm * 2)
    expect(PAGE.width_mm).toBe(210)
    expect(PAGE.height_mm).toBe(297)
  })

  it('부품 간 배치 간격', () => {
    expect(nums(row('부품 간 배치 간격')[1])).toEqual([PAGE.gutter_mm])
  })

  it('선 간격 하한은 압출 선폭보다 크다', () => {
    for (const band of ['elementary', 'middle', 'high'] as const) {
      expect(PEN_LIMITS[band].min_gap_mm).toBeGreaterThan(BEAD_WIDTH_MM)
    }
  })

  it('슬롯 여유와 닫힘 허용값', () => {
    expect(SLOT_CLEARANCE_MM[0]).toBeLessThan(SLOT_CLEARANCE_MM[1])
    expect(CLOSED_TOLERANCE_MM).toBeGreaterThan(0)
    expect(CLOSED_TOLERANCE_MM).toBeLessThan(1)
  })

  it('난이도 권장 범위는 학년대별로 문서와 같다 (초 1~2 · 중 2~4 · 고 3~5)', () => {
    expect(PEN_LIMITS.elementary.difficulty).toEqual([1, 2])
    expect(PEN_LIMITS.middle.difficulty).toEqual([2, 4])
    expect(PEN_LIMITS.high.difficulty).toEqual([3, 5])
    expect(DOC).toContain('초등 1~2, 중등 2~4, 고등 3~5')
  })
})

describe('검증 코드 목록이 문서와 1:1이다', () => {
  /** 문서 표의 첫 칸에서 `CODE` 를 뽑고 두 번째 칸에서 심각도를 읽는다. */
  function docCodes(prefix: 'PEN' | 'DRONE'): Record<string, string> {
    const out: Record<string, string> = {}
    for (const cells of rows) {
      const codes = cells[0]!.match(new RegExp('`(' + prefix + '_[A-Z_]+)`', 'g'))
      if (!codes) continue
      const severity = cells[1]
      if (severity !== 'error' && severity !== 'warn') continue
      for (const raw of codes) out[raw.replaceAll('`', '')] = severity
    }
    return out
  }

  it('3D펜 — 코드와 심각도가 문서와 같다', () => {
    const doc = docCodes('PEN')
    expect(Object.keys(doc).length).toBeGreaterThanOrEqual(14)
    expect(PEN_FINDING_SEVERITY).toEqual(doc)
  })

  it('드론 — 코드와 심각도가 문서와 같다', () => {
    const doc = docCodes('DRONE')
    expect(Object.keys(doc).length).toBeGreaterThanOrEqual(12)
    expect(DRONE_FINDING_SEVERITY).toEqual(doc)
  })
})

describe('드론 상수가 docs/STUDIO.md 와 일치한다', () => {
  it('장소 치수 6곳이 모두 있다', () => {
    expect(Object.keys(VENUE_DIMENSIONS).sort()).toEqual([...VENUES].sort())
    for (const venue of VENUES) {
      const [x, y, z] = nums(row(venue)[1])
      expect({ venue, x, y, z }).toEqual({ venue, ...VENUE_DIMENSIONS[venue] })
    }
  })

  it('기체 목록의 고도·비행시간이 문서와 같다', () => {
    expect(DRONE_MODELS.length).toBeGreaterThanOrEqual(3)
    for (const model of DRONE_MODELS) {
      const found = rows.find((cells) => cells[0] === model.label)
      expect(found, `docs/STUDIO.md 기체 표에 "${model.label}" 이 없다`).toBeTruthy()
      const cells = found as Row
      expect(nums(cells[3])).toEqual([model.max_altitude_cm])
      if (model.flight_seconds !== null) expect(nums(cells[4])).toEqual([model.flight_seconds])
    }
  })

  it('여유 거리와 최소 고도', () => {
    expect(DOC).toContain(`벽 여유(${DRONE_WALL_CLEARANCE_CM}cm)`)
    expect(DOC).toContain(`장애물 간격 ${DRONE_OBSTACLE_CLEARANCE_CM}cm`)
    expect(DOC).toContain(`[${DRONE_MIN_ALTITUDE_CM}cm,`)
  })

  it('안전 고정 문구 4개가 문서에 그대로 있다', () => {
    expect(DRONE_SAFETY_NOTES).toHaveLength(4)
    for (const note of DRONE_SAFETY_NOTES) expect(DOC).toContain(note)
  })
})
