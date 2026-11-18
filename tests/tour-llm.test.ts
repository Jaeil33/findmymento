// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Actor } from '@/lib/auth/actor'

/**
 * 체험 세션의 LLM — **스튜디오 저작 한 곳만, 예산 상한 안에서** (ADR-035).
 *
 * 체험은 로그인 없이 누구나 들어오는 익명 경로다. 그래서 기본값은 여전히 "LLM 을 부르지
 * 않는다" 이고(ADR-033), 이 파일이 여는 예외는 **도안 저작 하나뿐**이다 — 방문자가 적은
 * 문장을 실제로 읽고 검수된 조각으로 모양을 짜는 일. 그게 이 제품의 핵심이라 시연용 고정
 * 응답으로는 보여 줄 수 없다.
 *
 * 이 파일이 고정하는 것:
 * - 예외는 스튜디오 저작 경로에서만 열린다. `llmKeyForRequest()` 는 체험에서 여전히 null
 *   이므로 교안·추천·보고서는 전과 같이 시연용 응답이다
 * - 상한이 셋 있다: 방문자별(레이트 리밋) · 하루 총량 · 스위치(`TOUR_LLM=off`)
 * - 상한을 넘으면 거절이 아니라 **시연용 응답으로 떨어진다.** 체험 화면은 계속 돌아간다
 * - 좌표·치수의 결정권은 그대로 코드에 있다 (ADR-029·034) — LLM 이 범위 밖 비율을 줘도 버린다
 * - 화면 표시는 응답이 정한다. 실제 LLM 이 쓴 문장을 "시연용"이라고 적지 않는다
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

/**
 * 실 DB 경로를 타는 경우(체험이 아닌 요청)에 네트워크로 나가지 않게 막는다.
 * 저장이 비어도 라우트는 200 이고 "저장되지 않았다"고 말한다 — 여기서 보는 것은 그쪽이 아니라
 * 어느 엔진이 문장을 썼는가다.
 */
function query(): Promise<{ data: never[]; error: null }> {
  const p = Promise.resolve({ data: [] as never[], error: null }) as Promise<{
    data: never[]
    error: null
  }> &
    Record<string, () => unknown>
  for (const m of ['select', 'eq', 'limit', 'order', 'in', 'maybeSingle', 'single', 'insert', 'update']) {
    p[m] = () => query()
  }
  return p
}
vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: { getUser: async () => ({ data: { user: null } }) },
    from: () => query(),
  }),
}))
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from: () => query() }) }))

const { TOUR_COOKIE } = await import('@/lib/demo/mode')
const { llmKeyForRequest, tourStudioKey } = await import('@/lib/ai/client')
const { demoAiEnabled } = await import('@/lib/ai/demo-writer')
const {
  TOUR_LLM_DAILY_MAX_DEFAULT,
  TOUR_LLM_PER_VISITOR,
  resetTourLlmBudget,
  takeTourLlmCall,
  tourLlmBudget,
  tourLlmEnabled,
} = await import('@/lib/ai/tour-budget')
const { POST: generate } = await import('@/app/api/studio/generate/route')
const { authorContent } = await import('@/lib/studio/author')

const ORIGINAL = { ...process.env }

const INSTRUCTOR: Actor = {
  role: 'instructor',
  instructorId: 'in-2',
  displayName: '박서연',
  demo: true,
}

function startTour() {
  cookieJar.map.set(TOUR_COOKIE, '1')
}

/** 실 배포와 같은 상태 — 키가 전부 들어가 있다. */
function goLive() {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key'
  process.env.ANTHROPIC_API_KEY = 'sk-ant-live'
}

