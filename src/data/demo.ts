/**
 * 데모 시드. Supabase 키가 없을 때 앱이 이 데이터로 동작한다.
 *
 * 목적은 두 개다.
 * 1. 파일럿 전에 기관·강사에게 **실제 화면**을 보여주는 것 (Vercel 배포본).
 * 2. 파일럿에서 실제로 마주칠 상태를 미리 화면에 올려두는 것 —
 *    미배정 회차(E-23), 응답 0건 회차(E-24), 공급 0인 분야(E-16), 48시간 미답변 Q&A(E-20),
 *    추천 0건(E-07)이 전부 이 시드 안에 들어 있다. "잘 되는 경우"만 담으면 검수가 의미 없다.
 *
 * 규칙:
 * - 학생 실명·연락처·학교명이 없다. 가명코드와 학년까지다 (ADR-003).
 * - 강사 연락처는 `instructorContacts` 에만 있고, 공개 경로 조회 함수는 이 배열을 읽지 않는다.
 * - 자유서술은 이미 마스킹을 통과한 형태로만 저장한다 (E-08).
 */

import {
  type Consent,
  type Grade,
  type Instructor,
  type InstructorContact,
  type InstructorVerification,
  type Inquiry,
  type Interest,
  type Invitation,
  type LectureSession,
  type LessonPlan,
  type LessonPlanInputs,
  type OrgMember,
  type Organization,
  type Program,
  type Provider,
  type QnaAnswer,
  type QnaQuestion,
  type RecruitmentRequest,
  type Student,
  type SurveyResponse,
  FIELDS,
} from '@/types/domain'
import { ruleSkeleton } from '@/lib/ai/lesson-plan'

/** 고정 시드 난수. 배포마다 숫자가 흔들리면 검수 중에 "버그인가?"를 매번 묻게 된다. */
function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 0x100000000
  }
}

function pick<T>(r: () => number, items: readonly T[]): T {
  return items[Math.floor(r() * items.length)]!
}

/** 가중 선택. [값, 가중치] */
function weighted<T>(r: () => number, table: readonly [T, number][]): T {
  const total = table.reduce((a, [, w]) => a + w, 0)
  let x = r() * total
  for (const [v, w] of table) {
    x -= w
    if (x <= 0) return v
  }
  return table[table.length - 1]![0]
}

const g = (band: Grade['band'], year: number): Grade => ({ band, year })

/**
 * 데모 시계.
 *
 * 날짜를 고정 문자열로 박아 두면 **배포해 둔 데모가 며칠 뒤에 죽는다** — 마감 시각이 지나면서
 * 모든 회차가 마감 처리되고, 학생 설문 제출이 E-17 로 거부된다. 기관 미팅에서 보여줄 화면이
 * 그 상태면 아무 의미가 없다. 그래서 시드의 모든 날짜는 **실행 시점 기준 상대값**이다.
 *
 * 테스트는 이 값을 그대로 `NOW` 로 쓴다 (`tests/queries.test.ts`). 기준이 하나여야
 * "응답 받는 중 / 마감", "48시간 미답변" 같은 판정이 시간이 지나도 흔들리지 않는다.
 */
export const DEMO_NOW = new Date()

const DAY_MS = 86_400_000

/** DEMO_NOW 기준 상대 날짜(YYYY-MM-DD). 음수는 과거다. */
function demoDate(days: number): string {
  return new Date(DEMO_NOW.getTime() + days * DAY_MS).toISOString().slice(0, 10)
}

/** DEMO_NOW 기준 상대 시각. 시·분은 화면에 그대로 보이므로 원래 값을 유지한다. */
function demoTime(days: number, hhmm: string): string {
  return `${demoDate(days)}T${hhmm}:00+09:00`
}

// ──────────────────────────────────────────────────────────────
// 기관 · 계정
// ──────────────────────────────────────────────────────────────

export const organizations: Organization[] = [
  { id: 'org-1', name: '광명시청소년수련관', type: 'youth_center', region_code: '41210' },
  { id: 'org-2', name: '광명하안중학교', type: 'school', region_code: '41210' },
]

export const orgMembers: OrgMember[] = [
  {
    id: 'om-1',
    auth_user_id: null,
    org_id: 'org-1',
    role: 'manager',
    display_name: '이수진',
    active: true,
  },
  {
    id: 'om-2',
    auth_user_id: null,
    org_id: 'org-2',
    role: 'teacher',
    display_name: '강민호',
    active: true,
  },
  // 이직으로 접근 차단된 담당자. 계정 삭제가 아니라 비활성화다 (E-13).
  {
    id: 'om-3',
    auth_user_id: null,
    org_id: 'org-1',
    role: 'manager',
    display_name: '박정우',
    active: false,
  },
]

// ──────────────────────────────────────────────────────────────
// 공급 — 업체 1곳, 승인 강사 6명. 이 숫자를 화면에 그대로 노출한다 (UI_GUIDE 안전규칙 5).
// ──────────────────────────────────────────────────────────────

