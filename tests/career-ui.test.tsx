import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CareerCards } from '@/components/survey/CareerCards'

/**
 * 진로 카드 (ADR-027). 학생 결과 화면에서 수업 추천이 0건일 때 보인다.
 * 카드에는 직업·이유·하는 일·관련 학과/자격만 있고, 누를 버튼이 없다 — 학생이 누르는 것 중
 * 강사·기관에게 닿는 것은 하나도 없어야 한다 (CLAUDE.md CRITICAL).
 */
const items = [
  {
    id: 'drone-software',
    title: '드론 소프트웨어 개발자',
    summary: '드론이 정해진 경로를 스스로 날고 장애물을 피하도록 비행 프로그램을 만들어요.',
    related: '컴퓨터공학 · 소프트웨어학 · 전자공학',
    reason: '코딩으로 드론을 움직여 봤으니 비행 프로그램을 만드는 일이 이어져요.',
  },
  {
    id: 'drone-pilot',
    title: '드론 조종사',
    summary: '촬영·측량·방제 같은 현장에서 드론을 안전하게 띄워 맡은 임무를 해내요.',
    related: '드론 조종자 증명(국가 자격) · 항공·드론 관련 학과',
    reason: '직접 날려 본 경험이 현장 조종 일로 이어져요.',
  },
]

describe('CareerCards', () => {
  it('직업 이름·이유·하는 일·관련 학과를 모두 보여준다', () => {
    render(<CareerCards items={items} />)
    for (const c of items) {
      expect(screen.getByRole('heading', { name: c.title })).toBeInTheDocument()
      expect(screen.getByText(c.reason)).toBeInTheDocument()
      expect(screen.getByText(c.summary)).toBeInTheDocument()
      expect(screen.getByText(c.related)).toBeInTheDocument()
    }
  })

  it('누를 수 있는 버튼·링크가 없고 "AI" 배지를 달지 않는다', () => {
    const { container } = render(<CareerCards items={items} />)
    expect(screen.queryAllByRole('button')).toHaveLength(0)
    expect(screen.queryAllByRole('link')).toHaveLength(0)
    expect(container.textContent).not.toMatch(/AI가|인공지능이 분석/)
  })
})
