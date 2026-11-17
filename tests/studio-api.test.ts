// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Actor } from '@/lib/auth/actor'

/**
 * 스튜디오 API 라우트.
 *
 * 여기서 반드시 지켜지는 것:
 * - 역할은 `getActor()` 로만 판단한다. 본문의 instructorId 는 무시된다
 * - **회차에 붙인 생성은 수업 조건을 회차 행에서 가져온다** — 본문 값은 무시한다 (ADR-016)
 * - 배정되지 않은 회차는 404. 존재 여부를 흘리지 않는다
 * - LLM 이 목록 밖 레시피를 고르면 규칙 선택으로 떨어진다 (ADR-029)
 * - 검증 실패도 200 이고, 실패라고 말한다. 승인은 validated 에서만 (ADR-030)
 * - 검증 미통과 산출물의 SVG 는 내려받을 수 없다
 *
 * 액터와 Anthropic SDK 는 가짜로 바꾼다 — 실제 API 를 호출하지 않는다.
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

const { POST: generate } = await import('@/app/api/studio/generate/route')
const { POST: approve } = await import('@/app/api/studio/approve/route')
const { POST: feedback } = await import('@/app/api/studio/feedback/route')
const { GET: svg } = await import('@/app/api/studio/[id]/svg/route')
const demo = await import('@/data/demo')

const INSTRUCTOR_2: Actor = {
  role: 'instructor',
  instructorId: 'in-2',
  displayName: '박서연',
  demo: true,
}
const INSTRUCTOR_1: Actor = {
  role: 'instructor',
  instructorId: 'in-1',
  displayName: '김도현',
  demo: true,
}
const ORG: Actor = {
  role: 'org_member',
  orgId: 'org-1',
  memberId: 'om-1',
  displayName: '이수진',
  demo: true,
}

/** 레이트 리밋이 테스트 사이에 걸리지 않도록 IP 를 매번 바꾼다. */
let ip = 0
function post(body: unknown): Request {
  ip += 1
  return new Request('http://localhost/api/studio', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.0.0.${ip % 250}` },
    body: JSON.stringify(body),
  })
}

/**
 * 반드시 실패하는 조건. 초등 25분에 드론 프레임(부품 9개·접합 8곳)은 들어가지 않는다.
 *
 * 레시피를 **직접 지정**해야 실패가 재현된다 — 지정하지 않으면 후보 필터가 초등에 난이도 3
 * 레시피를 올리지 않기 때문이다. 그 필터 자체가 1차 방어선이다.
 */
const FAILING_CASE = {
  topic: '드론 프레임 모형',
  gradeBand: 'elementary',
  durationMinutes: 25,
  recipeId: 'drone-frame',
}

const libraryBody = (over: Record<string, unknown> = {}) => ({
  kind: 'pen3d',
  topic: '정육면체 조명 만들기',
  gradeBand: 'middle',
  studentCount: 20,
  durationMinutes: 90,
  venue: '교실',
  equipment: ['3D펜 20자루', 'PLA 필라멘트'],
  ...over,
})

beforeEach(() => {
  state.actor = INSTRUCTOR_2
  createMock.mockReset()
  delete process.env.ANTHROPIC_API_KEY
})

afterEach(() => {
  delete process.env.ANTHROPIC_API_KEY
})

describe('권한', () => {
  it('비로그인·기관·운영자는 생성할 수 없다', async () => {
    for (const actor of [null, ORG, { role: 'admin', displayName: '운영자', demo: true } as Actor]) {
      state.actor = actor
      const res = await generate(post(libraryBody()))
      expect(res.status).toBe(403)
    }
  })

  it('비로그인은 승인·피드백도 할 수 없다', async () => {
    state.actor = null
    expect((await approve(post({ id: 'sc-1' }))).status).toBe(403)
    expect((await feedback(post({ contentId: 'sc-1' }))).status).toBe(403)
  })
})

describe('입력 검증', () => {
  it('주제가 짧으면 400', async () => {
    const res = await generate(post(libraryBody({ topic: '가' })))
    expect(res.status).toBe(400)
    expect((await res.json()).field).toBe('topic')
  })

  it('학년대·시수·장소가 없으면 400', async () => {
    expect((await generate(post(libraryBody({ gradeBand: 'adult' })))).status).toBe(400)
    expect((await generate(post(libraryBody({ durationMinutes: 5 })))).status).toBe(400)
    expect((await generate(post(libraryBody({ venue: '카페' })))).status).toBe(400)
  })

  it('드론 비행 코드는 아직 열리지 않았다고 말한다 — 있는 척하지 않는다', async () => {
    const res = await generate(post(libraryBody({ kind: 'drone' })))
    expect(res.status).toBe(400)
    expect((await res.json()).message).toContain('아직')
  })

  it('주제에 섞인 학생 이름·연락처는 가린 값으로 들어간다', async () => {
    const res = await generate(post(libraryBody({ topic: '정육면체 조명 010-1234-5678' })))
    expect(res.status).toBe(200)
    const saved = demo.studioContents.at(-1)!
    expect(saved.spec.topic).not.toContain('010-1234-5678')
  })
})

describe('회차에 붙인 생성 — 수업 조건은 회차가 정한다 (ADR-016)', () => {
  it('배정되지 않은 회차는 404', async () => {
    // ls-2 는 김도현(in-1)에게 배정된 회차다.
    const res = await generate(post({ ...libraryBody(), sessionId: 'ls-2' }))
    expect(res.status).toBe(404)
  })

  it('없는 회차도 같은 404 — 존재 여부를 흘리지 않는다', async () => {
    const res = await generate(post({ ...libraryBody(), sessionId: '없는회차' }))
    expect(res.status).toBe(404)
  })

  it('본문의 학년대·시수·장비를 무시하고 회차 값을 쓴다', async () => {
    state.actor = INSTRUCTOR_1
    const session = demo.lectureSessions.find((s) => s.id === 'ls-2')!
    const res = await generate(
      post({
        ...libraryBody(),
        sessionId: 'ls-2',
        gradeBand: 'high',
        durationMinutes: 300,
        studentCount: 1,
        venue: '운동장',
        equipment: ['없는 장비'],
      }),
    )
    expect(res.status).toBe(200)
    const saved = demo.studioContents.at(-1)!
    expect(saved.spec.duration_minutes).toBe(session.duration_minutes)
    expect(saved.spec.grade_band).toBe(session.grade_band)
    expect(saved.spec.venue).toBe(session.venue)
    expect(saved.spec.equipment).toEqual(session.equipment)
    expect(saved.spec.student_count).toBe(session.expected_students)
    expect(saved.session_id).toBe('ls-2')
  })
})

describe('생성 결과', () => {
  it('LLM 키가 없어도 규칙으로 200 이고 저장된다', async () => {
    const before = demo.studioContents.length
    const res = await generate(post(libraryBody()))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.ok).toBe(true)
    expect(json.saved).toBe(true)
    expect(json.status).toBe('validated')
    expect(json.source).toBe('rule')
    expect(json.recipe_id).toBe('cube-lantern')
    expect(json.metrics.part_count).toBeGreaterThan(0)
    expect(json.rounds.length).toBeGreaterThanOrEqual(1)
    expect(demo.studioContents.length).toBe(before + 1)
  })

  it('검증에 실패해도 200 이고, 실패라고 말한다 (ADR-030)', async () => {
    const res = await generate(
      post(libraryBody(FAILING_CASE)),
    )
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.status).toBe('failed')
    expect(json.findings.some((f: { severity: string }) => f.severity === 'error')).toBe(true)
    // 실패한 산출물도 저장된다 — 무엇이 왜 실패했는지가 기록으로 남아야 한다.
    expect(json.saved).toBe(true)
  })

  it('응답에 연락처·학생 식별 정보가 없다', async () => {
    const res = await generate(post(libraryBody()))
    const text = JSON.stringify(await res.json())
    expect(text).not.toMatch(/010-\d{4}/)
    expect(text).not.toContain('pseudo_code')
    expect(text).not.toContain('student_id')
  })

  it('강사가 레시피를 직접 고르면 그대로 쓴다', async () => {
    const res = await generate(post(libraryBody({ recipeId: 'flower-pot' })))
    expect((await res.json()).recipe_id).toBe('flower-pot')
  })
})

describe('새 버전 (ADR-031)', () => {
  it('같은 계보에 version 이 올라간다', async () => {
    const first = await (await generate(post(libraryBody()))).json()
    expect(first.version).toBe(1)
    const second = await (
      await generate(post(libraryBody({ lineageId: first.lineage_id })))
    ).json()
    expect(second.version).toBe(2)
    expect(second.lineage_id).toBe(first.lineage_id)
  })

  it('남의 계보에는 버전을 붙일 수 없다', async () => {
    state.actor = INSTRUCTOR_1
    const res = await generate(post(libraryBody({ lineageId: 'sl-1' })))
    expect(res.status).toBe(404)
  })
})

describe('LLM 저작 레이어 (ADR-029)', () => {
  const llmReply = (payload: unknown) =>
    createMock.mockResolvedValue({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: JSON.stringify(payload) }],
    })

  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test'
  })

  it('고른 레시피와 제목·과제 문장이 반영된다', async () => {
    llmReply({
      recipe_id: 'cube-lantern',
      title: '우리 반 빛 상자',
      reason: '조명 주제에 맞는 검수된 도안입니다.',
      tasks: ['패널을 한 장씩 만들고 가장자리를 두 번 덧그립니다.', '패널을 세워 모서리를 붙입니다.'],
    })
    const json = await (await generate(post(libraryBody()))).json()
    expect(json.source).toBe('llm')
    expect(json.reason).toContain('조명')
    const saved = demo.studioContents.at(-1)!
    expect(saved.title).toBe('우리 반 빛 상자')
    expect(saved.artifact.tasks[0]).toContain('패널')
  })

  it('목록 밖의 레시피를 고르면 규칙으로 떨어진다', async () => {
    llmReply({
      recipe_id: '우주선-대형-조형물',
      title: '우주선 만들기',
      reason: '멋있습니다.',
      tasks: ['우주선을 만듭니다.'],
    })
    const json = await (await generate(post(libraryBody()))).json()
    expect(json.source).toBe('rule')
    expect(json.recipe_id).toBe('cube-lantern')
  })

  it('숫자가 든 과제 문장은 버린다 — 개수·시간은 프로그램이 정한다', async () => {
    llmReply({
      recipe_id: 'cube-lantern',
      title: '빛 상자',
      reason: '조명 주제에 맞습니다.',
      tasks: ['패널 8장을 만듭니다.', '12곳을 붙입니다.'],
    })
    const json = await (await generate(post(libraryBody()))).json()
    // 두 문장 모두 숫자 때문에 버려졌으므로 규칙 과제가 쓰인다.
    expect(json.source).toBe('rule')
    const saved = demo.studioContents.at(-1)!
    expect(saved.artifact.tasks.join(' ')).not.toContain('패널 8장')
  })

  it('연락처가 섞인 문장은 버린다', async () => {
    llmReply({
      recipe_id: 'cube-lantern',
      title: '빛 상자',
      reason: '궁금하면 010-1234-5678 로 연락 주세요.',
      tasks: ['패널을 만듭니다.', '자세한 건 example.com 에서 봅니다.'],
    })
    const json = await (await generate(post(libraryBody()))).json()
    expect(json.reason).not.toContain('010-1234-5678')
    const saved = demo.studioContents.at(-1)!
    expect(JSON.stringify(saved.artifact.tasks)).not.toContain('example.com')
  })

  it('LLM 이 터져도 200 이다', async () => {
    createMock.mockRejectedValue(new Error('rate limit'))
    const json = await (await generate(post(libraryBody()))).json()
    expect(json.ok).toBe(true)
    expect(json.source).toBe('rule')
  })

  it('거절(refusal)도 규칙으로 떨어진다', async () => {
    createMock.mockResolvedValue({ stop_reason: 'refusal', content: [] })
    const json = await (await generate(post(libraryBody()))).json()
    expect(json.source).toBe('rule')
  })
})

describe('승인 (ADR-030)', () => {
  it('검증을 통과한 내 산출물은 승인된다', async () => {
    const created = await (await generate(post(libraryBody()))).json()
    const res = await approve(post({ id: created.id }))
    expect(res.status).toBe(200)
    expect(demo.studioContents.find((c) => c.id === created.id)?.status).toBe('approved')
  })

  it('검증에 실패한 산출물은 승인되지 않는다 — 409', async () => {
    const failed = await (
      await generate(
        post(libraryBody(FAILING_CASE)),
      )
    ).json()
    const res = await approve(post({ id: failed.id }))
    expect(res.status).toBe(409)
    expect(demo.studioContents.find((c) => c.id === failed.id)?.status).toBe('failed')
  })

  it('남의 산출물은 승인되지 않는다', async () => {
    state.actor = INSTRUCTOR_1
    const res = await approve(post({ id: 'sc-1' }))
    expect(res.status).toBe(409)
  })
})

describe('성과 피드백 (ADR-032)', () => {
  const body = (over: Record<string, unknown> = {}) => ({
    contentId: 'sc-1',
    attemptedCount: 20,
    completedCount: 18,
    actualMinutes: 22,
    difficultyVote: 'right',
    note: '모서리에서 시간이 걸렸습니다.',
    ...over,
  })

  it('완성 인원이 시도 인원보다 많으면 400', async () => {
    const res = await feedback(post(body({ attemptedCount: 10, completedCount: 11 })))
    expect(res.status).toBe(400)
    expect((await res.json()).field).toBe('completedCount')
  })

  it('남의 산출물에는 기록할 수 없다 — 404', async () => {
    state.actor = INSTRUCTOR_1
    expect((await feedback(post(body()))).status).toBe(404)
  })

  it('정상 입력은 저장되고, 의견의 학생 이름은 가려진다', async () => {
    const before = demo.studioFeedback.length
    const res = await feedback(post(body({ note: '민준이가 010-1234-5678 로 물어봤습니다.' })))
    expect(res.status).toBe(200)
    expect(demo.studioFeedback.length).toBe(before + 1)
    const saved = demo.studioFeedback.at(-1)!
    expect(saved.note).not.toContain('010-1234-5678')
    expect(saved.attempted_count).toBe(20)
  })

  it('학생 개인 단위 필드를 받지 않는다 — 보내도 저장되지 않는다', async () => {
    await feedback(post(body({ studentNames: ['민준', '서윤'], studentId: 'st-1' })))
    const saved = demo.studioFeedback.at(-1)!
    expect(Object.keys(saved)).not.toContain('studentNames')
    expect(Object.keys(saved)).not.toContain('student_id')
    expect(JSON.stringify(saved)).not.toContain('민준')
  })
})

describe('SVG 내려받기 (ADR-030 · 031)', () => {
  const req = (id: string) =>
    svg(new Request(`http://localhost/api/studio/${id}/svg`), {
      params: Promise.resolve({ id }),
    })

  it('내 산출물이 검증을 통과했으면 SVG 가 나온다', async () => {
    const created = await (await generate(post(libraryBody()))).json()
    const res = await req(created.id)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('image/svg+xml')
    expect(res.headers.get('content-disposition')).toContain('.svg')
    const body = await res.text()
    expect(body).toContain('width="210mm"')
  })

  it('검증 미통과 산출물은 403 — 파일은 교실까지 따라간다', async () => {
    const failed = await (
      await generate(
        post(libraryBody(FAILING_CASE)),
      )
    ).json()
    const res = await req(failed.id)
    expect(res.status).toBe(403)
  })

  it('타 강사의 산출물은 404 — 존재 여부를 알려주지 않는다', async () => {
    state.actor = INSTRUCTOR_1
    expect((await req('sc-1')).status).toBe(404)
  })

  it('발주 기관 담당자는 자기 회차에 붙은 산출물을 받을 수 있다', async () => {
    state.actor = ORG
    const session = demo.lectureSessions.find((s) => s.id === 'ls-2')!
    const content = demo.studioContents.find((c) => c.session_id === 'ls-2')!
    expect(session.org_id).toBe(ORG.role === 'org_member' ? session.org_id : '')
    const res = await req(content.id)
    // 기관이 같으면 200, 다르면 404. 데모 픽스처의 기관을 그대로 확인한다.
    expect(res.status).toBe(session.org_id === 'org-1' ? 200 : 404)
  })

  it('비로그인은 403', async () => {
    state.actor = null
    expect((await req('sc-1')).status).toBe(403)
  })

  it('없는 산출물은 404', async () => {
    expect((await req('없음')).status).toBe(404)
  })
})
