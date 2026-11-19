/**
 * 수업 패키지 — 도안 한 장과 **함께 나가는 것들** (개발명세서 §6 · ADR-044).
 *
 * 만드는 것: 학습 목표 · 학생용 단계별 가이드 · 강사용 시간 배분 · 장비 운영 · 검증 상태 · 출처.
 *
 * 이 파일이 지켜야 하는 것 세 가지:
 *
 * 1. **가이드의 부품 id 는 실제 도안의 부품이다.** 문장을 LLM 이 쓰든 팩이 들고 있든,
 *    단계가 가리키는 부품은 `pattern.parts` 에 있어야 한다 — 없으면 `PLAN_PART_UNKNOWN`
 *    (error) 이고 그 지도안은 나가지 않는다 (개발명세서 §8-8).
 * 2. **시간 배분의 합은 수업 시간과 같다.** 어긋나면 `PLAN_TIME_MISMATCH` (error).
 * 3. **기하 통과를 수업 검증으로 적지 않는다.** 제작 시간은 실측이 없으면 `estimated` 이고,
 *    주제 일치는 사람이 보지 않았으면 `needs_review` 다 (개발명세서 §5D·§8-7).
 *
 * 숫자를 만들지 않는다 — 시간·부품 수는 `penMetrics` 와 `lessonConstraints` 에서 받는다.
 */

import { HARNESS_FINDING_SEVERITY, PEN_SHARE_LIMIT, TIME_SAFETY } from '@/lib/studio/constants'
import { equipmentPlan, type LessonConstraints } from '@/lib/studio/harness/constraints'
import type { MatchedBy } from '@/lib/studio/harness/retrieve'
import type {
  Evidence,
  Finding,
  GuideStep,
  LessonPackage,
  LessonPlanMinutes,
  PackDesign,
  PenMetrics,
  PenPattern,
  StudioCalibration,
  VerificationState,
} from '@/types/studio'

/** 하네스 검사 한 건. 코드의 심각도는 `constants.ts` 가 정한다 (`PEN_*` 와 섞지 않는다) */
export function harnessFinding(
  code: string,
  message: string,
  extra: { where?: string; measured?: number; limit?: number } = {},
): Finding {
  return {
    code,
    severity: HARNESS_FINDING_SEVERITY[code] ?? 'warn',
    message,
    ...extra,
  }
}

export type PackageInput = {
  pattern: PenPattern
  metrics: PenMetrics
  constraints: LessonConstraints
  /** 2D 인가. 조립 단계가 들어갈 수 있는지를 정한다 (ADR-037) */
  flat: boolean
  /** 팩 항목. 실시간 LLM 이나 폴백으로 만든 경우에는 `null` */
  design: PackDesign | null
  /** 사람이 검수한 모양인가 */
  reviewed: boolean
  /** 물리 검증을 통과했는가. **여기서 만들지 않고 받는다** — 판정은 `validatePen` 이 한다 */
  geometry_ok: boolean
  /** 요청한 사물과 다른 모양인가 */
  substitute: boolean
  calibration: StudioCalibration | null
  evidence: Evidence[]
  authored_by: LessonPackage['authored_by']
  /** 학생 과제 문장. 산출물의 `tasks` 를 그대로 받는다 */
  tasks: string[]
}

/**
 * 시간 배분. **합이 수업 시간과 같다** — `making_minutes` 는 안전 계수를 걸기 전의
 * 활동 시간이고, 도안을 그 안에 들어가도록 설계한 기준(`TIME_SAFETY` 적용분)은 메모로 적는다.
 */
function planMinutes(constraints: LessonConstraints): LessonPlanMinutes {
  const { intro_minutes, demo_minutes, wrap_minutes, activity_minutes } = constraints
  return {
    intro_minutes,
    demo_minutes,
    making_minutes: activity_minutes,
    wrap_minutes,
    total_minutes: intro_minutes + demo_minutes + activity_minutes + wrap_minutes,
  }
}

/**
 * 학생 가이드. **부품에서 만든다** — 문장을 먼저 쓰고 부품을 맞추는 것이 아니라,
 * 실제 부품 목록을 돌며 단계를 만든다. 그래서 가리키는 id 가 어긋날 수 없다.
 */
