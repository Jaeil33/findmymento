// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  CLASS_OVERHEAD_MINUTES,
  CLASS_OVERHEAD_SPLIT,
  PEN_SHARE_LIMIT,
  RETRIEVAL_MIN_SCORE,
  TIME_SAFETY,
} from '@/lib/studio/constants'
import { ATLAS_RECORDS } from '@/data/atlas/records'
import { packDesigns, packShape, packSources } from '@/lib/studio/pack'
import {
  equipmentPlan,
  lessonConstraints,
  readPenCount,
} from '@/lib/studio/harness/constraints'
import { harnessChecks, lessonPackage, validatePackage } from '@/lib/studio/harness/package'
import { isStrongHit, penHarness } from '@/lib/studio/harness/pipeline'
import {
  retrieveCandidates,
  retrieveDesign,
  scoreDesign,
} from '@/lib/studio/harness/retrieve'
import { penMetrics } from '@/lib/studio/pen3d/validate'
import { buildPattern, recipeById } from '@/lib/studio/pen3d/recipes'
import type { GradeBand } from '@/types/domain'
import type { LessonPackage, StudioSpec } from '@/types/studio'

/**
 * 수업 조건 기반 하네스 (ADR-044 · 개발명세서 §8).
 *
 * 여기서 반드시 지켜지는 것:
 * - 검색은 **결정론**이고, 미적중이면 목록의 1번을 집어 주지 않는다
 * - 사전 제작 팩은 **문장과 조회어만** 들고 있고 모양은 아틀라스에서 온다
 * - 2D 요청에 입체 전용 레시피가 나가지 않는다
 * - 제작 시간은 실측이 없으면 `estimated` 이고 "검증 완료" 로 적지 않는다
 * - 장비 수량이 다르면 운영 계획이 **다르게** 나온다
 * - 지도안이 없는 부품을 가리키면 error 로 막힌다
 */

const spec = (over: Partial<StudioSpec> = {}): StudioSpec => ({
  kind: 'pen3d',
  grade_band: 'middle',
  student_count: 20,
  duration_minutes: 90,
  venue: '교실',
  equipment: ['3D펜 20자루', 'PLA 필라멘트', '실리콘 매트'],
  topic: '바다에 사는 물고기 모양 장식 만들기',
  session_id: null,
  form: 'flat',
  ...over,
})

describe('사전 제작 도안 팩 (ADR-044)', () => {
  it('200개 이상이 **아틀라스에 실제로 있는 모양**을 가리킨다', () => {
    const designs = packDesigns()
    expect(designs.length).toBeGreaterThanOrEqual(200)
    const ids = new Set(ATLAS_RECORDS.map((r) => r.id))
    for (const design of designs) expect(ids.has(design.shape_id)).toBe(true)
  })

  it('팩에 적힌 모든 항목의 모양이 아틀라스에 있다 — 빠진 항목이 없다', () => {
    const ids = new Set(ATLAS_RECORDS.map((r) => r.id))
    const missing = packSources().filter((s) => !ids.has(s.shape ?? `atlas-${s.word}`))
    expect(missing.map((m) => m.word)).toEqual([])
  })

  it('모든 항목의 모양을 실제로 만들 수 있다 — 깨진 항목이 없다', () => {
    for (const design of packDesigns()) {
      expect(packShape(design), design.id).not.toBeNull()
    }
  })

  it('조회어가 겹치지 않는다 — 같은 단어가 두 항목을 가리키면 결과가 흔들린다', () => {
    const owner = new Map<string, string>()
    const dupes: string[] = []
    for (const design of packDesigns()) {
      for (const word of design.words) {
        const prev = owner.get(word)
        if (prev && prev !== design.word) dupes.push(`${word}: ${prev} / ${design.word}`)
        else owner.set(word, design.word)
      }
    }
    expect(dupes).toEqual([])
  })

  it('문장에 숫자를 적지 않는다 — 치수·시간은 생성기가 계산한다', () => {
    for (const design of packDesigns()) {
      const text = `${design.title} ${design.reason} ${design.focus} ${design.objective}`
      expect(text.replace(/3D|2D|A4/g, ''), design.id).not.toMatch(/\d/)
    }
  })

  it('대체 모양인 항목은 그 사실을 들고 있다', () => {
    const fish = packDesigns().find((d) => d.word === '물고기')
    expect(fish).toBeTruthy()
    expect(fish!.substitute).toBe(true)
    expect(fish!.shape_id).not.toBe('atlas-물고기')
    // 이름이 같은 항목은 대체가 아니다
    const shark = packDesigns().find((d) => d.word === '상어')
    expect(shark!.substitute).toBe(false)
  })
})