export const providers: Provider[] = [
  { id: 'pv-1', name: '3DNFLY', region_code: '41210', status: 'approved' },
]

export const instructors: Instructor[] = [
  {
    id: 'in-1',
    provider_id: 'pv-1',
    name: '김도현',
    region_code: '41210',
    fields: ['3D 모델링·프린팅'],
    bio: '제품 설계 현업 8년. 학생이 직접 그린 도면을 그날 출력해서 손에 쥐게 하는 수업을 합니다.',
    career: ['산업디자인 전공', '제품 설계 8년', '초·중등 3D 모델링 수업 140회'],
    status: 'approved',
  },
  {
    id: 'in-2',
    provider_id: 'pv-1',
    name: '박서연',
    region_code: '41210',
    fields: ['드론'],
    bio: '드론 항공촬영 기사. 조종 자격 과정보다 "왜 이 각도로 찍는가"를 먼저 가르칩니다.',
    career: ['초경량비행장치 조종자 증명', '항공촬영 6년', '중·고 진로특강 90회'],
    status: 'approved',
  },
  {
    id: 'in-3',
    provider_id: 'pv-1',
    name: '이준호',
    region_code: '11530',
    fields: ['3D 모델링·프린팅'],
    bio: '역설계와 3D 스캔을 다룹니다. 고등학생 대상 포트폴리오용 과정을 주로 맡습니다.',
    career: ['기계공학 전공', '3D 스캔·역설계 5년', '고교학점제 연계 과정 12기'],
    status: 'approved',
  },
  {
    id: 'in-4',
    provider_id: 'pv-1',
    name: '최민서',
    region_code: '41390',
    fields: ['드론'],
    bio: '드론 축구·레이싱 동아리를 운영합니다. 정기 활동으로 이어지는 수업을 설계합니다.',
    career: ['드론 축구 지도자', '청소년 동아리 운영 4년'],
    status: 'approved',
  },
  {
    id: 'in-5',
    provider_id: 'pv-1',
    name: '정하윤',
    region_code: '41190',
    fields: ['3D 모델링·프린팅', '드론'],
    bio: '두 분야를 이어 붙여 "설계하고 띄워보는" 과정을 만듭니다.',
    career: ['메이커스페이스 운영 3년', '3D 프린터 정비 교육'],
    status: 'approved',
  },
  {
    id: 'in-6',
    provider_id: null,
    name: '한지우',
    region_code: '11545',
    fields: ['드론'],
    bio: '프리랜서 강사. 주말 단기 과정을 주로 진행합니다.',
    career: ['초경량비행장치 조종자 증명', '주말 드론 교실 3년'],
    status: 'approved',
  },
  // 아래 3명은 학생·기관·공개 디렉토리 어디에도 노출되지 않아야 한다 (E-11).
  {
    id: 'in-7',
    provider_id: null,
    name: '오세진',
    region_code: '41210',
    fields: ['VR·AR'],
    bio: 'VR 콘텐츠 제작. 증빙 심사 대기 중입니다.',
    career: ['VR 콘텐츠 기획 4년'],
    status: 'pending',
  },
  {
    id: 'in-8',
    provider_id: null,
    name: '윤가람',
    region_code: '41170',
    fields: ['AI·코딩'],
    bio: '코딩 교육. 증빙 심사 대기 중입니다.',
    career: ['소프트웨어 교육 5년'],
    status: 'pending',
  },
  {
    id: 'in-9',
    provider_id: null,
    name: '서다온',
    region_code: '41190',
    fields: ['뷰티'],
    bio: '증빙 미비로 반려된 계정입니다.',
    career: [],
    status: 'rejected',
  },
]

/**
 * 연락처. **이 배열을 공개 경로에서 읽는 코드를 만들지 말 것.**
 * 운영자 화면에서만 쓰이고, 실 DB 에서는 anon 에게 SELECT 권한이 없는 별도 테이블이다.
 */
export const instructorContacts: InstructorContact[] = instructors.map((i) => ({
  instructor_id: i.id,
  phone: '010-0000-0000',
  email: `${i.id}@example.invalid`,
}))

export const instructorVerifications: InstructorVerification[] = [
  {
    id: 'vf-1',
    instructor_id: 'in-7',
    file_path: 'verifications/in-7/qualification.pdf',
    type: 'qualification',
    reviewed_at: null,
  },
  {
    id: 'vf-2',
    instructor_id: 'in-7',
    file_path: 'verifications/in-7/criminal-record.pdf',
    type: 'criminal_record_check',
    reviewed_at: null,
  },
  {
    id: 'vf-3',
    instructor_id: 'in-8',
    file_path: 'verifications/in-8/qualification.pdf',
    type: 'qualification',
    reviewed_at: null,
  },
]

