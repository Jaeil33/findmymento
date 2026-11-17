import { writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { generatePen } from '@/lib/studio/pen3d/pipeline'
import { renderPenSvg } from '@/lib/studio/pen3d/render'
import type { StudioSpec } from '@/types/studio'

const OUT = process.env.STUDIO_SAMPLE_DIR

describe.runIf(OUT)('샘플 SVG 출력 (수동 확인용)', () => {
  it('레시피별로 파일을 쓴다', () => {
    const cases: [string, Partial<StudioSpec>][] = [
      ['keyring-elem-45', { topic: '이름 키링', grade_band: 'elementary', duration_minutes: 45 }],
      ['cube-mid-90', { topic: '정육면체 조명', grade_band: 'middle', duration_minutes: 90 }],
      ['house-mid-90', { topic: '우리 동네 집 모형', grade_band: 'middle', duration_minutes: 90 }],
      ['hex-high-120', { topic: '육각 보관함', grade_band: 'high', duration_minutes: 120 }],
      ['drone-high-120', { topic: '드론 프로펠러 모형', grade_band: 'high', duration_minutes: 120 }],
      ['flower-elem-60', { topic: '꽃 한 송이', grade_band: 'elementary', duration_minutes: 60 }],
      ['sphere-high-90', { topic: '십자 끼움 장식', grade_band: 'high', duration_minutes: 90 }],
      ['pyramid-mid-60', { topic: '사각뿔 피라미드', grade_band: 'middle', duration_minutes: 60 }],
    ]
    const report: string[] = []
    for (const [name, over] of cases) {
      const spec: StudioSpec = {
        kind: 'pen3d',
        grade_band: 'middle',
        student_count: 20,
        duration_minutes: 90,
        venue: '교실',
        equipment: ['3D펜 20자루', 'PLA 필라멘트', '실리콘 매트'],
        topic: '',
        session_id: null,
        ...over,
      }
      const r = generatePen(spec)
      writeFileSync(`${OUT}/${name}.svg`, renderPenSvg(r.artifact, { status: r.status }), 'utf8')
      const m = r.metrics
      report.push(
        [
          name.padEnd(18),
          r.recipe_id.padEnd(14),
          r.status.padEnd(10),
          `부품 ${String(m.part_count).padStart(2)}`,
          `접합 ${String(m.joint_count).padStart(2)}`,
          `선 ${String(Math.round(m.total_stroke_mm)).padStart(5)}mm`,
          `간격 ${m.min_gap_mm ?? '-'}`,
          `특징 ${m.min_segment_mm}mm`,
          `각 ${m.min_angle_deg}°`,
          `난이도 ${m.difficulty}`,
          `예상 ${m.estimated_minutes.toFixed(1)}/${m.available_minutes.toFixed(1)}분`,
          `라운드 ${r.rounds.length}`,
          r.rounds.at(-1)!.findings.map((f) => f.code).join(',') || '-',
        ].join(' | '),
      )
    }
    writeFileSync(`${OUT}/report.txt`, report.join('\n'), 'utf8')
    console.log('\n' + report.join('\n'))
    expect(report).toHaveLength(cases.length)
  })
})