function guideSteps(input: PackageInput): GuideStep[] {
  const { pattern, flat, design } = input
  const steps: GuideStep[] = []
  const push = (text: string, part_ids: string[], caution: string | null = null) => {
    steps.push({ step: steps.length + 1, part_ids, text, caution })
  }

  const hasArt = pattern.parts.some((p) => p.art.length > 0)

  pattern.parts.forEach((part, index) => {
    const repeat =
      part.quantity > 1
        ? ` 같은 모양이 ${part.quantity}개 필요하므로, 같은 선 위에 ${part.quantity}번 반복해 그립니다 — 한 장을 떼어낸 뒤 다음 장을 그립니다.`
        : ''
    push(
      `도안의 ${index + 1}번 "${part.name}" 선을 따라 펜으로 덧그립니다. 선 위를 한 번 지나고, 끊긴 곳이 있으면 한 번 더 지나갑니다.${repeat}`,
      [part.id],
      // 팩이 들고 있는 "그 모양에서 실제로 걸리는 지점" 을 첫 단계에 붙인다.
      index === 0 ? (design?.focus ?? null) : null,
    )
  })

  /**
   * 색 영역은 **인쇄만 되는 참고 그림이다** (ADR-039). 펜이 그 경계를 지나가지 않으므로
   * "색을 채운다" 고 적지 않는다 — 그렇게 적으면 학생이 검사받지 않은 선을 긋게 되고,
   * 제작 시간 계산(덧그릴 선 길이)과도 어긋난다.
   */
  if (hasArt) {
    push(
      '인쇄된 색은 참고 그림입니다. 선을 그을 때 그 자리의 색과 같은 필라멘트를 골라 쓰면 완성품이 그림처럼 됩니다 — 색 영역의 경계를 따라 긋지 않습니다. 펜이 지나가는 길은 검은 선뿐입니다.',
      pattern.parts.filter((p) => p.art.length > 0).map((p) => p.id),
      '색을 바꿀 때 앞 색이 노즐에 남습니다. 종이 밖에서 조금 뽑아 버린 뒤 이어 그립니다.',
    )
  }

  push(
    '부품이 식은 뒤에 종이에서 떼어냅니다. 따뜻할 때 떼면 늘어나고, 떼기 어려우면 선생님에게 말합니다.',
    pattern.parts.map((p) => p.id),
    '떼어낼 때는 가늘고 긴 부위를 잡지 않습니다. 가장 넓은 부위를 잡고 천천히 듭니다.',
  )

  const byId = new Map(pattern.parts.map((p) => [p.id, p]))
  for (const joint of pattern.joints) {
    const a = byId.get(joint.a)?.name ?? joint.a
    const b = byId.get(joint.b)?.name ?? joint.b
    const where = joint.count > 1 ? ` (${joint.count}곳)` : ''
    push(`${a} ↔ ${b}${where}: ${joint.how}`, [joint.a, joint.b])
  }

  if (flat) {
    push(
      '가장자리에서 끊긴 곳을 펜으로 메우고, 뒤틀렸으면 식기 전에 평평한 곳에 눌러 둡니다.',
      pattern.parts.map((p) => p.id),
      null,
    )
  }

  /**
   * 완성 확인은 **학생이 스스로 본다.** "선생님께 검사받습니다" 로 적지 않는다 — 20명이
   * 줄을 서면 그 자체가 수업 시간이 된다. 무엇을 보면 되는지는 모양마다 다르므로 팩이 들고 있다.
   */
  if (design?.check) {
    push(`완성했는지 스스로 확인합니다. ${design.check}`, pattern.parts.map((p) => p.id), null)
  }

  return steps
}

function verification(input: PackageInput): VerificationState {
  const { metrics, constraints, calibration, reviewed, substitute } = input
  return {
    geometry: input.geometry_ok ? 'passed' : 'failed',
    time:
      calibration !== null
        ? 'calibrated'
        : metrics.estimated_minutes > 0
          ? 'estimated'
          : 'unknown',
    topic_match: reviewed && !substitute ? 'reviewed' : 'needs_review',
    // 현장 결과는 같은 레시피·학년대 피드백이 쌓였을 때만 `verified` 다 (ADR-032)
    field: calibration !== null ? 'verified' : 'unverified',
    unconfirmed: constraints.unconfirmed,
  }
}

