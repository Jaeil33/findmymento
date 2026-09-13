import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import * as demo from '@/data/demo'
import type { Actor } from '@/lib/auth/actor'
import type { Dataset } from '@/lib/db/dataset'
import { ruleResultReport } from '@/lib/ai/result-report'
import { ruleFollowupPlan } from '@/lib/ai/followup-plan'
import { ruleDebrief } from '@/lib/ai/session-debrief'
import { debriefToText, followupMessageToText, resultReportToText } from '@/lib/report/text'
import { AssistProgress } from '@/components/ai/AssistProgress'
import { CopyButton } from '@/components/ai/CopyButton'
import { ResultReportAssist } from '@/components/report/ResultReportAssist'
import { FollowupPlanAssist } from '@/components/report/FollowupPlanAssist'
import { SessionDebriefAssist } from '@/components/lesson/SessionDebriefAssist'
import OrgHomePage from '@/app/(org)/org/page'
import type { FollowupPlanDraft, ResultReportDraft, SessionDebriefDraft } from '@/types/domain'

/**
 * 수업 후 AI 3종 화면 (ADR-024).
 *
 * 여기서 반드시 지켜지는 것:
 * - 버튼·source·단계 문구가 정해진 문장 그대로다. "AI가 분석했습니다" 같은 과장이 없다
 * - 초안 고지문이 항상 보이고, 초안을 브라우저 저장소에 남기지 않는다
 * - 후속 과정 제안의 강사 후보는 공개 프로필 링크뿐이고, 섭외 요청을 자동으로 보내지 않는다
 * - 화면·복사본 어디에도 연락처 링크가 없다
 * - 학생·보호자 라우트에서 이 화면을 쓰지 않는다
 *
 * 초안은 step 2~4 의 규칙 함수로 만든다. fetch 는 가짜로 바꿔 실제 라우트·LLM 을 부르지 않는다.
 */

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: vi.fn() }
  },
}))

const state = vi.hoisted(() => ({ actor: null as Actor | null }))

vi.mock('@/lib/auth/actor', () => ({
  getActor: async () => state.actor,
}))

vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`)
  },
  notFound: () => {
    throw new Error('notFound')
  },
  usePathname: () => '/org',
}))

const ds: Dataset = {
  organizations: demo.organizations,
  orgMembers: demo.orgMembers,
  providers: demo.providers,
  instructors: demo.instructors,
  instructorVerifications: demo.instructorVerifications,
  programs: demo.programs,
  lectureSessions: demo.lectureSessions,
  lessonPlans: demo.lessonPlans,
  students: demo.students,
  surveyResponses: demo.surveyResponses,
  interests: demo.interests,
  consents: demo.consents,
  recruitmentRequests: demo.recruitmentRequests,
  qnaQuestions: demo.qnaQuestions,
  qnaAnswers: demo.qnaAnswers,
  inquiries: demo.inquiries,
  invitations: demo.invitations,
}

// ls-1: 응답 24건 · 배정 강사 있음 / ls-3: 응답 0건 · 미배정 (E-23·E-24)
const report = ruleResultReport(ds, 'ls-1')!
const smallReport = ruleResultReport(ds, 'ls-3')!
const followup = ruleFollowupPlan(ds, 'ls-1')!
const followupSmall = ruleFollowupPlan(ds, 'ls-3')!
const followupNoSupply = ruleFollowupPlan({ ...ds, instructors: [] }, 'ls-1')!
const debrief = ruleDebrief(ds, 'ls-1')!
const smallDebrief = ruleDebrief(ds, 'ls-3')!

const NETWORK_ERROR = '인터넷 연결이 끊긴 것 같습니다. 다시 시도해 주세요.'

type FetchMock = ReturnType<typeof vi.fn>

function respond(body: unknown, status = 200): FetchMock {
  const mock = vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }))
  vi.stubGlobal('fetch', mock)
  return mock
}

function ok(draft: ResultReportDraft | FollowupPlanDraft | SessionDebriefDraft) {
  return respond({ ok: true, source: draft.source, draft })
}

function setClipboard(writeText: ((text: string) => Promise<void>) | null) {
  Object.defineProperty(window.navigator, 'clipboard', {
    value: writeText ? { writeText } : undefined,
    configurable: true,
  })
}

function expectNoContactOrStorage(html: string) {
  expect(html).not.toContain('tel:')
  expect(html).not.toContain('mailto:')
  expect(html).not.toContain('localStorage')
  expect(html).not.toContain('sessionStorage')
}

beforeEach(() => {
  setClipboard(null)
})

afterEach(() => {
  vi.unstubAllGlobals()
  setClipboard(null)
  state.actor = null
})

// ============================================================================
// 복사용 평문
// ============================================================================

describe('resultReportToText', () => {
  it('규칙 초안: 제목·개요·응답 수·번호 섹션·창체 참고 문구·고지문이 들어간다', () => {
    const text = resultReportToText(report)
    expect(report.sample_sufficient).toBe(true)
    expect(text.startsWith(report.title)).toBe(true)
    for (const o of report.overview) expect(text).toContain(`${o.label}: ${o.value}`)
    expect(text).toContain(`응답 수: ${report.metrics.response_count}건`)
    expect(text).toContain(`응답률: ${report.metrics.response_rate_pct}%`)
    expect(text).toContain('1. 운영 성과')
    expect(text).toContain(report.record_reference)
    for (const n of report.notices) expect(text).toContain(n)
  })

  it('표본 부족 초안: 통계 자리에 `표본 부족`, 빈 섹션은 빼고 번호를 다시 매긴다', () => {
    const text = resultReportToText(smallReport)
    expect(smallReport.sample_sufficient).toBe(false)
    expect(text).toContain('표본 부족')
    // 고지문에 "학생 의견을 싣지 않았습니다"가 있으므로 섹션 제목 줄만 본다.
    expect(text).not.toMatch(/^\d\. 학생 의견$/m)
    expect(text).toContain('1. 운영 성과')
    expect(text).toContain('2. 개선점')
    expect(text).toContain('3. 향후 계획')
  })

  it('어떤 초안이든 `undefined`·`null` 문자열이 없다', () => {
    const emptied: ResultReportDraft = {
      ...report,
      outcomes: [],
      student_voice: [],
      improvements: [],
      next_steps: [],
      record_reference: '',
      metrics: { ...report.metrics, top_fields: [] },
    }
    for (const d of [report, smallReport, emptied]) {
      const text = resultReportToText(d)
      expect(text).not.toMatch(/undefined|null/)
    }
    expect(resultReportToText(emptied)).not.toMatch(/^\d\. /m)
  })
})

describe('debriefToText', () => {
  it('학교 제출용 요약과 고지문이 들어가고 `undefined`·`null` 이 없다', () => {
    for (const d of [debrief, smallDebrief]) {
      const text = debriefToText(d)
      expect(text).toContain(d.school_summary)
      for (const n of d.notices) expect(text).toContain(n)
      expect(text).not.toMatch(/undefined|null/)
    }
  })
})

describe('followupMessageToText', () => {
  it('섭외 문안을 그대로 돌려주고, 문안이 없으면 빈 문자열이다', () => {
    expect(followup.request_message.length).toBeGreaterThan(0)
    expect(followupMessageToText(followup)).toBe(followup.request_message)
    expect(followupMessageToText(followupSmall)).toBe('')
    expect(followupMessageToText(followupNoSupply)).toBe('')
  })
})

// ============================================================================
// 공통 부품
// ============================================================================

describe('AssistProgress', () => {
  it('active 이전은 완료, active 는 진행(…), 이후는 대기다', () => {
    render(<AssistProgress stages={['첫째', '둘째', '셋째']} active={1} />)
    const status = screen.getByRole('status')
    expect(status).toHaveAttribute('aria-live', 'polite')

    const items = within(status).getAllByRole('listitem')
    expect(items).toHaveLength(3)

    expect(items[0]).toHaveAttribute('data-state', 'done')
    expect(items[0]!.className).toContain('text-body')
    expect(items[0]!.querySelector('svg')).not.toBeNull()
    expect(items[0]!.textContent).not.toContain('…')

    expect(items[1]).toHaveAttribute('data-state', 'active')
    expect(items[1]!.className).toContain('text-point')
    expect(items[1]!.textContent).toContain('둘째…')

    expect(items[2]).toHaveAttribute('data-state', 'waiting')
    expect(items[2]!.className).toContain('text-faint')
    expect(items[2]!.textContent).not.toContain('…')
  })

  it('fade-in 외의 애니메이션을 쓰지 않는다', () => {
    const { container } = render(<AssistProgress stages={['a', 'b']} active={0} />)
    for (const li of container.querySelectorAll('li')) expect(li.className).toContain('animate-fade-in')
    expect(container.innerHTML).not.toMatch(/animate-(spin|pulse|bounce|ping)/)
  })
})

describe('CopyButton', () => {
  it('복사에 성공하면 `복사했습니다`', async () => {
    const writeText = vi.fn(async () => {})
    setClipboard(writeText)
    render(<CopyButton text="붙여 넣을 문장" label="문안 복사" />)
    fireEvent.click(screen.getByRole('button', { name: '문안 복사' }))
    expect(await screen.findByText('복사했습니다')).toBeInTheDocument()
    expect(writeText).toHaveBeenCalledWith('붙여 넣을 문장')
  })

  it('clipboard 가 없으면 직접 복사 안내', async () => {
    render(<CopyButton text="x" label="복사" />)
    fireEvent.click(screen.getByRole('button', { name: '복사' }))
    expect(
      await screen.findByText('복사하지 못했습니다. 직접 선택해 복사해 주세요.'),
    ).toBeInTheDocument()
    expect(screen.queryByText('복사했습니다')).toBeNull()
  })

  it('clipboard 가 거부해도 직접 복사 안내', async () => {
    const writeText = vi.fn(async () => {
      throw new Error('denied')
    })
    setClipboard(writeText)
    render(<CopyButton text="y" label="복사" />)
    fireEvent.click(screen.getByRole('button', { name: '복사' }))
    expect(
      await screen.findByText('복사하지 못했습니다. 직접 선택해 복사해 주세요.'),
    ).toBeInTheDocument()
    expect(writeText).toHaveBeenCalledWith('y')
  })
})

// ============================================================================
// 결과보고서 초안
// ============================================================================

describe('ResultReportAssist', () => {
  it('버튼 문구가 정확하고, 누르기 전에는 결과가 없다', () => {
    render(<ResultReportAssist sessionId="ls-1" stageMs={0} />)
    expect(screen.getByRole('button', { name: '결과보고서 초안 만들기' })).toBeEnabled()
    expect(screen.queryByText('저장되지 않음')).toBeNull()
  })

  it('자기 라우트에 sessionId 만 보내고, 문서·머리줄·고지문을 보여준다', async () => {
    const fetchMock = ok(report)
    const { container } = render(<ResultReportAssist sessionId="ls-1" stageMs={0} />)
    fireEvent.click(screen.getByRole('button', { name: '결과보고서 초안 만들기' }))

    expect(await screen.findByText(/^초안입니다/)).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/result-report')
    expect(init.method).toBe('POST')
    expect(JSON.parse(String(init.body))).toEqual({ sessionId: 'ls-1' })

    expect(screen.getByText('응답 집계로 만들었습니다')).toBeInTheDocument()
    expect(screen.getByText('저장되지 않음')).toBeInTheDocument()
    expect(screen.getByText(`응답 ${report.metrics.response_count}건 집계`)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: report.title })).toBeInTheDocument()
    expect(screen.getByText('1. 운영 성과')).toBeInTheDocument()
    expect(screen.getByText('창체 진로활동 기록 참고 문구 (회차 단위)')).toBeInTheDocument()
    expect(screen.getByText(report.record_reference)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '전체 복사' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '다시 만들기' })).toBeInTheDocument()
    for (const o of report.overview) expect(screen.getAllByText(o.value).length).toBeGreaterThan(0)

    expectNoContactOrStorage(container.innerHTML)
  })

  it('표본 부족: 지표 자리에 — 와 `표본 부족`, 빈 섹션은 빠지고 번호가 다시 매겨진다', async () => {
    ok(smallReport)
    render(<ResultReportAssist sessionId="ls-3" stageMs={0} />)
    fireEvent.click(screen.getByRole('button', { name: '결과보고서 초안 만들기' }))

    expect(await screen.findByText('2. 개선점')).toBeInTheDocument()
    expect(screen.getAllByText('표본 부족').length).toBeGreaterThanOrEqual(2)
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(2)
    // 고지문에 "학생 의견을 싣지 않았습니다"가 있으므로 섹션 제목만 본다.
    expect(screen.queryByRole('heading', { name: /학생 의견/ })).toBeNull()
    expect(screen.getByRole('heading', { name: '1. 운영 성과' })).toBeInTheDocument()
  })

  it('LLM 초안이면 source 문구가 `AI가 문장을 정리했습니다` 다', async () => {
    ok({ ...report, source: 'llm' })
    render(<ResultReportAssist sessionId="ls-1" stageMs={0} />)
    fireEvent.click(screen.getByRole('button', { name: '결과보고서 초안 만들기' }))
    expect(await screen.findByText('AI가 문장을 정리했습니다')).toBeInTheDocument()
    expect(screen.queryByText('응답 집계로 만들었습니다')).toBeNull()
  })

  it('전체 복사는 평문 보고서를 클립보드에 쓴다', async () => {
    const writeText = vi.fn(async () => {})
    setClipboard(writeText)
    ok(report)
    render(<ResultReportAssist sessionId="ls-1" stageMs={0} />)
    fireEvent.click(screen.getByRole('button', { name: '결과보고서 초안 만들기' }))
    fireEvent.click(await screen.findByRole('button', { name: '전체 복사' }))
    expect(await screen.findByText('복사했습니다')).toBeInTheDocument()
    expect(writeText).toHaveBeenCalledWith(resultReportToText(report))
  })

  it('진행 중에는 버튼이 `만드는 중…`(비활성)이고 단계 문구를 보여준다', async () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
    render(<ResultReportAssist sessionId="ls-1" stageMs={0} />)
    fireEvent.click(screen.getByRole('button', { name: '결과보고서 초안 만들기' }))

    const button = await screen.findByRole('button', { name: '만드는 중…' })
    expect(button).toBeDisabled()
    const status = screen.getByRole('status')
    expect(status.textContent).toContain('회차 응답 집계…')
    for (const stage of ['표본 5건 기준 확인', '숫자·이름 검증', '보고서 문장 정리']) {
      expect(status.textContent).toContain(stage)
    }
  })

  it('네트워크 실패면 연결 안내 문구', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('offline'))))
    render(<ResultReportAssist sessionId="ls-1" stageMs={0} />)
    fireEvent.click(screen.getByRole('button', { name: '결과보고서 초안 만들기' }))
    expect(await screen.findByText(NETWORK_ERROR)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '결과보고서 초안 만들기' })).toBeEnabled()
  })

  it('API 가 403 이면 그 메시지를 그대로 보여준다', async () => {
    respond({ ok: false, message: '권한이 없습니다.' }, 403)
    render(<ResultReportAssist sessionId="ls-1" stageMs={0} />)
    fireEvent.click(screen.getByRole('button', { name: '결과보고서 초안 만들기' }))
    expect(await screen.findByText('권한이 없습니다.')).toBeInTheDocument()
    expect(screen.queryByText('저장되지 않음')).toBeNull()
  })
})

// ============================================================================
// 후속 과정 제안
// ============================================================================

describe('FollowupPlanAssist', () => {
  it('버튼 문구가 정확하다', () => {
    render(<FollowupPlanAssist sessionId="ls-1" stageMs={0} />)
    expect(screen.getByRole('button', { name: '후속 과정 제안받기' })).toBeEnabled()
  })

  it('수요 흐름 → 후보(공개 프로필만) → 과정안 → 문안 → 섭외 화면 링크', async () => {
    const fetchMock = ok(followup)
    const { container } = render(<FollowupPlanAssist sessionId="ls-1" stageMs={0} />)
    fireEvent.click(screen.getByRole('button', { name: '후속 과정 제안받기' }))

    expect(await screen.findByText(/^초안입니다/)).toBeInTheDocument()
    expect((fetchMock.mock.calls[0] as [string])[0]).toBe('/api/followup-plan')
    expect(screen.getByText('응답 집계로 만들었습니다')).toBeInTheDocument()
    expect(screen.getByText('저장되지 않음')).toBeInTheDocument()

    // 수요 흐름
    expect(screen.getByText('전체 응답')).toBeInTheDocument()
    expect(screen.getByText(`${followup.response_count}건`)).toBeInTheDocument()
    expect(screen.getByText(`${followup.field} 관심`)).toBeInTheDocument()
    if (followup.top_time) {
      expect(screen.getByText(`가장 많이 고른 시간 · ${followup.top_time}`)).toBeInTheDocument()
    }

    // 후보: 공개 프로필 링크만
    expect(followup.candidates.length).toBeGreaterThan(0)
    const profileLinks = screen.getAllByRole('link', { name: /공개 프로필/ })
    expect(profileLinks).toHaveLength(followup.candidates.length)
    for (const link of profileLinks) {
      expect(link.getAttribute('href')).toMatch(/^\/instructors\//)
    }
    for (const c of followup.candidates) expect(screen.getByText(c.name)).toBeInTheDocument()

    // 과정안
    expect(screen.getByText(followup.suggested_title)).toBeInTheDocument()
    expect(screen.getByText('1차시')).toBeInTheDocument()
    expect(screen.getByText(`${followup.outline.length}차시`)).toBeInTheDocument()

    // 문안
    const textarea = screen.getByLabelText('섭외 요청 문안') as HTMLTextAreaElement
    expect(textarea.readOnly).toBe(true)
    expect(textarea.value).toBe(followup.request_message)
    expect(screen.getByText(`${followup.request_message.length} / 400자`)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '문안 복사' })).toBeInTheDocument()

    // 섭외는 기관이 직접 보낸다 — 자동 발송 버튼이 없다
    expect(screen.getByRole('link', { name: /섭외 요청 화면으로/ })).toHaveAttribute(
      'href',
      '/org/recruitment',
    )
    expect(screen.queryByRole('button', { name: /보내기|발송|전송/ })).toBeNull()

    expectNoContactOrStorage(container.innerHTML)
  })

  it('문안 복사는 섭외 문안 그대로를 클립보드에 쓴다', async () => {
    const writeText = vi.fn(async () => {})
    setClipboard(writeText)
    ok(followup)
    render(<FollowupPlanAssist sessionId="ls-1" stageMs={0} />)
    fireEvent.click(screen.getByRole('button', { name: '후속 과정 제안받기' }))
    fireEvent.click(await screen.findByRole('button', { name: '문안 복사' }))
    expect(await screen.findByText('복사했습니다')).toBeInTheDocument()
    expect(writeText).toHaveBeenCalledWith(followup.request_message)
  })

  it('eligible 이 아니면 이유와 고지문만 — 수요 흐름·후보·문안·복사·섭외 링크가 없다', async () => {
    ok(followupSmall)
    render(<FollowupPlanAssist sessionId="ls-3" stageMs={0} />)
    fireEvent.click(screen.getByRole('button', { name: '후속 과정 제안받기' }))

    expect(await screen.findByText(followupSmall.reason!)).toBeInTheDocument()
    expect(screen.getByText(/^초안입니다/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '문안 복사' })).toBeNull()
    expect(screen.queryByText('전체 응답')).toBeNull()
    expect(screen.queryByText('가까운 지역 강사')).toBeNull()
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('공급이 없으면 후보 링크 없이 공급 없음 고지문이 보인다', async () => {
    ok(followupNoSupply)
    const { container } = render(<FollowupPlanAssist sessionId="ls-1" stageMs={0} />)
    fireEvent.click(screen.getByRole('button', { name: '후속 과정 제안받기' }))

    const notice = followupNoSupply.notices.at(-1)!
    expect(await screen.findByText(notice)).toBeInTheDocument()
    expect(screen.queryAllByRole('link', { name: /공개 프로필/ })).toHaveLength(0)
    expect(container.querySelector('a[href^="/instructors/"]')).toBeNull()
    expect(screen.queryByRole('button', { name: '문안 복사' })).toBeNull()
    expect(screen.queryByText('가까운 지역 강사')).toBeNull()
  })

  it('네트워크 실패·403 메시지', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('offline'))))
    const first = render(<FollowupPlanAssist sessionId="ls-1" stageMs={0} />)
    fireEvent.click(screen.getByRole('button', { name: '후속 과정 제안받기' }))
    expect(await screen.findByText(NETWORK_ERROR)).toBeInTheDocument()
    first.unmount()

    respond({ ok: false, message: '권한이 없습니다.' }, 403)
    render(<FollowupPlanAssist sessionId="ls-1" stageMs={0} />)
    fireEvent.click(screen.getByRole('button', { name: '후속 과정 제안받기' }))
    expect(await screen.findByText('권한이 없습니다.')).toBeInTheDocument()
  })
})

// ============================================================================
// 수업 회고
// ============================================================================

describe('SessionDebriefAssist', () => {
  it('버튼 문구가 정확하다', () => {
    render(<SessionDebriefAssist sessionId="ls-1" stageMs={0} />)
    expect(screen.getByRole('button', { name: '수업 회고 만들기' })).toBeEnabled()
  })

  it('지표·잘 된 점·바꿀 점·학교 제출용 요약·교안 링크·고지문', async () => {
    const writeText = vi.fn(async () => {})
    setClipboard(writeText)
    const fetchMock = ok(debrief)
    const { container } = render(<SessionDebriefAssist sessionId="ls-1" stageMs={0} />)
    fireEvent.click(screen.getByRole('button', { name: '수업 회고 만들기' }))

    expect(await screen.findByText(/^초안입니다/)).toBeInTheDocument()
    expect((fetchMock.mock.calls[0] as [string])[0]).toBe('/api/session-debrief')
    expect(screen.getByText('응답 집계로 만들었습니다')).toBeInTheDocument()
    expect(screen.getByText('저장되지 않음')).toBeInTheDocument()

    expect(screen.getByText(`응답률 ${debrief.metrics.response_rate_pct}%`)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '잘 된 점' })).toBeInTheDocument()
    for (const item of debrief.went_well) expect(screen.getByText(item)).toBeInTheDocument()
    if (debrief.change_next.length > 0) {
      expect(screen.getByRole('heading', { name: '다음에 바꿀 점' })).toBeInTheDocument()
    }

    expect(screen.getByRole('heading', { name: '학교 제출용 요약' })).toBeInTheDocument()
    expect(screen.getByText(debrief.school_summary)).toBeInTheDocument()
    expect(screen.getByText(`${debrief.school_summary.length} / 400자`)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '교안 다시 만들기' })).toHaveAttribute(
      'href',
      '/instructor/sessions/ls-1/plan',
    )

    fireEvent.click(screen.getByRole('button', { name: '요약 복사' }))
    expect(await screen.findByText('복사했습니다')).toBeInTheDocument()
    expect(writeText).toHaveBeenCalledWith(debriefToText(debrief))

    // 회고는 강사 평가가 아니다 — 별점·등급·게이지를 만들지 않는다
    expect(container.textContent).not.toMatch(/★|☆|등급|평점|점수/)
    expect(container.querySelector('progress, meter, [role="meter"], [role="progressbar"]')).toBeNull()
    expectNoContactOrStorage(container.innerHTML)
  })

  it('표본 부족: 지표는 — / `표본 부족`, 비어 있는 잘 된 점 열은 생략한다', async () => {
    ok(smallDebrief)
    render(<SessionDebriefAssist sessionId="ls-3" stageMs={0} />)
    fireEvent.click(screen.getByRole('button', { name: '수업 회고 만들기' }))

    expect(await screen.findByText(smallDebrief.school_summary)).toBeInTheDocument()
    expect(screen.getAllByText('표본 부족')).toHaveLength(3)
    expect(screen.queryByRole('heading', { name: '잘 된 점' })).toBeNull()
    expect(screen.getByRole('heading', { name: '다음에 바꿀 점' })).toBeInTheDocument()
  })

  it('네트워크 실패·403 메시지', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('offline'))))
    const first = render(<SessionDebriefAssist sessionId="ls-1" stageMs={0} />)
    fireEvent.click(screen.getByRole('button', { name: '수업 회고 만들기' }))
    expect(await screen.findByText(NETWORK_ERROR)).toBeInTheDocument()
    first.unmount()

    respond({ ok: false, message: '권한이 없습니다.' }, 403)
    render(<SessionDebriefAssist sessionId="ls-1" stageMs={0} />)
    fireEvent.click(screen.getByRole('button', { name: '수업 회고 만들기' }))
    expect(await screen.findByText('권한이 없습니다.')).toBeInTheDocument()
  })
})

// ============================================================================
// 기관 요약 진입 패널
// ============================================================================

describe('기관 요약 — 수업 후 AI 도우미 진입', () => {
  const ORG: Actor = { role: 'org_member', orgId: 'org-1', memberId: 'om-1', displayName: '이수진', demo: true }

  function panelOf(container: HTMLElement) {
    const heading = within(container).getByRole('heading', { name: '수업 후 AI 도우미' })
    return { heading, panel: heading.closest('section')! }
  }

  it('응답 5건 이상 회차를 진행일 최신순 최대 3개, 최근 회차 패널보다 앞에 둔다', async () => {
    state.actor = ORG
    const { container } = render(await OrgHomePage())
    const { heading, panel } = panelOf(container)

    const eligible = ds.lectureSessions
      .filter((s) => s.org_id === 'org-1')
      .map((s) => ({ s, n: ds.surveyResponses.filter((r) => r.session_id === s.id).length }))
      .filter((x) => x.n >= 5)
      .sort((a, b) => b.s.held_on.localeCompare(a.s.held_on))
      .slice(0, 3)
    expect(eligible.length).toBeGreaterThan(0)

    const links = within(panel).getAllByRole('link', { name: /초안 만들기/ })
    expect(links.map((l) => l.getAttribute('href'))).toEqual(
      eligible.map((x) => `/org/sessions/${x.s.id}#post-session-ai`),
    )
    for (const x of eligible) {
      expect(within(panel).getByText(x.s.title)).toBeInTheDocument()
      expect(panel.textContent).toContain(`응답 ${x.n}건`)
    }
    // 응답 0건 회차(ls-3)는 초안 대상이 아니다
    expect(within(panel).queryByText('VR 체험 특강')).toBeNull()

    const recent = within(container).getByRole('heading', { name: '최근 회차' })
    expect(heading.compareDocumentPosition(recent) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('대상 회차가 없으면 안내 문구만', async () => {
    state.actor = { ...ORG, orgId: 'org-없음' }
    const { container } = render(await OrgHomePage())
    const { panel } = panelOf(container)
    expect(
      within(panel).getByText('응답이 5건 이상 모인 회차가 생기면 여기서 바로 초안을 만들 수 있습니다.'),
    ).toBeInTheDocument()
    expect(within(panel).queryAllByRole('link')).toHaveLength(0)
  })
})

