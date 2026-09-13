import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { InquiryAssistDraft } from '@/types/domain'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

import { InquiryForm } from '@/components/inquiry/InquiryForm'

/**
 * 보호자 문의 폼 안의 문의 도우미 (ADR-026).
 *
 * 여기서 반드시 지켜지는 것:
 * - 도우미는 자기 API 라우트만 부르고, 문의를 접수하지 않는다 — 접수는 기존 버튼뿐이다
 * - 결과는 보호자가 확인하고 "폼 채우기"를 눌러야 폼에 들어간다
 * - 프로그램은 공개 상세 링크뿐이다. 연락처 링크가 없다
 * - 아이 이름·학교·생년월일 입력란은 여전히 없다
 * - 초안을 브라우저 저장소에 남기지 않는다
 */

const DRAFT: InquiryAssistDraft = {
  masked: true,
  grade_band: 'middle',
  field: '드론',
  times: ['토요일', '일요일'],
  matches: [
    {
      program_id: 'pg-3',
      title: '드론 조종 기초와 항공 촬영',
      field: '드론',
      format: 'short_course',
      session_count: 8,
      region_label: '광명시',
      instructor_name: '박서연',
      provider_name: '3DNFLY',
    },
  ],
  stage: 'same',
  stage_message: '광명시에서 찾았어요.',
  message:
    '안녕하세요. 중학생 자녀를 둔 보호자입니다. 아이가 드론 분야에 관심이 있어 계속 배울 수 있는 수업을 찾고 있습니다.',
  notices: [
    '초안입니다. 보내기 전에 내용을 직접 확인하고 고쳐 주세요.',
    '적어 주신 내용 중 아이를 알아볼 수 있는 부분(이름·학교·연락처·나이)은 빼고 정리했습니다.',
    '이 칸에 적은 설명은 저장되지 않습니다. 접수되는 것은 아래 폼에 채워진 내용뿐입니다.',
  ],
  source: 'llm',
}

let fetchMock: ReturnType<typeof vi.fn>

function respond(status: number, body: unknown) {
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }),
  )
}

function renderForm(demoAi = false) {
  return render(
    <InquiryForm
      regions={[{ code: '41210', label: '경기 광명시' }]}
      defaultRegion="41210"
      targetType="none"
      targetId={null}
      targetLabel={null}
      demoAi={demoAi}
    />,
  )
}

function assist() {
  return within(screen.getByRole('region', { name: '문의 도우미' }))
}

async function runAssist(text = '중학생 아들이 드론 특강 듣고 영상 찍는 데 푹 빠졌어요') {
  fireEvent.change(assist().getByLabelText('아이 상황 설명'), { target: { value: text } })
  fireEvent.click(assist().getByRole('button', { name: '문의 내용 정리하기' }))
  await assist().findByText(DRAFT.message)
}

