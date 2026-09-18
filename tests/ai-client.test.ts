// @vitest-environment node
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Anthropic 클라이언트 생성은 한 곳(`lib/ai/client.ts`)에서만 한다.
 *
 * 작업공간에 묶이지 않은 조직 단위 키는 요청마다 `anthropic-workspace-id` 헤더가 있어야 한다.
 * 헤더가 없으면 **모든 호출이 400** 이고, 화면은 규칙 문장으로 조용히 떨어져서 AI 가 한 번도 돌지 않는다.
 * 파일럿 키로 실측해서 확인한 실패다. `ANTHROPIC_WORKSPACE_ID` 가 있으면 헤더를 붙인다.
 */
const ctorOptions: Record<string, unknown>[] = []
const createMock = vi.fn()

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    constructor(options: Record<string, unknown>) {
      ctorOptions.push(options)
    }
    messages = { create: (...args: unknown[]) => createMock(...args) }
    beta = { messages: { create: (...args: unknown[]) => createMock(...args) } }
  },
}))

const { createAnthropic } = await import('@/lib/ai/client')
const { pickCareers } = await import('@/lib/ai/career')

beforeEach(() => {
  ctorOptions.length = 0
  createMock.mockReset()
  delete process.env.ANTHROPIC_WORKSPACE_ID
  delete process.env.ANTHROPIC_API_KEY
})

afterEach(() => {
  delete process.env.ANTHROPIC_WORKSPACE_ID
  delete process.env.ANTHROPIC_API_KEY
})

describe('createAnthropic', () => {
  it('ANTHROPIC_WORKSPACE_ID 가 있으면 작업공간 헤더를 붙인다', () => {
    process.env.ANTHROPIC_WORKSPACE_ID = ' wrkspc_test123 '
    createAnthropic('test-key')
    expect(ctorOptions[0]).toMatchObject({
      apiKey: 'test-key',
      defaultHeaders: { 'anthropic-workspace-id': 'wrkspc_test123' },
    })
  })

  it('없거나 비어 있으면 헤더를 붙이지 않는다 (작업공간에 묶인 키)', () => {
    createAnthropic('test-key')
    process.env.ANTHROPIC_WORKSPACE_ID = '   '
    createAnthropic('test-key')
    for (const o of ctorOptions) expect(o.defaultHeaders).toBeUndefined()
  })

  it('실제 호출 경로(진로 카드)도 헤더가 붙은 클라이언트를 쓴다', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    process.env.ANTHROPIC_WORKSPACE_ID = 'wrkspc_test123'
    createMock.mockResolvedValue({
      model: 'claude-opus-5',
      content: [{ type: 'text', text: '{"picks":[]}' }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 1, output_tokens: 1 },
    })

    await pickCareers({
      gradeBand: 'middle',
      sessionField: '드론',
      interestFields: ['드론'],
      followupIntent: 4,
      wantToLearn: null,
      desiredJob: null,
    })

    expect(createMock).toHaveBeenCalledTimes(1)
    expect(ctorOptions.at(-1)).toMatchObject({
      defaultHeaders: { 'anthropic-workspace-id': 'wrkspc_test123' },
    })
  })
})

describe('구조 — 클라이언트는 한 곳에서만 만든다', () => {
  it('src 안에서 `new Anthropic(` 은 lib/ai/client.ts 에만 있다', () => {
    const root = join(process.cwd(), 'src')
    const files: string[] = []
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name)
        if (statSync(p).isDirectory()) walk(p)
        else if (/\.(ts|tsx)$/.test(name)) files.push(p)
      }
    }
    walk(root)

    const offenders = files
      .filter((f) => /new\s+Anthropic\s*\(/.test(readFileSync(f, 'utf8')))
      .map((f) => relative(root, f).split(sep).join('/'))
    expect(offenders).toEqual(['lib/ai/client.ts'])
  })
})
