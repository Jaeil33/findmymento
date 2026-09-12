# Find My Mento

지역 기반 교육 강사·멘토 매칭 플랫폼. 특강 직후 생긴 학생의 관심을 **우리 지역 직업인 강사**의 후속 교육으로 잇는다. 수요 주체는 **학교 · 기관 · 개인(보호자)** 3종이다. 파일럿 지역은 경기도 광명시.

기획은 `docs/PRD.md`, 권한·데이터 모델은 `docs/ARCHITECTURE.md`, 기술 결정은 `docs/ADR.md`, 설문 문항은 `docs/SURVEY.md`, 화면 규칙은 `docs/UI_GUIDE.md`를 따른다.

---

## 빠르게 띄우기

```bash
npm install
npm run dev          # http://localhost:3000
```

`.env.local`이 없어도 바로 뜬다. Supabase 키가 없으면 **데모 데이터 모드**로 동작한다 (아래 참고).

```bash
npm run build        # 프로덕션 빌드
npm run lint         # ESLint
npm test             # Vitest (1회 실행)
```

---

## 두 가지 동작 모드

| | 데모 데이터 모드 | 실 DB 모드 |
|---|---|---|
| 조건 | `NEXT_PUBLIC_SUPABASE_URL` / `ANON_KEY` 없음 | 둘 다 있음 |
| 데이터 | `src/data/demo.ts` 시드 (읽기) + 서버 메모리 (쓰기) | Supabase Postgres + RLS |
| 로그인 | `/login`에서 역할 골라 둘러보기 | 이메일 매직링크 |
| 권한 | 데모 쿠키 (`isDemoMode()` 안에서만 동작) | `org_members`/`instructors`/`admins` 테이블 조회 |

데모 모드는 **파일럿 전에 기관·강사에게 실제 화면을 보여주기 위한 것**이다. 시드에는 잘 되는 경우만 담지 않았다 — 미배정 회차, 응답 0건 회차, 공급 0인 분야, 48시간 미답변 Q&A, 추천 0건이 모두 들어 있다. 화면을 검수할 때 이 상태들을 그대로 보게 된다.

데모 모드의 쓰기는 서버 인스턴스 메모리에만 남는다. 재시작하면 사라지고, 서버리스 환경에서는 인스턴스마다 다를 수 있다.

---

## Vercel 배포

**클릭 순서는 `docs/DEPLOY.md`에 전부 있다.** 아래는 요약이다.

배포는 두 단계로 나눈다. 섞으면 뭐가 문제인지 알 수 없다.

| 단계 | 환경변수 | 얻는 것 |
|---|---|---|
| 1단계 · 데모 배포 | **없음** | 기관·강사에게 보여줄 수 있는 실제 화면 |
| 2단계 · 실 DB 연결 | Supabase 3개 | 파일럿에 실제로 쓸 수 있는 서비스 |

```bash
npm run verify   # lint → build → test. 이 순서여야 번들 검사가 의미가 있다
```

