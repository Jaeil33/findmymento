# Step 4: session-debrief

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md`
- `/docs/AI.md` — "수업 후 AI — 기능 6"
- `/docs/ADR.md` — ADR-017, ADR-018, ADR-019, ADR-024
- `/docs/USER_FLOW.md` — 가설 H2 (후속 의향 3·4 비율 40%)
- `src/lib/ai/guard.ts` — step 1 산출물
- `src/lib/ai/result-report.ts`, `src/lib/ai/followup-plan.ts` 와 각 테스트 — step 2·3 산출물 (같은 구조·가드 사용법)
- `src/lib/db/queries.ts` — `sessionReport`, `gradeBandLabel`
- `src/types/domain.ts` — `LessonPlan`, `ResultReportDraft`, `FollowupPlanDraft`
- `src/data/demo.ts` — `ls-1`(배정 강사 `in-2`)과 `lessonPlans`

## 작업

배정 강사용 **수업 회고 + 학교 제출용 결과 요약** 모듈을 만든다. **테스트를 먼저 쓰고**(TDD) 구현한다. 라우트와 화면은 만들지 않는다.

### 파일

- `src/types/domain.ts` — `SessionDebriefDraft` 타입 추가 (`FollowupPlanDraft` 아래)
- `src/lib/ai/session-debrief.ts` (신규)
- `tests/session-debrief.test.ts` (신규)

### 타입

```ts
export type SessionDebriefDraft = {
  session_id: string
  sample_sufficient: boolean
  metrics: {
    response_count: number
    /** 정수 % */
    response_rate_pct: number
    /** 소수 첫째 자리. 표본 부족이면 null */
    satisfaction_avg: number | null
    /** 만족도 4·5점 비율 정수 %. 표본 부족이면 null */
    high_satisfaction_pct: number | null
    /** 만족도 1·2점 비율 정수 %. 표본 부족이면 null */
    low_satisfaction_pct: number | null
    /** 후속 의향 3점 이상 비율 정수 %. 표본 부족이면 null */
    followup_high_pct: number | null
    /** 관심 분야 1위. 표본 부족이면 null */
    top_field: string | null
  }
  /** 잘 된 점 — 최대 3 */
  went_well: string[]
  /** 다음에 바꿀 점 — 최대 3 */
  change_next: string[]
  /** 학교·기관에 제출할 수업 결과 요약. 400자 이내 */
  school_summary: string
  notices: string[]
  source: 'llm' | 'rule'
}
```

### 시그니처 (`src/lib/ai/session-debrief.ts`)

```ts
export function ruleDebrief(ds: Dataset, sessionId: string): SessionDebriefDraft | null

export function mergeLlmDebrief(
  draft: SessionDebriefDraft,
  raw: unknown,
  ctx: { allowed: number[]; banned: string[] },
): SessionDebriefDraft

