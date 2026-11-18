import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { GenerateForm } from '@/components/studio/GenerateForm'
import { GenerateResult } from '@/components/studio/GenerateResult'
import { generatePen } from '@/lib/studio/pen3d/pipeline'
import { parseShape } from '@/lib/studio/pen3d/shape'
import { SHAPE_FORM_LABEL, type StudioSpec } from '@/types/studio'

/**
 * 2D/3D 선택 칸과 출처 표시 (ADR-036·037).
 *
 * 화면에서 반드시 지켜져야 하는 것:
 * - 강사가 2D·3D 를 고를 수 있고, 고른 값이 **서버로 간다**
 * - 2D 에는 입체 레시피를 고르는 칸이 **없다** (레시피 9종은 전부 입체다)
 * - 검수되지 않은 자동 생성 모양에는 **그 사실이 화면에 적힌다**
 */

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  vi.unstubAllGlobals()
})

const recipes = [{ id: 'cube-lantern', title: '정육면체 조명', difficulty: 3 }]

const form = () => render(<GenerateForm sessions={[]} recipes={recipes} />)

const sentBody = () => JSON.parse((fetchMock.mock.calls[0]![1] as { body: string }).body)

describe('2D/3D 선택', () => {
  it('두 모드가 칩으로 있고 기본값은 2D 다', () => {
    form()
    const flat = screen.getByRole('button', { name: SHAPE_FORM_LABEL.flat })
    const solid = screen.getByRole('button', { name: SHAPE_FORM_LABEL.solid })
    expect(flat).toHaveAttribute('aria-pressed', 'true')
    expect(solid).toHaveAttribute('aria-pressed', 'false')
  })

  it('2D 에는 도안 직접 고르기 칸이 없고, 3D 로 바꾸면 생긴다', () => {
    form()
    expect(screen.queryByLabelText(/도안 직접 고르기/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: SHAPE_FORM_LABEL.solid }))
    expect(screen.getByLabelText(/도안 직접 고르기/)).toBeInTheDocument()
  })

  it('고른 모드가 서버로 간다', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, saved: true, id: 'sc-1', persisted: true }),
    })
    form()
    fireEvent.change(screen.getByLabelText(/교육 주제/), { target: { value: '코끼리' } })
    fireEvent.click(screen.getByRole('button', { name: '도안 만들기' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(sentBody().form).toBe('flat')
    // 2D 에서는 입체 레시피를 보내지 않는다
    expect(sentBody().recipeId).toBeNull()
  })

  it('3D 를 고르면 그대로 간다', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, saved: true, id: 'sc-1', persisted: true }),
    })
    form()
    fireEvent.click(screen.getByRole('button', { name: SHAPE_FORM_LABEL.solid }))
    fireEvent.change(screen.getByLabelText(/교육 주제/), { target: { value: '연필 상자' } })
    fireEvent.click(screen.getByRole('button', { name: '도안 만들기' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(sentBody().form).toBe('solid')
  })
})

describe('출처 표시', () => {
  const spec: StudioSpec = {
    kind: 'pen3d',
    grade_band: 'middle',
    student_count: 20,
    duration_minutes: 90,
    venue: '교실',
    equipment: ['3D펜 20자루', 'PLA 필라멘트'],
    topic: '코끼리',
    session_id: null,
    form: 'flat',
  }

  const shape = parseShape(
    {
      title: '코끼리',
      silhouette: Array.from({ length: 26 }, (_, i) => {
        const t = (2 * Math.PI * i) / 26
        return {
          x: Number((0.5 + 0.45 * Math.cos(t)).toFixed(3)),
          y: Number((0.5 + 0.45 * Math.sin(t)).toFixed(3)),
        }
      }),
      details: [],
      holes: [],
      hanger: false,
    },
    { word: '코끼리', source: 'dsl' },
  )!

  const result = generatePen(spec, { shape })

  const data = (over: Record<string, unknown> = {}) => ({
    status: result.status,
    recipe_id: result.recipe_id,
    reason: '적은 단어대로 윤곽을 만들었습니다.',
    source: 'llm' as const,
    calibrated: false,
    rounds: result.rounds,
    artifact: result.artifact,
    spec,
    ...over,
  })

  it('자동 생성 모양이라고 적는다 — 검수된 것처럼 보이지 않게', () => {
    render(<GenerateResult data={data({ shape_source: 'dsl' })} demoAi={false} onReset={() => {}} />)
    expect(screen.getByText(/자동 생성 모양/)).toBeInTheDocument()
  })

  it('검수된 실루엣은 그렇게 적는다', () => {
    render(
      <GenerateResult data={data({ shape_source: 'atlas' })} demoAi={false} onReset={() => {}} />,
    )
    expect(screen.getByText('검수된 실루엣')).toBeInTheDocument()
  })

  it('가장 가까운 실루엣으로 대체했으면 그 사실을 적는다', () => {
    render(
      <GenerateResult
        data={data({ shape_source: 'atlas', nearest_note: '"코끼리" 와 꼭 맞는 실루엣이 없어 가장 가까운 "곰" 으로 만들었습니다.' })}
        demoAi={false}
        onReset={() => {}}
      />,
    )
    expect(screen.getByText(/가장 가까운/)).toBeInTheDocument()
  })
})
