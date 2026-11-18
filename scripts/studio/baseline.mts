/**
 * 베이스라인 측정 — **개편 전의 현재 성능을 숫자로 남긴다** (0단계).
 *
 *   npm 스크립트를 추가하지 않고 atlas 와 같은 호출로 돈다:
 *   node --experimental-strip-types --env-file-if-exists=.env.local --env-file-if-exists=.env \
 *        --import ./scripts/studio/register.mjs scripts/studio/baseline.mts \
 *        --words scripts/studio/words/animals.txt --concurrency 4
 *
 * **이 파일은 런타임 코드를 한 줄도 고치지 않는다.** 전부 import 해서 지금 그대로 돌리고,
 * 어디서 떨어지는지만 집계한다. 코드를 고친 뒤에는 이 숫자를 다시 뜰 수 없으므로
 * 개편의 첫 작업이 이 측정이다.
 *
 * `atlas.mts` 와 다른 점 — 그쪽은 "아틀라스에 넣을 것을 고르는" 스크립트이고 통과/보류만 남긴다.
 * 이쪽은 **떨어진 단계를 귀속**한다:
 *
 *   proposal  : 윤곽 제안을 읽지 못했다 (자기교차·점 개수·좌표 범위 → `readShape` 가 버림)
 *   validate  : 물리 검증에서 error (어느 코드인지 전부 센다)
 *   review    : 이미지 검토가 "그 단어로 보이지 않는다"
 *   unreviewed: 검토 자체를 하지 못했다 (키·타임아웃·JSON) — **부정으로 세지 않는다**
 *   pass      : 세 관문을 다 통과
 *
 * 두 가지 관문을 따로 잰다:
 *   runtime  : 강사가 실제로 겪는 조건 하나 (중등 · 2D). 이게 헤드라인 숫자다.
 *   atlas    : 세 학년대 × 전 형태 전부 (`atlasGate`). 아틀라스 적재 기준이라 더 엄격하다.
 *
 * 그리고 `pass@1`(한 번에) 과 `pass@2`(거절 이유를 되먹여 한 번 더) 를 나눠 적는다 —
 * 런타임이 하는 것이 그 둘이다 (ADR-036).
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { createAnthropic } from '@/lib/ai/anthropic'
import { atlasMatches, atlasShape } from '@/lib/studio/atlas'
import { atlasGate, atlasId, gateSpec, parseWordList, type WordEntry } from '@/lib/studio/atlas-build'
import { SHAPE_OUTLINE_TIMEOUT_MS } from '@/lib/studio/constants'
import { buildPattern } from '@/lib/studio/pen3d/recipes'
import { ART_ONLY_SYSTEM, OUTLINE_ONLY_SYSTEM } from '@/lib/studio/pen3d/outline-prompt'
import { reviewShape } from '@/lib/studio/pen3d/review'
import { readArtShape, readShape, shapeRecipe } from '@/lib/studio/pen3d/shape'
import { validatePen } from '@/lib/studio/pen3d/validate'
import { generalizeCharacter } from '@/lib/studio/topic'
import type { PenShape } from '@/types/studio'

// ============================================================================
// 인자
// ============================================================================

type Args = {
  words: string[]
  singles: string[]
  json: string
  report: string
  limit: number
  attempts: number
  concurrency: number
  /** `outline` = 개편 전 경로(ADR-036). `art` = 색 영역 경로(ADR-039·040) */
  engine: 'outline' | 'art'
}

const DEFAULT_WORDS = [
  'scripts/studio/words/animals.txt',
  'scripts/studio/words/life.txt',
  'scripts/studio/words/nature.txt',
  'scripts/studio/words/places.txt',
  'scripts/studio/words/symbols.txt',
  'scripts/studio/words/vehicles.txt',
]

