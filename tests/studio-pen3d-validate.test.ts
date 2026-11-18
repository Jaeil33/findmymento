import { describe, expect, it } from 'vitest'
import { PEN_FINDING_SEVERITY, PEN_LIMITS } from '@/lib/studio/constants'
import { buildPattern, recipeById } from '@/lib/studio/pen3d/recipes'
import { penMetrics, validatePen } from '@/lib/studio/pen3d/validate'
import { rectPoints } from '@/lib/studio/geometry'
import type { GradeBand } from '@/types/domain'
import type { PenPart, PenPattern, Stroke, StudioSpec } from '@/types/studio'

/**
 * 검증기 테스트. 항목마다 **위반하는 패턴을 만들어 그 코드가 잡히는지** 본다.
 * 통과 사례만 보는 테스트는 검증기가 아무것도 안 해도 통과한다.
 */

const spec = (over: Partial<StudioSpec> = {}): StudioSpec => ({
  kind: 'pen3d',
  grade_band: 'middle',
  student_count: 20,
  duration_minutes: 90,
  venue: '교실',
  equipment: ['3D펜 20자루', 'PLA 필라멘트', '실리콘 매트'],
  topic: '정육면체 조명',
  session_id: null,
  ...over,
})

const outline = (points: { x: number; y: number }[]): Stroke => ({
  kind: 'outline',
  points,
  closed: true,
})

const part = (over: Partial<PenPart> & { id: string }): PenPart => ({
  name: over.id,
  quantity: 1,
  strokes: [outline(rectPoints(40, 30))],
  // 검증기는 색 영역을 **보지 않는다** (ADR-039). 기본값이 빈 배열인 것이 그 뜻이다.
  art: [],
  origin: { x: 0, y: 0 },
  optional: false,
  ...over,
})

const pattern = (over: Partial<PenPattern> = {}): PenPattern => ({
  recipe_id: 'test',
  title: '테스트',
  scale: 1,
  parts: [part({ id: 'a' }), part({ id: 'b' })],
  joints: [
    {
      id: 'a-b',
      kind: 'weld',
      a: 'a',
      b: 'b',
      count: 1,
      length_mm: 30,
      flush: true,
      how: '맞대어 붙입니다.',
    },
  ],
  ...over,
})

const codes = (p: PenPattern, s: StudioSpec) => validatePen(p, s).report.findings.map((f) => f.code)

describe('통과 사례 — 검수된 레시피는 조건이 맞으면 통과한다', () => {
  it('정육면체 조명 · 중등 90분 → error 0건', () => {
    const recipe = recipeById('cube-lantern')!
    const { report } = validatePen(buildPattern(recipe, recipe.defaults), spec())
    expect(report.findings.filter((f) => f.severity === 'error')).toEqual([])
    expect(report.ok).toBe(true)
  })

  it('이름 키링 · 초등 45분 → error 0건', () => {
    const recipe = recipeById('name-keyring')!
    const { report } = validatePen(
      buildPattern(recipe, recipe.defaults),
      spec({ grade_band: 'elementary', duration_minutes: 45, topic: '이름 키링' }),
    )
    expect(report.findings.filter((f) => f.severity === 'error')).toEqual([])
  })

  it('모든 검수 레시피가 기본 파라미터에서 기하 위반(간격·각도·닫힘·접합)을 내지 않는다', () => {
    const geometric = [
      'PEN_GAP_TOO_SMALL',
      'PEN_ANGLE_TOO_SHARP',
      'PEN_PATH_NOT_CLOSED',
      'PEN_JOINT_UNPAIRED',
      'PEN_JOINT_SIZE_MISMATCH',
      'PEN_ASSEMBLY_DISCONNECTED',
      'PEN_PART_OUT_OF_PAGE',
      'PEN_PARTS_OVERLAP',
    ]
    for (const band of ['elementary', 'middle', 'high'] as GradeBand[]) {
      for (const recipe of [
        'name-keyring',
        'cube-lantern',
        'pyramid-lamp',
        'house-lamp',
        'flower-pot',
        'hex-box',
        'drone-frame',
        'cross-sphere',
      ]) {
        const r = recipeById(recipe)!
        // 초등 간격 하한(4mm)이 가장 빡빡하므로 학년대를 전부 돌린다.
        const found = codes(buildPattern(r, r.defaults), spec({ grade_band: band, duration_minutes: 180 }))
        for (const code of found) {
          expect(geometric, `${recipe}/${band} 에서 ${code}`).not.toContain(code)
        }
      }
    }
  })
})

