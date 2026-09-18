import {
  FIELDS,
  FIELD_UNSURE,
  type Field,
  type Grade,
  type GradeBand,
} from '@/types/domain'
import { getRegion } from '@/lib/region'

/**
 * 서버 검증. 클라이언트 검증은 UX 이고 **진짜 검증은 여기뿐**이다.
 * 쓰기 경로(설문·Q&A·보호자 문의)는 전부 이 모듈을 지난다.
 */

export type Valid<T> = { ok: true; value: T }
export type Invalid = { ok: false; field: string; message: string }
export type Validated<T> = Valid<T> | Invalid

const fail = (field: string, message: string): Invalid => ({ ok: false, field, message })

const GRADE_YEARS: Record<GradeBand, number[]> = {
  elementary: [1, 2, 3, 4, 5, 6],
  middle: [1, 2, 3],
  high: [1, 2, 3],
}

function asRecord(body: unknown): Record<string, unknown> {
  return typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {}
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

function strArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').map((s) => s.trim()) : []
}

export function parseGrade(v: unknown): Grade | null {
  const r = asRecord(v)
  const band = str(r.band) as GradeBand
  const year = Number(r.year)
  if (!(band in GRADE_YEARS)) return null
  if (!GRADE_YEARS[band].includes(year)) return null
  return { band, year }
}

export function isField(v: string): v is Field {
  return (FIELDS as readonly string[]).includes(v)
}

// ──────────────────────────────────────────────────────────────
// 설문 (SURVEY.md 문항 정의와 1:1)
// ──────────────────────────────────────────────────────────────

export type SurveyBody = {
  entryCode: string
  pseudoCode: string | null
  grade: Grade
  satisfaction: number
  followupIntent: number
  interestFields: string[]
  wantToLearn: string | null
  desiredJob: string | null
  availableTimes: string[]
}

export function validateSurvey(body: unknown): Validated<SurveyBody> {
  const r = asRecord(body)

  const entryCode = str(r.entryCode)
  if (!/^\d{6}$/.test(entryCode)) return fail('entryCode', '참여 코드가 올바르지 않아요.')

  const grade = parseGrade(r.grade)
  if (!grade) return fail('grade', '학년을 선택해 주세요.')

  const satisfaction = Number(r.satisfaction)
  if (!Number.isInteger(satisfaction) || satisfaction < 1 || satisfaction > 5) {
    return fail('satisfaction', '오늘 수업이 어땠는지 선택해 주세요.')
  }

  // 만족도와 후속 의향은 **별개 문항**이다. 둘을 합치면 파일럿의 1차 전환 지표가 사라진다.
  const followupIntent = Number(r.followupIntent)
  if (!Number.isInteger(followupIntent) || followupIntent < 1 || followupIntent > 4) {
    return fail('followupIntent', '더 배워보고 싶은지 선택해 주세요.')
  }

  const interestFields = strArray(r.interestFields)
  if (interestFields.length === 0) return fail('interestFields', '관심 있는 걸 하나는 골라 주세요.')
  if (interestFields.length > 3) return fail('interestFields', '최대 3개까지 고를 수 있어요.')
  const allowed = [...FIELDS, FIELD_UNSURE] as string[]
  if (interestFields.some((f) => !allowed.includes(f))) {
    return fail('interestFields', '선택할 수 없는 항목이 있어요.')
  }
  // "아직 잘 모르겠어요"는 단독 선택이다.
  if (interestFields.includes(FIELD_UNSURE) && interestFields.length > 1) {
    return fail('interestFields', '"아직 잘 모르겠어요"는 하나만 고를 수 있어요.')
  }

  const wantToLearn = str(r.wantToLearn)
  if (wantToLearn.length > 200) return fail('wantToLearn', '200자 안으로 써 주세요.')

  const desiredJob = str(r.desiredJob)
  if (desiredJob.length > 50) return fail('desiredJob', '50자 안으로 써 주세요.')

  const pseudo = str(r.pseudoCode)

  return {
    ok: true,
    value: {
      entryCode,
      pseudoCode: pseudo === '' ? null : pseudo,
      grade,
      satisfaction,
      followupIntent,
      interestFields,
      wantToLearn: wantToLearn === '' ? null : wantToLearn,
      desiredJob: desiredJob === '' ? null : desiredJob,
      availableTimes: strArray(r.availableTimes).slice(0, 5),
    },
  }
}

// ──────────────────────────────────────────────────────────────
// Q&A 질문
// ──────────────────────────────────────────────────────────────

export type QuestionBody = {
  entryCode: string | null
  field: Field
  body: string
  gradeBand: GradeBand
}

