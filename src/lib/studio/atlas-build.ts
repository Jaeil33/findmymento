/**
 * 아틀라스 적재의 **판정과 출력** (ADR-036).
 *
 * 스크립트(`scripts/studio/atlas.mts`)는 LLM 을 부르고 파일을 쓰는 일만 하고, "이 모양을
 * 목록에 넣어도 되는가"는 전부 여기서 정한다 — 그래야 테스트가 그 규칙을 고정할 수 있다.
 *
 * 넣을 수 있는 조건은 하나다: **세 학년대 · 2D·3D 전부에서 검증을 통과한다.** 한 조건에서만
 * 통과하는 모양을 "검수됨"으로 올리면, 그 모양을 다른 학년에서 고른 강사가 실패 화면을 본다.
 * 통과하지 못하면 임계값을 낮추지 않고 **그 단어를 버린다** (ADR-030).
 */

import { buildPattern } from '@/lib/studio/pen3d/recipes'
import { shapeRecipe } from '@/lib/studio/pen3d/shape'
import { penMetrics, validatePen } from '@/lib/studio/pen3d/validate'
import { GRADE_BANDS, type GradeBand } from '@/types/domain'
import { SHAPE_FORMS, type AtlasRecord, type PenShape, type ShapeForm, type StudioSpec } from '@/types/studio'

/** 판정용 수업 조건. 특정 회차가 아니라 **학년대 표준 조건**이다 */
export function gateSpec(grade_band: GradeBand, form: ShapeForm): StudioSpec {
  return {
    kind: 'pen3d',
    grade_band,
    student_count: 20,
    // 가장 흔한 특강 길이다. 더 짧은 시수는 강사 쪽 조건이므로 개선 라운드가 맡는다.
    duration_minutes: 90,
    venue: '교실',
    equipment: ['3D펜 20자루', 'PLA 필라멘트', '실리콘 매트'],
    topic: '아틀라스 검증',
    session_id: null,
    form,
  }
}

export type AtlasGate = {
  ok: boolean
  /** 떨어진 조건과 코드. 보고서에 그대로 적는다 */
  failures: string[]
  /** 중등 2D 기준 측정 난이도. 후보 목록에 쓴다 */
  difficulty: number
}

/** 세 학년대 · 2D·3D 전부에서 검증을 통과하는가 */
export function atlasGate(shape: PenShape): AtlasGate {
  const failures: string[] = []

  for (const band of GRADE_BANDS) {
    for (const form of SHAPE_FORMS) {
      const recipe = shapeRecipe(shape, { form, grade_band: band })
      const spec = gateSpec(band, form)
      const { report } = validatePen(buildPattern(recipe, recipe.defaults), spec)
      for (const finding of report.findings) {
        if (finding.severity !== 'error') continue
        failures.push(`${band}·${form}: ${finding.code}`)
      }
    }
  }

  const flat = shapeRecipe(shape, { form: 'flat', grade_band: 'middle' })
  const metrics = penMetrics(buildPattern(flat, flat.defaults), gateSpec('middle', 'flat'))

  return { ok: failures.length === 0, failures, difficulty: metrics.difficulty }
}

/** 조회 id. **같은 단어면 같은 id** 여야 성과 피드백 보정이 쌓인다 (ADR-032) */
export function atlasId(word: string): string {
  return `atlas-${word.trim().replace(/\s+/g, '-')}`
}

export type WordEntry = {
  /** 대표 단어 */
  word: string
  /** 대표 단어 + 동의어 */
  words: string[]
}

/**
 * 단어 목록 파일을 읽는다.
 *
 * 한 줄에 한 단어이고, 쉼표로 동의어를 더한다. `#` 로 시작하는 줄과 빈 줄은 건너뛴다.
 *
 * ```
 * # 동물
 * 코끼리, 아기코끼리
 * 고양이, 냥이
 * ```
 */
export function parseWordList(text: string): WordEntry[] {
  const seen = new Set<string>()
  const out: WordEntry[] = []

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (trimmed === '' || trimmed.startsWith('#')) continue
    const words = trimmed
      .split(',')
      .map((w) => w.trim())
      .filter((w) => w.length >= 2 && w.length <= 20)
    const word = words[0]
    if (!word || seen.has(word)) continue
    seen.add(word)
    out.push({ word, words: [...new Set(words)] })
  }
  return out
}

