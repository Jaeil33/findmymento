import { describe, expect, it } from 'vitest'
import * as demo from '@/data/demo'
import type { Dataset } from '@/lib/db/dataset'
import {
  alreadyResponded,
  demandClusters,
  instructorLeads,
  instructorSessions,
  isClosed,
  orgSessionRows,
  publicPrograms,
  qnaThreads,
  searchDirectory,
  sessionByEntryCode,
  sessionReport,
  supplyByField,
  supplySummary,
  unansweredQueue,
  unmetDemand,
} from '@/lib/db/queries'

/** 테스트는 데모 시드를 그대로 쓴다 — 파일럿에서 실제로 마주칠 상태가 들어 있다. */
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

/**
 * 데모 시드의 날짜는 `DEMO_NOW` 기준 상대값이다 (배포된 데모가 시간이 지나 전부
 * 마감 회차가 되지 않게). 그래서 테스트의 현재 시각도 같은 기준을 쓴다 — 기준이
 * 갈라지면 "응답 받는 중 / 마감" 판정이 실행 날짜에 따라 흔들린다.
 */
const NOW = demo.DEMO_NOW
const afterDays = (days: number) => new Date(NOW.getTime() + days * 86_400_000)

describe('미승인 강사 비노출 (E-11)', () => {
  it('pending 강사의 프로그램은 공개 목록에 없다', () => {
    const pending = ds.instructors.filter((i) => i.status !== 'approved').map((i) => i.id)
    const visible = publicPrograms(ds).map((p) => p.instructor_id)
    for (const id of pending) expect(visible).not.toContain(id)
  })

  it('디렉토리 검색 결과에도 승인된 강사만 나온다', () => {
    const result = searchDirectory(ds, {})
    for (const card of result.items) expect(card.instructor.status).toBe('approved')
  })

  it('등록 업체·강사 수를 사실대로 집계한다 (UI_GUIDE 안전규칙 5)', () => {
    const s = supplySummary(ds)
    expect(s.instructorCount).toBe(ds.instructors.filter((i) => i.status === 'approved').length)
    expect(s.sentence).toContain('등록 업체')
    // 파일럿 시점에 공급이 있는 분야는 2개뿐이라는 사실이 화면에 드러나야 한다
    expect(s.coveredFields.length).toBeLessThan(
      s.coveredFields.length + s.uncoveredFields.length,
    )
    expect(s.uncoveredFields.length).toBeGreaterThan(0)
  })
})

describe('디렉토리 지역 확장 (E-07)', () => {
  it('광명시에 3D 프로그램이 있으면 same 단계에서 멈춘다', () => {
    const r = searchDirectory(ds, { regionCode: '41210', field: '3D 모델링·프린팅' })
    expect(r.stage).toBe('same')
    expect(r.items.length).toBeGreaterThan(0)
  })

  it('공급이 없는 분야는 none 으로 떨어지고 빈 배열을 준다', () => {
    const r = searchDirectory(ds, { regionCode: '41210', field: 'VR·AR' })
    expect(r.stage).toBe('none')
    expect(r.items).toEqual([])
  })

  it('가까운 순으로 정렬한다 — 업체·구독 여부를 반영하지 않는다 (ADR-009)', () => {
    const r = searchDirectory(ds, { regionCode: '41210', field: '드론' })
    const distances = r.items.map((i) => i.distance)
    expect([...distances]).toEqual([...distances].sort((a, b) => a - b))
  })

  it('카드에 연락처 필드가 존재하지 않는다', () => {
    const r = searchDirectory(ds, {})
    const serialized = JSON.stringify(r.items)
    expect(serialized).not.toContain('phone')
    expect(serialized).not.toContain('@example.invalid')
  })
})