describe('검색 — 결정론이고 판정기가 아니다 (개발명세서 §3)', () => {
  it('단어가 그대로 들어오면 정확 일치다', () => {
    const bike = packDesigns().find((d) => d.word === '자전거')!
    const { score, matched_by } = scoreDesign(bike, '자전거')
    expect(matched_by).toBe('exact')
    expect(score).toBeGreaterThan(RETRIEVAL_MIN_SCORE)
  })

  it('동의어로도 찾는다 — "바이크" 가 자전거다', () => {
    const hit = retrieveDesign('바이크')
    expect(hit?.design.word).toBe('자전거')
    expect(hit?.matched_by).toBe('alias')
  })

  it('문장형 주제에서 단어를 찾는다 — "바다에 사는 물고기 모양 장식" (개발명세서 §8-2)', () => {
    const hit = retrieveDesign('바다에 사는 물고기 모양 장식 만들기')
    expect(hit).not.toBeNull()
    expect(hit!.design.word).toBe('물고기')
    expect(hit!.matched_by).toBe('phrase')
    // 출처가 추적 가능하다
    expect(hit!.evidence.source_id).toBe(hit!.design.shape_id)
    expect(hit!.evidence.trust_level).toBe('substitute')
    expect(hit!.evidence.license).toBe('CC-BY 4.0')
  })

  it('미적중이면 null 이다 — **목록의 1번을 집어 주지 않는다**', () => {
    expect(retrieveDesign('읽을수없는주제엑스와이지')).toBeNull()
    expect(retrieveCandidates('읽을수없는주제엑스와이지')).toEqual([])
  })

  it('같은 주제를 두 번 조회하면 같은 결과다', () => {
    const a = retrieveDesign('우주 로켓 만들기')
    const b = retrieveDesign('우주 로켓 만들기')
    expect(a?.design.id).toBe(b?.design.id)
    expect(a?.design.word).toBe('로켓')
  })

  it('분류만 맞은 것은 약한 근거로 적힌다', () => {
    const design = packDesigns().find((d) => d.tags.includes('바다'))!
    const { matched_by } = scoreDesign(design, '바다 생물 이야기')
    expect(['tag', 'phrase', 'partial']).toContain(matched_by)
  })

  it('정확 일치는 저작 레이어를 부를 필요가 없는 근거가 된다 (개발명세서 §8-1)', () => {
    expect(isStrongHit(retrieveDesign('자전거'))).toBe(true)
    // 대체 모양은 강한 적중이 아니다 — LLM 이 있으면 직접 그려 보는 쪽이 낫다
    expect(isStrongHit(retrieveDesign('물고기'))).toBe(false)
    expect(isStrongHit(null)).toBe(false)
  })
})

