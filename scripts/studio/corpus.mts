/**
 * 코퍼스 적재 — **벡터 아트 SVG 를 아틀라스로 들여온다** (ADR-041).
 *
 *   node --experimental-strip-types --import ./scripts/studio/register.mjs \
 *        scripts/studio/corpus.mts --svg-dir <SVG 폴더> [--dry-run] [--limit 50]
 *
 * `atlas.mts` 와 결정적으로 다른 점: **LLM 을 한 번도 부르지 않는다.**
 *
 * 왜 부르지 않아도 되는가 — 아틀라스의 관문은 둘이었다. 물리 검증(코드가 한다)과 "그 단어로
 * 보이는가"(이미지 검토가 했다). 코퍼스의 아트는 **사람이 그 단어를 그린 것**이므로 두 번째
 * 관문의 답이 이미 정해져 있다. 모델에게 사람이 그린 코끼리가 코끼리인지 묻는 것은 비용만
 * 쓰는 일이다.
 *
 * 물리 검증은 그대로 돌린다 — 아트가 사람 솜씨여도 3mm 선 간격은 지켜야 하고, 그 판정은
 * `atlasGate` 가 세 학년대 × 전 형태로 한다 (ADR-030: 임계값을 낮춰 통과시키지 않는다).
 *
 * 입력 SVG 는 **신뢰하지 않는 데이터**다. 폴더 경로를 인자로 받고, 읽을 수 없는 파일은
 * 조용히 건너뛰어 보고서에 남긴다 — 한 파일 때문에 배치가 멈추지 않는다.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import {
  atlasGate,
  atlasId,
  emitRecords,
  parseEmitted,
  mergeRecords,
  toRecord,
} from '@/lib/studio/atlas-build'
import { readArtShape } from '@/lib/studio/pen3d/shape'
import { importSvgArt } from '@/lib/studio/svg-art'
import type { AtlasRecord, PenShape } from '@/types/studio'

type Entry = { code: string; word: string; words: string[] }

type Args = {
  svgDir: string
  map: string
  out: string
  report: string
  limit: number
  dryRun: boolean
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    svgDir: '',
    map: 'scripts/studio/words/twemoji-map.txt',
    out: 'src/data/atlas/records.ts',
    report: 'corpus-report.md',
    limit: 1000,
    dryRun: false,
  }
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i]
    const value = argv[i + 1]
    if (flag === '--svg-dir' && value) (args.svgDir = value), (i += 1)
    else if (flag === '--map' && value) (args.map = value), (i += 1)
    else if (flag === '--out' && value) (args.out = value), (i += 1)
    else if (flag === '--report' && value) (args.report = value), (i += 1)
    else if (flag === '--limit' && value) (args.limit = Number(value)), (i += 1)
    else if (flag === '--dry-run') args.dryRun = true
  }
  return args
}

/**
 * 매핑 파일을 읽는다. `#held-out` 줄 **아래는 전부 버린다** — 측정용 대조군이고
 * 코퍼스에 들어가면 지표가 자기 자신을 재게 된다 (ADR-041).
 */
export function parseMap(text: string): { entries: Entry[]; heldOut: string[] } {
  const entries: Entry[] = []
  const heldOut: string[] = []
  let afterHeldOut = false
  const seen = new Set<string>()

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (trimmed === '') continue
    if (trimmed.toLowerCase().startsWith('#held-out')) {
      afterHeldOut = true
      continue
    }
    if (trimmed.startsWith('#')) continue

    const space = trimmed.indexOf(' ')
    if (space < 0) continue
    const code = trimmed.slice(0, space).trim().toLowerCase()
    if (!/^[0-9a-f]{4,6}(-[0-9a-f]{4,6})*$/.test(code)) continue

    const words = trimmed
      .slice(space + 1)
      .split(',')
      .map((w) => w.trim())
      .filter((w) => w.length >= 1 && w.length <= 20)
    const word = words[0]
    if (!word) continue

    if (afterHeldOut) {
      heldOut.push(word)
      continue
    }
    if (seen.has(word)) continue
    seen.add(word)
    entries.push({ code, word, words: [...new Set(words)] })
  }

  return { entries, heldOut }
}