export const programs: Program[] = [
  {
    id: 'pg-1',
    instructor_id: 'in-1',
    title: '3D 모델링으로 내 아이디어 만들기',
    field: '3D 모델링·프린팅',
    target_grades: ['middle', 'high'],
    format: 'short_course',
    session_count: 6,
    summary: '스케치 → 모델링 → 출력까지 한 사이클을 6회에 끝냅니다. 마지막 회차에 본인 물건을 가져갑니다.',
    outline: [
      '1회 · 내가 만들고 싶은 물건 정하기',
      '2~3회 · 치수 재고 도면으로 옮기기',
      '4회 · 모델링 수정과 출력 준비',
      '5회 · 출력과 후처리',
      '6회 · 결과물 발표',
    ],
  },
  {
    id: 'pg-2',
    instructor_id: 'in-1',
    title: '3D 프린터 입문 1회 특강',
    field: '3D 모델링·프린팅',
    target_grades: ['elementary', 'middle'],
    format: 'one_off',
    session_count: 1,
    summary: '프린터가 어떻게 움직이는지 보고, 미리 만든 도면을 직접 출력해 봅니다.',
    outline: ['프린터 구조 관찰', '슬라이싱 체험', '출력물 후처리'],
  },
  {
    id: 'pg-3',
    instructor_id: 'in-2',
    title: '드론 조종 기초와 항공 촬영',
    field: '드론',
    target_grades: ['middle', 'high'],
    format: 'short_course',
    session_count: 8,
    summary: '실내 비행으로 조종을 익히고, 뒤 4회는 우리 동네를 직접 촬영해 한 편으로 편집합니다.',
    outline: [
      '1~2회 · 실내 호버링과 기본 조작',
      '3~4회 · 항로 계획과 안전 규정',
      '5~6회 · 야외 촬영',
      '7~8회 · 편집과 상영',
    ],
  },
  {
    id: 'pg-4',
    instructor_id: 'in-2',
    title: '드론 코딩 체험',
    field: '드론',
    target_grades: ['elementary', 'middle'],
    format: 'one_off',
    session_count: 1,
    summary: '블록 코딩으로 드론 경로를 짜고 그대로 날려봅니다.',
    outline: ['블록 코딩 기초', '경로 설계', '미션 비행'],
  },
  {
    id: 'pg-5',
    instructor_id: 'in-3',
    title: '제품 디자인 3D 모델링 (고교학점제 연계)',
    field: '3D 모델링·프린팅',
    target_grades: ['high'],
    format: 'short_course',
    session_count: 4,
    summary: '진로 포트폴리오에 넣을 수 있는 결과물 하나를 4회에 완성합니다.',
    outline: ['주제 선정과 레퍼런스', '모델링', '렌더링', '포트폴리오 정리'],
  },
  {
    id: 'pg-6',
    instructor_id: 'in-4',
    title: '드론 축구 동아리',
    field: '드론',
    target_grades: ['middle'],
    format: 'club',
    session_count: 12,
    summary: '팀을 나눠 드론 축구를 합니다. 정기 활동으로 이어지는 형태입니다.',
    outline: ['조종 연습', '팀 전술', '교내 리그'],
  },
  {
    id: 'pg-7',
    instructor_id: 'in-5',
    title: '3D 스캔으로 물건 되살리기',
    field: '3D 모델링·프린팅',
    target_grades: ['high'],
    format: 'short_course',
    session_count: 6,
    summary: '부러진 부품을 스캔해 다시 만들어 봅니다. 역설계의 기본을 다룹니다.',
    outline: ['스캔 원리', '데이터 정리', '재설계', '출력과 검증'],
  },
  {
    id: 'pg-8',
    instructor_id: 'in-6',
    title: '주말 드론 입문 (4회)',
    field: '드론',
    target_grades: ['elementary', 'middle'],
    format: 'short_course',
    session_count: 4,
    summary: '토요일 오전 4회. 처음 잡아보는 학생 기준으로 진행합니다.',
    outline: ['안전 교육', '호버링', '코스 비행', '미니 대회'],
  },
  {
    id: 'pg-9',
    instructor_id: 'in-5',
    title: '드론 정비 기초',
    field: '드론',
    target_grades: ['high'],
    format: 'one_off',
    session_count: 1,
    summary: '프로펠러·모터·배터리를 직접 분해하고 조립합니다.',
    outline: ['구조 이해', '분해와 조립', '고장 진단'],
  },
]

// ──────────────────────────────────────────────────────────────
// 회차
// ──────────────────────────────────────────────────────────────

