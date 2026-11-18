/**
 * 3D펜 도안 검증. **이 파일이 "수업에 쓸 수 있다"를 판정한다** (ADR-030).
 *
 * 임계값은 전부 `constants.ts` 에서 온다. 여기서 숫자를 쓰지 말 것 —
 * 검증을 통과시키려고 임계값을 만지는 일이 생기지 않게 하려는 분리다.
 *
 * 항목과 코드는 `docs/STUDIO.md` 의 표와 1:1이고, 심각도는 `PEN_FINDING_SEVERITY` 가 정한다.
 */

import {
  type PenLimit,
  CLOSED_TOLERANCE_MM,
  CLASS_OVERHEAD_MINUTES,
  PEEL_SECONDS_PER_PART,
  PEN_EQUIPMENT_KEYWORDS,
  PEN_FINDING_SEVERITY,
  PEN_LIMITS,
  SLOT_CLEARANCE_MM,
  TIME_SAFETY,
  TIME_TIGHT_RATIO,
  WELD_MIN_LENGTH_MM,
  WELD_SECONDS_PER_JOINT,
} from '@/lib/studio/constants'
import {
  featureEdges,
  interiorAngles,
  isClosedPath,
  minGap,
  type MinGapOptions,
  rectsOverlap,
  segIntersects,
  segments,
  strokeLength,
} from '@/lib/studio/geometry'
import { layoutPattern } from '@/lib/studio/pen3d/layout'
import {
  formOf,
  reportOf,
  type Finding,
  type PenMetrics,
  type PenPart,
  type PenPattern,
  type Stroke,
  type StudioSpec,
  type ValidationReport,
} from '@/types/studio'

/**
 * 간격 판정 옵션. **생성기와 검증기가 같은 값을 봐야 한다** — 보정(`pen3d/shape.ts`)이
 * 다른 옵션으로 재면 "보정이 통과시킨 모양이 검증에서 떨어지는" 일이 생긴다.
 */
export function penGapOptions(limit: PenLimit): MinGapOptions {
  return { pathSkip: Math.max(10, limit.min_gap_mm * 3) }
}

export type PenValidateOptions = {
  /** 성과 피드백에서 온 시간 보정 계수. 1 보다 크면 예상 시간이 늘어난다 (ADR-032) */
  speedFactor?: number
}

function finding(code: string, message: string, extra: Partial<Finding> = {}): Finding {
  return {
    code,
    severity: PEN_FINDING_SEVERITY[code] ?? 'error',
    message,
    ...extra,
  }
}

/** 지적 한 건을 만든다. 심각도는 `PEN_FINDING_SEVERITY` 한 곳에서만 온다 */
export { finding as penFinding }

const round1 = (n: number) => Math.round(n * 10) / 10
const finiteOrNull = (n: number) => (Number.isFinite(n) ? round1(n) : null)

function partPerimeter(part: PenPart): number {
  return part.strokes
    .filter((s) => s.kind === 'outline')
    .reduce((sum, s) => sum + strokeLength(s), 0)
}

/**
 * 윤곽이 스스로 교차하는가. 닫힌 윤곽에서 **이웃한 변끼리는 끝점을 공유**하므로 건너뛴다
 * (첫 변과 마지막 변도 이웃이다).
 */
function selfIntersects(stroke: Stroke): boolean {
  const segs = segments(stroke)
  for (let i = 0; i < segs.length; i += 1) {
    for (let j = i + 2; j < segs.length; j += 1) {
      if (i === 0 && j === segs.length - 1) continue
      if (segIntersects(segs[i]!, segs[j]!)) return true
    }
  }
  return false
}

function partFeatures(part: PenPart): number[] {
  return part.strokes.flatMap((s) => featureEdges(s))
}

export function hasPenEquipment(equipment: string[]): boolean {
  const text = equipment.join(' ').toLowerCase()
  return PEN_EQUIPMENT_KEYWORDS.some((k) => text.includes(k))
}

/**
 * 난이도 1~5. **측정값이다** — 레시피에 사람이 매겨 둔 `nominal_difficulty`(후보 필터용)와
 * 다를 수 있다. 부품 수·접합 수·곡선 비율·최소 특징 크기·입체 결합(끼움/접기)을 합산한다.
 */
