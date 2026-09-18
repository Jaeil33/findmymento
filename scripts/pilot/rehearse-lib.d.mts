// rehearse-lib.mjs 타입 선언. tests/pilot-rehearse.test.ts 가 strict 로 import 한다 (tsconfig allowJs: false).

export declare const FAKE_PHONE: string

export type SyntheticPayload = {
  entryCode: string
  pseudoCode: null
  grade: { band: string; year: number }
  satisfaction: number
  followupIntent: number
  interestFields: string[]
  wantToLearn: string
  desiredJob: string
  availableTimes: string[]
}

export declare function syntheticAnswer(
  i: number,
  ctx: { entryCode: string; band: string; field: unknown; fields: readonly string[]; fieldUnsure?: string | null },
): { probedMasking: boolean; payload: SyntheticPayload }
