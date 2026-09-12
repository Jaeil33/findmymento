import * as demo from '@/data/demo'
import { getServerSupabase, getServiceSupabase } from '@/lib/supabase/server'
import { isDemoMode } from '@/lib/supabase/env'
import type {
  Consent,
  Field,
  GradeBand,
  InstructorStatus,
  Inquiry,
  InterestStatus,
  Invitation,
  LectureSession,
  QnaAnswer,
  RecruitmentRequest,
} from '@/types/domain'

/**
 * 기관·강사·운영자의 쓰기 작업. **서버 액션에서만** 호출한다.
 *
 * 데모 모드에서는 시드 배열을 수정한다. 서버 인스턴스 메모리라 재시작하면 사라지고,
 * Supabase 키가 들어오면 같은 함수가 실 DB 로 들어간다.
 *
 * 운영자 전용 작업(강사 심사·초대·문의 배정)은 `service_role` 을 쓴다 — RLS 를 우회하므로
 * 이 파일 밖에서 호출되지 않도록 호출 지점을 서버 액션으로 제한한다.
 */

let seq = 0
const nextId = (prefix: string) => `${prefix}-op-${Date.now().toString(36)}-${(seq += 1)}`

export type SessionInput = {
  orgId: string
  title: string
  field: Field
  heldOn: string
  closesAt: string
  gradeBand: GradeBand
  expectedStudents: number
  /** 배정. nullable 이지만 화면에서 강하게 유도한다 — 미배정이면 강사가 QR·리포트를 못 본다 (E-23). */
  instructorId: string | null
}

/** 6자리 입장 코드. 기존 코드와 겹치지 않게만 하면 충분하다. */
function makeEntryCode(taken: Set<string>): string {
  for (let i = 0; i < 500; i += 1) {
    const code = String(100000 + Math.floor(Math.random() * 900000))
    if (!taken.has(code)) return code
  }
  return String(Date.now()).slice(-6)
}

/** 회차 생성. **기관·학교만 호출한다.** 강사에게 이 경로를 열지 않는다 (ADR-015). */
export async function insertLectureSession(
  input: SessionInput,
): Promise<{ id: string; entryCode: string }> {
  const entryCode = makeEntryCode(new Set(demo.lectureSessions.map((s) => s.entry_code)))

  if (isDemoMode()) {
    const row: LectureSession = {
      id: nextId('ls'),
      org_id: input.orgId,
      instructor_id: input.instructorId,
      title: input.title,
      field: input.field,
      held_on: input.heldOn,
      closes_at: input.closesAt,
      status: 'open',
      entry_code: entryCode,
      grade_band: input.gradeBand,
      expected_students: input.expectedStudents,
    }
    demo.lectureSessions.push(row)
    return { id: row.id, entryCode }
  }

  const sb = await getServerSupabase()
  if (!sb) throw new Error('DB 연결이 없습니다.')

  const { data, error } = await sb
    .from('lecture_sessions')
    .insert({
      org_id: input.orgId,
      instructor_id: input.instructorId,
      title: input.title,
      field: input.field,
      held_on: input.heldOn,
      closes_at: input.closesAt,
      status: 'open',
      entry_code: entryCode,
      grade_band: input.gradeBand,
      expected_students: input.expectedStudents,
    })
    .select('id, entry_code')
    .single()

  if (error) throw new Error(error.message)
  return { id: String(data!.id), entryCode: String(data!.entry_code) }
}

export async function setSessionStatus(id: string, status: 'open' | 'closed'): Promise<void> {
  if (isDemoMode()) {
    const row = demo.lectureSessions.find((s) => s.id === id)
    if (row) row.status = status
    return
  }
  const sb = await getServerSupabase()
  if (!sb) throw new Error('DB 연결이 없습니다.')
  const { error } = await sb.from('lecture_sessions').update({ status }).eq('id', id)
  if (error) throw new Error(error.message)
}

/** 회차에 강사를 배정한다. 미배정 회차를 줄이는 것이 응답률 방어의 시작이다 (E-23·E-24). */
export async function assignSessionInstructor(
  id: string,
  instructorId: string | null,
): Promise<void> {
  if (isDemoMode()) {
    const row = demo.lectureSessions.find((s) => s.id === id)
    if (row) row.instructor_id = instructorId
    return
  }
  const sb = await getServerSupabase()
  if (!sb) throw new Error('DB 연결이 없습니다.')
  const { error } = await sb
    .from('lecture_sessions')
    .update({ instructor_id: instructorId })
    .eq('id', id)
  if (error) throw new Error(error.message)
}