function lessonNotes(input: PackageInput): string[] {
  const { metrics, constraints, flat, pattern } = input
  const notes: string[] = []

  notes.push(
    `예상 제작 시간은 ${Math.round(metrics.estimated_minutes)}분입니다. 도안은 활동 시간 ${constraints.activity_minutes}분의 ${Math.round(TIME_SAFETY * 100)}%(${Math.round(constraints.making_minutes)}분) 안에 들어가도록 치수를 잡았습니다 — 남는 시간은 늦게 끝나는 학생을 위한 여유입니다.`,
  )
  notes.push(
    `도입 ${constraints.intro_minutes}분에는 완성 예시를 보여 주고, 안전·시범 ${constraints.demo_minutes}분에는 노즐 온도와 떼어내는 방법을 직접 보여 주세요.`,
  )
  /**
   * 먼저 끝낸 학생. 팩이 **그 모양에 맞는 과제**를 들고 있으면 그것을 적는다 — 일반론을
   * 적어 두면 강사가 교실에서 다시 생각해야 한다.
   */
  notes.push(
    input.design?.extension
      ? `먼저 끝낸 학생에게: ${input.design.extension}`
      : '먼저 끝낸 학생에게 줄 과제를 하나 준비해 주세요 — 안쪽에 자기 무늬를 더하거나, 같은 모양을 한 장 더 만들어 겹치는 것이면 됩니다.',
  )
  /**
   * 한 장이 활동 시간의 절반도 쓰지 않는 경우. **흔하다** — 2D 한 장의 덧그릴 선은 짧다.
   * 이때 "제작 실습 N분" 만 적어 두면 강사는 남는 시간을 어떻게 쓸지 알 수 없다.
   * 몇 개를 만들 수 있는지는 계산값(예상 시간)에서 바로 나오므로 그것을 적는다.
   */
  if (metrics.estimated_minutes > 0 && metrics.estimated_minutes * 2 <= constraints.making_minutes) {
    const copies = Math.floor(constraints.making_minutes / Math.max(0.5, metrics.estimated_minutes))
    notes.push(
      `한 장이 예상 ${Math.round(metrics.estimated_minutes)}분이므로 활동 시간 안에 ${Math.min(copies, 8)}개까지 만들 수 있는 계산입니다. 색을 바꿔 한 장 더 만들게 하거나, 모둠이 색을 나눠 맞추게 하면 남는 시간을 씁니다 — 이 숫자는 선 길이에서 나온 추정이고 실측이 아닙니다.`,
    )
  }
  if (metrics.estimated_minutes > constraints.making_minutes * 0.9) {
    const optional = pattern.parts.filter((p) => p.optional).map((p) => p.name)
    notes.push(
      optional.length > 0
        ? `시간이 모자라면 ${optional.join(' · ')} 를 빼고 진행하세요. 나머지만으로도 완성됩니다.`
        : '시간이 모자라면 안쪽 장식 선을 빼고 테두리만 그리게 하세요.',
    )
  }
  if (!flat && pattern.joints.length > 0) {
    notes.push('조립은 모둠별로 한 명씩 돌아가며 붙이게 하면 기다리는 시간이 줄어듭니다.')
  }
  notes.push(
    '수업이 끝난 뒤 시도 인원·완성 인원·실제 걸린 시간을 기록해 주세요. 세 번 이상 쌓이면 다음 생성의 시간 계산에 반영됩니다.',
  )
  return notes
}

export function lessonPackage(input: PackageInput): LessonPackage {
  const { design, flat, tasks } = input

  const objectives: string[] = []
  if (design?.objective) objectives.push(design.objective)
  objectives.push(
    flat
      ? '3D펜으로 닫힌 선을 이어 그리고, 식힌 뒤 떼어내는 과정을 안전하게 수행한다'
      : '부품을 만들어 순서에 따라 결합해 입체 작품을 완성한다',
  )
  if (tasks.length > 0) {
    objectives.push('완성한 작품을 친구에게 설명하고, 고칠 점을 한 문장으로 말한다')
  }

  return {
    objectives: objectives.slice(0, 3),
    student_guide: guideSteps(input),
    lesson_plan: planMinutes(input.constraints),
    lesson_notes: lessonNotes(input),
    equipment_plan: equipmentPlan(input.constraints),
    verification: verification(input),
    evidence: input.evidence,
    authored_by: input.authored_by,
  }
}

/**
 * 지도안 정합성 (개발명세서 §5E). **여기서 error 가 나오면 그 산출물은 통과하지 않는다.**
 *
 * 우리가 만든 패키지는 부품에서 단계를 만들므로 걸리지 않는다. 이 검사가 필요한 이유는
 * **문장을 밖에서 받을 수 있기 때문**이다 — LLM 이 없는 부품 번호를 적거나, 2D 산출물에
 * 조립 단계를 섞으면 교실에서 쓸 수 없는 지도안이 된다.
 */
