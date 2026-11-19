// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Actor } from '@/lib/auth/actor'

/**
 * **체험 모드에서 조건을 넣으면 도안이 나온다 — LLM 호출 0회** (ADR-044).
 *
 * 이 파일이 고정하는 것:
 * - 체험 세션(키 없음)에서 생성 라우트가 **검증을 통과한 도안과 수업 패키지**를 돌려준다
 * - 그 경로에서 **Anthropic 호출이 한 번도 일어나지 않는다.** 미리 만들어 둔 도안을 쓴다
 * - 문장이 미리 써 둔 것이라는 사실이 응답에 적힌다 (`authored_by: 'pack'`) — 실시간 AI 가
 *   쓴 것처럼 보이면 안 된다 (ADR-025)
 * - **키가 있어도** 주제와 같은 단어의 검수된 모양이 있으면 부르지 않는다 (개발명세서 §8-1)
 * - 수업 조건(학년대·시수·인원·장비)이 바뀌면 산출물과 지도안이 **바뀐다**
 */

const cookieJar = vi.hoisted(() => ({ map: new Map<string, string>() }))
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) =>
      cookieJar.map.has(name) ? { name, value: cookieJar.map.get(name)! } : undefined,
    getAll: () => [...cookieJar.map].map(([name, value]) => ({ name, value })),
    set: (name: string, value: string) => void cookieJar.map.set(name, value),
    delete: (name: string) => void cookieJar.map.delete(name),
  }),
}))

const state = vi.hoisted(() => ({ actor: null as Actor | null }))
const createMock = vi.hoisted(() => vi.fn())

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: (...args: unknown[]) => createMock(...args) }
    beta = { messages: { create: (...args: unknown[]) => createMock(...args) } }
  },
}))

vi.mock('@/lib/auth/actor', () => ({ getActor: async () => state.actor }))

const { TOUR_COOKIE } = await import('@/lib/demo/mode')
const { POST: generate } = await import('@/app/api/studio/generate/route')
const { packCount } = await import('@/lib/studio/pack')

const ORIGINAL = { ...process.env }

const INSTRUCTOR: Actor = {
  role: 'instructor',
  instructorId: 'in-2',
  displayName: '박서연',
  demo: true,
}

