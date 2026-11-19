/**
 * 사전 제작 도안 팩 검수 (ADR-044).
 *
 *   npm run studio:pack            # 전부 검사하고 pack-report.md 를 쓴다
 *   npm run studio:pack -- --limit 20
 *
 * **LLM 을 부르지 않는다.** 팩은 문장과 조회어만 들고 있고 모양은 아틀라스에서 오므로,
 * 여기서 확인할 것은 두 가지다:
 *
 *   1. 팩의 모든 항목이 **아틀라스에 있는 모양**을 가리키는가
 *   2. 그 모양이 **세 학년대 · 2D·3D 전부에서** 물리 검증을 통과하는가 (`atlasGate`)
 *
 * 런타임과 **같은 코드**를 쓴다 (`lib/studio/**`). 스크립트가 통과시킨 항목이 교실에서
 * 떨어지는 일을 막는 유일한 방법이다.
 *
 * 하나라도 떨어지면 **종료 코드 1** 이다. 팩은 체험 세션의 기본 경로이므로, 깨진 항목이
 * 있는 채로 배포되면 방문자가 실패 화면을 본다.
 */

import { writeFileSync } from 'node:fs'
import { atlasGate } from '@/lib/studio/atlas-build'
import { penHarness } from '@/lib/studio/harness/pipeline'
import { retrieveDesign } from '@/lib/studio/harness/retrieve'
import { packDesigns, packShape, packSources } from '@/lib/studio/pack'
import { ATLAS_RECORDS } from '@/data/atlas/records'
import type { PackDesign, StudioSpec } from '@/types/studio'

type Args = { limit: number; out: string }

function parseArgs(argv: string[]): Args {
  const args: Args = { limit: Number.POSITIVE_INFINITY, out: 'pack-report.md' }
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i]
    const value = argv[i + 1]
    if (flag === '--limit' && value) (args.limit = Number(value)), (i += 1)
    else if (flag === '--out' && value) (args.out = value), (i += 1)
  }
  return args
}

/** 측정용 수업 조건. 특정 회차가 아니라 **가장 흔한 특강 조건**이다 */
function sampleSpec(topic: string): StudioSpec {
  return {
    kind: 'pen3d',
    grade_band: 'middle',
    student_count: 20,
    duration_minutes: 90,
    venue: '교실',
    equipment: ['3D펜 20자루', 'PLA 필라멘트', '실리콘 매트'],
    topic,
    session_id: null,
    form: 'flat',
  }
}

type Row = {
  design: PackDesign
  ok: boolean
  reason: string
  gate_failures: string[]
  minutes: number
  parts: number
  art: number
  retrieved: boolean
  /** 중등 2D 에서 실제로 인쇄되는 치수 (mm) */
  size_mm: number
  /** 부품 칸이 A4 사용 영역에서 차지하는 비율 */
  page_ratio: number
}

function check(design: PackDesign): Row {
  const base: Row = {
    design,
    ok: false,
    reason: '',
    gate_failures: [],
    minutes: 0,
    parts: 0,
    art: 0,
    retrieved: false,
    size_mm: 0,
    page_ratio: 0,
  }

  const shape = packShape(design)
  if (!shape) {
    return { ...base, reason: `모양을 만들 수 없습니다 (${design.shape_id})` }
  }

  const gate = atlasGate(shape)
  if (!gate.ok) {
    return { ...base, reason: '물리 검증에서 걸렸습니다', gate_failures: gate.failures }
  }

  // 대표 단어로 조회하면 **자기 자신이** 1순위로 나와야 한다. 아니면 조회어가 겹친 것이다.
  const hit = retrieveDesign(design.word)
  const retrieved = hit?.design.id === design.id

  const result = penHarness(sampleSpec(design.word))
  if (result.status !== 'validated') {
    return {
      ...base,
      reason: '하네스가 통과시키지 못했습니다',
      gate_failures: result.report.findings
        .filter((f) => f.severity === 'error')
        .map((f) => f.code),
      retrieved,
    }
  }

  return {
    design,
    ok: true,
    reason: '',
    gate_failures: [],
    minutes: Math.round(result.metrics.estimated_minutes * 10) / 10,
    parts: result.metrics.part_count,
    art: shape.art.length,
    retrieved,
    size_mm: gate.flat_size_mm,
    page_ratio: gate.flat_page_ratio,
  }
}