export const lectureSessions: LectureSession[] = [
  // ls-1 보다 앞선 같은 기관·같은 분야 회차. 이 회차의 응답이 ls-1 교안의 입력이 된다 (ADR-018).
  {
    id: 'ls-0',
    org_id: 'org-1',
    instructor_id: 'in-2',
    title: '드론 첫 만남 · 학교 운동장',
    field: '드론',
    held_on: demoDate(-38),
    closes_at: demoTime(-31, '23:59'),
    status: 'closed',
    entry_code: '318204',
    grade_band: 'middle',
    expected_students: 26,
    duration_minutes: 50,
    venue: '운동장',
    class_traits: ['첫 경험 다수'],
    equipment: ['드론 6대'],
  },
  {
    id: 'ls-1',
    org_id: 'org-1',
    instructor_id: 'in-2',
    title: '드론으로 우리 동네 찍어보기',
    field: '드론',
    held_on: demoDate(-8),
    closes_at: demoTime(-1, '23:59'),
    status: 'closed',
    entry_code: '482913',
    grade_band: 'middle',
    expected_students: 32,
    duration_minutes: 90,
    venue: '운동장',
    class_traits: ['첫 경험 다수'],
    equipment: ['드론 10대', '안전 보호구 32세트'],
  },
  {
    id: 'ls-2',
    org_id: 'org-1',
    instructor_id: 'in-1',
    title: '3D 프린터로 내 물건 만들기',
    field: '3D 모델링·프린팅',
    held_on: demoDate(-2),
    closes_at: demoTime(5, '23:59'),
    status: 'open',
    entry_code: '735104',
    grade_band: 'middle',
    expected_students: 28,
    duration_minutes: 100,
    venue: '메이커실',
    class_traits: ['통합학급 포함', '경험자 다수'],
    equipment: ['3D 프린터 3대', '노트북 28대'],
  },
  // 배정 강사가 없다 → 강사가 QR·리포트를 못 본다 (E-23). 목록에서 눈에 띄게 표시한다.
  {
    id: 'ls-3',
    org_id: 'org-1',
    instructor_id: null,
    title: 'VR 체험 특강',
    field: 'VR·AR',
    held_on: demoDate(-1),
    closes_at: demoTime(6, '23:59'),
    status: 'open',
    entry_code: '209457',
    grade_band: 'high',
    expected_students: 24,
    duration_minutes: 50,
    venue: '컴퓨터실',
    class_traits: [],
    equipment: ['PC 20대'],
  },
  {
    id: 'ls-4',
    org_id: 'org-2',
    instructor_id: 'in-6',
    title: '진로체험 · 드론 직업인 특강',
    field: '드론',
    held_on: demoDate(-7),
    closes_at: demoTime(2, '23:59'),
    status: 'open',
    entry_code: '561238',
    grade_band: 'middle',
    expected_students: 40,
    duration_minutes: 50,
    venue: '강당',
    class_traits: ['집중 지속이 짧은 편', '휠체어 사용 학생 있음'],
    equipment: ['드론 6대'],
  },
]

// ──────────────────────────────────────────────────────────────
// 학생 가명코드 · 설문 응답 (결정적 생성)
// ──────────────────────────────────────────────────────────────

const WANT_TO_LEARN_POOL: Record<string, string[]> = {
  드론: [
    '드론으로 영상 찍는 법 더 배우고 싶어요. 유튜브에 올릴 만한 영상 만들고 싶어요',
    '자격증 따는 방법이 궁금해요',
    '드론 축구 해보고 싶어요',
    '드론이 어떻게 스스로 날아가는지 알고 싶어요',
    '항공촬영으로 돈 버는 직업이 있는지 궁금해요',
    '드론 조립해보고 싶어요',
    '학교 체육대회 영상 찍어보고 싶어요',
  ],
  '3D 모델링·프린팅': [
    '제가 디자인한 피규어 만들어보고 싶어요',
    '3D 프린터로 부품 만드는 거 배우고 싶어요',
    '블렌더 같은 프로그램 다루는 법 알려주세요',
    '생활에 필요한 물건을 직접 설계해보고 싶어요',
    '공모전에 낼 작품 만들어보고 싶어요',
  ],
  'VR·AR': ['VR 게임 만드는 거 배우고 싶어요', 'VR로 수업하는 거 체험해보고 싶어요'],
  'AI·코딩': ['AI로 그림 만드는 거 배우고 싶어요', '코딩으로 게임 만들어보고 싶어요'],
  뷰티: ['메이크업 배우고 싶어요'],
}

const DESIRED_JOB_POOL = [
  '영상 촬영 감독',
  '제품 디자이너',
  '드론 조종사',
  '게임 개발자',
  '아직 모르겠어요',
  '',
  '엔지니어',
  '유튜버',
  '',
]

const TIME_POOL = ['평일 방과후', '토요일', '일요일', '방학 중', '잘 모르겠어요']

type SessionPlan = {
  sessionId: string
  seed: number
  total: number
  coded: number
  grades: Grade[]
  satisfaction: readonly [number, number][]
  followup: readonly [number, number][]
  primaryField: string
}

