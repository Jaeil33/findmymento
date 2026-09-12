# UI 디자인 가이드

**라이트 단일 톤.** 학생 화면과 기관 대시보드가 같은 색·같은 컴포넌트를 쓰고, 차이는 **타이포 크기·여백·터치 타깃**으로만 만든다. 테마를 2개로 나누지 않는다.

## 디자인 원칙

1. **기관 화면은 도구처럼 보여야 한다.** 마케팅 랜딩이 아니라 담당자가 업무 시간에 매일 여는 대시보드다.
2. **학생 화면은 3분 안에 끝나야 한다.** 한 화면에 질문 하나. 진행 상태를 항상 보여준다. 특강 직후 산만한 교실에서 휴대폰으로 쓰는 화면이다.
3. **숫자가 주인공이다.** 만족도·수요 집계는 장식 없이 크고 정확하게. 차트보다 숫자가 먼저다.

## AI 슬롭 안티패턴 — 하지 마라

| 금지 사항 | 이유 |
|-----------|------|
| backdrop-filter: blur() | glass morphism은 AI 템플릿의 가장 흔한 징후 |
| gradient-text (배경 그라데이션 텍스트) | AI가 만든 SaaS 랜딩의 1번 특징 |
| "Powered by AI" 배지 | 기능이 아니라 장식. 학생에게는 추천 **이유 한 줄**이 가치다 |
| box-shadow 글로우 애니메이션 | 네온 글로우 = AI 슬롭 |
| 보라/인디고 브랜드 색상 | "AI = 보라색" 클리셰 |
| 모든 카드에 동일한 rounded-2xl | 균일한 둥근 모서리는 템플릿 느낌 |
| 배경 gradient orb (blur-3xl 원형) | 모든 AI 랜딩 페이지에 있는 장식 |
| 학생 화면에 이모지 남발 | 중학생을 어리게 취급하는 인상. 타이포와 여백으로 친근함을 만든다 |

## 색상

포인트 색은 **딥 틸 한 가지**(`#0f766e`)다. 두 번째 브랜드 색을 만들지 않는다.

### 배경
| 용도 | 값 |
|------|------|
| 페이지 | `#fafafa` |
| 카드 | `#ffffff` |
| 보조 영역 (테이블 헤더, 비활성 탭) | `#f5f5f5` |
| 테두리 | `#e5e5e5` |

### 텍스트
| 용도 | 값 |
|------|------|
| 주 텍스트 | `#171717` |
| 본문 | `#404040` |
| 보조 | `#737373` |
| 비활성 | `#a3a3a3` |

### 포인트
| 용도 | 값 |
|------|------|
| 포인트 / Primary 버튼 | `#0f766e` |
| 포인트 hover | `#115e59` |
| 포인트 배경 (선택된 칩, 강조 영역) | `#f0fdfa` |

### 데이터/시맨틱 색상
라이트 배경이므로 600~700 계열을 쓴다. 다크 테마용 500 계열은 흰 배경에서 대비가 부족하다.

| 용도 | 값 |
|------|------|
| 긍정 / 만족 | `#15803d` |
| 주의 / 대기 | `#b45309` |
| 부정 / 불만족 / 에러 | `#b91c1c` |
| 중립 / 기본 | `#737373` |

## 컴포넌트

### 카드
모서리 반경을 용도별로 다르게 쓴다. 전부 같은 값이면 템플릿처럼 보인다.

```
대시보드 카드:   rounded-lg bg-white border border-neutral-200 p-6
학생 추천 카드:  rounded-xl bg-white border border-neutral-200 p-5 active:bg-neutral-50
지표 타일:      rounded-md bg-white border border-neutral-200 p-4
```

### 버튼
```
Primary:        rounded-lg bg-[#0f766e] text-white hover:bg-[#115e59] px-4 py-2.5
Secondary:      rounded-lg bg-white border border-neutral-300 text-neutral-700 hover:bg-neutral-50 px-4 py-2.5
Text:           text-neutral-500 hover:text-neutral-800
학생 화면 전용:  w-full min-h-12 text-base  (터치 타깃 48px 이상)
```

