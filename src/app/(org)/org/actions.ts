'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getActor } from '@/lib/auth/actor'
import { loadDataset } from '@/lib/db/dataset'
import {
  assignSessionInstructor,
  insertLectureSession,
  insertRecruitmentRequest,
  issuePseudoCodes,
  recordConsent,
  setQuestionVisibility,
  setSessionStatus,
  updateInterestStatus,
} from '@/lib/db/ops'
import {
  FIELDS,
  isClassTrait,
  isVenue,
  type Field,
  type GradeBand,
  type InterestStatus,
  type Venue,
} from '@/types/domain'

/**
 * 기관·학교 담당자 서버 액션.
 *
 * 모든 액션이 **먼저 `getActor()` 로 역할을 확인하고, 대상이 자기 기관 것인지 확인한다.**
 * 실 DB 에서는 RLS 가 같은 일을 한 번 더 하지만, 애플리케이션에서도 막는다 —
 * 두 겹 중 하나가 빠지는 쪽이 사고가 난다.
 */
async function requireOrg() {
  const actor = await getActor()
  if (!actor || actor.role !== 'org_member') redirect('/login')
  return actor
}

function asField(v: unknown): Field | null {
  return typeof v === 'string' && (FIELDS as readonly string[]).includes(v) ? (v as Field) : null
}

function asBand(v: unknown): GradeBand | null {
  return v === 'elementary' || v === 'middle' || v === 'high' ? v : null
}

export async function createSession(formData: FormData) {
  const actor = await requireOrg()

  const title = String(formData.get('title') ?? '').trim()
  const field = asField(formData.get('field'))
  const heldOn = String(formData.get('heldOn') ?? '')
  const closesOn = String(formData.get('closesOn') ?? '')
  const gradeBand = asBand(formData.get('gradeBand'))
  const expected = Number(formData.get('expectedStudents') ?? 0)
  const instructorId = String(formData.get('instructorId') ?? '') || null

  // ── 수업 조건 (ADR-016).
  const duration = Number(formData.get('durationMinutes') ?? 50)
  const venueRaw = String(formData.get('venue') ?? '교실')
  const venue: Venue = isVenue(venueRaw) ? venueRaw : '교실'
  // **고정 목록 밖의 값은 여기서 전부 버린다.** 자유 텍스트가 DB 에 들어가는 경로를 만들지 않는다.
  const classTraits = formData
    .getAll('classTraits')
    .map((v) => String(v))
    .filter(isClassTrait)
  const equipment = String(formData.get('equipment') ?? '')
    .split(/[,\n]/)
    .map((v) => v.trim())
    .filter((v) => v.length > 0 && v.length <= 40)
    .slice(0, 10)

  if (!title || !field || !heldOn || !closesOn || !gradeBand || !Number.isFinite(expected)) {
    redirect('/org/sessions/new?error=1')
  }

  // 배정 강사는 승인된 강사여야 한다 (E-11).
  if (instructorId) {
    const ds = await loadDataset()
    const ok = ds.instructors.some((i) => i.id === instructorId && i.status === 'approved')
    if (!ok) redirect('/org/sessions/new?error=instructor')
  }

  const { id } = await insertLectureSession({
    orgId: actor.orgId,
    title,
    field,
    heldOn,
    closesAt: `${closesOn}T23:59:00+09:00`,
    gradeBand,
    expectedStudents: Math.max(1, Math.min(500, Math.round(expected))),
    instructorId,
    durationMinutes: Math.max(20, Math.min(300, Math.round(Number.isFinite(duration) ? duration : 50))),
    venue,
    classTraits,
    equipment,
  })

  revalidatePath('/org/sessions')
  redirect(`/org/sessions/${id}`)
}

/** 자기 기관 회차인지 확인한다. 아니면 아무 일도 하지 않는다. */
async function ownSession(orgId: string, sessionId: string) {
  const ds = await loadDataset()
  return ds.lectureSessions.find((s) => s.id === sessionId && s.org_id === orgId) ?? null
}

export async function toggleSessionStatus(formData: FormData) {
  const actor = await requireOrg()
  const sessionId = String(formData.get('sessionId') ?? '')
  const session = await ownSession(actor.orgId, sessionId)
  if (!session) return

  await setSessionStatus(sessionId, session.status === 'open' ? 'closed' : 'open')
  revalidatePath(`/org/sessions/${sessionId}`)
  revalidatePath('/org/sessions')
}

