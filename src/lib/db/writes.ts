import * as demo from '@/data/demo'
import { getServerSupabase } from '@/lib/supabase/server'
import { isDemoMode } from '@/lib/supabase/env'
import type { Field, Grade, GradeBand, Inquiry, Interest, QnaQuestion, SurveyResponse } from '@/types/domain'

/**
 * 쓰기. **전부 API 라우트에서만 호출한다** — 금칙어 필터·중복 제출·마감 검증·레이트 리밋을
 * 거치지 않은 INSERT 경로를 만들지 않기 위해서다 (ARCHITECTURE 패턴).
 *
 * 데모 모드에서는 시드 배열에 append 한다. 서버 인스턴스 메모리이므로
 * 배포본에서는 재시작·스케일아웃 시 사라진다 — 검수용으로는 충분하고,
 * 실 DB 가 붙으면 같은 함수가 Supabase 로 들어간다.
 */

let seq = 0
const nextId = (prefix: string) => `${prefix}-rt-${Date.now().toString(36)}-${(seq += 1)}`

export type SurveyInput = {
  sessionId: string
  studentId: string | null
  grade: Grade
  satisfaction: number
  followupIntent: number
  interestFields: string[]
  wantToLearn: string | null
  desiredJob: string | null
  availableTimes: string[]
}

export async function insertSurveyResponse(input: SurveyInput): Promise<{ id: string }> {
  const row: SurveyResponse = {
    id: nextId('sr'),
    session_id: input.sessionId,
    student_id: input.studentId,
    grade: input.grade,
    satisfaction: input.satisfaction,
    followup_intent: input.followupIntent,
    interest_fields: input.interestFields,
    want_to_learn: input.wantToLearn,
    desired_job: input.desiredJob,
    available_times: input.availableTimes,
    created_at: new Date().toISOString(),
  }

  if (isDemoMode()) {
    demo.surveyResponses.push(row)
    return { id: row.id }
  }

  const sb = await getServerSupabase()
  if (!sb) {
    demo.surveyResponses.push(row)
    return { id: row.id }
  }

  const { data, error } = await sb
    .from('survey_responses')
    .insert({
      session_id: input.sessionId,
      student_id: input.studentId,
      grade_band: input.grade.band,
      grade_year: input.grade.year,
      satisfaction: input.satisfaction,
      followup_intent: input.followupIntent,
      interest_fields: input.interestFields,
      want_to_learn: input.wantToLearn,
      desired_job: input.desiredJob,
      available_times: input.availableTimes,
    })
    .select('id')
    .single()

  if (error) throw new Error(error.message)
  return { id: String(data!.id) }
}

export type InterestInput = {
  sessionId: string
  studentId: string | null
  targetType: 'program' | 'instructor'
  targetId: string
  alias: string
}

export async function insertInterest(input: InterestInput): Promise<{ id: string }> {
  const row: Interest = {
    id: nextId('it'),
    student_id: input.studentId,
    target_type: input.targetType,
    target_id: input.targetId,
    session_id: input.sessionId,
    status: 'expressed',
    created_at: new Date().toISOString(),
    student_alias: input.alias,
  }

  if (isDemoMode()) {
    demo.interests.push(row)
    return { id: row.id }
  }

  const sb = await getServerSupabase()
  if (!sb) {
    demo.interests.push(row)
    return { id: row.id }
  }

  const { data, error } = await sb
    .from('interests')
    .insert({
      student_id: input.studentId,
      target_type: input.targetType,
      target_id: input.targetId,
      session_id: input.sessionId,
      status: 'expressed',
      student_alias: input.alias,
    })
    .select('id')
    .single()

  if (error) throw new Error(error.message)
  return { id: String(data!.id) }
}

export type QuestionInput = {
  alias: string
  field: Field
  body: string
  orgId: string | null
}

export async function insertQuestion(input: QuestionInput): Promise<{ id: string }> {
  const row: QnaQuestion = {
    id: nextId('q'),
    student_alias: input.alias,
    field: input.field,
    body: input.body,
    visibility: 'public',
    org_id: input.orgId,
    created_at: new Date().toISOString(),
  }

  if (isDemoMode()) {
    demo.qnaQuestions.push(row)
    return { id: row.id }
  }

  const sb = await getServerSupabase()
  if (!sb) {
    demo.qnaQuestions.push(row)
    return { id: row.id }
  }

  const { data, error } = await sb
    .from('qna_questions')
    .insert({
      student_alias: input.alias,
      field: input.field,
      body: input.body,
      visibility: 'public',
      org_id: input.orgId,
    })
    .select('id')
    .single()

  if (error) throw new Error(error.message)
  return { id: String(data!.id) }
}

export type InquiryInput = {
  guardianName: string
  guardianContact: string
  regionCode: string
  gradeBand: GradeBand
  field: Field
  targetType: 'program' | 'instructor' | 'none'
  targetId: string | null
  message: string
}

/**
 * 보호자 문의. anon 이 INSERT 할 수 있는 유일한 테이블이고 SELECT 는 막혀 있다.
 * 이 함수는 **절대** 문의 목록을 돌려주지 않는다 — 접수 결과로 id 만 준다.
 */
export async function insertInquiry(input: InquiryInput): Promise<{ id: string }> {
  const row: Inquiry = {
    id: nextId('iq'),
    guardian_name: input.guardianName,
    guardian_contact: input.guardianContact,
    region_code: input.regionCode,
    grade_band: input.gradeBand,
    field: input.field,
    target_type: input.targetType,
    target_id: input.targetId,
    message: input.message,
    status: 'received',
    assigned_instructor_id: null,
    handled_by: null,
    created_at: new Date().toISOString(),
  }

  if (isDemoMode()) {
    demo.inquiries.push(row)
    return { id: row.id }
  }

  const sb = await getServerSupabase()
  if (!sb) {
    demo.inquiries.push(row)
    return { id: row.id }
  }

  const { data, error } = await sb
    .from('inquiries')
    .insert({
      guardian_name: input.guardianName,
      guardian_contact: input.guardianContact,
      region_code: input.regionCode,
      grade_band: input.gradeBand,
      field: input.field,
      target_type: input.targetType,
      target_id: input.targetId,
      message: input.message,
      status: 'received',
    })
    .select('id')
    .single()

  if (error) throw new Error(error.message)
  return { id: String(data!.id) }
}