function parseArgs(argv: string[]): Args {
  const args: Args = {
    words: [],
    singles: [],
    json: 'baseline.json',
    report: 'baseline-report.md',
    limit: 1000,
    attempts: 2,
    concurrency: 4,
    engine: 'outline',
  }
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i]
    const value = argv[i + 1]
    if (flag === '--words' && value) args.words.push(value), (i += 1)
    else if (flag === '--word' && value) args.singles.push(value), (i += 1)
    else if (flag === '--json' && value) (args.json = value), (i += 1)
    else if (flag === '--report' && value) (args.report = value), (i += 1)
    else if (flag === '--limit' && value) (args.limit = Number(value)), (i += 1)
    else if (flag === '--attempts' && value) (args.attempts = Number(value)), (i += 1)
    else if (flag === '--concurrency' && value) (args.concurrency = Number(value)), (i += 1)
    else if (flag === '--engine' && value) (args.engine = value === 'art' ? 'art' : 'outline'), (i += 1)
  }
  if (args.words.length === 0 && args.singles.length === 0) args.words = [...DEFAULT_WORDS]
  return args
}

// ============================================================================
// 윤곽 제안 — `atlas.mts` 의 propose 와 **같은 조건**이어야 한다
// ============================================================================

type Proposal = { shape: PenShape | null; reason: string | null; ms: number; refused: boolean }

async function propose(
  entry: WordEntry,
  apiKey: string,
  note: string | null,
  engine: 'outline' | 'art',
): Promise<Proposal> {
  const started = Date.now()
  const client = createAnthropic(apiKey)
  const response = await client.beta.messages.create(
    {
      model: process.env.ANTHROPIC_MODEL?.trim() || 'claude-opus-5',
      max_tokens: 2400,
      output_config: { effort: 'low' },
      system: engine === 'art' ? ART_ONLY_SYSTEM : OUTLINE_ONLY_SYSTEM,
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
    { timeout: SHAPE_OUTLINE_TIMEOUT_MS, maxRetries: 0 },
  )

  const ms = Date.now() - started
  const raw = response.content.map((b) => (b.type === 'text' ? b.text : '')).join('')
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  const refused = response.stop_reason === 'refusal'

  if (refused || start < 0 || end <= start) {
    return { shape: null, reason: refused ? '모델이 거절했습니다' : 'JSON 이 없습니다', ms, refused }
  }

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>
  } catch {
    return { shape: null, reason: 'JSON 을 읽을 수 없습니다', ms, refused: false }
  }

  const meta = {
    word: entry.word,
    source: 'atlas' as const,
    id: atlasId(entry.word),
    words: entry.words,
  }
  const read =
    engine === 'art' ? readArtShape(parsed, meta) : readShape(parsed.outline ?? parsed, meta)
  return { shape: read.shape, reason: read.reason, ms, refused: false }
}

// ============================================================================
// 한 단어
// ============================================================================

type Stage = 'pass' | 'proposal' | 'validate' | 'review' | 'unreviewed' | 'error'

/** 그 단어를 무엇이 서비스했는가. 런타임과 같은 순서다 — 아틀라스 적중이면 LLM 호출 0회 */
type Path = 'atlas' | 'dsl'

type Attempt = {
  n: number
  path: Path
  stage: Stage
  /** 떨어진 이유 한 줄 */
  reason: string | null
  /** 런타임 관문(중등·2D)에서 나온 error 코드 */
  runtime_errors: string[]
  /** 아틀라스 관문(세 학년대 × 전 형태)에서 나온 코드. 참고용이다 */
  atlas_failures: string[]
  /** 이미지 검토가 "빠졌다"고 지목한 것 */
  missing: string | null
  /** 윤곽 점 개수 — 구체성의 보조 지표 (Q5 의 B 지표) */
  points: number | null
  details: number | null
  /** 색 영역 개수 (ADR-039). `outline` 엔진에서는 항상 0 이다 */
  regions: number | null
  ms: number
  llm_calls: number
}

