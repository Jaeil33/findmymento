# 파일럿 운영 스크립트 (실제 교실 수업용)

실제 학생 응답을 **Supabase(실 DB)에 저장**하는 파일럿 배포를 준비하고, 수업 뒤 데이터를 내보내는 도구다.
데모 배포(`findmymento.vercel.app`)는 응답을 서버 메모리에만 쓰므로 실제 수집에 쓸 수 없다 — 파일럿은 **별도 Vercel 프로젝트 + Supabase** 로 돌린다.

| 명령 | 하는 일 |
|---|---|
| `npm run pilot:sql` | 마이그레이션 전부를 `pilot-data/setup-all.sql` 한 파일로 묶는다 (SQL Editor 에 붙여 넣을 파일) |
| `npm run pilot:setup` | 기관·강사·추천 후보 프로그램·회차를 DB 에 넣고, 교실용 QR(PNG·HTML)을 만든다. 여러 번 실행해도 안전 |
| `npm run pilot:rehearse` | 배포된 사이트에서 가상 학생이 설문 → 추천 → 저장까지 되는지 확인. 리허설 회차는 끝나면 자동 삭제 |
| `npm run pilot:export -- --code <입장코드>` | 수업 데이터를 CSV(엑셀용)·JSON·요약 문서로 내보낸다 |

`pilot-data/` 폴더는 `.gitignore` 에 들어 있다. **학생 응답·설정·QR 은 절대 커밋하지 않는다.**

---

## 순서

### 1. Supabase 프로젝트 만들기 (5분)

1. <https://supabase.com/dashboard> → **New project**
2. Region: **Northeast Asia (Seoul)** · Database Password 는 따로 적어 둔다 (다시 볼 수 없다)
3. 프로젝트가 준비될 때까지 1~2분 기다린다

### 2. DB 구조 한 번에 만들기

```bash
npm run pilot:sql
```

`pilot-data/setup-all.sql` 이 생긴다. Supabase → **SQL Editor** → **New query** → 파일 내용을 **전부** 붙여 넣고 **Run**.

- 결과 표의 `rls_disabled_tables` 가 **0** 이어야 한다 (모든 테이블 RLS 켜짐).
- **새 프로젝트에서 한 번만** 실행한다. 두 번 실행하면 `already exists` 오류가 난다 (전체가 한 트랜잭션이라 실패해도 반쯤 적용되지는 않는다).
- 마이그레이션이 추가되면 `npm run pilot:sql` 을 다시 돌려 새 파일을 쓴다.