export function validatePackage(
  pkg: LessonPackage,
  pattern: PenPattern,
  constraints: LessonConstraints,
  flat: boolean,
): Finding[] {
  const findings: Finding[] = []
  const ids = new Set(pattern.parts.map((p) => p.id))

  for (const step of pkg.student_guide) {
    if (step.text.trim() === '') {
      findings.push(
        harnessFinding('PLAN_STEP_EMPTY', `${step.step}단계에 설명이 없습니다.`, {
          where: `step-${step.step}`,
        }),
      )
    }
    for (const id of step.part_ids) {
      if (ids.has(id)) continue
      findings.push(
        harnessFinding(
          'PLAN_PART_UNKNOWN',
          `${step.step}단계가 도안에 없는 부품 "${id}" 을 가리킵니다.`,
          { where: `step-${step.step}` },
        ),
      )
    }
  }

  const plan = pkg.lesson_plan
  const sum = plan.intro_minutes + plan.demo_minutes + plan.making_minutes + plan.wrap_minutes
  if (sum !== constraints.duration_minutes || plan.total_minutes !== sum) {
    findings.push(
      harnessFinding(
        'PLAN_TIME_MISMATCH',
        `시간 배분의 합(${sum}분)이 수업 시간(${constraints.duration_minutes}분)과 다릅니다.`,
        { where: 'lesson-plan', measured: sum, limit: constraints.duration_minutes },
      ),
    )
  }

  // 2D 는 조립하지 않는다 (ADR-037). 조립 단계가 섞이면 강사가 없는 부품을 찾는다.
  if (flat && pattern.joints.length === 0) {
    const assembling = pkg.student_guide.find((s) => /붙입니다|조립|끼웁니다/.test(s.text))
    if (assembling) {
      findings.push(
        harnessFinding(
          'PLAN_MODE_MISMATCH',
          `2D 산출물인데 ${assembling.step}단계에 조립 지시가 들어 있습니다.`,
          { where: `step-${assembling.step}` },
        ),
      )
    }
  }

  return findings
}

/**
 * 시간·장비·주제 일치의 **검사 결과** (개발명세서 §5B·C·D).
 *
 * 전부 warn 이다 — "확인이 필요하다" 는 사실이고 도안을 막을 근거가 아니다. 다만 화면에서
 * 지우지 않는다: 지우면 강사는 추정값을 실측으로 읽는다.
 */
export function harnessChecks(input: {
  package: LessonPackage
  constraints: LessonConstraints
  matched_by: MatchedBy | null
  substitute: boolean
  substitute_note: string | null
  retrieval_miss: boolean
  metrics: PenMetrics
}): Finding[] {
  const findings: Finding[] = []
  const { constraints, package: pkg } = input

  if (pkg.verification.time === 'estimated' || pkg.verification.time === 'unknown') {
    findings.push(
      harnessFinding(
        'TIME_ESTIMATE_UNVERIFIED',
        `예상 제작 시간 ${Math.round(input.metrics.estimated_minutes)}분은 **계산값이고 실측이 아닙니다.** 같은 도안·학년대의 수업 결과가 세 번 쌓이면 실제 시간으로 보정합니다.`,
        { where: 'lesson-plan', measured: Math.round(input.metrics.estimated_minutes) },
      ),
    )
  }

  if (constraints.equipment.pen_count === null) {
    findings.push(
      harnessFinding(
        'EQUIP_PEN_COUNT_UNKNOWN',
        '장비 입력에서 3D펜 수량을 읽지 못했습니다. 수량을 적으면 교대 조와 조별 시간을 계산합니다.',
        { where: 'equipment' },
      ),
    )
  } else if (constraints.students_per_pen !== null && constraints.students_per_pen > PEN_SHARE_LIMIT) {
    findings.push(
      harnessFinding(
        'EQUIP_PEN_SHARED',
        `3D펜 한 자루를 ${constraints.students_per_pen}명이 나눠 씁니다. 교대로 진행해야 하고, 기다리는 학생의 활동이 따로 필요합니다.`,
        {
          where: 'equipment',
          measured: constraints.students_per_pen,
          limit: PEN_SHARE_LIMIT,
        },
      ),
    )
  }

  if (constraints.equipment.filament === null) {
    findings.push(
      harnessFinding(
        'EQUIP_FILAMENT_UNCONFIRMED',
        '필라멘트가 장비 입력에 없습니다. 보유량을 확인해 주세요 — 없다고 판단한 것이 아닙니다.',
        { where: 'equipment' },
      ),
    )
  }

  if (input.substitute && input.substitute_note) {
    findings.push(harnessFinding('TOPIC_SUBSTITUTED', input.substitute_note, { where: 'shape' }))
  }

  // 분류(태그)만 맞아서 고른 모양은 요청한 사물이 아닐 수 있다. 그 사실을 적는다.
  if (!input.substitute && (input.matched_by === 'tag' || input.matched_by === 'partial')) {
    findings.push(
      harnessFinding(
        'TOPIC_MATCH_UNVERIFIED',
        '주제와 같은 단어가 목록에 없어 분류가 같은 모양을 골랐습니다. 인쇄 전에 모양이 주제에 맞는지 확인해 주세요.',
        { where: 'shape' },
      ),
    )
  }

  if (input.retrieval_miss) {
    findings.push(
      harnessFinding(
        'RETRIEVAL_MISS',
        '검수된 목록에서 이 주제에 맞는 모양을 찾지 못했습니다. 아래에 적힌 경로로 만들었습니다.',
        { where: 'shape' },
      ),
    )
  }

  return findings
}