const PLANS: SessionPlan[] = [
  {
    sessionId: 'ls-0',
    seed: 20260821,
    total: 21,
    coded: 16,
    grades: [g('middle', 1), g('middle', 2)],
    satisfaction: [
      [5, 9],
      [4, 7],
      [3, 3],
      [2, 2],
      [1, 0],
    ],
    followup: [
      [4, 6],
      [3, 8],
      [2, 5],
      [1, 2],
    ],
    primaryField: '드론',
  },
  {
    sessionId: 'ls-1',
    seed: 20260904,
    total: 24,
    coded: 19,
    grades: [g('middle', 1), g('middle', 2), g('middle', 3)],
    satisfaction: [
      [5, 11],
      [4, 8],
      [3, 3],
      [2, 1],
      [1, 1],
    ],
    followup: [
      [4, 9],
      [3, 8],
      [2, 5],
      [1, 2],
    ],
    primaryField: '드론',
  },
  {
    sessionId: 'ls-2',
    seed: 20260910,
    total: 19,
    coded: 16,
    grades: [g('middle', 1), g('middle', 2), g('middle', 3)],
    satisfaction: [
      [5, 7],
      [4, 8],
      [3, 3],
      [2, 1],
      [1, 0],
    ],
    followup: [
      [4, 6],
      [3, 7],
      [2, 4],
      [1, 2],
    ],
    primaryField: '3D 모델링·프린팅',
  },
  {
    sessionId: 'ls-4',
    seed: 20260905,
    total: 31,
    coded: 22,
    grades: [g('middle', 2), g('middle', 3)],
    satisfaction: [
      [5, 8],
      [4, 12],
      [3, 7],
      [2, 3],
      [1, 1],
    ],
    followup: [
      [4, 7],
      [3, 10],
      [2, 9],
      [1, 5],
    ],
    primaryField: '드론',
  },
  // ls-3 은 의도적으로 비어 있다 — 강사가 마무리 안내를 빼먹은 회차 (E-24).
]

function buildResponses() {
  const students: Student[] = []
  const responses: SurveyResponse[] = []

  for (const plan of PLANS) {
    const session = lectureSessions.find((s) => s.id === plan.sessionId)!
    const r = rng(plan.seed)

    for (let i = 0; i < plan.total; i += 1) {
      const grade = pick(r, plan.grades)
      const isCoded = i < plan.coded

      let studentId: string | null = null
      if (isCoded) {
        // 가명코드는 6자리다. 기관이 스티커·명찰로 배부한다 (SURVEY.md S0).
        const code = `${session.entry_code.slice(0, 2)}${String(1000 + i)}`
        const student: Student = {
          id: `st-${plan.sessionId}-${i}`,
          pseudo_code: code,
          org_id: session.org_id,
          grade,
        }
        students.push(student)
        studentId = student.id
      }

      const satisfaction = weighted(r, plan.satisfaction)
      const followup = weighted(r, plan.followup)

      // 관심 분야 — 공급 없는 분야도 그대로 모인다. 이게 미충족 수요 데이터다 (PRD 확정 결정 10).
      const fieldTable: [string, number][] = [
        [plan.primaryField, 34],
        ['VR·AR', 14],
        ['AI·코딩', 11],
        ['뷰티', 6],
        [plan.primaryField === '드론' ? '3D 모델링·프린팅' : '드론', 12],
        ['아직 잘 모르겠어요', 9],
      ]
      const chosen = new Set<string>()
      const picks = followup >= 3 ? 1 + Math.floor(r() * 3) : 1
      for (let k = 0; k < picks; k += 1) chosen.add(weighted(r, fieldTable))
      const interest = chosen.has('아직 잘 모르겠어요') ? ['아직 잘 모르겠어요'] : [...chosen]

      // Q5~Q7 은 후속 의향이 3 이상인 학생에게만 보여준다 (SURVEY.md 조건부 분기).
      const showOptional = followup >= 3
      const pool = WANT_TO_LEARN_POOL[interest[0] ?? plan.primaryField] ?? []
      const wantToLearn =
        showOptional && pool.length > 0 && r() < 0.62 ? pick(r, pool) : null
      const desiredJob = showOptional && r() < 0.5 ? pick(r, DESIRED_JOB_POOL) || null : null
      const times: string[] = []
      if (showOptional) {
        const n = 1 + Math.floor(r() * 2)
        for (let k = 0; k < n; k += 1) times.push(pick(r, TIME_POOL))
      }

      responses.push({
        id: `sr-${plan.sessionId}-${i}`,
        session_id: plan.sessionId,
        student_id: studentId,
        grade,
        satisfaction,
        followup_intent: followup,
        interest_fields: interest,
        want_to_learn: wantToLearn,
        desired_job: desiredJob,
        available_times: [...new Set(times)],
        created_at: `${session.held_on}T${String(14 + Math.floor(i / 20)).padStart(2, '0')}:${String(
          (i * 3) % 60,
        ).padStart(2, '0')}:00+09:00`,
      })
    }
  }

  // 마스킹이 실제로 동작했다는 사실을 기관 리포트 인용구에서 바로 보이게 둔다 (E-08).
  const masked = responses.find((x) => x.want_to_learn !== null)
  if (masked) {
    masked.want_to_learn = '저는 [이름 삭제] 인데요, [학교명 삭제] 동아리에서 드론 계속 하고 싶어요'
  }

  return { students, responses }
}