GitHub 저장소를 [vercel.com/new](https://vercel.com/new)에서 import하면 된다. 빌드 설정은 기본값 그대로(Framework: Next.js). Function Region은 대시보드에서 **Seoul (icn1)** 로 바꾼다 — 교실에서 30명이 동시에 QR을 찍는다.

### 환경변수

| 키 | 필수 | 비고 |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | 권장 | QR이 가리킬 도메인. 비우면 Vercel이 주는 도메인을 쓴다 |
| `NEXT_PUBLIC_SUPABASE_URL` | 실 DB용 | 없으면 데모 모드 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 실 DB용 | 없으면 데모 모드 |
| `SUPABASE_SERVICE_ROLE_KEY` | 운영자 기능용 | **`NEXT_PUBLIC_` 접두사를 절대 붙이지 말 것** |
| `ANTHROPIC_API_KEY` | 선택 | 없으면 추천이 규칙 기반으로 동작한다 (E-06) |

키 하나 없이도 배포와 화면 확인이 된다. 넣는 순서는 `Supabase → ANTHROPIC`이고, 둘 다 나중에 추가해도 코드 변경이 없다.

### 배포 후 확인

`/api/health`가 환경변수 상태를 한 번에 알려준다. **키 값은 내려오지 않는다** — 설정 여부와 공개 도메인까지다.

```json
{ "mode": "live", "site_url": "https://...", "student_entry_example": "https://.../s/123456",
  "config": { "supabase_url": true, "service_role_key": true, "site_url_explicit": true } }
```

- [ ] `site_url_explicit`이 `true`. QR이 전부 이 값으로 만들어지므로 틀리면 교실에서 찍힌 QR 전부가 죽는다.
- [ ] **실물 휴대폰으로 QR 스캔.** `/project/{sessionId}`를 프로젝터에 띄우고 **뒤쪽 좌석에서** 찍는다.
- [ ] 모바일 레이아웃. 학생 화면은 `/s/{코드}`이고 360px 폭 기준으로 본다.
- [ ] 서버 전용 키가 클라이언트 번들에 없는지 — `npm run verify`가 `tests/bundle-secrets.test.ts`로 빌드 산출물을 직접 열어 확인한다 (service_role JWT·`sk-ant-` 형식까지 본다).

---

## Supabase 연결

SQL Editor에 파일을 붙여 실행한다. **순서대로 한 번씩.**

| # | 파일 | 필수 | 내용 |
|---|---|---|---|
| 1 | `supabase/migrations/20260912000000_init.sql` | 필수 | 19개 테이블 + RLS 전부 + 역할 판별 함수 |
| 2 | `supabase/bootstrap.sql` | 필수 | **첫 운영자 연결** + 파일럿 기관·업체 |
| 3 | `supabase/seed.sql` | 선택 | 검수·RLS 테스트용 픽스처 |

2번이 필요한 이유: 이 서비스에는 공개 회원가입이 없고(ADR-011) 초대를 만들 수 있는 건 운영자뿐이다. 그래서 마이그레이션 직후의 DB는 **아무도 들어갈 수 없는 상태**다. `bootstrap.sql`이 그 고리를 끊는다 — 이미 만들어 둔 auth 계정 하나를 `admins`에 연결한다. 상단 `v_admin_email`을 고치지 않으면 일부러 실행이 실패한다.

CLI를 쓰려면 (Docker 없이도 된다):

```bash
npx supabase login
npx supabase link --project-ref <PROJECT_REF>
npm run db:push      # supabase/migrations 적용
npm run db:types     # src/types/database.ts 생성
```

키를 넣은 뒤에는 RLS 네거티브 테스트를 켤 수 있다. `seed.sql` 마지막 `select`가 출력하는 값을 `.env.local`에 붙이면 **실제 역할 키**로 14개 항목이 검증된다 (`service_role`로는 RLS를 우회하므로 의미가 없다). 키가 없으면 건너뛰고, 대신 `tests/rls-policies.test.ts`가 마이그레이션 SQL을 정적으로 검증한다.

---

## 구조

```
src/
├── app/
│   ├── (public)/          랜딩 · 프로그램 디렉토리 · 강사 상세 · 보호자 문의 · 로그인 · 초대
│   ├── (student)/         s/[code] 설문+추천 · 공개 Q&A
│   ├── (org)/             기관·학교 대시보드 (회차 · 수요 · 관심표현 · 섭외)
│   ├── (instructor)/      강사 워크스페이스 (배정 회차 · 리포트 · 수요 · 섭외 · 리드 · Q&A)
│   ├── (admin)/           운영자 (심사 · 문의 배정 · 미답변 큐 · 초대)
│   ├── (projection)/      project/[id] 교실 투사용 전체화면 QR
│   └── api/               survey · recommend · interest · qna · inquiry · health
├── middleware.ts          Supabase 세션 쿠키 갱신 **전용** (역할 판단은 하지 않는다)
├── components/            ui 프리미티브 · 레이아웃 · 리포트 · 디렉토리 · 설문
├── lib/
│   ├── db/                dataset(조회) · queries(순수 집계) · writes · ops
│   ├── supabase/          server · client · env
│   ├── auth/              역할 판별 · 초대 토큰 검증
│   ├── region/            시군구 인접 확장 (1-hop → 2-hop)
│   ├── moderation/        연락처·링크·이름 마스킹
│   └── ai/                후보 필터 + LLM 순위 + 규칙 fallback
├── data/                  region-adjacency.json (생성물) · demo.ts
└── types/
```

조회 로직은 **`Dataset` 위의 순수 함수 한 벌**(`lib/db/queries.ts`)이고, 데이터 출처만 `lib/db/dataset.ts`가 가른다. 그래서 데모 모드와 실 DB 모드가 같은 집계 코드를 쓰고, 테스트도 같은 함수를 검증한다.

`src/data/region-adjacency.json`은 생성물이다. 손으로 고치지 말고:

```bash
node scripts/gen-region.mjs
```

간선 목록을 한 방향으로만 적고 대칭성을 코드가 보장한다.

---

## 이 코드에서 **하지 않는** 것

안전 설계는 설정이 아니라 **기능의 부재**로 구현돼 있다. 아래는 버그가 아니라 제약이다.

- 학생 실명·연락처·학교를 저장하는 컬럼이 없다. 학생 식별은 기관 발급 가명코드뿐이다.
- 강사 연락처를 표시하는 UI 영역이 없다. 조건부로 숨기는 컴포넌트도 없다.
- 1:1 비공개 메시지 경로가 없다. 학생↔강사 소통은 공개 Q&A 스레드뿐이다.
- 공개 회원가입 화면이 없다. 모든 계정은 1회용·만료 검증을 거친 초대에서 출발한다.
- 학생이 누르는 버튼 중 강사에게 직접 도달하는 것이 하나도 없다.
- 보호자 문의 폼에 아이 이름·학교·생년월일 입력란이 없다. 학년대까지만 받는다.
- 강사에게 회차 생성 권한이 없다. 회차는 기관·학교가 만들고 강사를 **배정**한다.
- 평점·리뷰·"인기"·"추천" 배지 UI가 없다.

이 규칙들은 `tests/safety-invariants.test.ts`와 `tests/rls-policies.test.ts`가 소스와 마이그레이션을 훑어 고정한다. 새 화면을 만들다 규칙을 넘기면 테스트가 먼저 터진다.

---

## 파일럿 전에 코드 밖에서 끝내야 하는 일

`plan.md`의 "병렬 트랙"을 본다. 요약하면:

- 설문 문항 승인 (`docs/SURVEY.md`) · 3DNFLY 입점 합의
- 강사 자격 증빙 + **성범죄경력 조회 증빙** 수집 (업체 경유)
- 보호자 문의 폼 개인정보 수집·이용 동의문 확정
- 파일럿 기관 개인정보 처리위탁 계약 (**가명코드↔실명 매핑은 기관 보유** 명시)
- 가명코드 배부 방식 결정 (스티커 / 명찰 / 좌석표)
- **강사용 수업 마무리 안내 스크립트 1장** — 학생 유입의 실제 트리거다
