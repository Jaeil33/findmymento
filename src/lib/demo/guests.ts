/**
 * 계정이 **없는** 사람의 데모 입구 — 학생·보호자.
 *
 * 역할이 아니다. 쿠키를 심지 않고 권한을 주지 않는다. 실서비스에서도 학생은 기관이 나눠 준
 * 가명코드로, 보호자는 비로그인 문의 폼으로만 들어오므로(CLAUDE.md CRITICAL) 데모에서도 그 경로로
 * 곧장 들여보낸다. 역할 버튼(`lib/auth/actor.ts`)에 학생·보호자를 넣지 않는 이유가 이것이다.
 */

/** 응답을 받는 중인 3D 특강 회차(ls-2)의 입장 코드. 교실 QR 이 가리키는 주소와 같다. */
export const DEMO_STUDENT_ENTRY_CODE = '735104'

/**
 * 같은 기관이 지난 드론 회차(ls-0)에 발급한 가명코드. 이 회차에는 아직 응답하지 않았으므로
 * 설문을 끝까지 낼 수 있고, 지난 기록이 이어진 추천(E-18)을 볼 수 있다.
 * 시드에 실제로 있는 값인지는 `tests/demo-entry.test.tsx` 가 확인한다.
 */
export const DEMO_STUDENT_PSEUDO_CODE = '311009'

export type DemoGuestEntry = {
  key: 'student' | 'guardian'
  label: string
  description: string
  hint: string
  href: string
}

export function demoGuestEntries(): DemoGuestEntry[] {
  return [
    {
      key: 'student',
      label: '학생 · 계정 없음',
      description: '특강 직후 QR로 3분 설문 → 나에게 맞는 다음 교육 추천',
      hint: `참여 코드에 ${DEMO_STUDENT_PSEUDO_CODE}를 넣으면 지난 드론 특강 기록까지 이어진 추천이 나옵니다. 코드 없이 참여해도 됩니다.`,
      href: `/s/${DEMO_STUDENT_ENTRY_CODE}`,
    },
    {
      key: 'guardian',
      label: '보호자 · 계정 없음',
      description: '아이 상황을 적으면 문의 도우미가 조건·가까운 프로그램·문의 글을 정리 → 문의 접수',
      hint: '문의 폼의 "예시 문장 넣기"로 아이 이름·학교가 빠지는 모습까지 볼 수 있습니다.',
      href: '/inquiry',
    },
  ]
}
