// @vitest-environment node
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Actor } from '@/lib/auth/actor'

/**
 * **스튜디오가 클로드 API 를 부르는 조건 — 스위치 하나** (ADR-046).
 *
 * 이 파일이 고정하는 것:
 * - 기본값은 **끈 상태**다. 키가 환경에 들어 있어도 스위치가 없으면 호출이 0회다 (= 토큰 0)
 * - 켜면 **클로드가 먼저 그린다.** 같은 단어의 검수된 아틀라스가 있어도 제안을 먼저 쓴다
 * - 클로드가 실패하거나 그 모양이 물리 검증에 걸리면 **검수된 모양으로 내려간다** — 켠 것이
 *   산출물을 나쁘게 만들지 않는다
 * - 체험 세션은 스위치를 켜도 윤곽 제안·이미지 검토를 하지 않는다 (ADR-033 CRITICAL)
 * - 스튜디오 코드가 게이트를 우회해 키를 읽지 않는다
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
const { studioLlmAvailable, studioLlmEnabled, studioLlmGrant } = await import('@/lib/ai/studio-llm')
const { POST: generate } = await import('@/app/api/studio/generate/route')
const { resetTourLlmBudget } = await import('@/lib/ai/tour-budget')

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
    headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.7.0.${ip % 250}` },
    body: JSON.stringify(body),
  })
}

const body = (over: Record<string, unknown> = {}) => ({
  kind: 'pen3d',
  topic: '자전거',
  gradeBand: 'middle',
  studentCount: 20,
  durationMinutes: 90,
  venue: '교실',
  equipment: ['3D펜 20자루', 'PLA 필라멘트', '실리콘 매트'],
  form: 'flat',
  ...over,
})

/** 0~1 좌표의 둥근 윤곽. `studio-outline-author.test.ts` 와 같은 형태다 */
const ring = (divisions: number, radius: number) =>
  Array.from({ length: divisions }, (_, i) => {
    const t = (2 * Math.PI * i) / divisions
    return {
      x: Number((0.5 + radius * Math.cos(t)).toFixed(3)),
      y: Number((0.5 + radius * Math.sin(t)).toFixed(3)),
    }
  })

/** 저작 레이어가 받아들이는 윤곽 제안 하나 */
const outlineReply = (title = '자전거') => ({
  stop_reason: 'end_turn',
  content: [
    {
      type: 'text',
      text: JSON.stringify({
        mode: 'outline',
        outline: { title, silhouette: ring(24, 0.45), details: [], holes: [], hanger: false },
        title: `${title} 만들기`,
        reason: '주제 그대로의 모양을 만듭니다.',
        tasks: ['윤곽선을 따라 천천히 그립니다.', '식은 뒤에 떼어냅니다.'],
      }),
    },
  ],
})

beforeEach(() => {
  cookieJar.map.clear()
  createMock.mockReset()
  resetTourLlmBudget()
  state.actor = INSTRUCTOR
  process.env = { ...ORIGINAL, ANTHROPIC_API_KEY: 'sk-ant-test', DEMO_AI: 'off' }
  delete process.env.STUDIO_LLM
})

afterEach(() => {
  process.env = { ...ORIGINAL }
  cookieJar.map.clear()
  createMock.mockReset()
})

// ============================================================================
// 1. 스위치 자체
// ============================================================================

describe('스위치 — 기본값은 꺼진 상태다', () => {
  it('환경변수가 없으면 꺼져 있다', () => {
    expect(studioLlmEnabled()).toBe(false)
  })

  it('`on` 한 값만 켠다 — 오타로 과금이 열리지 않는다', () => {
    for (const value of ['on', ' ON ', 'On']) {
      process.env.STUDIO_LLM = value
      expect(studioLlmEnabled(), value).toBe(true)
    }
    for (const value of ['', 'off', 'true', '1', 'yes', 'enabled']) {
      process.env.STUDIO_LLM = value
      expect(studioLlmEnabled(), value).toBe(false)
    }
  })

  it('꺼져 있으면 키가 있어도 키를 돌려주지 않는다', async () => {
    expect(await studioLlmGrant()).toBeNull()
    expect(await studioLlmGrant({ tourStudio: true })).toBeNull()
    expect(await studioLlmAvailable()).toBe(false)
  })

  it('켜고 키가 있으면 일반 키를 돌려준다', async () => {
    process.env.STUDIO_LLM = 'on'
    expect(await studioLlmGrant()).toEqual({ key: 'sk-ant-test', scope: 'regular' })
    expect(await studioLlmAvailable()).toBe(true)
  })

  it('켜도 키가 없으면 null 이다', async () => {
    process.env.STUDIO_LLM = 'on'
    delete process.env.ANTHROPIC_API_KEY
    expect(await studioLlmGrant()).toBeNull()
    expect(await studioLlmAvailable()).toBe(false)
  })

  it('체험 세션은 `tourStudio` 를 줄 때만, 그리고 예산 안에서만 키를 받는다 (ADR-035)', async () => {
    process.env.STUDIO_LLM = 'on'
    cookieJar.map.set(TOUR_COOKIE, '1')

    // 일반 키 경로는 체험에서 null 이다 (ADR-033)
    expect(await studioLlmGrant()).toBeNull()
    expect(await studioLlmGrant({ tourStudio: true })).toEqual({
      key: 'sk-ant-test',
      scope: 'tour',
    })

    // 스위치를 끄면 체험 예산도 열리지 않는다
    delete process.env.STUDIO_LLM
    expect(await studioLlmGrant({ tourStudio: true })).toBeNull()
  })
})

// ============================================================================
// 2. 생성 라우트 — 꺼져 있으면 호출이 0회다
// ============================================================================

