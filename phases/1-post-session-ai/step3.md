# Step 3: followup-plan

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` — 특히 학원법(모집·수납·정원 금지)과 학생 주체 연결 금지
- `/docs/AI.md` — "수업 후 AI — 기능 5"
- `/docs/ADR.md` — ADR-009(중립성), ADR-018, ADR-023, ADR-024
- `/docs/ARCHITECTURE.md` — 지역 확장 규칙, `recruitment_requests`
- `src/lib/ai/guard.ts` — step 1 산출물
- `src/lib/ai/result-report.ts`, `tests/result-report.test.ts` — step 2 산출물 (같은 구조·가드 사용법을 따른다)
- `src/lib/db/queries.ts` — `sessionReport`, `approvedInstructors`, `recruitmentCandidates`, `recruitmentRows`
- `src/lib/region/` — `regionDistance`, `regionName`
- `src/types/domain.ts` — `ResultReportDraft`, `Field`, `FIELDS`, `Instructor`, `Provider`
- `src/data/demo.ts`
- `src/app/(org)/org/recruitment/page.tsx` — 섭외 요청 폼의 `note` 필드 (문안이 붙여 넣어질 자리)

## 작업

기관·학교 담당자용 **후속 과정 제안 + 섭외 요청 문안** 모듈을 만든다. **테스트를 먼저 쓰고**(TDD) 구현한다. 라우트와 화면은 만들지 않는다.

### 파일

- `src/types/domain.ts` — `FollowupPlanDraft` 타입 추가 (`ResultReportDraft` 아래)
- `src/lib/ai/followup-plan.ts` (신규)
- `tests/followup-plan.test.ts` (신규)

### 타입

```ts
export type FollowupCandidate = {
  instructor_id: string
  name: string
  region_label: string
  /** 0 같은 시군구 · 1 인접 · 2 인접의 인접 */
  distance: number
}

export type FollowupPlanDraft = {
  session_id: string
  /** 표본 충분 && 후속 의향 3점 이상 응답이 1건 이상 */
  eligible: boolean
  /** eligible 이 false 인 이유 (규칙 문장). eligible 이면 null */
  reason: string | null
  /** 전체 응답 수 */
  response_count: number
  /** 후속 의향 3점 이상 응답 수. 표본 부족이면 0 */
  demand_count: number
  /** 후속 의향 3점 이상 응답의 관심 분야 1위 (공급 유무와 무관). 없으면 null */
  field: Field | null
  field_interest_count: number
  /** 후속 의향 3점 이상 응답의 참여 가능 시간 1위 */
  top_time: string | null
  /** 기관 지역 기준 2-hop 이내에 그 분야 승인 강사가 있는지 */
  supply_status: 'available' | 'none'
  /** 규칙이 고른 후보. 최대 3 */
  candidates: FollowupCandidate[]
  suggested_title: string
  /** 차시별 한 줄. 규칙 기본 4개 */
  outline: string[]
  /** 섭외 요청 note 에 붙여 넣는 문안 (400자 이내). 후보가 없으면 '' */
  request_message: string
  notices: string[]
  source: 'llm' | 'rule'
}
```

### 시그니처 (`src/lib/ai/followup-plan.ts`)

```ts
/** 회차가 없으면 null. 후속 의향 3점 이상(high) 응답만으로 분야·시간 1위를 센다. */
export function followupDemand(
  ds: Dataset,
  sessionId: string,
): { total: number; high: number; field: Field | null; fieldCount: number; topTime: string | null } | null

/** 기관 지역에서 regionDistance <= 2 인 승인 강사 중 field 를 가진 사람. 거리 오름차순 → 이름(ko) 오름차순. 최대 3. */
export function followupCandidates(ds: Dataset, orgId: string, field: Field): FollowupCandidate[]

export function ruleFollowupPlan(ds: Dataset, sessionId: string): FollowupPlanDraft | null

export function mergeLlmFollowupPlan(
  draft: FollowupPlanDraft,
  raw: unknown,
  ctx: { allowed: number[]; banned: string[] },
): FollowupPlanDraft

