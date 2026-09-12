import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Chip } from '@/components/ui/Chip'
import { Input } from '@/components/ui/Input'
import { StatTile } from '@/components/ui/StatTile'

describe('Button', () => {
  it('variant 별로 다른 클래스를 쓴다', () => {
    const { container: primary } = render(<Button>저장</Button>)
    expect(primary.firstElementChild?.className).toContain('bg-point')

    const { container: secondary } = render(<Button variant="secondary">취소</Button>)
    expect(secondary.firstElementChild?.className).toContain('border-line-strong')
    expect(secondary.firstElementChild?.className).not.toContain('bg-point ')

    const { container: text } = render(<Button variant="text">더 보기</Button>)
    expect(text.firstElementChild?.className).toContain('text-sub')
  })

  it('학생 화면 크기는 터치 타깃 48px 이상과 16px 글자를 보장한다', () => {
    const { container } = render(<Button size="student">다음</Button>)
    const cls = container.firstElementChild?.className ?? ''
    expect(cls).toContain('min-h-12')
    expect(cls).toContain('text-base')
    expect(cls).toContain('w-full')
  })

  it('기본 type 은 button 이다 (폼 안에서 의도치 않게 제출되지 않는다)', () => {
    render(<Button>클릭</Button>)
    expect(screen.getByRole('button')).toHaveAttribute('type', 'button')
  })
})

describe('Card', () => {
  it('용도별로 모서리 반경이 다르다 — 전부 같으면 템플릿처럼 보인다', () => {
    const { container: dashboard } = render(<Card variant="dashboard">a</Card>)
    const { container: student } = render(<Card variant="student">b</Card>)
    const { container: tile } = render(<Card variant="tile">c</Card>)

    const radii = [dashboard, student, tile].map((c) => {
      const cls = c.firstElementChild?.className ?? ''
      return cls.match(/rounded-\w+/)?.[0]
    })

    expect(radii).toEqual(['rounded-lg', 'rounded-xl', 'rounded-md'])
    expect(new Set(radii).size).toBe(3)
  })
})

describe('Input', () => {
  it('label 과 input 이 연결된다 (placeholder 를 라벨 대신 쓰지 않는다)', () => {
    render(<Input label="보호자 이름" />)
    const input = screen.getByLabelText('보호자 이름')
    expect(input.tagName).toBe('INPUT')
  })

  it('학생 화면은 16px 이상이다 — iOS 자동 확대 방지', () => {
    render(<Input label="참여 코드" size="student" />)
    expect(screen.getByLabelText('참여 코드').className).toContain('text-base')
  })

  it('필수 표시와 에러 메시지를 접근성 속성으로 연결한다', () => {
    render(<Input label="연락처" required error="형식을 확인해 주세요" />)
    const input = screen.getByLabelText(/연락처/)
    expect(input).toBeRequired()
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText('형식을 확인해 주세요')).toBeInTheDocument()
  })
})

describe('Chip', () => {
  it('selected 상태를 aria-pressed 와 클래스로 모두 표현한다', () => {
    const { rerender } = render(<Chip>드론</Chip>)
    const chip = screen.getByRole('button', { name: '드론' })
    expect(chip).toHaveAttribute('aria-pressed', 'false')
    expect(chip.className).not.toContain('bg-point-bg')

    rerender(<Chip selected>드론</Chip>)
    expect(screen.getByRole('button', { name: '드론' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: '드론' }).className).toContain('bg-point-bg')
  })
})

describe('StatTile', () => {
  it('지표 숫자에는 항상 tabular-nums 가 붙는다', () => {
    const { container } = render(<StatTile label="응답 수" value={24} unit="명" />)
    expect(container.innerHTML).toContain('tabular-nums')
  })

  it('emphasis 는 더 큰 글자를 쓴다 — 후속 의향이 만족도보다 크게 보여야 한다', () => {
    const { container: plain } = render(<StatTile label="만족도" value="4.2" />)
    const { container: emphasised } = render(<StatTile label="후속 의향" value="3.1" emphasis />)

    expect(plain.innerHTML).toContain('text-3xl')
    expect(emphasised.innerHTML).toContain('text-4xl')
  })
})
