/**
 * 스튜디오 API 입력 검증. **라우트에서만 쓴다.**
 *
 * 핵심 규칙 두 개:
 * 1. **회차에 붙은 생성이면 수업 조건을 클라이언트에서 받지 않는다.** 학년대·인원·시수·장소·장비는
 *    `lecture_sessions` 행이 정하고 강사는 읽기만 한다 (ADR-015·016). 본문의 값은 무시한다.
 * 2. 주제는 마스킹을 통과한 값만 쓴다 — 강사가 적는 칸이지만 학생 이름이 들어올 수 있다.
 */

import { maskForStorage } from '@/lib/moderation'
import { CONTENT_KINDS, DIFFICULTY_VOTES, SHAPE_FORMS } from '@/types/studio'
import type { ContentKind, DifficultyVote, ShapeForm, StudioSpec } from '@/types/studio'
import { VENUES, type GradeBand, type LectureSession, type Venue } from '@/types/domain'
import type { Invalid, Validated } from '@/lib/validation'

const fail = (field: string, message: string): Invalid => ({ ok: false, field, message })

const GRADE_BANDS: GradeBand[] = ['elementary', 'middle', 'high']

function intIn(value: unknown, lo: number, hi: number): number | null {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isInteger(n) || n < lo || n > hi) return null
  return n
}

export type GenerateBody = {
  kind: ContentKind
  /** 회차에 붙인 생성이면 그 회차 id */
  sessionId: string | null
  /** 같은 산출물의 새 버전이면 계보 id */
  lineageId: string | null
  /** 강사가 고른 레시피(선택). 없으면 LLM·규칙이 고른다 */
  recipeId: string | null
  spec: StudioSpec
}

/**
 * 생성 요청 검증. `session` 이 주어지면(= 배정 확인까지 끝난 회차) 수업 조건은 그 행에서 가져온다.
 */
export function validateGenerate(
  body: unknown,
  session: LectureSession | null,
): Validated<GenerateBody> {
  if (typeof body !== 'object' || body === null) return fail('body', '요청을 읽을 수 없습니다.')
  const b = body as Record<string, unknown>

  const kind = typeof b.kind === 'string' ? b.kind : ''
  if (!(CONTENT_KINDS as readonly string[]).includes(kind)) {
    return fail('kind', '만들 콘텐츠 종류를 고르세요.')
  }

  const rawTopic = typeof b.topic === 'string' ? b.topic.trim() : ''
  if (rawTopic.length < 2) return fail('topic', '교육 주제를 2자 이상 적어 주세요.')
  if (rawTopic.length > 80) return fail('topic', '교육 주제는 80자 이내로 적어 주세요.')
  // 학생 이름·연락처가 섞여 들어오면 가린 값을 쓴다. 거부하지 않는다 — 강사의 입력을 버리면 다시 안 쓴다.
  const topic = maskForStorage(rawTopic) ?? ''
  if (topic.length < 2) return fail('topic', '교육 주제를 다시 적어 주세요.')

  /**
   * 2D 인가 입체인가 (ADR-037). **수업 조건이 아니라 강사의 선택**이라, 회차에서 생성할 때도
   * 본문 값을 쓴다 — 회차 행이 정하는 학년대·인원·시수·장소·장비와 다르다.
   *
   * 비어 있으면 `solid` 다. 이 칸이 생기기 전의 클라이언트·저장 행과 같은 결과를 내야 한다
   * (`formOf` 와 같은 기본값). 화면의 기본값은 `flat` 이고 그건 폼이 정한다.
   */
  const rawForm = typeof b.form === 'string' ? b.form.trim() : ''
  if (rawForm !== '' && !(SHAPE_FORMS as readonly string[]).includes(rawForm)) {
    return fail('form', '2D·3D 중 하나를 고르세요.')
  }
  const form: ShapeForm = rawForm === '' ? 'solid' : (rawForm as ShapeForm)

  const sessionId = typeof b.sessionId === 'string' && b.sessionId.trim() !== '' ? b.sessionId.trim() : null
  const lineageId =
    typeof b.lineageId === 'string' && b.lineageId.trim() !== '' ? b.lineageId.trim() : null
  const recipeId =
    typeof b.recipeId === 'string' && b.recipeId.trim() !== '' ? b.recipeId.trim() : null

  // ── 회차에 붙은 생성: 수업 조건은 회차 행이 정한다 (ADR-016) ──────────────
  if (session) {
    return {
      ok: true,
      value: {
        kind: kind as ContentKind,
        sessionId: session.id,
        lineageId,
        recipeId,
        spec: {
          kind: kind as ContentKind,
          grade_band: session.grade_band,
          student_count: session.expected_students,
          duration_minutes: session.duration_minutes,
          venue: session.venue,
          equipment: session.equipment,
          topic,
          session_id: session.id,
          form,
        },
      },
    }
  }

  // ── 라이브러리 단독 생성: 강사가 조건을 직접 넣는다 ───────────────────────
  const gradeBand = typeof b.gradeBand === 'string' ? (b.gradeBand as GradeBand) : null
  if (!gradeBand || !GRADE_BANDS.includes(gradeBand)) {
    return fail('gradeBand', '학년대를 고르세요.')
  }

  const studentCount = intIn(b.studentCount, 1, 200)
  if (studentCount === null) return fail('studentCount', '학생 수를 1~200명으로 적어 주세요.')

  const durationMinutes = intIn(b.durationMinutes, 20, 300)
  if (durationMinutes === null) {
    return fail('durationMinutes', '수업 시간을 20~300분으로 적어 주세요.')
  }

  const venue = typeof b.venue === 'string' ? (b.venue as Venue) : null
  if (!venue || !(VENUES as readonly string[]).includes(venue)) {
    return fail('venue', '수업 장소를 고르세요.')
  }

  const equipmentRaw = Array.isArray(b.equipment) ? b.equipment : []
  const equipment = equipmentRaw
    .filter((v): v is string => typeof v === 'string')
    .map((v) => v.trim())
    .filter((v) => v.length > 0 && v.length <= 40)
    .slice(0, 12)

  return {
    ok: true,
    value: {
      kind: kind as ContentKind,
      sessionId,
      lineageId,
      recipeId,
      spec: {
        kind: kind as ContentKind,
        grade_band: gradeBand,
        student_count: studentCount,
        duration_minutes: durationMinutes,
        venue,
        equipment,
        topic,
        session_id: null,
        form,
      },
    },
  }
}

