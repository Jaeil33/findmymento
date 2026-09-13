// @vitest-environment node
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { POST as followupPlan } from '@/app/api/followup-plan/route'
import { POST as resultReport } from '@/app/api/result-report/route'
import { POST as sessionDebrief } from '@/app/api/session-debrief/route'
import type { Actor } from '@/lib/auth/actor'
import { loadDataset } from '@/lib/db/dataset'

/**
 * 수업 후 AI 3종 API 라우트 (ADR-024).
 *
 * 여기서 반드시 지켜지는 것:
 * - 역할·소속은 `getActor()` 로만 판단한다. 본문의 orgId·instructorId·role 은 무시된다
 * - 결과보고서·후속 과정 제안은 기관 담당자 + 자기 기관 회차만, 수업 회고는 그 회차의 배정 강사만
 * - 역할이 틀리면 403, 없는 회차와 남의 회차는 **똑같은** 404 (존재 여부를 흘리지 않는다)
 * - LLM 이 없어도 규칙 초안으로 200 이다
 * - 아무것도 저장하지 않고, 응답에 연락처가 없다
 *
 * 액터는 가짜로 바꾼다. Anthropic SDK 도 가짜로 바꿔 실제 API 를 호출하지 않는다.
 */

const state = vi.hoisted(() => ({
  actor: null as Actor | null,
  throwGenerate: false,
  nullGenerate: false,
}))

const createMock = vi.hoisted(() => vi.fn())

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: (...args: unknown[]) => createMock(...args) }
  },
}))

vi.mock('@/lib/auth/actor', () => ({
  getActor: async () => state.actor,
}))

// 기본은 원래 구현 그대로. 예상 밖 예외·null 경로를 확인할 때만 스위치를 켠다.
vi.mock('@/lib/ai/result-report', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/lib/ai/result-report')>()
  return {
    ...mod,
    generateResultReport: async (...args: Parameters<typeof mod.generateResultReport>) => {
      if (state.throwGenerate) throw new Error('unexpected')
      if (state.nullGenerate) return null
      return mod.generateResultReport(...args)
    },
  }
})

vi.mock('@/lib/ai/followup-plan', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/lib/ai/followup-plan')>()
  return {
    ...mod,
    generateFollowupPlan: async (...args: Parameters<typeof mod.generateFollowupPlan>) => {
      if (state.throwGenerate) throw new Error('unexpected')
      if (state.nullGenerate) return null
      return mod.generateFollowupPlan(...args)
    },
  }
})

vi.mock('@/lib/ai/session-debrief', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/lib/ai/session-debrief')>()
  return {
    ...mod,
    generateDebrief: async (...args: Parameters<typeof mod.generateDebrief>) => {
      if (state.throwGenerate) throw new Error('unexpected')
      if (state.nullGenerate) return null
      return mod.generateDebrief(...args)
    },
  }
})

// actor.ts 의 데모 액터와 같은 모양.
const ORG: Actor = { role: 'org_member', orgId: 'org-1', memberId: 'om-1', displayName: '이수진', demo: true }
const SCHOOL: Actor = { role: 'org_member', orgId: 'org-2', memberId: 'om-2', displayName: '강민호', demo: true }
const IN2: Actor = { role: 'instructor', instructorId: 'in-2', displayName: '박서연', demo: true }
const IN1: Actor = { role: 'instructor', instructorId: 'in-1', displayName: '강사', demo: true }
const ADMIN: Actor = { role: 'admin', displayName: '운영자', demo: true }

type Handler = (request: Request) => Promise<Response>

const ORG_ROUTES: [string, Handler][] = [
  ['result-report', resultReport],
  ['followup-plan', followupPlan],
]

const ALL_ROUTES: [string, Handler][] = [...ORG_ROUTES, ['session-debrief', sessionDebrief]]

const ORIGINAL = { ...process.env }

let ipSeq = 0

/** 레이트리밋 테스트가 아니면 요청마다 다른 IP 를 준다 — clientKey 가 IP 단위다. */
function req(body: unknown, opts: { ip?: string; raw?: string } = {}): Request {
  ipSeq += 1
  const ip = opts.ip ?? `198.51.${Math.floor(ipSeq / 250)}.${ipSeq % 250}`
  return new Request('http://localhost/api/post-session', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: opts.raw ?? JSON.stringify(body),
  })
}

async function call(handler: Handler, actor: Actor | null, body: unknown, opts?: { ip?: string; raw?: string }) {
  state.actor = actor
  const res = await handler(req(body, opts))
  const text = await res.text()
  return { status: res.status, text, json: JSON.parse(text) as Record<string, unknown> }
}

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+/