/** 어떤 경우에도 throw 하지 않는다. 회차가 없을 때만 null. eligible 이 false 면 LLM 을 부르지 않는다. */
export async function generateFollowupPlan(ds: Dataset, sessionId: string): Promise<FollowupPlanDraft | null>
```

### 핵심 규칙 (반드시 지킬 것)

1. **표본 임계치**: `total < MIN_AGGREGATE_RESPONSES`이면 `eligible: false`, `demand_count: 0`, `field: null`, `field_interest_count: 0`, `top_time: null`, `candidates: []`, `request_message: ''`. 이때 `reason`은 응답 수와 "5건 이상 모여야 후속 수요를 판단합니다"를 알린다.
2. `high === 0`이면 `eligible: false`, `reason`은 "더 배우고 싶다는 응답이 없습니다" 취지.
3. **분야 1위**: high 응답의 `interest_fields` 중 `FIELDS`에 속한 값만 센다. 동률이면 `localeCompare(…, 'ko')` 오름차순.
4. **강사 후보는 규칙이 고른다 (ADR-009).**
   - 정렬은 거리 → 이름뿐이다. `provider_id`·구독·결제·교안 보유 여부로 정렬·필터하지 않는다.
   - 후보 객체에 연락처·이메일·전화 필드를 넣지 않는다.
   - `mergeLlmFollowupPlan`은 `candidates`·`field`·`demand_count`·`field_interest_count`·`top_time`·`supply_status`·`eligible`·`reason`·`notices`·`response_count`를 절대 바꾸지 않는다.
5. **공급 0**:
   - `supply_status: 'none'`, `candidates: []`, `request_message: ''`. `eligible`은 수요 기준으로 유지한다.
   - `notices`에 "관내·인접 지역에 이 분야 승인 강사가 없습니다. 미충족 수요로 남으며, 신규 강사 발굴의 근거가 됩니다." 취지 문장을 넣는다.
   - 이 모듈은 어떤 기록도 만들지 않는다.
6. **규칙 과정안**:
   - `suggested_title`: `${field} 심화 과정`
   - `outline`: 4개. `1차시`~`4차시` 접두 + 기초 → 실습 → 소그룹 프로젝트 → 결과 공유와 진로 탐색 흐름
   - 회당 시간은 원 회차의 `duration_minutes`
7. **규칙 섭외 문안** (400자 이내, 존댓말):
   - 포함할 것: 원 회차 제목, high 응답 수와 분야 관심 수, `top_time`(있을 때만), 4차시·회당 시간, 가능 여부·일정 회신 요청.
   - 기관을 가리킬 때는 "저희 기관"이라고 쓰고 기관명은 쓰지 않는다.
   - 강사명·학생 정보·연락처·링크를 넣지 않는다.
8. **고지문** — 규칙 고정, 순서대로:
   - `초안입니다. 내용을 확인한 뒤 섭외 요청 화면에서 직접 보내세요.`
   - `플랫폼은 학생 모집·정원·수강료를 다루지 않습니다. 참여 학생 안내와 운영은 기관이 합니다.`
   - (공급 0일 때만) 5번의 문장
9. **LLM**: eligible이고 `supply_status === 'available'`일 때만 `callJsonLlm`을 부른다.
   - payload: 원 회차 제목·분야·학년대·시수, `total`·`high`·`field`·`fieldCount`·`topTime`, high 응답의 `want_to_learn` 중 `maskForStorage`를 통과한(원문과 같은) 문장 최대 5개. **강사명·기관명·student_id·가명코드·개별 응답 행을 넣지 않는다.**
   - LLM이 채울 수 있는 필드는 `suggested_title`(≤40), `outline`(각 ≤60, **규칙과 같은 개수일 때만** 채택), `request_message`(≤400)뿐이다.
   - 각 문장은 `sanitizeText` → `numbersWithin(allowed, FIELDS)` → `!containsAny(banned)` → `!containsAny(['수강료','정원','결제','모집','신청서'])`를 통과해야 채택한다. 하나라도 실패한 필드는 규칙 값을 유지한다(outline은 한 줄이라도 실패하면 전체 규칙 유지).
   - allowed: `total`·`high`·`fieldCount`·원 회차 `duration_minutes`·1~4·`MIN_AGGREGATE_RESPONSES`. banned: 모든 승인 강사명 + 업체명 + 발주 기관명.
   - `source`: 한 필드라도 채택되면 `'llm'`.

### 테스트 (`tests/followup-plan.test.ts`) — 최소 포함

- 데모 `ls-1`: `eligible`, `field`가 `FIELDS`에 속함, 모든 후보가 그 분야를 가지고 `distance <= 2`, 거리 오름차순, 후보 객체 키에 `phone`/`email`/`contact`가 없다.
- 응답 4건 회차 → `eligible: false`, `candidates: []`, `request_message: ''`, `reason`에 5건 안내.
- 응답은 5건 이상이지만 전원 후속 의향 1~2 → `eligible: false`.
- `instructors: []` 데이터셋 → `supply_status: 'none'`, 후보 없음, 문안 `''`, 공급 없음 고지문 포함.
- 중립성: 거리가 같고 업체가 다른 두 강사 → 업체와 무관하게 이름순.
- 병합:
  - LLM이 후보를 추가하거나 `field`·`demand_count`를 바꿔도 무시된다.
  - outline 개수가 다르면 규칙 outline이 유지된다.
  - 전화번호가 든 문안 → 규칙 문안.
  - `'30명 모집'` 문안 → 규칙 문안(숫자·금지어).
  - 강사명이 든 제목 → 규칙 제목.
- 키 없이 `generateFollowupPlan(ds,'ls-1')` → `source: 'rule'`.
- 규칙 문안에 발주 기관명·강사명이 없다.

## Acceptance Criteria

```bash
npm run lint
npm run build
npm test
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md 디렉토리 구조와 지역 확장 규칙(같은 시군구 → 1-hop → 2-hop, "같은 시도" 없음)을 따르는가?
   - ADR 기술 스택을 벗어나지 않았는가?
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가? (모집·수납·정원 없음, 학생이 강사에게 닿는 경로 없음, 연락처 없음)
3. 결과에 따라 `phases/1-post-session-ai/index.json`의 step 3을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- 타입·출력에 정원·모집 인원·수강료·신청 폼·결제 필드를 만들지 마라. 이유: ADR-023 — 학원법 등록 대상이 되고 학생 PII 책임이 플랫폼으로 온다.
- `recruitment_requests`나 어떤 레코드도 생성·수정하지 마라. 이유: ADR-024 저장하지 않음. 섭외 발송은 기관이 기존 화면에서 한다.
- 후보 정렬·필터에 `provider_id`·구독·결제 여부를 쓰지 마라. 이유: ADR-009 중립성.
- 강사 연락처(`instructor_contacts`)를 읽거나 출력에 넣지 마라. 이유: CLAUDE.md CRITICAL.
- API 라우트·컴포넌트를 만들지 마라. 이유: step 5·6의 범위다.
- `guard.ts`·`result-report.ts`의 시그니처를 바꾸지 마라. 이유: 다른 step이 의존한다.
- 기존 테스트를 깨뜨리지 마라
