import { loadDataset } from '@/lib/db/dataset'
import { alreadyResponded, isClosed, sessionByEntryCode, studentByPseudoCode } from '@/lib/db/queries'
import { getServiceSupabase } from '@/lib/supabase/server'
import { isDemoMode } from '@/lib/supabase/env'
import type {
  ClassTrait,
  Field,
  Grade,
  GradeBand,
  LectureSession,
  SessionStatus,
  Venue,
} from '@/types/domain'

/**
 * 학생 경로(비로그인)의 코드 확인. **서버 전용** — 라우트 핸들러와 Server Component 에서만 부른다.
 *
 * 실 DB 에서 anon 은 lecture_sessions · students · survey_responses 를 읽을 수 없다 (RLS 설계,
 * init.sql: "학생이 코드를 입력하면 서버(anon 키가 아닌 라우트 핸들러)가 확인한다").
 * 예전에는 이 확인을 anon 클라이언트로 읽은 Dataset 위에서 했기 때문에, 실 DB 에 붙으면 모든 학생이
 * "이 코드로는 들어갈 수 없어요"를 봤다. 그래서 여기서만 service_role 로 **정확히 일치하는 한 건**을 읽는다.
 *
 * - 목록을 긁지 않는다. 코드 형식(6자리 숫자)을 먼저 확인하고, 모든 조회에 `eq` 필터를 건다.
 * - service_role 키가 없으면 **닫힌 쪽으로** 실패한다 (null / false). 학생은 "코드를 다시 확인" 안내를 본다.
 * - 데모 모드는 기존 Dataset 함수를 그대로 쓴다 — 동작이 바뀌지 않는다.
 */

export type EntryContext = {
  session: LectureSession
  orgName: string
  orgType: string
  orgRegionCode: string
  /** 배정 강사 **이름만**. 연락처는 어떤 경로로도 함께 내려가지 않는다. */
  instructorName: string | null
  closed: boolean
  /**
   * 기관이 가명코드를 한 번이라도 발급했는지. 아니면 설문은 코드 입력 없이 익명으로 시작한다 —
   * 교실 화면에 입장 코드 6자리가 떠 있는데 "참여 코드 6자리"를 또 물으면 학생은 같은 숫자를 넣는다.
   */
  pseudoCodesIssued: boolean
}

const CODE_RE = /^\d{6}$/

type Row = Record<string, unknown>

function missingServiceKey() {
  console.error(
    '[student-gate] SUPABASE_SERVICE_ROLE_KEY 가 없어 학생 입장 코드를 확인할 수 없습니다. 학생 설문이 열리지 않습니다.',
  )
}

function mapSession(r: Row): LectureSession {
  return {
    id: String(r.id),
    org_id: String(r.org_id),
    instructor_id: (r.instructor_id as string | null) ?? null,
    title: String(r.title ?? ''),
    field: r.field as Field,
    held_on: String(r.held_on ?? ''),
    closes_at: String(r.closes_at ?? ''),
    status: ((r.status as SessionStatus | null) ?? 'open') as SessionStatus,
    entry_code: String(r.entry_code),
    grade_band: ((r.grade_band as GradeBand | null) ?? 'middle') as GradeBand,
    expected_students: Number(r.expected_students ?? 0),
    duration_minutes: Number(r.duration_minutes ?? 50),
    venue: ((r.venue as Venue | null) ?? '교실') as Venue,
    class_traits: (r.class_traits as ClassTrait[] | null) ?? [],
    equipment: (r.equipment as string[] | null) ?? [],
  }
}