type WordResult = {
  word: string
  /** 아틀라스가 서비스했는가(`in-corpus`) 아니면 윤곽 DSL 이 했는가(`held-out`) */
  path: Path
  /** 캐릭터·상표 일반화가 일어났는가 (현재 코드의 동작 — Q4 가 걷어낼 예정) */
  generalized: string | null
  attempts: Attempt[]
  /** 한 번에 통과했는가 */
  pass_at_1: boolean
  /** 재시도까지 포함해 통과했는가 */
  pass_at_2: boolean
  /** 끝까지 못 통과했을 때 마지막으로 떨어진 단계 */
  final_stage: Stage
}

async function runAttempt(
  entry: WordEntry,
  apiKey: string,
  note: string | null,
  n: number,
  /** 아틀라스가 적중했으면 그 모양. 있으면 LLM 을 부르지 않는다 */
  preset: PenShape | null,
  engine: 'outline' | 'art',
): Promise<Attempt> {
  const base: Attempt = {
    n,
    path: preset ? 'atlas' : 'dsl',
    stage: 'error',
    reason: null,
    runtime_errors: [],
    atlas_failures: [],
    missing: null,
    points: null,
    details: null,
    regions: null,
    ms: 0,
    llm_calls: 0,
  }

  let shape: PenShape

  if (preset) {
    shape = preset
  } else {
    let proposal: Proposal
    try {
      proposal = await propose(entry, apiKey, note, engine)
    } catch (error) {
      return { ...base, stage: 'error', reason: `호출 실패: ${(error as Error).message.slice(0, 80)}`, llm_calls: 1 }
    }

    base.ms = proposal.ms
    base.llm_calls = 1

    if (!proposal.shape) {
      return { ...base, stage: 'proposal', reason: proposal.reason ?? '윤곽을 읽을 수 없었습니다' }
    }
    shape = proposal.shape
  }

  base.points = shape.silhouette.points.length
  base.details = shape.details.length
  base.regions = shape.art.length

  // 런타임 관문 — 강사가 실제로 겪는 조건 하나 (중등 · 2D). 헤드라인 숫자가 이것이다.
  const spec = gateSpec('middle', 'flat')
  const recipe = shapeRecipe(shape, { form: 'flat', grade_band: 'middle' })
  const { report } = validatePen(buildPattern(recipe, recipe.defaults), spec)
  const runtimeErrors = report.findings
    .filter((f) => f.severity === 'error')
    .map((f) => f.code)

  // 아틀라스 관문 — 세 학년대 × 전 형태. 참고용으로 같이 적는다.
  const gate = atlasGate(shape)
  base.runtime_errors = [...new Set(runtimeErrors)]
  base.atlas_failures = [...new Set(gate.failures)]

  if (runtimeErrors.length > 0) {
    return {
      ...base,
      stage: 'validate',
      reason: `검증 error: ${base.runtime_errors.slice(0, 4).join(', ')}`,
    }
  }

  // 이미지 검토 — 런타임과 같은 픽셀로 묻는다 (ADR-038)
  const review = await reviewShape({
    word: entry.word,
    strokes: buildPattern(recipe, recipe.defaults).parts.flatMap((p) => p.strokes),
    apiKey,
    retries: 1,
  })
  base.llm_calls += 1

  if (review.verdict === 'looks_like') return { ...base, stage: 'pass' }
  if (review.verdict === 'skipped') {
    return { ...base, stage: 'unreviewed', reason: '이미지 검토를 하지 못했습니다' }
  }
  return {
    ...base,
    stage: 'review',
    reason: `그 단어로 보이지 않았습니다 — ${review.missing ?? '알아볼 특징이 없습니다'}`,
    missing: review.missing,
  }
}

