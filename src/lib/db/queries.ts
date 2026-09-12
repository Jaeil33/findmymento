import {
  FIELDS,
  GRADE_BAND_LABEL,
  GRADE_BAND_SHORT,
  type Field,
  type Grade,
  type GradeBand,
  type Instructor,
  type Inquiry,
  type LectureSession,
  type Program,
  type ProgramFormat,
  type Provider,
  type QnaAnswer,
  type QnaQuestion,
  type UnmetDemand,
} from '@/types/domain'
import { expandRegion, regionDistance, regionName } from '@/lib/region'
import type { Dataset } from './dataset'

/** `중2` 형태. 학년을 이보다 자세히 화면에 쓰지 않는다. */
export function gradeLabel(grade: Grade): string {
  return `${GRADE_BAND_SHORT[grade.band]}${grade.year}`
}

export function gradeBandLabel(band: GradeBand): string {
  return GRADE_BAND_LABEL[band]
}

// ──────────────────────────────────────────────────────────────
// 공급 — 승인된 강사만이 어디에든 노출된다 (E-11)
// ──────────────────────────────────────────────────────────────

export function approvedInstructors(ds: Dataset): Instructor[] {
  return ds.instructors.filter((i) => i.status === 'approved')
}

/** 공개 노출 가능한 프로그램. 강사 상태를 여기서 한 번만 걸러 모든 화면이 재사용한다. */
export function publicPrograms(ds: Dataset): Program[] {
  const ok = new Set(approvedInstructors(ds).map((i) => i.id))
  return ds.programs.filter((p) => ok.has(p.instructor_id))
}

export type SupplySummary = {
  providerCount: number
  instructorCount: number
  programCount: number
  coveredFields: Field[]
  uncoveredFields: Field[]
  /** `등록 업체 1곳 · 강사 6명` — 기관 화면에 이 사실을 그대로 쓴다 (UI_GUIDE 안전규칙 5). */
  sentence: string
}

export function supplySummary(ds: Dataset): SupplySummary {
  const approved = approvedInstructors(ds)
  const covered = new Set(approved.flatMap((i) => i.fields))
  const providerIds = new Set(approved.map((i) => i.provider_id).filter(Boolean))
  const providerCount = ds.providers.filter(
    (p) => p.status === 'approved' && providerIds.has(p.id),
  ).length

  return {
    providerCount,
    instructorCount: approved.length,
    programCount: publicPrograms(ds).length,
    coveredFields: FIELDS.filter((f) => covered.has(f)),
    uncoveredFields: FIELDS.filter((f) => !covered.has(f)),
    sentence: `등록 업체 ${providerCount}곳 · 강사 ${approved.length}명 · 프로그램 ${publicPrograms(ds).length}개`,
  }
}

/**
 * 분야별 승인 강사 수. `regionCode` 를 주면 2-hop 이내로 한정한다.
 * 0인 분야가 곧 미충족 수요이고, 리포트·대시보드가 같은 기준을 쓰도록 한 곳에 둔다 (E-16).
 */
export function supplyByField(ds: Dataset, regionCode?: string): Record<string, number> {
  const out: Record<string, number> = {}
  for (const f of FIELDS) {
    out[f] = approvedInstructors(ds).filter(
      (i) => i.fields.includes(f) && (!regionCode || regionDistance(regionCode, i.region_code) <= 2),
    ).length
  }
  return out
}

// ──────────────────────────────────────────────────────────────
// 공개 디렉토리
// ──────────────────────────────────────────────────────────────

export type ProgramCard = {
  program: Program
  instructor: Instructor
  provider: Provider | null
  regionLabel: string
  distance: 0 | 1 | 2 | 3
}

export type DirectoryFilter = {
  regionCode?: string
  field?: Field
  gradeBand?: GradeBand
  format?: ProgramFormat
}

export type DirectoryResult = {
  items: ProgramCard[]
  /** 어느 단계에서 찾았는지. 화면에 그대로 노출한다 (E-07). */
  stage: 'same' | 'adjacent' | 'two_hop' | 'none' | 'all'
  originCode: string | null
  stageCodes: string[]
}