export async function loadEntryContext(code: string, now = new Date()): Promise<EntryContext | null> {
  const normalized = code.trim()

  if (isDemoMode()) {
    const ds = await loadDataset()
    const ctx = sessionByEntryCode(ds, normalized, now)
    if (!ctx) return null
    const org = ds.organizations.find((o) => o.id === ctx.session.org_id)
    return {
      ...ctx,
      orgRegionCode: org?.region_code ?? '',
      pseudoCodesIssued: ds.students.some((s) => s.org_id === ctx.session.org_id),
    }
  }

  if (!CODE_RE.test(normalized)) return null
  const sb = getServiceSupabase()
  if (!sb) {
    missingServiceKey()
    return null
  }

  const found = await sb.from('lecture_sessions').select('*').eq('entry_code', normalized).maybeSingle()
  if (found.error || !found.data) return null
  const session = mapSession(found.data as Row)

  const [org, instructor, issued] = await Promise.all([
    sb.from('organizations').select('name, type, region_code').eq('id', session.org_id).maybeSingle(),
    session.instructor_id
      ? sb.from('instructors').select('name').eq('id', session.instructor_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    // 행을 읽지 않고 개수만 센다.
    sb.from('students').select('id', { count: 'exact', head: true }).eq('org_id', session.org_id),
  ])

  const orgRow = (org.data as Row | null) ?? null
  const instructorRow = (instructor.data as Row | null) ?? null

  return {
    session,
    orgName: orgRow?.name ? String(orgRow.name) : '기관',
    orgType: orgRow?.type ? String(orgRow.type) : 'youth_center',
    orgRegionCode: orgRow?.region_code ? String(orgRow.region_code) : '',
    instructorName: instructorRow?.name ? String(instructorRow.name) : null,
    closed: isClosed(session, now),
    // 셀 수 없으면 기존 흐름(코드 입력 + "코드 없이 참여하기")을 보여준다 — 둘 다 설문은 낼 수 있다.
    pseudoCodesIssued: issued.error ? true : (issued.count ?? 0) > 0,
  }
}

export async function findStudentByPseudoCode(
  orgId: string,
  code: string,
): Promise<{ id: string; grade: Grade } | null> {
  const normalized = code.trim()

  if (isDemoMode()) {
    return studentByPseudoCode(await loadDataset(), orgId, normalized)
  }

  if (!CODE_RE.test(normalized)) return null
  const sb = getServiceSupabase()
  if (!sb) {
    missingServiceKey()
    return null
  }

  const { data, error } = await sb
    .from('students')
    .select('id, grade_band, grade_year')
    .eq('org_id', orgId)
    .eq('pseudo_code', normalized)
    .maybeSingle()
  if (error || !data) return null
  const r = data as Row
  return {
    id: String(r.id),
    grade: { band: ((r.grade_band as GradeBand | null) ?? 'middle') as GradeBand, year: Number(r.grade_year ?? 0) },
  }
}

/** 같은 회차에 이미 응답했는지. 확인할 수 없으면 false — 마지막 방어선은 DB 유니크 제약이다. */
export async function hasResponded(sessionId: string, studentId: string): Promise<boolean> {
  if (isDemoMode()) {
    return alreadyResponded(await loadDataset(), sessionId, studentId)
  }

  const sb = getServiceSupabase()
  if (!sb) return false

  const { count, error } = await sb
    .from('survey_responses')
    .select('id', { count: 'exact', head: true })
    .eq('session_id', sessionId)
    .eq('student_id', studentId)
  if (error) return false
  return (count ?? 0) > 0
}

/** 같은 가명코드의 누적 관심 분야 — 드론 2회 + 3D 1회 같은 경로를 추천에 반영한다 (E-18). */
export async function studentFieldHistory(studentId: string): Promise<string[]> {
  if (isDemoMode()) {
    const ds = await loadDataset()
    return [
      ...new Set(
        ds.surveyResponses.filter((r) => r.student_id === studentId).flatMap((r) => r.interest_fields),
      ),
    ]
  }

  const sb = getServiceSupabase()
  if (!sb) return []

  const { data, error } = await sb.from('survey_responses').select('interest_fields').eq('student_id', studentId)
  if (error || !data) return []
  return [
    ...new Set((data as Row[]).flatMap((r) => (Array.isArray(r.interest_fields) ? (r.interest_fields as string[]) : []))),
  ]
}
