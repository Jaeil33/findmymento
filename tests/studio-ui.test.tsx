import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DEMO_SOURCE_LABEL, SOURCE_LABEL } from '@/components/ai/AssistProgress'
import { GenerateResult } from '@/components/studio/GenerateResult'
import { StatusBadge } from '@/components/studio/StatusBadge'
import { StencilPreview } from '@/components/studio/StencilPreview'
import { ValidationReport } from '@/components/studio/ValidationReport'
import { generatePen } from '@/lib/studio/pen3d/pipeline'
import { STUDIO_STATUS_LABEL, type StudioRound, type StudioSpec } from '@/types/studio'

/**
 * 스튜디오 화면 부품.
 *
 * 화면에서 반드시 지켜져야 하는 것 (ADR-030):
 * - 검증 미통과 산출물을 "수업 사용 가능"으로 **보여주지 않는다**
 * - 라운드마다 무엇이 걸렸고 어떻게 고쳤는지를 숫자와 함께 보여준다
 * - 실패 화면에는 **무엇을 바꾸면 되는지**가 같이 있다
 */

const spec = (over: Partial<StudioSpec> = {}): StudioSpec => ({
  kind: 'pen3d',
  grade_band: 'middle',
  student_count: 20,
  duration_minutes: 90,
  venue: '교실',
  equipment: ['3D펜 20자루', 'PLA 필라멘트'],
  topic: '정육면체 조명',
  session_id: null,
  ...over,
})

describe('상태 배지', () => {
  it('상태 문구는 한 곳에서만 만든다', () => {
    for (const status of ['draft', 'validated', 'failed', 'approved'] as const) {
      const { unmount } = render(<StatusBadge status={status} />)
      expect(screen.getByText(STUDIO_STATUS_LABEL[status])).toBeInTheDocument()
      unmount()
    }
  })

  it('검증 실패를 "수업 사용 가능"으로 쓰지 않는다', () => {
    expect(STUDIO_STATUS_LABEL.failed).not.toContain('사용 가능')
    expect(STUDIO_STATUS_LABEL.draft).not.toContain('사용 가능')
    expect(STUDIO_STATUS_LABEL.approved).toContain('사용 가능')
  })
})

describe('검증 결과', () => {
  const rounds: StudioRound[] = [
    {
      round: 1,
      action: 'generated',
      repair: null,
      params: { size: 45, detail: 1, extras: false },
      ok: false,
      findings: [
        {
          code: 'PEN_GAP_TOO_SMALL',
          severity: 'error',
          message: '떨어져 있어야 하는 두 선의 간격이 2.4mm 입니다.',
          measured: 2.4,
          limit: 3,
        },
      ],
    },
    {
      round: 2,
      action: 'repaired',
      repair: '선이 좁거나 짧아서 도안을 51.8mm 로 키웠습니다.',
      params: { size: 51.8, detail: 1, extras: false },
      ok: true,
      findings: [],
    },
  ]

  it('라운드와 개선 문장, 측정값·기준을 그대로 보여준다', () => {
    render(<ValidationReport rounds={rounds} status="validated" gradeBand="middle" />)
    expect(screen.getByText('1차')).toBeInTheDocument()
    expect(screen.getByText('2차')).toBeInTheDocument()
    expect(screen.getByText(/51.8mm 로 키웠습니다/)).toBeInTheDocument()
    expect(screen.getByText('PEN_GAP_TOO_SMALL')).toBeInTheDocument()
    expect(screen.getByText(/측정 2.4 \/ 기준 3/)).toBeInTheDocument()
  })

  it('학년 기준을 숫자로 밝힌다 — 무엇과 비교했는지 보여야 한다', () => {
    render(<ValidationReport rounds={rounds} status="validated" gradeBand="elementary" />)
    expect(screen.getByText(/최소 선 간격 4mm/)).toBeInTheDocument()
    expect(screen.getByText(/부품 상한 6개/)).toBeInTheDocument()
  })

  it('실패 라운드에는 무엇을 바꾸면 되는지가 같이 나온다', () => {
    const failed: StudioRound[] = [
      {
        round: 1,
        action: 'generated',
        repair: null,
        params: { size: 120, detail: 0, extras: false },
        ok: false,
        findings: [
          {
            code: 'PEN_TIME_OVER',
            severity: 'error',
            message: '예상 제작 시간 19분이 가용 시간 4.3분을 넘습니다.',
            measured: 19,
            limit: 4.3,
          },
        ],
      },
    ]
    render(<ValidationReport rounds={failed} status="failed" gradeBand="elementary" />)
    expect(screen.getByText(/수업 시간을 늘리거나/)).toBeInTheDocument()
    // 기준을 낮춰 통과시키지 않는다는 사실을 화면에 적는다.
    expect(screen.getByText(/기준을 낮춰 통과시키지/)).toBeInTheDocument()
  })

  it('경고는 "막음"이 아니라 "주의"로 보여준다', () => {
    const warned: StudioRound[] = [
      {
        round: 1,
        action: 'generated',
        repair: null,
        params: { size: 45, detail: 1, extras: false },
        ok: true,
        findings: [
          {
            code: 'PEN_DIFFICULTY_MISMATCH',
            severity: 'warn',
            message: '산정 난이도 3단계가 권장 범위를 벗어납니다.',
          },
        ],
      },
    ]
    render(<ValidationReport rounds={warned} status="validated" gradeBand="elementary" />)
    expect(screen.getByText('주의')).toBeInTheDocument()
    expect(screen.queryByText('막음')).not.toBeInTheDocument()
  })
})