function cardOf(ds: Dataset, p: Program, origin: string | null): ProgramCard | null {
  const instructor = ds.instructors.find((i) => i.id === p.instructor_id)
  if (!instructor || instructor.status !== 'approved') return null
  const provider = instructor.provider_id
    ? (ds.providers.find((v) => v.id === instructor.provider_id) ?? null)
    : null
  return {
    program: p,
    instructor,
    provider,
    regionLabel: regionName(instructor.region_code),
    distance: origin ? regionDistance(origin, instructor.region_code) : 3,
  }
}

/**
 * 지역 기준 단계 확장을 포함한 디렉토리 조회.
 * 0건이면 1-hop, 그래도 0건이면 2-hop 까지 넓히고, 어느 단계였는지 돌려준다.
 */
export function searchDirectory(ds: Dataset, filter: DirectoryFilter): DirectoryResult {
  const base = publicPrograms(ds).filter((p) => {
    if (filter.field && p.field !== filter.field) return false
    if (filter.gradeBand && !p.target_grades.includes(filter.gradeBand)) return false
    if (filter.format && p.format !== filter.format) return false
    return true
  })

  const regionOf = (p: Program) =>
    ds.instructors.find((i) => i.id === p.instructor_id)?.region_code ?? ''

  if (!filter.regionCode) {
    return {
      items: sortCards(base.map((p) => cardOf(ds, p, null)).filter(isCard)),
      stage: 'all',
      originCode: null,
      stageCodes: [],
    }
  }

  const origin = filter.regionCode
  const inCodes = (codes: string[]) => base.filter((p) => codes.includes(regionOf(p)))
  const expansion = expandRegion(origin, (codes) => inCodes(codes).length > 0)

  const matched = expansion.stage === 'none' ? [] : inCodes(expansion.codes)

  return {
    items: sortCards(matched.map((p) => cardOf(ds, p, origin)).filter(isCard)),
    stage: expansion.stage,
    originCode: origin,
    stageCodes: expansion.codes,
  }
}

function isCard(c: ProgramCard | null): c is ProgramCard {
  return c !== null
}

/** 가까운 순 → 회차 많은 순. 업체·구독 여부를 정렬에 절대 반영하지 않는다 (ADR-009). */
function sortCards(items: ProgramCard[]): ProgramCard[] {
  return [...items].sort(
    (a, b) =>
      a.distance - b.distance ||
      b.program.session_count - a.program.session_count ||
      a.program.title.localeCompare(b.program.title, 'ko'),
  )
}

export function programDetail(ds: Dataset, id: string): ProgramCard | null {
  const p = publicPrograms(ds).find((x) => x.id === id)
  if (!p) return null
  return cardOf(ds, p, null)
}

export function instructorDetail(
  ds: Dataset,
  id: string,
): { instructor: Instructor; provider: Provider | null; programs: Program[] } | null {
  const instructor = ds.instructors.find((i) => i.id === id && i.status === 'approved')
  if (!instructor) return null
  return {
    instructor,
    provider: instructor.provider_id
      ? (ds.providers.find((p) => p.id === instructor.provider_id) ?? null)
      : null,
    programs: ds.programs.filter((p) => p.instructor_id === id),
  }
}

// ──────────────────────────────────────────────────────────────
// 회차 · 설문
// ──────────────────────────────────────────────────────────────

export type SessionContext = {
  session: LectureSession
  orgName: string
  orgType: string
  /** 배정 강사 **이름만**. 연락처는 어떤 경로로도 함께 내려가지 않는다. */
  instructorName: string | null
  closed: boolean
}

export function sessionByEntryCode(ds: Dataset, code: string, now = new Date()): SessionContext | null {
  const normalized = code.trim()
  const session = ds.lectureSessions.find((s) => s.entry_code === normalized)
  if (!session) return null
  const org = ds.organizations.find((o) => o.id === session.org_id)
  const instructor = session.instructor_id
    ? ds.instructors.find((i) => i.id === session.instructor_id)
    : undefined

  return {
    session,
    orgName: org?.name ?? '기관',
    orgType: org?.type ?? 'youth_center',
    instructorName: instructor?.name ?? null,
    closed: isClosed(session, now),
  }
}