async function runWord(
  raw: WordEntry,
  apiKey: string,
  maxAttempts: number,
  engine: 'outline' | 'art',
): Promise<WordResult> {
  // 현재 코드의 동작을 그대로 잰다 — 일반화를 끄지 않는다 (Q4 는 다음 단계에서 걷어낸다)
  const general = generalizeCharacter(raw.word)
  const entry: WordEntry = general.replaced
    ? { word: general.text, words: [general.text] }
    : raw

  // 런타임과 **같은 순서**다 (ADR-036): 아틀라스 적중이면 LLM 을 부르지 않는다.
  // 레시피(1순위)는 3D 조립 경로이므로 2D 베이스라인에서는 보지 않는다.
  const matched = atlasMatches(entry.word)
  const preset = matched.length > 0 ? atlasShape(matched[0]!) : null

  const attempts: Attempt[] = []
  let note: string | null = null

  // 아틀라스가 적중하면 모양이 하나로 정해져 있으므로 재시도가 의미 없다 — 1회만 돈다
  const rounds = preset ? 1 : maxAttempts

  for (let n = 1; n <= rounds; n += 1) {
    const attempt = await runAttempt(entry, apiKey, note, n, preset, engine)
    attempts.push(attempt)
    if (attempt.stage === 'pass') break
    note = attempt.reason
  }

  const passIndex = attempts.findIndex((a) => a.stage === 'pass')
  const last = attempts[attempts.length - 1]

  return {
    word: raw.word,
    path: preset ? 'atlas' : 'dsl',
    generalized: general.replaced ? general.text : null,
    attempts,
    pass_at_1: attempts[0]?.stage === 'pass',
    pass_at_2: passIndex >= 0,
    final_stage: passIndex >= 0 ? 'pass' : (last?.stage ?? 'error'),
  }
}

// ============================================================================
// 병렬 실행 — 통과/실패는 바뀌지 않고 벽시계 시간만 줄어든다
// ============================================================================

async function runPool<T, R>(
  items: T[],
  size: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let cursor = 0

  async function lane(): Promise<void> {
    for (;;) {
      const index = cursor
      cursor += 1
      if (index >= items.length) return
      out[index] = await worker(items[index]!, index)
    }
  }

  await Promise.all(Array.from({ length: Math.max(1, Math.min(size, items.length)) }, lane))
  return out
}

// ============================================================================
// 집계와 보고서
// ============================================================================

function tally(values: string[]): [string, number][] {
  const counts = new Map<string, number>()
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1])
}

function pct(n: number, total: number): string {
  if (total === 0) return '0.0%'
  return `${((n / total) * 100).toFixed(1)}%`
}

const STAGE_LABEL: Record<Stage, string> = {
  pass: '통과',
  proposal: '제안 버림',
  validate: '검증 error',
  review: '알아보지 못함',
  unreviewed: '검토 못 함',
  error: '호출 실패',
}

