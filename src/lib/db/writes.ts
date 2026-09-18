import * as demo from '@/data/demo'
import { getServerSupabase } from '@/lib/supabase/server'
import { isDemoMode } from '@/lib/supabase/env'
import type {
  Field,
  Grade,
  GradeBand,
  Inquiry,
  Interest,
  LessonPlan,
  LessonPlanInputs,
  LessonPlanStatus,
  LessonStep,
  QnaQuestion,
  SurveyResponse,
} from '@/types/domain'

/**
 * 쓰기. **전부 API 라우트에서만 호출한다** — 금칙어 필터·중복 제출·마감 검증·레이트 리밋을
 * 거치지 않은 INSERT 경로를 만들지 않기 위해서다 (ARCHITECTURE 패턴).
 *
 * 데모 모드에서는 시드 배열에 append 한다. 서버 인스턴스 메모리이므로
 * 배포본에서는 재시작·스케일아웃 시 사라진다 — 검수용으로는 충분하고,
 * 실 DB 가 붙으면 같은 함수가 Supabase 로 들어간다.
 *
 * **anon 이 쓰는 테이블(설문·관심 표현·보호자 문의·추천 기록)은 INSERT 뒤에 행을 돌려받지 않는다.**
 * anon 에게 SELECT 정책이 없으므로 `.select()` 를 붙이면 RETURNING 이 RLS 에 걸려 전부 실패한다.
 * id 는 서버에서 `crypto.randomUUID()` 로 만든다.
 */

let seq = 0
const nextId = (prefix: string) => `${prefix}-rt-${Date.now().toString(36)}-${(seq += 1)}`

/** PostgREST 에러를 던지되 분류 코드(예: 42501 = RLS 거부)를 남긴다. 라우트는 코드만 로그에 쓴다. */
function dbError(e: { message: string; code?: string }): Error & { code: string | null } {
  return Object.assign(new Error(e.message), { code: e.code ?? null })
}

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

  // anon 은 survey_responses 를 읽을 수 없다. `.select()` 로 행을 돌려받으면 RETURNING 이
  // SELECT 정책에 걸려 **모든 제출이 실패한다.** id 는 서버에서 만들고 행을 돌려받지 않는다.
  const id = crypto.randomUUID()
  const { error } = await sb.from('survey_responses').insert({
    id,
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

  if (error) throw dbError(error)
  return { id }
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

  // anon 은 interests 를 읽을 수 없다 — 행을 돌려받지 않는다 (설문과 같은 이유).
  const id = crypto.randomUUID()
  const { error } = await sb.from('interests').insert({
    id,
    student_id: input.studentId,
    target_type: input.targetType,
    target_id: input.targetId,
    session_id: input.sessionId,
    status: 'expressed',
    student_alias: input.alias,
  })

  if (error) throw dbError(error)
  return { id }
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

  // anon 은 inquiries 를 **절대** 읽을 수 없다 (ADR-014). 행을 돌려받지 않는다.
  const id = crypto.randomUUID()
  const { error } = await sb.from('inquiries').insert({
    id,
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

  if (error) throw dbError(error)
  return { id }
}

/**
 * 추천 기록 — 학생에게 **실제로 보여 준** 카드와 그 출처(llm/rule)·지연·토큰.
 *
 * LLM 실패는 규칙 문장으로 조용히 떨어진다(E-06). 이 기록이 없으면 교실에서 AI 가 돌았는지 알 수 없다.
 * 학생 자유서술 원문·가명코드·LLM 입력 전체·에러 메시지 본문은 남기지 않는다.
 *
 * anon 은 이 테이블을 읽을 수 없다 — 행을 돌려받지 않는다. 데모 모드에는 DB 가 없으므로 남기지 않는다.
 * 실패하면 던진다. **호출자(추천 라우트)가 삼키고 학생 응답은 그대로 내보낸다.**
 */
export type RecommendationLogInput = {
  sessionId: string
  responseId: string | null
  source: 'llm' | 'rule'
  stage: 'same' | 'adjacent' | 'two_hop' | 'none'
  /** 보여 준 카드. 수업 추천이면 program_id, 추천할 수업이 0건일 때의 진로 카드면 career_id (ADR-027). */
  items: ({ program_id: string; reason: string } | { career_id: string; reason: string })[]
  model: string | null
  latencyMs: number | null
  inputTokens: number | null
  outputTokens: number | null
  error: string | null
}

export async function insertRecommendationLog(input: RecommendationLogInput): Promise<void> {
  if (isDemoMode()) return

  const sb = await getServerSupabase()
  if (!sb) return

  const { error } = await sb.from('recommendation_logs').insert({
    id: crypto.randomUUID(),
    session_id: input.sessionId,
    response_id: input.responseId,
    source: input.source,
    stage: input.stage,
    items: input.items,
    model: input.model,
    latency_ms: input.latencyMs,
    input_tokens: input.inputTokens,
    output_tokens: input.outputTokens,
    error: input.error,
  })

  if (error) throw dbError(error)
}

/**
 * 교안 저장. 한 회차에 강사 하나의 교안 하나이므로 **재생성은 덮어쓰기다.**
 *
 * 호출 전에 반드시 "그 회차에 배정된 강사 본인인가"를 확인할 것. 실 DB 에서는 RLS 가 한 번 더
 * 막지만(ADR-015·019), 데모 모드에는 RLS 가 없으므로 애플리케이션 체크가 유일한 방어선이다.
 */
export type LessonPlanInput = {
  sessionId: string
  instructorId: string
  title: string
  objectives: string[]
  steps: LessonStep[]
  materials: string[]
  safetyNotes: string[]
  source: 'llm' | 'rule'
  inputsSnapshot: LessonPlanInputs
  status: LessonPlanStatus
}

export async function upsertLessonPlan(input: LessonPlanInput): Promise<{ id: string }> {
  const now = new Date().toISOString()

  if (isDemoMode()) {
    const existing = demo.lessonPlans.find(
      (p) => p.session_id === input.sessionId && p.instructor_id === input.instructorId,
    )
    const row: LessonPlan = {
      id: existing?.id ?? nextId('lp'),
      session_id: input.sessionId,
      instructor_id: input.instructorId,
      title: input.title,
      objectives: input.objectives,
      steps: input.steps,
      materials: input.materials,
      safety_notes: input.safetyNotes,
      source: input.source,
      inputs_snapshot: input.inputsSnapshot,
      status: input.status,
      created_at: existing?.created_at ?? now,
      updated_at: now,
    }
    if (existing) demo.lessonPlans[demo.lessonPlans.indexOf(existing)] = row
    else demo.lessonPlans.push(row)
    return { id: row.id }
  }

  const sb = await getServerSupabase()
  if (!sb) throw new Error('DB 연결이 없습니다.')

  const { data, error } = await sb
    .from('lesson_plans')
    .upsert(
      {
        session_id: input.sessionId,
        instructor_id: input.instructorId,
        title: input.title,
        objectives: input.objectives,
        steps: input.steps,
        materials: input.materials,
        safety_notes: input.safetyNotes,
        source: input.source,
        inputs_snapshot: input.inputsSnapshot,
        status: input.status,
        updated_at: now,
      },
      { onConflict: 'session_id,instructor_id' },
    )
    .select('id')
    .single()

  if (error) throw new Error(error.message)
  return { id: String(data!.id) }
}
