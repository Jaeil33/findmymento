import { writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseComposition } from '@/lib/studio/pen3d/compose'
import { generatePen } from '@/lib/studio/pen3d/pipeline'
import { renderPenSvg } from '@/lib/studio/pen3d/render'
import type { StudioSpec } from '@/types/studio'

const OUT = process.env.STUDIO_SAMPLE_DIR

describe.runIf(OUT)('조합 샘플 (수동 확인용)', () => {
  it('파일을 쓴다', () => {
    const cases: [string, unknown, Partial<StudioSpec>][] = [
      [
        'fish',
        {
          title: '물고기',
          base: 'oval-body',
          parts: [
            { piece: 'tail-trapezoid', ratio: 0.5, quantity: 1, attach: 'back' },
            { piece: 'fin-triangle', ratio: 0.35, quantity: 2, attach: 'top' },
          ],
        },
        { topic: '물고기 만들기' },
      ],
      [
        'rabbit',
        {
          title: '토끼',
          base: 'round-body',
          parts: [
            { piece: 'ear-pointed', ratio: 0.4, quantity: 2, attach: 'top' },
            { piece: 'limb-bar', ratio: 0.28, quantity: 2, attach: 'bottom', optional: true },
          ],
        },
        { topic: '토끼 만들기', grade_band: 'elementary', duration_minutes: 60 },
      ],
    ]
    const report: string[] = []
    for (const [name, raw, over] of cases) {
      const spec: StudioSpec = {
        kind: 'pen3d',
        grade_band: 'middle',
        student_count: 20,
        duration_minutes: 90,
        venue: '교실',
        equipment: ['3D펜 20자루', 'PLA 필라멘트'],
        topic: '물고기',
        session_id: null,
        ...over,
      }
      const composition = parseComposition(raw)
      expect(composition).not.toBeNull()
      const result = generatePen(spec, { composition })
      writeFileSync(`${OUT}/${name}.svg`, renderPenSvg(result.artifact, { status: result.status }), 'utf8')
      report.push(`${name}: ${result.status} [${result.report.findings.map((f) => `${f.code}:${f.message}`).join(' | ')}] · 부품 ${result.metrics.part_count} · ${Math.round(result.metrics.estimated_minutes)}분 · 라운드 ${result.rounds.length}`)
    }
    writeFileSync(`${OUT}/compose-report.txt`, report.join('\n'), 'utf8')
    console.log(report.join('\n'))
  })
})