let ip = 0
function post(body: unknown): Request {
  ip += 1
  return new Request('http://localhost/api/studio/generate', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.9.0.${ip % 250}` },
    body: JSON.stringify(body),
  })
}

/** 체험 화면이 보내는 그대로. 기본 모드는 2D 다 (`GenerateForm` 의 기본값) */
const body = (over: Record<string, unknown> = {}) => ({
  kind: 'pen3d',
  topic: '바다에 사는 물고기 모양 장식 만들기',
  gradeBand: 'middle',
  studentCount: 20,
  durationMinutes: 90,
  venue: '교실',
  equipment: ['3D펜 20자루', 'PLA 필라멘트', '실리콘 매트'],
  form: 'flat',
  ...over,
})

beforeEach(() => {
  cookieJar.map.clear()
  cookieJar.map.set(TOUR_COOKIE, '1')
  createMock.mockReset()
  state.actor = INSTRUCTOR
  // 체험 세션이고 LLM 키가 없는 상태 — 지금의 배포 조건이다
  process.env = { ...ORIGINAL }
  delete process.env.ANTHROPIC_API_KEY
})

afterEach(() => {
  process.env = { ...ORIGINAL }
  cookieJar.map.clear()
})

describe('체험 모드 — 조건을 넣으면 도안이 나온다 (LLM 없이)', () => {
  it('미리 만들어 둔 도안이 200개 이상 있다', () => {
    expect(packCount()).toBeGreaterThanOrEqual(200)
  })

  it('문장형 주제로 검증을 통과한 도안이 나오고, Anthropic 호출은 0회다', async () => {
    const response = await generate(post(body()))
    expect(response.status).toBe(200)
    const json = await response.json()

    expect(json.ok).toBe(true)
    expect(json.status).toBe('validated')
    expect(createMock).not.toHaveBeenCalled()

    // 저장이 화면에 닿지 않는 세션이므로 산출물을 함께 돌려준다 (ADR-033)
    expect(json.persisted).toBe(false)
    expect(json.artifact.kind).toBe('pen3d')
    expect(json.artifact.pattern.parts.length).toBeGreaterThan(0)
    expect(json.metrics.page_fit).toBe(true)
  })

  it('모양과 문장의 출처를 응답에 적는다 — 실시간 AI 로 보이게 하지 않는다', async () => {
    const json = await (await generate(post(body()))).json()
    expect(json.shape_source).toBe('pack')
    expect(json.authored_by).toBe('pack')
    expect(json.demo_ai).toBe(false)
    expect(json.source).toBe('rule')
    expect(json.artifact.package.authored_by).toBe('pack')
  })

  it('요청한 사물과 다른 모양이면 그 사실을 적는다 (ADR-030)', async () => {
    const json = await (await generate(post(body()))).json()
    expect(json.nearest_note).toContain('가장 가까운')
    expect(json.findings.some((f: { code: string }) => f.code === 'TOPIC_SUBSTITUTED')).toBe(true)
    expect(json.artifact.package.verification.topic_match).toBe('needs_review')
  })

  it('주제와 같은 단어면 대체 고지가 없다', async () => {
    const json = await (await generate(post(body({ topic: '자전거' })))).json()
    expect(json.nearest_note).toBeNull()
    expect(json.artifact.package.verification.topic_match).toBe('reviewed')
    expect(createMock).not.toHaveBeenCalled()
  })

  it('수업 패키지가 함께 나온다 — 사용법·지도안·검증 상태·출처', async () => {
    const json = await (await generate(post(body({ topic: '공룡' })))).json()
    const pkg = json.artifact.package

    expect(pkg.student_guide.length).toBeGreaterThan(1)
    expect(pkg.objectives.length).toBeGreaterThan(0)
    expect(pkg.lesson_notes.length).toBeGreaterThan(2)
    expect(pkg.equipment_plan.pen_count).toBe(20)
    expect(pkg.evidence.length).toBeGreaterThan(0)

    // 시간 배분의 합이 수업 시간과 같다
    const plan = pkg.lesson_plan
    expect(plan.intro_minutes + plan.demo_minutes + plan.making_minutes + plan.wrap_minutes).toBe(90)

    // 제작 시간은 추정이고 실측이 아니다
    expect(pkg.verification.time).toBe('estimated')
    expect(pkg.verification.field).toBe('unverified')
    expect(pkg.verification.unconfirmed.length).toBeGreaterThan(0)
  })

  it('학년대를 바꾸면 산출물이 바뀐다', async () => {
    const low = await (await generate(post(body({ topic: '나비', gradeBand: 'elementary' })))).json()
    const high = await (await generate(post(body({ topic: '나비', gradeBand: 'high' })))).json()
    expect(low.metrics.total_stroke_mm).not.toBe(high.metrics.total_stroke_mm)
    expect(createMock).not.toHaveBeenCalled()
  })

  it('시수를 바꾸면 지도안의 시간 배분이 바뀐다', async () => {
    const short = await (await generate(post(body({ topic: '하트', durationMinutes: 45 })))).json()
    const long = await (await generate(post(body({ topic: '하트', durationMinutes: 120 })))).json()
    expect(short.artifact.package.lesson_plan.making_minutes).toBe(25)
    expect(long.artifact.package.lesson_plan.making_minutes).toBe(100)
  })

  it('펜 수량을 바꾸면 장비 운영 계획이 바뀐다 (개발명세서 §8-5)', async () => {
    const many = await (
      await generate(post(body({ topic: '별 모양 장식', equipment: ['3D펜 20자루', 'PLA 필라멘트'] })))
    ).json()
    const few = await (
      await generate(post(body({ topic: '별 모양 장식', equipment: ['3D펜 5자루', 'PLA 필라멘트'] })))
    ).json()

    expect(many.artifact.package.equipment_plan.rotations).toBe(1)
    expect(few.artifact.package.equipment_plan.rotations).toBe(4)
    expect(few.findings.some((f: { code: string }) => f.code === 'EQUIP_PEN_SHARED')).toBe(true)
    expect(many.findings.some((f: { code: string }) => f.code === 'EQUIP_PEN_SHARED')).toBe(false)
  })

  it('장비에서 수량을 읽지 못하면 확인 항목으로 적는다 — 없다고 단정하지 않는다', async () => {
    const json = await (
      await generate(post(body({ topic: '별 모양 장식', equipment: ['3D펜', '필라멘트'] })))
    ).json()
    expect(json.artifact.package.equipment_plan.pen_count).toBeNull()
    expect(json.findings.some((f: { code: string }) => f.code === 'EQUIP_PEN_COUNT_UNKNOWN')).toBe(
      true,
    )
    // 검증은 통과한다 — 확인이 필요한 것은 막을 근거가 아니다
    expect(json.status).toBe('validated')
  })

  it('목록에 없는 주제는 명패로 떨어지고, 요청한 모양이 아니라고 적는다 (ADR-042)', async () => {
    const json = await (await generate(post(body({ topic: '읽을수없는주제엑스와이지' })))).json()
    expect(json.status).not.toBe('failed')
    expect(json.shape_source).toBe('fallback')
    expect(json.findings.some((f: { code: string }) => f.code === 'PEN_SHAPE_FALLBACK')).toBe(true)
    // 체험 세션에서는 윤곽 제안을 돌리지 않는다 (ADR-036)
    expect(createMock).not.toHaveBeenCalled()
  })

  it('여러 번 눌러도 같은 조건이면 같은 결과다 — 결정론이다', async () => {
    const first = await (await generate(post(body({ topic: '케이크 만들기' })))).json()
    const second = await (await generate(post(body({ topic: '케이크 만들기' })))).json()
    expect(first.recipe_id).toBe(second.recipe_id)
    expect(first.metrics.total_stroke_mm).toBe(second.metrics.total_stroke_mm)
    expect(first.artifact.package.student_guide.length).toBe(
      second.artifact.package.student_guide.length,
    )
  })
})

describe('키가 있어도 — 검수된 모양이 있으면 부르지 않는다 (개발명세서 §8-1)', () => {
  beforeEach(() => {
    cookieJar.map.clear() // 체험이 아니다
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test'
  })

  it('2D 요청에 주제와 같은 단어의 검수된 모양이 있으면 호출이 0회다', async () => {
    const json = await (await generate(post(body({ topic: '자전거' })))).json()
    expect(json.ok).toBe(true)
    expect(json.shape_source).toBe('pack')
    expect(createMock).not.toHaveBeenCalled()
  })

  it('목록에 없는 주제에는 저작 레이어를 부른다', async () => {
    createMock.mockRejectedValue(new Error('offline'))
    const json = await (await generate(post(body({ topic: '피카츄' })))).json()
    expect(createMock).toHaveBeenCalled()
    // 저작이 실패해도 화면은 실패하지 않는다 (CLAUDE.md 아키텍처 규칙)
    expect(json.ok).toBe(true)
  })

  it('대체 모양뿐인 주제에는 저작 레이어를 부른다 — 직접 그려 보는 쪽이 낫다', async () => {
    createMock.mockRejectedValue(new Error('offline'))
    const json = await (await generate(post(body({ topic: '물고기' })))).json()
    expect(createMock).toHaveBeenCalled()
    expect(json.ok).toBe(true)
    // 제안이 실패하면 검색 결과(대체 모양)로 떨어진다
    expect(json.shape_source).toBe('pack')
    expect(json.nearest_note).toContain('가장 가까운')
  })
})