/** 마감 후 제출은 거부된다. 404 가 아니라 안내 화면으로 보낸다 (E-01·E-17). */
export function isClosed(session: LectureSession, now = new Date()): boolean {
  if (session.status === 'closed') return true
  return new Date(session.closes_at).getTime() < now.getTime()
}

export function studentByPseudoCode(
  ds: Dataset,
  orgId: string,
  code: string,
): { id: string; grade: Grade } | null {
  const s = ds.students.find((x) => x.org_id === orgId && x.pseudo_code === code.trim())
  return s ? { id: s.id, grade: s.grade } : null
}

export function alreadyResponded(ds: Dataset, sessionId: string, studentId: string): boolean {
  return ds.surveyResponses.some((r) => r.session_id === sessionId && r.student_id === studentId)
}

// ──────────────────────────────────────────────────────────────
// 리포트 집계 — 기관·강사 공용. **집계치만.** 학생 단위 원본은 이 함수가 내보내지 않는다.
// ──────────────────────────────────────────────────────────────

export const SATISFACTION_LABEL: Record<number, string> = {
  1: '별로였어요',
  2: '그냥 그랬어요',
  3: '보통이에요',
  4: '좋았어요',
  5: '정말 좋았어요',
}

export const FOLLOWUP_LABEL: Record<number, string> = {
  1: '아니요',
  2: '잘 모르겠어요',
  3: '조금 배워보고 싶어요',
  4: '많이 배워보고 싶어요',
}

export type SessionReport = {
  session: LectureSession
  orgName: string
  instructorName: string | null
  responseCount: number
  /** 익명 응답 수를 따로 표기한다 — 한 기기를 돌려 쓴 경우를 기관이 판단해야 한다 (E-04). */
  anonymousCount: number
  codedCount: number
  expected: number
  responseRate: number
  satisfactionAvg: number
  satisfactionDist: { value: number; label: string; count: number }[]
  /** 이 숫자가 파일럿의 1차 전환 지표다. 만족도보다 크게 보여준다 (SURVEY.md). */
  followupAvg: number
  followupDist: { value: number; label: string; count: number }[]
  followupHighCount: number
  followupHighRate: number
  fieldCounts: { field: string; count: number }[]
  timeCounts: { label: string; count: number }[]
  /** 자유서술 인용구. 마스킹을 통과한 텍스트만 저장돼 있다 (E-08). */
  quotes: { text: string; gradeLabel: string }[]
  desiredJobs: { label: string; count: number }[]
}

