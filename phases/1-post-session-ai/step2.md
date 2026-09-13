# Step 2: result-report

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md`
- `/docs/AI.md` — "수업 후 AI — 기능 4" 와 "안전 경계"
- `/docs/ADR.md` — ADR-018, ADR-024
- `/docs/AI_RESEARCH.md` — 학교생활기록부 기재요령 제약
- `src/lib/ai/guard.ts`, `tests/ai-guard.test.ts` — step 1 산출물 (반드시 이 함수들을 쓴다)
- `src/lib/ai/session-plan.ts` — 규칙 초안 → LLM 병합 → 폴백 구조 (같은 구조로 만든다)
- `src/lib/db/queries.ts` — `sessionReport` / `SessionReport` / `gradeBandLabel`
- `src/lib/db/dataset.ts` — `Dataset`
- `src/types/domain.ts` — `SessionPlanDraft`, `FIELDS`, `GRADE_BAND_LABEL`, `LectureSession`
- `src/data/demo.ts` — 데모 회차 `ls-0`~`ls-4`와 응답
- `tests/session-plan.test.ts` — 데모 Dataset 픽스처 조립 방식

## 작업

기관·학교 담당자용 **결과보고서 초안** 모듈을 만든다. **테스트를 먼저 쓰고**(TDD) 구현한다. 라우트와 화면은 이 step에서 만들지 않는다.

### 파일

- `src/types/domain.ts` — `ResultReportDraft` 타입 추가 (`SessionPlanDraft` 아래)
- `src/lib/ai/result-report.ts` (신규)
- `tests/result-report.test.ts` (신규)

### 타입

```ts
export type ResultReportDraft = {
  session_id: string
  /** 규칙: `${회차 제목} 운영 결과보고(초안)` */
  title: string
  /** 규칙: 일시 · 장소 · 대상(학년대) · 예상 인원 · 시수 · 분야 · 배정 강사(이름 또는 '미배정') */
  overview: { label: string; value: string }[]
  /** 응답 수 >= MIN_AGGREGATE_RESPONSES */
  sample_sufficient: boolean
  metrics: {
    response_count: number
    expected: number
    /** 정수 % */
    response_rate_pct: number
    /** 소수 첫째 자리 반올림. 표본 부족이면 null */
    satisfaction_avg: number | null
    /** 후속 의향 3점 이상 응답 수. 표본 부족이면 null */
    followup_high_count: number | null
    /** 정수 %. 표본 부족이면 null */
    followup_high_pct: number | null
    /** 관심 분야 상위 3. 표본 부족이면 [] */
    top_fields: { field: string; count: number }[]
  }
  /** 성과 요약 — 최대 4 */
  outcomes: string[]
  /** 학생 의견 요약 — 최대 4. 표본 부족이면 [] */
  student_voice: string[]
  /** 개선점 — 최대 4 */
  improvements: string[]
  /** 후속 계획 — 최대 4 */
  next_steps: string[]
  /** 창체 진로활동 기록 참고 문구 (회차 단위 활동 서술 한 문장, 150자 이내). 강사명·기관명·업체명 없음 */
  record_reference: string
  /** 규칙 고정 고지문 */
  notices: string[]
  source: 'llm' | 'rule'
}
```

### 시그니처 (`src/lib/ai/result-report.ts`)

```ts
/** 회차가 없으면 null. 숫자·개요·고지문은 여기서 확정된다. */
export function ruleResultReport(ds: Dataset, sessionId: string): ResultReportDraft | null

/** numbersWithin 에 넘길 허용 숫자: metrics 의 모든 수, top_fields 의 count, 시수, 예상 인원, 일시의 연·월·일, MIN_AGGREGATE_RESPONSES, 1~4 */
export function allowedNumbers(ds: Dataset, draft: ResultReportDraft): number[]

/** LLM 문장에서 금지할 이름: 배정 강사명, 발주 기관명, 강사 소속 업체명 (없는 값은 빼고) */
export function bannedNames(ds: Dataset, sessionId: string): string[]

/** LLM 에 보낼 입력. **표본 부족이면 null** — 이 경우 LLM 을 부르지 않는다. */
export function buildLlmPayload(ds: Dataset, draft: ResultReportDraft): Record<string, unknown> | null

/** LLM 응답을 문장 필드에만 병합한다. 가드를 통과한 문장만 쓰고, 나머지는 규칙 문장을 유지한다. */
export function mergeLlmResultReport(
  draft: ResultReportDraft,
  raw: unknown,
  ctx: { allowed: number[]; banned: string[] },
): ResultReportDraft

