/**
 * 도메인 타입. docs/ARCHITECTURE.md 의 데이터 모델 표와 1:1로 대응한다.
 *
 * 이 파일에서 절대 하지 말아야 하는 것:
 * - Instructor 타입에 phone/email/sns 를 넣는 것. 연락처는 InstructorContact 로 분리돼 있고
 *   그 타입은 학생·보호자(anon) 경로에서 import 되지 않는다. (CLAUDE.md CRITICAL)
 * - Student 타입에 name/school/birthday 를 넣는 것. (ADR-003)
 * - Inquiry 타입에 학생 식별 필드를 넣는 것. (ADR-014)
 */

/** 관심 분야 — 신산업 5개 (PRD 확정 결정 10). 공급이 없는 분야를 목록에서 빼지 않는다. */
export const FIELDS = ['드론', '3D 모델링·프린팅', 'VR·AR', 'AI·코딩', '뷰티'] as const
export type Field = (typeof FIELDS)[number]

/** 설문 Q4 전용. "아직 잘 모르겠어요"는 단독 선택이다. */
export const FIELD_UNSURE = '아직 잘 모르겠어요'

export type GradeBand = 'elementary' | 'middle' | 'high'

export const GRADE_BAND_LABEL: Record<GradeBand, string> = {
  elementary: '초등',
  middle: '중등',
  high: '고등',
}

/** 학년까지 붙일 때 쓰는 한 글자 표기. `중2` 형태 (UI_GUIDE 안전규칙 2). */
export const GRADE_BAND_SHORT: Record<GradeBand, string> = {
  elementary: '초',
  middle: '중',
  high: '고',
}

/** 학년. 화면에는 `중2` 형태로만 쓰고 학생 식별에 쓰지 않는다. */
export type Grade = { band: GradeBand; year: number }

export type OrganizationType = 'school' | 'youth_center' | 'edu_company' | 'local_gov'

/** organizations.type 은 화면 문구·집계 분류에만 쓴다. 권한 판단에 쓰지 말 것 (ADR-013). */
export const ORG_TYPE_LABEL: Record<OrganizationType, string> = {
  school: '학교',
  youth_center: '청소년기관',
  edu_company: '교육업체',
  local_gov: '지자체',
}

export type Organization = {
  id: string
  name: string
  type: OrganizationType
  region_code: string
}

export type OrgMemberRole = 'manager' | 'teacher'

export type OrgMember = {
  id: string
  auth_user_id: string | null
  org_id: string
  role: OrgMemberRole
  display_name: string
  active: boolean
}

export type SessionStatus = 'open' | 'closed'

export type LectureSession = {
  id: string
  org_id: string
  /** 배정이다. 강사는 회차를 만들 수 없다 (ADR-015). nullable — 미배정 회차는 E-23. */
  instructor_id: string | null
  title: string
  field: Field
  held_on: string
  /** 응답 마감. 마감 후 제출은 거부된다 (E-17). */
  closes_at: string
  status: SessionStatus
  entry_code: string
  grade_band: GradeBand
  expected_students: number
}

/** PII 없음. 가명코드·기관ID·학년까지다 (ADR-003). */
export type Student = {
  id: string
  pseudo_code: string
  org_id: string
  grade: Grade
}

export type SurveyResponse = {
  id: string
  session_id: string
  /** NULL = 익명 응답. 기관 화면에 익명 수를 따로 표시한다 (E-04). */
  student_id: string | null
  grade: Grade
  /** 1~5 */
  satisfaction: number
  /** 1~4. 만족도와 절대 합치지 않는다 — 파일럿의 1차 전환 지표다 (SURVEY.md). */
  followup_intent: number
  interest_fields: string[]
  /** 마스킹 통과 후 저장된 텍스트 (E-08). */
  want_to_learn: string | null
  desired_job: string | null
  available_times: string[]
  created_at: string
}

export type ProviderStatus = 'pending' | 'approved' | 'rejected'

export type Provider = {
  id: string
  name: string
  region_code: string
  status: ProviderStatus
}

export type InstructorStatus = 'pending' | 'approved' | 'rejected' | 'suspended'

/**
 * 공개 경로에서 쓰는 강사 타입. 연락처 필드가 존재하지 않는다.
 * 사진 필드도 만들지 않는다 (UI_GUIDE 안전규칙 4).
 */
export type Instructor = {
  id: string
  provider_id: string | null
  name: string
  region_code: string
  fields: Field[]
  bio: string
  career: string[]
  status: InstructorStatus
}

/**
 * 연락처. **별도 테이블이고 anon 은 SELECT 권한이 없다.**
 * 이 타입을 학생·보호자 경로 컴포넌트에서 import 하면 그 자체가 설계 위반이다.
 */
export type InstructorContact = {
  instructor_id: string
  phone: string
  email: string
}