### 3. `.env.local` 채우기 (프로젝트 루트, 메모장으로)

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
NEXT_PUBLIC_SITE_URL=https://findmymento-pilot.vercel.app
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_WORKSPACE_ID=wrkspc_...   # 키가 조직 단위일 때만
```

| 값 | 어디서 |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → **Data API**(또는 API) → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Project Settings → **API Keys** → `anon` `public` 키. 새 프로젝트는 **Publishable key** (`sb_publishable_...`) |
| `SUPABASE_SERVICE_ROLE_KEY` | 같은 화면 → `service_role` `secret` 키 (Reveal). 새 프로젝트는 **Secret key** (`sb_secret_...`) |
| `NEXT_PUBLIC_SITE_URL` | 파일럿 Vercel 프로젝트의 운영 주소. 끝에 `/` 를 붙이지 않는다. **QR 이 이 주소를 가리킨다** |
| `ANTHROPIC_API_KEY` | Anthropic Console → API Keys |
| `ANTHROPIC_WORKSPACE_ID` | 키가 작업공간에 묶이지 않은 조직 단위 키일 때만. Console → Settings → Workspaces 의 ID (`wrkspc_...`). 없으면 AI 호출이 전부 400 으로 거절된다 |

같은 다섯 값을 **Vercel 파일럿 프로젝트 → Settings → Environment Variables** 에도 넣고 **재배포**한다.

> ⚠ `SUPABASE_SERVICE_ROLE_KEY`·`ANTHROPIC_API_KEY` 에 **`NEXT_PUBLIC_` 접두사를 절대 붙이지 않는다.** 붙이면 브라우저 번들로 새어 나간다.
> 스크립트는 이 조합을 발견하면 실행을 멈춘다. 키 값은 어떤 출력에도 찍지 않는다.

### 4. 파일럿 설정 작성

```bash
mkdir pilot-data   # 없으면
copy scripts\pilot\pilot.config.example.json pilot-data\pilot.config.json
```

`pilot-data/pilot.config.json` 을 실제 값으로 바꾼다. 각 값의 허용 목록은 파일 맨 위 `_설명` 에 있다.

- **`programs` = 학생 결과 화면의 추천 후보.** 실제로 운영하는(또는 운영자가 허락한) 과정만 넣는다. 없는 과정을 지어내지 않는다.
  0개면 수업 추천 대신 **진로 카드 3장**이 나간다 — 검수된 진로 목록에서 AI가 3개를 고르고 이유를 쓴다 (ADR-027).
- 분야(`field`)는 설문 선택지(드론 · 3D 모델링·프린팅 · VR·AR · AI·코딩 · 뷰티) 중 하나여야 추천이 맞춰진다.
- `region_code` 는 5자리 시군구 코드(예: 경기 광명시 = `41210`). 이름을 적으면 스크립트가 코드를 알려 준다.
- `OO`, `example.com` 같은 예시 값이 남아 있으면 setup 이 멈춘다.

### 5. 반영 + QR

```bash
npm run pilot:setup -- --dry-run   # 먼저 계획만 확인 (접속 없음)
npm run pilot:setup                # 실제 반영
```

출력에 **입장 코드**, **학생 주소**, `pilot-data/qr-<코드>.png`, `pilot-data/qr-<코드>.html` 이 나온다.
HTML 을 브라우저로 열어 **F11 전체화면**으로 교실 TV 에 띄우거나 인쇄한다. 교실 **뒤쪽 좌석에서** 휴대폰으로 찍어 본다.

마지막에 배포 사이트를 확인한다 — `/api/health` 가 `live` 인지, 학생 화면이 이 회차를 찾는지.
경고가 나오면 수업 전에 해결한다.

### 6. 리허설 (수업 전에 꼭)

```bash
npm run pilot:rehearse                        # 가상 학생 3명, 한 명씩
npm run pilot:rehearse -- --n 5 --parallel    # 동시에 제출하는 교실 상황
```

같은 기관 아래 `[리허설] ...` 회차를 따로 만들어 확인하고, 끝나면 지운다. **실제 수업 회차는 건드리지 않는다.**
확인하는 것: 학생 화면 열림 · 설문 저장 · 추천 응답 시간 · AI 생성(llm) 여부 · 자유서술 전화번호 마스킹 · 추천 기록 저장 · 삭제.
`✔ 리허설 통과` 가 나와야 수업에 쓴다. 추천 호출은 실제 AI 를 부른다 (1명당 약 $0.03~0.05).

중간에 멈춰 리허설 회차가 남았다면: `npm run pilot:rehearse -- --cleanup`

### 7. 수업

- 끝나기 **5분 전**에 QR 화면을 띄우고 안내한다: "휴대폰 카메라로 찍으면 3분짜리 질문이 나와요. 이름·학교는 안 물어봐요. 끝나면 너한테 맞는 다음 수업을 알려줘요."
- 자유서술 칸에 이름·연락처를 쓰지 말라고 한 번 말한다 (써도 저장 전에 지워지지만).
- 응답이 모일 때까지 화면을 띄워 둔 채 마무리한다.

### 8. 수업 뒤 — 바로 내보내기

```bash
npm run pilot:export -- --code 123456
```

`pilot-data/export-123456-<시각>/` 에 생긴다:

| 파일 | 내용 |
|---|---|
| `summary.md` | 핵심 지표(후속 의향 3점 이상 비율), 만족도·후속 의향 분포, 관심 분야(미충족 수요 표시), 참여 가능 시간, 학생이 쓴 말, AI 추천 기록·추정 비용 |
| `responses.csv` | 응답 원본 (엑셀에서 바로 열림). 가명 연결 키는 빼고 익명 여부만 |
| `interests.csv` | "더 배우고 싶어요" 버튼 기록 |
| `recommendations.csv` | 학생별로 보여 준 추천 카드와 AI 추천 이유, 지연·토큰 |
| `raw.json` | 위 전부의 원본 |

- Supabase 무료 플랜은 백업을 내려받을 수 없고, 1주일 동안 쓰지 않으면 프로젝트가 일시 정지된다. **수업 당일에 한 번 내보내 둔다.**
- 이 폴더는 학생 응답 원본이다. 메일·메신저로 돌리지 말고, 공유가 필요하면 `summary.md` 의 집계만 쓴다.
- 응답이 5건 미만이면 집계를 외부 자료에 쓰지 않는다 (작은 표본은 개인이 드러난다).

---

## 자주 막히는 곳

| 증상 | 원인 | 조치 |
|---|---|---|
| `테이블이 없어요` | SQL 번들을 안 돌렸거나 다른 프로젝트 키 | 2단계를 같은 프로젝트에서 실행, `.env.local` URL 확인 |
| `사이트가 데모 모드예요` | Vercel 파일럿 프로젝트에 Supabase 환경변수 없음 | 3단계 값을 Vercel 에 넣고 **재배포** |
| 학생 화면이 회차를 못 찾음 | 배포가 다른 DB 를 보거나 학생 경로 수정이 배포 전 | Vercel 환경변수의 Supabase URL 확인, 최신 커밋 배포 확인 |
| 401 / 403 | Vercel Deployment Protection | Settings → Deployment Protection 끄기, 또는 운영(Production) 주소 사용 |
| AI 생성(llm) 0개 | 배포에 `ANTHROPIC_API_KEY` 없음 · 조직 단위 키인데 `ANTHROPIC_WORKSPACE_ID` 없음(http_400) · 크레딧 소진 · 시간 초과 | Vercel 환경변수·Console 잔액 확인. 이때도 학생 화면은 규칙 문장으로 정상 동작한다 |
| 추천 카드 0개 | 프로그램의 대상 학년·분야·강사 지역이 회차와 안 맞음 | `pilot:setup -- --dry-run` 경고 확인 |
