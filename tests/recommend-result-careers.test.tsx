import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RecommendResultView, type RecommendResponse } from '@/components/survey/RecommendResultView'

/**
 * 학생 결과 화면 — 수업 추천이 0건이고 진로 카드가 있으면 진로 카드가 화면의 주인공이다 (ADR-027).
 * 진로 카드도 없으면 기존 0건 화면(기록해 뒀어요 + Q&A 유도)을 그대로 쓴다.
 */
const careers = [
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
  {
    id: 'robotics-engineer',
    title: '로봇공학자',
    summary: '센서로 주변을 알아보고 스스로 움직이는 로봇을 설계하고 프로그래밍해요.',
    related: '로봇공학 · 기계공학 · 전자공학',
    reason: '스스로 움직이는 기계를 만드는 일이라 오늘 수업과 닮았어요.',
  },
]

const props = {
  entryCode: '123456',
  pseudoCode: null,
  grade: { band: 'elementary' as const, year: 5 },
  orgName: '부천 소사 청소년센터',
  sessionField: '드론',
}

const zero: RecommendResponse = {
  ok: true,
  source: 'rule',
  stage: 'none',
  stageMessage: '경기 부천시 가까이에서는 아직 찾지 못했어요.',
  unmetFields: [],
  items: [],
}

describe('결과 화면 — 진로 카드', () => {
  it('수업 추천이 0건이고 진로 카드가 있으면 진로 카드를 보여준다', () => {
    render(<RecommendResultView {...props} result={{ ...zero, careers }} />)

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('오늘 수업과 이어지는 진로')
    for (const c of careers) expect(screen.getByRole('heading', { name: c.title })).toBeInTheDocument()
    // 빈 화면 문구·지역 못 찾음 안내·Q&A 대형 버튼은 나오지 않는다.
    expect(screen.queryByText('지금은 바로 들을 수업이 없어요')).toBeNull()
    expect(screen.queryByText(zero.stageMessage!)).toBeNull()
    expect(screen.queryByRole('link', { name: '지역 강사에게 직접 물어보기' })).toBeNull()
    // 다음 행동은 교실 안의 선생님에게 말하는 것이다.
    expect(screen.getByText(/부천 소사 청소년센터 선생님/)).toBeInTheDocument()
  })

  it('진로 카드도 없으면 기존 0건 화면을 그대로 쓴다', () => {
    render(<RecommendResultView {...props} result={{ ...zero, careers: [] }} />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('지금은 바로 들을 수업이 없어요')
    expect(screen.getByRole('link', { name: '지역 강사에게 직접 물어보기' })).toBeInTheDocument()
  })

  it('추천 응답을 못 받았어도(null) 기존 0건 화면이 나온다', () => {
    render(<RecommendResultView {...props} result={null} />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('지금은 바로 들을 수업이 없어요')
  })
})