const built = buildResponses()

export const students: Student[] = built.students
export const surveyResponses: SurveyResponse[] = built.responses

// ──────────────────────────────────────────────────────────────
// 관심 표현 · 동의 · 섭외
// ──────────────────────────────────────────────────────────────

export const interests: Interest[] = [
  {
    id: 'it-1',
    student_id: 'st-ls-1-0',
    target_type: 'program',
    target_id: 'pg-3',
    session_id: 'ls-1',
    status: 'connected',
    created_at: demoTime(-8, '15:12'),
    student_alias: '중2 학생 A',
  },
  {
    id: 'it-2',
    student_id: 'st-ls-1-1',
    target_type: 'program',
    target_id: 'pg-3',
    session_id: 'ls-1',
    status: 'recruiting',
    created_at: demoTime(-8, '15:14'),
    student_alias: '중3 학생 B',
  },
  {
    id: 'it-3',
    student_id: 'st-ls-1-2',
    target_type: 'program',
    target_id: 'pg-8',
    session_id: 'ls-1',
    status: 'consent_pending',
    created_at: demoTime(-8, '15:20'),
    student_alias: '중2 학생 C',
  },
  {
    id: 'it-4',
    student_id: 'st-ls-1-3',
    target_type: 'instructor',
    target_id: 'in-2',
    session_id: 'ls-1',
    status: 'consent_denied',
    created_at: demoTime(-8, '15:31'),
    student_alias: '중1 학생 D',
  },
  {
    id: 'it-5',
    student_id: 'st-ls-2-0',
    target_type: 'program',
    target_id: 'pg-1',
    session_id: 'ls-2',
    status: 'org_review',
    created_at: demoTime(-2, '15:02'),
    student_alias: '중2 학생 E',
  },
  {
    id: 'it-6',
    student_id: 'st-ls-2-1',
    target_type: 'program',
    target_id: 'pg-1',
    session_id: 'ls-2',
    status: 'expressed',
    created_at: demoTime(-2, '15:08'),
    student_alias: '중3 학생 F',
  },
  {
    id: 'it-7',
    student_id: 'st-ls-2-2',
    target_type: 'program',
    target_id: 'pg-7',
    session_id: 'ls-2',
    status: 'expressed',
    created_at: demoTime(-2, '15:24'),
    student_alias: '중2 학생 G',
  },
  {
    id: 'it-8',
    student_id: null,
    target_type: 'program',
    target_id: 'pg-1',
    session_id: 'ls-2',
    status: 'rejected',
    created_at: demoTime(-2, '15:40'),
    student_alias: '중2 학생 (익명)',
  },
]

export const consents: Consent[] = [
  {
    id: 'cs-1',
    student_id: 'st-ls-1-0',
    interest_id: 'it-1',
    recorded_by: 'om-1',
    method: 'paper',
    recorded_at: demoTime(-5, '10:20'),
  },
  {
    id: 'cs-2',
    student_id: 'st-ls-1-1',
    interest_id: 'it-2',
    recorded_by: 'om-1',
    method: 'phone',
    recorded_at: demoTime(-4, '16:05'),
  },
]

export const recruitmentRequests: RecruitmentRequest[] = [
  {
    id: 'rr-1',
    org_id: 'org-1',
    instructor_id: 'in-2',
    field: '드론',
    demand_count: 9,
    status: 'accepted',
    close_reason: null,
    note: '중2~3 대상 8회 과정. 수련관 3층 다목적실, 평일 방과후 희망.',
    created_at: demoTime(-4, '11:00'),
  },
  {
    id: 'rr-2',
    org_id: 'org-1',
    instructor_id: 'in-1',
    field: '3D 모델링·프린팅',
    demand_count: 7,
    status: 'sent',
    close_reason: null,
    note: '중등 6회 과정 검토 중. 토요일 오전 가능 여부 확인 부탁드립니다.',
    created_at: demoTime(-1, '09:30'),
  },
  {
    id: 'rr-3',
    org_id: 'org-2',
    instructor_id: 'in-6',
    field: '드론',
    demand_count: 5,
    status: 'declined',
    close_reason: '장소 없음',
    note: '2학기 일정이 이미 차서 어렵습니다.',
    created_at: demoTime(-3, '14:10'),
  },
]

// ──────────────────────────────────────────────────────────────
// Q&A — 공개 스레드만 존재한다. 1:1 경로는 만들지 않는다 (ADR-006).
// ──────────────────────────────────────────────────────────────

