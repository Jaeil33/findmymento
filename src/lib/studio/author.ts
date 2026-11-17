/**
 * LLM 저작 레이어 — **레시피 선택과 문장만** (ADR-029).
 *
 * 이 모듈이 할 수 있는 것: 검수된 후보 목록에서 주제에 맞는 레시피 고르기, 수업 제목,
 * 고른 이유 한 줄, 학생이 할 일 몇 줄.
 *
 * 이 모듈이 **절대 하지 않는 것**: 좌표·치수·부품 수·시간 만들기. 그건 생성기와 검증기가
 * 계산한다. 그래서 프롬프트가 "숫자를 쓰지 말라"고 하고, 가드가 숫자가 섞인 문장을 버린다.
 *
 * 실패(키 없음·한도·타임아웃·거절·JSON 파싱 실패·목록 밖 id)는 전부 규칙 선택으로 떨어진다.
 * 화면은 에러를 보지 않는다 (CLAUDE.md 아키텍처 규칙).
 *
 * 서버 전용이다. 클라이언트 컴포넌트에서 import 하지 않는다.
 */

import { createAnthropic, llmKeyForRequest } from '@/lib/ai/client'
import { demoAiEnabled, demoStudioAuthoring } from '@/lib/ai/demo-writer'
import { numbersWithin, sanitizeList, sanitizeText } from '@/lib/ai/guard'
import { GRADE_BAND_LABEL } from '@/types/domain'
import type { StudioCalibration, StudioSpec } from '@/types/studio'

/**
 * 후보의 최소 형태. 3D펜 레시피와 드론 코스 레시피가 **같은 저작 레이어**를 쓴다 —
 * LLM 이 하는 일(목록에서 고르고 문장 쓰기)이 콘텐츠 종류와 무관하기 때문이다.
 */
export type AuthorCandidate = {
  id: string
  title: string
  summary: string
  nominal_difficulty: number
}

export type StudioAuthoring = {
  recipe_id: string
  title: string
  /** 왜 이 레시피인지 한 줄. 화면에 그대로 보여준다 */
  reason: string
  /** 학생이 할 일. 숫자가 없는 문장만 살아남는다 */
  tasks: string[]
  source: 'llm' | 'rule'
}

/** 숫자처럼 보이지만 숫자가 아닌 것들. 가드가 먼저 지운다. */
const NUMBER_IGNORE = ['3D펜', '3D', 'A4', 'LED'] as const

const SYSTEM = `너는 초·중·고 실습 수업(3D펜 도안 · 드론 비행 코드)을 준비하는 강사를 돕는다.

**검수된 레시피 목록에서 하나를 고르고, 문장만 쓴다.**

- recipe_id 는 주어진 후보 목록의 id 중 하나여야 한다. 목록에 없는 모양을 제안하지 않는다.
- 좌표·치수·부품 개수·비행 거리·소요 시간을 쓰지 않는다. 그건 프로그램이 계산한다. **문장에 숫자를 넣지 않는다.**
- title: 수업 제목 한 줄. 24자 이내. 학생이 무엇을 만드는지 보이게 쓴다.
- reason: 왜 이 레시피가 주제에 맞는지 한 문장. 80자 이내.
- tasks: 학생이 할 일 2~4개. 각 60자 이내. 손으로 하는 동작으로 쓴다. 존댓말.
- 연락처·외부 링크·사람 이름·학교명을 쓰지 않는다.
- 과장하지 않는다. "AI가 설계했다" 같은 말을 쓰지 않는다.

출력은 JSON 하나만. 설명을 덧붙이지 않는다.
{"recipe_id":"...","title":"...","reason":"...","tasks":["...","..."]}`

type LlmAuthoring = {
  recipe_id?: unknown
  title?: unknown
  reason?: unknown
  tasks?: unknown
}

function parse(text: string): LlmAuthoring | null {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    return JSON.parse(text.slice(start, end + 1)) as LlmAuthoring
  } catch {
    return null
  }
}