export type FeedbackBody = {
  contentId: string
  attemptedCount: number
  completedCount: number
  actualMinutes: number
  difficultyVote: DifficultyVote
  note: string | null
}

/**
 * 성과 피드백 검증. **회차 단위 집계만 받는다** (ADR-032) —
 * 학생 이름·명단을 받는 필드가 없고, 추가하지 말 것.
 */
export function validateFeedback(body: unknown): Validated<FeedbackBody> {
  if (typeof body !== 'object' || body === null) return fail('body', '요청을 읽을 수 없습니다.')
  const b = body as Record<string, unknown>

  const contentId = typeof b.contentId === 'string' ? b.contentId.trim() : ''
  if (contentId === '') return fail('contentId', '어느 산출물의 결과인지 알 수 없습니다.')

  const attemptedCount = intIn(b.attemptedCount, 1, 200)
  if (attemptedCount === null) return fail('attemptedCount', '시도한 학생 수를 1~200명으로 적어 주세요.')

  const completedCount = intIn(b.completedCount, 0, 200)
  if (completedCount === null) return fail('completedCount', '완성한 학생 수를 적어 주세요.')
  if (completedCount > attemptedCount) {
    return fail('completedCount', '완성 인원이 시도 인원보다 많을 수 없습니다.')
  }

  const actualMinutes = intIn(b.actualMinutes, 1, 600)
  if (actualMinutes === null) return fail('actualMinutes', '실제 걸린 시간을 분으로 적어 주세요.')

  const vote = typeof b.difficultyVote === 'string' ? b.difficultyVote : ''
  if (!(DIFFICULTY_VOTES as readonly string[]).includes(vote)) {
    return fail('difficultyVote', '체감 난이도를 고르세요.')
  }

  const rawNote = typeof b.note === 'string' ? b.note.trim() : ''
  if (rawNote.length > 500) return fail('note', '의견은 500자 이내로 적어 주세요.')
  // 학생 이름이 섞여 들어오면 가린 값을 저장한다.
  const note = rawNote === '' ? null : maskForStorage(rawNote)

  return {
    ok: true,
    value: {
      contentId,
      attemptedCount,
      completedCount,
      actualMinutes,
      difficultyVote: vote as DifficultyVote,
      note,
    },
  }
}
