# 배포 절차 (Vercel + Supabase)

이 문서는 **클릭 순서**다. 기술 결정의 근거는 `docs/ADR.md`(특히 ADR-012), 코드 구조는 `README.md`를 본다.

배포는 두 단계로 나눠서 한다. 섞으면 뭐가 문제인지 알 수 없다.

| 단계 | 환경변수 | 얻는 것 | 걸리는 시간 |
|---|---|---|---|
| **1단계 · 데모 배포** | 없음 | 기관·강사에게 보여줄 수 있는 실제 화면 | 5분 |
| **2단계 · 실 DB 연결** | Supabase 3개 | 파일럿에 실제로 쓸 수 있는 서비스 | 30분 |

1단계만으로도 공유 가능한 URL이 나온다. 입점 협의·기관 미팅은 1단계에서 하고, 2단계는 파일럿 날짜가 잡힌 뒤에 해도 된다.

---

## 현재 배포 (2026-09-13 확인)

| 항목 | 값 |
|---|---|
| **운영 URL** | https://findmymento.vercel.app |
| 상태 확인 | https://findmymento.vercel.app/api/health |
| 배포 방식 | GitHub 연동 · `main` 푸시하면 자동 배포 |
| Function Region | **Seoul (icn1)** — 응답 헤더 `X-Vercel-Id`가 `icn1::`로 시작하면 정상 |
| 현재 단계 | **1단계 · 데모** (환경변수 0개) |

`/api/health`가 **현재 배포된 커밋 해시와 환경변수 설정 여부**를 그대로 돌려준다. 배포가 반영됐는지 확인할 때 대시보드를 열 필요 없이 이것만 보면 된다.

```bash
curl -s https://findmymento.vercel.app/api/health
# {"ok":true,"mode":"demo","commit":"1947a11","config":{...}}
```

### 지금 꺼져 있는 것 — 읽고 넘어갈 것

**`ANTHROPIC_API_KEY`가 설정돼 있지 않다. 그래서 AI 추천이 규칙 폴백으로만 동작한다.**

학생 화면에 뜨는 추천 이유는 LLM이 만든 문장이 아니라 `ruleReason()`이 만든 템플릿 문장이다. 설계상 의도된 동작이고(E-06, ADR-004) 화면은 정상으로 보이지만, **지금 이 데모에서 AI는 한 줄도 돌지 않는다.**

- 기관·심사 자리에서 이 화면을 "AI 추천"으로 소개하려면 **키를 먼저 넣어야 한다** (2-4절).
- 키를 넣은 뒤에는 `/api/health`의 `config.anthropic_api_key`가 `true`로 바뀌는지 확인한다.
- 넣지 않고 시연할 거라면 "규칙 기반으로 동작 중"이라고 말하는 편이 낫다. 물어보면 바로 드러난다.

---

## 0. 사전 확인

```bash
npm install
npm run lint && npm test && npm run build
```

넷 다 통과해야 한다. `npm test`는 빌드 후에 한 번 더 의미가 있다 — `tests/bundle-secrets.test.ts`가 **빌드 산출물을 직접 열어** 서버 전용 키가 섞여 들어갔는지 본다.

---

## 1단계 · 데모 배포 (환경변수 0개)

### 1-1. GitHub에 올린다

```bash
git push -u origin <브랜치>
```

### 1-2. Vercel에서 import

