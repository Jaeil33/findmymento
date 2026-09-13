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

/**
 * 학급 특성 — **고정 목록이다. 자유 텍스트 입력란을 만들지 말 것** (ADR-016).
 *
 * 입력란을 열어 두면 담당 교사가 "3번 자리 OO이 자폐스펙트럼"이라고 적는다. 악의가 아니라
 * 친절 때문에 적는다. 장애·건강은 민감정보이고 학생 개인에 귀속되는 순간 별도 동의 의무가
 * 생긴다. 선택지를 닫는 것이 유일하게 작동하는 방어다.
 *
 * 이 값은 `lecture_sessions`(= 한 반의 한 수업)에만 붙는다. `students`·`survey_responses`
 * 에 붙이면 그 자체가 설계 위반이다.
 */
export const CLASS_TRAITS = [
  '통합학급 포함',
  '휠체어 사용 학생 있음',
  '청각 보조 필요',
  '시각 보조 필요',
  '한국어 보조 필요',
  '첫 경험 다수',
  '경험자 다수',
  '집중 지속이 짧은 편',
] as const
export type ClassTrait = (typeof CLASS_TRAITS)[number]

export const VENUES = ['교실', '강당', '체육관', '운동장', '컴퓨터실', '메이커실'] as const
export type Venue = (typeof VENUES)[number]

export function isClassTrait(v: string): v is ClassTrait {
  return (CLASS_TRAITS as readonly string[]).includes(v)
}

export function isVenue(v: string): v is Venue {
  return (VENUES as readonly string[]).includes(v)
}

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
  /** ── 수업 조건. 기관이 입력하고 강사는 읽기만 한다 (ADR-015·ADR-016). ── */
  duration_minutes: number
  venue: Venue
  /** 고정 목록 밖의 값은 DB 제약이 거부한다. */
  class_traits: ClassTrait[]
  /** 장비 목록. 사물만 적는다 — 학생에 대한 서술을 넣지 말 것. */
  equipment: string[]
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

/**
 * 성사되지 않은 이유. **`장소 없음` 건수가 공간 사업 판단의 유일한 근거 데이터다** (ADR-023).
 * 고정값이며 자유 텍스트를 쓰지 않는다 — 세어야 하는 값이기 때문이다.
 */
export const CLOSE_REASONS = ['공급 없음', '장소 없음', '예산 없음', '일정 불가'] as const
export type CloseReason = (typeof CLOSE_REASONS)[number]

export function isCloseReason(v: string): v is CloseReason {
  return (CLOSE_REASONS as readonly string[]).includes(v)
}

