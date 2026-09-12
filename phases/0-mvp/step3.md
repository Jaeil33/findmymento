# Step 3: types-and-client

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/docs/ARCHITECTURE.md` — "권한 모델", "패턴", "데이터 흐름"
- `/docs/ADR.md` — ADR-002
- `/CLAUDE.md` — 안전 규칙과 아키텍처 규칙
- 이전 step 산출물: `supabase/migrations/` 전체, `package.json`의 `db:types` 스크립트

이전 step에서 만들어진 스키마를 꼼꼼히 읽고, 어떤 테이블이 어떤 역할에 보이는지 이해한 뒤 작업하라.

## 작업

작은 step이다. 타입과 클라이언트 팩토리만 만든다.

### 1. DB 타입 생성

`npm run db:types`로 Supabase 스키마에서 TypeScript 타입을 생성해 `src/types/database.ts`에 둔다. 이 파일은 **생성물이므로 손으로 수정하지 마라.** 파일 상단에 생성 커맨드를 주석으로 남겨라.

### 2. 도메인 타입

`src/types/`에 애플리케이션이 쓰는 타입을 둔다. `database.ts`의 Row 타입을 그대로 화면에 흘리지 말고, 내려가는 형태를 따로 정의한다.

```ts
// 학생에게 내려가는 강사 정보 — 연락처 필드가 타입에 존재하지 않는다
export type PublicInstructor = {
  id: string
  name: string
  fields: string[]
  regionCode: string
  bio: string
  providerName: string | null
}
```

**`PublicInstructor`에 연락처 필드를 넣지 마라.** 타입에서 막아두면 이후 step에서 실수로 내려보낼 수 없다. 연락처가 필요한 기관·운영자용 타입은 `OrgInstructorDetail`처럼 **이름으로 구분되는 별개 타입**으로 둔다.

### 3. Supabase 클라이언트 팩토리

`src/lib/supabase/`에 3개를 만든다.

```ts
// client.ts — 브라우저용. anon key만 사용
export function createBrowserClient(): SupabaseClient<Database>

// server.ts — Server Component / Route Handler용. 쿠키 세션 기반
export function createServerClient(): SupabaseClient<Database>

// admin.ts — service_role. 운영자 작업과 초대 발송에만 사용
export function createAdminClient(): SupabaseClient<Database>
```

`admin.ts`는 파일 맨 위에 server-only import를 넣어라(`server-only` 패키지를 설치한다). 클라이언트 컴포넌트에서 import하면 **빌드가 실패해야 한다.** 런타임 체크로 미루지 마라.

### 4. 역할 판별 헬퍼

`src/lib/auth/`에 현재 사용자의 역할을 판별하는 서버 전용 함수를 둔다.

```ts
export type Role =
  | { kind: "org"; orgId: string }
  | { kind: "instructor"; instructorId: string }
  | { kind: "admin" }
  | { kind: "anonymous" }

export async function getCurrentRole(): Promise<Role>
```

`org_members` / `instructors` / `admins` 테이블 조회로 판별한다. JWT 클레임을 신뢰하지 마라.

### 5. 테스트 (TDD — 먼저 작성)

1. `createBrowserClient`가 service_role 키를 참조하지 않는다(환경변수 접근 검증).
2. `getCurrentRole`이 세션 없을 때 anonymous를 반환한다.
3. `PublicInstructor`에 연락처 키가 없음을 컴파일 타임 assert로 고정한다.

## Acceptance Criteria

```bash
npm run build   # 타입 에러 0
npm run lint
npm test
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md 디렉토리 구조를 따르는가?
   - `admin.ts`에 server-only가 걸려 있는가?
   - 학생에게 내려가는 타입에 연락처가 없는가?
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가?
3. 결과에 따라 `phases/0-mvp/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- `database.ts`를 손으로 수정하지 마라. 이유: 생성물이다. 스키마를 바꿔야 하면 마이그레이션을 고쳐 재생성하라.
- 학생에게 내려가는 타입에 연락처 필드를 넣지 마라. 이유: 타입이 마지막 방어선이다. RLS가 막더라도 타입에 필드가 있으면 누군가 admin 클라이언트로 채워 내려보낸다.
- `createAdminClient`를 클라이언트 컴포넌트에서 쓸 수 있게 만들지 마라. 이유: service_role 키가 번들에 들어가면 모든 권한 분리가 무의미해진다(CLAUDE.md CRITICAL).
- UI·화면·API 라우트를 만들지 마라. 이유: 이 step은 타입과 클라이언트 레이어다.
- 기존 테스트를 깨뜨리지 마라.