export const qnaQuestions: QnaQuestion[] = [
  {
    id: 'q-1',
    student_alias: '중2 학생 A',
    field: '드론',
    body: '드론 자격증은 몇 살부터 딸 수 있어요? 중학생도 가능한지 궁금해요.',
    visibility: 'public',
    org_id: 'org-1',
    created_at: demoTime(-7, '19:22'),
  },
  {
    id: 'q-2',
    student_alias: '중3 학생 B',
    field: '3D 모델링·프린팅',
    body: '3D 모델링 배우려면 컴퓨터 사양이 좋아야 하나요? 집에 노트북만 있어요.',
    visibility: 'public',
    org_id: 'org-1',
    created_at: demoTime(-6, '20:41'),
  },
  {
    id: 'q-3',
    student_alias: '고1 학생 C',
    field: 'VR·AR',
    body: 'VR 만드는 일은 어떤 공부를 해야 해요? 광명에는 배울 곳이 없는 것 같아요.',
    visibility: 'public',
    org_id: 'org-1',
    created_at: demoTime(-4, '18:03'),
  },
  // 48시간 넘게 답변이 없다 → 운영자 미답변 큐에 뜬다 (E-20).
  {
    id: 'q-4',
    student_alias: '중2 학생 D',
    field: '드론',
    body: '드론으로 찍은 영상은 어디에 올려도 괜찮아요? 학교 앞에서 찍어도 되나요?',
    visibility: 'public',
    org_id: 'org-2',
    created_at: demoTime(-3, '17:50'),
  },
  {
    id: 'q-5',
    student_alias: '중1 학생 E',
    field: 'AI·코딩',
    body: 'AI로 그림 그리는 거 배우고 싶은데 어디서 배워요?',
    visibility: 'public',
    org_id: 'org-1',
    created_at: demoTime(-2, '21:15'),
  },
  // 기관 담당자가 숨김 처리한 글 (UC-22).
  {
    id: 'q-6',
    student_alias: '중3 학생 F',
    field: '드론',
    body: '[링크 삭제]',
    visibility: 'hidden',
    org_id: 'org-1',
    created_at: demoTime(-2, '22:40'),
  },
]

export const qnaAnswers: QnaAnswer[] = [
  {
    id: 'a-1',
    question_id: 'q-1',
    instructor_id: 'in-2',
    body: '조종자 증명은 만 14세부터 응시할 수 있어요. 그 전에는 자격증 없이 날릴 수 있는 250g 미만 기체로 연습하면 충분합니다. 기체 무게와 비행 장소 규정만 먼저 익혀두면 14세에 바로 준비할 수 있어요.',
    created_at: demoTime(-7, '22:10'),
  },
  {
    id: 'a-2',
    question_id: 'q-2',
    instructor_id: 'in-1',
    body: '입문 단계는 노트북으로 충분해요. 저는 수업에서 웹 기반 도구로 시작합니다. 사양이 필요해지는 건 렌더링이나 큰 조립품을 다룰 때인데, 그때는 수업 장비를 쓰면 됩니다.',
    created_at: demoTime(-6, '23:02'),
  },
  {
    id: 'a-3',
    question_id: 'q-5',
    instructor_id: 'in-1',
    body: '광명 안에 정기 과정은 아직 없어요. 3D 모델링 수업에서 이미지 생성 도구를 도구로 쓰는 부분이 있어서, 우선 그쪽부터 접해보는 것도 방법입니다.',
    created_at: demoTime(-1, '09:12'),
  },
]

// ──────────────────────────────────────────────────────────────
// 보호자 문의 (개인 경로) — 성인 본인 정보만. 아이 정보는 학년대까지다 (ADR-014).
// ──────────────────────────────────────────────────────────────

export const inquiries: Inquiry[] = [
  {
    id: 'iq-1',
    guardian_name: '김**',
    guardian_contact: '010-****-1234',
    region_code: '41210',
    grade_band: 'middle',
    field: '드론',
    target_type: 'program',
    target_id: 'pg-3',
    message: '아이가 학교 특강에서 드론을 해보고 계속 배우고 싶다고 합니다. 주말 수업이 있는지 궁금합니다.',
    status: 'delivered',
    assigned_instructor_id: 'in-2',
    handled_by: 'admin-1',
    created_at: demoTime(-4, '21:14'),
  },
  {
    id: 'iq-2',
    guardian_name: '이**',
    guardian_contact: 'parent2@example.invalid',
    region_code: '41210',
    grade_band: 'elementary',
    field: '3D 모델링·프린팅',
    target_type: 'none',
    target_id: null,
    message: '초등 5학년인데 3D 프린터 수업을 들을 수 있는 곳을 찾고 있습니다.',
    status: 'assigned',
    assigned_instructor_id: 'in-1',
    handled_by: 'admin-1',
    created_at: demoTime(-2, '13:40'),
  },
  {
    id: 'iq-3',
    guardian_name: '박**',
    guardian_contact: '010-****-5678',
    region_code: '41390',
    grade_band: 'high',
    field: 'VR·AR',
    target_type: 'none',
    target_id: null,
    message: '고2 아이가 VR 쪽 진로를 생각하고 있어서 수업을 찾습니다. 시흥 근처면 좋겠습니다.',
    status: 'received',
    assigned_instructor_id: null,
    handled_by: null,
    created_at: demoTime(-1, '22:02'),
  },
  {
    id: 'iq-4',
    guardian_name: '최**',
    guardian_contact: '010-****-9012',
    region_code: '41210',
    grade_band: 'middle',
    field: '드론',
    target_type: 'instructor',
    target_id: 'in-2',
    message: '[링크 삭제] 광고성 내용으로 반려된 문의입니다.',
    status: 'rejected',
    assigned_instructor_id: null,
    handled_by: 'admin-1',
    created_at: demoTime(-1, '03:18'),
  },
]

