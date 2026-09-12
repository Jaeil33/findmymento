import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * 클라이언트 번들에 서버 전용 키가 들어갔는지 **빌드 산출물에서 직접** 확인한다 (step 15).
 *
 * `safety-invariants.test.ts` 는 소스를 본다. 소스가 깨끗해도 번들이 더러워질 수 있는 경로가
 * 있다 — 누군가 `NEXT_PUBLIC_` 접두사를 붙여 서버 키를 내보내면 Next 가 빌드 시점에
 * 값을 **문자열로 박아 넣는다.** 그건 소스 grep 으로는 안 잡히고 배포된 JS 를 열면 보인다.
 *
 * `.next` 가 없으면 건너뛴다 (`npm run build` 후에 의미가 있다).
 * Vercel 배포 전 마지막 확인: `npm run build && npm test`
 */

const STATIC_DIR = join(process.cwd(), '.next', 'static')
const built = existsSync(STATIC_DIR)

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry)
    return statSync(full).isDirectory() ? walk(full) : [full]
  })
}

const bundles = built ? walk(STATIC_DIR).filter((f) => /\.(js|css|map)$/.test(f)) : []
const contents = bundles.map((f) => ({ file: f, text: readFileSync(f, 'utf8') }))

/** JWT 처럼 생긴 문자열의 payload 를 꺼낸다. Supabase 키가 JWT 형식이다. */
function jwtPayloads(text: string): string[] {
  const out: string[] = []
  for (const m of text.matchAll(/eyJ[A-Za-z0-9_-]{10,}\.([A-Za-z0-9_-]{10,})\.[A-Za-z0-9_-]{10,}/g)) {
    try {
      out.push(Buffer.from(m[1]!, 'base64url').toString('utf8'))
    } catch {
      // JWT 가 아니었다. 무시한다.
    }
  }
  return out
}

describe.skipIf(!built)('클라이언트 번들에 서버 전용 키가 없다', () => {
  it('번들 파일을 실제로 읽었다', () => {
    expect(bundles.length).toBeGreaterThan(0)
  })

  it('서버 전용 환경변수 이름이 번들에 없다', () => {
    for (const { file, text } of contents) {
      expect(text, file).not.toContain('SUPABASE_SERVICE_ROLE_KEY')
      expect(text, file).not.toContain('ANTHROPIC_API_KEY')
    }
  })

  it('현재 환경의 서버 전용 키 값이 번들에 없다', () => {
    const secrets = [process.env.SUPABASE_SERVICE_ROLE_KEY, process.env.ANTHROPIC_API_KEY]
      .map((v) => v?.trim())
      .filter((v): v is string => Boolean(v) && v!.length >= 12)

    for (const secret of secrets) {
      for (const { file, text } of contents) {
        expect(text.includes(secret), `${file} 에 서버 키 값이 들어 있다`).toBe(false)
      }
    }
  })

  it('service_role JWT 가 번들에 없다 (anon 키는 있어야 정상)', () => {
    for (const { file, text } of contents) {
      for (const payload of jwtPayloads(text)) {
        expect(payload, file).not.toContain('service_role')
      }
    }
  })

  it('Anthropic·Supabase 시크릿 키 형식이 번들에 없다', () => {
    for (const { file, text } of contents) {
      expect(text, file).not.toMatch(/sk-ant-[A-Za-z0-9_-]{8,}/)
      expect(text, file).not.toMatch(/sb_secret_[A-Za-z0-9_-]{8,}/)
    }
  })
})

describe.skipIf(built)('번들 검사 (건너뜀)', () => {
  it('.next 가 없어 건너뛴다 — npm run build 후 다시 실행하면 검사한다', () => {
    expect(built).toBe(false)
  })
})
