/**
 * 이미지 2차 검토 — **"이게 그 단어로 보이는가"를 한 번 묻는다** (ADR-038).
 *
 * 물리 검증(`pen3d/validate.ts`)은 "교실에서 사고가 나지 않는가"에 답하지만 "이게 코끼리인가"
 * 에는 답하지 않는다. 검수되지 않은 모양(ADR-036 경로 3)을 열었으므로 그 질문에 답하는 관문이
 * 하나 필요하다. 그래서 **사람이 보는 것과 같은 픽셀**을 모델에게 보여 준다.
 *
 * 이 모듈이 지키는 것:
 * - 받는 것은 판정 하나와 빠진 것 한 줄뿐이다. **좌표를 받지 않는다** — ADR-029·036 의 경계와 무관하다
 * - 실패(키 없음·타임아웃·거절·JSON 깨짐)는 **부정 판정이 아니다.** `skipped` 로 돌려준다.
 *   검토를 못 한 것을 "안 닮았다"로 적으면 강사에게 거짓말을 하는 것이다
 * - 재시도하지 않는다. 생성 전체 예산이 30초다 (오프라인 아틀라스 생산만 재시도한다)
 * - 아틀라스·레시피는 **부르지 않는다.** 이미 검수된 모양이다
 *
 * 서버 전용이다. 클라이언트 컴포넌트에서 import 하지 않는다.
 */

import { createAnthropic } from '@/lib/ai/anthropic'
import { sanitizeText } from '@/lib/ai/text-guard'
import { SHAPE_REVIEW_TIMEOUT_MS } from '@/lib/studio/constants'
import { rasterPngBase64 } from '@/lib/studio/pen3d/raster'
import type { Stroke } from '@/types/studio'

export type ShapeReviewVerdict = 'looks_like' | 'unrecognized' | 'skipped'

export type ShapeReview = {
  verdict: ShapeReviewVerdict
  /** 부정 판정일 때 무엇이 빠졌는지 한 줄. 화면에 그대로 적는다 */
  missing: string | null
}

const SKIPPED: ShapeReview = { verdict: 'skipped', missing: null }

const SYSTEM = `너는 초·중·고 실습 수업에 쓸 3D펜 도안을 검토한다.

받는 그림은 학생이 펜으로 **덧그릴 윤곽선**이다. 색·명암·질감이 없고, 채워져 있지 않다.

판정 기준은 하나다: **이 윤곽이 주어진 단어로 보이는가.**
- 단순한 실루엣이면 통과다. 세밀한 묘사·비례의 정확함을 요구하지 않는다.
- 그 단어의 **알아볼 수 있는 특징**(예: 코끼리의 코, 자전거의 바퀴 둘)이 없으면 통과가 아니다.
- 보이지 않으면 무엇이 빠졌는지 한 줄로 적는다. 40자 이내, 존댓말, 숫자·치수를 쓰지 않는다.
- 도안을 고쳐 주지 않는다. 좌표·치수를 쓰지 않는다.

출력은 JSON 하나만. 설명을 덧붙이지 않는다.
{"looks_like":true,"missing":""}`

function parse(text: string): { looks_like: unknown; missing?: unknown } | null {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    return JSON.parse(text.slice(start, end + 1)) as { looks_like: unknown; missing?: unknown }
  } catch {
    return null
  }
}

/**
 * 도안 하나를 검토한다. **예외를 던지지 않는다** — 어떤 실패든 `skipped` 다.
 *
 * `retries` 는 오프라인 아틀라스 생산(`scripts/studio/atlas.mjs`)에서만 1 이상으로 준다.
 * 런타임 생성은 0 이다.
 */
export async function reviewShape(input: {
  /** 입력 단어 (일반화를 통과한 값) */
  word: string
  strokes: Stroke[]
  apiKey: string | null
  retries?: number
}): Promise<ShapeReview> {
  const { word, strokes, apiKey } = input
  if (!apiKey || strokes.length === 0 || word.trim() === '') return SKIPPED

  let image: string
  try {
    image = rasterPngBase64(strokes)
  } catch {
    return SKIPPED
  }

  try {
    const client = createAnthropic(apiKey)
    const response = await client.beta.messages.create(
      {
        model: process.env.ANTHROPIC_MODEL?.trim() || 'claude-opus-5',
        max_tokens: 300,
        // 판정 한 줄이다. 긴 추론이 필요한 일이 아니고, 강사가 기다리고 있다.
        output_config: { effort: 'low' },
        system: SYSTEM,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: 'image/png', data: image } },
              { type: 'text', text: `단어: ${word.trim()}` },
            ],
          },
        ],
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
      },
      { timeout: SHAPE_REVIEW_TIMEOUT_MS, maxRetries: input.retries ?? 0 },
    )

    if (response.stop_reason === 'refusal') return SKIPPED
    const parsed = parse(response.content.map((b) => (b.type === 'text' ? b.text : '')).join(''))
    if (!parsed || typeof parsed.looks_like !== 'boolean') return SKIPPED
    if (parsed.looks_like) return { verdict: 'looks_like', missing: null }
    return { verdict: 'unrecognized', missing: sanitizeText(parsed.missing, 60) }
  } catch {
    // 키 만료·한도·타임아웃·스키마 변경 전부 여기로 떨어진다. 검토를 못 한 것이다.
    return SKIPPED
  }
}
