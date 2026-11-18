/**
 * 아틀라스 생산 — **검수된 실루엣을 오프라인에서 만든다** (ADR-036).
 *
 *   npm run studio:atlas -- --words scripts/studio/words/animals.txt
 *   npm run studio:atlas -- --word 코끼리 --word 자전거 --dry-run
 *
 * 단어마다 이렇게 돈다:
 *   윤곽 제안(런타임과 **같은 프롬프트**) → 세 학년대·2D·3D 전부로 검증 → 이미지 검토
 *   → 통과한 것만 `src/data/atlas/records.ts` 에 쓴다
 *
 * 떨어진 단어는 이유와 함께 보고서에 남기고 **목록에 넣지 않는다.** 임계값을 낮춰서 통과시키는
 * 선택지는 없다 (ADR-030). 비용은 1회성이고, 런타임은 이 목록을 LLM 호출 없이 쓴다.
 *
 * 런타임 코드를 그대로 import 한다 (`scripts/studio/alias-loader.mjs`). 복사해 두면
 * 스크립트가 통과시킨 모양이 런타임에서 떨어진다.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { createAnthropic } from '@/lib/ai/anthropic'
import { sanitizeText } from '@/lib/ai/text-guard'
import {
  atlasGate,
  atlasId,
  emitRecords,
  parseEmitted,
  mergeRecords,
  parseWordList,
  toRecord,
  type WordEntry,
} from '@/lib/studio/atlas-build'
import { SHAPE_AUTHOR_TIMEOUT_MS } from '@/lib/studio/constants'
import { buildPattern } from '@/lib/studio/pen3d/recipes'
import { OUTLINE_SYSTEM } from '@/lib/studio/pen3d/outline-prompt'
import { reviewShape } from '@/lib/studio/pen3d/review'
import { parseShape, shapeRecipe } from '@/lib/studio/pen3d/shape'
import { generalizeCharacter } from '@/lib/studio/topic'
import type { AtlasRecord, PenShape } from '@/types/studio'

type Args = {
  words: string[]
  singles: string[]
  out: string
  report: string
  limit: number
  dryRun: boolean
  replace: boolean
  retries: number
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    words: [],
    singles: [],
    out: 'src/data/atlas/records.ts',
    report: 'atlas-report.md',
    limit: 200,
    dryRun: false,
    replace: false,
    retries: 2,
  }
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i]
    const value = argv[i + 1]
    if (flag === '--words' && value) args.words.push(value), (i += 1)
    else if (flag === '--word' && value) args.singles.push(value), (i += 1)
    else if (flag === '--out' && value) (args.out = value), (i += 1)
    else if (flag === '--report' && value) (args.report = value), (i += 1)
    else if (flag === '--limit' && value) (args.limit = Number(value)), (i += 1)
    else if (flag === '--retries' && value) (args.retries = Number(value)), (i += 1)
    else if (flag === '--dry-run') args.dryRun = true
    else if (flag === '--replace') args.replace = true
  }
  return args
}

const SYSTEM = `너는 초·중·고 실습 수업에 쓸 3D펜 도안의 **윤곽**을 만든다.

주어진 단어 하나의 **알아볼 수 있는 실루엣**을 그린다. 아래 규칙을 그대로 따른다.${OUTLINE_SYSTEM}

reason 에는 이 실루엣이 그 단어의 무엇을 살렸는지 한 문장(60자 이내)을 쓴다.`

type Attempt = { shape: PenShape | null; summary: string | null; raw: string }

async function propose(entry: WordEntry, apiKey: string, note: string | null): Promise<Attempt> {
  const client = createAnthropic(apiKey)
  const response = await client.beta.messages.create(
    {
      model: process.env.ANTHROPIC_MODEL?.trim() || 'claude-opus-5',
      max_tokens: 4000,
      system: SYSTEM,
      messages: [
        {
          role: 'user',
          content: JSON.stringify({
            단어: entry.word,
            같은_뜻: entry.words,
            ...(note ? { 지난_시도에서_걸린_것: note } : {}),
          }),
        },
      ],
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    },
    { timeout: SHAPE_AUTHOR_TIMEOUT_MS * 3, maxRetries: 1 },
  )

  const raw = response.content.map((b) => (b.type === 'text' ? b.text : '')).join('')
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (response.stop_reason === 'refusal' || start < 0 || end <= start) {
    return { shape: null, summary: null, raw }
  }

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>
  } catch {
    return { shape: null, summary: null, raw }
  }

  const shape = parseShape(parsed.outline, {
    word: entry.word,
    source: 'atlas',
    id: atlasId(entry.word),
    words: entry.words,
  })
  return { shape, summary: sanitizeText(parsed.reason, 80), raw }
}

type Outcome =
  | { word: string; ok: true; record: AtlasRecord; tries: number }
  | { word: string; ok: false; reason: string; tries: number }

async function build(entry: WordEntry, apiKey: string, retries: number): Promise<Outcome> {
  let note: string | null = null

  for (let attempt = 1; attempt <= retries + 1; attempt += 1) {
    let proposal: Attempt
    try {
      proposal = await propose(entry, apiKey, note)
    } catch (error) {
      note = '호출이 실패했습니다'
      console.log(`  ${attempt}회: 호출 실패 (${(error as Error).message.slice(0, 60)})`)
      continue
    }

    if (!proposal.shape) {
      note = '윤곽을 읽을 수 없었습니다 (좌표 범위·점 개수·자기교차를 확인하세요)'
      console.log(`  ${attempt}회: 제안을 버렸습니다`)
      continue
    }

    const gate = atlasGate(proposal.shape)
    if (!gate.ok) {
      note = `검증에서 걸렸습니다: ${[...new Set(gate.failures)].slice(0, 4).join(', ')}`
      console.log(`  ${attempt}회: 검증 실패 — ${note}`)
      continue
    }

    // 사람이 보는 것과 같은 픽셀로 묻는다 (ADR-038). 아틀라스는 여기까지 통과해야 들어간다.
    const flat = shapeRecipe(proposal.shape, { form: 'flat', grade_band: 'middle' })
    const pattern = buildPattern(flat, flat.defaults)
    const review = await reviewShape({
      word: entry.word,
      strokes: pattern.parts.flatMap((p) => p.strokes),
      apiKey,
      retries: 1,
    })

    if (review.verdict !== 'looks_like') {
      note =
        review.verdict === 'unrecognized'
          ? `그 단어로 보이지 않았습니다 — ${review.missing ?? '알아볼 특징이 없습니다'}`
          : '이미지 검토를 하지 못했습니다'
      console.log(`  ${attempt}회: 검토 실패 — ${note}`)
      continue
    }

    return {
      word: entry.word,
      ok: true,
      tries: attempt,
      record: toRecord({
        entry,
        shape: proposal.shape,
        summary: proposal.summary ?? `${entry.word} 실루엣.`,
        difficulty: gate.difficulty,
      }),
    }
  }

  return { word: entry.word, ok: false, reason: note ?? '알 수 없는 이유', tries: retries + 1 }
}

/** 생성 파일이 없거나 깨졌으면 빈 목록이다 */
function readEmitted(path: string): AtlasRecord[] {
  try {
    return parseEmitted(readFileSync(path, 'utf8'))
  } catch {
    return []
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim()
  if (!apiKey) {
    console.error('ANTHROPIC_API_KEY 가 없습니다. 아틀라스 생산은 실제 LLM 을 씁니다.')
    process.exit(1)
  }

  const entries: WordEntry[] = [
    ...args.words.flatMap((path) => parseWordList(readFileSync(path, 'utf8'))),
    ...args.singles.map((word) => ({ word, words: [word] })),
  ].slice(0, args.limit)

  if (entries.length === 0) {
    console.error('단어가 없습니다. --words <파일> 또는 --word <단어> 를 주세요.')
    process.exit(1)
  }

  console.log(`단어 ${entries.length}개로 아틀라스를 만듭니다.\n`)
  const outcomes: Outcome[] = []

  for (const entry of entries) {
    // 캐릭터·상표 이름은 일반 형태로 바꿔 만든다 (ADR-034). 아틀라스에도 같은 규칙이다.
    const general = generalizeCharacter(entry.word)
    if (general.replaced) {
      console.log(`${entry.word} → "${general.text}" 로 바꿔 만듭니다 (캐릭터·상표)`)
    }
    const target: WordEntry = general.replaced
      ? { word: general.text, words: [general.text] }
      : entry

    console.log(`${target.word}`)
    const outcome = await build(target, apiKey, args.retries)
    outcomes.push(outcome)
    console.log(outcome.ok ? `  ✓ 통과 (${outcome.tries}회)\n` : `  ✗ 보류\n`)
  }

  const passed = outcomes.filter((o): o is Extract<Outcome, { ok: true }> => o.ok)
  const records = args.replace
    ? passed.map((o) => o.record)
    : mergeRecords(readEmitted(args.out), passed.map((o) => o.record))

  const report = [
    '# 아틀라스 생산 보고서',
    '',
    `- 돌린 단어: ${outcomes.length}개`,
    `- 목록에 들어간 것: ${passed.length}개`,
    `- 보류: ${outcomes.length - passed.length}개`,
    '',
    '| 단어 | 결과 | 이유 |',
    '|---|---|---|',
    ...outcomes.map((o) =>
      o.ok ? `| ${o.word} | 통과 | ${o.tries}회 시도 |` : `| ${o.word} | 보류 | ${o.reason} |`,
    ),
    '',
    '보류된 단어는 **목록에 넣지 않는다.** 임계값을 낮춰서 통과시키지 않는다 (ADR-030).',
    '',
  ].join('\n')

  if (args.dryRun) {
    console.log('--dry-run 이므로 파일을 쓰지 않습니다.\n')
    console.log(report)
    return
  }

  writeFileSync(args.out, emitRecords(records), 'utf8')
  writeFileSync(args.report, report, 'utf8')
  console.log(`${args.out} 에 ${records.length}개를 썼습니다. 보고서: ${args.report}`)
  console.log('npm run test -- studio-atlas 로 목록 전체를 다시 검사하세요.')
}

await main()
