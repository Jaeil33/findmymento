# Step 4: entry-and-auth

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/docs/USER_FLOW.md` — 사용자 여정, 유스케이스(UC), 예외 흐름(E), 검증 가설(H)
- `/docs/ARCHITECTURE.md` — "인증과 라우팅" 섹션 전체, "권한 모델"
- `/docs/ADR.md` — ADR-011
- `/docs/PRD.md` — 핵심 기능 10(공개 랜딩 + 초대 기반 로그인), 사용자 우선순위 표
- `/docs/UI_GUIDE.md` — 전체 (랜딩도 같은 톤을 쓴다)
- `/CLAUDE.md` — 안전 규칙
- 이전 step 산출물: `src/lib/supabase/`, `src/lib/auth/getCurrentRole`, `src/types/`, `src/components/ui/` 프리미티브 4개

이전 step에서 만들어진 `getCurrentRole`과 클라이언트 팩토리를 꼼꼼히 읽고, 역할 판별이 어떻게 되는지 이해한 뒤 작업하라.

## 작업

### 1. 랜딩 1장 — `src/app/(public)/page.tsx`

섹션은 4개까지만. 마케팅 랜딩이 아니다.

1. 서비스 한 줄 설명 + 로그인 버튼
2. 문제와 해결을 각 2~3문장 (1회성 진로체험 → 후속 연결)
3. 대상별 가치 3블록 (기관 / 강사 / 학생·보호자)
4. 문의 — `mailto:` 링크로 충분하다. 문의 폼·외부 서비스를 붙이지 마라.

**안전 문구를 랜딩에 명시하라**: 학생은 가입하지 않고, 플랫폼은 학생 개인정보를 저장하지 않으며, 연결은 항상 기관을 경유한다는 사실. 이게 기관을 설득하는 핵심이므로 각주로 숨기지 말 것.

### 2. 로그인 — `src/app/(public)/login/page.tsx`

Supabase Auth **이메일 매직링크**. 비밀번호 입력란을 만들지 마라.

**회원가입 링크·버튼·문구를 어디에도 넣지 마라.** 셀프 가입이 존재하지 않는다(ADR-011). 계정이 없는 사람에게는 "기관 담당자에게 초대를 요청하세요" 안내만 보여준다.

### 3. 초대 수락 — `src/app/(public)/invite/[token]/page.tsx`

```ts
// src/lib/auth/invitations.ts
export type InviteCheck =
  | { ok: true; email: string; role: "org" | "instructor" | "admin"; orgId?: string; providerId?: string }
  | { ok: false; reason: "not_found" | "expired" | "already_used" }

export async function checkInvitation(token: string): Promise<InviteCheck>
export async function acceptInvitation(token: string): Promise<{ ok: boolean }>
```

`acceptInvitation`이 반드시 지킬 것:

- **멱등성** — 같은 토큰으로 두 번 호출해도 계정·소속 행이 두 개 생기지 않는다.
- 만료(`expires_at` 경과) 또는 이미 수락(`accepted_at` 존재) 시 실패한다.
- 성공 시 역할에 맞는 소속 행(`org_members` 또는 `instructors` 또는 `admins`)을 만들고 `accepted_at`을 기록한다. **이 둘은 같은 트랜잭션에서 처리한다.** 중간에 실패해 계정만 남는 상태를 만들지 마라.
- 토큰 검증과 행 생성은 서버에서만 한다. 클라이언트가 역할·기관ID를 보내게 만들지 마라.

### 4. 역할 분기와 보호 — `src/middleware.ts`

```
/org/*         → org 역할만
/instructor/*  → instructor 역할만
/admin/*       → admin 역할만
/, /login, /invite/*, /s/*, /qna  → 공개
```

- 로그인 후 역할에 따라 `/org`, `/instructor`, `/admin`으로 보낸다.
- 권한 없는 경로 접근은 자기 역할의 홈으로 리다이렉트한다. 404를 주지 말 것 — 존재 여부를 노출할 필요가 없다.
- 비로그인 상태로 보호 경로 접근 시 `/login`으로 보낸다.

각 역할 영역에는 빈 플레이스홀더 페이지만 둔다. 실제 화면은 step 10·11이다.

### 5. 테스트 (TDD — 먼저 작성)

1. 존재하지 않는 토큰 → `not_found`
2. 만료된 토큰 → `expired`
3. 이미 수락된 토큰 → `already_used`
4. 같은 토큰 2회 수락 → 소속 행이 1개만 생성된다 (멱등성)
5. 비로그인으로 `/org` 접근 → `/login` 리다이렉트
6. instructor 역할로 `/org` 접근 → `/instructor` 리다이렉트
7. 랜딩·로그인·`/s/[code]`는 비로그인으로 200
8. 로그인 화면에 회원가입 링크가 렌더되지 않는다

## Acceptance Criteria

```bash
npm run build
npm run lint
npm test
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md "인증과 라우팅"의 경로 표와 일치하는가?
   - 회원가입 경로가 존재하지 않는가?
   - 역할을 JWT 클레임이 아니라 테이블 소속으로 판별하는가?
   - UI_GUIDE 안티패턴(그라데이션 텍스트, gradient orb, glass morphism 등)을 쓰지 않았는가?
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가?
3. 결과에 따라 `phases/0-mvp/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- 공개 회원가입 화면·링크·API를 만들지 마라. 이유: 셀프 가입을 열면 아무나 특정 기관 담당자를 자칭해 그 기관 학생 데이터에 접근한다. RLS로 기관을 격리해도 가입 단계에서 소속을 검증하지 않으면 무의미하다(ADR-011).
- 비밀번호 로그인·소셜 로그인을 추가하지 마라. 이유: 매직링크로 확정됐다. 인증 경로가 늘어나면 검증해야 할 표면도 늘어난다.
- 클라이언트가 보낸 역할·기관ID를 신뢰하지 마라. 이유: 위조하면 타 기관 데이터에 접근할 수 있다(CLAUDE.md CRITICAL).
- 초대 토큰을 URL 쿼리스트링이 아닌 곳에 로깅하지 마라. 이유: 로그에 남은 유효 토큰은 그대로 계정 탈취 수단이 된다.
- 랜딩에 마케팅 섹션(고객 로고, 통계 카운터, 가격표)을 추가하지 마라. 이유: 첫 기관은 3DNFLY 거래처에서 직접 섭외로 오고, 팔 숫자도 아직 없다.
- 기관·강사·운영자 실제 화면을 만들지 마라. 이유: step 10·11의 작업이다. 여기서는 플레이스홀더까지다.
- 기존 테스트를 깨뜨리지 마라.