describe('수업 제약 — 추정과 실측을 구분한다 (개발명세서 §5B)', () => {
  it('준비·정리를 뺀 활동 시간이 일관적이다 (개발명세서 §8-6)', () => {
    const c = lessonConstraints(spec({ duration_minutes: 90 }))
    expect(c.overhead_minutes).toBe(CLASS_OVERHEAD_MINUTES)
    expect(c.activity_minutes).toBe(90 - CLASS_OVERHEAD_MINUTES)
    expect(c.making_minutes).toBeCloseTo((90 - CLASS_OVERHEAD_MINUTES) * TIME_SAFETY, 5)
  })

  it('지도안 칸의 합이 준비·정리 시간과 같다 — 두 숫자가 같은 상수에서 나온다', () => {
    const sum =
      CLASS_OVERHEAD_SPLIT.intro_minutes +
      CLASS_OVERHEAD_SPLIT.demo_minutes +
      CLASS_OVERHEAD_SPLIT.wrap_minutes
    expect(sum).toBe(CLASS_OVERHEAD_MINUTES)
  })

  it('제작 가용 시간이 검증기의 값과 같다 — 지도안과 판정이 다른 시간을 쓰면 안 된다', () => {
    const s = spec({ duration_minutes: 120 })
    const recipe = recipeById('name-keyring')!
    const metrics = penMetrics(buildPattern(recipe, recipe.defaults), s)
    expect(lessonConstraints(s).making_minutes).toBeCloseTo(metrics.available_minutes, 5)
  })

  it('장비 문장에서 펜 수량을 읽는다', () => {
    expect(readPenCount(['3D펜 20자루'])).toBe(20)
    expect(readPenCount(['펜 12개', 'PLA 필라멘트'])).toBe(12)
    expect(readPenCount(['3d pen x 8'])).toBe(8)
    // 읽지 못하면 null — 1자루로 가정하지 않는다
    expect(readPenCount(['3D펜', '필라멘트'])).toBeNull()
    expect(readPenCount([])).toBeNull()
  })

  it('수량을 읽지 못하면 "확인 필요" 로 남는다 — 없다고 단정하지 않는다', () => {
    const c = lessonConstraints(spec({ equipment: ['3D펜', '실리콘 매트'] }))
    expect(c.equipment.pen_count).toBeNull()
    expect(c.students_per_pen).toBeNull()
    expect(c.unconfirmed.join(' ')).toContain('수량')
    expect(c.unconfirmed.join(' ')).toContain('필라멘트')
  })

  it('해석하지 못한 장비 항목의 원문을 버리지 않는다', () => {
    const c = lessonConstraints(spec({ equipment: ['3D펜 20자루', '글루건 2대'] }))
    expect(c.equipment.raw).toContain('글루건 2대')
    expect(c.equipment.unread).toContain('글루건 2대')
  })

  it('펜 수가 다르면 운영 계획이 다르다 (개발명세서 §8-5)', () => {
    const twenty = equipmentPlan(lessonConstraints(spec({ equipment: ['3D펜 20자루', 'PLA 필라멘트'] })))
    const ten = equipmentPlan(lessonConstraints(spec({ equipment: ['3D펜 10자루', 'PLA 필라멘트'] })))

    expect(twenty.students_per_pen).toBe(1)
    expect(twenty.rotations).toBe(1)
    expect(ten.students_per_pen).toBe(2)
    expect(ten.rotations).toBe(2)
    expect(ten.notes.join(' ')).not.toBe(twenty.notes.join(' '))
    expect(ten.notes.join(' ')).toContain('교대')
  })

  it('한 자루를 여럿이 쓰면 검사에 적힌다', () => {
    const c = lessonConstraints(spec({ student_count: 24, equipment: ['3D펜 6자루', 'PLA 필라멘트'] }))
    expect(c.students_per_pen).toBe(4)
    const result = penHarness(spec({ student_count: 24, equipment: ['3D펜 6자루', 'PLA 필라멘트'] }))
    const shared = result.report.findings.find((f) => f.code === 'EQUIP_PEN_SHARED')
    expect(shared).toBeTruthy()
    expect(shared!.severity).toBe('warn')
    expect(shared!.measured).toBe(4)
    expect(shared!.limit).toBe(PEN_SHARE_LIMIT)
  })
})