1. [vercel.com/new](https://vercel.com/new) → Import Git Repository → `findmymento`
2. Framework Preset이 **Next.js**로 자동 인식되는지 확인. 나머지는 기본값 그대로.
3. Environment Variables는 **비워 둔다.**
4. Deploy

### 1-3. Function Region을 서울로

Project Settings → Functions → Function Region → **Seoul (icn1)**.

학생이 교실에서 QR을 찍는 순간 30명이 동시에 들어온다. 기본값(미국 동부)이면 왕복 한 번에 200ms씩 붙는다. 이건 `vercel.json`에 넣지 않고 대시보드에서 바꾼다 — 요금제에 따라 허용 리전이 달라서 파일에 박으면 배포가 실패할 수 있다.

### 1-4. 확인

| 경로 | 봐야 할 것 |
|---|---|
| `/` | 랜딩 |
| `/api/health` | `"mode": "demo"` |
| `/login` | 역할 골라 둘러보기 4개 |
| `/programs` | 프로그램 목록 |
| `/s/735104` | 학생 설문 — **휴대폰으로 열어 본다.** 응답이 열려 있는 회차다 |
| `/s/482913` | 마감된 회차 화면. 의도된 상태이고 버그가 아니다 |

`/login`에서 "기관 담당자"로 들어가면 회차·수요·관심표현·섭외가 전부 보인다. 이 데이터는 `src/data/demo.ts` 시드이고 **서버 메모리에만 쓰인다** — 새로고침은 유지되지만 재배포하면 초기화된다. 기관 미팅용으로는 충분하고, 실제 설문 수집에는 쓸 수 없다.

> `NEXT_PUBLIC_SITE_URL`을 안 넣으면 QR은 Vercel이 준 도메인을 가리킨다. 데모 단계에서는 그게 맞다.

---

## 2단계 · 실 DB 연결

### 2-1. Supabase 프로젝트 생성

[supabase.com/dashboard](https://supabase.com/dashboard) → New project

- Region: **Northeast Asia (Seoul)**
- Database Password: 어딘가에 적어 둔다 (나중에 받을 방법이 없다)

### 2-2. 스키마 적용

SQL Editor → New query → 파일 내용을 붙여 RUN. **순서대로 한 번씩.**

| # | 파일 | 필수 | 내용 |
|---|---|---|---|
| 1 | `supabase/migrations/20260912000000_init.sql` | 필수 | 19개 테이블 + RLS 전부 + 역할 판별 함수 |
| 2 | `supabase/bootstrap.sql` | 필수 | 첫 운영자 연결 + 파일럿 기관·업체 |
| 3 | `supabase/seed.sql` | 선택 | 검수·RLS 테스트용 픽스처 |

**2번 전에 운영자 계정을 먼저 만든다.** Authentication → Users → Add user → 이메일 입력(Auto Confirm User 켜기). 그 다음 `bootstrap.sql` 상단 `v_admin_email`을 그 이메일로 고치고 실행한다.

고치지 않으면 실행이 실패한다. 일부러 그렇게 해 뒀다 — 더미 이메일로 운영자 계정이 생기면 아무도 눈치채지 못한다.

CLI를 쓰려면 (Docker 없이도 된다):

```bash
npx supabase login
npx supabase link --project-ref <PROJECT_REF>
npm run db:push      # migrations 적용
npm run db:types     # src/types/database.ts 생성
```

`bootstrap.sql`·`seed.sql`은 마이그레이션이 아니므로 `db push` 대상이 아니다. SQL Editor에 붙이거나 `psql`로 직접 실행한다.

### 2-3. Auth URL 설정 — **여기서 제일 많이 막힌다**

Authentication → URL Configuration

| 항목 | 값 |
|---|---|
| Site URL | `https://<배포도메인>` |
| Redirect URLs | `https://<배포도메인>/login/callback` |

매직링크는 메일 → Supabase → **Redirect URLs에 등록된 주소**로만 돌아온다. 등록하지 않으면 링크를 눌러도 Site URL로 떨어지고 로그인이 안 된다. 프리뷰 배포에서도 로그인하려면 `https://*.vercel.app/login/callback`을 함께 넣는다.

> Supabase 기본 메일 발송은 시간당 개수 제한이 있다. 파일럿 계정 수(운영자 1 + 기관 2~3 + 강사 2~3)에는 충분하지만, 로그인 링크를 연달아 여러 번 받으면 잠시 막힌다. 운영 단계에서는 커스텀 SMTP를 붙인다.

### 2-4. Vercel 환경변수

Project Settings → Environment Variables. Production·Preview 둘 다 체크.

| 키 | 어디서 | 비고 |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | 배포 도메인 | **QR이 전부 이 값으로 만들어진다.** 끝에 `/` 붙이지 않는다 |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → API | |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 같은 화면 | 공개 키. 브라우저에 내려가는 게 정상이다 |
| `SUPABASE_SERVICE_ROLE_KEY` | 같은 화면 (Reveal) | **`NEXT_PUBLIC_` 접두사를 절대 붙이지 말 것.** 없으면 심사·초대·문의 배정이 안 된다 |
| `ANTHROPIC_API_KEY` | 선택 | 없으면 추천이 규칙 기반으로 동작한다 (E-06, ADR-004) |

입력 후 **재배포해야 적용된다** (Deployments → 최신 → Redeploy).

### 2-5. 확인

`/api/health`:

```json
{
  "mode": "live",
  "site_url": "https://<배포도메인>",
  "student_entry_example": "https://<배포도메인>/s/123456",
  "config": {
    "supabase_url": true,
    "supabase_anon_key": true,
    "service_role_key": true,
    "anthropic_api_key": false,
    "site_url_explicit": true
  }
}
```

`site_url_explicit`이 `false`면 `NEXT_PUBLIC_SITE_URL`이 안 들어간 것이다. `student_entry_example`의 도메인을 눈으로 확인한다 — 오타는 배포 후에 QR을 찍어 봐야 드러나고, 그때는 이미 교실이다.

### 2-6. 첫 로그인 → 계정 만들기

1. `/login` → 운영자 이메일 입력 → 받은 링크 클릭 → `/admin`으로 들어간다
2. `/admin/invitations` → 기관 담당자·강사 초대 발송
3. 화면에 나온 `/invite/{token}`을 도메인에 붙여 당사자에게 전달한다 (`https://<도메인>/invite/abc...`)
4. 당사자가 링크를 열고 이메일을 입력하면 계정이 연결된다

초대 토큰은 **1회용이고 7일 뒤 만료**된다. 만료되면 새로 발송한다.

`/login?error=no_role`이 나오면 인증은 됐지만 `org_members`/`instructors`/`admins` 어디에도 행이 없다는 뜻이다 — 초대를 수락하지 않은 계정이다. 역할을 JWT나 화면 입력으로 판단하지 않기 때문에 생기는 정상 동작이다.

---

## 3. 파일럿 투입 전 필수 검증

여기를 건너뛰면 교실에서 터진다. ADR-012가 인정한 리스크가 정확히 이 지점이다.

- [ ] `/api/health`의 `mode`가 `live`, `site_url_explicit`이 `true`
- [ ] **실물 휴대폰으로 QR 스캔.** `/project/{sessionId}`를 프로젝터에 띄우고 **교실 뒤쪽 좌석에서** 찍는다. 앞에서만 찍어 보면 의미가 없다
- [ ] 학생 화면(`/s/{코드}`)을 360px 폭에서 확인 — 설문 7문항 제출까지
- [ ] 설문 제출 → 기관 대시보드 리포트에 숫자가 올라오는지
- [ ] 마감된 회차에 제출 시도 → 거부되는지 (E-17)
- [ ] 보호자 문의 폼 제출 → `/admin/inquiries`에 보이는지
- [ ] 강사 계정으로 로그인 → **배정된 회차만** 보이는지
- [ ] 빌드 산출물에 서버 키 없음: `npm run build && npm test`

Supabase 키를 넣었다면 RLS 네거티브 테스트 14개를 **실제로** 돌린다. `seed.sql` 마지막 `select`가 출력하는 값을 `.env.local`에 붙이고:

```bash
npm test -- tests/rls-negative.live.test.ts
```

지금까지 이 14개는 키가 없어서 건너뛰고 있었다. 파일럿 전에 한 번은 초록색을 봐야 한다 — 권한 모델이 실제로 동작하는지 확인하는 유일한 방법이다.

---

## 4. 자주 막히는 곳

| 증상 | 원인 | 조치 |
|---|---|---|
| QR을 찍으면 `localhost:3000` | `NEXT_PUBLIC_SITE_URL` 없음 | 환경변수 넣고 **재배포** |
| 매직링크를 눌러도 로그인 안 됨 | Redirect URLs에 `/login/callback` 없음 | 2-3 참고 |
| `/login?error=no_role` | 초대 미수락 계정 | 초대 링크로 먼저 수락 |
| 로그인 후 한 시간쯤 지나면 튕김 | 세션 갱신 실패 | `src/middleware.ts`가 배포에 포함됐는지 확인 |
| 심사·초대·문의 배정 버튼이 실패 | `SUPABASE_SERVICE_ROLE_KEY` 없음 | 환경변수 추가 후 재배포 |
| 추천 이유 문장이 단조로움 | `ANTHROPIC_API_KEY` 없음 | 정상 동작(규칙 fallback). 필요하면 키 추가 |
| 강사 화면에 회차가 하나도 없음 | 배정이 안 된 것 | 기관이 `lecture_sessions.instructor_id`로 배정해야 보인다 (ADR-015) |
| 화면이 비어 있음 | 실 DB는 빈 상태로 시작한다 | `seed.sql`을 넣거나 기관이 회차를 만든다 |

---

## 5. 코드 밖에서 끝나야 하는 일

배포가 끝나도 이게 안 되면 파일럿을 돌릴 수 없다. `plan.md`의 "병렬 트랙"에 전체 목록이 있고, 배포 시점에 걸리는 것은 둘이다.

- **파일럿 기관 개인정보 처리위탁 계약** — 가명코드↔실명 매핑은 기관이 보유한다는 조항이 들어가야 한다. 이게 없으면 학생 데이터를 받을 수 없다
- **강사용 수업 마무리 안내 스크립트 1장** — 학생 유입의 실제 트리거다. 강사가 QR 안내를 빼먹으면 응답이 0건이 되고(E-24), 그건 코드로 고칠 수 없다
