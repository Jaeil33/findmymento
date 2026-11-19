import { describe, expect, it } from 'vitest'
import { ATLAS_RECORDS } from '@/data/atlas/records'
import { packCount, packDesigns, packSources } from '@/lib/studio/pack'
import { penHarness } from '@/lib/studio/harness/pipeline'
import { retrieveDesign } from '@/lib/studio/harness/retrieve'
import type { StudioSpec } from '@/types/studio'

/**
 * **사전 제작 도안 팩의 데이터 계약** (ADR-044·045).
 *
 * 체험 세션은 이 목록이 전부다 — LLM 이 없으므로 여기 없는 것은 나오지 않는다. 그래서
 * 목록 자체가 지켜야 하는 조건을 코드로 고정한다:
 *
 *   ① 검수된 모양 **전부**에 도달할 수 있다. 아틀라스에만 있고 팩이 가리키지 않는 모양은
 *      방문자가 어떤 단어를 적어도 나오지 않는다 — 329개를 만들어 두고 못 쓰는 것이 된다
 *   ② 조회어가 **겹치지 않는다.** 같은 단어가 두 항목을 가리키면 "왜 이 모양이 나왔는가"에
 *      답할 수 없다 (실측: '비' 가 꿀벌과 우산 양쪽에 있었다)
 *   ③ 항목마다 **수업에서 쓸 문장**이 다 있다 — 먼저 끝낸 학생 과제(`extension`)와
 *      완성 확인(`check`)까지. 비어 있으면 화면이 일반론으로 돌아간다
 *   ④ 그 문장이 **실제로 패키지에 들어간다**
 */

const spec = (topic: string): StudioSpec => ({
  kind: 'pen3d',
  grade_band: 'middle',
  student_count: 20,
  duration_minutes: 90,
  venue: '교실',
  equipment: ['3D펜 20자루', 'PLA 필라멘트'],
  topic,
  session_id: null,
  form: 'flat',
})

describe('① 검수된 모양 전부에 도달할 수 있다', () => {
  it('팩이 아틀라스의 모든 모양을 가리킨다', () => {
    const pointed = new Set(packDesigns().map((d) => d.shape_id))
    const unreachable = ATLAS_RECORDS.filter((r) => !pointed.has(r.id)).map((r) => r.id)
    expect(unreachable).toEqual([])
  })

  it('항목 수가 아틀라스보다 많다 — 대체 모양·동의어 항목이 더 있다', () => {
    expect(packCount()).toBeGreaterThanOrEqual(ATLAS_RECORDS.length)
  })
})

describe('② 조회어가 겹치지 않는다', () => {
  it('대표 단어와 동의어를 모두 합쳐 중복이 없다', () => {
    const seen = new Map<string, string>()
    const collisions: string[] = []
    for (const design of packDesigns()) {
      for (const word of design.words) {
        const owner = seen.get(word)
        if (owner && owner !== design.word) collisions.push(`${word}: ${owner} ↔ ${design.word}`)
        else seen.set(word, design.word)
      }
    }
    expect(collisions).toEqual([])
  })

  it('조회어가 항목 수의 세 배를 넘는다 — 문장형 주제를 받으려면 동의어가 필요하다', () => {
    const terms = packDesigns().reduce((sum, d) => sum + d.words.length, 0)
    expect(terms).toBeGreaterThan(packCount() * 3)
  })

  it('대표 단어로 조회하면 그 항목이 1순위다', () => {
    const misses: string[] = []
    for (const design of packDesigns()) {
      const hit = retrieveDesign(design.word)
      if (hit?.design.word !== design.word) misses.push(`${design.word} → ${hit?.design.word}`)
    }
    expect(misses).toEqual([])
  })
})

describe('③ 항목마다 수업에서 쓸 문장이 다 있다', () => {
  it('제목이 비어 있는 항목이 없다', () => {
    const empty = packSources()
      .filter((source) => source.title.trim().length < 2)
      .map((source) => source.word)
    expect(empty).toEqual([])
  })

  it.each(['reason', 'focus', 'objective', 'extension', 'check'] as const)(
    '%s 가 한 문장을 이루는가 — 비거나 토막이면 화면이 일반론으로 돌아간다',
    (field) => {
      const tooShort = packSources()
        .filter((source) => source[field].trim().length < 12)
        .map((source) => `${source.word}(${source[field].trim().length}자)`)
      expect(tooShort).toEqual([])
    },
  )

  it('문장에 숫자 치수를 적지 않는다 — mm·분은 생성기가 계산한다', () => {
    const offenders = packSources()
      .filter((source) =>
        [source.focus, source.extension, source.check].some((text) => /\d+\s*(mm|분|cm)/.test(text)),
      )
      .map((source) => source.word)
    expect(offenders).toEqual([])
  })

  it('완성 확인은 학생이 스스로 보는 문장이다 — 검사받으라고 적지 않는다', () => {
    const offenders = packSources()
      .filter((source) => /검사받|선생님께 확인|제출/.test(source.check))
      .map((source) => source.word)
    expect(offenders).toEqual([])
  })
})

describe('④ 그 문장이 패키지에 들어간다', () => {
  it('먼저 끝낸 학생 과제가 지도안 메모에 그대로 들어간다', () => {
    const harness = penHarness(spec('자전거'), { authoredBy: 'pack' })
    const design = harness.design!
    expect(design.extension.length).toBeGreaterThan(10)
    expect(harness.package.lesson_notes.join('\n')).toContain(design.extension)
    // 팩 문장이 있으면 일반론을 쓰지 않는다
    expect(harness.package.lesson_notes.join('\n')).not.toContain(
      '먼저 끝낸 학생에게 줄 과제를 하나 준비해 주세요',
    )
  })

  it('완성 확인이 학생 가이드의 마지막 단계로 들어간다', () => {
    const harness = penHarness(spec('공룡'), { authoredBy: 'pack' })
    const last = harness.package.student_guide.at(-1)!
    expect(last.text).toContain('스스로 확인합니다')
    expect(last.text).toContain(harness.design!.check)
  })

  it('팩을 쓰지 않는 경로(명패)에서는 그 자리를 비워 두지 않고 일반 문장을 쓴다', () => {
    const harness = penHarness(spec('읽을수없는주제엑스와이지'))
    expect(harness.design).toBeNull()
    expect(harness.package.lesson_notes.join('\n')).toContain('먼저 끝낸 학생에게 줄 과제')
    expect(harness.package.student_guide.at(-1)!.text).not.toContain('스스로 확인합니다')
  })
})
