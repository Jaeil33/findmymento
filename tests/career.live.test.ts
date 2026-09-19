// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createAnthropic } from '@/lib/ai/client'
import { describe, expect, it } from 'vitest'
import { CAREERS } from '@/data/careers'
import { pickCareers } from '@/lib/ai/career'

/**
 * 진로 카드 — **실제 Claude API 로** 확인한다 (파일럿 전, 키를 새로 넣었을 때).
 *
 * 모의 테스트(career.test.ts)는 요청 모양과 폴백만 본다. 이 파일은 실제 키로 3번만 호출해서
 * 요청이 거절되지 않는지(베타 헤더·파라미터), 걸리는 시간, 토큰(=비용), 계정의 분당 한도를 본다.
 *
 * 실행 조건 — 기본은 **건너뛴다** (호출마다 돈이 든다):
 *   LIVE_AI_TEST=1 npx vitest run tests/career.live.test.ts
 * 키는 셸 환경변수 또는 `.env.local` 에서 읽는다. 키 값은 출력하지 않는다.
 */

function loadEnvLocal() {
  const file = join(process.cwd(), '.env.local')
  if (!existsSync(file)) return
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (!m) continue
    const [, key, raw] = m
    const value = raw!.replace(/^(['"])(.*)\1$/, '$2')
    if (process.env[key!] === undefined || process.env[key!] === '') process.env[key!] = value
  }
}
loadEnvLocal()

const live = process.env.LIVE_AI_TEST === '1' && Boolean(process.env.ANTHROPIC_API_KEY?.trim())

/** Opus 5 요금 (USD / 1M 토큰). */
const PRICE = { input: 5, output: 25 }
const usd = (input: number | null, output: number | null) =>
  ((input ?? 0) * PRICE.input + (output ?? 0) * PRICE.output) / 1_000_000

const base = {
  gradeBand: 'middle' as const,
  sessionField: '드론',
  interestFields: ['드론', 'AI·코딩'],
  followupIntent: 4,
  wantToLearn: null as string | null,
  desiredJob: null as string | null,
}

describe.skipIf(!live)('진로 카드 — 실제 API', () => {
  it('계정의 분당 한도를 읽는다 (아주 짧은 호출 1번)', async () => {
    const client = createAnthropic(process.env.ANTHROPIC_API_KEY!)
    const { data, response } = await client.messages
      .create({
        model: process.env.ANTHROPIC_MODEL?.trim() || 'claude-opus-5',
        max_tokens: 32,
        thinking: { type: 'disabled' },
        output_config: { effort: 'low' },
        messages: [{ role: 'user', content: '"네"라고만 답해.' }],
      })
      .withResponse()

    const h = (name: string) => response.headers.get(`anthropic-ratelimit-${name}`)
    console.log(
      JSON.stringify({
        check: 'rate-limits',
        requestsPerMin: h('requests-limit'),
        inputTokensPerMin: h('input-tokens-limit'),
        outputTokensPerMin: h('output-tokens-limit'),
        usd: usd(data.usage.input_tokens, data.usage.output_tokens).toFixed(5),
      }),
    )
    expect(data.content.length).toBeGreaterThan(0)
  }, 30_000)

  it.each([
    ['자유서술 없음', base],
    ['자유서술 있음', { ...base, wantToLearn: '드론으로 하늘에서 영상 찍는 거', desiredJob: '유튜버' }],
    ['꿈 요리사', { ...base, gradeBand: 'elementary' as const, interestFields: ['AI·코딩'], wantToLearn: '드론미션수행', desiredJob: '요리사' }],
    ['꿈 축구선수', { ...base, desiredJob: '축구선수' }],
  ])('%s — AI 가 후보 안에서 3개를 고르고 이유를 쓴다', async (label, input) => {
    const r = await pickCareers(input)
    console.log(
      JSON.stringify({
        check: label,
        source: r.source,
        picks: r.items.map((i) => `${i.id}: ${i.reason}`),
        latencyMs: r.meta.latencyMs,
        inputTokens: r.meta.inputTokens,
        outputTokens: r.meta.outputTokens,
        error: r.meta.error,
        dream: r.dream,
        usd: usd(r.meta.inputTokens, r.meta.outputTokens).toFixed(4),
      }),
    )

    expect(r.meta.error).toBeNull()
    expect(r.source).toBe('llm')
    expect(r.items).toHaveLength(3)
    const catalog = new Set(CAREERS.map((c) => c.id))
    for (const item of r.items) {
      expect(catalog.has(item.id)).toBe(true)
      expect(item.reason.length).toBeGreaterThan(0)
    }
  }, 30_000)
})