/** 규칙 선택. LLM 이 없거나 실패하면 이게 그대로 화면에 나간다. */
export function ruleAuthoring(spec: StudioSpec, candidates: AuthorCandidate[]): StudioAuthoring {
  const recipe = candidates[0]
  if (!recipe) {
    return {
      recipe_id: '',
      title: spec.topic.trim() || '3D펜 실습',
      reason: '조건에 맞는 검수된 도안이 없습니다.',
      tasks: [],
      source: 'rule',
    }
  }
  const topic = spec.topic.trim()
  return {
    recipe_id: recipe.id,
    title: topic.length > 0 && topic.length <= 24 ? topic : recipe.title,
    reason: `${GRADE_BAND_LABEL[spec.grade_band]} ${spec.duration_minutes}분 수업에 맞는 검수된 도안입니다. ${recipe.summary}`,
    tasks: [],
    source: 'rule',
  }
}

/**
 * LLM 저작. **예외를 던지지 않는다** — 실패하면 규칙 선택을 돌려준다.
 *
 * `tasks` 가 비어 있으면 호출자가 규칙 과제 문장을 쓴다. 그래서 LLM 이 전부 실패해도
 * 산출물의 형태는 달라지지 않는다.
 */
export async function authorContent(
  spec: StudioSpec,
  candidates: AuthorCandidate[],
  calibration?: StudioCalibration | null,
): Promise<StudioAuthoring> {
  const fallback = ruleAuthoring(spec, candidates)
  if (candidates.length === 0) return fallback

  const apiKey = await llmKeyForRequest()
  const hasKey = apiKey !== null
  if (!hasKey && !(await demoAiEnabled())) return fallback

  const payload = {
    주제: spec.topic,
    학년대: GRADE_BAND_LABEL[spec.grade_band],
    인원: spec.student_count,
    시수_분: spec.duration_minutes,
    장소: spec.venue,
    보유_장비: spec.equipment,
    후보: candidates.map((r) => ({
      id: r.id,
      title: r.title,
      summary: r.summary,
      난이도: r.nominal_difficulty,
    })),
    // 같은 레시피·학년대 피드백이 3건 이상 모였을 때만 들어온다 (ADR-032).
    지난_수업_피드백: calibration
      ? {
          표본: calibration.sample_count,
          어려웠다_과반: calibration.lower_difficulty,
          실제_대비_예상_시간_배율: calibration.speed_factor,
        }
      : null,
  }

  try {
    let text: string
    if (hasKey) {
      const client = createAnthropic(apiKey)
      const response = await client.beta.messages.create(
        {
          model: process.env.ANTHROPIC_MODEL?.trim() || 'claude-opus-5',
          max_tokens: 1200,
          // 레시피 선택은 긴 추론이 필요한 일이 아니다. 강사는 생성 버튼 앞에서 기다린다.
          output_config: { effort: 'low' },
          system: SYSTEM,
          messages: [{ role: 'user', content: JSON.stringify(payload) }],
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
        },
        { timeout: 15_000, maxRetries: 1 },
      )
      if (response.stop_reason === 'refusal') return fallback
      text = response.content.map((b) => (b.type === 'text' ? b.text : '')).join('')
    } else {
      text = JSON.stringify(demoStudioAuthoring(payload))
    }

    const parsed = parse(text)
    if (!parsed) return fallback

    // 목록 밖의 id 를 돌려줬다면 문장도 믿지 않는다 — 지시를 무시한 응답이다.
    const recipeId = typeof parsed.recipe_id === 'string' ? parsed.recipe_id.trim() : ''
    if (!candidates.some((r) => r.id === recipeId)) return fallback

    const title = sanitizeText(parsed.title, 40)
    const reason = sanitizeText(parsed.reason, 120)
    const tasks = (sanitizeList(parsed.tasks, 80, 4) ?? []).filter((t) =>
      numbersWithin(t, [], NUMBER_IGNORE),
    )

    return {
      recipe_id: recipeId,
      title: title ?? fallback.title,
      reason: reason ?? fallback.reason,
      tasks,
      source: 'llm',
    }
  } catch {
    // 키 만료·한도·타임아웃·스키마 변경 전부 여기로 떨어진다.
    return fallback
  }
}