describe('회차 조회와 마감 (E-01 · E-17)', () => {
  it('입장 코드로 회차를 찾는다', () => {
    const ctx = sessionByEntryCode(ds, '482913', NOW)
    expect(ctx).not.toBeNull()
    expect(ctx!.orgName).toBe('광명시청소년수련관')
  })

  it('없는 코드는 null — 호출자가 안내 화면으로 보낸다', () => {
    expect(sessionByEntryCode(ds, '000000', NOW)).toBeNull()
  })

  it('status=closed 회차는 마감이다', () => {
    const closed = ds.lectureSessions.find((s) => s.id === 'ls-1')!
    expect(isClosed(closed, NOW)).toBe(true)
  })

  it('closes_at 이 지난 회차도 마감이다', () => {
    const open = ds.lectureSessions.find((s) => s.id === 'ls-2')!
    expect(isClosed(open, NOW)).toBe(false)
    expect(isClosed(open, afterDays(30))).toBe(true)
  })

  it('세션 컨텍스트에 강사 이름만 있고 연락처가 없다', () => {
    const ctx = sessionByEntryCode(ds, '482913', NOW)!
    expect(Object.keys(ctx)).toEqual(['session', 'orgName', 'orgType', 'instructorName', 'closed'])
  })
})

describe('중복 응답 (E-03)', () => {
  it('같은 가명코드는 같은 회차에 두 번 응답할 수 없다', () => {
    const responded = ds.surveyResponses.find((r) => r.student_id !== null)!
    expect(alreadyResponded(ds, responded.session_id, responded.student_id!)).toBe(true)
  })

  it('응답하지 않은 학생은 false', () => {
    expect(alreadyResponded(ds, 'ls-2', 'st-nonexistent')).toBe(false)
  })
})

describe('회차 리포트 집계', () => {
  const report = sessionReport(ds, 'ls-1')!

  it('만족도와 후속 의향을 별개로 집계한다', () => {
    expect(report.satisfactionDist).toHaveLength(5)
    expect(report.followupDist).toHaveLength(4)
    expect(report.satisfactionAvg).not.toBe(report.followupAvg)
  })

  it('후속 의향 3점 이상을 따로 센다 — 파일럿의 1차 전환 지표', () => {
    const manual = ds.surveyResponses.filter(
      (r) => r.session_id === 'ls-1' && r.followup_intent >= 3,
    ).length
    expect(report.followupHighCount).toBe(manual)
  })

  it('익명 응답 수를 따로 표시한다 (E-04)', () => {
    const manual = ds.surveyResponses.filter(
      (r) => r.session_id === 'ls-1' && r.student_id === null,
    ).length
    expect(report.anonymousCount).toBe(manual)
    expect(report.anonymousCount + report.codedCount).toBe(report.responseCount)
  })

  it('분포 합이 응답 수와 같다', () => {
    expect(report.satisfactionDist.reduce((a, d) => a + d.count, 0)).toBe(report.responseCount)
    expect(report.followupDist.reduce((a, d) => a + d.count, 0)).toBe(report.responseCount)
  })

  it('리포트에 학생 식별자가 들어가지 않는다 — 강사도 같은 컴포넌트를 본다', () => {
    const serialized = JSON.stringify(report)
    expect(serialized).not.toContain('student_id')
    expect(serialized).not.toContain('pseudo_code')
    for (const s of ds.students.slice(0, 20)) {
      expect(serialized).not.toContain(s.pseudo_code)
    }
  })

  it('응답 0건 회차도 리포트를 만든다 (E-24)', () => {
    const zero = sessionReport(ds, 'ls-3')!
    expect(zero.responseCount).toBe(0)
    expect(zero.satisfactionAvg).toBe(0)
  })
})

describe('회차 목록 경고 신호 (E-23 · E-24)', () => {
  const rows = orgSessionRows(ds, 'org-1', NOW)

  it('미배정 회차를 표시한다', () => {
    const unassigned = rows.filter((r) => r.unassigned)
    expect(unassigned.length).toBeGreaterThan(0)
    expect(unassigned[0]!.session.instructor_id).toBeNull()
  })

  it('응답 0건 회차를 표시한다', () => {
    expect(rows.some((r) => r.zeroResponse)).toBe(true)
  })

  it('다른 기관 회차는 섞이지 않는다 (E-19)', () => {
    for (const r of rows) expect(r.session.org_id).toBe('org-1')
    const other = orgSessionRows(ds, 'org-2', NOW)
    expect(other.every((r) => r.session.org_id === 'org-2')).toBe(true)
  })
})