type Outcome =
  | {
      word: string
      ok: true
      record: AtlasRecord
      regions: number
      details: number
      holes: number
    }
  | { word: string; ok: false; reason: string }

function build(entry: Entry, svgDir: string): Outcome {
  const path = join(svgDir, `${entry.code}.svg`)
  if (!existsSync(path)) {
    return { word: entry.word, ok: false, reason: `SVG 가 없습니다 (${entry.code}.svg)` }
  }

  let svg: string
  try {
    svg = readFileSync(path, 'utf8')
  } catch (error) {
    return { word: entry.word, ok: false, reason: `읽지 못했습니다: ${(error as Error).message}` }
  }

  const art = importSvgArt(svg)
  if (!art) return { word: entry.word, ok: false, reason: '색 영역을 뽑지 못했습니다' }

  /**
   * 정규화는 **가로를 1 로** 맞춘다 — `readShape` 와 같은 규칙이다. 세로를 따로 나누면
   * 종횡비가 깨져서 코끼리가 납작해진다. 그래서 x·y 를 **둘 다 width 로** 나눈다.
   */
  const scale = art.width
  const payload = {
    title: entry.word,
    art: art.regions.map((region) => ({
      color: region.color,
      z: region.z,
      points: region.outline.points.map((p) => ({ x: p.x / scale, y: p.y / scale })),
      holes: region.holes.map((hole) => hole.points.map((p) => ({ x: p.x / scale, y: p.y / scale }))),
    })),
  }

  const read = readArtShape(payload, {
    word: entry.word,
    source: 'atlas',
    id: atlasId(entry.word),
    words: entry.words,
  })
  const shape: PenShape | null = read.shape
  if (!shape) return { word: entry.word, ok: false, reason: read.reason ?? '모양을 만들지 못했습니다' }

  /**
   * 물리 검증은 면제하지 않는다 — 세 학년대 × 전 형태 (ADR-030). 임계값을 낮추지 않는다.
   *
   * **내부선을 떼서 구제하는 단계를 넣었다가 뺐다.** `docs/STUDIO.md` 의 "간격이 모자라면
   * 모양이 아니라 디테일이 먼저 깎인다" 를 적재에도 적용해 본 것인데, 실측에서 **0단어를
   * 구제했다.** 떨어지는 원인이 내부선이 아니라 **유도된 실루엣 자체**였기 때문이다 —
   * 고양이의 귀·수염처럼 윤곽에 뾰족한 특징이 있는 모양이 초등·3D 임계값에서 걸린다.
   *
   * 아무것도 구제하지 않는 단계를 코드에 남기지 않는다. 떨어진 단어는 보고서에 남기고
   * 사람이 본다 — 그게 이 스크립트의 설계다.
   */
  const gate = atlasGate(shape)
  const finalShape = shape

  if (!gate.ok) {
    return {
      word: entry.word,
      ok: false,
      reason: `검증에서 걸렸습니다: ${[...new Set(gate.failures)].slice(0, 4).join(', ')}`,
    }
  }

  return {
    word: entry.word,
    ok: true,
    regions: finalShape.art.length,
    details: finalShape.details.length,
    holes: finalShape.holes.length,
    record: toRecord({
      entry: { word: entry.word, words: entry.words },
      shape: finalShape,
      summary: `${entry.word} 그림을 색 영역 ${finalShape.art.length}개로 그렸습니다.`,
      difficulty: gate.difficulty,
    }),
  }
}

function readEmitted(path: string): AtlasRecord[] {
  try {
    return parseEmitted(readFileSync(path, 'utf8'))
  } catch {
    return []
  }
}