describe('생성 라우트 — 꺼져 있으면 클로드를 부르지 않는다', () => {
  it('목록에 없는 주제여도 호출이 0회이고, 명패로 끝난다', async () => {
    const json = await (await generate(post(body({ topic: '읽을수없는주제엑스와이지' })))).json()
    expect(createMock).not.toHaveBeenCalled()
    expect(json.ok).toBe(true)
    expect(json.shape_source).toBe('fallback')
  })

  it('검수된 모양이 있는 주제도 호출이 0회다 — 미리 만들어 둔 도안이 나간다', async () => {
    const json = await (await generate(post(body({ topic: '자전거' })))).json()
    expect(createMock).not.toHaveBeenCalled()
    expect(json.shape_source).toBe('pack')
    expect(json.authored_by).toBe('pack')
  })

  it('이미지 검토(ADR-038)도 돌지 않는다', async () => {
    const json = await (await generate(post(body({ topic: '읽을수없는주제엑스와이지' })))).json()
    expect(json.shape_review).toBe('skipped')
    expect(createMock).not.toHaveBeenCalled()
  })
})

// ============================================================================
// 3. 생성 라우트 — 켜면 클로드가 먼저 그린다
// ============================================================================

describe('생성 라우트 — 켜면 클로드가 먼저 그린다 (ADR-046)', () => {
  beforeEach(() => {
    process.env.STUDIO_LLM = 'on'
  })

  it('같은 단어의 검수된 모양이 있어도 제안을 먼저 쓴다', async () => {
    createMock.mockResolvedValue(outlineReply('자전거'))
    const json = await (await generate(post(body({ topic: '자전거' })))).json()

    expect(createMock).toHaveBeenCalled()
    expect(json.ok).toBe(true)
    expect(json.shape_source).toBe('dsl')
    // 검수되지 않은 모양이라는 사실이 산출물에 남는다 (ADR-036)
    expect(json.findings.some((f: { code: string }) => f.code === 'PEN_SHAPE_UNREVIEWED')).toBe(
      true,
    )
  })

  it('클로드가 실패하면 검수된 모양으로 내려간다 — 켠 것이 결과를 나쁘게 만들지 않는다', async () => {
    createMock.mockRejectedValue(new Error('offline'))
    const json = await (await generate(post(body({ topic: '자전거' })))).json()

    expect(createMock).toHaveBeenCalled()
    expect(json.ok).toBe(true)
    expect(json.shape_source).toBe('pack')
    expect(json.status).toBe('validated')
  })

  it('목록에 없는 주제도 제안으로 만든다 — 명패까지 내려가지 않는다', async () => {
    createMock.mockResolvedValue(outlineReply('읽을수없는주제엑스와이지'))
    const json = await (await generate(post(body({ topic: '읽을수없는주제엑스와이지' })))).json()

    expect(json.shape_source).toBe('dsl')
    expect(json.findings.some((f: { code: string }) => f.code === 'PEN_SHAPE_FALLBACK')).toBe(false)
  })

  it('숫자는 여전히 코드가 만든다 — 제안은 0~1 비율뿐이다 (CLAUDE.md)', async () => {
    createMock.mockResolvedValue(outlineReply('자전거'))
    const json = await (await generate(post(body({ topic: '자전거' })))).json()

    // mm 는 산출물에만 있고 응답의 어느 좌표도 LLM 이 정하지 않았다
    expect(json.metrics.page_fit).toBe(true)
    expect(json.metrics.total_stroke_mm).toBeGreaterThan(0)
    expect(json.status).toBe('validated')
  })
})

// ============================================================================
// 4. 체험 세션 — 스위치를 켜도 그리지 않는다 (ADR-033 CRITICAL)
// ============================================================================

describe('체험 세션 — 스위치를 켜도 윤곽 제안·이미지 검토를 돌리지 않는다', () => {
  beforeEach(() => {
    process.env.STUDIO_LLM = 'on'
    cookieJar.map.set(TOUR_COOKIE, '1')
  })

  it('검수된 모양이 있으면 그대로 쓴다 — 호출이 0회다', async () => {
    const json = await (await generate(post(body({ topic: '자전거' })))).json()
    expect(createMock).not.toHaveBeenCalled()
    expect(json.shape_source).toBe('pack')
  })

  it('제안을 돌려줘도 그 모양을 쓰지 않는다 (ADR-033)', async () => {
    createMock.mockResolvedValue(outlineReply('읽을수없는주제엑스와이지'))
    const json = await (await generate(post(body({ topic: '읽을수없는주제엑스와이지' })))).json()
    expect(json.shape_source).not.toBe('dsl')
    expect(json.shape_review).toBe('skipped')
  })
})

// ============================================================================
// 5. 구조 — 게이트를 우회하는 코드가 없다
// ============================================================================

describe('구조 — 스튜디오는 게이트를 거쳐서만 키를 읽는다', () => {
  it('스튜디오 코드가 `llmKeyForRequest`·`tourStudioKey` 를 직접 부르지 않는다', () => {
    const roots = [join(process.cwd(), 'src', 'lib', 'studio'), join(process.cwd(), 'src', 'app', 'api', 'studio')]
    const files: string[] = []
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name)
        if (statSync(p).isDirectory()) walk(p)
        else if (/\.(ts|tsx)$/.test(name)) files.push(p)
      }
    }
    for (const root of roots) walk(root)

    const offenders = files
      .filter((f) => /\b(llmKeyForRequest|tourStudioKey)\b/.test(readFileSync(f, 'utf8')))
      .map((f) => relative(process.cwd(), f).split(sep).join('/'))
    expect(offenders).toEqual([])
  })
})