// ============================================================================
// 정적 검사
// ============================================================================

const SRC = join(process.cwd(), 'src')
const read = (...p: string[]) => readFileSync(join(SRC, ...p), 'utf8')

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry)
    return statSync(full).isDirectory() ? walk(full) : [full]
  })
}

const COMPONENTS = {
  'components/report/ResultReportAssist.tsx': '/api/result-report',
  'components/report/FollowupPlanAssist.tsx': '/api/followup-plan',
  'components/lesson/SessionDebriefAssist.tsx': '/api/session-debrief',
} as const

const CLIENT_FILES = [
  ...Object.keys(COMPONENTS),
  'components/ai/AssistProgress.tsx',
  'components/ai/CopyButton.tsx',
]

describe('정적 — 경계', () => {
  it('학생·보호자 라우트가 수업 후 AI 화면을 import 하지 않는다', () => {
    const files = [...walk(join(SRC, 'app', '(student)')), ...walk(join(SRC, 'app', '(public)'))]
    expect(files.length).toBeGreaterThan(0)
    for (const f of files) {
      expect(readFileSync(f, 'utf8'), f).not.toMatch(
        /ResultReportAssist|FollowupPlanAssist|SessionDebriefAssist/,
      )
    }
  })

  it('화면 원문에 브라우저 저장소·SDK·lib/ai import 가 없다', () => {
    for (const f of CLIENT_FILES) {
      const src = read(f)
      expect(src, f).toContain("'use client'")
      for (const banned of ['localStorage', 'sessionStorage', 'document.cookie', '@anthropic-ai/sdk', '@/lib/ai']) {
        expect(src, `${f}: ${banned}`).not.toContain(banned)
      }
    }
  })

  it('각 화면은 자기 /api 라우트 하나만 부르고 섭외 서버 액션을 쓰지 않는다', () => {
    for (const [f, endpoint] of Object.entries(COMPONENTS)) {
      const src = read(f)
      expect(src.match(/\/api\/[a-z-]+/g), f).toEqual([endpoint])
      expect(src, f).not.toMatch(/actions|sendRecruitment|recruitment_requests/)
    }
  })

  it('source·단계 문구에 과장 표현이 없다', () => {
    for (const f of CLIENT_FILES) {
      expect(read(f), f).not.toMatch(/AI가 분석|Powered by AI|AI 기반/i)
    }
  })

  it('기관 회차 상세에 결과보고서·후속 과정, 강사 회차 상세에 회고만 붙는다', () => {
    const org = read('app', '(org)', 'org', 'sessions', '[id]', 'page.tsx')
    expect(org).toContain('<ResultReportAssist sessionId={session.id}')
    expect(org).toContain('<FollowupPlanAssist sessionId={session.id}')
    expect(org).not.toContain('SessionDebriefAssist')
    expect(org).toContain('id="post-session-ai"')

    const ins = read('app', '(instructor)', 'instructor', 'sessions', '[id]', 'page.tsx')
    expect(ins).toContain('<SessionDebriefAssist sessionId={session.id}')
    expect(ins).not.toMatch(/ResultReportAssist|FollowupPlanAssist/)
  })
})