let ip = 0
function post(body: unknown): Request {
  ip += 1
  return new Request('http://localhost/api/studio/generate', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.1.0.${ip % 250}` },
    body: JSON.stringify(body),
  })
}

const body = (over: Record<string, unknown> = {}) => ({
  kind: 'pen3d',
  topic: '바다에 사는 물고기 모양 장식 만들기',
  gradeBand: 'middle',
  studentCount: 20,
  durationMinutes: 90,
  venue: '교실',
  equipment: ['3D펜 20자루', 'PLA 필라멘트'],
  ...over,
})

const llmReply = (payload: unknown) =>
  createMock.mockResolvedValue({
    stop_reason: 'end_turn',
    content: [{ type: 'text', text: JSON.stringify(payload) }],
  })

/** 방문자가 적은 문장을 조각으로 짠 응답. 숫자는 비율·수량뿐이다 (ADR-034). */
const COMPOSED = {
  mode: 'compose',
  composition: {
    title: '물고기 장식',
    base: 'oval-body',
    parts: [
      { piece: 'tail-trapezoid', ratio: 0.5, quantity: 1, attach: 'back' },
      { piece: 'fin-triangle', ratio: 0.35, quantity: 2, attach: 'top' },
    ],
  },
  recipe_id: 'hex-box',
  title: '물고기 장식 만들기',
  reason: '주제의 모양에 맞는 레시피가 없어 조각으로 짰습니다.',
  tasks: ['몸통을 먼저 그리고 가장자리를 덧그립니다.', '꼬리와 지느러미를 붙입니다.'],
}

beforeEach(() => {
  cookieJar.map.clear()
  createMock.mockReset()
  state.actor = INSTRUCTOR
  resetTourLlmBudget()
  delete process.env.NEXT_PUBLIC_SUPABASE_URL
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  delete process.env.SUPABASE_SERVICE_ROLE_KEY
  delete process.env.ANTHROPIC_API_KEY
  delete process.env.TOUR_LLM
  delete process.env.TOUR_LLM_DAILY_MAX
  process.env.DEMO_AI = 'on'
})

afterEach(() => {
  process.env = { ...ORIGINAL }
  cookieJar.map.clear()
})

describe('체험 키 — 스튜디오 저작에서만 열린다', () => {
  it('체험 세션에서도 일반 LLM 키는 여전히 null 이다 (교안·추천은 그대로 시연용)', async () => {
    goLive()
    startTour()
    expect(await llmKeyForRequest()).toBeNull()
    expect(await demoAiEnabled()).toBe(true)
  })

  it('스튜디오 저작용 키는 체험 세션에서 열린다', async () => {
    goLive()
    startTour()
    expect(await tourStudioKey()).toBe('sk-ant-live')
  })

  it('체험이 아니면 스튜디오 저작용 키도 열리지 않는다 — 일반 경로는 일반 키를 쓴다', async () => {
    goLive()
    expect(await tourStudioKey()).toBeNull()
    expect(await llmKeyForRequest()).toBe('sk-ant-live')
  })

  it('키가 없으면 체험이어도 null — 데모 배포는 그대로 시연용이다', async () => {
    startTour()
    expect(await tourStudioKey()).toBeNull()
  })

  it('TOUR_LLM=off 면 닫힌다 — 비용이 걱정되면 한 줄로 끈다', async () => {
    goLive()
    startTour()
    process.env.TOUR_LLM = 'off'
    expect(tourLlmEnabled()).toBe(false)
    expect(await tourStudioKey()).toBeNull()
  })
})

describe('예산 상한 — 익명 방문자가 예산을 비우지 못한다', () => {
  it('하루 총량을 넘으면 더 부르지 않는다', async () => {
    goLive()
    startTour()
    process.env.TOUR_LLM_DAILY_MAX = '2'
    expect(await tourStudioKey()).toBe('sk-ant-live')
    expect(await tourStudioKey()).toBe('sk-ant-live')
    expect(await tourStudioKey()).toBeNull()
    expect(tourLlmBudget().used).toBe(2)
  })

  it('쓴 만큼만 센다 — 열어 보기만 한 요청은 예산을 쓰지 않는다', () => {
    process.env.TOUR_LLM_DAILY_MAX = '5'
    expect(tourLlmBudget().used).toBe(0)
    expect(takeTourLlmCall()).toBe(true)
    expect(tourLlmBudget().used).toBe(1)
    expect(tourLlmBudget().max).toBe(5)
  })

  it('기본 상한이 있다 — 환경변수를 넣지 않아도 무제한이 아니다', () => {
    expect(TOUR_LLM_DAILY_MAX_DEFAULT).toBeGreaterThan(0)
    expect(tourLlmBudget().max).toBe(TOUR_LLM_DAILY_MAX_DEFAULT)
  })

  it('방문자 한 명이 쓸 수 있는 횟수에도 상한이 있다', () => {
    expect(TOUR_LLM_PER_VISITOR.limit).toBeGreaterThan(0)
    expect(TOUR_LLM_PER_VISITOR.windowMs).toBeGreaterThan(0)
  })

  it('상한이 0 이면 기능 자체가 꺼진다', async () => {
    goLive()
    startTour()
    process.env.TOUR_LLM_DAILY_MAX = '0'
    expect(tourLlmEnabled()).toBe(false)
    expect(await tourStudioKey()).toBeNull()
  })
})

describe('저작 레이어 — 체험에서도 LLM 을 부른다', () => {
  it('체험 세션이면 실제 LLM 응답으로 조각을 짠다', async () => {
    goLive()
    startTour()
    llmReply(COMPOSED)

    const authoring = await authorContent(
      {
        kind: 'pen3d',
        grade_band: 'middle',
        student_count: 20,
        duration_minutes: 90,
        venue: '교실',
        equipment: ['3D펜 20자루'],
        topic: '물고기',
        session_id: null,
      },
      [{ id: 'hex-box', title: '육각 보관함', summary: '육각 상자', nominal_difficulty: 2 }],
      null,
      { tourStudio: true, pieces: [] },
    )

    expect(createMock).toHaveBeenCalled()
    expect(authoring.engine).toBe('llm')
  })

  it('tourStudio 를 주지 않으면 체험에서 LLM 을 부르지 않는다 — 다른 기능이 새어 들어오지 못한다', async () => {
    goLive()
    startTour()
    llmReply(COMPOSED)

    const authoring = await authorContent(
      {
        kind: 'pen3d',
        grade_band: 'middle',
        student_count: 20,
        duration_minutes: 90,
        venue: '교실',
        equipment: ['3D펜 20자루'],
        topic: '물고기',
        session_id: null,
      },
      [{ id: 'hex-box', title: '육각 보관함', summary: '육각 상자', nominal_difficulty: 2 }],
      null,
    )

    expect(createMock).not.toHaveBeenCalled()
    expect(authoring.engine).toBe('demo')
  })
})

describe('생성 라우트 — 체험에서 문장이 도안이 된다', () => {
  it('방문자가 적은 문장을 실제 LLM 이 읽고 조각으로 짠다', async () => {
    goLive()
    startTour()
    llmReply(COMPOSED)

    const json = await (await generate(post(body()))).json()

    expect(json.ok).toBe(true)
    expect(createMock).toHaveBeenCalledTimes(1)
    // 시연용 문장이 아니다 — 화면이 "시연용"이라고 적으면 안 된다.
    expect(json.demo_ai).toBe(false)
    expect(json.source).toBe('llm')
    // 조각 조합이므로 레시피 id 가 아니라 조합 id 로 만들어진다 (ADR-034).
    expect(json.artifact.pattern.title).toContain('물고기')
  })

  it('치수와 좌표는 여전히 코드가 만든다 — 범위 밖 비율은 통째로 버린다 (ADR-029)', async () => {
    goLive()
    startTour()
    llmReply({
      ...COMPOSED,
      composition: {
        ...COMPOSED.composition,
        parts: [{ piece: 'tail-trapezoid', ratio: 9.5, quantity: 1, attach: 'back' }],
      },
    })

    const json = await (await generate(post(body()))).json()
    expect(json.ok).toBe(true)
    /**
     * 범위 밖 비율이 섞인 응답은 **통째로** 버린다. 그러면 체험에서는 시연용 응답이 남고
     * (ADR-035), 화면도 "시연용"이라고 적는다.
     *
     * 레시피로 떨어지지 않는 이유는 ADR-036 이다 — 저작 레이어가 받는 후보는 **주제와 같은
     * 모양**뿐이고, "물고기"에 맞는 레시피는 목록에 없다. 맞지도 않은 레시피를 고를 기회를
     * 주면 그게 바로 "유사한 것 찾기"다.
     */
    expect(json.demo_ai).toBe(true)
    expect(json.status).toBe('validated')
    // 버린 비율(9.5배)이 도안에 들어가지 않았다 — 부품이 A4 안에 있다.
    expect(json.metrics.page_fit).toBe(true)
  })

  it('LLM 이 죽어 있으면 시연용 응답으로 떨어진다 — 규칙 1순위보다 낫다', async () => {
    goLive()
    startTour()
    // 키가 만료된 배포에서 실제로 일어나는 일이다 (401).
    createMock.mockRejectedValue(new Error('401 invalid x-api-key'))

    const json = await (await generate(post(body()))).json()

    expect(json.ok).toBe(true)
    expect(createMock).toHaveBeenCalled()
    // 시연용 문장이므로 화면도 그렇게 적는다.
    expect(json.demo_ai).toBe(true)
    // 시연용 응답은 "물고기"를 알아듣고 조각으로 짠다 — 규칙이면 후보 1순위가 그대로 나온다.
    expect(json.artifact.pattern.title).toContain('물고기')
  })

  it('예산이 떨어지면 거절하지 않고 시연용 응답으로 돌아간다', async () => {
    goLive()
    startTour()
    process.env.TOUR_LLM_DAILY_MAX = '0'

    const json = await (await generate(post(body()))).json()

    expect(json.ok).toBe(true)
    expect(createMock).not.toHaveBeenCalled()
    expect(json.demo_ai).toBe(true)
    // 도안은 그대로 나온다 — 생성·검증은 결정론적 코드다.
    expect(json.artifact).toBeTruthy()
  })

  it('같은 방문자가 계속 눌러도 상한에서 멈춘다', async () => {
    goLive()
    startTour()
    llmReply(COMPOSED)

    const sameVisitor = () =>
      new Request('http://localhost/api/studio/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': '10.9.9.9' },
        body: JSON.stringify(body()),
      })

    for (let i = 0; i < TOUR_LLM_PER_VISITOR.limit; i++) {
      const json = await (await generate(sameVisitor())).json()
      expect(json.ok).toBe(true)
    }
    const after = await (await generate(sameVisitor())).json()
    expect(after.ok).toBe(true)
    expect(after.demo_ai).toBe(true)
    expect(createMock).toHaveBeenCalledTimes(TOUR_LLM_PER_VISITOR.limit)
  })

  it('실 계정(체험 아님)은 예산과 무관하게 전과 같이 동작한다', async () => {
    goLive()
    process.env.TOUR_LLM_DAILY_MAX = '0'
    llmReply({
      recipe_id: 'hex-box',
      title: '육각 보관함',
      reason: '주제에 맞는 검수된 도안입니다.',
      tasks: ['옆면을 한 장씩 만듭니다.', '옆면을 세워 모서리를 붙입니다.'],
    })

    // 주제가 레시피와 같은 모양이어야 레시피가 후보로 올라온다 (ADR-036).
    const json = await (await generate(post(body({ topic: '연필 넣을 상자 만들기' })))).json()
    expect(createMock).toHaveBeenCalledTimes(1)
    expect(json.source).toBe('llm')
    expect(json.demo_ai).toBe(false)
  })
})