export function validateQuestion(body: unknown): Validated<QuestionBody> {
  const r = asRecord(body)

  const field = str(r.field)
  if (!isField(field)) return fail('field', '분야를 선택해 주세요.')

  const text = str(r.body)
  if (text.length < 5) return fail('body', '질문을 조금 더 자세히 써 주세요.')
  if (text.length > 500) return fail('body', '500자 안으로 써 주세요.')

  const gradeBand = str(r.gradeBand) as GradeBand
  if (!(gradeBand in GRADE_YEARS)) return fail('gradeBand', '학년대를 선택해 주세요.')

  const entryCode = str(r.entryCode)

  return {
    ok: true,
    value: { entryCode: entryCode === '' ? null : entryCode, field, body: text, gradeBand },
  }
}

// ──────────────────────────────────────────────────────────────
// 보호자 문의 (ADR-014)
// ──────────────────────────────────────────────────────────────

export type InquiryBody = {
  guardianName: string
  guardianContact: string
  regionCode: string
  gradeBand: GradeBand
  field: Field
  targetType: 'program' | 'instructor' | 'none'
  targetId: string | null
  message: string
  consent: true
}

const PHONE = /^0\d{1,2}-?\d{3,4}-?\d{4}$/
const EMAIL = /^[\w.+-]+@[\w-]+\.[\w.]{2,}$/

/**
 * 아이 이름·학교·생년월일 필드는 **받지 않는다.** 폼에 입력란이 없고 여기서도 읽지 않는다.
 * 필드가 body 에 섞여 와도 무시된다 — 입력란을 만들지 않는 것이 1차 방어, 이 함수가 2차 방어다.
 */
export function validateInquiry(body: unknown): Validated<InquiryBody> {
  const r = asRecord(body)

  const guardianName = str(r.guardianName)
  if (guardianName.length < 2) return fail('guardianName', '보호자 이름을 입력해 주세요.')
  if (guardianName.length > 20) return fail('guardianName', '이름이 너무 길어요.')

  const guardianContact = str(r.guardianContact)
  if (!PHONE.test(guardianContact) && !EMAIL.test(guardianContact)) {
    return fail('guardianContact', '연락 가능한 휴대폰 번호 또는 이메일을 입력해 주세요.')
  }

  const regionCode = str(r.regionCode)
  if (!getRegion(regionCode)) return fail('regionCode', '지역을 선택해 주세요.')

  const gradeBand = str(r.gradeBand) as GradeBand
  if (!(gradeBand in GRADE_YEARS)) return fail('gradeBand', '학년대를 선택해 주세요.')

  const field = str(r.field)
  if (!isField(field)) return fail('field', '관심 분야를 선택해 주세요.')

  const targetTypeRaw = str(r.targetType)
  const targetType: InquiryBody['targetType'] =
    targetTypeRaw === 'program' || targetTypeRaw === 'instructor' ? targetTypeRaw : 'none'
  const targetId = str(r.targetId)

  const message = str(r.message)
  if (message.length > 300) return fail('message', '요청 내용은 300자 안으로 써 주세요.')

  if (r.consent !== true) {
    return fail('consent', '개인정보 수집·이용에 동의해 주셔야 접수할 수 있어요.')
  }

  return {
    ok: true,
    value: {
      guardianName,
      guardianContact,
      regionCode,
      gradeBand,
      field,
      targetType,
      targetId: targetType === 'none' || targetId === '' ? null : targetId,
      message,
      consent: true,
    },
  }
}

// ──────────────────────────────────────────────────────────────
// 레이트 리밋 (E-21)
// ──────────────────────────────────────────────────────────────

const buckets = new Map<string, number[]>()

/**
 * 학생 경로의 IP 당 1분 한도.
 *
 * 한 반은 학교 와이파이 하나 = **공인 IP 하나**로 들어온다. 예전 한도(설문 12 · 추천 20 · 관심 15)로는
 * 13번째 학생부터 "잠시 후 다시 시도해 주세요"를 봤다. 한 반(최대 40명)이 1분 안에 제출해도 넉넉하고,
 * 관심 표현은 한 학생이 카드 여러 장에 누를 수 있으므로 더 높다.
 */
export const STUDENT_RATE_LIMITS = { survey: 60, recommend: 60, interest: 120 } as const

/**
 * 아주 단순한 슬라이딩 윈도. 서버 인스턴스 메모리이므로 완벽한 방어는 아니지만,
 * 폼 도배를 막는 1차 장벽으로는 충분하다. 운영 단계에서 필요하면 DB·엣지로 옮긴다.
 */
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now()
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs)
  if (hits.length >= limit) {
    buckets.set(key, hits)
    return false
  }
  hits.push(now)
  buckets.set(key, hits)
  return true
}

export function clientKey(headers: Headers, suffix: string): string {
  const ip =
    headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    headers.get('x-real-ip') ??
    'unknown'
  return `${suffix}:${ip}`
}