export function penDifficulty(input: {
  part_count: number
  joint_count: number
  curve_ratio: number
  min_feature_mm: number
  has_slot: boolean
  has_fold: boolean
}): number {
  const { part_count, joint_count, curve_ratio, min_feature_mm, has_slot, has_fold } = input
  let score = 0
  score += part_count <= 3 ? 0 : part_count <= 6 ? 1 : part_count <= 10 ? 2 : 3
  score += joint_count <= 2 ? 0 : joint_count <= 6 ? 1 : joint_count <= 12 ? 2 : 3
  score += curve_ratio > 0.5 ? 1 : 0
  score += min_feature_mm < 12 ? 1 : 0
  score += has_slot || has_fold ? 1 : 0
  return Math.max(1, Math.min(5, 1 + Math.round((score / 9) * 4)))
}

export function penMetrics(
  pattern: PenPattern,
  spec: StudioSpec,
  options: PenValidateOptions = {},
): PenMetrics {
  const limit = PEN_LIMITS[spec.grade_band]
  const speedFactor = options.speedFactor ?? 1

  const part_count = pattern.parts.reduce((sum, p) => sum + p.quantity, 0)
  const joint_count = pattern.joints.reduce((sum, j) => sum + j.count, 0)

  const total_stroke_mm = pattern.parts.reduce(
    (sum, part) =>
      sum + part.strokes.reduce((s, stroke) => s + strokeLength(stroke), 0) * part.quantity,
    0,
  )

  // 곡선 비율 — 코너 없이 길게 이어지는 선의 비중. 난이도 산정에만 쓴다.
  let curveLength = 0
  for (const part of pattern.parts) {
    for (const stroke of part.strokes) {
      const edges = featureEdges(stroke)
      const len = strokeLength(stroke)
      if (edges.length <= 2 && len > 0) curveLength += len * part.quantity
    }
  }

  const gaps = pattern.parts.map((part) => minGap(part.strokes, penGapOptions(limit)))
  const features = pattern.parts.flatMap(partFeatures)
  const angles = pattern.parts.flatMap((p) =>
    p.strokes.filter((s) => s.kind === 'outline').flatMap((s) => interiorAngles(s)),
  )

  const draw_seconds = total_stroke_mm / limit.draw_speed_mm_s
  const peel_seconds = part_count * PEEL_SECONDS_PER_PART
  const weld_seconds = joint_count * WELD_SECONDS_PER_JOINT
  const estimated_minutes = ((draw_seconds + peel_seconds + weld_seconds) * speedFactor) / 60
  const available_minutes = Math.max(
    0,
    (spec.duration_minutes - CLASS_OVERHEAD_MINUTES) * TIME_SAFETY,
  )

  const minFeature = features.length > 0 ? Math.min(...features) : Number.POSITIVE_INFINITY
  const { placed } = layoutPattern(pattern)

  return {
    part_count,
    unique_part_count: pattern.parts.length,
    joint_count,
    total_stroke_mm,
    min_gap_mm: finiteOrNull(Math.min(...gaps, Number.POSITIVE_INFINITY)),
    min_segment_mm: finiteOrNull(minFeature),
    min_angle_deg: angles.length > 0 ? round1(Math.min(...angles)) : null,
    draw_seconds,
    peel_seconds,
    weld_seconds,
    estimated_minutes,
    available_minutes,
    difficulty: penDifficulty({
      part_count,
      joint_count,
      curve_ratio: total_stroke_mm > 0 ? curveLength / total_stroke_mm : 0,
      min_feature_mm: minFeature,
      has_slot: pattern.joints.some((j) => j.kind === 'slot'),
      has_fold: pattern.parts.some((p) => p.strokes.some((s) => s.kind === 'fold')),
    }),
    page_fit: placed.every((r) => r !== null),
  }
}