export function sessionReport(ds: Dataset, sessionId: string): SessionReport | null {
  const session = ds.lectureSessions.find((s) => s.id === sessionId)
  if (!session) return null

  const rows = ds.surveyResponses.filter((r) => r.session_id === sessionId)
  const n = rows.length
  const org = ds.organizations.find((o) => o.id === session.org_id)
  const instructor = session.instructor_id
    ? ds.instructors.find((i) => i.id === session.instructor_id)
    : undefined

  const avg = (xs: number[]) => (xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length)
  const count = (pred: (v: number) => boolean, get: (r: (typeof rows)[number]) => number) =>
    rows.filter((r) => pred(get(r))).length

  const fieldMap = new Map<string, number>()
  for (const r of rows) for (const f of r.interest_fields) fieldMap.set(f, (fieldMap.get(f) ?? 0) + 1)

  const timeMap = new Map<string, number>()
  for (const r of rows) for (const t of r.available_times) timeMap.set(t, (timeMap.get(t) ?? 0) + 1)

  const jobMap = new Map<string, number>()
  for (const r of rows) {
    const j = r.desired_job?.trim()
    if (j) jobMap.set(j, (jobMap.get(j) ?? 0) + 1)
  }

  const high = count((v) => v >= 3, (r) => r.followup_intent)

  return {
    session,
    orgName: org?.name ?? '기관',
    instructorName: instructor?.name ?? null,
    responseCount: n,
    anonymousCount: rows.filter((r) => r.student_id === null).length,
    codedCount: rows.filter((r) => r.student_id !== null).length,
    expected: session.expected_students,
    responseRate: session.expected_students > 0 ? n / session.expected_students : 0,
    satisfactionAvg: avg(rows.map((r) => r.satisfaction)),
    satisfactionDist: [5, 4, 3, 2, 1].map((v) => ({
      value: v,
      label: SATISFACTION_LABEL[v]!,
      count: rows.filter((r) => r.satisfaction === v).length,
    })),
    followupAvg: avg(rows.map((r) => r.followup_intent)),
    followupDist: [4, 3, 2, 1].map((v) => ({
      value: v,
      label: FOLLOWUP_LABEL[v]!,
      count: rows.filter((r) => r.followup_intent === v).length,
    })),
    followupHighCount: high,
    followupHighRate: n > 0 ? high / n : 0,
    fieldCounts: [...fieldMap.entries()]
      .map(([field, c]) => ({ field, count: c }))
      .sort((a, b) => b.count - a.count),
    timeCounts: [...timeMap.entries()]
      .map(([label, c]) => ({ label, count: c }))
      .sort((a, b) => b.count - a.count),
    quotes: rows
      .filter((r) => r.want_to_learn && r.want_to_learn.trim().length > 6)
      .slice(0, 8)
      .map((r) => ({ text: r.want_to_learn!, gradeLabel: gradeLabel(r.grade) })),
    desiredJobs: [...jobMap.entries()]
      .map(([label, c]) => ({ label, count: c }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6),
  }
}

export type OrgSessionRow = {
  session: LectureSession
  responseCount: number
  instructorName: string | null
  /** 강사를 배정하지 않은 회차 — QR·리포트를 강사가 못 본다 (E-23). */
  unassigned: boolean
  /** 응답 0건 — 강사가 마무리 안내를 빼먹은 신호다 (E-24). */
  zeroResponse: boolean
  closed: boolean
}

export function orgSessionRows(ds: Dataset, orgId: string, now = new Date()): OrgSessionRow[] {
  return ds.lectureSessions
    .filter((s) => s.org_id === orgId)
    .map((s) => {
      const responseCount = ds.surveyResponses.filter((r) => r.session_id === s.id).length
      return {
        session: s,
        responseCount,
        instructorName: s.instructor_id
          ? (ds.instructors.find((i) => i.id === s.instructor_id)?.name ?? null)
          : null,
        unassigned: s.instructor_id === null,
        zeroResponse: responseCount === 0,
        closed: isClosed(s, now),
      }
    })
    .sort((a, b) => b.session.held_on.localeCompare(a.session.held_on))
}

export type DemandCluster = {
  field: string
  gradeBand: GradeBand
  count: number
  /** 후속 의향 3 이상인 응답만 센 값. 수요로 쓸 수 있는 숫자는 이쪽이다. */
  intentCount: number
  quotes: string[]
  supplyCount: number
}

/** 분야 × 학년대 수요 클러스터. 자유서술 인용구를 함께 보여준다 (UC-18). */
export function demandClusters(ds: Dataset, orgId: string): DemandCluster[] {
  const sessionIds = new Set(ds.lectureSessions.filter((s) => s.org_id === orgId).map((s) => s.id))
  const rows = ds.surveyResponses.filter((r) => sessionIds.has(r.session_id))
  const approved = approvedInstructors(ds)

  const map = new Map<string, DemandCluster>()
  for (const r of rows) {
    for (const field of r.interest_fields) {
      const key = `${field}__${r.grade.band}`
      const entry =
        map.get(key) ??
        ({
          field,
          gradeBand: r.grade.band,
          count: 0,
          intentCount: 0,
          quotes: [],
          supplyCount: approved.filter((i) => (i.fields as string[]).includes(field)).length,
        } satisfies DemandCluster)
      entry.count += 1
      if (r.followup_intent >= 3) entry.intentCount += 1
      if (r.want_to_learn && entry.quotes.length < 3) entry.quotes.push(r.want_to_learn)
      map.set(key, entry)
    }
  }

  return [...map.values()].sort((a, b) => b.intentCount - a.intentCount || b.count - a.count)
}

/**
 * 미충족 수요 — 관심은 있는데 지역 공급이 0인 분야.
 * 파일럿에서 가장 많이 쌓일 데이터이고, 그대로 강사 영업·예산 기안 근거가 된다 (E-16).
 */
export function unmetDemand(ds: Dataset, orgId: string): UnmetDemand[] {
  const org = ds.organizations.find((o) => o.id === orgId)
  const regionCode = org?.region_code ?? ''

  return demandClusters(ds, orgId)
    .filter((c) => c.field !== '아직 잘 모르겠어요')
    .map((c) => {
      // 같은 시군구 + 인접까지 넓혀도 공급이 없으면 미충족이다.
      const supply = approvedInstructors(ds).filter(
        (i) => (i.fields as string[]).includes(c.field) && regionDistance(regionCode, i.region_code) <= 2,
      ).length
      return {
        field: c.field as Field,
        region_code: regionCode,
        grade_band: c.gradeBand,
        interest_count: c.count,
        supply_count: supply,
      }
    })
    .filter((d) => d.supply_count === 0 && d.interest_count > 0)
    .sort((a, b) => b.interest_count - a.interest_count)
}

/** 강사 화면용 지역 수요. **집계치만** 내보낸다 — 학생 단위 행은 포함하지 않는다 (UC-15). */
export function regionDemand(
  ds: Dataset,
  regionCode: string,
): { field: string; gradeBand: GradeBand; intentCount: number; regionLabel: string }[] {
  const orgIds = new Set(
    ds.organizations.filter((o) => regionDistance(regionCode, o.region_code) <= 1).map((o) => o.id),
  )
  const sessionIds = new Set(ds.lectureSessions.filter((s) => orgIds.has(s.org_id)).map((s) => s.id))
  const rows = ds.surveyResponses.filter(
    (r) => sessionIds.has(r.session_id) && r.followup_intent >= 3,
  )

  const map = new Map<string, { field: string; gradeBand: GradeBand; intentCount: number }>()
  for (const r of rows) {
    for (const f of r.interest_fields) {
      if (f === '아직 잘 모르겠어요') continue
      const key = `${f}__${r.grade.band}`
      const e = map.get(key) ?? { field: f, gradeBand: r.grade.band, intentCount: 0 }
      e.intentCount += 1
      map.set(key, e)
    }
  }

  return [...map.values()]
    .sort((a, b) => b.intentCount - a.intentCount)
    .map((e) => ({ ...e, regionLabel: regionName(regionCode) }))
}

// ──────────────────────────────────────────────────────────────
// 관심 표현 · 동의 · 섭외
// ──────────────────────────────────────────────────────────────

export type InterestRow = {
  id: string
  alias: string
  targetLabel: string
  targetField: string
  instructorName: string
  sessionTitle: string
  status: string
  createdAt: string
  consentRecorded: boolean
}

export function interestRows(ds: Dataset, orgId: string): InterestRow[] {
  const sessionIds = new Set(ds.lectureSessions.filter((s) => s.org_id === orgId).map((s) => s.id))

  return ds.interests
    .filter((i) => sessionIds.has(i.session_id))
    .map((i) => {
      const program = i.target_type === 'program' ? ds.programs.find((p) => p.id === i.target_id) : undefined
      const instructorId = program?.instructor_id ?? (i.target_type === 'instructor' ? i.target_id : null)
      const instructor = instructorId ? ds.instructors.find((x) => x.id === instructorId) : undefined
      const session = ds.lectureSessions.find((s) => s.id === i.session_id)

      return {
        id: i.id,
        alias: i.student_alias,
        targetLabel: program?.title ?? (instructor ? `${instructor.name} 강사` : '대상 미지정'),
        targetField: program?.field ?? instructor?.fields[0] ?? '-',
        instructorName: instructor?.name ?? '-',
        sessionTitle: session?.title ?? '-',
        status: i.status,
        createdAt: i.created_at,
        consentRecorded: ds.consents.some((c) => c.interest_id === i.id),
      }
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export type RecruitmentRow = {
  id: string
  instructorName: string
  instructorRegion: string
  field: Field
  demandCount: number
  status: string
  note: string
  createdAt: string
  /** 거절된 경우 같은 분야 대체 강사를 제안한다 (E-15). */
  alternatives: { id: string; name: string; regionLabel: string }[]
}

export function recruitmentRows(ds: Dataset, orgId: string): RecruitmentRow[] {
  const org = ds.organizations.find((o) => o.id === orgId)

  return ds.recruitmentRequests
    .filter((r) => r.org_id === orgId)
    .map((r) => {
      const instructor = ds.instructors.find((i) => i.id === r.instructor_id)
      const alternatives =
        r.status === 'declined'
          ? approvedInstructors(ds)
              .filter(
                (i) =>
                  i.id !== r.instructor_id &&
                  i.fields.includes(r.field) &&
                  regionDistance(org?.region_code ?? '', i.region_code) <= 2,
              )
              .slice(0, 3)
              .map((i) => ({ id: i.id, name: i.name, regionLabel: regionName(i.region_code) }))
          : []

      return {
        id: r.id,
        instructorName: instructor?.name ?? '-',
        instructorRegion: regionName(instructor?.region_code ?? ''),
        field: r.field,
        demandCount: r.demand_count,
        status: r.status,
        note: r.note,
        createdAt: r.created_at,
        alternatives,
      }
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

/** 기관이 섭외를 보낼 후보. 수요 분야 기준으로만 정렬한다 (ADR-009). */
export function recruitmentCandidates(
  ds: Dataset,
  orgId: string,
): { instructor: Instructor; provider: Provider | null; regionLabel: string; distance: number; demand: number }[] {
  const org = ds.organizations.find((o) => o.id === orgId)
  const clusters = demandClusters(ds, orgId)
  const demandByField = new Map<string, number>()
  for (const c of clusters) demandByField.set(c.field, (demandByField.get(c.field) ?? 0) + c.intentCount)

  return approvedInstructors(ds)
    .map((i) => ({
      instructor: i,
      provider: i.provider_id ? (ds.providers.find((p) => p.id === i.provider_id) ?? null) : null,
      regionLabel: regionName(i.region_code),
      distance: regionDistance(org?.region_code ?? '', i.region_code),
      demand: Math.max(...i.fields.map((f) => demandByField.get(f) ?? 0), 0),
    }))
    .filter((c) => c.distance <= 2)
    .sort((a, b) => b.demand - a.demand || a.distance - b.distance)
}

// ──────────────────────────────────────────────────────────────
// 강사 워크스페이스
// ──────────────────────────────────────────────────────────────

export function instructorSessions(ds: Dataset, instructorId: string, now = new Date()) {
  return ds.lectureSessions
    .filter((s) => s.instructor_id === instructorId)
    .map((s) => ({
      session: s,
      orgName: ds.organizations.find((o) => o.id === s.org_id)?.name ?? '기관',
      responseCount: ds.surveyResponses.filter((r) => r.session_id === s.id).length,
      closed: isClosed(s, now),
    }))
    .sort((a, b) => b.session.held_on.localeCompare(a.session.held_on))
}

/** 배정된 보호자 문의 리드. `assigned_instructor_id` 가 자기인 것만 (UC-33). */
export function instructorLeads(ds: Dataset, instructorId: string): Inquiry[] {
  return ds.inquiries
    .filter((q) => q.assigned_instructor_id === instructorId && q.status !== 'rejected')
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
}

export function recruitmentForInstructor(ds: Dataset, instructorId: string) {
  return ds.recruitmentRequests
    .filter((r) => r.instructor_id === instructorId)
    .map((r) => ({
      request: r,
      orgName: ds.organizations.find((o) => o.id === r.org_id)?.name ?? '기관',
      orgRegion: regionName(ds.organizations.find((o) => o.id === r.org_id)?.region_code ?? ''),
    }))
    .sort((a, b) => b.request.created_at.localeCompare(a.request.created_at))
}

// ──────────────────────────────────────────────────────────────
// Q&A — 공개 스레드만
// ──────────────────────────────────────────────────────────────

export type QnaThread = {
  question: QnaQuestion
  answers: { answer: QnaAnswer; instructorName: string }[]
  hoursWaiting: number
  unanswered: boolean
}

export function qnaThreads(
  ds: Dataset,
  opts: { field?: Field; includeHidden?: boolean; orgId?: string } = {},
  now = new Date(),
): QnaThread[] {
  return ds.qnaQuestions
    .filter((q) => (opts.includeHidden ? true : q.visibility === 'public'))
    .filter((q) => (opts.field ? q.field === opts.field : true))
    .filter((q) => (opts.orgId ? q.org_id === opts.orgId : true))
    .map((q) => {
      const answers = ds.qnaAnswers
        .filter((a) => a.question_id === q.id)
        .map((a) => ({
          answer: a,
          instructorName: ds.instructors.find((i) => i.id === a.instructor_id)?.name ?? '강사',
        }))
      const hours = Math.max(
        0,
        Math.round((now.getTime() - new Date(q.created_at).getTime()) / 3_600_000),
      )
      return { question: q, answers, hoursWaiting: hours, unanswered: answers.length === 0 }
    })
    .sort((a, b) => b.question.created_at.localeCompare(a.question.created_at))
}

/** 48시간 초과 미답변 큐 (E-20). */
export function unansweredQueue(ds: Dataset, thresholdHours = 48, now = new Date()): QnaThread[] {
  return qnaThreads(ds, { includeHidden: false }, now)
    .filter((t) => t.unanswered && t.hoursWaiting >= thresholdHours)
    .sort((a, b) => b.hoursWaiting - a.hoursWaiting)
}

// ──────────────────────────────────────────────────────────────
// 운영자
// ──────────────────────────────────────────────────────────────

export function reviewQueue(ds: Dataset) {
  return ds.instructors
    .filter((i) => i.status === 'pending')
    .map((i) => ({
      instructor: i,
      provider: i.provider_id ? (ds.providers.find((p) => p.id === i.provider_id) ?? null) : null,
      regionLabel: regionName(i.region_code),
      verifications: ds.instructorVerifications.filter((v) => v.instructor_id === i.id),
      /** 성범죄경력 조회 증빙이 없으면 승인 불가 — 화면에서 이 사실을 분명히 한다. */
      hasCriminalRecordCheck: ds.instructorVerifications.some(
        (v) => v.instructor_id === i.id && v.type === 'criminal_record_check',
      ),
    }))
}

export function inquiryRows(ds: Dataset) {
  return ds.inquiries
    .map((q) => ({
      inquiry: q,
      assignedName: q.assigned_instructor_id
        ? (ds.instructors.find((i) => i.id === q.assigned_instructor_id)?.name ?? null)
        : null,
      regionLabel: regionName(q.region_code),
      /** 배정 후보 — 같은 분야 + 2-hop 이내 승인 강사. */
      candidates: approvedInstructors(ds)
        .filter((i) => i.fields.includes(q.field) && regionDistance(q.region_code, i.region_code) <= 2)
        .map((i) => ({ id: i.id, name: i.name, regionLabel: regionName(i.region_code) })),
    }))
    .sort((a, b) => b.inquiry.created_at.localeCompare(a.inquiry.created_at))
}

export function invitationRows(ds: Dataset, now = new Date()) {
  return ds.invitations
    .map((v) => ({
      invitation: v,
      orgName: v.org_id ? (ds.organizations.find((o) => o.id === v.org_id)?.name ?? null) : null,
      providerName: v.provider_id
        ? (ds.providers.find((p) => p.id === v.provider_id)?.name ?? null)
        : null,
      expired: new Date(v.expires_at).getTime() < now.getTime(),
      accepted: v.accepted_at !== null,
    }))
    .sort((a, b) => b.invitation.expires_at.localeCompare(a.invitation.expires_at))
}

/** 회차별 가명코드 목록. 인쇄해서 스티커·명찰로 배부한다 (UC-02). */
export function sessionStudents(ds: Dataset, sessionId: string) {
  const session = ds.lectureSessions.find((s) => s.id === sessionId)
  if (!session) return []
  return ds.students
    .filter((s) => s.org_id === session.org_id)
    .filter((s) => s.grade.band === session.grade_band)
    .map((s) => ({
      code: s.pseudo_code,
      gradeLabel: gradeLabel(s.grade),
      responded: ds.surveyResponses.some(
        (r) => r.session_id === sessionId && r.student_id === s.id,
      ),
    }))
    .sort((a, b) => a.code.localeCompare(b.code))
}