export async function assignInstructor(formData: FormData) {
  const actor = await requireOrg()
  const sessionId = String(formData.get('sessionId') ?? '')
  const instructorId = String(formData.get('instructorId') ?? '') || null
  const session = await ownSession(actor.orgId, sessionId)
  if (!session) return

  if (instructorId) {
    const ds = await loadDataset()
    if (!ds.instructors.some((i) => i.id === instructorId && i.status === 'approved')) return
  }

  await assignSessionInstructor(sessionId, instructorId)
  revalidatePath(`/org/sessions/${sessionId}`)
  revalidatePath('/org/sessions')
}

export async function issueCodes(formData: FormData) {
  const actor = await requireOrg()
  const sessionId = String(formData.get('sessionId') ?? '')
  const count = Number(formData.get('count') ?? 0)
  const year = Number(formData.get('gradeYear') ?? 1)
  const session = await ownSession(actor.orgId, sessionId)
  if (!session || !Number.isFinite(count)) return

  await issuePseudoCodes(actor.orgId, session.grade_band, year, Math.round(count))
  revalidatePath(`/org/sessions/${sessionId}/codes`)
}

const ALLOWED_INTEREST: InterestStatus[] = [
  'org_review',
  'rejected',
  'consent_pending',
  'consent_denied',
  'recruiting',
  'connected',
]

export async function setInterest(formData: FormData) {
  const actor = await requireOrg()
  const id = String(formData.get('interestId') ?? '')
  const status = String(formData.get('status') ?? '') as InterestStatus
  if (!ALLOWED_INTEREST.includes(status)) return

  // 자기 기관 회차에서 나온 관심 표현만 다룰 수 있다.
  const ds = await loadDataset()
  const interest = ds.interests.find((i) => i.id === id)
  const session = interest
    ? ds.lectureSessions.find((s) => s.id === interest.session_id && s.org_id === actor.orgId)
    : undefined
  if (!interest || !session) return

  await updateInterestStatus(id, status)
  revalidatePath('/org/interests')
}

export async function recordConsentAction(formData: FormData) {
  const actor = await requireOrg()
  const id = String(formData.get('interestId') ?? '')
  const methodRaw = String(formData.get('method') ?? 'paper')
  const method = methodRaw === 'phone' || methodRaw === 'messenger' ? methodRaw : 'paper'

  const ds = await loadDataset()
  const interest = ds.interests.find((i) => i.id === id)
  const session = interest
    ? ds.lectureSessions.find((s) => s.id === interest.session_id && s.org_id === actor.orgId)
    : undefined
  if (!interest || !session) return

  await recordConsent(id, actor.memberId, method)
  revalidatePath('/org/interests')
}

export async function sendRecruitment(formData: FormData) {
  const actor = await requireOrg()
  const instructorId = String(formData.get('instructorId') ?? '')
  const field = asField(formData.get('field'))
  const demandCount = Number(formData.get('demandCount') ?? 0)
  const note = String(formData.get('note') ?? '').trim().slice(0, 500)

  const ds = await loadDataset()
  if (!field || !ds.instructors.some((i) => i.id === instructorId && i.status === 'approved')) return

  await insertRecruitmentRequest({
    orgId: actor.orgId,
    instructorId,
    field,
    demandCount: Number.isFinite(demandCount) ? Math.max(0, Math.round(demandCount)) : 0,
    note,
  })
  revalidatePath('/org/recruitment')
}

/** Q&A 숨김. 기관 담당자가 모더레이터다 (UC-22). 자기 기관에 묶인 질문만. */
export async function hideQuestion(formData: FormData) {
  const actor = await requireOrg()
  const id = String(formData.get('questionId') ?? '')
  const hide = String(formData.get('hide') ?? 'true') === 'true'

  const ds = await loadDataset()
  const q = ds.qnaQuestions.find((x) => x.id === id && x.org_id === actor.orgId)
  if (!q) return

  await setQuestionVisibility(id, hide ? 'hidden' : 'public')
  revalidatePath('/org')
  revalidatePath('/qna')
}