/** 접합 그래프가 하나로 이어지는가. 같은 부품의 복제끼리 붙는 접합(a === b)도 연결로 본다. */
function assemblyConnected(pattern: PenPattern): boolean {
  const ids = pattern.parts.map((p) => p.id)
  if (ids.length <= 1) return true
  const parent = new Map(ids.map((id) => [id, id]))
  const find = (x: string): string => {
    let cur = x
    while (parent.get(cur) !== cur) cur = parent.get(cur) as string
    return cur
  }
  for (const joint of pattern.joints) {
    if (!parent.has(joint.a) || !parent.has(joint.b)) continue
    const ra = find(joint.a)
    const rb = find(joint.b)
    if (ra !== rb) parent.set(ra, rb)
  }
  return new Set(ids.map(find)).size === 1
}

export function validatePen(
  pattern: PenPattern,
  spec: StudioSpec,
  options: PenValidateOptions = {},
): { report: ValidationReport; metrics: PenMetrics; pattern: PenPattern } {
  const limit = PEN_LIMITS[spec.grade_band]
  const metrics = penMetrics(pattern, spec, options)
  const laid = layoutPattern(pattern)
  const findings: Finding[] = []

  // ── 장비 ──────────────────────────────────────────────────────────────────
  if (!hasPenEquipment(spec.equipment)) {
    findings.push(
      finding(
        'PEN_EQUIPMENT_MISSING',
        '보유 장비에 3D펜·필라멘트가 없습니다. 회차의 장비 목록에 추가한 뒤 다시 만들어 주세요.',
      ),
    )
  }

  // ── 부품 기하 ─────────────────────────────────────────────────────────────
  for (const part of pattern.parts) {
    for (const stroke of part.strokes) {
      if (stroke.kind !== 'outline') continue
      if (!isClosedPath(stroke, CLOSED_TOLERANCE_MM)) {
        findings.push(
          finding('PEN_PATH_NOT_CLOSED', `${part.name}의 윤곽선이 닫히지 않았습니다.`, {
            where: part.name,
          }),
        )
      }
      // 스스로 교차하는 윤곽은 그려 놓으면 멀쩡해 보이지만 떼어낼 때 교차점에서 찢어진다.
      // 레시피는 사람이 검수했지만 조합(ADR-034)은 아무도 보지 않으므로 여기서 본다.
      if (selfIntersects(stroke)) {
        findings.push(
          finding(
            'PEN_SELF_INTERSECT',
            `${part.name}의 윤곽선이 스스로 교차합니다. 꼬인 선은 떼어낼 때 그 자리에서 찢어집니다.`,
            { where: part.name },
          ),
        )
      }
    }
  }

  if (metrics.min_segment_mm !== null && metrics.min_segment_mm < limit.min_segment_mm) {
    findings.push(
      finding(
        'PEN_SEGMENT_TOO_SHORT',
        `가장 짧은 선이 ${metrics.min_segment_mm}mm 입니다. 이 학년대에서는 ${limit.min_segment_mm}mm 이상이어야 선으로 그을 수 있습니다.`,
        { measured: metrics.min_segment_mm, limit: limit.min_segment_mm },
      ),
    )
  }

  if (metrics.min_angle_deg !== null && metrics.min_angle_deg < limit.min_angle_deg) {
    findings.push(
      finding(
        'PEN_ANGLE_TOO_SHARP',
        `가장 뾰족한 꼭짓점이 ${metrics.min_angle_deg}도 입니다. ${limit.min_angle_deg}도보다 날카로우면 그 자리에 덩어리가 생깁니다.`,
        { measured: metrics.min_angle_deg, limit: limit.min_angle_deg },
      ),
    )
  }

  if (metrics.min_gap_mm !== null && metrics.min_gap_mm < limit.min_gap_mm) {
    findings.push(
      finding(
        'PEN_GAP_TOO_SMALL',
        `떨어져 있어야 하는 두 선의 간격이 ${metrics.min_gap_mm}mm 입니다. ${limit.min_gap_mm}mm 미만이면 두 선이 녹아 붙습니다.`,
        { measured: metrics.min_gap_mm, limit: limit.min_gap_mm },
      ),
    )
  }

  // ── 종이 ──────────────────────────────────────────────────────────────────
  laid.placed.forEach((rect, i) => {
    if (rect === null) {
      findings.push(
        finding(
          'PEN_PART_OUT_OF_PAGE',
          `${pattern.parts[i]!.name}이 A4 한 장에 들어가지 않습니다. 크기를 줄이거나 부품을 나눠야 합니다.`,
          { where: pattern.parts[i]!.name },
        ),
      )
    }
  })

  for (let i = 0; i < laid.placed.length; i += 1) {
    for (let j = i + 1; j < laid.placed.length; j += 1) {
      const a = laid.placed[i]
      const b = laid.placed[j]
      if (a && b && rectsOverlap(a, b)) {
        findings.push(
          finding(
            'PEN_PARTS_OVERLAP',
            `${pattern.parts[i]!.name}과 ${pattern.parts[j]!.name}의 도안이 겹칩니다.`,
            { where: `${pattern.parts[i]!.name}·${pattern.parts[j]!.name}` },
          ),
        )
      }
    }
  }

  // ── 분량과 시간 ───────────────────────────────────────────────────────────
  if (metrics.part_count > limit.max_parts) {
    findings.push(
      finding(
        'PEN_TOO_MANY_PARTS',
        `부품이 1인당 ${metrics.part_count}개입니다. 이 학년대 상한은 ${limit.max_parts}개입니다.`,
        { measured: metrics.part_count, limit: limit.max_parts },
      ),
    )
  }

  if (metrics.estimated_minutes > metrics.available_minutes) {
    findings.push(
      finding(
        'PEN_TIME_OVER',
        `예상 제작 시간 ${round1(metrics.estimated_minutes)}분이 가용 시간 ${round1(metrics.available_minutes)}분을 넘습니다. (수업 ${spec.duration_minutes}분 − 준비·정리 ${CLASS_OVERHEAD_MINUTES}분)`,
        { measured: round1(metrics.estimated_minutes), limit: round1(metrics.available_minutes) },
      ),
    )
  } else if (metrics.estimated_minutes > metrics.available_minutes * TIME_TIGHT_RATIO) {
    findings.push(
      finding(
        'PEN_TIME_TIGHT',
        `예상 제작 시간 ${round1(metrics.estimated_minutes)}분이 가용 시간 ${round1(metrics.available_minutes)}분에 빠듯합니다. 먼저 끝낸 학생용 과제를 준비해 주세요.`,
        { measured: round1(metrics.estimated_minutes), limit: round1(metrics.available_minutes) },
      ),
    )
  }

  // ── 접합 구조 ─────────────────────────────────────────────────────────────
  /**
   * **2D 는 조립하지 않으므로 접합 검사를 받지 않는다** (ADR-037).
   *
   * 면제되는 것은 "모든 부품에 접합이 있어야 한다"와 "접합 그래프가 하나로 이어져야 한다"
   * 둘뿐이다. 물리 임계값(간격·선분·내각·닫힘·자기교차·A4·시간·부품 수)과 접합 규격 검사는
   * 모드와 무관하게 그대로 받는다 — 임계값 면제가 아니라 산출물 종류가 다른 것이다.
   *
   * 옛 행(form 이 없는 spec)은 formOf 가 solid 로 읽는다. 전부 입체였기 때문이다.
   */
  const flat = formOf(spec) === 'flat'

  if (flat) {
    const hasSilhouette = pattern.parts.some((part) =>
      part.strokes.some((s) => s.kind === 'outline' && isClosedPath(s, CLOSED_TOLERANCE_MM)),
    )
    if (!hasSilhouette) {
      findings.push(
        finding(
          'PEN_FLAT_NO_SILHOUETTE',
          '2D 도안인데 떼어낼 수 있는 닫힌 윤곽이 없습니다. 선 한 줄은 떼어내면 늘어집니다.',
        ),
      )
    }
  }

  const joined = new Set(pattern.joints.flatMap((j) => [j.a, j.b]))
  for (const part of flat ? [] : pattern.parts) {
    if (!joined.has(part.id)) {
      findings.push(
        finding(
          'PEN_JOINT_UNPAIRED',
          `${part.name}을 어디에 붙이는지가 도안에 없습니다. 조립되지 않는 부품입니다.`,
          { where: part.name },
        ),
      )
    }
  }

  const byId = new Map(pattern.parts.map((p) => [p.id, p]))
  for (const joint of pattern.joints) {
    const a = byId.get(joint.a)
    const b = byId.get(joint.b)
    if (!a || !b) {
      findings.push(
        finding('PEN_JOINT_UNPAIRED', `접합 ${joint.id}이 없는 부품을 가리킵니다.`, {
          where: joint.id,
        }),
      )
      continue
    }

    /**
     * 같은 부품의 복제끼리 붙는 접합(적층·정다면체)은 **복제를 전부 이을 만큼** 있어야 한다.
     * 층 3장을 1곳만 붙이면 한 장이 떨어져 나온다 (ADR-037).
     */
    if (joint.a === joint.b) {
      const copies = a.quantity
      const need = Math.max(1, copies - 1)
      if (copies < 2 || joint.count < need) {
        findings.push(
          finding(
            'PEN_LAYER_COUNT_INVALID',
            `${a.name} ${copies}개를 ${joint.count}곳으로 붙입니다. 복제를 전부 이으려면 ${need}곳 이상이어야 합니다.`,
            { where: joint.id, measured: joint.count, limit: need },
          ),
        )
      }
    }

    if (joint.kind === 'weld') {
      const length = joint.length_mm ?? 0
      const maxWeld = Math.min(partPerimeter(a), partPerimeter(b)) / 2
      if (length < WELD_MIN_LENGTH_MM) {
        findings.push(
          finding(
            'PEN_JOINT_SIZE_MISMATCH',
            `${a.name}–${b.name} 접합 길이가 ${length}mm 입니다. ${WELD_MIN_LENGTH_MM}mm 보다 짧으면 떼어낼 때 떨어집니다.`,
            { where: joint.id, measured: length, limit: WELD_MIN_LENGTH_MM },
          ),
        )
      } else if (length > maxWeld) {
        findings.push(
          finding(
            'PEN_JOINT_SIZE_MISMATCH',
            `${a.name}–${b.name} 접합 길이 ${length}mm 가 부품 둘레의 절반(${round1(maxWeld)}mm)을 넘습니다.`,
            { where: joint.id, measured: length, limit: round1(maxWeld) },
          ),
        )
      } else if (joint.flush) {
        const tol = 0.5
        const match = (part: PenPart) =>
          partFeatures(part).some((edge) => Math.abs(edge - length) <= tol)
        if (!match(a) || !match(b)) {
          findings.push(
            finding(
              'PEN_JOINT_SIZE_MISMATCH',
              `${a.name}–${b.name}을 변끼리 맞붙이는데 ${length}mm 짜리 변이 양쪽에 없습니다.`,
              { where: joint.id, measured: length },
            ),
          )
        }
      }
    }

    if (joint.kind === 'slot') {
      const tab = joint.tab_thickness_mm ?? 0
      const slot = joint.slot_width_mm ?? 0
      const clearance = round1(slot - tab)
      const [lo, hi] = SLOT_CLEARANCE_MM
      if (clearance < lo || clearance > hi) {
        findings.push(
          finding(
            'PEN_JOINT_SIZE_MISMATCH',
            `끼움 여유가 ${clearance}mm 입니다. ${lo}~${hi}mm 밖이면 끼워지지 않거나 끼워도 흔들립니다.`,
            { where: joint.id, measured: clearance, limit: hi },
          ),
        )
      }
    }
  }

  if (!flat && !assemblyConnected(pattern)) {
    findings.push(
      finding(
        'PEN_ASSEMBLY_DISCONNECTED',
        '접합을 따라가면 부품이 한 덩어리로 이어지지 않습니다. 조각난 조립입니다.',
      ),
    )
  }

  // ── 난이도 (warn) ─────────────────────────────────────────────────────────
  const [lo, hi] = limit.difficulty
  if (metrics.difficulty < lo || metrics.difficulty > hi) {
    findings.push(
      finding(
        'PEN_DIFFICULTY_MISMATCH',
        `산정 난이도 ${metrics.difficulty}단계가 이 학년대 권장 범위(${lo}~${hi})를 벗어납니다. 일부러 고른 것이면 그대로 쓰셔도 됩니다.`,
        { measured: metrics.difficulty, limit: hi },
      ),
    )
  }

  return { report: reportOf(findings), metrics, pattern: laid.pattern }
}