/**
 * 학생 가명코드 일괄 발급. **PII 를 만들지 않는다** — 코드와 학년만 만든다.
 * 코드와 실명을 잇는 표는 기관이 따로 보관한다 (ADR-003).
 */
export async function issuePseudoCodes(
  orgId: string,
  gradeBand: GradeBand,
  gradeYear: number,
  count: number,
): Promise<string[]> {
  const n = Math.min(Math.max(1, count), 120)
  const existing = new Set(demo.students.map((s) => s.pseudo_code))
  const codes: string[] = []
  while (codes.length < n) {
    const code = String(100000 + Math.floor(Math.random() * 900000))
    if (existing.has(code) || codes.includes(code)) continue
    codes.push(code)
  }

  if (isDemoMode()) {
    for (const code of codes) {
      demo.students.push({
        id: nextId('st'),
        pseudo_code: code,
        org_id: orgId,
        grade: { band: gradeBand, year: gradeYear },
      })
    }
    return codes
  }

  const sb = await getServerSupabase()
  if (!sb) throw new Error('DB 연결이 없습니다.')

  const { error } = await sb.from('students').insert(
    codes.map((code) => ({
      pseudo_code: code,
      org_id: orgId,
      grade_band: gradeBand,
      grade_year: gradeYear,
    })),
  )
  if (error) throw new Error(error.message)
  return codes
}

export async function updateInterestStatus(id: string, status: InterestStatus): Promise<void> {
  if (isDemoMode()) {
    const row = demo.interests.find((i) => i.id === id)
    if (row) row.status = status
    return
  }
  const sb = await getServerSupabase()
  if (!sb) throw new Error('DB 연결이 없습니다.')
  const { error } = await sb.from('interests').update({ status }).eq('id', id)
  if (error) throw new Error(error.message)
}

/**
 * 보호자 동의 **기록**. 플랫폼이 동의를 받는 게 아니라, 기관이 받은 결과를 남긴다 (UC-20).
 * 기록과 동시에 관심 표현은 `recruiting` 으로 넘어간다.
 */
export async function recordConsent(
  interestId: string,
  recordedBy: string,
  method: Consent['method'],
): Promise<void> {
  if (isDemoMode()) {
    const interest = demo.interests.find((i) => i.id === interestId)
    demo.consents.push({
      id: nextId('cs'),
      student_id: interest?.student_id ?? null,
      interest_id: interestId,
      recorded_by: recordedBy,
      method,
      recorded_at: new Date().toISOString(),
    })
    if (interest) interest.status = 'recruiting'
    return
  }
  const sb = await getServerSupabase()
  if (!sb) throw new Error('DB 연결이 없습니다.')
  const { error } = await sb
    .from('consents')
    .insert({ interest_id: interestId, recorded_by: recordedBy, method })
  if (error) throw new Error(error.message)
  await updateInterestStatus(interestId, 'recruiting')
}

export async function insertRecruitmentRequest(input: {
  orgId: string
  instructorId: string
  field: Field
  demandCount: number
  note: string
}): Promise<{ id: string }> {
  if (isDemoMode()) {
    const row: RecruitmentRequest = {
      id: nextId('rr'),
      org_id: input.orgId,
      instructor_id: input.instructorId,
      field: input.field,
      demand_count: input.demandCount,
      status: 'sent',
      note: input.note,
      created_at: new Date().toISOString(),
    }
    demo.recruitmentRequests.push(row)
    return { id: row.id }
  }
  const sb = await getServerSupabase()
  if (!sb) throw new Error('DB 연결이 없습니다.')
  const { data, error } = await sb
    .from('recruitment_requests')
    .insert({
      org_id: input.orgId,
      instructor_id: input.instructorId,
      field: input.field,
      demand_count: input.demandCount,
      status: 'sent',
      note: input.note,
    })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  return { id: String(data!.id) }
}

export async function updateRecruitmentStatus(
  id: string,
  status: RecruitmentRequest['status'],
): Promise<void> {
  if (isDemoMode()) {
    const row = demo.recruitmentRequests.find((r) => r.id === id)
    if (row) row.status = status
    return
  }
  const sb = await getServerSupabase()
  if (!sb) throw new Error('DB 연결이 없습니다.')
  const { error } = await sb.from('recruitment_requests').update({ status }).eq('id', id)
  if (error) throw new Error(error.message)
}

