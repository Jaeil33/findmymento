/**
 * 검색 — **결정론적 문자열 일치다. 벡터가 아니다** (ADR-044 · 개발명세서 §3).
 *
 * 왜 벡터를 쓰지 않는가: 이 목록은 수백 개 규모이고, 강사에게 답해야 하는 질문은 "왜 이
 * 모양이 나왔는가" 다. 임베딩은 그 질문에 답하지 못한다. 그래서 찾은 방법(`matched_by`)과
 * 점수를 결과에 싣고, 화면·리포트가 그대로 보여 준다.
 *
 * **검색은 판정기가 아니다.** 여기서 고른 것이 임계값을 바꾸거나 검증을 건너뛰게 하지
 * 않는다 — 돌려주는 것은 모양과 문장이고, 치수·판정은 그대로 `lib/studio/**` 가 한다.
 *
 * 미적중이면 `null` 이다. **목록의 1번을 집어 주지 않는다** — 그것이 "바다에 사는 물고기"
 * 에 가방 도안이 나가던 경로였다. 미적중은 호출자가 폴백 사슬(ADR-042)로 넘긴다.
 */

import { normalizeWord } from '@/lib/studio/atlas'
import {
  RETRIEVAL_MAX_CANDIDATES,
  RETRIEVAL_MIN_SCORE,
  RETRIEVAL_SCORE,
} from '@/lib/studio/constants'
import { packDesigns, packDifficulty, packShape } from '@/lib/studio/pack'
import type { Evidence, PackDesign, PenShape } from '@/types/studio'

/** CC-BY 4.0 은 저작자 표시가 **사용 조건**이다 (ADR-041). 도안 범례와 리포트에 함께 싣는다 */
export const ATLAS_LICENSE = 'CC-BY 4.0'
export const ATLAS_ATTRIBUTION = 'Twemoji (CC-BY 4.0)'

export type MatchedBy = Evidence['matched_by']

export type Retrieved = {
  design: PackDesign
  /** 점수. 어떻게 찾았는지와 함께 리포트에 적힌다 */
  score: number
  matched_by: MatchedBy
  /**
   * 맞은 단어가 주제에서 **몇 번째 글자에서** 시작하는가. 같은 점수의 순위를 가른다 —
   * "곰 모양 열쇠고리" 에서 만들 것은 곰이고 열쇠고리는 형태다. 한국어는 꾸미는 말이
   * 앞에 오므로, 먼저 나온 낱말이 만들 사물일 때가 훨씬 많다.
   */
  position: number
  /** 아틀라스 항목의 난이도. 후보 정렬에 쓴다 */
  difficulty: number
}