describe('도안 미리보기', () => {
  const result = generatePen(spec())

  it('A4 SVG 를 이미지로 보여주고 대체 텍스트에 부품 수를 적는다', () => {
    render(<StencilPreview artifact={result.artifact} status="validated" />)
    const img = screen.getByRole('img')
    expect(img.getAttribute('src')).toContain('data:image/svg+xml')
    expect(img.getAttribute('src')).toContain('210mm')
    expect(img.getAttribute('alt')).toMatch(/부품 \d+개/)
  })

  it('인쇄 축척 확인 방법을 안내한다 — 프린터가 축척을 바꾸는 사고가 가장 흔하다', () => {
    render(<StencilPreview artifact={result.artifact} status="validated" />)
    expect(screen.getByText(/50mm 기준선을 자로/)).toBeInTheDocument()
  })

  it('검증 미통과 산출물은 워터마크가 찍혀 있다고 말한다', () => {
    render(<StencilPreview artifact={result.artifact} status="failed" />)
    expect(screen.getByText(/워터마크/)).toBeInTheDocument()
    const img = screen.getByRole('img')
    expect(decodeURIComponent(img.getAttribute('src') ?? '')).toContain('수업에 사용하지 마세요')
  })

  it('통과한 산출물에는 워터마크 문구가 없다', () => {
    render(<StencilPreview artifact={result.artifact} status="approved" />)
    const img = screen.getByRole('img')
    expect(decodeURIComponent(img.getAttribute('src') ?? '')).not.toContain('사용하지 마세요')
  })
})

describe('생성 결과를 그 자리에서 보여주는 화면 (저장이 화면에 닿지 않는 세션)', () => {
  /**
   * 체험·데모 모드의 쓰기는 **서버 메모리**다. 배포(서버리스)에서는 라우트 핸들러와 페이지가
   * 서로 다른 함수로 올라가므로, 라우트가 만든 산출물을 상세 페이지가 영영 읽지 못한다 —
   * 실제로 생성 직후 404 가 났다. 그래서 그 세션에서는 **이동하지 않고 만든 자리에서** 보여준다.
   *
   * 화면 규칙은 상세 페이지와 같아야 한다 (ADR-030): 검증 결과가 도안보다 먼저이고,
   * 통과하지 못한 도안은 인쇄도 내려받기도 열리지 않는다.
   */
  const generated = generatePen(spec())

  const data = (over: Partial<Parameters<typeof GenerateResult>[0]['data']> = {}) => ({
    status: 'validated' as const,
    recipe_id: generated.recipe_id,
    reason: '주제와 가장 가까운 검수된 도안입니다.',
    source: 'rule' as const,
    calibrated: false,
    rounds: generated.rounds,
    artifact: generated.artifact,
    spec: spec(),
    ...over,
  })

  it('검증을 통과하면 인쇄와 SVG 내려받기가 열린다', () => {
    render(<GenerateResult data={data()} demoAi={false} onReset={() => {}} />)
    expect(screen.getByRole('button', { name: /인쇄/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /SVG/ })).toBeInTheDocument()
  })

  it('검증에 실패하면 인쇄도 내려받기도 없다 (ADR-030)', () => {
    render(<GenerateResult data={data({ status: 'failed' })} demoAi={false} onReset={() => {}} />)
    expect(screen.queryByRole('button', { name: /인쇄/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /SVG/ })).not.toBeInTheDocument()
    // 버튼이 없는 화면에 "수업에 쓸 수 있습니다"가 남아 있으면 안 된다.
    expect(screen.queryByText(/수업에 쓸 수 있습니다/)).not.toBeInTheDocument()
  })

  it('검증 결과를 도안보다 먼저 보여준다', () => {
    const { container } = render(
      <GenerateResult data={data()} demoAi={false} onReset={() => {}} />,
    )
    const text = container.textContent ?? ''
    expect(text.indexOf('검증 결과')).toBeGreaterThan(-1)
    expect(text.indexOf('검증 결과')).toBeLessThan(text.indexOf('50mm 기준선'))
  })

  it('이 산출물이 저장되지 않는다는 사실을 화면에 적는다', () => {
    render(<GenerateResult data={data()} demoAi={false} onReset={() => {}} />)
    expect(screen.getByText(/저장되지 않습니다/)).toBeInTheDocument()
  })

  it('시연용 문장을 실제 AI 가 쓴 것처럼 표시하지 않는다 (ADR-025)', () => {
    render(<GenerateResult data={data({ source: 'llm' })} demoAi onReset={() => {}} />)
    expect(screen.getByText(DEMO_SOURCE_LABEL)).toBeInTheDocument()
    expect(screen.queryByText(SOURCE_LABEL.llm)).not.toBeInTheDocument()
  })

  it('수업 조건은 서버가 쓴 값을 그대로 보여준다 — 회차 조건이 우선이다 (ADR-016)', () => {
    render(
      <GenerateResult
        data={data({ spec: spec({ student_count: 24, duration_minutes: 45, venue: '메이커실' }) })}
        demoAi={false}
        onReset={() => {}}
      />,
    )
    // 조건 한 줄은 서버가 쓴 값 그대로다.
    expect(screen.getByText(/24명 · 45분 · 메이커실/)).toBeInTheDocument()
  })
})
