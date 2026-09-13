// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/** 실제 API 를 호출하지 않는다. */
const createMock = vi.hoisted(() => vi.fn())
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: (...args: unknown[]) => createMock(...args) }
  },
}))

const { POST } = await import('@/app/api/inquiry-assist/route')
const { loadDataset } = await import('@/lib/db/dataset')

/**
 * 보호자 문의 도우미 API (ADR-026).
 *
 * 비로그인 경로다. 여기서 반드시 지켜지는 것:
 * - **아무것도 저장하지 않는다.** 문의는 기존 `/api/inquiry` 로만 접수된다
 * - 보호자가 적은 아이 이름·학교·연락처가 응답에 되돌아오지 않는다
 * - 응답에 강사 연락처가 없다
 * - LLM 이 없어도 규칙 초안으로 200 이다
 * - 비로그인 폼이므로 레이트 리밋이 있다
 */

const ORIGINAL = { ...process.env }
let ipSeq = 0

function req(body: unknown, opts: { ip?: string; raw?: string } = {}): Request {
  ipSeq += 1
  const ip = opts.ip ?? `203.0.${Math.floor(ipSeq / 250)}.${ipSeq % 250}`
  return new Request('http://localhost/api/inquiry-assist', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: opts.raw ?? JSON.stringify(body),
  })
}

async function call(body: unknown, opts?: { ip?: string; raw?: string }) {
  const res = await POST(req(body, opts))
  const text = await res.text()
  return { status: res.status, text, json: JSON.parse(text) as Record<string, unknown> }
}

const PII_TEXT =
  '중학교 2학년 아들이에요. 이름은 민준이고 광명하안중학교 다녀요. 학교 드론 특강 듣고 영상 찍는 데 푹 빠졌어요. 주말에 다닐 수 있을까요? 010-1234-5678'

beforeEach(() => {
  delete process.env.NEXT_PUBLIC_SUPABASE_URL
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  delete process.env.ANTHROPIC_API_KEY
  process.env.DEMO_AI = 'off'
  createMock.mockReset()
  createMock.mockRejectedValue(new Error('실제 API 를 호출하면 안 된다'))
})

afterEach(() => {
  process.env = { ...ORIGINAL }
})

describe('/api/inquiry-assist', () => {
  it('로그인 없이 200 규칙 초안을 돌려준다', async () => {
    const r = await call({ situation: PII_TEXT, regionCode: '41210' })
    expect(r.status).toBe(200)
    expect(r.json.ok).toBe(true)
    expect(r.json.source).toBe('rule')
    const draft = r.json.draft as Record<string, unknown>
    expect(draft.field).toBe('드론')
    expect(draft.grade_band).toBe('middle')
    expect(typeof draft.message).toBe('string')
    expect(createMock).not.toHaveBeenCalled()
  })

  it('아무것도 저장하지 않는다 — 문의 건수가 그대로다', async () => {
    const before = (await loadDataset()).inquiries.length
    await call({ situation: PII_TEXT, regionCode: '41210' })
    await call({ situation: '초등학생이 3D 프린터를 좋아해요', regionCode: '41210' })
    expect((await loadDataset()).inquiries.length).toBe(before)
  })

  it('보호자가 적은 아이 이름·학교·연락처를 응답에 되돌려주지 않는다', async () => {
    const r = await call({ situation: PII_TEXT, regionCode: '41210' })
    for (const raw of ['민준', '하안중학교', '010-1234-5678']) expect(r.text).not.toContain(raw)
  })

  it('응답에 강사 연락처가 없다', async () => {
    const r = await call({ situation: PII_TEXT, regionCode: '41210' })
    expect(r.text).not.toContain('@example.invalid')
    expect(r.text).not.toMatch(/phone|email|instructor_contacts/)
  })

  it('본문의 role·actor 는 아무 의미가 없다 — 권한을 주는 경로가 아니다', async () => {
    const r = await call({ situation: PII_TEXT, regionCode: '41210', role: 'admin', orgId: 'org-1' })
    expect(r.status).toBe(200)
    expect(Object.keys(r.json).sort()).toEqual(['draft', 'ok', 'source'])
  })

  it('지역 코드가 올바르지 않으면 파일럿 지역으로 찾는다', async () => {
    const r = await call({ situation: '중학생 드론', regionCode: '99999' })
    expect(r.status).toBe(200)
    expect((r.json.draft as Record<string, unknown>).stage_message).toContain('광명')
  })

  it('목록 밖 학년대·분야는 무시한다', async () => {
    const r = await call({ situation: '특강 듣고 관심이 생겼대요', gradeBand: 'college', field: '요리' })
    const draft = r.json.draft as Record<string, unknown>
    expect(r.status).toBe(200)
    expect(draft.grade_band).toBeNull()
    expect(draft.field).toBeNull()
  })

  it('폼에서 고른 학년대·분야는 받는다', async () => {
    const r = await call({ situation: '특강 듣고 관심이 생겼대요', gradeBand: 'high', field: '드론' })
    const draft = r.json.draft as Record<string, unknown>
    expect(draft.grade_band).toBe('high')
    expect(draft.field).toBe('드론')
  })

  it('깨진 JSON → 400', async () => {
    const r = await call(null, { raw: '{"situation": ' })
    expect(r.status).toBe(400)
    expect(r.json).toEqual({ ok: false, message: '요청을 읽을 수 없어요.' })
  })

  it('설명이 없거나 5자 미만이면 400', async () => {
    for (const body of [{}, { situation: '' }, { situation: '드론' }, { situation: 3 }, null, []]) {
      const r = await call(body)
      expect(r.status).toBe(400)
      expect(r.json).toEqual({ ok: false, field: 'situation', message: '아이 상황을 한두 문장으로 적어 주세요.' })
    }
  })

  it('500자를 넘으면 400', async () => {
    const r = await call({ situation: '드론 좋아해요 '.repeat(70) })
    expect(r.status).toBe(400)
    expect(r.json).toEqual({ ok: false, field: 'situation', message: '500자 안으로 적어 주세요.' })
  })

  it('같은 IP 가 1분에 10번을 넘기면 429', async () => {
    const ip = '192.0.2.77'
    for (let i = 0; i < 10; i += 1) {
      expect((await call({ situation: '중학생 드론 수업' }, { ip })).status).toBe(200)
    }
    const r = await call({ situation: '중학생 드론 수업' }, { ip })
    expect(r.status).toBe(429)
    expect(r.json).toEqual({ ok: false, message: '잠시 후 다시 시도해 주세요.' })
  })

  it('LLM 이 실패해도 200 규칙 초안', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-test'
    createMock.mockRejectedValue(new Error('overloaded'))
    const r = await call({ situation: PII_TEXT, regionCode: '41210' })
    expect(r.status).toBe(200)
    expect(r.json.source).toBe('rule')
  })
})
