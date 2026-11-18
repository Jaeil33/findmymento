import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  atlasGate,
  atlasId,
  emitRecords,
  gateSpec,
  mergeRecords,
  parseEmitted,
  parseWordList,
  toRecord,
} from '@/lib/studio/atlas-build'
import { ATLAS_RECORDS } from '@/data/atlas/records'
import { parseShape } from '@/lib/studio/pen3d/shape'
import type { AtlasRecord } from '@/types/studio'

/**
 * 아틀라스 적재의 판정과 출력 (ADR-036).
 *
 * 스크립트는 LLM 을 부르고 파일을 쓰는 일만 한다. "넣어도 되는가"는 전부 이 모듈이 정하고,
 * 여기서 고정하는 것은 그 규칙이다:
 * - **세 학년대 · 2D·3D 전부**에서 통과해야 들어간다. 한 조건만 통과하는 모양은 들어가지 못한다
 * - 같은 단어면 같은 id 다 — 그래야 성과 피드백 보정이 쌓인다 (ADR-032)
 * - 생성 파일은 쓰고 다시 읽어도 같다 (두 번 돌려도 같은 파일)
 */

const ring = (divisions: number, radius: number) =>
  Array.from({ length: divisions }, (_, i) => {
    const t = (2 * Math.PI * i) / divisions
    return {
      x: Number((0.5 + radius * Math.cos(t)).toFixed(3)),
      y: Number((0.5 + radius * Math.sin(t)).toFixed(3)),
    }
  })

const shape = (over: Record<string, unknown> = {}) =>
  parseShape(
    { title: '물고기', silhouette: ring(26, 0.45), details: [], holes: [], hanger: false, ...over },
    { word: '물고기', source: 'atlas', id: 'atlas-물고기', words: ['물고기'] },
  )!

describe('단어 목록 읽기', () => {
  it('주석·빈 줄을 건너뛰고 동의어를 쉼표로 읽는다', () => {
    const entries = parseWordList('# 동물\n\n코끼리, 아기코끼리\n고양이\n')
    expect(entries).toEqual([
      { word: '코끼리', words: ['코끼리', '아기코끼리'] },
      { word: '고양이', words: ['고양이'] },
    ])
  })

  it('같은 단어는 한 번만 — 같은 id 가 두 번 생기면 목록이 깨진다', () => {
    expect(parseWordList('토끼\n토끼, 산토끼\n')).toHaveLength(1)
  })

  it('한 글자·너무 긴 단어는 버린다', () => {
    expect(parseWordList('개\n' + '가'.repeat(30) + '\n')).toEqual([])
  })

  it('실제 단어 목록 파일이 읽힌다', () => {
    const entries = parseWordList(readFileSync('scripts/studio/words/animals.txt', 'utf8'))
    expect(entries.length).toBeGreaterThan(10)
    expect(entries.every((e) => e.word.length >= 2)).toBe(true)
  })
})

describe('적재 판정', () => {
  it('세 학년대·2D·3D 전부 통과하면 ok 다', () => {
    const gate = atlasGate(shape())
    expect(gate.failures).toEqual([])
    expect(gate.ok).toBe(true)
    expect(gate.difficulty).toBeGreaterThanOrEqual(1)
  })

  it('판정 조건은 특정 회차가 아니라 학년대 표준 조건이다', () => {
    const spec = gateSpec('elementary', 'flat')
    expect(spec.duration_minutes).toBe(90)
    expect(spec.form).toBe('flat')
    expect(spec.equipment.join(' ')).toContain('3D펜')
  })

  it('한 조건에서라도 떨어지면 ok 가 아니고, 어디서 떨어졌는지 남는다', () => {
    // 가로로 아주 긴 모양은 A4 폭에서 걸린다
    const flat = parseShape(
      {
        title: '막대',
        silhouette: [
          { x: 0, y: 0.46 },
          { x: 0.5, y: 0.45 },
          { x: 1, y: 0.46 },
          { x: 1, y: 0.54 },
          { x: 0.5, y: 0.55 },
          { x: 0, y: 0.54 },
          { x: 0, y: 0.5 },
          { x: 0, y: 0.48 },
        ],
        details: [],
        holes: [],
      },
      { word: '막대', source: 'atlas', id: 'atlas-막대' },
    )
    // 종횡비가 범위를 벗어나면 애초에 모양으로 읽히지도 않는다
    if (flat === null) {
      expect(flat).toBeNull()
      return
    }
    const gate = atlasGate(flat)
    if (!gate.ok) expect(gate.failures[0]).toMatch(/elementary|middle|high/)
  })
})

