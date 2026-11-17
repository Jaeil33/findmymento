import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * 체험 모드 (ADR-033) — **로그인 없이 둘러보는 세션.**
 *
 * 이 파일이 지키는 것은 하나다: 체험 쿠키는 **권한이 아니라 데이터 출처**를 바꾼다.
 *
 * - 체험 세션에서는 실 DB 클라이언트가 **만들어지지 않는다** (anon·service_role 둘 다)
 * - 조회는 데모 시드로, 쓰기는 메모리로 간다. 실 DB 에는 아무 일도 일어나지 않는다
 * - 역할 쿠키는 그 조건 안에서만 읽힌다. 실 DB 경로의 역할 판별은 세 테이블 조회 그대로다
 * - LLM 키를 쓰지 않는다. 익명 방문자의 클릭이 소유자의 API 예산을 쓰면 안 된다
 *
 * 그래서 Supabase 키가 **들어가 있는 실 배포에서도** 이 입구를 열어 둘 수 있다.
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

/** 체인 가능한 쿼리 스텁. await 해도, 더 이어도 빈 결과를 돌려준다. */
function query(): Promise<{ data: never[]; error: null; count: number }> {
  const p = Promise.resolve({ data: [] as never[], error: null, count: 0 }) as Promise<{
    data: never[]
    error: null
    count: number
  }> &
    Record<string, () => unknown>
  for (const m of ['select', 'eq', 'limit', 'order', 'in', 'maybeSingle', 'single', 'insert', 'update']) {
    p[m] = () => query()
  }
  return p
}

const sb = vi.hoisted(() => ({ anon: vi.fn(), service: vi.fn() }))
vi.mock('@supabase/ssr', () => ({
  createServerClient: (...args: unknown[]) => {
    sb.anon(...args)
    return { kind: 'anon', auth: { getUser: async () => ({ data: { user: null } }) }, from: () => query() }
  },
}))
vi.mock('@supabase/supabase-js', () => ({
  createClient: (...args: unknown[]) => {
    sb.service(...args)
    return { kind: 'service', from: () => query() }
  },
}))

const { TOUR_COOKIE, demoDataMode, tourActive } = await import('@/lib/demo/mode')
const { TOUR_ENTRIES, TOUR_PRIMARY_KEYS, tourEntry, tourHref } = await import('@/lib/demo/tour')
const { DEMO_ROLE_COOKIE, demoActorKeys, getActor } = await import('@/lib/auth/actor')
const { getServerSupabase, getServiceSupabase } = await import('@/lib/supabase/server')
const { llmKeyForRequest } = await import('@/lib/ai/client')
const { demoAiEnabled } = await import('@/lib/ai/demo-writer')
const { loadDataset } = await import('@/lib/db/dataset')
const { insertSurveyResponse } = await import('@/lib/db/writes')
const { GET: enterTour } = await import('@/app/tour/[key]/route')
const { GET: exitTour } = await import('@/app/tour/exit/route')
const demo = await import('@/data/demo')
const { DEMO_STUDENT_ENTRY_CODE } = await import('@/lib/demo/guests')
const { sessionByEntryCode } = await import('@/lib/db/queries')

const ORIGINAL = { ...process.env }

/** 실 배포와 같은 상태 — 키가 전부 들어가 있다. */
function goLive() {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key'
  process.env.ANTHROPIC_API_KEY = 'sk-ant-live'
}

function startTour(role?: string) {
  cookieJar.map.set(TOUR_COOKIE, '1')
  if (role) cookieJar.map.set(DEMO_ROLE_COOKIE, role)
}

beforeEach(() => {
  cookieJar.map.clear()
  sb.anon.mockReset()
  sb.service.mockReset()
  delete process.env.NEXT_PUBLIC_SUPABASE_URL
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  delete process.env.SUPABASE_SERVICE_ROLE_KEY
  delete process.env.ANTHROPIC_API_KEY
  process.env.DEMO_AI = 'on'
})

afterEach(() => {
  process.env = { ...ORIGINAL }
  cookieJar.map.clear()
})

