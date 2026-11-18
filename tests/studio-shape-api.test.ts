// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Actor } from '@/lib/auth/actor'

/**
 * 생성 라우트의 모양 경로 (ADR-036·037·038).
 *
 * 여기서 반드시 지켜지는 것:
 * - 2D 요청에 입체 레시피가 나가지 않는다
 * - 검수되지 않은 모양에는 **그 사실이 화면에 간다** (`PEN_SHAPE_UNREVIEWED`)
 * - 이미지 검토의 부정 판정은 **warn 이고 막지 않는다**. 검토 실패는 부정이 아니다
 * - 검토는 검수되지 않은 모양에만 돈다 — 레시피·아틀라스에는 호출이 없다
 */

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
 * 아틀라스는 이 파일에서 **비워 둔다.**
 *
 * 여기서 보는 것은 윤곽 제안(DSL)·레시피·이미지 검토 경로다. 모양 경로의 순서가
 * 레시피 → 아틀라스 → 윤곽 제안이므로(ADR-036), 아틀라스에 주제와 겹치는 단어가 하나라도
 * 들어오면 이 파일의 시험이 조용히 다른 가지로 새어 나간다 — 단어를 적재했을 뿐인데
 * 라우트 시험이 깨지고, 깨지지 않더라도 보려던 가지를 안 보게 된다.
 * 적재 내용과 무관하게 같은 가지를 보도록 목록을 고정한다.
 * 아틀라스 자체의 품질은 `tests/studio-atlas.test.ts` 가 본다.
 */
vi.mock('@/data/atlas/records', () => ({ ATLAS_RECORDS: [] }))

const { POST: generate } = await import('@/app/api/studio/generate/route')

const INSTRUCTOR: Actor = {
  role: 'instructor',
  instructorId: 'in-1',
  displayName: '김도현',
  demo: true,
}

const ORIGINAL = { ...process.env }

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
  topic: '코끼리',
  gradeBand: 'middle',
  studentCount: 20,
  durationMinutes: 90,
  venue: '교실',
  equipment: ['3D펜 20자루', 'PLA 필라멘트'],
  form: 'flat',
  ...over,
})

const ring = (divisions: number, radius: number) =>
  Array.from({ length: divisions }, (_, i) => {
    const t = (2 * Math.PI * i) / divisions
    return {
      x: Number((0.5 + radius * Math.cos(t)).toFixed(3)),
      y: Number((0.5 + radius * Math.sin(t)).toFixed(3)),
    }
  })

const OUTLINE = {
  mode: 'outline',
  outline: {
    title: '코끼리',
    silhouette: ring(26, 0.45),
    details: [],
    holes: [],
    hanger: false,
  },
  recipe_id: '',
  title: '코끼리 만들기',
  reason: '주제 그대로의 모양으로 만듭니다.',
  tasks: ['윤곽선을 따라 천천히 그립니다.', '식은 뒤에 떼어냅니다.'],
}

const reply = (payload: unknown) => ({
  stop_reason: 'end_turn',
  content: [{ type: 'text', text: JSON.stringify(payload) }],
})

beforeEach(() => {
  createMock.mockReset()
  state.actor = INSTRUCTOR
  process.env = { ...ORIGINAL, ANTHROPIC_API_KEY: 'sk-test', AI_DEMO: 'off' }
})
afterEach(() => {
  process.env = { ...ORIGINAL }
  createMock.mockReset()
})

/** 저작 → 이미지 검토 순으로 두 번 불린다 */
const replies = (...payloads: unknown[]) => {
  let i = 0
  createMock.mockImplementation(() => Promise.resolve(reply(payloads[Math.min(i++, payloads.length - 1)])))
}