describe('장비', () => {
  it('3D펜이 장비에 없으면 PEN_EQUIPMENT_MISSING', () => {
    const recipe = recipeById('cube-lantern')!
    const found = codes(buildPattern(recipe, recipe.defaults), spec({ equipment: ['노트북', '빔프로젝터'] }))
    expect(found).toContain('PEN_EQUIPMENT_MISSING')
  })

  it('장비 문구가 달라도 키워드가 걸리면 통과한다', () => {
    const recipe = recipeById('cube-lantern')!
    for (const equipment of [['3D펜 15개'], ['3d pen x20'], ['PLA 필라멘트 5kg']]) {
      expect(codes(buildPattern(recipe, recipe.defaults), spec({ equipment }))).not.toContain(
        'PEN_EQUIPMENT_MISSING',
      )
    }
  })
})

describe('기하 위반', () => {
  it('윤곽이 닫히지 않으면 PEN_PATH_NOT_CLOSED', () => {
    const open: Stroke = {
      kind: 'outline',
      points: [
        { x: 0, y: 0 },
        { x: 40, y: 0 },
        { x: 40, y: 30 },
        { x: 10, y: 0 },
      ],
      closed: false,
    }
    const found = codes(pattern({ parts: [part({ id: 'a', strokes: [open] }), part({ id: 'b' })] }), spec())
    expect(found).toContain('PEN_PATH_NOT_CLOSED')
  })

  it('이어지지 않은 두 선이 가까우면 PEN_GAP_TOO_SMALL — 간격과 한계를 숫자로 알려준다', () => {
    const narrow: Stroke = {
      kind: 'outline',
      points: [
        { x: 0, y: 0 },
        { x: 40, y: 0 },
        { x: 40, y: 2 },
        { x: 0, y: 2 },
      ],
      closed: true,
    }
    const { report } = validatePen(
      pattern({ parts: [part({ id: 'a', strokes: [narrow] }), part({ id: 'b' })] }),
      spec(),
    )
    const finding = report.findings.find((f) => f.code === 'PEN_GAP_TOO_SMALL')
    expect(finding).toBeTruthy()
    expect(finding!.measured).toBeCloseTo(2, 1)
    expect(finding!.limit).toBe(PEN_LIMITS.middle.min_gap_mm)
    expect(report.ok).toBe(false)
  })

  it('초등 간격 하한이 중등보다 빡빡하다 — 3mm 간격은 중등 통과 · 초등 실패', () => {
    const gap3: Stroke = {
      kind: 'outline',
      points: [
        { x: 0, y: 0 },
        { x: 40, y: 0 },
        { x: 40, y: 3 },
        { x: 0, y: 3 },
      ],
      closed: true,
    }
    const p = pattern({ parts: [part({ id: 'a', strokes: [gap3] }), part({ id: 'b' })] })
    expect(codes(p, spec())).not.toContain('PEN_GAP_TOO_SMALL')
    expect(codes(p, spec({ grade_band: 'elementary' }))).toContain('PEN_GAP_TOO_SMALL')
  })

  it('너무 뾰족한 꼭짓점은 PEN_ANGLE_TOO_SHARP', () => {
    const spike: Stroke = {
      kind: 'outline',
      points: [
        { x: 0, y: 0 },
        { x: 60, y: 2 },
        { x: 0, y: 4 },
      ],
      closed: true,
    }
    const found = codes(pattern({ parts: [part({ id: 'a', strokes: [spike] }), part({ id: 'b' })] }), spec())
    expect(found).toContain('PEN_ANGLE_TOO_SHARP')
  })

  it('짧은 특징은 PEN_SEGMENT_TOO_SHORT — 단, 곡선 근사는 걸리지 않는다', () => {
    const tiny: Stroke = {
      kind: 'outline',
      points: [
        { x: 0, y: 0 },
        { x: 4, y: 0 },
        { x: 4, y: 20 },
        { x: 0, y: 20 },
      ],
      closed: true,
    }
    expect(codes(pattern({ parts: [part({ id: 'a', strokes: [tiny] }), part({ id: 'b' })] }), spec())).toContain(
      'PEN_SEGMENT_TOO_SHORT',
    )
    // 원판 레시피는 2mm 짜리 현으로 쪼개져 있지만 사람은 한 번에 긋는다. 걸리면 안 된다.
    const disc = recipeById('cross-sphere')!
    expect(codes(buildPattern(disc, disc.defaults), spec({ grade_band: 'high' }))).not.toContain(
      'PEN_SEGMENT_TOO_SHORT',
    )
  })

  it('A4 를 넘는 부품은 PEN_PART_OUT_OF_PAGE', () => {
    const huge = part({ id: 'a', strokes: [outline(rectPoints(300, 20))] })
    expect(codes(pattern({ parts: [huge, part({ id: 'b' })] }), spec())).toContain('PEN_PART_OUT_OF_PAGE')
  })
})