function expectNoContacts(text: string) {
  expect(text).not.toContain('010-')
  expect(text).not.toMatch(EMAIL)
  expect(text).not.toContain('@example.invalid')
  expect(text).not.toContain('phone')
  expect(text).not.toContain('instructor_contacts')
}

beforeEach(() => {
  // 데모 모드 + LLM 키 없음 — 규칙 초안이 나와야 한다.
  delete process.env.NEXT_PUBLIC_SUPABASE_URL
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  delete process.env.ANTHROPIC_API_KEY
  state.actor = null
  state.throwGenerate = false
  state.nullGenerate = false
  createMock.mockReset()
  createMock.mockRejectedValue(new Error('실제 API 를 호출하면 안 된다'))
})

afterEach(() => {
  process.env = { ...ORIGINAL }
})

describe.each(ORG_ROUTES)('기관 라우트 /api/%s', (_name, handler) => {
  it('액터 없음 → 403', async () => {
    const r = await call(handler, null, { sessionId: 'ls-1' })
    expect(r.status).toBe(403)
    expect(r.json).toEqual({ ok: false, message: '권한이 없습니다.' })
  })

  it('강사 액터 → 403 (강사는 기관 라우트를 쓸 수 없다)', async () => {
    const r = await call(handler, IN2, { sessionId: 'ls-1' })
    expect(r.status).toBe(403)
    expect(r.json).toEqual({ ok: false, message: '권한이 없습니다.' })
  })

  it('운영자 액터 → 403', async () => {
    const r = await call(handler, ADMIN, { sessionId: 'ls-1' })
    expect(r.status).toBe(403)
  })

  it('본문에 role 을 적어도 액터가 없으면 403', async () => {
    const r = await call(handler, null, { sessionId: 'ls-1', role: 'org_member', orgId: 'org-1' })
    expect(r.status).toBe(403)
  })

  it('타 기관 회차와 없는 회차는 똑같은 404 다', async () => {
    const other = await call(handler, SCHOOL, { sessionId: 'ls-1' })
    const missing = await call(handler, ORG, { sessionId: 'ls-999' })

    expect(other.status).toBe(404)
    expect(missing.status).toBe(404)
    expect(other.json).toEqual({ ok: false, message: '회차를 찾을 수 없습니다.' })
    expect(other.text).toBe(missing.text)
  })

  it('org-1 담당자가 org-2 회차(ls-4)를 부르면 404', async () => {
    const r = await call(handler, ORG, { sessionId: 'ls-4' })
    expect(r.status).toBe(404)
    expect(r.json).toEqual({ ok: false, message: '회차를 찾을 수 없습니다.' })
  })

  it('본문의 orgId 로 남의 기관 회차를 열 수 없다', async () => {
    const r = await call(handler, SCHOOL, { sessionId: 'ls-1', orgId: 'org-1', role: 'org_member' })
    expect(r.status).toBe(404)
  })

  it('org 담당자가 자기 회차 ls-1 → 200 규칙 초안', async () => {
    const r = await call(handler, ORG, { sessionId: 'ls-1' })
    expect(r.status).toBe(200)
    expect(r.json.ok).toBe(true)
    expect(r.json.source).toBe('rule')
    const draft = r.json.draft as Record<string, unknown>
    expect(draft.session_id).toBe('ls-1')
    expect(draft.source).toBe(r.json.source)
    expect(createMock).not.toHaveBeenCalled()
    expectNoContacts(r.text)
  })

  it('학교 담당자도 자기 학교 회차 ls-4 → 200 (organizations.type 으로 분기하지 않는다)', async () => {
    const r = await call(handler, SCHOOL, { sessionId: 'ls-4' })
    expect(r.status).toBe(200)
    expect((r.json.draft as Record<string, unknown>).session_id).toBe('ls-4')
    expectNoContacts(r.text)
  })

  it('깨진 JSON → 400', async () => {
    const r = await call(handler, ORG, null, { raw: '{"sessionId": ' })
    expect(r.status).toBe(400)
    expect(r.json).toEqual({ ok: false, message: '요청을 읽을 수 없습니다.' })
  })

  it('sessionId 없음 → 400', async () => {
    const r = await call(handler, ORG, {})
    expect(r.status).toBe(400)
    expect(r.json).toEqual({ ok: false, message: '회차를 지정해 주세요.' })
  })

  it('sessionId 가 문자열이 아니거나 비었거나 64자를 넘으면 400', async () => {
    for (const body of [{ sessionId: 1 }, { sessionId: '' }, { sessionId: 'x'.repeat(65) }, null, []]) {
      const r = await call(handler, ORG, body)
      expect(r.status, JSON.stringify(body)).toBe(400)
      expect(r.json).toEqual({ ok: false, message: '회차를 지정해 주세요.' })
    }
  })

  it('역할 확인이 본문 검증보다 먼저다 — 강사가 깨진 JSON 을 보내도 403', async () => {
    const r = await call(handler, IN2, null, { raw: 'not json' })
    expect(r.status).toBe(403)
  })
})