/** Q&A 숨김 처리. 삭제가 아니라 비공개 전환이다 (UC-22). */
export async function setQuestionVisibility(
  id: string,
  visibility: 'public' | 'hidden',
): Promise<void> {
  if (isDemoMode()) {
    const row = demo.qnaQuestions.find((q) => q.id === id)
    if (row) row.visibility = visibility
    return
  }
  const sb = await getServerSupabase()
  if (!sb) throw new Error('DB 연결이 없습니다.')
  const { error } = await sb.from('qna_questions').update({ visibility }).eq('id', id)
  if (error) throw new Error(error.message)
}

export async function insertAnswer(input: {
  questionId: string
  instructorId: string
  body: string
}): Promise<{ id: string }> {
  if (isDemoMode()) {
    const row: QnaAnswer = {
      id: nextId('a'),
      question_id: input.questionId,
      instructor_id: input.instructorId,
      body: input.body,
      created_at: new Date().toISOString(),
    }
    demo.qnaAnswers.push(row)
    return { id: row.id }
  }
  const sb = await getServerSupabase()
  if (!sb) throw new Error('DB 연결이 없습니다.')
  const { data, error } = await sb
    .from('qna_answers')
    .insert({ question_id: input.questionId, instructor_id: input.instructorId, body: input.body })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  return { id: String(data!.id) }
}

/**
 * 강사 심사. **운영자만** 호출하며 `service_role` 을 쓴다.
 * 성범죄경력 조회 증빙이 없으면 승인하지 않는다 — 화면에서 막고 여기서 한 번 더 막는다.
 */
export async function setInstructorStatus(id: string, status: InstructorStatus): Promise<void> {
  if (isDemoMode()) {
    const row = demo.instructors.find((i) => i.id === id)
    if (row) row.status = status
    return
  }
  const sb = getServiceSupabase()
  if (!sb) throw new Error('운영자 권한 키가 설정되지 않았습니다.')
  const { error } = await sb.from('instructors').update({ status }).eq('id', id)
  if (error) throw new Error(error.message)
}

/** 보호자 문의 배정. 운영자만. */
export async function assignInquiry(
  id: string,
  instructorId: string | null,
  handledBy: string,
  status: Inquiry['status'],
): Promise<void> {
  if (isDemoMode()) {
    const row = demo.inquiries.find((q) => q.id === id)
    if (row) {
      row.assigned_instructor_id = instructorId
      row.handled_by = handledBy
      row.status = status
    }
    return
  }
  const sb = getServiceSupabase()
  if (!sb) throw new Error('운영자 권한 키가 설정되지 않았습니다.')
  const { error } = await sb
    .from('inquiries')
    .update({ assigned_instructor_id: instructorId, handled_by: handledBy, status })
    .eq('id', id)
  if (error) throw new Error(error.message)
}

/** 초대 발송. 토큰은 1회용이고 만료 시각이 필수다 (ADR-011). */
export async function insertInvitation(input: {
  email: string
  role: Invitation['role']
  orgId: string | null
  providerId: string | null
  createdBy: string
  expiresInDays: number
}): Promise<{ token: string }> {
  const token =
    globalThis.crypto?.randomUUID?.().replace(/-/g, '') ??
    `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`
  const expiresAt = new Date(Date.now() + input.expiresInDays * 86_400_000).toISOString()

  if (isDemoMode()) {
    demo.invitations.push({
      id: nextId('iv'),
      email: input.email,
      role: input.role,
      org_id: input.orgId,
      provider_id: input.providerId,
      token,
      expires_at: expiresAt,
      accepted_at: null,
      created_by: input.createdBy,
    })
    return { token }
  }

  const sb = getServiceSupabase()
  if (!sb) throw new Error('운영자 권한 키가 설정되지 않았습니다.')
  const { error } = await sb.from('invitations').insert({
    email: input.email,
    role: input.role,
    org_id: input.orgId,
    provider_id: input.providerId,
    token,
    expires_at: expiresAt,
    created_by: input.createdBy,
  })
  if (error) throw new Error(error.message)
  return { token }
}

/** 담당자 비활성화. 계정 삭제가 아니라 접근 차단이다 (E-13). */
export async function setOrgMemberActive(id: string, active: boolean): Promise<void> {
  if (isDemoMode()) {
    const row = demo.orgMembers.find((m) => m.id === id)
    if (row) row.active = active
    return
  }
  const sb = getServiceSupabase()
  if (!sb) throw new Error('운영자 권한 키가 설정되지 않았습니다.')
  const { error } = await sb.from('org_members').update({ active }).eq('id', id)
  if (error) throw new Error(error.message)
}