### 입력 필드
```
기본:           rounded-lg bg-white border border-neutral-300 px-4 py-3 text-sm
                focus:border-[#0f766e] focus:ring-1 focus:ring-[#0f766e]
학생 설문 전용:  px-4 py-4 text-base  (16px 미만이면 iOS에서 포커스 시 자동 확대된다)
```

### 선택 칩 (관심 분야 선택)
```
미선택: rounded-full border border-neutral-300 px-4 py-2 text-sm text-neutral-700
선택:   rounded-full border border-[#0f766e] bg-[#f0fdfa] px-4 py-2 text-sm text-[#0f766e] font-medium
```

## 레이아웃

- 기관·강사 화면: `max-w-6xl`, **좌측 정렬**
- 학생 화면: `max-w-md mx-auto` — 모바일 단일 컬럼이므로 중앙 배치가 유일한 예외다
- 간격: `gap-3`~`gap-4`, 섹션 간 `space-y-8`
- 좌우 여백은 어느 너비에서도 최소 16px 유지

## 타이포그래피

| 용도 | 스타일 |
|------|--------|
| 페이지 제목 (기관) | `text-2xl font-semibold text-neutral-900` |
| 설문 질문 (학생) | `text-xl font-semibold text-neutral-900 leading-snug` |
| 카드 제목 | `text-sm font-medium text-neutral-500` |
| 본문 (기관) | `text-sm text-neutral-700 leading-relaxed` |
| 본문 (학생) | `text-base text-neutral-700 leading-relaxed` |
| 지표 숫자 | `text-3xl font-semibold text-neutral-900 tabular-nums` |
| 추천 이유 한 줄 | `text-sm text-neutral-600 leading-relaxed` |

지표 숫자에는 `tabular-nums`를 반드시 넣는다. 숫자 폭이 흔들리면 표가 읽히지 않는다.

## 애니메이션

- `fade-in` (0.2s) — 추천 결과, 모달
- `slide-up` (0.25s) — 설문 단계 전환
- 그 외 모든 애니메이션 금지. 로딩은 스피너 대신 정적 문구(`추천을 찾고 있어요`)로 처리한다.
- `prefers-reduced-motion: reduce`에서는 둘 다 끈다.

## 아이콘

- SVG 인라인, `strokeWidth 1.5`
- 아이콘을 둥근 배경 박스로 감싸지 않는다
- 아이콘 단독으로 의미를 전달하지 않는다. 항상 텍스트 라벨과 함께 쓴다

## 안전 관련 UI 규칙 (CRITICAL)

1. **강사 연락처를 표시하는 UI 영역을 아예 만들지 않는다.** 조건부로 숨기는 컴포넌트도 만들지 않는다. 존재하지 않는 영역은 새지 않는다.
2. **학생은 항상 가명으로 표시한다.** `중2 학생 A` 형식. 가명코드 원문을 화면에 그대로 노출하지 않는다.
3. **Q&A 작성 화면에 "이 질문은 모두에게 공개되며 기관 선생님도 봅니다"를 입력란 바로 위에 명시한다.** 작은 회색 각주로 숨기지 않는다.
4. 추천 카드에 강사 개인 사진을 쓰지 않는다. 분야·경력·프로그램 정보로만 구성한다.
5. **현재 등록된 업체 수·강사 수를 기관 화면에 명시한다.** 파일럿 시점에는 추천 결과가 한 업체로 쏠린다. 이걸 숨기면 기관이 나중에 알아차렸을 때 데이터 전체의 신뢰를 잃는다. `등록 업체 1곳 · 강사 6명` 같은 사실을 그대로 보여준다.

## 접근성

- 본문 대비 4.5:1 이상. 보조 텍스트(`#737373`)는 흰 배경에서만 쓰고 `#f5f5f5` 위에는 쓰지 않는다.
- 모든 입력에 `<label>`을 연결한다. placeholder를 라벨 대신 쓰지 않는다.
- 터치 타깃 최소 44×44px. 학생 화면은 48px.
