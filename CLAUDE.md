# 프로젝트: Find My Mento

지역 기반 교육 멘토·강사 매칭 플랫폼. 초·중·고 학생의 1회성 진로체험을 지역 강사의 후속 교육으로 연결한다.

기획은 `docs/PRD.md`, 권한·데이터 모델은 `docs/ARCHITECTURE.md`, 기술 결정은 `docs/ADR.md`를 따른다.

## 기술 스택
- Next.js 15 (App Router)
- TypeScript strict mode
- Tailwind CSS
- Supabase (Postgres + Auth + Storage)

## 안전 규칙 (이 서비스의 존재 조건 — 미성년자 대상)
- CRITICAL: 학생의 실명·연락처·학교명을 DB에 저장하지 말 것. 학생 식별은 기관이 발급한 가명코드만 사용한다.
- CRITICAL: 강사 연락처를 학생에게 노출되는 쿼리·타입·API 응답에 포함하지 말 것. 연락처는 `instructor_contacts` 별도 테이블에 두고 학생 역할은 SELECT 권한이 없다.
- CRITICAL: 학생과 강사 간 1:1 비공개 메시지 기능을 만들지 말 것. 소통은 기관 담당자가 열람 가능한 공개 Q&A 스레드뿐이다.
- CRITICAL: 모든 테이블에 RLS를 활성화할 것. 권한 분리를 애플리케이션 코드 체크만으로 구현하지 말 것.
- CRITICAL: `service_role` 키를 클라이언트 컴포넌트나 번들에 노출하지 말 것.
- CRITICAL: 공개 회원가입 화면을 만들지 말 것. 기관 담당자·강사·운영자 계정은 초대 토큰으로만 생성한다. 초대 토큰은 1회용이며 만료시각을 검증해야 한다.
- CRITICAL: 사용자 역할을 클라이언트 입력값이나 JWT 커스텀 클레임으로 판단하지 말 것. `org_members`/`instructors`/`admins` 중 어느 테이블에 `auth_user_id`가 있는지로 판별한다.
- 학생↔강사 연결은 항상 기관을 경유한다. 학생이 강사에게 직접 신청하는 경로를 만들지 말 것.

## 아키텍처 규칙
- CRITICAL: LLM 등 외부 API 호출은 `app/api/` 라우트 핸들러에서만 처리할 것. 클라이언트 컴포넌트에서 직접 호출하지 말 것.
- 조회는 Server Component에서 Supabase를 직접 호출한다. 단순 조회를 위해 API 라우트를 한 겹 더 만들지 말 것.
- 컴포넌트는 `components/`, 타입은 `types/`, 유틸은 `lib/`에 분리한다.

## 개발 프로세스
- CRITICAL: 새 기능 구현 시 반드시 테스트를 먼저 작성하고, 테스트가 통과하는 구현을 작성할 것 (TDD)
- CRITICAL: RLS 정책은 "권한 없는 역할이 접근하면 실패한다"는 네거티브 테스트를 반드시 포함할 것
- 커밋 메시지는 conventional commits 형식을 따를 것 (feat:, fix:, docs:, refactor:)

## 명령어
npm run dev      # 개발 서버
npm run build    # 프로덕션 빌드
npm run lint     # ESLint
npm run test     # 테스트
