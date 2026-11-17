# step 12 — 체험 모드 (tour-mode)

## 요청
홈페이지가 로그인 없이 작동할 것 — 운영자·강사·학생 모드로 바로 들어갈 수 있게. 그리고 강사·학생
사용 방법을 홈페이지에 적을 것.

## 설계 (ADR-033)
체험 쿠키(`fmm_tour`)는 **권한이 아니라 데이터 출처**를 바꾼다. 이 한 문장이 전부다.

- 쿠키가 있는 요청은 `getServerSupabase()`·`getServiceSupabase()` 가 **둘 다 null** 이다.
  실 DB 핸들을 얻을 방법이 없으므로, 쿠키로 역할을 정해도 실 DB 권한이 생기지 않는다.
- 데이터 계층의 분기 조건을 `isDemoMode()`(환경변수) → `demoDataMode()`(환경변수 + 쿠키)로 옮겼다.
  `dataset.ts` · `writes.ts` · `ops.ts` · `student-gate.ts` · `recommendation-logs.ts` · `actor.ts`.
- LLM 키는 `llmKeyForRequest()` 로만 읽는다. 체험 세션에서는 키가 있어도 null —
  익명 공개 경로이므로 방문자의 클릭이 소유자의 API 비용이 되면 안 된다. 대신 시연용 응답(ADR-025).
- 쿠키를 심는 곳은 `app/tour/[key]/route.ts` 하나. 끄는 곳은 `/tour/exit` 과 로그인 액션.

## 중간에 터진 것
생성 직후 상세 화면이 **404** 였다. Next 가 라우트 핸들러와 서버 컴포넌트를 다른 번들 레이어로
묶어 `data/demo.ts` 가 한 프로세스에 두 벌 올라왔고, 라우트에서 push 한 산출물이 페이지에서는
보이지 않았다. 데모 모드부터 있던 버그인데 체험 입구가 공개되면서 드러났다.
→ `src/data/demo-store.ts` 로 전역에 인스턴스를 고정하고, 시드를 직접 import 하는 곳을
`tests/tour-mode.test.ts` 가 0개로 고정한다. 프로덕션 빌드에서 재확인.

## 확인
- `npx next start` + 실 `.env.local`(Supabase·LLM 키 전부 있음)로 브라우저 확인:
  `/tour/instructor` → 스튜디오(데모 7건) → 생성 → 검증 통과 → 승인 버튼 → 인쇄·SVG,
  배지 "시연용 AI 문장입니다" · "지난 수업 3건 반영 (시간 ×1.4)", 상단 체험 띠, 체험 종료.
- `/tour/student` → `/s/735104` 설문 화면.
- 테스트 1299개 통과 (tour-mode 24 · 안전 불변식 3 · 랜딩 4 신규).

## 남은 것
- 서버리스 배포에서는 요청이 다른 인스턴스로 가면 방금 만든 산출물이 보이지 않을 수 있다.
  체험 중 만든 것은 저장되지 않는다고 띠에 적어 두었다.