describe('모드 판정', () => {
  it('키가 없는 데모 배포는 쿠키를 읽지 않고 데모 시드다', async () => {
    expect(await demoDataMode()).toBe(true)
    expect(await tourActive()).toBe(false)
  })

  it('실 DB 배포는 기본적으로 데모 시드가 아니다', async () => {
    goLive()
    expect(await demoDataMode()).toBe(false)
    expect(await tourActive()).toBe(false)
  })

  it('실 DB 배포 + 체험 쿠키 → 그 요청만 데모 시드', async () => {
    goLive()
    startTour('instructor')
    expect(await tourActive()).toBe(true)
    expect(await demoDataMode()).toBe(true)
  })

  it('쿠키 값이 1 이 아니면 체험이 아니다', async () => {
    goLive()
    cookieJar.map.set(TOUR_COOKIE, 'yes')
    expect(await tourActive()).toBe(false)
  })
})

describe('체험 세션은 실 DB 를 볼 수 없다 (이 모드의 존재 조건)', () => {
  it('anon 세션 클라이언트가 만들어지지 않는다', async () => {
    goLive()
    startTour('admin')
    expect(await getServerSupabase()).toBeNull()
    expect(sb.anon).not.toHaveBeenCalled()
  })

  it('service_role 클라이언트가 만들어지지 않는다 — RLS 를 우회하는 쪽이라 더 중요하다', async () => {
    goLive()
    startTour('admin')
    expect(await getServiceSupabase()).toBeNull()
    expect(sb.service).not.toHaveBeenCalled()
  })

  it('체험이 아니면 두 클라이언트가 정상적으로 만들어진다 — 실 서비스는 그대로다', async () => {
    goLive()
    expect(await getServerSupabase()).not.toBeNull()
    expect(await getServiceSupabase()).not.toBeNull()
    expect(sb.anon).toHaveBeenCalledTimes(1)
    expect(sb.service).toHaveBeenCalledTimes(1)
  })

  it('조회는 데모 시드로 간다 — 실 DB 쿼리가 나가지 않는다', async () => {
    goLive()
    startTour('instructor')
    const ds = await loadDataset()
    expect(ds.instructors).toBe(demo.instructors)
    expect(ds.studioContents).toBe(demo.studioContents)
    expect(sb.anon).not.toHaveBeenCalled()
  })

  it('쓰기는 메모리에만 남는다 — 실 DB 에 INSERT 되지 않는다', async () => {
    goLive()
    startTour()
    const before = demo.surveyResponses.length
    const { id } = await insertSurveyResponse({
      sessionId: 'ls-2',
      studentId: null,
      grade: { band: 'middle', year: 2 },
      satisfaction: 5,
      followupIntent: 5,
      interestFields: ['드론'],
      wantToLearn: null,
      desiredJob: null,
      availableTimes: [],
    })
    expect(demo.surveyResponses).toHaveLength(before + 1)
    expect(demo.surveyResponses.at(-1)!.id).toBe(id)
    expect(sb.anon).not.toHaveBeenCalled()
    demo.surveyResponses.pop()
  })
})

describe('역할', () => {
  it('체험 쿠키 + 역할 쿠키면 데모 계정으로 들어간다', async () => {
    goLive()
    startTour('instructor')
    const actor = await getActor()
    expect(actor).toEqual({
      role: 'instructor',
      instructorId: 'in-2',
      displayName: '박서연',
      demo: true,
    })
  })

  it('체험 쿠키가 없으면 역할 쿠키만으로는 아무 권한도 없다', async () => {
    goLive()
    cookieJar.map.set(DEMO_ROLE_COOKIE, 'admin')
    // 실 DB 경로로 가고, 로그인한 사용자가 없으므로 null 이다.
    expect(await getActor()).toBeNull()
    expect(sb.anon).toHaveBeenCalledTimes(1)
  })

  it('체험 쿠키만 있고 역할이 없으면 로그인 화면으로 떨어진다 (null)', async () => {
    goLive()
    startTour()
    expect(await getActor()).toBeNull()
  })

  it('체험 입구의 역할 키는 전부 데모 계정에 있다', () => {
    const keys = demoActorKeys() as string[]
    for (const entry of TOUR_ENTRIES) {
      if (entry.actor) expect(keys).toContain(entry.actor)
    }
  })
})

