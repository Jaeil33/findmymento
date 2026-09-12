# Step 1: region-data

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/docs/ARCHITECTURE.md` — "지역 확장 규칙" 섹션
- `/docs/ADR.md` — ADR-005
- `/docs/PRD.md` — 확정 결정 9번 "지역 단위는 시·군·구 + 인접 지역 자동 확장"
- 이전 step 산출물: `src/` 디렉토리 구조, vitest 설정, `package.json`

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 작업

지역 확장의 **순수 함수 레이어**만 만든다. DB도 UI도 건드리지 않는다.

### 1. `src/data/region-adjacency.json`

수도권 **66개 시군구**(서울 25 + 경기 31 + 인천 10)의 코드·이름·인접 관계를 담는다.

- 시군구 코드는 **행정안전부 법정동코드의 앞 5자리**를 쓴다. 코드 출처를 파일 상단 주석 또는 옆의 README에 남겨라.
- **경기도의 일반구(수원·성남·안양·안산·고양·용인·부천)는 쪼개지 않고 시 단위로 1개씩 둔다.** 이유: 강사의 활동 범위가 일반구 단위로 갈라지지 않는다. 이 전제로 경기도가 31개가 된다.
- 인접 관계는 **육지 경계를 맞대고 있는 시군구**를 말한다. 섬(강화군·옹진군)은 실제 경계 기준으로 판단하고 근거를 주석에 남겨라.

구조(형태만 제시, 코드값은 실제 법정동코드로 채워라):

```json
{
  "41210": { "name": "광명시", "sido": "경기", "adjacent": ["...", "..."] }
}
```

**검증된 사실 — 광명시의 인접은 정확히 5곳이다**: 서울 구로구, 서울 금천구, 경기 시흥시, 경기 부천시, 경기 안양시. 이 5곳 외에는 넣지 마라.

### 2. `src/lib/region/`

```ts
export type RegionCode = string
export type Region = { code: RegionCode; name: string; sido: string; adjacent: RegionCode[] }

export function getRegion(code: RegionCode): Region | null
export function getAdjacent(code: RegionCode): RegionCode[]
export function expandRegions(code: RegionCode, hops: 0 | 1 | 2): RegionCode[]
```

`expandRegions`의 계약:

- `hops: 0` → 자기 자신만
- `hops: 1` → 자기 자신 + 1-hop
- `hops: 2` → 자기 자신 + 1-hop + 2-hop
- **결과는 가까운 순서로 정렬된다** (자기 자신 → 1-hop → 2-hop). 추천 순위가 이 순서에 의존한다.
- 중복 없음. 존재하지 않는 코드를 넣으면 빈 배열.

**"같은 시도"로 확장하는 함수를 만들지 마라.** ADR-005에서 폐기된 단계다.

### 3. 데이터 무결성 테스트 (TDD — 먼저 작성)

아래는 전부 필수다. 이 테스트들이 JSON 데이터의 오류를 잡는 유일한 장치다.

1. 총 66개이고 코드 중복이 없다.
2. 시도별 개수: 서울 25, 경기 31, 인천 10.
3. **인접 관계의 대칭성** — A의 adjacent에 B가 있으면 B의 adjacent에도 A가 있다. (입력 실수를 가장 잘 잡는다)
4. **dangling 참조 없음** — 모든 adjacent 코드가 실제 존재하는 시군구다.
5. 자기 자신을 adjacent에 넣은 항목이 없다.
6. 광명시의 adjacent가 정확히 5개이고 이름이 구로구·금천구·시흥시·부천시·안양시다.
7. `expandRegions`의 포함 관계(hops 0 ⊂ 1 ⊂ 2)와 정렬 순서.
8. 존재하지 않는 코드 입력 시 빈 배열.

## Acceptance Criteria

```bash
npm run build
npm run lint
npm test
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md 디렉토리 구조를 따르는가? (`src/data/`, `src/lib/region/`)
   - ADR 기술 스택을 벗어나지 않았는가?
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가?
3. 결과에 따라 `phases/0-mvp/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- 지도 API·지오코딩·외부 HTTP 호출을 쓰지 마라. 이유: ADR-005 — 외부 의존성을 줄이는 것이 이 step의 목적이다. 필요한 연산은 붙어 있는 시군구 목록뿐이다.
- 위경도·직선거리 계산을 넣지 마라. 이유: 같은 이유. 데이터가 없고 MVP에 불필요하다.
- 전국 229개 시군구를 만들지 마라. 이유: 수도권 66개로 한정하기로 결정했다(ADR-005). 파일럿은 광명시다.
- 66개를 채우지 못했다면 임의로 생략하거나 추정값을 넣지 말고 `blocked`로 중단하라. 이유: 틀린 인접 데이터는 추천 결과를 조용히 망가뜨리고 테스트로도 잡히지 않는다.
- DB·Supabase·UI 코드를 작성하지 마라. 이유: 이 step은 순수 함수 레이어다.
- 기존 테스트를 깨뜨리지 마라.