describe('하네스 — 생성에서 수업 패키지까지', () => {
  it('문장형 주제로 검증을 통과한 도안과 패키지가 나온다', () => {
    const result = penHarness(spec())
    expect(result.status).toBe('validated')
    expect(result.shape_source).toBe('pack')
    expect(result.artifact.pattern.parts.length).toBeGreaterThan(0)
    // 예전에는 여기서 아틀라스 1번 항목(가방)이 나갔다. 이제는 주제에서 찾은 모양이다.
    expect(result.design?.word).toBe('물고기')
    expect(result.artifact.pattern.title).not.toBe('가방')
  })

  it('수업 패키지가 도안과 같은 부품 id 를 쓴다 (개발명세서 §8-8)', () => {
    const result = penHarness(spec({ topic: '자전거' }))
    const ids = new Set(result.artifact.pattern.parts.map((p) => p.id))
    for (const step of result.package.student_guide) {
      expect(step.part_ids.length).toBeGreaterThan(0)
      for (const id of step.part_ids) expect(ids.has(id)).toBe(true)
    }
    expect(validatePackage(result.package, result.artifact.pattern, result.constraints, true)).toEqual([])
  })

  it('지도안 시간의 합이 수업 시간과 같다', () => {
    for (const duration of [45, 60, 90, 120]) {
      const result = penHarness(spec({ duration_minutes: duration, topic: '하트' }))
      const plan = result.package.lesson_plan
      expect(
        plan.intro_minutes + plan.demo_minutes + plan.making_minutes + plan.wrap_minutes,
      ).toBe(duration)
      expect(plan.total_minutes).toBe(duration)
    }
  })

  it('실측이 없으면 "추정" 이고 "검증 완료" 가 아니다 (개발명세서 §8-7)', () => {
    const result = penHarness(spec({ topic: '하트' }))
    expect(result.package.verification.time).toBe('estimated')
    expect(result.package.verification.field).toBe('unverified')
    const note = result.report.findings.find((f) => f.code === 'TIME_ESTIMATE_UNVERIFIED')
    expect(note?.severity).toBe('warn')
    expect(note?.message).toContain('실측이 아닙니다')
  })

  it('피드백 보정이 있으면 시간 상태가 올라간다 (ADR-032)', () => {
    const result = penHarness(spec({ topic: '하트' }), {
      calibration: {
        recipe_id: 'atlas-하트',
        grade_band: 'middle',
        sample_count: 4,
        speed_factor: 1.2,
        lower_difficulty: false,
      },
    })
    expect(result.package.verification.time).toBe('calibrated')
    expect(result.package.verification.field).toBe('verified')
    expect(result.report.findings.some((f) => f.code === 'TIME_ESTIMATE_UNVERIFIED')).toBe(false)
  })

  it('대체 모양이면 요청한 모양이 아니라고 적는다 (ADR-030)', () => {
    const result = penHarness(spec({ topic: '물고기' }))
    expect(result.substitute_note).toContain('가장 가까운')
    expect(result.package.verification.topic_match).toBe('needs_review')
    const note = result.report.findings.find((f) => f.code === 'TOPIC_SUBSTITUTED')
    expect(note?.severity).toBe('warn')
  })

  it('검수된 모양이 주제와 같으면 주제 일치는 reviewed 다', () => {
    const result = penHarness(spec({ topic: '자전거' }))
    expect(result.package.verification.topic_match).toBe('reviewed')
    expect(result.substitute_note).toBeNull()
  })

  it('2D 요청에 입체 전용 레시피가 나가지 않는다 (개발명세서 §8-3)', () => {
    const result = penHarness(spec({ topic: '정육면체 조명 만들기', form: 'flat' }))
    expect(result.artifact.pattern.joints.filter((j) => j.kind === 'slot')).toEqual([])
    expect(result.recipe_id.startsWith('cube-lantern')).toBe(false)
    // 레시피를 직접 고르더라도 2D 요청에서는 쓰지 않는다
    const picked = penHarness(spec({ topic: '조명', form: 'flat' }), { recipeId: 'cube-lantern' })
    expect(picked.recipe_id).not.toBe('cube-lantern')
  })

  it('입체 요청에서 강사가 고른 레시피는 그대로 쓴다', () => {
    const result = penHarness(spec({ topic: '정육면체 조명', form: 'solid' }), {
      recipeId: 'cube-lantern',
    })
    expect(result.recipe_id).toBe('cube-lantern')
    expect(result.shape_source).toBe('recipe')
  })

  it('미적중이면 2D 는 명패로 떨어지고 그 사실을 적는다 (ADR-042)', () => {
    const result = penHarness(spec({ topic: '읽을수없는주제엑스와이지' }))
    expect(result.status).not.toBe('failed')
    const codes = result.report.findings.map((f) => f.code)
    expect(codes).toContain('PEN_SHAPE_FALLBACK')
    // 같은 사실을 두 줄로 적지 않는다 — 명패 고지가 "찾지 못했다" 를 이미 말한다
    expect(codes).not.toContain('RETRIEVAL_MISS')
    expect(result.shape_source).toBe('fallback')
    // 명패는 요청한 모양이 아니므로 사람 검수로 넘긴다
    expect(result.package.verification.topic_match).toBe('needs_review')
  })

  it('세 학년대 모두에서 통과한다 — 같은 주제로 학년만 바꾼다', () => {
    for (const band of ['elementary', 'middle', 'high'] as GradeBand[]) {
      const result = penHarness(spec({ grade_band: band, topic: '물고기' }))
      expect(result.status, band).toBe('validated')
      expect(result.package.student_guide.length, band).toBeGreaterThan(1)
    }
  })

  it('장비에 3D펜이 없으면 기하 검증이 막는다 — 하네스가 그 판정을 덮지 않는다', () => {
    const result = penHarness(spec({ equipment: ['색연필'] }))
    expect(result.status).toBe('failed')
    expect(result.report.findings.some((f) => f.code === 'PEN_EQUIPMENT_MISSING')).toBe(true)
    expect(result.package.verification.geometry).toBe('failed')
  })

  it('출처가 추적 가능하다 — 라이선스 표시를 싣는다 (개발명세서 §8-12)', () => {
    const result = penHarness(spec({ topic: '자전거' }))
    const licensed = result.package.evidence.find((e) => e.license !== null)
    expect(licensed?.license).toBe('CC-BY 4.0')
    expect(licensed?.attribution).toContain('Twemoji')
    // 문장의 출처도 따로 적는다 — 실시간 AI 가 쓴 것처럼 보이지 않게
    expect(result.package.evidence.some((e) => e.attribution?.includes('사전 제작'))).toBe(true)
  })

  it('문장을 누가 썼는지 패키지에 남는다 (ADR-025)', () => {
    expect(penHarness(spec(), { authoredBy: 'pack' }).package.authored_by).toBe('pack')
    expect(penHarness(spec(), { authoredBy: 'llm' }).package.authored_by).toBe('llm')
    // 규칙으로 떨어졌어도 **팩 항목이 쓰였으면** 팩이다 — 목표·주의사항이 그 문장이다
    expect(penHarness(spec()).package.authored_by).toBe('pack')
    // 팩을 쓰지 않은 경로(명패)에서는 규칙이다
    expect(penHarness(spec({ topic: '읽을수없는주제엑스와이지' })).package.authored_by).toBe('rule')
  })
})