describe('AI — 익명 방문자가 LLM 예산을 쓰지 못한다', () => {
  it('체험 세션에서는 키가 있어도 LLM 을 부르지 않는다', async () => {
    goLive()
    startTour('instructor')
    expect(await llmKeyForRequest()).toBeNull()
    // 대신 시연용 문장이 들어가고, 화면은 그 사실을 표시한다 (ADR-025).
    expect(await demoAiEnabled()).toBe(true)
  })

  it('체험이 아니면 키를 그대로 쓴다', async () => {
    goLive()
    expect(await llmKeyForRequest()).toBe('sk-ant-live')
    expect(await demoAiEnabled()).toBe(false)
  })
})

describe('체험 입장·종료 라우트', () => {
  const request = (path: string) => new Request(`http://localhost:3000${path}`)

  it('강사 체험은 쿠키 둘을 심고 스튜디오로 보낸다', async () => {
    const res = await enterTour(request('/tour/instructor'), {
      params: Promise.resolve({ key: 'instructor' }),
    })
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toBe('http://localhost:3000/instructor/studio')
    expect(res.cookies.get(TOUR_COOKIE)?.value).toBe('1')
    expect(res.cookies.get(DEMO_ROLE_COOKIE)?.value).toBe('instructor')
    // 체험 쿠키는 스크립트가 읽을 수 없어야 한다.
    expect(res.cookies.get(TOUR_COOKIE)?.httpOnly).toBe(true)
  })

  it('학생 체험은 역할 쿠키를 심지 않는다 — 학생은 계정을 만들지 않는다', async () => {
    const res = await enterTour(request('/tour/student'), {
      params: Promise.resolve({ key: 'student' }),
    })
    expect(res.headers.get('location')).toBe(
      `http://localhost:3000/s/${DEMO_STUDENT_ENTRY_CODE}`,
    )
    expect(res.cookies.get(TOUR_COOKIE)?.value).toBe('1')
    expect(res.cookies.get(DEMO_ROLE_COOKIE)?.value ?? '').toBe('')
  })

  it('목록에 없는 키는 첫 화면으로 돌려보내고 쿠키를 심지 않는다', async () => {
    const res = await enterTour(request('/tour/root'), { params: Promise.resolve({ key: 'root' }) })
    expect(res.headers.get('location')).toBe('http://localhost:3000/')
    expect(res.cookies.get(TOUR_COOKIE)?.value ?? '').toBe('')
  })

  it('종료는 쿠키 둘을 지운다', async () => {
    const res = await exitTour(request('/tour/exit'))
    expect(res.headers.get('location')).toBe('http://localhost:3000/')
    const setCookie = res.headers.getSetCookie().join(' | ')
    for (const name of [TOUR_COOKIE, DEMO_ROLE_COOKIE]) {
      expect(res.cookies.get(name)?.value).toBe('')
      // 브라우저가 실제로 지우려면 만료가 과거여야 하고, 심을 때와 같은 Path 여야 한다.
      expect(setCookie).toMatch(new RegExp(`${name}=;[^|]*Path=/[^|]*Expires=Thu, 01 Jan 1970`))
    }
  })
})

describe('데모 시드 인스턴스', () => {
  it('시드를 직접 import 하는 곳은 demo-store 하나뿐이다', async () => {
    const { readdirSync, readFileSync, statSync } = await import('node:fs')
    const { join, relative } = await import('node:path')
    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((e) => {
        const full = join(dir, e)
        return statSync(full).isDirectory() ? walk(full) : [full]
      })
    const src = join(process.cwd(), 'src')
    const importers = walk(src)
      .filter((f) => /\.(ts|tsx)$/.test(f) && readFileSync(f, 'utf8').includes("from '@/data/demo'"))
      .map((f) => relative(process.cwd(), f).split(String.fromCharCode(92)).join('/'))
    // 라우트 핸들러와 서버 컴포넌트는 서로 다른 번들 레이어다. 시드를 직접 import 하면
    // 인스턴스가 두 벌이 되고, 체험 중에 만든 산출물이 화면에서 사라진다 (ADR-033).
    expect(importers).toEqual([])
  })
})

