// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import * as demo from '@/data/demo'
import type { Dataset } from '@/lib/db/dataset'
import { generateLessonPlan } from '@/lib/ai/lesson-plan'
import type { LectureSession, SurveyResponse } from '@/types/domain'

/**
 * 교안 초안 — **실제 Claude API 로** 확인한다 (교안 요청 모양을 바꿨을 때).
 *
 * 모의 테스트(lesson-plan-llm.test.ts)는 요청 모양과 폴백만 본다. 이 파일은 실제 키로 2번 호출해서
 * 규칙 골격이 아니라 LLM 초안이 나오는지(= 20초 제한 안에 끝나는지)와 걸리는 시간을 본다.
 * 2026-09-19 첫 파일럿에서 effort 없이 호출하자 23.8초가 걸려 기본 템플릿만 나왔다.
 *
 * 실행 조건 — 기본은 **건너뛴다** (호출마다 돈이 든다):
 *   LIVE_AI_TEST=1 npx vitest run tests/lesson-plan.live.test.ts
 * 키는 셸 환경변수 또는 `.env.local` 에서 읽는다. 키 값은 출력하지 않는다.
 */

function loadEnvLocal() {
  const file = join(process.cwd(), '.env.local')
  if (!existsSync(file)) return
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (!m) continue
    const [, key, raw] = m
    const value = raw!.replace(/^(['"])(.*)\1$/, '$2')
    if (process.env[key!] === undefined || process.env[key!] === '') process.env[key!] = value
  }
}
loadEnvLocal()

const live = process.env.LIVE_AI_TEST === '1' && Boolean(process.env.ANTHROPIC_API_KEY?.trim())

const empty: Dataset = {
  organizations: [],
  orgMembers: [],
  providers: [],
  instructors: [],
  instructorVerifications: [],
  programs: [],
  lectureSessions: [],
  students: [],
  surveyResponses: [],
  interests: [],
  consents: [],
  recruitmentRequests: [],
  lessonPlans: [],
  qnaQuestions: [],
  qnaAnswers: [],
  inquiries: [],
  invitations: [],
}

/** 파일럿과 같은 조건: 등록된 프로그램이 없는 강사, 교실 120분, 중등 15명. */
const first: LectureSession = {
  id: 'ls-live-1',
  org_id: 'org-live',
  instructor_id: 'in-live',
  title: '드론코딩 특강',
  field: '드론',
  held_on: '2026-09-19',
  closes_at: '2026-09-19T23:59:00+09:00',
  status: 'closed',
  entry_code: '900001',
  grade_band: 'middle',
  expected_students: 15,
  duration_minutes: 120,
  venue: '교실',
  class_traits: [],
  equipment: [],
}
const next: LectureSession = { ...first, id: 'ls-live-2', entry_code: '900002', status: 'open', held_on: '2026-10-10' }

/** 지난 회차 응답 13건 (가상). 5건 이상이라 다음 회차 교안 프롬프트에 집계가 들어간다. */
const pastResponses: SurveyResponse[] = Array.from({ length: 13 }, (_, i) => ({
  id: `sr-live-${i}`,
  session_id: first.id,
  student_id: null,
  grade: { band: 'middle', year: 2 },
  satisfaction: [5, 4, 4, 3][i % 4]!,
  followup_intent: i % 6 === 0 ? 2 : 4,
  interest_fields: i % 2 === 0 ? ['드론', '3D 모델링·프린팅'] : ['드론'],
  want_to_learn: i % 3 === 0 ? '드론으로 장애물 피해서 날리기' : null,
  desired_job: null,
  available_times: ['토요일'],
  created_at: '2026-09-19T11:50:00+09:00',
}))

async function timed(ds: Dataset, s: LectureSession) {
  const started = Date.now()
  const draft = await generateLessonPlan(ds, s)
  const sec = (Date.now() - started) / 1000
  console.log(
    JSON.stringify({
      session: s.id,
      source: draft.source,
      sec: sec.toFixed(1),
      prior: draft.inputs.prior?.response_count ?? null,
      steps: draft.skeleton.steps.map((st) => `[${st.phase}] ${st.title} — ${st.base}`),
    }),
  )
  return { draft, sec }
}

describe.skipIf(!live)('교안 — 실제 API', () => {
  it('첫 회차 (지난 설문 없음) — 규칙 골격이 아니라 LLM 초안이 나온다', async () => {
    const { draft } = await timed({ ...empty, ...demo }, first)
    expect(draft.inputs.prior).toBeNull()
    expect(draft.source).toBe('llm')
  }, 60_000)

  it('다음 회차 (지난 설문 13건) — 집계가 들어간 LLM 초안이 나온다', async () => {
    const ds: Dataset = {
      ...empty,
      ...demo,
      lectureSessions: [...demo.lectureSessions, first, next],
      surveyResponses: [...demo.surveyResponses, ...pastResponses],
    }
    const { draft } = await timed(ds, next)
    expect(draft.inputs.prior?.response_count).toBe(13)
    expect(draft.source).toBe('llm')
  }, 60_000)
})