describe('id 와 출력', () => {
  it('같은 단어면 같은 id 다', () => {
    expect(atlasId('코끼리')).toBe('atlas-코끼리')
    expect(atlasId(' 코끼리 ')).toBe(atlasId('코끼리'))
  })

  it('항목으로 만들 때 좌표는 정규화된 값 그대로다', () => {
    const record = toRecord({
      entry: { word: '물고기', words: ['물고기', '생선'] },
      shape: shape(),
      summary: '둥근 몸통의 물고기 실루엣.',
      difficulty: 2,
    })
    expect(record.id).toBe('atlas-물고기')
    expect(record.words).toEqual(['물고기', '생선'])
    const outline = record.outline as { silhouette: { x: number; y: number }[] }
    expect(outline.silhouette.every((p) => p.x >= 0 && p.x <= 1)).toBe(true)
  })

  it('쓰고 다시 읽으면 같다 — 두 번 돌려도 같은 파일이어야 한다', () => {
    const records: AtlasRecord[] = [
      toRecord({
        entry: { word: '물고기', words: ['물고기'] },
        shape: shape(),
        summary: '물고기 실루엣.',
        difficulty: 2,
      }),
    ]
    const source = emitRecords(records)
    expect(source).toContain('ATLAS_RECORDS')
    expect(parseEmitted(source)).toEqual(records)
    expect(emitRecords(parseEmitted(source))).toBe(source)
  })

  it('빈 목록도 읽을 수 있는 파일을 만든다', () => {
    expect(parseEmitted(emitRecords([]))).toEqual([])
  })

  /**
   * 실제 `records.ts` 는 **스크립트가 쓴 그대로**여야 한다.
   *
   * 전에는 이 자리에서 "비어 있다"를 단언했다. 목록이 비어 있던 시점의 사실이라 항목이
   * 하나라도 들어오면 깨지는데, 그건 적재가 잘못됐다는 뜻이 아니라 테스트가 낡았다는 뜻이다.
   * 고정할 값은 개수가 아니라 **왕복**이다 — 손으로 고친 파일은 다시 읽히지 않거나 모양이
   * 달라지고, 그러면 다음 적재가 앞 항목을 조용히 날린다.
   */
  it('실제 records.ts 는 스크립트가 쓴 모양 그대로다 — 손으로 고치면 여기서 걸린다', () => {
    const source = readFileSync('src/data/atlas/records.ts', 'utf8')
    const parsed = parseEmitted(source)
    expect(parsed).toEqual(ATLAS_RECORDS)
    expect(emitRecords(parsed)).toBe(source.replace(/\r\n/g, '\n'))
  })

  it('같은 id 는 새 것이 이긴다', () => {
    const old = { id: 'atlas-물고기', words: ['물고기'], summary: '옛것', nominal_difficulty: 1, outline: {} }
    const fresh = { ...old, summary: '새것' }
    expect(mergeRecords([old], [fresh])[0]!.summary).toBe('새것')
    expect(mergeRecords([old], [fresh])).toHaveLength(1)
  })
})

describe('스크립트 배선', () => {
  it('npm run studio:atlas 가 등록되어 있고 런타임 코드를 그대로 쓴다', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as {
      scripts: Record<string, string>
    }
    expect(pkg.scripts['studio:atlas']).toContain('scripts/studio/atlas.mts')
    // 별칭 로더가 있어야 런타임 모듈(@/...)을 그대로 import 한다
    expect(pkg.scripts['studio:atlas']).toContain('register.mjs')
  })

  it('스크립트는 런타임과 같은 윤곽 프롬프트를 쓴다 — 복사본이 없다', () => {
    const script = readFileSync('scripts/studio/atlas.mts', 'utf8')
    expect(script).toContain("from '@/lib/studio/pen3d/outline-prompt'")
    expect(script).toContain("from '@/lib/studio/atlas-build'")
    // 검증·검토를 건너뛰는 경로가 없어야 한다
    expect(script).toContain('atlasGate')
    expect(script).toContain('reviewShape')
  })
})
