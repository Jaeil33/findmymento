# Step 7: recommend-engine

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/docs/USER_FLOW.md` — 사용자 여정, 유스케이스(UC), 예외 흐름(E), 검증 가설(H)
- `/docs/ADR.md` — **ADR-004(AI 하이브리드 구조와 핵심 규칙), ADR-005(지역 확장), ADR-009(추천 중립성)**
- `/docs/ARCHITECTURE.md` — 데이터 흐름, 지역 확장 규칙, 권한 모델
- `/docs/PRD.md` — 핵심 기능 2(AI 추천)·8(미충족 수요 집계), 확정 결정 10번 "관심 분야는 신산업 5개"
- `/docs/SURVEY.md` — 추천 입력이 되는 문항
- `/CLAUDE.md` — 아키텍처 규칙(외부 API는 route handler에서만)
- 이전 step 산출물: `src/lib/region/expandRegions`, `src/lib/moderation/maskSensitive`, `src/lib/supabase/`, `src/types/`

이전 step의 `expandRegions`와 `maskSensitive`를 꼼꼼히 읽고 그대로 재사용하라. 비슷한 함수를 새로 만들지 마라.

## 작업

2단 구조다. **1단이 후보를 확정하고, 2단은 순위와 문장만 만든다.**

### 1단: 규칙 필터 (SQL, LLM 없음)

```ts
// src/lib/ai/candidates.ts
export type CandidateQuery = {
  regionCode: string
  grade: string
  interestFields: string[]
}
export type Candidate = {
  instructorId: string
  instructorName: string
  providerName: string | null
  programId: string | null
  programTitle: string | null
  field: string
  regionCode: string
  hops: 0 | 1 | 2          // 지역 거리
}
export async function findCandidates(q: CandidateQuery): Promise<Candidate[]>
```

규칙:

- `expandRegions(regionCode, hops)`를 0 → 1 → 2 순으로 넓히며, 결과가 나온 단계에서 멈춘다.
- `instructors.status = 'approved'` 인 강사만. 미승인은 절대 포함하지 마라.
- 대상 학년이 맞는 프로그램만.
- **순위에 소속 업체·구독 등급·결제 여부를 반영하지 마라.** 정렬 기준은 `hops` → 분야 일치 수 → 결정적인 tiebreaker(ID 등)다. (ADR-009)
- 후보가 0건이면 빈 배열을 반환한다. 여기서 지역을 더 넓히거나 분야를 바꿔 억지로 채우지 마라.

### 2단: LLM 순위·이유 — `src/app/api/recommend/route.ts`

후보 배열과 학생 응답을 받아 **순위와 추천 이유 한 줄**을 생성한다.

SDK는 `@anthropic-ai/sdk`를 쓴다. 호출 규격은 아래를 그대로 따르라 — 이 API는 최근 변경된 부분이 있어 기억에 의존하면 틀린다.

```ts
// model / thinking / effort 는 이 값을 쓴다
model: "claude-opus-5"
thinking: { type: "adaptive" }
output_config: { effort: "low", format: /* 아래 스키마 */ }
max_tokens: 4096
```

- **구조화 출력을 쓴다.** `output_config.format`에 JSON 스키마를 주고 `client.messages.parse()`로 검증해 받는다. 응답 텍스트를 직접 파싱하지 마라.
- `thinking.budget_tokens`를 쓰지 마라 — 이 모델에서 **400 에러**다.
- assistant 메시지 prefill을 쓰지 마라 — **400 에러**다.
- 사용하지 않는 구형 파라미터(`output_format`)를 쓰지 마라. 현재 이름은 `output_config.format`이다.
- 에러는 가장 구체적인 타입부터 체인으로 잡는다(NotFound → RateLimit → APIStatus → APIConnection). 문자열 매칭으로 에러를 분기하지 마라.

출력 스키마(형태):

```ts
{ ranked: Array<{ candidateId: string; reason: string }> }   // reason은 한국어 한 문장
```

**LLM이 후보를 추가·변경할 수 없어야 한다.** 프롬프트에 주어진 `candidateId` 집합 밖의 값이 오면 그 항목을 버린다. 이게 환각을 막는 구조적 장치다.

### 3. 폴백 (필수)

**LLM 호출이 실패·타임아웃·스키마 불일치면 1단의 규칙 순위만으로 응답한다.** 이유 문장은 규칙 기반 문구로 채운다(예: "같은 지역에서 드론을 가르치는 강사예요").

추천 화면이 LLM 성공에 의존하면 안 된다. API 키가 없거나 한도가 걸린 상태에서도 결과가 떠야 한다. 이 폴백 경로에 테스트를 반드시 붙여라.

### 4. LLM에 보내는 것 / 보내지 않는 것

- 보낸다: 학년, 선택 분야, **마스킹된** 자유 서술, 과거 누적 관심 이력(같은 가명코드), 후보 목록
- 보내지 않는다: 가명코드 원문, 기관명, 강사 연락처, 마스킹 전 원문

### 5. 미충족 수요

후보가 0건인 응답은 **그 사실 자체가 데이터**다. 별도 테이블을 만들지 말고, `survey_responses`와 승인된 강사의 분야·지역을 조합한 **집계 쿼리로 도출**하라. 쿼리는 `src/lib/ai/` 또는 `src/services/`에 함수로 두고 step 10에서 재사용한다.

```ts
export type UnmetDemand = { field: string; regionCode: string; count: number }
export async function getUnmetDemand(orgId: string): Promise<UnmetDemand[]>
```

응답에는 "이 지역에 아직 이 분야 강사가 없어요 + Q&A로 먼저 물어보기" 유도를 담는다.

### 6. 테스트 (TDD — 먼저 작성, LLM은 모킹)

1. 같은 시군구에 후보가 있으면 `hops: 0`에서 멈춘다(1·2단계로 넓히지 않는다)
2. 같은 시군구에 없고 인접에 있으면 `hops: 1` 결과만 나온다
3. 미승인 강사가 결과에 포함되지 않는다
4. **중립성**: 다른 조건이 같고 소속 업체만 다른 두 후보의 순위가 소속에 따라 바뀌지 않는다
5. LLM이 후보 집합 밖 `candidateId`를 반환하면 그 항목이 버려진다
6. **LLM 호출이 throw하면 규칙 순위 + 규칙 문구로 200 응답한다**
7. LLM 응답이 스키마에 맞지 않으면 폴백한다
8. API 키 환경변수가 없어도 폴백으로 200 응답한다
9. 후보 0건이면 Q&A 유도를 담은 응답이 온다
10. LLM에 전달된 프롬프트에 마스킹 전 원문·연락처가 포함되지 않는다

## Acceptance Criteria

```bash
npm run build
npm run lint
npm test
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - LLM 호출이 `app/api/` 안에서만 일어나는가? 클라이언트 컴포넌트에 키가 노출되지 않는가?
   - 폴백 경로가 테스트로 검증되는가?
   - 순위 로직에 소속 업체·구독·결제가 들어가지 않았는가? (ADR-009)
   - `expandRegions`를 재구현하지 않고 재사용했는가?
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가?
3. 결과에 따라 `phases/0-mvp/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- LLM에게 후보를 찾게 하지 마라. 이유: 존재하지 않는 강사를 추천하는 환각이 발생한다. 후보는 SQL이 확정하고 LLM은 순위와 문장만 만든다(ADR-004).
- LLM 성공을 추천 화면의 필수 조건으로 만들지 마라. 이유: AI가 죽어도 추천은 떠야 한다. 파일럿 현장에서 빈 화면이 뜨면 그 학생의 관심 신호를 영구히 잃는다(ADR-004).
- 클라이언트 컴포넌트에서 LLM을 호출하지 마라. 이유: API 키가 번들에 들어간다(CLAUDE.md CRITICAL).
- 마스킹 전 자유 서술을 LLM에 보내지 마라. 이유: 학생이 거기에 본인 실명·연락처를 썼을 수 있다(ADR-004).
- 추천 순위에 구독 여부·소속 업체를 넣지 마라. 이유: 첫 공급이 한 업체에서 나오므로, 순위가 소속에 반응하면 플랫폼이 그 업체의 영업 도구가 되고 2호 업체가 들어올 이유가 없어진다(ADR-009).
- 후보 0건일 때 지역이나 분야 조건을 풀어 억지로 채우지 마라. 이유: 0건이라는 사실이 미충족 수요 데이터다. 채우면 그 정보가 사라진다.
- `thinking.budget_tokens`나 assistant prefill을 쓰지 마라. 이유: 이 모델에서 400 에러다.
- 미충족 수요용 새 테이블을 만들지 마라. 이유: 스키마는 step 2에서 확정됐다. 집계 쿼리로 도출하라.
- 기존 테스트를 깨뜨리지 마라.