/** 주제를 낱말로 쪼갠다. 조회는 공백·문장부호만 본다 — 형태소 분석을 넣지 않는다 */
function tokens(topic: string): string[] {
  return topic
    .split(/[\s·,.!?~"'()[\]{}<>/\-]+/)
    .map((t) => normalizeWord(t))
    .filter((t) => t !== '')
}

export type Score = { score: number; matched_by: MatchedBy; position: number }

/** 한 항목이 주제와 얼마나 맞는가. 0 이면 쓰지 않는다 */
export function scoreDesign(design: PackDesign, topic: string): Score {
  const text = normalizeWord(topic)
  if (text === '') return { score: 0, matched_by: 'tag', position: 0 }
  const parts = tokens(topic)

  let best: Score = { score: 0, matched_by: 'tag', position: text.length }
  const take = (score: number, matched_by: MatchedBy, position: number) => {
    if (score > best.score) best = { score, matched_by, position }
  }

  design.words.forEach((raw, index) => {
    const word = normalizeWord(raw)
    if (word === '') return
    const isPrimary = index === 0
    const at = text.indexOf(word)

    // 주제 전체가 그 단어다. **한 글자 단어도 여기서 걸린다** ("곰")
    if (text === word) {
      take(
        isPrimary ? RETRIEVAL_SCORE.exact : RETRIEVAL_SCORE.alias,
        isPrimary ? 'exact' : 'alias',
        0,
      )
      return
    }
    // 낱말로 떨어져 있다 ("곰 모양 열쇠고리" ← "곰"). 한 글자 단어는 이 경로뿐이다.
    if (parts.includes(word)) {
      take(RETRIEVAL_SCORE.token, isPrimary ? 'phrase' : 'alias', at < 0 ? 0 : at)
      return
    }
    // 두 글자 이상만 부분 문자열로 찾는다 — "소" 가 "소방차" 에 걸리는 것을 막는다.
    if (word.length < 2) return
    if (at >= 0) take(RETRIEVAL_SCORE.phrase, 'phrase', at)
    // 단어 안에 주제가 들어 있다 ("곰인형" ← "곰인"). 약한 근거다.
    else if (word.includes(text) && text.length >= 2) take(RETRIEVAL_SCORE.partial, 'partial', 0)
  })

  for (const raw of design.tags) {
    const tag = normalizeWord(raw)
    if (tag.length < 2) continue
    const at = text.indexOf(tag)
    if (at >= 0) take(RETRIEVAL_SCORE.tag, 'tag', at)
  }

  return best
}

/**
 * 주제에 맞는 항목들. **맞지 않은 항목은 넣지 않는다.**
 *
 * 정렬은 점수 → 난이도(낮은 쪽) → id 다. 같은 점수에서 쉬운 쪽을 먼저 주는 이유는,
 * 어려운 모양이 시간에 걸려 개선 라운드를 쓰는 일이 더 흔하기 때문이다.
 */
export function retrieveCandidates(topic: string, limit = RETRIEVAL_MAX_CANDIDATES): Retrieved[] {
  const scored: Retrieved[] = []
  for (const design of packDesigns()) {
    const { score, matched_by, position } = scoreDesign(design, topic)
    if (score < RETRIEVAL_MIN_SCORE) continue
    scored.push({ design, score, matched_by, position, difficulty: packDifficulty(design) })
  }
  return scored
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.position - b.position ||
        a.difficulty - b.difficulty ||
        a.design.id.localeCompare(b.design.id),
    )
    .slice(0, Math.max(0, limit))
}

export type RetrievedShape = Retrieved & {
  shape: PenShape
  evidence: Evidence
}

/**
 * 1순위 하나를 모양까지 만들어 돌려준다. **미적중이면 `null`** 이고, 호출자는 폴백
 * 사슬(ADR-042)로 내려간다 — 엉뚱한 모양을 "검색 결과" 로 내보내지 않는다.
 */
export function retrieveDesign(topic: string): RetrievedShape | null {
  for (const candidate of retrieveCandidates(topic)) {
    const shape = packShape(candidate.design)
    // 아틀라스 항목이 깨져 있으면 다음 후보로 넘어간다. 조용히 실패하지 않는다.
    if (!shape) continue
    return { ...candidate, shape, evidence: evidenceOf(candidate) }
  }
  return null
}

export function evidenceOf(retrieved: Retrieved): Evidence {
  return {
    source_id: retrieved.design.shape_id,
    matched_by: retrieved.matched_by,
    trust_level: retrieved.design.substitute ? 'substitute' : 'reviewed',
    license: ATLAS_LICENSE,
    attribution: ATLAS_ATTRIBUTION,
  }
}

/** 요청한 모양이 아니라는 **고지 문구**. 화면과 리포트가 같은 문장을 쓴다 (ADR-030) */
export function substituteNote(topic: string, design: PackDesign): string {
  return `"${topic.trim()}" 과 꼭 맞는 검수된 실루엣이 없어 가장 가까운 "${design.shape_id.replace(/^atlas-/, '')}" 로 만들었습니다. 요청한 모양과 다를 수 있습니다.`
}