describe('강사 라우트 /api/session-debrief', () => {
  it('액터 없음 → 403', async () => {
    const r = await call(sessionDebrief, null, { sessionId: 'ls-1' })
    expect(r.status).toBe(403)
    expect(r.json).toEqual({ ok: false, message: '권한이 없습니다.' })
  })

  it('기관 액터 → 403 (기관은 강사 회고를 만들 수 없다)', async () => {
    const r = await call(sessionDebrief, ORG, { sessionId: 'ls-1' })
    expect(r.status).toBe(403)
    expect(r.json).toEqual({ ok: false, message: '권한이 없습니다.' })
  })

  it('운영자 액터 → 403', async () => {
    const r = await call(sessionDebrief, ADMIN, { sessionId: 'ls-1' })
    expect(r.status).toBe(403)
  })

  it('배정되지 않은 강사(in-1)가 ls-1 → 404', async () => {
    const r = await call(sessionDebrief, IN1, { sessionId: 'ls-1' })
    expect(r.status).toBe(404)
    expect(r.json).toEqual({ ok: false, message: '배정된 회차가 아닙니다.' })
  })

  it('남의 배정 회차와 없는 회차는 똑같은 404 다', async () => {
    const other = await call(sessionDebrief, IN2, { sessionId: 'ls-2' })
    const missing = await call(sessionDebrief, IN2, { sessionId: 'ls-999' })
    expect(other.status).toBe(404)
    expect(missing.status).toBe(404)
    expect(other.text).toBe(missing.text)
  })

  it('본문의 instructorId 로 남의 회차를 열 수 없다', async () => {
    const r = await call(sessionDebrief, IN1, { sessionId: 'ls-1', instructorId: 'in-2', role: 'instructor' })
    expect(r.status).toBe(404)
  })

  it('배정 강사(in-2)가 ls-1 → 200 규칙 초안', async () => {
    const r = await call(sessionDebrief, IN2, { sessionId: 'ls-1' })
    expect(r.status).toBe(200)
    expect(r.json.ok).toBe(true)
    expect(r.json.source).toBe('rule')
    expect((r.json.draft as Record<string, unknown>).session_id).toBe('ls-1')
    expect(createMock).not.toHaveBeenCalled()
    expectNoContacts(r.text)
  })

  it('깨진 JSON → 400, sessionId 없음 → 400', async () => {
    const broken = await call(sessionDebrief, IN2, null, { raw: '{' })
    expect(broken.status).toBe(400)
    expect(broken.json).toEqual({ ok: false, message: '요청을 읽을 수 없습니다.' })

    const missing = await call(sessionDebrief, IN2, { id: 'ls-1' })
    expect(missing.status).toBe(400)
    expect(missing.json).toEqual({ ok: false, message: '회차를 지정해 주세요.' })
  })
})

describe('LLM 이 없어도, 생성이 예상 밖으로 실패해도 화면은 뜬다', () => {
  const OWNER: Record<string, Actor> = {
    'result-report': ORG,
    'followup-plan': ORG,
    'session-debrief': IN2,
  }

  it.each(ALL_ROUTES)('/api/%s — 생성 함수가 throw 하면 규칙 초안으로 200', async (name, handler) => {
    state.throwGenerate = true
    const r = await call(handler, OWNER[name]!, { sessionId: 'ls-1' })
    expect(r.status).toBe(200)
    expect(r.json.ok).toBe(true)
    expect(r.json.source).toBe('rule')
    expect((r.json.draft as Record<string, unknown>).session_id).toBe('ls-1')
    expectNoContacts(r.text)
  })

  it.each(ALL_ROUTES)('/api/%s — 생성 결과가 null 이면 소유 확인 실패와 같은 404', async (name, handler) => {
    const denied = await call(handler, name === 'session-debrief' ? IN2 : ORG, { sessionId: 'ls-999' })
    state.nullGenerate = true
    const r = await call(handler, OWNER[name]!, { sessionId: 'ls-1' })
    expect(r.status).toBe(404)
    expect(r.text).toBe(denied.text)
  })

  it.each(ALL_ROUTES)('/api/%s — 다른 소유 회차(ls-2)도 규칙 초안으로 200', async (name, handler) => {
    const actor = name === 'session-debrief' ? IN1 : ORG
    const r = await call(handler, actor, { sessionId: 'ls-2' })
    expect(r.status).toBe(200)
    expect(r.json.source).toBe('rule')
    expectNoContacts(r.text)
  })
})