describe('지도안 정합성 — 밖에서 받은 문장을 막는다 (개발명세서 §5E)', () => {
  const base = () => penHarness(spec({ topic: '자전거' }))

  it('없는 부품을 가리키면 error 다', () => {
    const result = base()
    const broken: LessonPackage = {
      ...result.package,
      student_guide: [
        { step: 1, part_ids: ['없는부품'], text: '없는 부품을 그립니다.', caution: null },
      ],
    }
    const findings = validatePackage(broken, result.artifact.pattern, result.constraints, true)
    const unknown = findings.find((f) => f.code === 'PLAN_PART_UNKNOWN')
    expect(unknown?.severity).toBe('error')
  })

  it('시간 합이 수업 시간과 다르면 error 다', () => {
    const result = base()
    const broken: LessonPackage = {
      ...result.package,
      lesson_plan: {
        intro_minutes: 5,
        demo_minutes: 5,
        making_minutes: 5,
        wrap_minutes: 5,
        total_minutes: 20,
      },
    }
    const findings = validatePackage(broken, result.artifact.pattern, result.constraints, true)
    expect(findings.find((f) => f.code === 'PLAN_TIME_MISMATCH')?.severity).toBe('error')
  })

  it('2D 산출물에 조립 단계가 섞이면 error 다 (ADR-037)', () => {
    const result = base()
    const broken: LessonPackage = {
      ...result.package,
      student_guide: [
        {
          step: 1,
          part_ids: [result.artifact.pattern.parts[0]!.id],
          text: '부품을 세워 모서리를 붙입니다.',
          caution: null,
        },
      ],
    }
    const findings = validatePackage(broken, result.artifact.pattern, result.constraints, true)
    expect(findings.find((f) => f.code === 'PLAN_MODE_MISMATCH')?.severity).toBe('error')
  })

  it('빈 설명은 error 다', () => {
    const result = base()
    const broken: LessonPackage = {
      ...result.package,
      student_guide: [
        { step: 1, part_ids: [result.artifact.pattern.parts[0]!.id], text: '  ', caution: null },
      ],
    }
    const findings = validatePackage(broken, result.artifact.pattern, result.constraints, true)
    expect(findings.find((f) => f.code === 'PLAN_STEP_EMPTY')?.severity).toBe('error')
  })
})