beforeEach(() => {
  fetchMock = vi.fn()
  respond(200, { ok: true, source: 'llm', draft: DRAFT })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('보호자 문의 도우미', () => {
  it('폼 안에 도우미가 있고, 아이 이름·학교·생년월일 입력란은 여전히 없다', () => {
    renderForm()
    expect(screen.getByRole('region', { name: '문의 도우미' })).toBeInTheDocument()
    expect(screen.queryByLabelText(/아이 이름|자녀 이름|학교|생년월일/)).toBeNull()
  })

  it('설명이 5자 미만이면 정리하기를 누를 수 없다', () => {
    renderForm()
    const button = assist().getByRole('button', { name: '문의 내용 정리하기' })
    expect(button).toBeDisabled()
    fireEvent.change(assist().getByLabelText('아이 상황 설명'), { target: { value: '드론' } })
    expect(button).toBeDisabled()
  })

  it('자기 API 라우트만 부르고, 폼의 지역·학년대·분야를 함께 보낸다', async () => {
    renderForm()
    await runAssist()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit]
    expect(url).toBe('/api/inquiry-assist')
    expect(JSON.parse(String(init.body))).toEqual({
      situation: '중학생 아들이 드론 특강 듣고 영상 찍는 데 푹 빠졌어요',
      regionCode: '41210',
      gradeBand: null,
      field: null,
    })
  })

  it('정리한 조건·조건에 맞는 프로그램·초안·고지를 보여 준다', async () => {
    renderForm()
    await runAssist()
    const a = assist()
    expect(a.getByText('중등')).toBeInTheDocument()
    expect(a.getByText('드론')).toBeInTheDocument()
    expect(a.getByText('토요일 · 일요일')).toBeInTheDocument()
    expect(a.getByText('광명시에서 찾았어요.')).toBeInTheDocument()
    expect(a.getByRole('link', { name: /드론 조종 기초와 항공 촬영/ })).toHaveAttribute('href', '/programs/pg-3')
    for (const n of DRAFT.notices) expect(a.getByText(n)).toBeInTheDocument()
  })

  it('프로그램 영역에 연락처 링크가 없고 "추천" 배지가 없다', async () => {
    renderForm()
    await runAssist()
    const region = screen.getByRole('region', { name: '문의 도우미' })
    for (const link of within(region).queryAllByRole('link')) {
      expect(link.getAttribute('href') ?? '').not.toMatch(/^(tel|mailto|sms):|^https?:/)
    }
    expect(within(region).queryByText(/추천|인기/)).toBeNull()
  })

  it('"이 내용으로 폼 채우기"를 눌러야 학년대·분야·요청 내용이 채워진다', async () => {
    renderForm()
    await runAssist()

    const message = screen.getByLabelText('요청 내용') as HTMLTextAreaElement
    expect(message.value).toBe('')

    fireEvent.click(assist().getByRole('button', { name: '이 내용으로 폼 채우기' }))

    expect(message.value).toBe(DRAFT.message)
    const form = screen.getByRole('region', { name: '문의 도우미' }).closest('form')!
    const chips = within(form).getAllByRole('button', { pressed: true }).map((b) => b.textContent)
    expect(chips).toEqual(expect.arrayContaining(['중등', '드론']))
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('도우미를 써도 문의는 접수되지 않는다 — /api/inquiry 를 부르지 않는다', async () => {
    renderForm()
    await runAssist()
    fireEvent.click(assist().getByRole('button', { name: '이 내용으로 폼 채우기' }))
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual(['/api/inquiry-assist'])
  })

  it('source 문구 — 시연 모드면 "시연용 AI 문장입니다"', async () => {
    renderForm(true)
    await runAssist()
    expect(assist().getByText('시연용 AI 문장입니다')).toBeInTheDocument()
  })

  it('source 문구 — 실제 LLM 이면 "AI가 문장을 정리했습니다", 규칙이면 조건 문구', async () => {
    renderForm(false)
    await runAssist()
    expect(assist().getByText('AI가 문장을 정리했습니다')).toBeInTheDocument()
  })

  it('규칙 초안이면 AI 문구를 쓰지 않는다', async () => {
    respond(200, { ok: true, source: 'rule', draft: { ...DRAFT, source: 'rule' } })
    renderForm(true)
    await runAssist()
    expect(assist().getByText('적어 주신 조건으로 만들었습니다')).toBeInTheDocument()
    expect(assist().queryByText(/AI/)).toBeNull()
  })

  it('예시 문장 넣기는 시연 모드에서만 보인다', () => {
    const { unmount } = renderForm(false)
    expect(assist().queryByRole('button', { name: '예시 문장 넣기' })).toBeNull()
    unmount()
    renderForm(true)
    fireEvent.click(assist().getByRole('button', { name: '예시 문장 넣기' }))
    expect((assist().getByLabelText('아이 상황 설명') as HTMLTextAreaElement).value.length).toBeGreaterThan(5)
  })

  it('실패하면 안내만 보여 주고, 문의 폼은 그대로 쓸 수 있다', async () => {
    respond(400, { ok: false, field: 'situation', message: '아이 상황을 한두 문장으로 적어 주세요.' })
    renderForm()
    fireEvent.change(assist().getByLabelText('아이 상황 설명'), { target: { value: '드론 드론 드론' } })
    fireEvent.click(assist().getByRole('button', { name: '문의 내용 정리하기' }))
    expect(await assist().findByText('아이 상황을 한두 문장으로 적어 주세요.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '문의 접수하기' })).toBeEnabled()
  })

  it('초안을 브라우저 저장소에 남기지 않는다', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    renderForm()
    await runAssist()
    fireEvent.click(assist().getByRole('button', { name: '이 내용으로 폼 채우기' }))
    await waitFor(() => expect(screen.getByLabelText('요청 내용')).toHaveValue(DRAFT.message))
    expect(setItem).not.toHaveBeenCalled()
  })
})