describe('2D 요청', () => {
  it('제안한 모양으로 만들고 출처를 알려준다', async () => {
    replies(OUTLINE, { looks_like: true })
    const json = await (await generate(post(body()))).json()

    expect(json.ok).toBe(true)
    expect(json.status).toBe('validated')
    expect(json.form).toBe('flat')
    expect(json.shape_source).toBe('dsl')
    expect(json.artifact.pattern.parts.length).toBe(1)
    expect(json.artifact.pattern.joints).toEqual([])
  })

  it('검수되지 않은 모양이라고 화면에 적는다 — 막지는 않는다', async () => {
    replies(OUTLINE, { looks_like: true })
    const json = await (await generate(post(body()))).json()

    const codes = json.findings.map((f: { code: string }) => f.code)
    expect(codes).toContain('PEN_SHAPE_UNREVIEWED')
    const unreviewed = json.findings.find((f: { code: string }) => f.code === 'PEN_SHAPE_UNREVIEWED')
    expect(unreviewed.severity).toBe('warn')
    expect(json.status).toBe('validated')
  })

  it('이미지 검토가 부정이면 warn 으로 남기고 빠진 것을 전한다', async () => {
    replies(OUTLINE, { looks_like: false, missing: '코가 없습니다' })
    const json = await (await generate(post(body()))).json()

    expect(json.shape_review).toBe('unrecognized')
    expect(json.shape_missing).toBe('코가 없습니다')
    const finding = json.findings.find((f: { code: string }) => f.code === 'PEN_SHAPE_UNRECOGNIZED')
    expect(finding.severity).toBe('warn')
    expect(finding.message).toContain('코가 없습니다')
    // warn 은 ok 를 깨지 않는다 — 물리 검증의 의미를 흐리지 않는다 (ADR-038)
    expect(json.status).toBe('validated')
  })

  it('검토가 실패하면 부정으로 적지 않는다', async () => {
    let i = 0
    createMock.mockImplementation(() => {
      i += 1
      if (i === 1) return Promise.resolve(reply(OUTLINE))
      return Promise.reject(new Error('timeout'))
    })
    const json = await (await generate(post(body()))).json()

    expect(json.shape_review).toBe('skipped')
    const codes = json.findings.map((f: { code: string }) => f.code)
    expect(codes).toContain('PEN_SHAPE_UNREVIEWED')
    expect(codes).not.toContain('PEN_SHAPE_UNRECOGNIZED')
  })

  it('라운드에도 남는다 — 상세 화면이 라운드를 보여준다 (ADR-030)', async () => {
    replies(OUTLINE, { looks_like: false, missing: '귀가 없습니다' })
    const json = await (await generate(post(body()))).json()

    const last = json.rounds[json.rounds.length - 1]
    expect(last.findings.map((f: { code: string }) => f.code)).toContain('PEN_SHAPE_UNRECOGNIZED')
  })

  it('제안이 깨지고 아틀라스가 비어 있으면 실패로 끝낸다', async () => {
    replies({ mode: 'outline', outline: { title: '코끼리' }, recipe_id: '', title: '', reason: '', tasks: [] })
    const json = await (await generate(post(body()))).json()

    expect(json.ok).toBe(true)
    expect(json.status).toBe('failed')
    expect(json.findings.map((f: { code: string }) => f.code)).toContain('PEN_SHAPE_UNAVAILABLE')
  })

  it('잘못된 모드 값은 400 이다', async () => {
    const response = await generate(post(body({ form: '2.5D' })))
    expect(response.status).toBe(400)
  })
})

describe('3D 요청', () => {
  it('주제에 맞는 레시피가 있으면 레시피를 쓰고 검토를 돌리지 않는다', async () => {
    replies({
      recipe_id: 'hex-box',
      title: '연필 상자',
      reason: '주제에 맞는 검수된 도안입니다.',
      tasks: ['옆면을 한 장씩 만듭니다.', '옆면을 세워 모서리를 붙입니다.'],
    })
    const json = await (
      await generate(post(body({ form: 'solid', topic: '연필 넣을 상자' })))
    ).json()

    expect(json.recipe_id).toBe('hex-box')
    expect(json.shape_source).toBe('recipe')
    expect(json.shape_review).toBe('skipped')
    // 저작 1회뿐이다 — 검수된 모양에는 검토를 걸지 않는다 (ADR-038)
    expect(createMock).toHaveBeenCalledTimes(1)
  })

  it('제안한 모양은 적층으로 만든다', async () => {
    replies(OUTLINE, { looks_like: true })
    const json = await (await generate(post(body({ form: 'solid' })))).json()

    const layer = json.artifact.pattern.parts.find((p: { id: string }) => p.id === 'layer')
    expect(layer.quantity).toBeGreaterThan(1)
    expect(json.shape_source).toBe('dsl')
  })

  it('form 을 보내지 않으면 입체다 — 이 칸이 없던 클라이언트와 같은 결과다', async () => {
    const payload = body({ topic: '연필 넣을 상자' })
    delete (payload as Record<string, unknown>).form
    replies({
      recipe_id: 'hex-box',
      title: '연필 상자',
      reason: '주제에 맞는 검수된 도안입니다.',
      tasks: ['옆면을 한 장씩 만듭니다.', '옆면을 세워 모서리를 붙입니다.'],
    })
    const json = await (await generate(post(payload))).json()
    expect(json.form).toBe('solid')
    expect(json.artifact.pattern.joints.length).toBeGreaterThan(0)
  })
})
