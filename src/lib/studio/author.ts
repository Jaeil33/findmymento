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

import { createAnthropic, llmKeyForRequest, tourStudioKey } from '@/lib/ai/client'
import { parseComposition, type PenComposition } from '@/lib/studio/pen3d/compose'
import { parseShape } from '@/lib/studio/pen3d/shape'
import { SHAPE_AUTHOR_TIMEOUT_MS, SHAPE_POINTS } from '@/lib/studio/constants'
import { demoAiEnabled, demoStudioAuthoring } from '@/lib/ai/demo-writer'
import { numbersWithin, sanitizeList, sanitizeText } from '@/lib/ai/guard'
import { GRADE_BAND_LABEL } from '@/types/domain'
import type { PenShape, StudioCalibration, StudioSpec } from '@/types/studio'

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

/** LLM 에게 보여주는 조각 한 줄. `pieces.ts` 의 목록을 그대로 줄인 것이다 */
export type AuthorPiece = {
  id: string
  name: string
  summary: string
  can_be_base: boolean
}

export type StudioAuthoring = {
  recipe_id: string
  /**
   * 조각 조합 제안 (ADR-034). 조각 목록을 준 경우에만 생길 수 있고,
   * 목록·범위를 하나라도 벗어나면 `null` 이다 — 그때는 레시피 선택이 그대로 남는다.
   */
  composition?: PenComposition | null
  /**
   * 윤곽 제안 (ADR-036). 0~1 정규화 좌표로 받은 모양이고, **검수되지 않았다.**
   * 범위·개수를 벗어나거나 스스로 교차하면 `null` 이다 — 그때는 목록 선택이 남는다.
   */
  shape?: PenShape | null
  title: string
  /** 왜 이 레시피인지 한 줄. 화면에 그대로 보여준다 */
  reason: string
  /** 학생이 할 일. 숫자가 없는 문장만 살아남는다 */
  tasks: string[]
  source: 'llm' | 'rule'
  /**
   * 이 문장을 **실제로 누가 썼는가.** `source` 는 "저작 레이어를 탔는가"이고, 이쪽은
   * 화면 표시를 정한다 — 시연용 문장을 실제 AI 가 쓴 것처럼 적지 않기 위해서다 (ADR-025).
   */
  engine: 'llm' | 'demo' | 'rule'
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

/**
 * 조각 조합이 가능한 경우에만 덧붙이는 지시 (ADR-034).
 *
 * 비율만 받는다 — mm·좌표·접합 규격은 `compose.ts` 가 정한다. 그래서 여기서 아무리
 * 이상한 비율이 와도 도안의 숫자는 우리가 만든 값이고, 범위를 벗어나면 통째로 버린다.
 */
const COMPOSE_SYSTEM = `

**주제에 맞는 레시피가 없으면 조각을 조합해도 된다.**

- 후보 레시피의 **모양**이 주제와 다르면 조합을 쓴다. 모양이 다른 레시피를 고르면 강사는 엉뚱한 도안을 받는다.
  "물고기"에 육각 상자를 고르지 않는다. 주제가 상자·조명·화분처럼 레시피와 같은 모양일 때만 레시피다.
- mode 를 "compose" 로 하고 composition 을 채운다. 맞는 레시피가 있으면 mode 는 "recipe" 다.
- base 는 주어진 조각 목록에서 can_be_base 가 true 인 id 하나다.
- parts 는 1~4개. 각각 {piece, ratio, quantity, attach}.
  - piece: 조각 목록의 id. **목록 밖의 이름을 지어내지 않는다.**
  - ratio: 몸통 대비 가로 비율. 0.12~1.2 사이의 소수. 이것이 네가 쓰는 유일한 숫자다.
  - quantity: 1~6 사이 정수. 같은 조각이 몇 개 필요한가.
  - attach: top · bottom · front · back · side 중 하나.
  - optional: 없어도 모양이 되는 조각이면 true. 시간이 모자라면 이것부터 빠진다.
- composition.title: 무엇을 만드는지 한 줄. 24자 이내.
- **특정 캐릭터·상표 이름을 쓰지 않는다.** "노란 생쥐 캐릭터" 같은 일반 명사로 쓴다.
- 조각으로 그 모양을 만들 수 없으면 조합하지 말고 레시피를 고른다.

{"mode":"compose","composition":{"title":"...","base":"...","parts":[{"piece":"...","ratio":0.5,"quantity":1,"attach":"back"}]},"recipe_id":"...","title":"...","reason":"...","tasks":["...","..."]}`

/**
 * 윤곽 제안이 가능할 때만 덧붙이는 지시 (ADR-036).
 *
 * 받는 것은 **단위 없는 비율**뿐이다. mm·접합·배치·판정은 코드가 한다. 그래서 모델이 아무리
 * 이상한 윤곽을 보내도 도안의 치수는 우리가 만든 값이고, 범위를 벗어나면 통째로 버린다.
 */
const OUTLINE_SYSTEM = `

**목록에 그 주제의 모양이 없으면 윤곽을 직접 제안한다.**

- mode 를 "outline" 으로 하고 outline 을 채운다. 목록에 같은 모양이 있으면 그것을 고른다.
- silhouette: 바깥 윤곽 한 줄. 점 ${SHAPE_POINTS[0]}~${SHAPE_POINTS[1]}개.
  - 좌표는 **0~1 사이 소수**다. x 는 오른쪽, y 는 **아래쪽**이 커진다.
  - 닫힌 윤곽이다 — 마지막 점에서 첫 점으로 이어진다. 첫 점을 끝에 다시 쓰지 않아도 된다.
  - 점은 한 방향으로 돈다. **선이 스스로 교차하면 제안을 버린다.**
  - 그 단어를 **알아볼 수 있는 특징**을 윤곽에 넣는다 (코끼리의 코, 자전거의 바퀴, 집의 지붕).
  - 뾰족한 끝은 프로그램이 잘라낸다. 바늘처럼 가느다란 돌기를 만들지 않는다.
- details: 내부 선 (눈·귀 경계 등). 각각 닫힌 윤곽이고 **실루엣 안**에 있어야 한다. 없으면 빈 배열.
- holes: 뚫는 구멍. 없으면 빈 배열.
- hanger: 고리를 달 모양이면 true (키링·명패).
- **mm·cm·치수·개수·시간을 쓰지 않는다.** 비율만 쓴다 — 치수는 프로그램이 정한다.
- 특정 캐릭터·상표의 모양을 그리지 않는다. 일반적인 형태로 그린다.

{"mode":"outline","outline":{"title":"...","silhouette":[{"x":0.5,"y":0.02}],"details":[],"holes":[],"hanger":false},"title":"...","reason":"...","tasks":["...","..."]}`

type LlmAuthoring = {
  mode?: unknown
  composition?: unknown
  outline?: unknown
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
      engine: 'rule',
    }
  }
  const topic = spec.topic.trim()
  return {
    recipe_id: recipe.id,
    title: topic.length > 0 && topic.length <= 24 ? topic : recipe.title,
    reason: `${GRADE_BAND_LABEL[spec.grade_band]} ${spec.duration_minutes}분 수업에 맞는 검수된 도안입니다. ${recipe.summary}`,
    tasks: [],
    source: 'rule',
    engine: 'rule',
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
  options?: {
    /** 조각 목록을 주면 조합(ADR-034)을 제안할 수 있다. 3D펜만 해당한다 */
    pieces?: AuthorPiece[]
    /**
     * 체험 세션에서도 실제 LLM 을 쓸 것인가 (ADR-035). **스튜디오 생성 라우트만 준다.**
     * 예산 상한에 걸리면 조용히 시연용 응답으로 떨어진다.
     */
    tourStudio?: boolean
    /**
     * 윤곽 제안 (ADR-036). `allow` 가 true 이고 **일반 키가 있을 때만** 켜진다 —
     * 체험 키로는 제안하지 않는다. 익명 공개 경로이기 때문이다.
     */
    outline?: { allow: boolean; word: string }
  },
): Promise<StudioAuthoring> {
  const fallback = ruleAuthoring(spec, candidates)
  // 2D 는 윤곽 제안이 유일한 경로다. 후보가 비어 있어도 제안은 시도한다 (ADR-036·037).
  if (candidates.length === 0 && options?.outline?.allow !== true) return fallback

  // 체험 키는 예산을 깎으므로 **일반 키가 없을 때만** 본다. 순서를 바꾸면 실 계정이 체험 예산을 쓴다.
  const regularKey = await llmKeyForRequest()
  const apiKey = regularKey ?? (options?.tourStudio ? await tourStudioKey() : null)
  const hasKey = apiKey !== null
  const demoAllowed = await demoAiEnabled()
  if (!hasKey && !demoAllowed) return fallback

  const composable = (options?.pieces?.length ?? 0) > 0
  const outlineWord = options?.outline?.word?.trim() ?? ''
  // 체험 키(regularKey 가 없는 경우)로는 윤곽을 제안하지 않는다 (ADR-036).
  const outlineAllowed =
    options?.outline?.allow === true && outlineWord !== '' && regularKey !== null

  const payload = {
    주제: spec.topic,
    학년대: GRADE_BAND_LABEL[spec.grade_band],
    인원: spec.student_count,
    시수_분: spec.duration_minutes,
    장소: spec.venue,
    보유_장비: spec.equipment,
    조각: composable
      ? options!.pieces!.map((p) => ({
          id: p.id,
          name: p.name,
          summary: p.summary,
          can_be_base: p.can_be_base,
        }))
      : null,
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

  /** 응답 하나를 가드에 통과시킨다. 하나라도 걸리면 `null` — 호출자가 다음 수단으로 간다. */
  function accept(text: string, engine: 'llm' | 'demo'): StudioAuthoring | null {
    const parsed = parse(text)
    if (!parsed) return null

    // 조합 제안 (ADR-034). 목록·범위를 하나라도 벗어나면 `null` 이고, 그때는 레시피로 간다.
    const composition =
      composable && parsed.mode === 'compose' ? parseComposition(parsed.composition) : null

    // 윤곽 제안 (ADR-036). 같은 정책이다 — 어긋나면 통째로 버린다.
    const shape =
      outlineAllowed && parsed.mode === 'outline'
        ? parseShape(parsed.outline, { word: outlineWord, source: 'dsl' })
        : null

    // 목록 밖의 id 를 돌려줬다면 문장도 믿지 않는다 — 지시를 무시한 응답이다.
    const recipeId = typeof parsed.recipe_id === 'string' ? parsed.recipe_id.trim() : ''
    if (!shape && !composition && !candidates.some((r) => r.id === recipeId)) return null

    const title = sanitizeText(parsed.title, 40)
    const reason = sanitizeText(parsed.reason, 120)
    const tasks = (sanitizeList(parsed.tasks, 80, 4) ?? []).filter((t) =>
      numbersWithin(t, [], NUMBER_IGNORE),
    )

    return {
      recipe_id: shape || composition ? '' : recipeId,
      composition,
      shape,
      title: title ?? shape?.title ?? composition?.title ?? fallback.title,
      reason: reason ?? fallback.reason,
      tasks,
      source: 'llm',
      engine,
    }
  }

  if (hasKey) {
    try {
      const client = createAnthropic(apiKey)
      const response = await client.beta.messages.create(
        {
          model: process.env.ANTHROPIC_MODEL?.trim() || 'claude-opus-5',
          max_tokens: outlineAllowed ? 4000 : 1200,
          // 레시피 선택은 긴 추론이 필요한 일이 아니다. 강사는 생성 버튼 앞에서 기다린다.
          output_config: { effort: 'low' },
          system: [SYSTEM, composable ? COMPOSE_SYSTEM : '', outlineAllowed ? OUTLINE_SYSTEM : '']
            .join(''),
          messages: [{ role: 'user', content: JSON.stringify(payload) }],
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
        },
        { timeout: SHAPE_AUTHOR_TIMEOUT_MS, maxRetries: 1 },
      )
      if (response.stop_reason !== 'refusal') {
        const authored = accept(
          response.content.map((b) => (b.type === 'text' ? b.text : '')).join(''),
          'llm',
        )
        if (authored) return authored
      }
    } catch {
      // 키 만료·한도·타임아웃·스키마 변경 전부 여기로 떨어진다. 다음 수단으로 간다.
    }
  }

  /**
   * LLM 이 없거나(데모 배포) 실패했을 때의 시연용 응답 (ADR-025).
   *
   * 체험 세션에서 키가 죽어 있으면 여기로 온다. **규칙 선택보다 시연용 응답이 낫다** —
   * 규칙은 후보 1순위를 그대로 집어 주므로 "물고기"에 이름 키링이 나온다 (ADR-035).
   */
  if (demoAllowed) {
    try {
      const authored = accept(JSON.stringify(demoStudioAuthoring(payload)), 'demo')
      if (authored) return authored
    } catch {
      // 시연용 응답까지 실패하면 규칙이다.
    }
  }

  return fallback
}
