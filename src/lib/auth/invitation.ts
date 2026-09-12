import type { Invitation } from '@/types/domain'

/**
 * 초대 토큰 검증. 셀프 가입이 없으므로 **모든 계정이 이 경로를 지난다** (ADR-011).
 * 여기가 뚫리면 아무나 기관 담당자가 되어 그 기관 학생 데이터를 열 수 있다.
 *
 * 규칙 3개:
 * 1. 1회용 — `accepted_at` 이 있으면 거부한다.
 * 2. 만료 검증 — `expires_at` 이 지났으면 거부한다 (E-12).
 * 3. 멱등 — 같은 토큰을 두 번 수락해도 소속 행은 1개여야 한다.
 *    `already_accepted` 를 에러가 아니라 별도 상태로 구분하는 이유가 이것이다.
 */
export type InvitationCheck =
  | { ok: true; invitation: Invitation }
  | { ok: false; reason: 'not_found' | 'expired' | 'already_accepted'; message: string }

export function checkInvitation(
  invitation: Invitation | undefined | null,
  now: Date = new Date(),
): InvitationCheck {
  if (!invitation) {
    return {
      ok: false,
      reason: 'not_found',
      message: '초대 링크를 찾을 수 없어요. 초대를 보낸 담당자에게 다시 요청해 주세요.',
    }
  }

  if (invitation.accepted_at !== null) {
    return {
      ok: false,
      reason: 'already_accepted',
      message: '이미 사용된 초대예요. 로그인 화면에서 같은 이메일로 로그인해 주세요.',
    }
  }

  if (new Date(invitation.expires_at).getTime() < now.getTime()) {
    return {
      ok: false,
      reason: 'expired',
      message: '초대 링크가 만료됐어요. 담당자에게 새 초대를 요청해 주세요.',
    }
  }

  return { ok: true, invitation }
}

export const ROLE_LABEL: Record<Invitation['role'], string> = {
  org_member: '기관·학교 담당자',
  instructor: '강사',
  admin: '운영자',
}
