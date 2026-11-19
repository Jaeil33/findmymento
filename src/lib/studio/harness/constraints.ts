/**
 * 수업 조건 해석 — **입력으로 알 수 없는 것을 추론으로 확정하지 않는다** (개발명세서 §5B·C).
 *
 * 하는 일 두 가지:
 * 1. 시간: 수업 시간에서 준비·정리를 빼고, 그 값을 **지도안의 칸으로 쪼갠다.** 숫자는
 *    `constants.ts` 한 곳에서 온다 (`CLASS_OVERHEAD_MINUTES` = `CLASS_OVERHEAD_SPLIT` 의 합).
 * 2. 장비: 자유 문장에서 펜 수량·필라멘트를 읽는다. **원문을 버리지 않고**, 읽지 못한 항목과
 *    적히지 않은 항목은 "확인 필요" 로 남긴다 — 없다고 단정하지 않는다.
 *
 * 제작 가용 시간(`making_minutes`)은 `penMetrics` 의 `available_minutes` 와 **같은 식**이다.
 * 두 값이 어긋나면 지도안의 시간과 판정의 시간이 달라지므로, `tests/studio-harness.test.ts`
 * 가 두 값을 맞비교해 고정한다.
 */

import {
  CLASS_OVERHEAD_MINUTES,
  CLASS_OVERHEAD_SPLIT,
  FILAMENT_KEYWORDS,
  PEN_COUNT_PATTERNS,
  PEN_SHARE_LIMIT,
  TIME_SAFETY,
} from '@/lib/studio/constants'
import { hasPenEquipment } from '@/lib/studio/pen3d/validate'
import type { EquipmentPlan, StudioSpec } from '@/types/studio'

export type EquipmentReading = {
  /** 강사가 적은 그대로. 해석 결과와 **함께** 보관한다 (개발명세서 §1) */
  raw: string[]
  has_pen: boolean
  /** 읽어낸 펜 수량. **읽지 못하면 `null` 이고 "확인 필요" 다** — 1자루로 가정하지 않는다 */
  pen_count: number | null
  /** 필라멘트가 적혀 있는가. 적히지 않았으면 `null` (없다는 뜻이 아니다) */
  filament: boolean | null
  /** 해석하지 못한 항목 원문. 화면에 그대로 보여준다 */
  unread: string[]
}

export type LessonConstraints = {
  duration_minutes: number
  overhead_minutes: number
  intro_minutes: number
  demo_minutes: number
  wrap_minutes: number
  /** 제작에 쓸 수 있는 시간. `penMetrics.available_minutes` 와 같은 식이다 */
  making_minutes: number
  /** 안전 계수를 걸기 전의 활동 시간. 지도안의 합을 맞추는 데 쓴다 */
  activity_minutes: number
  student_count: number
  equipment: EquipmentReading
  /** 펜 한 자루를 몇 명이 나눠 쓰는가. 펜 수를 모르면 `null` */
  students_per_pen: number | null
  /** 교대 조 수. 펜 수를 모르면 `null` */
  rotations: number | null
  /** 입력으로 알 수 없어 **강사가 확인해야 하는 것** */
  unconfirmed: string[]
}

/** 자유 문장에서 펜 수량을 읽는다. 여러 항목에 적혀 있으면 **가장 큰 값**을 쓴다 */
export function readPenCount(equipment: string[]): number | null {
  let best: number | null = null
  for (const item of equipment) {
    for (const pattern of PEN_COUNT_PATTERNS) {
      const match = pattern.exec(item)
      const value = match?.[1] ? Number(match[1]) : NaN
      if (!Number.isInteger(value) || value <= 0 || value > 500) continue
      if (best === null || value > best) best = value
    }
  }
  return best
}

function readFilament(equipment: string[]): boolean | null {
  const text = equipment.join(' ').toLowerCase()
  return FILAMENT_KEYWORDS.some((k) => text.includes(k)) ? true : null
}

/** 펜·필라멘트 어느 쪽으로도 읽히지 않은 항목. 버리지 않고 화면에 남긴다 */
function unreadItems(equipment: string[]): string[] {
  const known = [...FILAMENT_KEYWORDS, '3d펜', '3d 펜', '3디펜', '3d pen', '펜', 'pen', '매트', 'mat']
  return equipment.filter((item) => {
    const text = item.toLowerCase()
    return !known.some((k) => text.includes(k))
  })
}

export function readEquipment(equipment: string[]): EquipmentReading {
  const raw = equipment.map((e) => e.trim()).filter((e) => e !== '')
  return {
    raw,
    has_pen: hasPenEquipment(raw),
    pen_count: readPenCount(raw),
    filament: readFilament(raw),
    unread: unreadItems(raw),
  }
}

