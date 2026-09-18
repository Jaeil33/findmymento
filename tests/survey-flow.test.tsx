import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { EntryContext } from '@/lib/db/student-gate'

/**
 * 학생 설문 입구.
 *
 * - 기관이 가명코드를 발급하지 않은 회차(예: 파일럿 첫 수업)는 **코드 입력 없이 바로 시작한다.**
 *   교실 화면에 입장 코드 6자리가 떠 있는데 설문이 또 "참여 코드 6자리"를 물으면, 학생은 화면의 숫자를
 *   그대로 넣고 "코드를 찾을 수 없어요"를 본다
 * - 가명코드를 발급한 기관이면 기존 입구(코드 입력 · 코드 없이 참여하기) 그대로다
 * - 설문 제출로 받은 응답 id 를 추천 요청에 실어 보낸다 — 누가 무엇을 봤는지 기록이 응답에 이어진다
 */

const gate = vi.hoisted(() => ({ ctx: null as EntryContext | null }))

vi.mock('@/lib/db/student-gate', () => ({
  loadEntryContext: async () => gate.ctx,
}))

import { SurveyFlow } from '@/components/survey/SurveyFlow'
import StudentEntryPage from '@/app/(student)/s/[code]/page'

const PROPS = {
  entryCode: '123456',
  sessionTitle: '3D 프린터로 내 물건 만들기',
  sessionField: '3D 모델링·프린팅',
  orgName: '파일럿 기관',
  instructorName: '김강사',
}

const CTX: EntryContext = {
  session: {
    id: 'ses-1',
    org_id: 'org-1',
    instructor_id: 'in-1',
    title: PROPS.sessionTitle,
    field: '3D 모델링·프린팅',
    held_on: '2026-09-19',
    closes_at: new Date(Date.now() + 86_400_000).toISOString(),
    status: 'open',
    entry_code: '123456',
    grade_band: 'middle',
    expected_students: 15,
    duration_minutes: 90,
    venue: '교실',
    class_traits: [],
    equipment: [],
  },
  orgName: PROPS.orgName,
  orgType: 'school',
  orgRegionCode: '41210',
  instructorName: PROPS.instructorName,
  closed: false,
  pseudoCodesIssued: false,
}

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('입구 — 가명코드를 발급하지 않은 회차', () => {
  it('코드 입력 없이 "시작하기" 하나만 보여준다', () => {
    render(<SurveyFlow {...PROPS} pseudoCodeEnabled={false} />)

    expect(screen.getByRole('heading', { name: '나에게 맞는 다음 교육 찾기' })).toBeInTheDocument()
    expect(screen.queryByLabelText('참여 코드 6자리')).toBeNull()
    expect(screen.queryByRole('button', { name: '코드 없이 참여하기' })).toBeNull()
    expect(screen.getByRole('button', { name: '시작하기' })).toBeEnabled()
  })

  it('"시작하기"를 누르면 바로 학년 질문으로 간다', () => {
    render(<SurveyFlow {...PROPS} pseudoCodeEnabled={false} />)
    fireEvent.click(screen.getByRole('button', { name: '시작하기' }))
    expect(screen.getByText('몇 학년이에요?')).toBeInTheDocument()
  })
})

describe('입구 — 가명코드를 발급한 기관 (기존 흐름)', () => {
  it('기본값은 코드 입력과 "코드 없이 참여하기"를 그대로 보여준다', () => {
    render(<SurveyFlow {...PROPS} />)
    expect(screen.getByLabelText('참여 코드 6자리')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '코드 없이 참여하기' })).toBeInTheDocument()
  })
})

describe('제출 → 추천', () => {
  it('설문 응답 id 를 추천 요청에 실어 보낸다', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      const body =
        url === '/api/survey'
          ? { ok: true, responseId: 'resp-123', sessionId: 'ses-1' }
          : { ok: true, source: 'rule', stage: 'same', items: [], unmetFields: [] }
      return { json: async () => body } as Response
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<SurveyFlow {...PROPS} pseudoCodeEnabled={false} />)
    fireEvent.click(screen.getByRole('button', { name: '시작하기' }))
    fireEvent.click(screen.getAllByRole('button', { name: '2학년' })[1]!) // 중등 2학년
    fireEvent.click(screen.getByRole('button', { name: '다음' }))
    fireEvent.click(screen.getByRole('button', { name: '좋았어요' }))
    fireEvent.click(screen.getByRole('button', { name: '다음' }))
    fireEvent.click(screen.getByRole('button', { name: '잘 모르겠어요' })) // 선택 문항 없이 끝난다
    fireEvent.click(screen.getByRole('button', { name: '다음' }))
    fireEvent.click(screen.getByRole('button', { name: '3D 모델링·프린팅' }))
    fireEvent.click(screen.getByRole('button', { name: '내 추천 받기' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))

    const [surveyUrl, surveyInit] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(surveyUrl).toBe('/api/survey')
    expect(JSON.parse(String(surveyInit.body))).toMatchObject({ pseudoCode: null, grade: { band: 'middle', year: 2 } })

    const [recommendUrl, recommendInit] = fetchMock.mock.calls[1] as unknown as [string, RequestInit]
    expect(recommendUrl).toBe('/api/recommend')
    expect(JSON.parse(String(recommendInit.body))).toMatchObject({ responseId: 'resp-123' })
  })
})

describe('QR 진입 화면 (/s/[code]) — 게이트 결과로 입구를 고른다', () => {
  it('가명코드를 발급하지 않은 기관이면 코드 입력이 없다', async () => {
    gate.ctx = { ...CTX, pseudoCodesIssued: false }
    render(await StudentEntryPage({ params: Promise.resolve({ code: '123456' }) }))
    expect(screen.queryByLabelText('참여 코드 6자리')).toBeNull()
    expect(screen.getByRole('button', { name: '시작하기' })).toBeInTheDocument()
    expect(screen.getByText(/파일럿 기관/)).toBeInTheDocument()
  })

  it('가명코드를 발급한 기관이면 코드 입력이 있다', async () => {
    gate.ctx = { ...CTX, pseudoCodesIssued: true }
    render(await StudentEntryPage({ params: Promise.resolve({ code: '123456' }) }))
    expect(screen.getByLabelText('참여 코드 6자리')).toBeInTheDocument()
  })

  it('코드를 못 찾으면 404 가 아니라 안내를 보여준다 (E-01)', async () => {
    gate.ctx = null
    render(await StudentEntryPage({ params: Promise.resolve({ code: '000000' }) }))
    expect(screen.getByText('이 코드로는 들어갈 수 없어요')).toBeInTheDocument()
  })

  it('마감된 회차는 마감 안내를 보여준다 (E-17)', async () => {
    gate.ctx = { ...CTX, closed: true }
    render(await StudentEntryPage({ params: Promise.resolve({ code: '123456' }) }))
    expect(screen.getByText('이 수업의 응답 기간이 끝났어요')).toBeInTheDocument()
  })
})
