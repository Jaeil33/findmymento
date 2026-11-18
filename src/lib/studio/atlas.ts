/**
 * 아틀라스 — **검수된 실루엣 목록**이고 모양 경로의 2순위다 (ADR-036).
 *
 * 레시피(`pen3d/recipes.ts`)와 같은 지위다: 목록 안의 모양은 사람이 봤고, 세 학년대 검증과
 * 이미지 검토를 통과한 것만 들어온다. 그래서 같은 단어가 두 번째로 들어오면 **LLM 호출 없이**
 * 검수된 모양이 나간다 — 쓸수록 싸고 좋아지는 방향이다.
 *
 * 조회는 **결정론이다.** 공백·문장부호를 떼고 단어를 맞춘다. 임베딩·벡터DB를 쓰지 않는다 —
 * "왜 이 모양이 나왔는가"에 답할 수 없는 조회는 이 제품에 넣지 않는다.
 *
 * 목록은 `src/data/atlas/records.ts` 에 있고 **오프라인 스크립트만** 그 파일을 고친다.
 */

import { ATLAS_RECORDS } from '@/data/atlas/records'
import { parseShape } from '@/lib/studio/pen3d/shape'
import type { AtlasRecord, PenShape } from '@/types/studio'

/** 조회용 정규화. 공백·문장부호를 떼고 소문자로 맞춘다 */
export function normalizeWord(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\s·,.!?~"'()[\]{}<>/\\-]/g, '')
    .trim()
}

/**
 * 한 항목이 주제와 얼마나 맞는가. 0 이면 맞지 않은 것이다.
 *
 * 순수 함수로 두고 테스트가 직접 부른다 — 목록이 커져도 조회 규칙은 여기 한 곳이다.
 */
export function scoreRecord(record: AtlasRecord, topic: string): number {
  const text = normalizeWord(topic)
  if (text === '') return 0
  let score = 0
  for (const raw of record.words) {
    const word = normalizeWord(raw)
    if (word.length < 2) continue
    // 주제 안에 단어가 들어 있다 ("바다에 사는 물고기" ← "물고기")
    if (text.includes(word)) score += 2
    // 단어 안에 주제가 들어 있다 ("코끼리" → "아기코끼리")
    else if (word.includes(text)) score += 1
  }
  return score
}

/** 항목을 모양으로 바꾼다. 파일이 깨졌으면 `null` — 깨진 항목은 조용히 빠진다 */
export function atlasShape(record: AtlasRecord): PenShape | null {
  return parseShape(record.outline, {
    word: record.words[0] ?? '',
    source: 'atlas',
    id: record.id,
    words: [...record.words],
  })
}

export function atlasById(id: string): PenShape | null {
  const record = ATLAS_RECORDS.find((r) => r.id === id)
  return record ? atlasShape(record) : null
}

/** 주제에 맞는 항목들. **맞지 않은 항목은 넣지 않는다** — 엉뚱한 모양을 고를 기회를 주지 않는다 */
export function atlasMatches(topic: string): AtlasRecord[] {
  return ATLAS_RECORDS.map((record) => ({ record, score: scoreRecord(record, topic) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.record.id.localeCompare(b.record.id))
    .map((x) => x.record)
}

/**
 * 2D 마지막 수단. 맞는 항목이 없으면 **가장 가까운 것**이라도 돌려준다 (점수 0 허용).
 * 호출자는 "요청한 모양과 다를 수 있다"를 화면에 적어야 한다 (ADR-030).
 */
export function atlasNearest(topic: string): AtlasRecord | null {
  const matched = atlasMatches(topic)
  if (matched.length > 0) return matched[0]!
  return ATLAS_RECORDS.length > 0 ? ATLAS_RECORDS[0]! : null
}

export function atlasCount(): number {
  return ATLAS_RECORDS.length
}