function main(): void {
  const args = parseArgs(process.argv.slice(2))
  if (args.svgDir === '') {
    console.error('--svg-dir <폴더> 가 필요합니다. 아트 SVG 가 들어 있는 폴더입니다.')
    process.exit(1)
  }

  const { entries, heldOut } = parseMap(readFileSync(args.map, 'utf8'))
  const targets = entries.slice(0, args.limit)
  if (targets.length === 0) {
    console.error('매핑 파일에서 단어를 읽지 못했습니다.')
    process.exit(1)
  }

  console.log(`단어 ${targets.length}개를 적재합니다 (held-out ${heldOut.length}개는 제외).`)
  console.log('LLM 을 부르지 않습니다 — 모양이 파일에서 옵니다.\n')

  const outcomes = targets.map((entry) => {
    const outcome = build(entry, args.svgDir)
    console.log(
      outcome.ok
        ? `  ✓ ${outcome.word} — 영역 ${outcome.regions} · 내부선 ${outcome.details} · 구멍 ${outcome.holes}`
        : `  ✗ ${outcome.word} — ${outcome.reason}`,
    )
    return outcome
  })

  const passed = outcomes.filter((o): o is Extract<Outcome, { ok: true }> => o.ok)
  const records = mergeRecords(readEmitted(args.out), passed.map((o) => o.record))

  const avg = (xs: number[]) => (xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length)
  const report = [
    '# 코퍼스 적재 보고서',
    '',
    `적재 시각: ${new Date().toISOString()}`,
    '',
    '`atlas.mts` 와 달리 **LLM 을 한 번도 부르지 않는다.** 아트가 사람이 그린 것이므로',
    '"그 단어로 보이는가" 의 답이 이미 정해져 있다 (ADR-041). 물리 검증은 그대로 받는다.',
    '',
    '| 지표 | 값 |',
    '|---|---|',
    `| 시도한 단어 | ${outcomes.length}개 |`,
    `| 들어간 것 | ${passed.length}개 (${((passed.length / outcomes.length) * 100).toFixed(1)}%) |`,
    `| 빠진 것 | ${outcomes.length - passed.length}개 |`,
    `| 목록 전체 | ${records.length}개 |`,
    `| held-out (적재 안 함) | ${heldOut.length}개 |`,
    '',
    '## 기하 — 개편 전 LLM 윤곽과 비교',
    '',
    '| 지표 | 코퍼스 | 개편 전 (LLM 윤곽) |',
    '|---|---|---|',
    `| 색 영역 개수 평균 | ${avg(passed.map((o) => o.regions)).toFixed(1)}개 | 0개 (색이 없었다) |`,
    `| 내부선 개수 평균 | ${avg(passed.map((o) => o.details)).toFixed(1)}개 | 0.7개 |`,
    `| 구멍 개수 평균 | ${avg(passed.map((o) => o.holes)).toFixed(1)}개 | 0개 |`,
    '',
    '## 단어별',
    '',
    '| 단어 | 결과 | 영역 | 내부선 | 구멍 | 이유 |',
    '|---|---|---|---|---|---|',
    ...outcomes.map((o) =>
      o.ok
        ? `| ${o.word} | 통과 | ${o.regions} | ${o.details} | ${o.holes} | |`
        : `| ${o.word} | 보류 | | | | ${o.reason.replace(/\|/g, '\\|')} |`,
    ),
    '',
    '## held-out — 코퍼스에 넣지 않는 단어',
    '',
    '코퍼스가 없는 단어에서 품질이 어떤지를 재기 위한 대조군이다. **이 줄을 코퍼스로 옮기지 말 것** —',
    '옮기면 `held-out` 통과율이 `in-corpus` 통과율로 바뀌고, 그 숫자는 아무것도 증명하지 않는다.',
    '',
    heldOut.map((w) => `\`${w}\``).join(' · '),
    '',
    '## 저작자 표시',
    '',
    '아트: Twemoji — CC-BY 4.0 (https://creativecommons.org/licenses/by/4.0/).',
    '표시는 도안 범례에도 들어간다. 이것은 플랫폼의 저작권 판정이 아니라 **우리가 쓰는 소스의',
    '사용 조건**이다 — 강사의 입력을 막거나 치환하거나 경고하지 않는다 (ADR-042).',
    '',
  ].join('\n')

  if (args.dryRun) {
    console.log('\n--dry-run 이므로 파일을 쓰지 않습니다.\n')
    console.log(report.split('\n').slice(0, 40).join('\n'))
    return
  }

  writeFileSync(args.out, emitRecords(records), 'utf8')
  writeFileSync(args.report, report, 'utf8')
  console.log(`\n${args.out} 에 ${records.length}개를 썼습니다. 보고서: ${args.report}`)
}

main()