function buildReport(results: WordResult[], args: Args, elapsedMs: number): string {
  const total = results.length
  const at1 = results.filter((r) => r.pass_at_1).length
  const at2 = results.filter((r) => r.pass_at_2).length

  // Q14 의 두 숫자. 아틀라스가 서비스한 단어와 그렇지 않은 단어를 **절대 섞지 않는다** —
  // 섞으면 "코퍼스가 자기 자신을 알아본다"가 품질 지표로 위장된다.
  const inCorpus = results.filter((r) => r.path === 'atlas')
  const heldOut = results.filter((r) => r.path === 'dsl')

  const finalStages = tally(results.filter((r) => !r.pass_at_2).map((r) => r.final_stage))
  const allRuntimeErrors = tally(results.flatMap((r) => r.attempts.flatMap((a) => a.runtime_errors)))
  const allAtlasFailures = tally(results.flatMap((r) => r.attempts.flatMap((a) => a.atlas_failures)))
  const missing = results.flatMap((r) => r.attempts.map((a) => a.missing).filter((m): m is string => !!m))

  const pointSamples = results
    .flatMap((r) => r.attempts.map((a) => a.points))
    .filter((p): p is number => p !== null)
  const detailSamples = results
    .flatMap((r) => r.attempts.map((a) => a.details))
    .filter((d): d is number => d !== null)
  const avg = (xs: number[]) => (xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length)

  const calls = results.reduce((sum, r) => sum + r.attempts.reduce((s, a) => s + a.llm_calls, 0), 0)
  const proposalMs = results.flatMap((r) => r.attempts.map((a) => a.ms)).filter((m) => m > 0)

  return [
    '# 베이스라인 — 개편 전 현재 성능',
    '',
    `측정 시각: ${new Date().toISOString()}`,
    `모델: \`${process.env.ANTHROPIC_MODEL?.trim() || 'claude-opus-5'}\` · 엔진 \`${args.engine}\` · 시도 상한 ${args.attempts}회 · 동시 ${args.concurrency}`,
    '',
    '**이 숫자는 코드를 고치기 전의 것이다.** 고친 뒤에는 다시 뜰 수 없다.',
    '',
    '## 알아봄 통과율 (헤드라인)',
    '',
    '| 지표 | 값 |',
    '|---|---|',
    `| 돌린 단어 | ${total}개 |`,
    `| **pass@1** (한 번에 통과) | **${at1}개 · ${pct(at1, total)}** |`,
    `| **pass@2** (이유 되먹여 한 번 더) | **${at2}개 · ${pct(at2, total)}** |`,
    '',
    '관문은 셋이다 — 윤곽 제안을 읽을 수 있는가 → 물리 검증 error 0건인가(중등·2D) → 이미지 검토가',
    '그 단어로 보인다고 하는가. 셋을 다 통과한 비율이 위 숫자다.',
    '',
    '### 경로별 — 이 둘을 섞으면 지표가 거짓말을 한다',
    '',
    '| 경로 | 단어 | pass@1 | pass@2 |',
    '|---|---|---|---|',
    `| \`in-corpus\` (아틀라스 적중) | ${inCorpus.length}개 | ${pct(inCorpus.filter((r) => r.pass_at_1).length, inCorpus.length)} | ${pct(inCorpus.filter((r) => r.pass_at_2).length, inCorpus.length)} |`,
    `| \`held-out\` (윤곽 DSL) | ${heldOut.length}개 | ${pct(heldOut.filter((r) => r.pass_at_1).length, heldOut.length)} | ${pct(heldOut.filter((r) => r.pass_at_2).length, heldOut.length)} |`,
    '',
    '`held-out` 이 진짜 품질 지표다 — 강사가 넣는 단어의 대부분이 이쪽이다. `in-corpus` 가 높은 것은',
    '당연하고(사람이 검수해 넣은 모양이다) 개편의 성과가 아니다.',
    '',
    '## 떨어진 단계 (통과하지 못한 단어의 마지막 단계)',
    '',
    '| 단계 | 단어 수 | 전체 대비 |',
    '|---|---|---|',
    ...finalStages.map(([stage, n]) => `| ${STAGE_LABEL[stage as Stage]} | ${n} | ${pct(n, total)} |`),
    '',
    '`검토 못 함`은 **부정이 아니다** — 검토 자체가 실패한 것이고, 모양이 틀렸다는 뜻이 아니다 (ADR-038).',
    '',
    '## 물리 검증 error 코드 (런타임 관문 · 중등 2D)',
    '',
    allRuntimeErrors.length === 0
      ? '해당 없음 — 물리 검증에서 떨어진 시도가 없다.'
      : ['| 코드 | 횟수 |', '|---|---|', ...allRuntimeErrors.map(([c, n]) => `| \`${c}\` | ${n} |`)].join(
          '\n',
        ),
    '',
    '## 아틀라스 관문 실패 (세 학년대 × 전 형태 · 참고)',
    '',
    '적재 기준은 런타임보다 엄격하다. 아틀라스가 비어 있는 이유가 여기 보인다.',
    '',
    allAtlasFailures.length === 0
      ? '해당 없음.'
      : ['| 조건·코드 | 횟수 |', '|---|---|', ...allAtlasFailures.slice(0, 25).map(([c, n]) => `| \`${c}\` | ${n} |`)].join(
          '\n',
        ),
    '',
    '## 기하 복잡도 (보조 지표)',
    '',
    '| 지표 | 값 |',
    '|---|---|',
    `| 윤곽 점 개수 평균 | ${avg(pointSamples).toFixed(1)}개 |`,
    `| 윤곽 점 개수 범위 | ${pointSamples.length ? `${Math.min(...pointSamples)}~${Math.max(...pointSamples)}` : '—'} |`,
    `| 내부선 개수 평균 | ${avg(detailSamples).toFixed(1)}개 |`,
    `| 색 영역 개수 평균 | ${avg(results.flatMap((r) => r.attempts.map((a) => a.regions)).filter((x): x is number => x !== null)).toFixed(1)}개 |`,
    '',
    '프롬프트가 점 14~28개를 권하고 있으므로 이 평균이 "구체적이지 않음"의 기하적 실체다.',
    '',
    '## 이미지 검토가 지목한 "빠진 것"',
    '',
    missing.length === 0 ? '없음.' : missing.map((m) => `- ${m}`).join('\n'),
    '',
    '개편이 무엇을 고쳐야 하는지가 이 목록에 들어 있다.',
    '',
    '## 비용·시간',
    '',
    '| 지표 | 값 |',
    '|---|---|',
    `| LLM 호출 | ${calls}회 |`,
    `| 윤곽 제안 1회 평균 | ${(avg(proposalMs) / 1000).toFixed(1)}초 |`,
    `| 벽시계 총 소요 | ${(elapsedMs / 60000).toFixed(1)}분 (동시 ${args.concurrency}) |`,
    '',
    '## 단어별',
    '',
    '| 단어 | 경로 | pass@1 | pass@2 | 마지막 단계 | 점 | 내부선 | 이유 |',
    '|---|---|---|---|---|---|---|---|',
    ...results.map((r) => {
      const last = r.attempts[r.attempts.length - 1]
      const reason = (last?.reason ?? '').replace(/\|/g, '\\|').slice(0, 70)
      const name = r.generalized ? `${r.word} → ${r.generalized}` : r.word
      return `| ${name} | ${r.path} | ${r.pass_at_1 ? '✓' : '—'} | ${r.pass_at_2 ? '✓' : '—'} | ${STAGE_LABEL[r.final_stage]} | ${last?.points ?? '—'} | ${last?.details ?? '—'} | ${reason} |`
    }),
    '',
  ].join('\n')
}