/** 모양을 아틀라스 항목으로 만든다. 좌표는 `parseShape` 가 정규화한 값 그대로다 */
export function toRecord(input: {
  entry: WordEntry
  shape: PenShape
  summary: string
  difficulty: number
}): AtlasRecord {
  const { entry, shape, summary, difficulty } = input
  return {
    id: atlasId(entry.word),
    words: entry.words,
    summary,
    nominal_difficulty: Math.max(1, Math.min(5, Math.round(difficulty))),
    outline: {
      title: shape.title,
      silhouette: shape.silhouette.points,
      details: shape.details.map((d) => d.points),
      holes: shape.holes.map((h) => h.points),
      hanger: shape.hanger,
      /**
       * 색 영역 (ADR-039). **이것을 빼면 코퍼스 경로의 요점이 저장 단계에서 사라진다** —
       * 사람이 그린 컬러 아트를 들여왔는데 아틀라스에서 꺼내면 흑백이 된다. 한 번 그렇게
       * 적재했다가 `grep -c '"art"' records.ts` 가 0 을 돌려줘서 알았다.
       *
       * `readShape` 가 읽는 형태와 **같은 모양**으로 쓴다 (`points` 키) — 그래야 적재와
       * 조회가 같은 파서를 지난다. 색이 없는 모양은 빈 배열이고, 그때는 지금까지와 같은
       * 흑백 도안이다.
       */
      art: shape.art.map((region) => ({
        color: region.color,
        z: region.z,
        points: region.outline.points,
        holes: region.holes.map((hole) => hole.points),
      })),
    },
  }
}

const HEADER = `/**
 * 검수된 실루엣 목록 (ADR-036). **이 파일은 생성물이다.**
 *
 * 고치는 방법은 하나다:
 *
 *   npm run studio:atlas -- --words scripts/studio/words/animals.txt
 *
 * 스크립트가 단어마다 윤곽 제안을 받아 **세 학년대 · 2D·3D 전부로 검증**하고 이미지 검토
 * (ADR-038)까지 통과한 것만 여기에 쓴다. 손으로 항목을 더하지 말 것 — 검수되지 않은 모양이
 * "검수됨"으로 표시되는 순간 아틀라스가 가진 유일한 값이 사라진다.
 *
 * 좌표는 **0~1 정규화 비율**이다. mm 는 \`lib/studio/pen3d/shape.ts\` 가 만든다.
 */

import type { AtlasRecord } from '@/types/studio'
`

/** 생성 파일 본문. 정렬은 id 순이다 — 두 번 돌려도 같은 파일이 나와야 한다 */
export function emitRecords(records: readonly AtlasRecord[]): string {
  const sorted = [...records].sort((a, b) => a.id.localeCompare(b.id))
  const body = sorted
    .map((record) => {
      const outline = JSON.stringify(record.outline)
      return [
        '  {',
        `    id: ${JSON.stringify(record.id)},`,
        `    words: ${JSON.stringify(record.words)},`,
        `    summary: ${JSON.stringify(record.summary)},`,
        `    nominal_difficulty: ${record.nominal_difficulty},`,
        `    outline: ${outline},`,
        '  },',
      ].join('\n')
    })
    .join('\n')

  if (sorted.length === 0) {
    return `${HEADER}\nexport const ATLAS_RECORDS: readonly AtlasRecord[] = []\n`
  }
  return `${HEADER}\nexport const ATLAS_RECORDS: readonly AtlasRecord[] = [\n${body}\n]\n`
}

/**
 * 생성 파일을 다시 읽는다. `emitRecords` 의 역함수고, 둘의 왕복을 테스트가 고정한다.
 *
 * TS 리터럴은 키에 따옴표가 없으므로 JSON 으로 바꿔 읽는다. 이 파일을 사람이 손으로 고치지
 * 않는다는 전제가 있어서 이 정도로 충분하다 — 모양이 깨지면 빈 목록이 되고, 그러면 스크립트가
 * 덮어쓰기 전에 보고서에서 개수가 틀린 것이 보인다.
 */
export function parseEmitted(source: string): AtlasRecord[] {
  // 타입 표기의 `AtlasRecord[]` 가 먼저 나오므로, **대입 기호 뒤**에서 배열을 찾는다.
  const marker = source.indexOf('ATLAS_RECORDS')
  const equals = marker < 0 ? -1 : source.indexOf('=', marker)
  const start = equals < 0 ? -1 : source.indexOf('[', equals)
  const end = source.lastIndexOf(']')
  if (start < 0 || end < start) return []
  try {
    const list = JSON.parse(
      source
        .slice(start, end + 1)
        .replace(/(\s)(id|words|summary|nominal_difficulty|outline):/g, '$1"$2":')
        .replace(/,(\s*[}\]])/g, '$1'),
    ) as AtlasRecord[]
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

/** 기존 목록과 새 항목을 합친다. 같은 id 는 **새 것이 이긴다** */
export function mergeRecords(
  existing: readonly AtlasRecord[],
  fresh: readonly AtlasRecord[],
): AtlasRecord[] {
  const byId = new Map(existing.map((r) => [r.id, r]))
  for (const record of fresh) byId.set(record.id, record)
  return [...byId.values()]
}