export type RecruitmentRequest = {
  id: string
  org_id: string
  instructor_id: string
  field: Field
  demand_count: number
  status: RecruitmentStatus
  note: string
  /** `declined`·`expired` 일 때만 채워진다. */
  close_reason: CloseReason | null
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

// ============================================================================
// AI 수업 설계 도우미 (ADR-017·018·019)
// ============================================================================

/**
 * 과거 회차 설문 집계. 같은 기관 + 같은 분야의 지난 회차에서 나온다.
 *
 * **응답이 5건 미만이면 이 값을 만들지 않는다 (`null`).** 응답 2건짜리 회차의
 * "관심 분야 50% 코딩"은 분포가 아니라 특정 학생 한 명의 답이고, 담당 교사는 누가
 * 응답했는지 대체로 알고 있다. 가명코드로 막아 둔 것을 집계가 우회하게 두지 않는다 (ADR-018).
 */
export type PriorFeedback = {
  session_count: number
  response_count: number
  avg_satisfaction: number
  /** 후속 의향 3 이상 비율 (0~1). */
  followup_ratio: number
  top_interests: { field: string; count: number }[]
  /** `want_to_learn` 에서 반복된 표현. 마스킹을 통과한 텍스트에서만 뽑는다. */
  repeated_phrases: string[]
}

/** 교안 생성에 들어간 조건. 재현과 검수를 위해 그대로 저장한다 (ADR-017). */
export type LessonPlanInputs = {
  session_title: string
  field: Field
  grade_band: GradeBand
  expected_students: number
  duration_minutes: number
  venue: Venue
  class_traits: ClassTrait[]
  equipment: string[]
  program_title: string | null
  program_outline: string[]
  /** 5건 미만이면 `null`. 화면에 "아직 반영할 응답이 없습니다"로 표시된다. */
  prior: PriorFeedback | null
}

export type LessonPhase = '도입' | '전개' | '마무리'

/**
 * 차시 한 단계. **난이도 분기가 이 타입의 존재 이유다** — 강사가 가장 자주 포기하는 것이
 * 진도 편차 대응이고, 그게 `fast`·`slow` 두 줄이다.
 */
export type LessonStep = {
  phase: LessonPhase
  title: string
  minutes: number
  base: string
  /** 빨리 끝낸 학생. */
  fast: string
  /** 어려워하는 학생. */
  slow: string
  /** 그 회차에 해당 특성이 있을 때만 채워진다. 없으면 빈 배열. */
  accommodations: { trait: ClassTrait; how: string }[]
}

export type LessonPlanStatus = 'draft' | 'final'

/**
 * 교안. **작성 강사 · 발주 기관 · 운영자 셋만 읽는다** (ADR-019).
 * 다른 강사는 0행, anon 도 0행이며 학생·보호자에게 도달하는 경로를 만들지 않는다.
 */
export type LessonPlan = {
  id: string
  session_id: string
  instructor_id: string
  title: string
  objectives: string[]
  steps: LessonStep[]
  materials: string[]
  safety_notes: string[]
  /** 무엇이 만들었는지. 화면에 "AI" 배지를 달기 위한 값이 아니라 검수·로그용이다. */
  source: 'llm' | 'rule'
  inputs_snapshot: LessonPlanInputs
  status: LessonPlanStatus
  created_at: string
  updated_at: string
}

/** 기관용 회차 기획 초안 (ADR-021). 저장하지 않고 화면에서 폼으로 옮겨 담는다. */
export type SessionPlanDraft = {
  /** 규칙이 확정한 후보. LLM 은 이 목록 밖으로 나갈 수 없다. */
  suggested_field: Field | null
  suggested_title: string
  suggested_duration: number
  rationale: string
  instructor_requirements: string[]
  preparations: string[]
  /** 관심은 있으나 관내 공급이 0인 분야. 예산 기안의 재료가 된다. */
  unmet: { field: string; interest_count: number }[]
  supply_by_field: Record<string, number>
  source: 'llm' | 'rule'
}

/**
 * 기관용 회차 결과보고서 초안 (ADR-024 기능 4). **저장하지 않는다** — 화면에 보여주고 복사할 뿐이다.
 *
 * 제목·개요·지표·고지문은 규칙이 확정한다. LLM 은 성과·학생 의견·개선점·후속 계획·창체 참고
 * 문구의 문장만 쓰고, 숫자·이름 가드를 통과한 문장만 남는다.
 */
export type ResultReportDraft = {
  session_id: string
  /** 규칙: `${회차 제목} 운영 결과보고(초안)` */
  title: string
  /** 규칙: 일시 · 장소 · 대상(학년대) · 예상 인원 · 시수 · 분야 · 배정 강사(이름 또는 '미배정') */
  overview: { label: string; value: string }[]
  /** 응답 수 >= MIN_AGGREGATE_RESPONSES */
  sample_sufficient: boolean
  metrics: {
    response_count: number
    expected: number
    /** 정수 % */
    response_rate_pct: number
    /** 소수 첫째 자리 반올림. 표본 부족이면 null */
    satisfaction_avg: number | null
    /** 후속 의향 3점 이상 응답 수. 표본 부족이면 null */
    followup_high_count: number | null
    /** 정수 %. 표본 부족이면 null */
    followup_high_pct: number | null
    /** 관심 분야 상위 3. 표본 부족이면 [] */
    top_fields: { field: string; count: number }[]
  }
  /** 성과 요약 — 최대 4 */
  outcomes: string[]
  /** 학생 의견 요약 — 최대 4. 표본 부족이면 [] */
  student_voice: string[]
  /** 개선점 — 최대 4 */
  improvements: string[]
  /** 후속 계획 — 최대 4 */
  next_steps: string[]
  /** 창체 진로활동 기록 참고 문구 (회차 단위 활동 서술 한 문장, 150자 이내). 강사명·기관명·업체명 없음 */
  record_reference: string
  /** 규칙 고정 고지문 */
  notices: string[]
  source: 'llm' | 'rule'
}

/** 후속 과정 섭외 후보 한 명. **연락처 필드가 없다** — 화면은 공개 프로필 링크만 만든다. */
export type FollowupCandidate = {
  instructor_id: string
  name: string
  region_label: string
  /** 0 같은 시군구 · 1 인접 · 2 인접의 인접 */
  distance: number
}

/**
 * 기관용 후속 과정 제안 + 섭외 요청 문안 (ADR-024 기능 5). **저장하지 않고 자동 발송하지 않는다** —
 * 기관이 문안을 복사해 섭외 화면에서 직접 보낸다.
 *
 * 수요 숫자·분야·강사 후보·고지문은 규칙이 확정한다. LLM 은 과정 제목·차시·문안의 문장만 쓴다.
 * 모집 인원·정원·수강료·신청 필드를 두지 않는다 (ADR-023).
 */
export type FollowupPlanDraft = {
  session_id: string
  /** 표본 충분 && 후속 의향 3점 이상 응답이 1건 이상 && 그 응답에서 신산업 분야 1위가 정해짐 */
  eligible: boolean
  /** eligible 이 false 인 이유 (규칙 문장). eligible 이면 null */
  reason: string | null
  /** 전체 응답 수 */
  response_count: number
  /** 후속 의향 3점 이상 응답 수. 표본 부족이면 0 */
  demand_count: number
  /** 후속 의향 3점 이상 응답의 관심 분야 1위 (공급 유무와 무관). 없으면 null */
  field: Field | null
  field_interest_count: number
  /** 후속 의향 3점 이상 응답의 참여 가능 시간 1위 */
  top_time: string | null
  /** 기관 지역 기준 2-hop 이내에 그 분야 승인 강사가 있는지 */
  supply_status: 'available' | 'none'
  /** 규칙이 고른 후보. 최대 3 */
  candidates: FollowupCandidate[]
  suggested_title: string
  /** 차시별 한 줄. 규칙 기본 4개 */
  outline: string[]
  /** 섭외 요청 note 에 붙여 넣는 문안 (400자 이내). 후보가 없으면 '' */
  request_message: string
  notices: string[]
  source: 'llm' | 'rule'
}

/**
 * 배정 강사용 수업 회고 + 학교 제출용 결과 요약 (ADR-024 기능 6). **저장하지 않는다.**
 *
 * 강사 자신을 위한 회차 집계다. 점수·등급·순위 같은 강사 평가 필드를 두지 않고, 학생 개인을
 * 평가하지 않는다. 지표와 무엇을 지적할지(트리거)는 규칙이 정하고 LLM 은 문장만 다듬는다.
 */
export type SessionDebriefDraft = {
  session_id: string
  sample_sufficient: boolean
  metrics: {
    response_count: number
    /** 정수 % */
    response_rate_pct: number
    /** 소수 첫째 자리. 표본 부족이면 null */
    satisfaction_avg: number | null
    /** 만족도 4·5점 비율 정수 %. 표본 부족이면 null */
    high_satisfaction_pct: number | null
    /** 만족도 1·2점 비율 정수 %. 표본 부족이면 null */
    low_satisfaction_pct: number | null
    /** 후속 의향 3점 이상 비율 정수 %. 표본 부족이면 null */
    followup_high_pct: number | null
    /** 관심 분야 1위. 표본 부족이면 null */
    top_field: string | null
  }
  /** 잘 된 점 — 최대 3 */
  went_well: string[]
  /** 다음에 바꿀 점 — 최대 3 */
  change_next: string[]
  /** 학교·기관에 제출할 수업 결과 요약. 400자 이내 */
  school_summary: string
  notices: string[]
  source: 'llm' | 'rule'
}

/**
 * 보호자 문의 도우미 초안 (ADR-026). **저장하지 않는다** — 보호자가 확인하고 폼에 채울 뿐이다.
 *
 * 학년대·분야·시간대·프로그램은 규칙이 정한다. LLM 은 문의 글(`message`) 한 편만 쓴다.
 * 프로그램 항목은 공개 디렉토리 카드와 같은 정보까지다.
 */
export type InquiryAssistMatch = {
  program_id: string
  title: string
  field: Field
  format: ProgramFormat
  session_count: number
  region_label: string
  instructor_name: string
  provider_name: string | null
}

export type InquiryAssistDraft = {
  /** 보호자 설명에서 아이를 알아볼 수 있는 부분(이름·학교·연락처·나이)을 가렸는지 */
  masked: boolean
  grade_band: GradeBand | null
  field: Field | null
  times: string[]
  matches: InquiryAssistMatch[]
  /** 분야를 못 찾았으면 null — 프로그램을 고르지 않는다 */
  stage: RegionExpansion['stage'] | null
  stage_message: string | null
  message: string
  notices: string[]
  source: 'llm' | 'rule'
}
