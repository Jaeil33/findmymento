# Step 0: studio-constants

## 읽어야 할 파일

- `/docs/STUDIO.md` — 물리 상수 표와 검증 항목 표. **이 문서가 유일한 출처다**
- `/docs/ADR.md` ADR-028 ~ 032
- `/CLAUDE.md` 콘텐츠 스튜디오 규칙
- `/src/types/domain.ts` — `GradeBand` · `Venue` · `Field` 를 재사용한다. 새로 만들지 마라
- `/src/lib/ai/lesson-plan.ts` — "규칙이 구조, LLM이 문장" 분업의 기존 구현. 같은 모양을 따른다

## 작업

### 1. `src/types/studio.ts`

스튜디오 도메인 타입. `domain.ts`의 타입을 import 해서 쓰고 중복 정의하지 않는다.

```ts
export const CONTENT_KINDS = ['pen3d', 'drone'] as const
export type ContentKind = (typeof CONTENT_KINDS)[number]

export type StudioSpec = {
  kind: ContentKind
  grade_band: GradeBand
  student_count: number
  duration_minutes: number
  venue: Venue
  equipment: string[]
  /** 강사가 적은 교육 주제. 마스킹 통과분만 들어온다 */
  topic: string
  /** 회차에 붙은 생성이면 회차 id, 라이브러리 단독 생성이면 null */
  session_id: string | null
}

export type Point = { x: number; y: number }          // mm
export type Stroke = { kind: 'outline' | 'fold'; points: Point[]; closed: boolean }
export type PenPart = { id; name; quantity; strokes; origin; optional }
export type PenJoint = { id; kind: 'weld' | 'slot'; a; b; length_mm?; tab_thickness_mm?; slot_width_mm?; how }
export type PenPattern = { recipe_id; title; scale; parts; joints }
export type PenMetrics = { ... }      // docs/STUDIO.md 예상 제작 시간 식의 중간값을 전부 포함
export type Severity = 'error' | 'warn'
export type Finding = { code; severity; message; where?; measured?; limit? }
export type ValidationReport = { ok: boolean; findings: Finding[] }
export type StudioStatus = 'draft' | 'validated' | 'failed' | 'approved'
export type StudioRound = { round; action: 'generated' | 'repaired'; repair: string | null; ok; findings }
```

핵심 규칙:
- `ok`는 `findings`에 `severity === 'error'`가 하나도 없다는 뜻이다. warn은 `ok`를 깨지 않는다
- SVG 문자열을 타입에 넣지 마라. 이유: 패턴에서 결정론적으로 렌더하므로 저장할 필요가 없고, 저장하면 패턴과 어긋난 SVG가 남는다

### 2. `src/lib/studio/constants.ts`

`docs/STUDIO.md`의 표를 그대로 옮긴다. **임계값은 이 파일 밖에 존재하지 않는다.**

- `BEAD_WIDTH_MM`, `CLOSED_TOLERANCE_MM`, `SLOT_CLEARANCE_MM: [0.3, 1.2]`
- `PEN_LIMITS: Record<GradeBand, { min_gap_mm; min_segment_mm; min_angle_deg; draw_speed_mm_s; max_parts; difficulty: [number, number] }>`
- `PEEL_SECONDS_PER_PART = 30`, `WELD_SECONDS_PER_JOINT = 45`
- `CLASS_OVERHEAD_MINUTES = 20`, `TIME_SAFETY = 0.85`, `TIME_TIGHT_RATIO = 0.9`
- `PAGE = { width_mm: 210, height_mm: 297, margin_mm: 10, gutter_mm: 6 }`
- `DRONE_MODELS`, `VENUE_DIMENSIONS`, `DRONE_*_CLEARANCE_CM`, `DRONE_SAFETY_NOTES`
- 장비 판별 키워드 (`PEN_EQUIPMENT_KEYWORDS`, 기체별 키워드)

### 3. `tests/studio-constants.test.ts`

**문서와 상수가 어긋나면 터지는 테스트를 먼저 쓴다.** `docs/STUDIO.md`를 읽어 표의 숫자를 뽑고
상수와 비교한다. 이 테스트가 이 step의 본체다 — 임계값을 코드에서 몰래 낮추는 것을 막는다.

## Acceptance Criteria

```bash
npx vitest run tests/studio-constants.test.ts
npm run lint
```

## 검증 절차

1. 위 커맨드 실행
2. `src/lib/studio/constants.ts` 밖에 수치 임계값이 없는지 grep 으로 확인
3. index.json 갱신

## 금지사항

- `domain.ts`의 `GradeBand`·`Venue`를 다시 정의하지 마라. 이유: 두 곳이 어긋나면 회차 조건과 스튜디오 입력이 호환되지 않는다
- 상수에 "대략"·"임시" 값을 넣지 마라. 이유: 이 숫자가 교실에서 수업이 끝나는지를 결정한다. 근거가 없으면 `docs/STUDIO.md`에 근거를 먼저 적어라
- 검증 코드(`PEN_*`·`DRONE_*`)를 자유 문자열로 쓰지 마라. 이유: 화면이 코드별로 안내 문구를 붙인다