/**
 * 수업 제약. **예외를 던지지 않는다** — 값이 이상해도 계산 가능한 값으로 떨어뜨리고
 * "확인 필요" 에 적는다. 생성 화면이 이 함수 때문에 실패하면 안 된다.
 */
export function lessonConstraints(spec: StudioSpec): LessonConstraints {
  const equipment = readEquipment(spec.equipment)
  const duration = Math.max(0, Math.round(spec.duration_minutes))
  const activity = Math.max(0, duration - CLASS_OVERHEAD_MINUTES)
  // `penMetrics.available_minutes` 와 같은 식이다. 바꾸려면 두 곳을 같이 바꿔야 한다.
  const making = Math.max(0, activity * TIME_SAFETY)

  const perPen =
    equipment.pen_count !== null && equipment.pen_count > 0
      ? Math.ceil(spec.student_count / equipment.pen_count)
      : null

  const unconfirmed: string[] = []
  if (equipment.pen_count === null) {
    unconfirmed.push('3D펜 수량 — 장비 입력에서 수량을 읽지 못했습니다. 교대가 필요한지 확인해 주세요.')
  }
  if (equipment.filament === null) {
    unconfirmed.push('필라멘트 보유량 — 입력에 없습니다. 인원수만큼 쓸 수 있는지 확인해 주세요.')
  }
  // 전원·감독·환기는 입력 칸이 없다. 추론하지 않고 확인 항목으로 남긴다 (개발명세서 §1·§5C).
  unconfirmed.push('콘센트·전원 — 펜을 동시에 꽂을 수 있는지 교실에서 확인해 주세요.')
  unconfirmed.push('환기와 안전 감독 — 노즐이 뜨거우므로 보조 인력이 필요한지 확인해 주세요.')
  for (const item of equipment.unread) {
    unconfirmed.push(`"${item}" — 무엇인지 해석하지 못했습니다. 수업에 쓰실 것이면 그대로 쓰세요.`)
  }

  return {
    duration_minutes: duration,
    overhead_minutes: CLASS_OVERHEAD_MINUTES,
    intro_minutes: CLASS_OVERHEAD_SPLIT.intro_minutes,
    demo_minutes: CLASS_OVERHEAD_SPLIT.demo_minutes,
    wrap_minutes: CLASS_OVERHEAD_SPLIT.wrap_minutes,
    making_minutes: making,
    activity_minutes: activity,
    student_count: spec.student_count,
    equipment,
    students_per_pen: perPen,
    rotations: perPen,
    unconfirmed,
  }
}

/**
 * 장비 운영 계획. **펜 수가 입력에 없으면 교대 수를 만들어내지 않는다.**
 *
 * 20명·20자루와 20명·10자루가 **다른 계획**이 되는 것이 이 함수의 요점이다
 * (개발명세서 §8-5). 같은 결과가 나오면 장비 입력을 읽지 않은 것이다.
 */
export function equipmentPlan(constraints: LessonConstraints): EquipmentPlan {
  const { equipment, students_per_pen, rotations, student_count, making_minutes } = constraints
  const notes: string[] = []

  if (equipment.pen_count === null) {
    notes.push('장비 입력에서 3D펜 수량을 읽지 못했습니다. 수량을 적으면 교대 계획을 함께 계산합니다.')
  } else if (students_per_pen !== null && students_per_pen <= 1) {
    notes.push(`3D펜 ${equipment.pen_count}자루로 학생 ${student_count}명이 1인 1자루로 동시에 작업합니다.`)
  } else if (students_per_pen !== null) {
    const slot = rotations && rotations > 0 ? Math.floor(making_minutes / rotations) : 0
    notes.push(
      `3D펜 ${equipment.pen_count}자루에 학생 ${student_count}명이므로 한 자루를 ${students_per_pen}명이 나눠 씁니다. ${students_per_pen}개 조로 교대하면 조별 작업 시간은 ${slot}분입니다.`,
    )
    if (students_per_pen > PEN_SHARE_LIMIT) {
      notes.push(
        '기다리는 학생이 많습니다. 도안 색 계획 세우기·친구 작품 관찰 기록처럼 펜 없이 하는 활동을 함께 준비해 주세요.',
      )
    }
  }

  if (equipment.filament === null) {
    notes.push('필라멘트는 입력에 없어 보유량을 확인하지 못했습니다. 색마다 한 통 이상 준비되어 있는지 확인해 주세요.')
  }

  return {
    pen_count: equipment.pen_count,
    students_per_pen,
    rotations,
    notes,
  }
}
