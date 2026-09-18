import { homePathFor, type Actor } from '@/lib/auth/actor'
import type { Dataset } from '@/lib/db/dataset'
import { instructorSessions } from '@/lib/db/queries'

/** 한국 날짜(YYYY-MM-DD). 회차의 `held_on` 과 비교한다. */
export function kstToday(now = new Date()): string {
  return new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

/**
 * 로그인 직후 갈 곳.
 *
 * 강사에게 **오늘 배정된, 응답을 받는 중인** 회차가 있으면 곧장 교실 전체화면 QR(`/project/{id}`)로 보낸다.
 * 교실에서 로그인하자마자 학생들이 찍을 수 있게 하기 위해서다. QR 화면 자체의 접근 권한 검사
 * (배정된 강사만)는 그 페이지가 다시 한다. 없으면 역할별 첫 화면이다.
 */
export function landingPathFor(actor: Actor, ds: Dataset, now = new Date()): string {
  if (actor.role === 'instructor') {
    const today = kstToday(now)
    const pick = instructorSessions(ds, actor.instructorId, now).find(
      (s) => !s.closed && s.session.held_on === today,
    )
    if (pick) return `/project/${pick.session.id}`
  }
  return homePathFor(actor.role)
}
