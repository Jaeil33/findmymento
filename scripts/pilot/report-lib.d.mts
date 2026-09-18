// report-lib.mjs 타입 선언. tests/pilot-report.test.ts 가 strict 로 import 한다 (tsconfig allowJs: false).

export type CsvValue = string | number | boolean | null | undefined | readonly (string | number | null | undefined)[]

export type ResponseRow = {
  id: string
  created_at?: string | null
  student_id?: string | null
  grade_band?: string | null
  grade_year?: number | null
  satisfaction?: number | null
  followup_intent?: number | null
  interest_fields?: string[] | null
  want_to_learn?: string | null
  desired_job?: string | null
  available_times?: string[] | null
}

export type InterestRow = {
  id: string
  created_at?: string | null
  student_alias?: string | null
  target_type?: string | null
  target_id?: string | null
  status?: string | null
}

export type RecommendationItem = {
  program_id?: string | null
  programId?: string | null
  career_id?: string | null
  careerId?: string | null
  reason?: string | null
}

export type RecommendationLogRow = {
  id: string
  created_at?: string | null
  response_id?: string | null
  source?: string | null
  stage?: string | null
  items?: RecommendationItem[] | null
  model?: string | null
  latency_ms?: number | null
  input_tokens?: number | null
  output_tokens?: number | null
  error?: string | null
}

export type Pricing = { model: string; inputPerMTok: number; outputPerMTok: number }

export type AiSummary = {
  total: number
  llm: number
  rule: number
  responsesWithoutLog: number
  avgLatencyMs: number | null
  maxLatencyMs: number | null
  inputTokens: number
  outputTokens: number
  costUsd: number
  errors: { error: string; count: number }[]
  models: string[]
}

export type Summary = {
  responseCount: number
  anonymousCount: number
  expectedStudents: number | null
  responseRatePct: number | null
  satisfaction: { dist: Record<1 | 2 | 3 | 4 | 5, number>; average: number | null; topTwoPct: number | null }
  followup: { dist: Record<1 | 2 | 3 | 4, number>; atLeast3Count: number; atLeast3Pct: number | null }
  grades: { label: string; count: number }[]
  interestFields: { field: string; count: number; supplied: boolean }[]
  unsureCount: number
  unmetFields: string[]
  availableTimes: { time: string; count: number }[]
  freeTexts: { at: string | null; grade: string; wantToLearn: string; desiredJob: string }[]
  interests: { total: number; byTarget: { targetId: string; count: number }[] }
  ai: AiSummary | null
  smallSample: boolean
}

export declare const SATISFACTION_LABEL: Readonly<Record<number, string>>
export declare const FOLLOWUP_LABEL: Readonly<Record<number, string>>
export declare const GRADE_BAND_SHORT: Readonly<Record<string, string>>
export declare const GRADE_BAND_LABEL: Readonly<Record<string, string>>
export declare const FIELD_UNSURE: string
export declare const OPUS5_PRICING: Readonly<Pricing>

export declare function csvCell(value: CsvValue): string
export declare function toCsv(headers: readonly string[], rows: readonly (readonly CsvValue[])[]): string
export declare function formatKst(value: string | Date | null | undefined): string
export declare function kstStamp(date?: Date): string
export declare function gradeLabel(row: { grade_band?: string | null; grade_year?: number | null }): string
export declare function estimateCostUsd(tokens?: { inputTokens?: number; outputTokens?: number }, pricing?: Pricing): number

export declare const RESPONSE_HEADERS: readonly string[]
export declare function responseRows(responses: readonly ResponseRow[]): CsvValue[][]
export declare const INTEREST_HEADERS: readonly string[]
export declare function interestRows(interests: readonly InterestRow[], titleById?: Record<string, string>): CsvValue[][]
export declare const RECOMMENDATION_HEADERS: readonly string[]
export declare function recommendationRows(
  logs: readonly RecommendationLogRow[],
  titleById?: Record<string, string>,
): CsvValue[][]

export declare function summarize(input?: {
  responses?: readonly ResponseRow[]
  interests?: readonly InterestRow[]
  logs?: readonly RecommendationLogRow[] | null
  expectedStudents?: number | null
  suppliedFields?: readonly string[]
}): Summary

export declare function renderSummaryMarkdown(input: {
  stats: Summary
  session?: {
    title?: string
    field?: string
    held_on?: string
    entry_code?: string
    grade_band?: string
  }
  orgName?: string
  instructorName?: string | null
  exportedAt?: Date
  titleById?: Record<string, string>
}): string
