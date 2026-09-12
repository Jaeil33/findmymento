# Step 0: project-setup

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md`
- `/docs/PRD.md`
- `/docs/ARCHITECTURE.md`
- `/docs/ADR.md`
- `/docs/UI_GUIDE.md`

첫 step이므로 이전 산출물은 없다. 단 저장소에 이미 `CLAUDE.md`, `docs/`, `scripts/`, `.gitignore`, `phases/`가 존재한다. 이 파일들을 절대 덮어쓰지 마라.

## 작업

### 1. Next.js 프로젝트 초기화

저장소 루트에 Next.js 15 App Router 프로젝트를 구성한다. TypeScript strict mode, Tailwind CSS, ESLint. 소스는 `src/` 아래에 둔다.

`create-next-app`을 쓰되 기존 파일을 덮어쓰지 않도록 주의하라. 충돌이 나면 임시 디렉토리에 생성한 뒤 필요한 파일만 옮겨라.

패키지 매니저는 **npm**을 쓴다 (lock 파일은 `package-lock.json` 하나만 존재해야 한다).

### 2. 디렉토리 골격

`/docs/ARCHITECTURE.md`의 디렉토리 구조를 그대로 만든다. 비어 있는 디렉토리에는 `.gitkeep`을 둔다.

```
src/app/(public)/{programs,instructors,inquiry}/   # 공개 디렉토리·보호자 문의 (step 14)
src/app/(student)/  src/app/(org)/  src/app/(instructor)/  src/app/(admin)/  src/app/api/
src/components/  src/types/  src/lib/{supabase,auth,region,moderation,ai}/  src/data/  src/services/
```

### 3. 테스트 환경

Vitest + jsdom + `@testing-library/react`를 설정한다. `npm test`가 watch 모드가 아닌 1회 실행으로 끝나야 한다 (CI/자동화에서 멈추면 안 된다).

### 4. 디자인 토큰

`/docs/UI_GUIDE.md`의 색상·타이포를 Tailwind 테마 토큰으로 등록한다. 하드코딩된 hex를 컴포넌트에 흩뿌리지 말고 토큰 이름으로만 참조하게 만들어라.

최소 토큰: 배경(page/card/muted), 테두리, 텍스트(primary/body/secondary/disabled), 포인트(point/point-hover/point-bg), 시맨틱(positive/caution/negative/neutral).

### 5. UI 프리미티브 4개

`src/components/ui/` 에 아래 4개를 만든다. 내부 구현은 재량이되 **시그니처와 variant 집합은 아래를 따른다.**

```ts
// Button: UI_GUIDE의 Primary / Secondary / Text + 학생 화면 전용 크기
type ButtonProps = { variant?: 'primary' | 'secondary' | 'text'; size?: 'default' | 'student' } & React.ButtonHTMLAttributes<HTMLButtonElement>

// Card: 용도별로 모서리 반경이 다르다 (UI_GUIDE — 전부 같으면 템플릿처럼 보인다)
type CardProps = { variant?: 'dashboard' | 'student' | 'tile' } & React.HTMLAttributes<HTMLDivElement>

// Input: label 연결 필수. 학생 화면은 16px 이상 (iOS 자동 확대 방지)
type InputProps = { label: string; size?: 'default' | 'student' } & React.InputHTMLAttributes<HTMLInputElement>

// Chip: 관심 분야 선택용
type ChipProps = { selected?: boolean } & React.ButtonHTMLAttributes<HTMLButtonElement>
```

TDD: 각 프리미티브의 렌더 테스트를 **먼저** 작성하고, 통과하는 구현을 작성하라. 최소 검증 항목은 variant별 클래스 적용, `Input`의 label-input 연결, `Chip`의 selected 상태.

### 6. 환경변수 구조

`.env.example`을 만든다. 서버 전용 키에 `NEXT_PUBLIC_` 접두사를 붙이지 마라.

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ANTHROPIC_API_KEY=
```

`.gitignore`에 `.env.local`이 포함되어 있는지 확인하라.

### 7. Vercel 호환

특별한 설정을 추가하지 마라. `next.config.ts`는 최소 상태로 둔다. 기본 빌드가 통과하면 충분하다 (배포는 step 12).

## Acceptance Criteria

```bash
npm run build   # 컴파일 에러 없음
npm run lint    # ESLint 통과
npm test        # 프리미티브 테스트 통과, watch 모드로 멈추지 않음
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md 디렉토리 구조를 따르는가?
   - ADR 기술 스택을 벗어나지 않았는가?
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가?
   - UI_GUIDE 안티패턴 표에 있는 것을 만들지 않았는가?
3. 결과에 따라 `phases/0-mvp/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- `docs/`, `scripts/`, `CLAUDE.md`, `phases/*.md`를 수정하지 마라. 이유: 기획 문서는 확정됐고 execute.py가 매 step 프롬프트에 가드레일로 주입한다. 수정하면 이후 모든 step의 전제가 흔들린다.
- 보라·인디고 계열 색을 토큰에 넣지 마라. 이유: UI_GUIDE 안티패턴 표에 명시된 금지 항목이다.
- 다크 테마 변형이나 `prefers-color-scheme` 분기를 만들지 마라. 이유: 라이트 단일 톤으로 확정됐다. 테마를 2개로 나누면 이후 12개 step의 컴포넌트를 모두 두 번 검수해야 한다.
- 상태관리 라이브러리(zustand, redux, jotai 등)를 설치하지 마라. 이유: ARCHITECTURE 상태관리 결정 — 화면 간 공유할 클라이언트 상태가 없다.
- UI 컴포넌트 라이브러리(shadcn/ui, MUI, Chakra 등)를 설치하지 마라. 이유: UI_GUIDE가 클래스 수준까지 지정하고 있어 라이브러리 기본 스타일과 충돌한다.
- Supabase 클라이언트나 DB 관련 코드를 작성하지 마라. 이유: step 2·3의 작업이다.
- 기존 테스트를 깨뜨리지 마라.