describe('체험 입구 정의', () => {
  it('랜딩의 큰 카드 셋은 강사·학생·운영자다', () => {
    expect([...TOUR_PRIMARY_KEYS]).toEqual(['instructor', 'student', 'admin'])
  })

  it('입장 주소는 전부 /tour/{키} 이고 도착 화면이 절대 경로다', () => {
    for (const entry of TOUR_ENTRIES) {
      expect(tourHref(entry.key)).toBe(`/tour/${entry.key}`)
      expect(entry.destination.startsWith('/')).toBe(true)
      expect(tourEntry(entry.key)).toBe(entry)
    }
  })

  it('학생 체험이 가리키는 회차는 시드에 있고 응답을 받는 중이다', async () => {
    const student = tourEntry('student')!
    expect(student.destination).toBe(`/s/${DEMO_STUDENT_ENTRY_CODE}`)
    const ctx = sessionByEntryCode(await loadDataset(), DEMO_STUDENT_ENTRY_CODE)
    expect(ctx).not.toBeNull()
    expect(ctx!.closed).toBe(false)
  })

  it('계정이 없는 입구(학생·보호자)는 역할이 null 이다', () => {
    const guests = TOUR_ENTRIES.filter((e) => e.actor === null).map((e) => e.key)
    expect(guests).toEqual(['student', 'guardian'])
  })
})

describe('체험 링크는 전체 페이지 이동이어야 한다', () => {
  /**
   * `/tour/*` 는 페이지가 아니라 **쿠키를 심고 지우는 라우트 핸들러**다.
   * `next/link` 로 걸면 Next 라우터가 화면에 들어온 링크를 미리 호출한다(프리페치).
   * 그러면 누르기도 전에 여섯 입구가 전부 실행돼 역할 쿠키가 뒤섞이고
   * (`student`·`guardian` 은 역할을 지운다), 띠의 "체험 종료" 는 둘러보는 도중에 세션을 끈다.
   * 그래서 체험 링크는 평범한 `<a>` 여야 한다.
   */
  async function tourLinkTags(): Promise<string[]> {
    const { readdirSync, readFileSync, statSync } = await import('node:fs')
    const { join, relative } = await import('node:path')
    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((e) => {
        const full = join(dir, e)
        return statSync(full).isDirectory() ? walk(full) : [full]
      })

    const found: string[] = []
    for (const file of walk(join(process.cwd(), 'src')).filter((f) => f.endsWith('.tsx'))) {
      const source = readFileSync(file, 'utf8')
      for (const m of source.matchAll(/href=\{tourHref\(|href="\/tour\//g)) {
        const before = source.slice(0, m.index)
        const tag = before.slice(before.lastIndexOf('<') + 1).split(/[\s>]/)[0]
        if (tag !== 'a') {
          found.push(`${relative(process.cwd(), file).split(String.fromCharCode(92)).join('/')}: <${tag}>`)
        }
      }
    }
    return found
  }

  it('/tour/* 를 가리키는 요소는 전부 <a> 다 — 프리페치가 쿠키를 건드리면 안 된다', async () => {
    expect(await tourLinkTags()).toEqual([])
  })
})

describe('프리페치는 체험 쿠키를 건드리지 않는다', () => {
  /** Next 라우터의 선행 요청. 사람이 누른 이동이 아니므로 쿠키를 심지도 지우지도 않는다. */
  const prefetch = (path: string) =>
    new Request(`http://localhost:3000${path}`, {
      headers: { RSC: '1', 'Next-Router-Prefetch': '1' },
    })

  it('입장 — 프리페치에는 쿠키를 심지 않는다', async () => {
    const res = await enterTour(prefetch('/tour/instructor'), {
      params: Promise.resolve({ key: 'instructor' }),
    })
    expect(res.headers.getSetCookie()).toEqual([])
  })

  it('입장 — 역할 없는 입구의 프리페치가 이미 고른 역할을 지우지 않는다', async () => {
    const res = await enterTour(prefetch('/tour/student'), {
      params: Promise.resolve({ key: 'student' }),
    })
    expect(res.headers.getSetCookie()).toEqual([])
  })

  it('종료 — 프리페치가 둘러보는 도중에 체험을 끝내지 않는다', async () => {
    const res = await exitTour(prefetch('/tour/exit'))
    expect(res.headers.getSetCookie()).toEqual([])
  })

  it('사람이 누른 이동(RSC 헤더 없음)은 그대로 동작한다', async () => {
    const res = await enterTour(new Request('http://localhost:3000/tour/instructor'), {
      params: Promise.resolve({ key: 'instructor' }),
    })
    expect(res.status).toBe(307)
    expect(res.cookies.get(DEMO_ROLE_COOKIE)?.value).toBe('instructor')
  })
})