describe('미충족 수요 (E-16)', () => {
  const unmet = unmetDemand(ds, 'org-1')

  it('공급이 0인 분야만 남는다', () => {
    expect(unmet.length).toBeGreaterThan(0)
    for (const u of unmet) expect(u.supply_count).toBe(0)
  })

  it('공급이 있는 분야는 제외된다', () => {
    const fields = unmet.map((u) => u.field)
    expect(fields).not.toContain('드론')
    expect(fields).not.toContain('3D 모델링·프린팅')
  })

  it('"아직 잘 모르겠어요"는 미충족 수요가 아니다', () => {
    expect(unmet.map((u) => String(u.field))).not.toContain('아직 잘 모르겠어요')
  })

  it('분야별 공급 수가 리포트와 같은 기준을 쓴다', () => {
    const supply = supplyByField(ds, '41210')
    expect(supply['드론']).toBeGreaterThan(0)
    expect(supply['VR·AR']).toBe(0)
  })

  it('수요 클러스터는 후속 의향 3점 이상을 따로 센다', () => {
    const clusters = demandClusters(ds, 'org-1')
    for (const c of clusters) expect(c.intentCount).toBeLessThanOrEqual(c.count)
  })
})

describe('강사 권한 경계 (ADR-015)', () => {
  it('배정된 회차만 보인다', () => {
    const sessions = instructorSessions(ds, 'in-2', NOW)
    expect(sessions.length).toBeGreaterThan(0)
    for (const s of sessions) expect(s.session.instructor_id).toBe('in-2')
  })

  it('다른 강사에게 배정된 회차는 보이지 않는다', () => {
    const mine = instructorSessions(ds, 'in-2', NOW).map((s) => s.session.id)
    const others = ds.lectureSessions
      .filter((s) => s.instructor_id !== null && s.instructor_id !== 'in-2')
      .map((s) => s.id)
    for (const id of others) expect(mine).not.toContain(id)
  })

  it('미배정 회차는 어떤 강사에게도 보이지 않는다', () => {
    for (const i of ds.instructors) {
      const ids = instructorSessions(ds, i.id, NOW).map((s) => s.session.id)
      expect(ids).not.toContain('ls-3')
    }
  })

  it('자기에게 배정된 문의 리드만 보인다', () => {
    const leads = instructorLeads(ds, 'in-2')
    for (const l of leads) expect(l.assigned_instructor_id).toBe('in-2')
    const otherLeads = instructorLeads(ds, 'in-1').map((l) => l.id)
    for (const l of leads) expect(otherLeads).not.toContain(l.id)
  })

  it('반려된 문의는 리드로 가지 않는다', () => {
    for (const i of ds.instructors) {
      for (const l of instructorLeads(ds, i.id)) expect(l.status).not.toBe('rejected')
    }
  })
})

describe('Q&A', () => {
  it('숨김 처리된 글은 공개 목록에서 빠진다 (UC-22)', () => {
    const publicThreads = qnaThreads(ds, {}, NOW)
    expect(publicThreads.every((t) => t.question.visibility === 'public')).toBe(true)
    expect(qnaThreads(ds, { includeHidden: true }, NOW).length).toBeGreaterThan(
      publicThreads.length,
    )
  })

  it('48시간 초과 미답변을 큐에 올린다 (E-20)', () => {
    const queue = unansweredQueue(ds, 48, NOW)
    expect(queue.length).toBeGreaterThan(0)
    for (const t of queue) {
      expect(t.unanswered).toBe(true)
      expect(t.hoursWaiting).toBeGreaterThanOrEqual(48)
    }
  })
})

describe('데모 시드 자체의 안전 제약', () => {
  it('학생 데이터에 PII 가 없다 (ADR-003)', () => {
    for (const s of ds.students) {
      expect(Object.keys(s).sort()).toEqual(['grade', 'id', 'org_id', 'pseudo_code'])
    }
  })

  it('보호자 문의에 학생 식별 컬럼이 없다 (ADR-014)', () => {
    for (const q of ds.inquiries) {
      const keys = Object.keys(q)
      expect(keys.filter((k) => /child|student|school|birth/i.test(k))).toEqual([])
      expect(keys).toContain('grade_band')
    }
  })

  it('강사 타입에 연락처·사진 필드가 없다', () => {
    for (const i of ds.instructors) {
      const keys = Object.keys(i)
      expect(keys.filter((k) => /phone|email|sns|photo|image|rating/i.test(k))).toEqual([])
    }
  })
})