// ============================================================================

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim()
  if (!apiKey) {
    console.error('ANTHROPIC_API_KEY 가 없습니다. 베이스라인은 실제 LLM 을 씁니다.')
    process.exit(1)
  }

  const entries: WordEntry[] = [
    ...args.words.flatMap((path) => parseWordList(readFileSync(path, 'utf8'))),
    ...args.singles.map((word) => ({ word, words: [word] })),
  ].slice(0, args.limit)

  if (entries.length === 0) {
    console.error('단어가 없습니다.')
    process.exit(1)
  }

  console.log(`단어 ${entries.length}개 · 시도 상한 ${args.attempts}회 · 동시 ${args.concurrency}`)
  console.log('런타임 코드를 그대로 돌린다. 아무것도 고치지 않는다.\n')

  const started = Date.now()
  let done = 0

  const results = await runPool(entries, args.concurrency, async (entry) => {
    const result = await runWord(entry, apiKey, args.attempts, args.engine)
    done += 1
    const mark = result.pass_at_1 ? '✓1' : result.pass_at_2 ? '✓2' : '✗ '
    console.log(
      `[${String(done).padStart(3)}/${entries.length}] ${mark} ${result.word}` +
        (result.pass_at_2 ? '' : ` — ${STAGE_LABEL[result.final_stage]}`),
    )
    return result
  })

  const elapsed = Date.now() - started
  const report = buildReport(results, args, elapsed)

  writeFileSync(args.json, JSON.stringify({ measured_at: new Date().toISOString(), args, results }, null, 2), 'utf8')
  writeFileSync(args.report, report, 'utf8')

  const at1 = results.filter((r) => r.pass_at_1).length
  const at2 = results.filter((r) => r.pass_at_2).length
  console.log(`\npass@1 ${at1}/${results.length} (${pct(at1, results.length)})`)
  console.log(`pass@2 ${at2}/${results.length} (${pct(at2, results.length)})`)
  console.log(`\n${args.report} · ${args.json} 에 썼습니다.`)
}

await main()
