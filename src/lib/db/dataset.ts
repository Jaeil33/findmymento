import { cache } from 'react'
import * as demo from '@/data/demo'
import { getServerSupabase } from '@/lib/supabase/server'
import { isDemoMode } from '@/lib/supabase/env'
import type {
  Consent,
  Grade,
  Inquiry,
  Instructor,
  InstructorVerification,
  Interest,
  Invitation,
  LectureSession,
  OrgMember,
  Organization,
  Program,
  Provider,
  QnaAnswer,
  QnaQuestion,
  RecruitmentRequest,
  Student,
  SurveyResponse,
} from '@/types/domain'

/**
 * 조회 전략.
 *
 * 모든 집계·필터 로직은 `Dataset` 위의 **순수 함수**로 한 번만 쓴다 (`queries.ts`).
 * 데이터가 어디서 오는지는 이 파일만 안다.
 *
 * - Supabase 가 설정돼 있으면: anon 키 + 사용자 세션으로 테이블을 읽는다.
 *   **행 수준 권한은 RLS 가 건다** — 기관 담당자가 읽으면 자기 기관 행만, 강사가 읽으면
 *   배정된 회차만 돌아온다. 애플리케이션이 `where org_id = ...` 를 빼먹어도 새지 않는다.
 * - 키가 없으면: 데모 시드.
 *
 * 파일럿 규모(수백 행)에서는 테이블 단위 조회로 충분하다. 규모가 커지면
 * 이 함수만 분할 조회로 바꾸면 되고, 화면·집계 코드는 건드리지 않는다.
 */
export type Dataset = {
  organizations: Organization[]
  orgMembers: OrgMember[]
  providers: Provider[]
  instructors: Instructor[]
  instructorVerifications: InstructorVerification[]
  programs: Program[]
  lectureSessions: LectureSession[]
  students: Student[]
  surveyResponses: SurveyResponse[]
  interests: Interest[]
  consents: Consent[]
  recruitmentRequests: RecruitmentRequest[]
  qnaQuestions: QnaQuestion[]
  qnaAnswers: QnaAnswer[]
  inquiries: Inquiry[]
  invitations: Invitation[]
}