describe('레이트리밋', () => {
  it.each(ALL_ROUTES)('/api/%s — 같은 clientKey 로 11번째 호출은 429', async (name, handler) => {
    const actor = name === 'session-debrief' ? IN2 : ORG
    const ip = `203.0.113.${name.length}`
    for (let i = 0; i < 10; i++) {
      const r = await call(handler, actor, { sessionId: 'ls-1' }, { ip })
      expect(r.status, `${i + 1}번째`).toBe(200)
    }
    const blocked = await call(handler, actor, { sessionId: 'ls-1' }, { ip })
    expect(blocked.status).toBe(429)
    expect(blocked.json).toEqual({ ok: false, message: '잠시 후 다시 시도해 주세요.' })
  })

  it('레이트리밋이 역할 확인보다 먼저다 — 액터가 없어도 11번째는 429', async () => {
    const ip = '203.0.113.200'
    for (let i = 0; i < 10; i++) {
      const r = await call(resultReport, null, { sessionId: 'ls-1' }, { ip })
      expect(r.status).toBe(403)
    }
    const blocked = await call(resultReport, null, { sessionId: 'ls-1' }, { ip })
    expect(blocked.status).toBe(429)
  })
})

describe('저장하지 않는다 (ADR-024)', () => {
  it('세 라우트를 호출해도 교안·섭외 요청·설문 응답 수가 그대로다', async () => {
    const before = await loadDataset()
    const counts = {
      lessonPlans: before.lessonPlans.length,
      recruitmentRequests: before.recruitmentRequests.length,
      surveyResponses: before.surveyResponses.length,
      interests: before.interests.length,
    }

    expect((await call(resultReport, ORG, { sessionId: 'ls-1' })).status).toBe(200)
    expect((await call(followupPlan, ORG, { sessionId: 'ls-1' })).status).toBe(200)
    expect((await call(sessionDebrief, IN2, { sessionId: 'ls-1' })).status).toBe(200)

    const after = await loadDataset()
    expect({
      lessonPlans: after.lessonPlans.length,
      recruitmentRequests: after.recruitmentRequests.length,
      surveyResponses: after.surveyResponses.length,
      interests: after.interests.length,
    }).toEqual(counts)
  })
})

describe('정적 검사', () => {
  const FILES: Record<string, string> = {
    'result-report': 'src/app/api/result-report/route.ts',
    'followup-plan': 'src/app/api/followup-plan/route.ts',
    'session-debrief': 'src/app/api/session-debrief/route.ts',
  }
  const source = (name: string) => readFileSync(join(process.cwd(), FILES[name]!), 'utf8')

  it.each(Object.keys(FILES))('%s — 연락처·클라이언트 Supabase·SDK 를 쓰지 않고 getActor 로 판별한다', (name) => {
    const src = source(name)
    expect(src).toContain('getActor')
    for (const banned of [
      'instructor_contacts',
      '@/lib/supabase/client',
      '@anthropic-ai/sdk',
      'getServiceSupabase',
      '@/lib/db/writes',
      'console.log',
      'phone',
      'email',
      'pseudo_code',
      'guardian',
    ]) {
      expect(src, banned).not.toContain(banned)
    }
  })

  it.each(Object.keys(FILES))('%s — 저장 경로가 없고 본문의 역할·소속 값을 읽지 않는다', (name) => {
    const src = source(name)
    for (const banned of ['insert', 'upsert', 'update(', 'writeFile']) {
      expect(src, banned).not.toContain(banned)
    }
    expect(src).not.toMatch(/body\??\.(orgId|org_id|instructorId|instructor_id|role)\b/)
    expect(src).not.toContain('.type')
    expect(src).toContain(`clientKey(request.headers, '${name}')`)
  })

  it('기관 라우트는 org_member + 자기 기관 회차, 강사 라우트는 instructor + 배정 회차로 확인한다', () => {
    for (const name of ['result-report', 'followup-plan']) {
      const src = source(name)
      expect(src).toContain("actor.role !== 'org_member'")
      expect(src).toMatch(/org_id === actor\.orgId/)
    }
    const debrief = source('session-debrief')
    expect(debrief).toContain("actor.role !== 'instructor'")
    expect(debrief).toMatch(/instructor_id === actor\.instructorId/)
  })
})
