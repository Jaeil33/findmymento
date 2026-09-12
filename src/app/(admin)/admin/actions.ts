'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getActor } from '@/lib/auth/actor'
import { loadDataset } from '@/lib/db/dataset'
import {
  assignInquiry,
  insertInvitation,
  setInstructorStatus,
  setOrgMemberActive,
  setQuestionVisibility,
} from '@/lib/db/ops'
import type { Invitation } from '@/types/domain'

/**
 * 운영자 서버 액션. 심사·초대·문의 배정은 사람이 한다 (ADR-008).
 *
 * `service_role` 을 쓰는 작업들이므로 **여기서만** 호출한다.
 */
async function requireAdmin() {
  const actor = await getActor()
  if (!actor || actor.role !== 'admin') redirect('/login')
  return actor
}

/**
 * 강사 승인. **성범죄경력 조회 증빙이 없으면 승인하지 않는다.**
 * 화면에서 버튼을 막고, 여기서 한 번 더 막는다 — 화면만 막으면 언젠가 뚫린다.
 */
export async function approveInstructor(formData: FormData) {
  await requireAdmin()
  const id = String(formData.get('instructorId') ?? '')

  const ds = await loadDataset()
  const hasCheck = ds.instructorVerifications.some(
    (v) => v.instructor_id === id && v.type === 'criminal_record_check',
  )
  if (!hasCheck) redirect('/admin/instructors?error=verification')

  await setInstructorStatus(id, 'approved')
  revalidatePath('/admin/instructors')
  revalidatePath('/programs')
}

export async function rejectInstructor(formData: FormData) {
  await requireAdmin()
  const id = String(formData.get('instructorId') ?? '')
  await setInstructorStatus(id, 'rejected')
  revalidatePath('/admin/instructors')
}

export async function suspendInstructor(formData: FormData) {
  await requireAdmin()
  const id = String(formData.get('instructorId') ?? '')
  await setInstructorStatus(id, 'suspended')
  revalidatePath('/admin/instructors')
  revalidatePath('/programs')
}

export async function restoreInstructor(formData: FormData) {
  await requireAdmin()
  const id = String(formData.get('instructorId') ?? '')
  await setInstructorStatus(id, 'approved')
  revalidatePath('/admin/instructors')
  revalidatePath('/programs')
}

/** 문의 배정. 배정된 강사에게만 리드로 보인다. */
export async function assignInquiryAction(formData: FormData) {
  const actor = await requireAdmin()
  const id = String(formData.get('inquiryId') ?? '')
  const instructorId = String(formData.get('instructorId') ?? '')
  if (!instructorId) return

  const ds = await loadDataset()
  if (!ds.instructors.some((i) => i.id === instructorId && i.status === 'approved')) return

  await assignInquiry(id, instructorId, actor.displayName, 'assigned')
  revalidatePath('/admin/inquiries')
}

export async function rejectInquiryAction(formData: FormData) {
  const actor = await requireAdmin()
  const id = String(formData.get('inquiryId') ?? '')
  await assignInquiry(id, null, actor.displayName, 'rejected')
  revalidatePath('/admin/inquiries')
}

export async function markInquiryDelivered(formData: FormData) {
  const actor = await requireAdmin()
  const id = String(formData.get('inquiryId') ?? '')
  const ds = await loadDataset()
  const row = ds.inquiries.find((q) => q.id === id)
  if (!row?.assigned_instructor_id) return
  await assignInquiry(id, row.assigned_instructor_id, actor.displayName, 'delivered')
  revalidatePath('/admin/inquiries')
}

export async function sendInvitation(formData: FormData) {
  const actor = await requireAdmin()
  const email = String(formData.get('email') ?? '').trim()
  const roleRaw = String(formData.get('role') ?? '')
  const role: Invitation['role'] =
    roleRaw === 'instructor' || roleRaw === 'admin' ? roleRaw : 'org_member'
  const orgId = String(formData.get('orgId') ?? '') || null
  const providerId = String(formData.get('providerId') ?? '') || null

  if (!/^[\w.+-]+@[\w-]+\.[\w.]{2,}$/.test(email)) redirect('/admin/invitations?error=email')

  await insertInvitation({
    email,
    role,
    orgId: role === 'org_member' ? orgId : null,
    providerId: role === 'instructor' ? providerId : null,
    createdBy: actor.displayName,
    expiresInDays: 7,
  })

  revalidatePath('/admin/invitations')
}

/** 담당자 비활성화 (E-13). 계정 삭제가 아니라 접근 차단이다. */
export async function toggleMemberActive(formData: FormData) {
  await requireAdmin()
  const id = String(formData.get('memberId') ?? '')
  const active = String(formData.get('active') ?? 'false') === 'true'
  await setOrgMemberActive(id, active)
  revalidatePath('/admin/invitations')
}

export async function moderateQuestion(formData: FormData) {
  await requireAdmin()
  const id = String(formData.get('questionId') ?? '')
  const hide = String(formData.get('hide') ?? 'true') === 'true'
  await setQuestionVisibility(id, hide ? 'hidden' : 'public')
  revalidatePath('/admin/qna')
  revalidatePath('/qna')
}