// ──────────────────────────────────────────────────────────────
// 초대 — 셀프 가입이 없으므로 계정은 전부 여기서 출발한다 (ADR-011).
// ──────────────────────────────────────────────────────────────

export const invitations: Invitation[] = [
  {
    id: 'iv-1',
    email: 'manager@gm-youth.example.invalid',
    role: 'org_member',
    org_id: 'org-1',
    provider_id: null,
    token: 'demo-token-valid',
    expires_at: demoTime(7, '23:59'),
    accepted_at: null,
    created_by: 'admin-1',
  },
  {
    id: 'iv-2',
    email: 'teacher@gm-haan.example.invalid',
    role: 'org_member',
    org_id: 'org-2',
    provider_id: null,
    token: 'demo-token-accepted',
    expires_at: demoTime(3, '23:59'),
    accepted_at: demoTime(-10, '10:11'),
    created_by: 'admin-1',
  },
  // 만료 토큰 — 수락 시도는 거부돼야 한다 (E-12).
  {
    id: 'iv-3',
    email: 'new-instructor@example.invalid',
    role: 'instructor',
    org_id: null,
    provider_id: 'pv-1',
    token: 'demo-token-expired',
    expires_at: demoTime(-11, '23:59'),
    accepted_at: null,
    created_by: 'admin-1',
  },
]

/** 공개 화면에 그대로 쓰는 공급 규모. 숨기면 기관이 나중에 데이터 전체를 의심한다. */
export function supplyFacts() {
  const approved = instructors.filter((i) => i.status === 'approved')
  const coveredFields = new Set(approved.flatMap((i) => i.fields))
  return {
    providerCount: providers.filter((p) => p.status === 'approved').length,
    instructorCount: approved.length,
    programCount: programs.filter((p) =>
      approved.some((i) => i.id === p.instructor_id),
    ).length,
    coveredFields: FIELDS.filter((f) => coveredFields.has(f)),
    uncoveredFields: FIELDS.filter((f) => !coveredFields.has(f)),
  }
}

/**
 * 교안 시드.
 *
 * `ruleSkeleton()` 을 그대로 호출해 만든다 — 손으로 쓴 예시를 넣으면 실제 산출물과 달라지고,
 * 그러면 데모가 제품을 속이는 것이 된다.
 *
 * ls-2 하나만 채워 둔다. 기관 담당자가 발주한 회차의 교안을 열람하는 화면(ADR-019)이
 * 비어 있지 않아야 하기 때문이다. 데모 강사(in-2)가 배정된 ls-1 은 비워 둬서
 * "교안 초안 만들기" 버튼을 직접 눌러 보게 한다.
 */
const seedSession = lectureSessions.find((s) => s.id === 'ls-2')!
const seedProgram =
  programs.find(
    (p) => p.instructor_id === seedSession.instructor_id && p.field === seedSession.field,
  ) ?? null

const seedInputs: LessonPlanInputs = {
  session_title: seedSession.title,
  field: seedSession.field,
  grade_band: seedSession.grade_band,
  expected_students: seedSession.expected_students,
  duration_minutes: seedSession.duration_minutes,
  venue: seedSession.venue,
  class_traits: seedSession.class_traits,
  equipment: seedSession.equipment,
  program_title: seedProgram?.title ?? null,
  program_outline: seedProgram?.outline ?? [],
  // 같은 기관·같은 분야의 지난 3D 회차가 아직 없다. 5건 미만이면 집계 자체를 만들지 않는다 (ADR-018).
  prior: null,
}

export const lessonPlans: LessonPlan[] = [
  {
    id: 'lp-1',
    session_id: seedSession.id,
    instructor_id: seedSession.instructor_id!,
    ...ruleSkeleton(seedInputs),
    source: 'rule',
    inputs_snapshot: seedInputs,
    status: 'draft',
    created_at: demoTime(-1, '21:10'),
    updated_at: demoTime(-1, '21:10'),
  },
]