describe('접합 구조', () => {
  it('접합이 없는 부품은 PEN_JOINT_UNPAIRED', () => {
    const found = codes(
      pattern({ parts: [part({ id: 'a' }), part({ id: 'b' }), part({ id: 'orphan' })] }),
      spec(),
    )
    expect(found).toContain('PEN_JOINT_UNPAIRED')
  })

  it('맞붙는 변 길이가 부품의 실제 변과 다르면 PEN_JOINT_SIZE_MISMATCH', () => {
    const p = pattern({
      joints: [
        {
          id: 'a-b',
          kind: 'weld',
          a: 'a',
          b: 'b',
          count: 1,
          // 부품의 변은 40 과 30 뿐이다. 35 는 어디에도 없다.
          length_mm: 35,
          flush: true,
          how: '맞대어 붙입니다.',
        },
      ],
    })
    expect(codes(p, spec())).toContain('PEN_JOINT_SIZE_MISMATCH')
  })

  it('딱 맞붙지 않는 접합(flush=false)은 변 길이를 맞추지 않아도 된다', () => {
    const p = pattern({
      joints: [
        {
          id: 'a-b',
          kind: 'weld',
          a: 'a',
          b: 'b',
          count: 1,
          length_mm: 12,
          flush: false,
          how: '끝을 가운데에 대고 붙입니다.',
        },
      ],
    })
    expect(codes(p, spec())).not.toContain('PEN_JOINT_SIZE_MISMATCH')
  })

  it('접합 길이가 8mm 미만이면 PEN_JOINT_SIZE_MISMATCH — 떼면 떨어진다', () => {
    const p = pattern({
      joints: [
        {
          id: 'a-b',
          kind: 'weld',
          a: 'a',
          b: 'b',
          count: 1,
          length_mm: 4,
          flush: false,
          how: '살짝 붙입니다.',
        },
      ],
    })
    expect(codes(p, spec())).toContain('PEN_JOINT_SIZE_MISMATCH')
  })

  it('슬롯 여유가 범위를 벗어나면 PEN_JOINT_SIZE_MISMATCH', () => {
    const slot = (tab: number, width: number): PenPattern =>
      pattern({
        joints: [
          {
            id: 'a-b',
            kind: 'slot',
            a: 'a',
            b: 'b',
            count: 1,
            tab_thickness_mm: tab,
            slot_width_mm: width,
            how: '끼웁니다.',
          },
        ],
      })
    // 여유 0.1mm — 들어가지 않는다
    expect(codes(slot(3, 3.1), spec())).toContain('PEN_JOINT_SIZE_MISMATCH')
    // 여유 3mm — 끼워도 흔들린다
    expect(codes(slot(3, 6), spec())).toContain('PEN_JOINT_SIZE_MISMATCH')
    // 여유 1mm — 통과
    expect(codes(slot(3, 4), spec())).not.toContain('PEN_JOINT_SIZE_MISMATCH')
  })

  it('조립 그래프가 둘로 갈라지면 PEN_ASSEMBLY_DISCONNECTED', () => {
    const p = pattern({
      parts: [part({ id: 'a' }), part({ id: 'b' }), part({ id: 'c' }), part({ id: 'd' })],
      joints: [
        { id: '1', kind: 'weld', a: 'a', b: 'b', count: 1, length_mm: 30, flush: true, how: '붙입니다.' },
        { id: '2', kind: 'weld', a: 'c', b: 'd', count: 1, length_mm: 30, flush: true, how: '붙입니다.' },
      ],
    })
    expect(codes(p, spec())).toContain('PEN_ASSEMBLY_DISCONNECTED')
  })

  it('같은 부품의 복제끼리 붙는 접합(a === b)도 연결로 본다 — 정육면체가 그렇다', () => {
    const recipe = recipeById('cube-lantern')!
    expect(codes(buildPattern(recipe, recipe.defaults), spec())).not.toContain(
      'PEN_ASSEMBLY_DISCONNECTED',
    )
  })
})

