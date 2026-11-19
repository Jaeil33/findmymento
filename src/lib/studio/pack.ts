/**
 * 사전 제작 도안 팩 — **요청마다 LLM 이 쓰던 문장을 미리 써 둔 것** (ADR-044).
 *
 * 왜 있는가: 체험 세션(ADR-033)과 데모 배포에는 LLM 키가 없다. 그 경로의 기존 저작은
 * 시연용 응답(ADR-025)이었고, 그것이 알아듣는 주제는 미리 적어 둔 네 가지(물고기·동물·
 * 새·사람)뿐이었다. 방문자가 "바다에 사는 물고기" 를 적으면 **가장 가까운 것** 이라며
 * 아틀라스 첫 항목(가방)이 나갔다 — 조회가 못 찾으면 목록의 1번을 집어 주는 코드였다.
 *
 * 그래서 조회할 수 있는 목록을 먼저 만든다. 이 파일이 들고 있는 것은 **문장과 조회어뿐이다**:
 *
 * - 모양은 `shape_id` 로 아틀라스(`src/data/atlas/**`)를 가리킨다. 좌표·치수·접합·배치·판정은
 *   그대로 `lib/studio/**` 의 결정론적 코드가 만든다 (CLAUDE.md — LLM 도, 이 팩도 숫자를 만들지 않는다)
 * - 아틀라스에 없는 `shape_id` 를 가리키는 항목은 **조용히 빠진다.** 아틀라스가 바뀌어도
 *   팩이 없는 모양을 가리키지 않고, 테스트가 아틀라스를 비우면 팩도 함께 비는다
 * - `substitute` 인 항목은 **요청한 사물이 아니다.** 화면에 "가장 가까운 ○○" 라고 적힌다
 *
 * 이 팩이 쓰였다는 사실은 화면에 그대로 적힌다 — 미리 써 둔 문장을 실시간 AI 가 쓴 것처럼
 * 보이게 하지 않는다 (ADR-025 와 같은 이유).
 */

import { ATLAS_RECORDS } from '@/data/atlas/records'
import { PACK_ANIMALS } from '@/data/studio/pack/animals'
import { PACK_FOOD } from '@/data/studio/pack/food'
import { PACK_LIFE } from '@/data/studio/pack/life'
import { PACK_NATURE } from '@/data/studio/pack/nature'
import { PACK_PLACES } from '@/data/studio/pack/places'
import { PACK_SYMBOLS } from '@/data/studio/pack/symbols'
import { PACK_VEHICLES } from '@/data/studio/pack/vehicles'
import { atlasShape } from '@/lib/studio/atlas'
import type { AtlasRecord, PackDesign, PenShape } from '@/types/studio'

/**
 * 팩 파일에 적는 형태. `id`·`shape_id`·`words`·`substitute` 는 여기서 만든다 —
 * 손으로 적는 값이 적을수록 어긋날 자리가 적다.
 */
export type PackSource = {
  /** 대표 단어. 기본적으로 같은 이름의 아틀라스 항목(`atlas-<단어>`)을 쓴다 */
  word: string
  /** 조회용 동의어. 대표 단어는 넣지 않는다 */
  aliases: readonly string[]
  /** 분류. 주제에 같은 단어가 없을 때의 마지막 조회 수단이다 */
  tags: readonly string[]
  title: string
  reason: string
  focus: string
  objective: string
  /**
   * 대표 단어와 **다른 사물의 모양**을 쓸 때만 적는다 (`atlas-복어` 처럼 전체 id).
   * 적으면 `substitute: true` 가 되고, 화면이 "가장 가까운 ○○" 라고 적는다.
   */
  shape?: string
}

const SOURCES: readonly PackSource[] = [
  ...PACK_ANIMALS,
  ...PACK_VEHICLES,
  ...PACK_FOOD,
  ...PACK_NATURE,
  ...PACK_LIFE,
  ...PACK_PLACES,
  ...PACK_SYMBOLS,
]

function toDesign(source: PackSource): PackDesign {
  const word = source.word.trim()
  const shapeId = source.shape?.trim() ?? `atlas-${word}`
  return {
    id: `pack-${word}`,
    word,
    words: [word, ...source.aliases.map((a) => a.trim()).filter((a) => a !== '' && a !== word)],
    tags: [...source.tags],
    shape_id: shapeId,
    title: source.title,
    reason: source.reason,
    focus: source.focus,
    objective: source.objective,
    substitute: shapeId !== `atlas-${word}`,
  }
}

/** 아틀라스 id → 항목. 조회는 요청마다 돌므로 한 번만 만든다 */
let recordIndex: Map<string, AtlasRecord> | null = null
let designs: PackDesign[] | null = null

function records(): Map<string, AtlasRecord> {
  if (!recordIndex) recordIndex = new Map(ATLAS_RECORDS.map((r) => [r.id, r]))
  return recordIndex
}

/**
 * 쓸 수 있는 팩 항목. **모양이 아틀라스에 실제로 있는 것만** 돌려준다.
 *
 * 같은 대표 단어가 두 번 적혀 있으면 먼저 적은 쪽만 남는다 — 조회 결과가 파일 순서에 따라
 * 달라지면 "왜 이 모양이 나왔는가" 에 답할 수 없다.
 */
export function packDesigns(): PackDesign[] {
  if (designs) return designs
  const index = records()
  const seen = new Set<string>()
  designs = []
  for (const source of SOURCES) {
    const design = toDesign(source)
    if (seen.has(design.word)) continue
    if (!index.has(design.shape_id)) continue
    seen.add(design.word)
    designs.push(design)
  }
  return designs
}

/** 테스트·스크립트용. 아틀라스를 바꿔 끼운 뒤 캐시를 비운다 */
export function resetPackCache(): void {
  recordIndex = null
  designs = null
}

/** 팩에 적힌 전부. **아틀라스에 없는 모양을 가리키는 항목도 포함한다** — 검증 스크립트가 쓴다 */
export function packSources(): readonly PackSource[] {
  return SOURCES
}

export function packCount(): number {
  return packDesigns().length
}

export function packById(id: string): PackDesign | null {
  return packDesigns().find((d) => d.id === id) ?? null
}

/**
 * 모양 id(`atlas-<단어>`)로 팩 항목을 찾는다.
 *
 * 저작 레이어가 후보 목록에서 **팩 항목을 고른 경우**에 쓴다 — 그때 돌려받는 것은 모양 id
 * 하나뿐이므로, 이 조회가 없으면 그 항목이 들고 있던 주의사항·대체 여부가 사라진다
 * (대체 모양을 고지 없이 내보내는 것이 되므로 ADR-030 위반이다).
 *
 * 같은 모양을 가리키는 항목이 둘 이상이면(대체 항목이 그렇다) **대체가 아닌 쪽**을 돌려준다.
 */
export function packByShapeId(shapeId: string): PackDesign | null {
  const matches = packDesigns().filter((d) => d.shape_id === shapeId)
  return matches.find((d) => !d.substitute) ?? matches[0] ?? null
}

/** 팩 항목의 모양. 아틀라스 항목이 깨져 있으면 `null` */
export function packShape(design: PackDesign): PenShape | null {
  const record = records().get(design.shape_id)
  return record ? atlasShape(record) : null
}

/** 팩 항목의 난이도. 사람이 매긴 값이 아니라 **아틀라스 항목의 값**이다 */
export function packDifficulty(design: PackDesign): number {
  return records().get(design.shape_id)?.nominal_difficulty ?? 3
}
