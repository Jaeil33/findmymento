import { describe, expect, it } from 'vitest'
import {
  atlasById,
  atlasMatches,
  atlasNearest,
  atlasShape,
  normalizeWord,
  scoreRecord,
} from '@/lib/studio/atlas'
import { ATLAS_RECORDS } from '@/data/atlas/records'
import { buildPattern } from '@/lib/studio/pen3d/recipes'
import { generatePen } from '@/lib/studio/pen3d/pipeline'
import { shapeRecipe } from '@/lib/studio/pen3d/shape'
import { validatePen } from '@/lib/studio/pen3d/validate'
import { GRADE_BANDS } from '@/types/domain'
import type { AtlasRecord, ShapeForm, StudioSpec } from '@/types/studio'

/**
 * 아틀라스 — **검수된 실루엣 목록** (ADR-036).
 *
 * 이 파일의 마지막 블록이 실질적인 품질 게이트다: 목록에 있는 모양은 **세 학년대 · 2D·3D
 * 전부에서 검증을 통과해야 한다.** 통과하지 못하는 항목이 목록에 있으면 강사는 "검수됨"
 * 표시를 믿고 교실에 들고 갔다가 실패한다.
 */

const ring = (divisions: number, radius: number) =>
  Array.from({ length: divisions }, (_, i) => {
    const t = (2 * Math.PI * i) / divisions
    return {
      x: Number((0.5 + radius * Math.cos(t)).toFixed(3)),
      y: Number((0.5 + radius * Math.sin(t)).toFixed(3)),
    }
  })

const sample: AtlasRecord = {
  id: 'atlas-fish',
  words: ['물고기', '생선', '열대어'],
  summary: '둥근 몸통에 꼬리가 달린 물고기 실루엣.',
  nominal_difficulty: 2,
  outline: { title: '물고기', silhouette: ring(26, 0.45), details: [], holes: [], hanger: false },
}

function spec(grade_band: StudioSpec['grade_band'], form: ShapeForm): StudioSpec {
  return {
    kind: 'pen3d',
    grade_band,
    student_count: 20,
    duration_minutes: 90,
    venue: '교실',
    equipment: ['3D펜 20자루', 'PLA 필라멘트'],
    topic: '검증',
    session_id: null,
    form,
  }
}

describe('조회 규칙 — 결정론이다', () => {
  it('공백·문장부호를 떼고 맞춘다', () => {
    expect(normalizeWord(' 코끼리! ')).toBe('코끼리')
    expect(normalizeWord('T-rex')).toBe('trex')
  })

  it('주제 안에 단어가 있으면 맞은 것이다', () => {
    expect(scoreRecord(sample, '바다에 사는 물고기')).toBeGreaterThan(0)
    expect(scoreRecord(sample, '열대어 만들기')).toBeGreaterThan(0)
  })

  it('맞지 않으면 0 이다 — 엉뚱한 모양을 고를 기회를 주지 않는다', () => {
    expect(scoreRecord(sample, '에펠탑')).toBe(0)
    expect(scoreRecord(sample, '')).toBe(0)
  })

  it('한 글자 단어는 세지 않는다 — 아무 주제에나 걸린다', () => {
    expect(scoreRecord({ ...sample, words: ['어'] }, '어린이 공원')).toBe(0)
  })

  it('항목을 모양으로 바꾼다 — 검수됨으로 들어온다', () => {
    const shape = atlasShape(sample)
    expect(shape).not.toBeNull()
    expect(shape!.reviewed).toBe(true)
    expect(shape!.id).toBe('atlas-fish')
    expect(shape!.words).toContain('열대어')
  })

  it('깨진 항목은 조용히 빠진다 — 목록 전체가 죽지 않는다', () => {
    expect(atlasShape({ ...sample, outline: { title: '물고기' } })).toBeNull()
  })
})

describe('목록 조회', () => {
  it('목록에 없는 id 는 null 이다', () => {
    expect(atlasById('atlas-pikachu')).toBeNull()
  })

  it('맞는 항목이 없으면 빈 목록이다', () => {
    expect(atlasMatches('존재하지않는주제어')).toEqual([])
  })

  it('목록이 비어 있으면 가장 가까운 것도 없다', () => {
    const nearest = atlasNearest('코끼리')
    if (ATLAS_RECORDS.length === 0) expect(nearest).toBeNull()
    else expect(nearest).not.toBeNull()
  })
})