describe('시간과 분량', () => {
  it('가용 시간 = (수업 시간 − 오버헤드) × 안전계수', () => {
    const recipe = recipeById('cube-lantern')!
    const m = penMetrics(buildPattern(recipe, recipe.defaults), spec({ duration_minutes: 90 }))
    expect(m.available_minutes).toBeCloseTo((90 - 20) * 0.85, 3)
  })

  it('예상 시간 = 선 길이/속도 + 부품수×30초 + 접합수×45초', () => {
    const recipe = recipeById('cube-lantern')!
    const p = buildPattern(recipe, recipe.defaults)
    const m = penMetrics(p, spec())
    expect(m.part_count).toBe(6)
    expect(m.joint_count).toBe(12)
    expect(m.peel_seconds).toBe(6 * 30)
    expect(m.weld_seconds).toBe(12 * 45)
    expect(m.draw_seconds).toBeCloseTo(m.total_stroke_mm / PEN_LIMITS.middle.draw_speed_mm_s, 3)
    expect(m.estimated_minutes).toBeCloseTo(
      (m.draw_seconds + m.peel_seconds + m.weld_seconds) / 60,
      3,
    )
  })

  it('수량이 선 길이에 곱해진다 — 패널 6장은 6배로 센다', () => {
    const recipe = recipeById('cube-lantern')!
    const p = buildPattern(recipe, recipe.defaults)
    const m = penMetrics(p, spec())
    const single = penMetrics({ ...p, parts: [{ ...p.parts[0]!, quantity: 1 }] }, spec())
    expect(m.total_stroke_mm).toBeCloseTo(single.total_stroke_mm * 6, 3)
  })

  it('시간이 모자라면 PEN_TIME_OVER', () => {
    const recipe = recipeById('cube-lantern')!
    const found = codes(
      buildPattern(recipe, { ...recipe.defaults, size: 70 }),
      spec({ grade_band: 'elementary', duration_minutes: 30 }),
    )
    expect(found).toContain('PEN_TIME_OVER')
  })

  it('빠듯하면 warn 이고 ok 는 유지된다', () => {
    const recipe = recipeById('cube-lantern')!
    const p = buildPattern(recipe, recipe.defaults)
    const m = penMetrics(p, spec())
    // 가용 시간을 예상 시간의 95% 로 맞추면 빠듯 경고 구간이다.
    const duration = Math.round(m.estimated_minutes / 0.95 / 0.85 + 20)
    const { report } = validatePen(p, spec({ duration_minutes: duration }))
    expect(report.findings.map((f) => f.code)).toContain('PEN_TIME_TIGHT')
    expect(report.findings.filter((f) => f.code === 'PEN_TIME_OVER')).toEqual([])
    expect(report.ok).toBe(true)
  })

  it('속도 보정 계수가 예상 시간을 늘린다 (ADR-032)', () => {
    const recipe = recipeById('cube-lantern')!
    const p = buildPattern(recipe, recipe.defaults)
    const base = penMetrics(p, spec())
    const slower = penMetrics(p, spec(), { speedFactor: 1.4 })
    expect(slower.estimated_minutes).toBeCloseTo(base.estimated_minutes * 1.4, 3)
  })

  it('부품 수 상한을 넘으면 PEN_TOO_MANY_PARTS', () => {
    const recipe = recipeById('hex-box')!
    // 밑면1 + 측면6 + 뚜껑1 = 8 > 초등 상한 6
    const found = codes(
      buildPattern(recipe, recipe.defaults),
      spec({ grade_band: 'elementary', duration_minutes: 180 }),
    )
    expect(found).toContain('PEN_TOO_MANY_PARTS')
  })
})

