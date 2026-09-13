# 프로젝트: Find My Mento

지역 기반 교육 강사·멘토 매칭 플랫폼. **지역의 직업인 강사를 학교·기관·개인과 연결한다.** 초·중·고 학생 대상.

가장 강한 진입점은 1회성 진로체험·직업인 특강 직후이고, 거기서 생긴 관심을 후속 심화 교육으로 잇는 것이 첫 검증 대상이다. 단 "후속 교육"은 **진입점이지 제품의 정의가 아니다** — 수요 주체는 학교·기관·개인 3종이다.

기획은 `docs/PRD.md`, 권한·데이터 모델은 `docs/ARCHITECTURE.md`, 기술 결정은 `docs/ADR.md`, AI 기능의 범위와 경계는 `docs/AI.md`를 따른다.

## 기술 스택
- Next.js 15 (App Router)
- TypeScript strict mode
- Tailwind CSS
- Supabase (Postgres + Auth + Storage)

## 안전 규칙 (이 서비스의 존재 조건 — 미성년자 대상)
- CRITICAL: 학생의 실명·연락처·학교명을 DB에 저장하지 말 것. 학생 식별은 기관이 발급한 가명코드만 사용한다.
- CRITICAL: 강사 연락처를 학생·보호자에게 노출되는 쿼리·타입·API 응답에 포함하지 말 것. 연락처는 `instructor_contacts` 별도 테이블에 두고 anon 역할은 SELECT 권한이 없다. 공개 디렉토리도 anon으로 조회되므로 같은 제약을 받는다.
- CRITICAL: 학생과 강사 간 1:1 비공개 메시지 기능을 만들지 말 것. 소통은 기관 담당자가 열람 가능한 공개 Q&A 스레드뿐이다.
- CRITICAL: 모든 테이블에 RLS를 활성화할 것. 권한 분리를 애플리케이션 코드 체크만으로 구현하지 말 것.
- CRITICAL: `service_role` 키를 클라이언트 컴포넌트나 번들에 노출하지 말 것.
- CRITICAL: 공개 회원가입 화면을 만들지 말 것. 기관·학교 담당자·강사·운영자 계정은 초대 토큰으로만 생성한다. 초대 토큰은 1회용이며 만료시각을 검증해야 한다. 보호자는 계정을 만들지 않는다.
- CRITICAL: 사용자 역할을 클라이언트 입력값이나 JWT 커스텀 클레임으로 판단하지 말 것. `org_members`/`instructors`/`admins` 중 어느 테이블에 `auth_user_id`가 있는지로 판별한다. `organizations.type`은 화면 문구·집계 분류에만 쓰고 권한 판단에 쓰지 말 것.
- CRITICAL: 플랫폼이 직접 수업을 개설·모집·수납하는 기능을 만들지 말 것. 학생 모집 폼, 수강료 결제, 정원 관리가 들어오는 순간 학원법 등록 대상이 되고 학생 PII·안전사고 책임이 플랫폼으로 온다 (ADR-023). 장소 부족은 `recruitment_requests.close_reason = '장소 없음'`으로 **기록만** 한다.
- CRITICAL: 학생이 주체가 되는 연결 경로를 만들지 말 것. 학생의 관심 표현은 기관 대시보드로 모이고, 개인 단위 수요는 **성인 보호자의 비로그인 문의 폼**으로만 받는다. 학생이 누르는 버튼 중 강사에게 직접 도달하는 것은 하나도 없어야 한다.
- CRITICAL: `inquiries`(보호자 문의)에 학생 이름·학교·생년월일 컬럼을 만들지 말 것. 보호자 본인 이름·연락처와 학년대(초/중/고)까지만 받는다.
- CRITICAL: `inquiries`는 anon에게 **INSERT만** 허용하고 SELECT는 막을 것. 비로그인 폼이므로 INSERT는 열려 있어야 하지만 SELECT가 같이 열리면 아무나 다른 보호자의 연락처를 전부 읽는다.
- CRITICAL: 학급 특성·접근성 정보(통합학급 여부, 보조 필요 등)를 `students`·`survey_responses`에 저장하지 말 것. `lecture_sessions.class_traits`에 **회차 단위**로만 둔다. 장애·건강은 민감정보이고 학생 개인에 귀속되는 순간 별도 동의 의무가 생긴다.
- CRITICAL: `class_traits`에 자유 텍스트 입력을 열지 말 것. 고정 체크박스 목록이며 허용값은 DB 제약으로 강제한다. 입력란을 열면 담당 교사가 특정 학생의 진단명을 적는다.
- CRITICAL: `lesson_plans`(AI 교안)를 읽을 수 있는 주체는 작성 강사·발주 기관 구성원·운영자 셋뿐이다. 타 강사와 anon은 0행이어야 하고, 학생·보호자에게 도달하는 경로를 만들지 말 것.
- CRITICAL: 학생 개인의 학습 수준을 진단하거나 개인별 학습경로를 추천하는 기능을 만들지 말 것. AI의 개인화 단위는 **학급(회차)**이지 학생이 아니다.
- 교안 생성에 과거 설문 집계를 쓸 때 해당 집계의 응답이 5건 미만이면 프롬프트에서 통째로 제외할 것. 작은 표본의 집계는 개인 정보가 된다.
- 특강 회차를 만드는 주체는 기관·학교뿐이다. 강사에게 회차 생성 권한을 주지 말 것. 강사는 `lecture_sessions.instructor_id`로 **배정**되고, 배정된 회차의 QR 화면과 리포트만 열람한다.

## 아키텍처 규칙
- CRITICAL: LLM 등 외부 API 호출은 `app/api/` 라우트 핸들러에서만 처리할 것. 클라이언트 컴포넌트에서 직접 호출하지 말 것.
- CRITICAL: LLM 호출 실패가 화면 실패가 되지 않게 할 것. 추천(`/api/recommend`)·교안(`/api/lesson-plan`)·회차 기획(`/api/session-plan`) 셋 다 규칙 기반 폴백으로 200을 반환한다.
- LLM에 보내는 학생 자유서술은 `lib/moderation`의 마스킹을 통과한 값만 쓸 것. 추천과 교안 양쪽에 동일하게 적용된다.
- 조회는 Server Component에서 Supabase를 직접 호출한다. 단순 조회를 위해 API 라우트를 한 겹 더 만들지 말 것.
- 쓰기 중 서버 검증이 필요한 것(설문 제출, Q&A 작성, 보호자 문의)은 API 라우트를 경유한다. 클라이언트에서 직접 INSERT하지 말 것.
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