/** 어떤 경우에도 throw 하지 않는다. 회차가 없을 때만 null. */
export async function generateResultReport(ds: Dataset, sessionId: string): Promise<ResultReportDraft | null>
```

### 핵심 규칙 (반드시 지킬 것)

1. **숫자는 규칙이 확정한다.** `sessionReport()` 값에서 계산한다. `title`·`overview`·`metrics`·`notices`·`sample_sufficient`·`session_id`는 `mergeLlmResultReport`가 절대 바꾸지 않는다.
2. **표본 부족(응답 < `MIN_AGGREGATE_RESPONSES`)**:
   - `satisfaction_avg`·`followup_high_count`·`followup_high_pct`는 null, `top_fields`·`student_voice`는 `[]`.
   - `outcomes`는 규칙 문장 1개: 응답 수와 "5건 미만이라 통계를 싣지 않습니다"를 알린다.
   - `improvements`에 "수업 마무리 3분 전에 QR 안내를 먼저 해 응답을 확보"하라는 규칙 문장을 넣는다.
   - `buildLlmPayload`는 null을 반환하고 `generateResultReport`는 LLM을 부르지 않는다.
3. **LLM 입력(payload)**: 회차 조건(분야·학년대·시수·장소) + 집계값 + `SessionReport.quotes` 중 `maskForStorage`를 다시 통과한(결과가 원문과 같은) 문장 최대 5개. **개별 응답 행·student_id·가명코드·강사명·기관명·업체명을 넣지 않는다.**
4. **병합 가드**: LLM이 준 `outcomes`·`student_voice`·`improvements`·`next_steps`의 각 문장은 `sanitizeText(·, 120)` → `numbersWithin(·, ctx.allowed, FIELDS)` → `!containsAny(·, ctx.banned)`를 모두 통과해야 한다. 통과 문장이 0개인 필드는 규칙 값을 유지한다. 목록은 최대 4개. 표본 부족 초안의 `student_voice`는 LLM이 뭘 주든 `[]`로 남는다.
5. **창체 기록 참고 문구(`record_reference`)**:
   - 규칙 문구는 회차 분야와 활동 형태만으로 쓴 한 문장이다. 예: "진로활동으로 {분야} 분야 직업인 특강에 참여하여 관련 기술을 직접 체험하고 직업 세계를 탐색함."
   - 학생 개인의 태도·성취·평가를 서술하지 않는다. 숫자를 넣지 않는다.
   - LLM 값은 `sanitizeText(·, 150)`·숫자 가드(허용 숫자 `[]`, ignore `FIELDS`)·이름 가드를 통과해야 채택한다.
6. **고지문(`notices`)** — 규칙 고정, 순서대로:
   - `초안입니다. 수치와 표현을 확인한 뒤 사용하세요.`
   - `창체 기록 참고 문구는 학교가 주최·주관한 활동에만 쓸 수 있고, AI가 만든 문장을 학교생활기록부에 그대로 입력하면 안 됩니다(2026 기재요령). 강사명·기관명·상호명은 기재할 수 없어 넣지 않았습니다.`
   - (표본 부족일 때만) `응답이 5건 미만이라 만족도·후속 의향·학생 의견을 싣지 않았습니다.`
7. LLM 호출은 `callJsonLlm` 한 번. system 프롬프트에 명시할 것: 기관 담당자가 상급기관·학교에 내는 결과보고서 초안 / 주어진 숫자만 쓴다 / 사람 이름·기관명·연락처·링크 금지 / 학생 개인을 지목·평가하지 않는다 / 과장 금지 / 존댓말 보고서체(~했습니다) / 출력은 JSON 하나 `{"outcomes":[],"student_voice":[],"improvements":[],"next_steps":[],"record_reference":""}`.
8. `source`: LLM 병합에서 한 필드라도 LLM 문장이 채택되면 `'llm'`, 아니면 `'rule'`.

### 테스트 (`tests/result-report.test.ts`) — 최소 포함

- 데모 `ls-1`: `sample_sufficient` true, `metrics.response_count`·`response_rate_pct`·`satisfaction_avg`가 `sessionReport(ds,'ls-1')` 값(반올림 규칙 적용)과 같다.
- 응답을 4건만 남긴 회차: 통계 필드 null/`[]`, `student_voice` `[]`, `buildLlmPayload` null, 표본 부족 고지문 포함.
- 경계: 정확히 5건이면 `sample_sufficient` true.
- `buildLlmPayload`의 `JSON.stringify` 결과에 강사명·기관명·업체명·`student_id` 값·가명코드가 없다. quotes는 5개 이하. 연락처가 섞인 quote는 빠진다.
- 병합:
  - 규칙에 없는 숫자(`'만족도 평균 4.9점'`)가 든 문장은 버려진다.
  - 강사명이 든 문장은 버려진다.
  - `record_reference`에 기관명·숫자가 들어가면 규칙 문구가 남는다.
  - LLM이 `metrics`·`overview`·`notices`를 보내도 무시된다.
  - `null`·문자열·빈 배열 응답이면 규칙 값이 남는다.
- `ANTHROPIC_API_KEY` 없이 `generateResultReport(ds,'ls-1')` → null 아님, `source: 'rule'`.
- 없는 회차 → null.
- `record_reference`에 숫자가 없고 강사명·기관명이 없다 (데모 전 회차 대상).

## Acceptance Criteria

```bash
npm run lint
npm run build
npm test
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md 디렉토리 구조를 따르는가? (`lib/ai/`, `types/`)
   - ADR 기술 스택을 벗어나지 않았는가?
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가? (학생 개인 진단 금지, 5건 미만 집계 제외, 마스킹 통과 자유서술만 LLM 에)
3. 결과에 따라 `phases/1-post-session-ai/index.json`의 step 2를 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"` (export 함수와 타입명을 담는다)
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- 결과를 DB·Dataset에 저장하는 코드를 만들지 마라. 이유: ADR-024 — 저장하지 않으므로 새 테이블·RLS가 없다.
- 학생 개인별 문장(특기사항·태도·성취 평가)을 만들지 마라. 이유: CLAUDE.md 개인화 단위는 회차, 2026 기재요령.
- 응답 5건 미만 회차의 집계·의견을 payload·출력에 넣지 마라. 이유: CLAUDE.md / ADR-018 k-익명성.
- API 라우트·컴포넌트를 만들지 마라. 이유: step 5·6의 범위다.
- `src/lib/ai/guard.ts`의 시그니처를 바꾸지 마라. 이유: step 3·4가 같은 시그니처를 쓴다. 부족하면 이 모듈 안에 private 함수를 만든다.
- 기존 테스트를 깨뜨리지 마라