describe('난이도', () => {
  it('1~5 범위이고 부품·접합이 많으면 올라간다', () => {
    const simple = recipeById('name-keyring')!
    const complex = recipeById('drone-frame')!
    const a = penMetrics(buildPattern(simple, simple.defaults), spec())
    const b = penMetrics(buildPattern(complex, complex.defaults), spec())
    expect(a.difficulty).toBeGreaterThanOrEqual(1)
    expect(b.difficulty).toBeLessThanOrEqual(5)
    expect(b.difficulty).toBeGreaterThan(a.difficulty)
  })

  it('학년대 권장 범위를 벗어나면 warn 이고 ok 는 유지된다 — 일부러 어려운 걸 고를 수 있다', () => {
    const recipe = recipeById('drone-frame')!
    const { report } = validatePen(
      buildPattern(recipe, recipe.defaults),
      spec({ grade_band: 'elementary', duration_minutes: 240 }),
    )
    const mismatch = report.findings.find((f) => f.code === 'PEN_DIFFICULTY_MISMATCH')
    expect(mismatch?.severity).toBe('warn')
  })
})

describe('결과 형식', () => {
  it('모든 finding 의 코드가 등록 목록에 있고 심각도가 목록과 같다', () => {
    const recipe = recipeById('hex-box')!
    const { report } = validatePen(
      buildPattern(recipe, { ...recipe.defaults, size: 55 }),
      spec({ grade_band: 'elementary', duration_minutes: 30, equipment: ['가위'] }),
    )
    expect(report.findings.length).toBeGreaterThan(0)
    for (const f of report.findings) {
      expect(PEN_FINDING_SEVERITY[f.code], `미등록 코드 ${f.code}`).toBeTruthy()
      expect(f.severity).toBe(PEN_FINDING_SEVERITY[f.code])
      expect(f.message.length).toBeGreaterThan(5)
    }
  })

  it('ok 는 error 가 없다는 뜻이고 warn 은 깨뜨리지 않는다', () => {
    const recipe = recipeById('cube-lantern')!
    const { report } = validatePen(buildPattern(recipe, recipe.defaults), spec())
    expect(report.ok).toBe(report.findings.every((f) => f.severity !== 'error'))
  })

  it('같은 입력이면 같은 결과다 (결정론)', () => {
    const recipe = recipeById('house-lamp')!
    const p = buildPattern(recipe, recipe.defaults)
    expect(validatePen(p, spec())).toEqual(validatePen(p, spec()))
  })
})

describe('꼬인 윤곽 (ADR-034 — 조합이 들어오면서 생긴 위험)', () => {
  /**
   * 조각을 조합하면 사람이 검수하지 않은 윤곽이 들어올 수 있다. 스스로 교차하는 윤곽은
   * 그려 놓으면 멀쩡해 보이지만 떼어낼 때 교차점에서 찢어진다. 레시피는 사람이 봤지만
   * 조합은 아무도 보지 않으므로 **검증기가 봐야 한다.**
   */
  const bowtie = [
    { x: 0, y: 0 },
    { x: 40, y: 30 },
    { x: 40, y: 0 },
    { x: 0, y: 30 },
  ]

  it('스스로 교차하는 윤곽을 잡는다', () => {
    const p = pattern({ parts: [part({ id: 'a', strokes: [outline(bowtie)] }), part({ id: 'b' })] })
    expect(codes(p, spec())).toContain('PEN_SELF_INTERSECT')
  })

  it('error 다 — 통과시킬 수 없는 결함이다', () => {
    expect(PEN_FINDING_SEVERITY.PEN_SELF_INTERSECT).toBe('error')
  })

  it('멀쩡한 윤곽에는 걸리지 않는다', () => {
    expect(codes(pattern(), spec())).not.toContain('PEN_SELF_INTERSECT')
    const house = buildPattern(recipeById('house-lamp')!, recipeById('house-lamp')!.defaults)
    expect(codes(house, spec())).not.toContain('PEN_SELF_INTERSECT')
  })
})