/** 어떤 경우에도 throw 하지 않는다. 회차가 없을 때만 null. 표본 부족이면 LLM 을 부르지 않는다. */
export async function generateDebrief(ds: Dataset, sessionId: string): Promise<SessionDebriefDraft | null>
```

권한(배정 강사 확인)은 이 모듈이 하지 않는다 — step 5 라우트가 한다. 이 모듈은 순수 함수다.

### 핵심 규칙 (반드시 지킬 것)

1. **규칙 트리거** (표본 충분일 때). 순서대로 평가하고 각 목록 최대 3개.
   - `went_well`
     - 만족도 4·5점 비율 ≥ 70% → 만족 응답 비율
     - 후속 의향 3점 이상 비율 ≥ 40% → 후속 과정 제안의 근거가 된다는 문장
     - 둘 다 아니면: 응답 수를 확보했다는 문장 1개
   - `change_next`
     - 후속 의향 3점 이상 비율 < 40% → 마무리에 다음 단계(후속 과정·관련 직업) 안내를 넣어 보라
     - 만족도 1·2점 비율 ≥ 20% → 어려워하는 학생용 분기를 앞 단계에 넣어 보라 (수업 설계 도우미 교안의 분기 활용)
     - 관심 분야 1위 ≠ 회차 분야 → 마무리에 그 분야와 이어지는 직업을 소개해 보라
     - 응답률 < 50% → QR 안내를 수업 종료 3분 전에 하라
     - 해당 없음 → `[]`
2. **표본 부족**
   - `metrics`의 비율·평균·`top_field`는 null
   - `went_well`: `[]`
   - `change_next`: "응답이 5건 미만입니다. 다음 회차에는 수업 마무리 3분 전에 QR 안내를 먼저 하세요." 1개
   - `school_summary`: 응답 수만 알리고 통계를 싣지 않는다
   - LLM을 부르지 않는다
3. **`school_summary` 규칙 문장**
   - 포함할 것: 회차 제목, 일시, 학년대, 시수, 응답 수·응답률, 만족도 평균(5점 만점), 후속 의향 3점 이상 비율, 관심 분야 1위.
   - 조사(이/가, 을/를)가 받침에 따라 틀리지 않도록 "관심 분야 1위: {분야}"처럼 조사가 필요 없는 형태로 쓴다.
   - 강사명·기관명·학생 인용문을 넣지 않는다.
4. **LLM**: 표본 충분일 때만 `callJsonLlm`.
   - payload: 회차 조건(분야·학년대·시수·장소·class_traits), `metrics`, 규칙 `went_well`·`change_next`, 그 회차 교안이 있으면 단계의 `phase`·`title`만. **학생 인용문·student_id·가명코드·강사명·기관명은 넣지 않는다.**
   - LLM이 채울 수 있는 필드: `went_well`(각 ≤100, 최대 3), `change_next`(각 ≤100, 최대 3), `school_summary`(≤400).
   - 가드: `sanitizeText` → `numbersWithin(allowed, FIELDS)` → `!containsAny(banned)`. 통과 문장이 0개인 필드는 규칙 값을 유지한다.
   - allowed: `metrics`의 모든 수, 시수, 예상 인원, 일시의 연·월·일, 40·50·70·20(트리거 임계치), 3(분), 5(만점·임계), 1·2·4.
   - banned: 배정 강사명, 발주 기관명, 소속 업체명.
   - `mergeLlmDebrief`는 `metrics`·`sample_sufficient`·`notices`·`session_id`를 바꾸지 않는다.
   - `source`: 한 필드라도 채택되면 `'llm'`.
5. **고지문** — 규칙 고정:
   - `초안입니다. 수업의 최종 판단과 책임은 강사에게 있습니다.`
   - `학생 개인을 평가하는 내용이 아니라 이 회차 응답의 집계입니다.`
   - (표본 부족일 때만) `응답이 5건 미만이라 통계를 싣지 않았습니다.`

### 테스트 (`tests/session-debrief.test.ts`) — 최소 포함

- 데모 `ls-1`: `sample_sufficient` true, `metrics`가 `sessionReport` 값과 일치(반올림 규칙), 목록 길이 ≤ 3, `school_summary` ≤ 400자.
- 트리거:
  - 후속 의향 높은 응답만 둔 회차 → `went_well`에 후속 문장, `change_next`에 마무리 안내 없음
  - 낮은 응답만 → 반대
  - 관심 분야 1위가 회차 분야와 다른 데이터 → 연계 직업 문장
- 응답 4건 → 통계 null, `went_well` `[]`, QR 안내 1개, 표본 부족 고지.
- `school_summary`(규칙)에 강사명·기관명·학생 인용문이 없다.
- 병합:
  - 규칙에 없는 숫자가 든 문장·강사명이 든 문장은 버려진다.
  - LLM이 `metrics`를 보내도 무시된다.
  - 401자 요약은 규칙 요약이 남는다.
- 키 없이 `generateDebrief(ds,'ls-1')` → `source: 'rule'`.
- 출력 어디에도 "점수", "등급", "순위" 같은 강사 평가 표현이 규칙 문장에 없다.

## Acceptance Criteria

```bash
npm run lint
npm run build
npm test
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md 디렉토리 구조를 따르는가?
   - ADR 기술 스택을 벗어나지 않았는가?
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가? (학생 개인 진단 없음, 5건 미만 제외, 연락처 없음)
3. 결과에 따라 `phases/1-post-session-ai/index.json`의 step 4를 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- 강사 평점·등급·순위·점수를 만들지 마라. 이유: PRD MVP 제외(리뷰·평점) — 소수 지역 강사 풀에서 낙인이 된다.
- 학생 인용문을 `school_summary`나 LLM payload에 넣지 마라. 이유: 학교에 제출되는 문서에 학생 문장이 들어가면 작성자 추정이 가능해진다.
- 결과를 저장하지 마라. 이유: ADR-024.
- 교안(`lesson_plans`) 내용을 수정하지 마라. 읽기만 한다. 이유: ADR-019 교안은 강사 소유이고 이 기능은 제안만 한다.
- API 라우트·컴포넌트를 만들지 마라. 이유: step 5·6의 범위다.
- `guard.ts`·`result-report.ts`·`followup-plan.ts`의 시그니처를 바꾸지 마라.
- 기존 테스트를 깨뜨리지 마라
