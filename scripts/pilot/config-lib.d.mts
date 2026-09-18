// config-lib.mjs 타입 선언. tests/pilot-config.test.ts 가 strict 로 import 한다 (tsconfig allowJs: false).

export type Region = { code: string; name: string; label: string; neighbors?: string[] }

export type Catalog = {
  enums: Record<string, string[]>
  ranges: Record<string, { min: number; max: number }>
  venues: string[]
  fields: string[]
  fieldUnsure?: string | null
  regions: Region[]
}

export type PilotProgram = {
  title: string
  field: string
  target_grades: string[]
  format: string
  session_count: number
  summary: string
  outline: string[]
}

export type PilotConfig = {
  org: { name: string; type: string; region_code: string }
  instructor: { name: string; region_code: string; fields: string[]; bio: string }
  programs: PilotProgram[]
  session: {
    title: string
    field: string
    held_on: string
    closes_at: string
    grade_band: string
    expected_students: number
    duration_minutes: number
    venue: string
  }
  orgMember: { email: string; display_name: string } | null
}

export type ConfigResult = { errors: string[]; warnings: string[]; value: PilotConfig | null }

export declare function parseEnvFile(text: string): Record<string, string>
export declare function keyRole(key: unknown): string
export declare function keyProblems(env: Record<string, string | undefined>): string[]
export declare function parseSqlEnums(sql: string): Record<string, string[]>
export declare function parseSqlRanges(sql: string): Record<string, { min: number; max: number }>
export declare function parseVenues(sql: string): string[]
export declare function parseFields(domainTs: string): string[]
export declare function parseFieldUnsure(domainTs: string): string | null
export declare function suggestRegions(regions: readonly Region[], query: string): string[]
export declare function normalizeSite(url: unknown): string | null
export declare function isLocalSite(url: unknown): boolean
export declare function defaultClosesAt(heldOn: string): string
export declare function placeholderHits(raw: unknown): string[]
export declare function validateConfig(
  raw: unknown,
  catalog: Catalog,
  opts?: { now?: Date; allowCustomField?: boolean },
): ConfigResult