describe('수업 패키지 내용', () => {
  it('학생 가이드가 선 그리기 → 색 → 떼어내기 순서로 나온다', () => {
    const result = penHarness(spec({ topic: '나비' }))
    const texts = result.package.student_guide.map((s) => s.text)
    expect(texts[0]).toContain('덧그립니다')
    expect(texts.join(' ')).toContain('식은 뒤')
    /**
     * 색 영역이 있으면 색 단계가 들어간다. 다만 **채우라고 적지 않는다** (ADR-039) —
     * 색은 인쇄만 되고 펜이 그 경계를 지나가지 않는다.
     */
    const hasArt = result.artifact.pattern.parts.some((p) => p.art.length > 0)
    if (hasArt) {
      expect(texts.join(' ')).toContain('같은 필라멘트를 골라')
      expect(texts.join(' ')).toContain('경계를 따라 긋지 않습니다')
      expect(texts.join(' ')).not.toContain('색을 채웁니다')
    }
  })

  it('팩이 들고 있는 주의사항이 1단계에 붙는다', () => {
    const result = penHarness(spec({ topic: '기린' }), { authoredBy: 'pack' })
    const design = packDesigns().find((d) => d.word === '기린')!
    expect(result.package.student_guide[0]?.caution).toBe(design.focus)
  })

  it('학습 목표가 비어 있지 않다', () => {
    const result = penHarness(spec({ topic: '물고기' }))
    expect(result.package.objectives.length).toBeGreaterThan(0)
    expect(result.package.objectives.length).toBeLessThanOrEqual(3)
    for (const objective of result.package.objectives) expect(objective.length).toBeGreaterThan(5)
  })

  it('강사 메모에 먼저 끝낸 학생 대비가 들어간다', () => {
    const result = penHarness(spec({ topic: '하트' }))
    expect(result.package.lesson_notes.join(' ')).toContain('먼저 끝낸')
  })

  it('입체 요청에서는 조립 단계가 가이드에 들어간다', () => {
    const result = penHarness(spec({ topic: '정육면체 조명', form: 'solid' }), {
      recipeId: 'cube-lantern',
    })
    const joints = result.artifact.pattern.joints.length
    expect(joints).toBeGreaterThan(0)
    expect(result.package.student_guide.some((s) => s.part_ids.length === 2)).toBe(true)
  })

  it('검사 결과가 전부 "확인 필요" 뿐이면 도안을 막지 않는다', () => {
    const result = penHarness(spec())
    const checks = harnessChecks({
      package: result.package,
      constraints: result.constraints,
      matched_by: 'phrase',
      substitute: true,
      substitute_note: '가장 가까운 모양입니다.',
      retrieval_miss: false,
      metrics: result.metrics,
    })
    expect(checks.length).toBeGreaterThan(0)
    for (const check of checks) expect(check.severity).toBe('warn')
  })

  it('패키지를 만들 때 숫자를 새로 만들지 않는다 — 지표에서 받는다', () => {
    const result = penHarness(spec({ duration_minutes: 60 }))
    const pkg = lessonPackage({
      pattern: result.artifact.pattern,
      metrics: result.metrics,
      constraints: result.constraints,
      flat: true,
      design: result.design,
      reviewed: true,
      geometry_ok: true,
      substitute: false,
      calibration: null,
      evidence: [],
      authored_by: 'pack',
      tasks: result.artifact.tasks,
    })
    expect(pkg.lesson_plan.making_minutes).toBe(result.constraints.activity_minutes)
    expect(pkg.equipment_plan.pen_count).toBe(20)
  })
})
