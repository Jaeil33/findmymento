import { CAREERS } from '@/data/careers'
import type { Dataset } from '@/lib/db/dataset'
import { GRADE_BAND_LABEL } from '@/types/domain'

/**
 * 운영자 — 수업별 설문 전체 자료.
 *
 * 응답 한 줄에 그 학생에게 **실제로 보여 준** 카드·이유·AI 여부를 붙인다. 추천 기록은 응답 id 로 잇는다.
 * 자유서술은 저장 전에 이미 가려진 값이다 (E-08). 학생 실명·학교는 애초에 저장하지 않는다.
 */

/** `recommendation_logs` 한 행. items 는 수업 추천이면 program_id, 진로 카드면 career_id (ADR-027). */
export type RecommendationLogRow = {
  id: string
  session_id: string
  response_id: string | null
  source: 'llm' | 'rule'
  stage: string
  items: { program_id?: string; career_id?: string; reason?: string }[]
  model: string | null
  latency_ms: number | null
  input_tokens: number | null
  output_tokens: number | null
  error: string | null
  created_at: string
}

export type AdminCard = { kind: '진로' | '수업'; title: string; reason: string }

export type AdminResponseRow = {
  id: string
  /** 한국 시간 HH:mm */
  time: string
  grade: string
  satisfaction: number
  followupIntent: number
  interestFields: string[]
  wantToLearn: string | null
  desiredJob: string | null
  availableTimes: string[]
  cards: AdminCard[]
  /** 추천 기록이 없으면 null (추천 화면까지 가지 않은 응답). */
  source: 'llm' | 'rule' | null
  latencyMs: number | null
  error: string | null
}

const CAREER_TITLE = new Map(CAREERS.map((c) => [c.id, c.title]))

export function kstTime(iso: string): string {
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return '-'
  return new Date(t + 9 * 60 * 60 * 1000).toISOString().slice(11, 16)
}

export function adminSessionRows(
  ds: Dataset,
  sessionId: string,
  logs: RecommendationLogRow[],
): AdminResponseRow[] {
  // 같은 응답에 기록이 여럿이면(새로고침 등) 마지막 것이 학생이 마지막으로 본 화면이다.
  const byResponse = new Map<string, RecommendationLogRow>()
  for (const l of [...logs].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    if (l.response_id) byResponse.set(l.response_id, l)
  }
  const programTitle = new Map(ds.programs.map((p) => [p.id, p.title]))

  return ds.surveyResponses
    .filter((r) => r.session_id === sessionId)
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((r) => {
      const log = byResponse.get(r.id) ?? null
      const cards: AdminCard[] = (log?.items ?? []).map((it) =>
        it.career_id
          ? { kind: '진로', title: CAREER_TITLE.get(it.career_id) ?? it.career_id, reason: it.reason ?? '' }
          : {
              kind: '수업',
              title: programTitle.get(it.program_id ?? '') ?? it.program_id ?? '-',
              reason: it.reason ?? '',
            },
      )
      return {
        id: r.id,
        time: kstTime(r.created_at),
        grade: `${GRADE_BAND_LABEL[r.grade.band]} ${r.grade.year}학년`,
        satisfaction: r.satisfaction,
        followupIntent: r.followup_intent,
        interestFields: r.interest_fields,
        wantToLearn: r.want_to_learn,
        desiredJob: r.desired_job,
        availableTimes: r.available_times,
        cards,
        source: log?.source ?? null,
        latencyMs: log?.latency_ms ?? null,
        error: log?.error ?? null,
      }
    })
}

/** Opus 5 요금 (USD / 1M 토큰). */
const PRICE = { input: 5, output: 25 }

export function aiSummary(logs: RecommendationLogRow[]) {
  const llm = logs.filter((l) => l.source === 'llm').length
  const latencies = logs.map((l) => l.latency_ms).filter((n): n is number => typeof n === 'number')
  const inputTokens = logs.reduce((a, l) => a + (l.input_tokens ?? 0), 0)
  const outputTokens = logs.reduce((a, l) => a + (l.output_tokens ?? 0), 0)
  const errors: Record<string, number> = {}
  for (const l of logs) if (l.error) errors[l.error] = (errors[l.error] ?? 0) + 1

  return {
    total: logs.length,
    llm,
    rule: logs.length - llm,
    avgLatencyMs:
      latencies.length > 0 ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : null,
    inputTokens,
    outputTokens,
    usd: (inputTokens * PRICE.input + outputTokens * PRICE.output) / 1_000_000,
    errors,
  }
}