export type VerificationType = 'qualification' | 'criminal_record_check' | 'identity'

export type InstructorVerification = {
  id: string
  instructor_id: string
  /** Supabase Storage 비공개 버킷 경로. 서명 URL 없이 접근 불가. */
  file_path: string
  type: VerificationType
  reviewed_at: string | null
}

export type ProgramFormat = 'short_course' | 'one_off' | 'club'

export const PROGRAM_FORMAT_LABEL: Record<ProgramFormat, string> = {
  short_course: '단기과정',
  one_off: '1회 특강',
  club: '동아리·정기',
}

export type Program = {
  id: string
  instructor_id: string
  title: string
  field: Field
  target_grades: GradeBand[]
  format: ProgramFormat
  session_count: number
  summary: string
  outline: string[]
}

export type InterestStatus =
  | 'expressed'
  | 'org_review'
  | 'rejected'
  | 'consent_pending'
  | 'consent_denied'
  | 'recruiting'
  | 'connected'

export const INTEREST_STATUS_LABEL: Record<InterestStatus, string> = {
  expressed: '표현됨',
  org_review: '기관 검토',
  rejected: '반려',
  consent_pending: '동의 대기',
  consent_denied: '동의 거부',
  recruiting: '섭외 중',
  connected: '연결 완료',
}

export type Interest = {
  id: string
  student_id: string | null
  target_type: 'program' | 'instructor'
  target_id: string
  session_id: string
  status: InterestStatus
  created_at: string
  /** 화면에는 이 가명 표시만 쓴다. 가명코드 원문을 노출하지 않는다 (UI_GUIDE 안전규칙 2). */
  student_alias: string
}

export type InquiryStatus = 'received' | 'rejected' | 'assigned' | 'delivered' | 'matched' | 'unmatched'

export const INQUIRY_STATUS_LABEL: Record<InquiryStatus, string> = {
  received: '접수',
  rejected: '반려',
  assigned: '배정',
  delivered: '전달 완료',
  matched: '성사',
  unmatched: '미성사',
}

/**
 * 보호자 문의. 이 플랫폼이 실제 PII 를 보유하는 유일한 테이블이다.
 * 저장하는 것은 **성인 보호자 본인의** 이름·연락처뿐이고, 아이에 대해서는 학년대까지다 (ADR-014).
 * anon 은 INSERT 만 가능하고 SELECT 는 불가능하다.
 */
export type Inquiry = {
  id: string
  guardian_name: string
  guardian_contact: string
  region_code: string
  grade_band: GradeBand
  field: Field
  target_type: 'program' | 'instructor' | 'none'
  target_id: string | null
  message: string
  status: InquiryStatus
  assigned_instructor_id: string | null
  handled_by: string | null
  created_at: string
}

export type RecruitmentStatus = 'sent' | 'accepted' | 'declined' | 'expired'

export const RECRUITMENT_STATUS_LABEL: Record<RecruitmentStatus, string> = {
  sent: '발송',
  accepted: '수락',
  declined: '거절',
  expired: '기한 만료',
}

export type RecruitmentRequest = {
  id: string
  org_id: string
  instructor_id: string
  field: Field
  demand_count: number
  status: RecruitmentStatus
  note: string
  created_at: string
}

/** 동의를 플랫폼이 받는 게 아니라, 기관이 받은 결과를 **기록**한다 (UC-20). */
export type Consent = {
  id: string
  student_id: string | null
  interest_id: string
  recorded_by: string
  method: 'paper' | 'phone' | 'messenger'
  recorded_at: string
}

export type QnaQuestion = {
  id: string
  student_alias: string
  field: Field
  body: string
  visibility: 'public' | 'hidden'
  org_id: string | null
  created_at: string
}

export type QnaAnswer = {
  id: string
  question_id: string
  instructor_id: string
  body: string
  created_at: string
}

export type Invitation = {
  id: string
  email: string
  role: 'org_member' | 'instructor' | 'admin'
  org_id: string | null
  provider_id: string | null
  token: string
  expires_at: string
  accepted_at: string | null
  created_by: string
}

/** 추천 카드 1장. 연락처·사진·평점 필드가 없다. */
export type Recommendation = {
  program: Program
  instructor: Instructor
  provider: Provider | null
  /** 규칙 또는 LLM 이 만든 한 줄. 화면의 실질 가치는 이 문장이다. */
  reason: string
  /** 같은 시군구 / 1-hop / 2-hop */
  distance: 0 | 1 | 2
  region_label: string
}

/** 지역 확장 결과. 어느 단계에서 찾았는지를 화면에 그대로 보여준다. */
export type RegionExpansion = {
  stage: 'same' | 'adjacent' | 'two_hop' | 'none'
  codes: string[]
}

export type UnmetDemand = {
  field: Field
  region_code: string
  grade_band: GradeBand | null
  interest_count: number
  supply_count: number
}