describe('목록의 모든 모양이 교실에서 쓸 수 있는가', () => {
  it('id 가 유일하고 atlas- 로 시작한다', () => {
    const ids = ATLAS_RECORDS.map((r) => r.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const record of ATLAS_RECORDS) {
      expect(record.id.startsWith('atlas-')).toBe(true)
      expect(record.words.length).toBeGreaterThan(0)
      expect(record.summary.length).toBeGreaterThan(0)
    }
  })

  /**
   * 목록이 빈 동안에는 통과하지만, 항목이 생기는 순간 이 검사가 품질 게이트가 된다.
   * 떨어지는 항목은 목록에서 빼고 스크립트를 다시 돌린다 — **임계값을 낮추지 않는다.**
   */
  /**
   * 목록이 커지면 이 검사도 비례해서 커진다 — 항목 × 3학년대 × 2형태 전수다. 코퍼스 적재로
   * 23 → 93 개가 되면서 기본 5초를 넘겼고, 도안이 종이를 꽉 채우게 된 뒤(ADR-045) 다시
   * 네 배가 됐다(실측 155초: 보정 101초 + 검증 54초 — 치수가 커지면 점이 늘고 간격 검사가
   * 점 수의 제곱으로 늘어난다). **표본을 줄이지 않는다** — 전수로 보는 것이 이 검사의
   * 전부이고, 하나라도 빠지면 그 항목이 교실에서 터진다. 시간을 늘린다.
   *
   * 같은 범위를 `npm run studio:pack` 이 오프라인에서 한 번 더 본다(팩이 아틀라스 329개를
   * 전부 가리키므로 범위가 같다). 그쪽은 개선 라운드까지 포함해 돌리고 종료 코드로 알린다.
   *
   * 보는 것이 두 층이다 (ADR-045 — 기본 치수가 종이에서 역산되는 값이 된 뒤로):
   *
   *   ① **종이·겹침·시간·접합·부품 수는 기본 치수에서 반드시 맞는다.** 치수 탐색이 고칠 수
   *      있는 것은 간격·선분·내각뿐이므로, 나머지가 걸리면 그 모양은 목록에서 빼야 한다
   *   ② 간격·선분·내각이 상한에서 걸리는 모양은 **런타임 경로에서 통과해야 한다.** 생성기는
   *      1라운드 치수를 내려가며 찾고(결정론), 그래도 안 되면 개선 라운드가 받는다
   *
   * **임계값은 어느 쪽에서도 낮추지 않는다.** 판정은 `validatePen` 그대로다.
   */
  const FIT_CODES = ['PEN_GAP_TOO_SMALL', 'PEN_SEGMENT_TOO_SHORT', 'PEN_ANGLE_TOO_SHARP']

  const COMBOS = GRADE_BANDS.flatMap((band) =>
    (['flat', 'solid'] as ShapeForm[]).map((form) => ({ band, form })),
  )

  /**
   * **조건 하나당 테스트 하나이고, 중간중간 이벤트 루프를 놓아 준다.** 전수 검사가 수십 초
   * 동안 루프를 붙잡으면 vitest 워커가 진행 상황을 보고하지 못해 런 전체가 깨진다
   * (`Timeout calling "onTaskUpdate"`). 검사 범위는 그대로 전수다.
   */
  it.each(COMBOS)(
    '$band · $form — 목록 전부가 쓸 수 있다',
    async ({ band, form }) => {
      const needsFit: { record: AtlasRecord; codes: string[] }[] = []

      for (const [index, record] of ATLAS_RECORDS.entries()) {
        if (index % 40 === 39) await new Promise((resolve) => setTimeout(resolve, 0))
        const shape = atlasShape(record)
        expect(shape, `${record.id} 의 윤곽을 읽을 수 없습니다`).not.toBeNull()

        const recipe = shapeRecipe(shape!, { form, grade_band: band })
        const { report } = validatePen(buildPattern(recipe, recipe.defaults), spec(band, form))
        const codes = report.findings.filter((f) => f.severity === 'error').map((f) => f.code)
        // ① 치수 탐색으로 풀 수 없는 항목은 기본 치수에서 깨끗해야 한다
        expect(
          codes.filter((code) => !FIT_CODES.includes(code)),
          `${record.id} · ${band} · ${form}`,
        ).toEqual([])
        if (codes.length > 0) needsFit.push({ record, codes })
      }

      // 간격에 걸리는 모양이 흔하면 치수 목표가 잘못 잡힌 것이다 — 목록의 5% 를 넘지 않는다
      expect(needsFit.length).toBeLessThan(ATLAS_RECORDS.length * 0.05)

      // ② 그 모양들이 런타임 경로에서 통과한다
      for (const { record, codes } of needsFit) {
        const run = generatePen(spec(band, form), { shape: atlasShape(record)! })
        expect(run.status, `${record.id} · ${band} · ${form} (${codes.join(', ')})`).toBe(
          'validated',
        )
      }
    },
    120_000,
  )
})
