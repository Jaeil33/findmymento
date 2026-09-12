// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * `/api/health` — 배포 직후 "환경변수가 실제로 들어갔는지"를 한 번에 확인하는 지점.
 *
 * 파일럿 현장에서 QR 이 죽는 가장 흔한 원인은 코드가 아니라 `NEXT_PUBLIC_SITE_URL` 오타다.
 * 교실에 들어가기 전에 이 엔드포인트 하나로 확인한다.
 *
 * **키 값은 절대 내려보내지 않는다.** 설정 여부(boolean)와 공개 도메인까지다.
 */

const ORIGINAL = { ...process.env }

afterEach(() => {
  process.env = { ...ORIGINAL }
  vi.resetModules()
})

const SECRETS = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://probe-project.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key-should-not-leak-000111',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key-should-not-leak-222333',
  ANTHROPIC_API_KEY: 'sk-ant-should-not-leak-444555',
}

async function call() {
  const { GET } = await import('@/app/api/health/route')
  const res = await GET()
  return { res, body: (await res.json()) as Record<string, unknown>, text: '' }
}

describe('키 값 비노출', () => {
  it('응답 본문에 어떤 키 값도 들어가지 않는다', async () => {
    for (const [k, v] of Object.entries(SECRETS)) process.env[k] = v

    const { GET } = await import('@/app/api/health/route')
    const raw = await (await GET()).text()

    for (const v of Object.values(SECRETS)) expect(raw).not.toContain(v)
    // anon 키도 마찬가지다. 공개 키라도 본문에 실어 보낼 이유가 없다.
    expect(raw).not.toContain('anon-key')
  })

  it('service_role / ANTHROPIC 은 설정 여부(boolean)만 알려준다', async () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = SECRETS.SUPABASE_SERVICE_ROLE_KEY
    delete process.env.ANTHROPIC_API_KEY

    const { body } = await call()
    const config = body.config as Record<string, unknown>
    expect(config.service_role_key).toBe(true)
    expect(config.anthropic_api_key).toBe(false)
  })
})

describe('모드 판별', () => {
  it('Supabase 키가 없으면 demo', async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    const { res, body } = await call()
    expect(res.status).toBe(200)
    expect(body.mode).toBe('demo')
    expect(body.ok).toBe(true)
  })

  it('Supabase 키가 둘 다 있으면 live', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = SECRETS.NEXT_PUBLIC_SUPABASE_URL
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = SECRETS.NEXT_PUBLIC_SUPABASE_ANON_KEY

    const { body } = await call()
    expect(body.mode).toBe('live')
  })
})

describe('QR 도메인 확인', () => {
  it('NEXT_PUBLIC_SITE_URL 이 그대로 site_url 로 내려온다 — QR 이 이 값으로 만들어진다', async () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://findmymento.example.com/'

    const { body } = await call()
    expect(body.site_url).toBe('https://findmymento.example.com')
    expect((body.config as Record<string, unknown>).site_url_explicit).toBe(true)
  })

  it('없으면 Vercel 도메인으로 떨어지고, 그 사실을 표시한다', async () => {
    delete process.env.NEXT_PUBLIC_SITE_URL
    process.env.VERCEL_PROJECT_PRODUCTION_URL = 'findmymento.vercel.app'

    const { body } = await call()
    expect(body.site_url).toBe('https://findmymento.vercel.app')
    expect((body.config as Record<string, unknown>).site_url_explicit).toBe(false)
  })

  it('학생 진입 예시 URL 을 함께 보여준다 (오타를 눈으로 잡게)', async () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://findmymento.example.com'

    const { body } = await call()
    expect(body.student_entry_example).toBe('https://findmymento.example.com/s/123456')
  })
})