function demoDataset(): Dataset {
  return {
    organizations: demo.organizations,
    orgMembers: demo.orgMembers,
    providers: demo.providers,
    instructors: demo.instructors,
    instructorVerifications: demo.instructorVerifications,
    programs: demo.programs,
    lectureSessions: demo.lectureSessions,
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
}

type Row = Record<string, unknown>

const grade = (r: Row): Grade => ({
  band: (r.grade_band as Grade['band']) ?? 'middle',
  year: Number(r.grade_year ?? 0),
})

/**
 * 한 요청 안에서 같은 데이터를 두 번 읽지 않는다.
 * `cache()` 는 요청 경계에서 리셋되므로 요청 간에 데이터가 섞이지 않는다.
 */
export const loadDataset = cache(async (): Promise<Dataset> => {
  if (isDemoMode()) return demoDataset()

  const sb = await getServerSupabase()
  if (!sb) return demoDataset()

  const table = async <T>(name: string, map: (r: Row) => T): Promise<T[]> => {
    const { data, error } = await sb.from(name).select('*')
    // 권한이 없으면 RLS 가 0행을 준다. 에러가 나는 경우(테이블 없음 등)도 화면을 깨지 않는다.
    if (error || !data) return []
    return (data as Row[]).map(map)
  }

  const [
    organizations,
    orgMembers,
    providers,
    instructors,
    instructorVerifications,
    programs,
    lectureSessions,
    students,
    surveyResponses,
    interests,
    consents,
    recruitmentRequests,
    qnaQuestions,
    qnaAnswers,
    inquiries,
    invitations,
  ] = await Promise.all([
    table<Organization>('organizations', (r) => r as unknown as Organization),
    table<OrgMember>('org_members', (r) => r as unknown as OrgMember),
    table<Provider>('providers', (r) => r as unknown as Provider),
    // 주의: `instructors` 에는 연락처 컬럼이 없다. 연락처는 `instructor_contacts` 별도 테이블이고
    // 이 함수는 그 테이블을 읽지 않는다 (CLAUDE.md CRITICAL).
    table<Instructor>('instructors', (r) => ({
      ...(r as unknown as Instructor),
      fields: (r.fields as Instructor['fields']) ?? [],
      career: (r.career as string[]) ?? [],
    })),
    table<InstructorVerification>(
      'instructor_verifications',
      (r) => r as unknown as InstructorVerification,
    ),
    table<Program>('programs', (r) => ({
      ...(r as unknown as Program),
      target_grades: (r.target_grades as Program['target_grades']) ?? [],
      outline: (r.outline as string[]) ?? [],
    })),
    table<LectureSession>('lecture_sessions', (r) => r as unknown as LectureSession),
    table<Student>('students', (r) => ({
      id: String(r.id),
      pseudo_code: String(r.pseudo_code),
      org_id: String(r.org_id),
      grade: grade(r),
    })),
    table<SurveyResponse>('survey_responses', (r) => ({
      id: String(r.id),
      session_id: String(r.session_id),
      student_id: (r.student_id as string | null) ?? null,
      grade: grade(r),
      satisfaction: Number(r.satisfaction ?? 0),
      followup_intent: Number(r.followup_intent ?? 0),
      interest_fields: (r.interest_fields as string[]) ?? [],
      want_to_learn: (r.want_to_learn as string | null) ?? null,
      desired_job: (r.desired_job as string | null) ?? null,
      available_times: (r.available_times as string[]) ?? [],
      created_at: String(r.created_at ?? ''),
    })),
    table<Interest>('interests', (r) => r as unknown as Interest),
    table<Consent>('consents', (r) => r as unknown as Consent),
    table<RecruitmentRequest>('recruitment_requests', (r) => r as unknown as RecruitmentRequest),
    table<QnaQuestion>('qna_questions', (r) => r as unknown as QnaQuestion),
    table<QnaAnswer>('qna_answers', (r) => r as unknown as QnaAnswer),
    // anon 은 여기서 0행을 받는다. 운영자 세션에서만 행이 돌아온다 (ADR-014).
    table<Inquiry>('inquiries', (r) => r as unknown as Inquiry),
    table<Invitation>('invitations', (r) => r as unknown as Invitation),
  ])

  /**
   * 강사 세션에서는 `survey_responses` 가 RLS 로 0행이다 — 학생 단위 원본을 강사에게 주지 않기
   * 때문이다. 대신 `instructor_session_responses` 뷰가 **배정된 회차의 집계용 행**만 준다
   * (student_id 없음, 익명 여부만 포함).
   */
  const responses =
    surveyResponses.length > 0
      ? surveyResponses
      : await table<SurveyResponse>('instructor_session_responses', (r) => ({
          id: String(r.id),
          session_id: String(r.session_id),
          // 가명코드는 내려오지 않는다. 익명 여부만 유지해 기관 리포트의 익명 집계와 일치시킨다.
          student_id: r.is_anonymous === true ? null : 'hidden',
          grade: grade(r),
          satisfaction: Number(r.satisfaction ?? 0),
          followup_intent: Number(r.followup_intent ?? 0),
          interest_fields: (r.interest_fields as string[]) ?? [],
          want_to_learn: (r.want_to_learn as string | null) ?? null,
          desired_job: (r.desired_job as string | null) ?? null,
          available_times: (r.available_times as string[]) ?? [],
          created_at: String(r.created_at ?? ''),
        }))

  return {
    organizations,
    orgMembers,
    providers,
    instructors,
    instructorVerifications,
    programs,
    lectureSessions,
    students,
    surveyResponses: responses,
    interests,
    consents,
    recruitmentRequests,
    qnaQuestions,
    qnaAnswers,
    inquiries,
    invitations,
  }
})