function main(): void {
  const args = parseArgs(process.argv.slice(2))
  const sources = packSources()
  const ids = new Set(ATLAS_RECORDS.map((r) => r.id))
  const missing = sources.filter((s) => !ids.has(s.shape ?? `atlas-${s.word}`))

  const designs = packDesigns().slice(0, args.limit)
  const rows: Row[] = []
  for (const design of designs) {
    const row = check(design)
    rows.push(row)
    process.stdout.write(
      `${row.ok ? '통과' : '실패'} ${design.word}${row.ok ? '' : ` — ${row.reason}`}\n`,
    )
  }

  const passed = rows.filter((r) => r.ok)
  const failed = rows.filter((r) => !r.ok)
  const notRetrieved = passed.filter((r) => !r.retrieved)
  const substitutes = passed.filter((r) => r.design.substitute)
  const avg = (values: number[]) =>
    values.length === 0 ? 0 : Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10

  const lines: string[] = [
    '# 사전 제작 도안 팩 검수 보고서',
    '',
    `검수 시각: ${new Date().toISOString()}`,
    '',
    '**LLM 을 한 번도 부르지 않는다.** 팩은 문장과 조회어만 들고 있고 모양은 아틀라스에서 온다 (ADR-044).',
    '물리 검증은 런타임과 같은 코드(`atlasGate` · `penHarness`)로 세 학년대 × 2D·3D 전부에 돌린다.',
    '',
    '| 지표 | 값 |',
    '|---|---|',
    `| 팩에 적힌 항목 | ${sources.length}개 |`,
    `| 모양이 아틀라스에 없는 항목 | ${missing.length}개 |`,
    `| 검사한 항목 | ${rows.length}개 |`,
    `| 통과 | ${passed.length}개 |`,
    `| 실패 | ${failed.length}개 |`,
    `| 대체 모양(요청한 사물과 다름) | ${substitutes.length}개 |`,
    `| 대표 단어로 조회했을 때 1순위가 아닌 항목 | ${notRetrieved.length}개 |`,
    `| 평균 예상 제작 시간 (중등·2D·90분) | ${avg(passed.map((r) => r.minutes))}분 |`,
    `| 평균 색 영역 개수 | ${avg(passed.map((r) => r.art))}개 |`,
    `| 평균 인쇄 치수 (중등·2D) | ${avg(passed.map((r) => r.size_mm))}mm |`,
    `| 평균 A4 사용 영역 점유율 | ${Math.round(avg(passed.map((r) => r.page_ratio * 100)))}% |`,
    `| 100mm 보다 작게 나오는 항목 | ${passed.filter((r) => r.size_mm < 100).length}개 |`,
    '',
  ]

  if (missing.length > 0) {
    lines.push('## 모양이 없는 항목 — 팩에서 **조용히 빠진다**', '')
    for (const m of missing) lines.push(`- \`${m.word}\` → \`${m.shape ?? `atlas-${m.word}`}\``)
    lines.push('')
  }

  if (failed.length > 0) {
    lines.push('## 실패', '', '| 단어 | 모양 | 이유 | 걸린 항목 |', '|---|---|---|---|')
    for (const r of failed) {
      lines.push(
        `| ${r.design.word} | \`${r.design.shape_id}\` | ${r.reason} | ${r.gate_failures.join(', ')} |`,
      )
    }
    lines.push('')
  }

  if (notRetrieved.length > 0) {
    lines.push(
      '## 대표 단어로 조회했을 때 다른 항목이 먼저 나오는 항목',
      '',
      '조회어가 겹친 것이다. 겹치면 "왜 이 모양이 나왔는가" 에 답할 수 없다.',
      '',
    )
    for (const r of notRetrieved) lines.push(`- ${r.design.word}`)
    lines.push('')
  }

  lines.push(
    '## 항목별',
    '',
    '| 단어 | 모양 | 조회어 | 분류 | 치수(mm) | 종이 | 예상(분) | 부품 | 색 영역 | 대체 |',
    '|---|---|---|---|---|---|---|---|---|---|',
  )
  for (const r of rows) {
    lines.push(
      `| ${r.design.word} | \`${r.design.shape_id}\` | ${r.design.words.slice(1).join(' · ') || '-'} | ${r.design.tags.join(' · ')} | ${r.ok ? r.size_mm : '-'} | ${r.ok ? Math.round(r.page_ratio * 100) + '%' : '-'} | ${r.ok ? r.minutes : '-'} | ${r.ok ? r.parts : '-'} | ${r.ok ? r.art : '-'} | ${r.design.substitute ? '○' : ''} |`,
    )
  }

  lines.push(
    '',
    '## 저작자 표시',
    '',
    '아트: Twemoji — CC-BY 4.0 (https://creativecommons.org/licenses/by/4.0/).',
    '표시는 도안 범례와 검증 리포트에 함께 들어간다 (ADR-041).',
    '',
    '## 문장은 누가 썼는가',
    '',
    '팩의 제목·이유·주의사항·학습 목표는 **미리 작성해 둔 문장**이다. 화면은 이 사실을',
    '"미리 만들어 둔 도안의 문장입니다" 로 적고, 실시간 AI 가 쓴 문장과 구별한다 (ADR-025).',
    '',
  )

  writeFileSync(args.out, lines.join('\n'), 'utf8')
  process.stdout.write(`\n보고서: ${args.out}\n`)

  if (failed.length > 0 || missing.length > 0) {
    process.stdout.write(`실패 ${failed.length}개 · 모양 없음 ${missing.length}개\n`)
    process.exitCode = 1
  }
}

main()
