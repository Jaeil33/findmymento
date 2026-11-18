import { DEMO_STUDENT_ENTRY_CODE, DEMO_STUDENT_PSEUDO_CODE } from '@/lib/demo/guests'

/**
 * 체험 입구와 사용 방법 — **공개 랜딩에 그대로 실리는 문구다** (ADR-033).
 *
 * 순수 데이터만 둔다(`next/headers` 를 import 하지 않는다). 쿠키·모드 판정은 `lib/demo/mode.ts`,
 * 쿠키를 심는 곳은 `app/tour/[key]/route.ts` 한 곳이다.
 *
 * 여기 적는 단계는 **실제로 화면에 있는 것만** 적는다. 없는 기능을 사용 방법에 적으면
 * 그게 곧 과장 광고가 된다 (CLAUDE.md 개발 원칙).
 */

export type TourKey = 'instructor' | 'student' | 'admin' | 'org' | 'school' | 'guardian'

export type TourEntry = {
  key: TourKey
  /**
   * 체험 중 쓰는 역할. `lib/auth/actor.ts` 의 데모 계정 키와 같은 값이다.
   * **학생은 `null`** — 학생은 계정을 만들지 않으므로(CLAUDE.md CRITICAL) 역할 쿠키를 심지 않고
   * 실서비스와 같은 비로그인 경로로 들여보낸다.
   */
  actor: 'instructor' | 'admin' | 'org' | 'school' | null
  label: string
  /** 누구의 화면인지 */
  who: string
  summary: string
  /** 눌렀을 때 도착하는 화면 */
  destination: string
  destinationLabel: string
  highlights: string[]
}

export const TOUR_ENTRIES: readonly TourEntry[] = [
  {
    key: 'instructor',
    actor: 'instructor',
    label: '강사 모드',
    who: '박서연 · 드론·3D 강사',
    summary: '조건을 넣어 도안을 만들고, 검증 결과를 보고, 승인·인쇄까지.',
    destination: '/instructor/studio',
    destinationLabel: 'AI 콘텐츠 스튜디오',
    highlights: [
      '만들어 둔 도안 7건 — 승인·실패·버전까지',
      '검증에 걸린 도안은 인쇄가 막힌 화면',
      '새로 만들기 — 조건을 넣으면 도안과 판정이 그 자리에',
    ],
  },
  {
    key: 'student',
    actor: null,
    label: '학생 모드',
    who: '계정 없음 · 교실에서 QR로 들어오는 화면',
    summary: '특강 직후 학생이 보는 화면. 3분 설문을 내면 다음에 배울 곳이 나옵니다.',
    destination: `/s/${DEMO_STUDENT_ENTRY_CODE}`,
    destinationLabel: '3D 특강 설문',
    highlights: [
      `참여 코드 ${DEMO_STUDENT_PSEUDO_CODE} — 지난 특강 기록까지 이어진 추천`,
      '코드 없이도 끝까지 낼 수 있음',
      '실명·연락처·학교를 묻는 칸 없음',
    ],
  },
  {
    key: 'admin',
    actor: 'admin',
    label: '운영자 모드',
    who: '운영자 · 심사와 배정',
    summary: '강사 심사, 초대 링크 발급, 보호자 문의 배정, 회차 기록.',
    destination: '/admin',
    destinationLabel: '운영자 요약',
    highlights: [
      '강사 심사 — 증빙 확인 전에는 어디에도 노출 안 됨',
      '초대 링크 발급 — 공개 회원가입이 없는 이유',
      '보호자 문의 배정과 회차 리포트',
    ],
  },
  {
    key: 'org',
    actor: 'org',
    label: '기관 담당자 모드',
    who: '이수진 · 청소년기관 담당자',
    summary: '회차를 열고 응답을 모아 후속 과정을 기획하는 화면.',
    destination: '/org',
    destinationLabel: '기관 요약',
    highlights: [
      '회차 만들기와 가명코드 발급',
      '분야 × 학년대 수요 집계',
      '지역 강사 섭외 요청',
    ],
  },
  {
    key: 'school',
    actor: 'school',
    label: '학교 담당자 모드',
    who: '강민호 · 중학교 진로 담당',
    summary: '같은 화면을 학교 쪽에서. 권한은 같고 문구만 다릅니다.',
    destination: '/org',
    destinationLabel: '학교 요약',
    highlights: [
      '학교가 연 회차와 응답 집계',
      '자유학기 운영에 쓰는 분야별 수요',
      '권한 판단은 조직 유형이 아니라 소속 테이블로 (ADR-013)',
    ],
  },
  {
    key: 'guardian',
    actor: null,
    label: '보호자 모드',
    who: '계정 없음 · 비로그인 문의 폼',
    summary: '아이 상황을 적으면 도우미가 조건·가까운 프로그램·문의 글을 정리합니다.',
    destination: '/inquiry',
    destinationLabel: '보호자 문의',
    highlights: [
      '"예시 문장 넣기"로 아이 이름·학교가 빠지는 모습까지',
      '받는 정보는 보호자 이름·연락처와 학년대까지',
      '체험 중 접수한 문의는 데모 시드에만 남음',
    ],
  },
]

/** 랜딩에 큰 카드로 내보내는 셋 — 사용자가 요청한 운영자·강사·학생이다. */
export const TOUR_PRIMARY_KEYS: readonly TourKey[] = ['instructor', 'student', 'admin']

/** 카드 아래 한 줄 링크로 두는 나머지. 계정이 없는 보호자 경로도 여기 있다. */
export const TOUR_SECONDARY_KEYS: readonly TourKey[] = ['org', 'school', 'guardian']

export function tourEntry(key: string): TourEntry | null {
  return TOUR_ENTRIES.find((e) => e.key === key) ?? null
}

export function tourHref(key: TourKey): string {
  return `/tour/${key}`
}

// ============================================================================
// 사용 방법 — 강사 · 학생
// ============================================================================

export type GuideStep = {
  title: string
  body: string
  /** 그 단계에서 지켜지는 제약. 없으면 생략한다 */
  note?: string
}

export type Guide = {
  key: 'instructor' | 'student'
  audience: string
  lead: string
  steps: GuideStep[]
  /** 자주 오해하는 것 */
  notes: string[]
}

/**
 * 강사 사용 방법. 스튜디오 → 검증 → 승인 → 수업 → 피드백 순서는 `docs/STUDIO.md` 의 파이프라인과
 * 같아야 한다. 화면 순서가 바뀌면 이 문구도 같이 바뀐다.
 */
export const INSTRUCTOR_GUIDE: Guide = {
  key: 'instructor',
  audience: '강사 · 직업인',
  lead: '검증을 통과한 도안만 교실에 들고 갑니다.',
  steps: [
    {
      title: '초대 링크로 로그인',
      body: '운영자가 보낸 링크로 한 번 계정을 만들면, 이후에는 아이디·비밀번호로 들어옵니다.',
    },
    {
      title: '수업 조건 넣기',
      body: '학년대 · 학생 수 · 수업 시간 · 장소 · 보유 장비 · 주제.',
    },
    {
      title: '도안 만들기',
      body: '검수된 도안 목록에서 주제에 맞는 것을 고릅니다. 치수·부품·제작 시간은 프로그램 계산.',
    },
    {
      title: '검증 결과 읽기',
      body: '선 간격 · 선 길이 · 각도 · 부품 수 · 접합 · 제작 시간을 학년대 기준과 나란히 봅니다.',
      note: '기준에 걸리면 치수를 고쳐 최대 3번 다시 검증하고, 그래도 넘지 못하면 실패로 남습니다.',
    },
    {
      title: '통과한 것만 승인',
      body: '승인하면 SVG 내려받기 · A4 1:1 인쇄 · 교실 투사가 열립니다.',
      note: '실패한 도안에는 인쇄도 내려받기도 열리지 않습니다.',
    },
    {
      title: '수업에서 쓰기',
      body: 'A4에 1:1로 인쇄해 그 위에 바로 그립니다. 마지막 3분에는 QR 설문.',
    },
    {
      title: '성과 남기기',
      body: '시도·완성 인원, 실제 걸린 시간, 체감 난이도. 다음 예상 시간에 반영됩니다.',
      note: '같은 도안·학년대 3건부터 반영. 누가 완성하지 못했는지는 받지 않습니다.',
    },
  ],
  notes: [
    '회차를 만드는 주체는 기관·학교입니다. 강사는 배정받습니다.',
    '학생과 1:1로 주고받는 비공개 메시지는 없습니다. 답변은 공개 Q&A에 씁니다.',
    '연락처는 공개 디렉토리에 싣지 않습니다.',
  ],
}

/** 학생 사용 방법. 학생을 향한 문구이므로 "만족도 조사"라고 쓰지 않는다 (UI_GUIDE 안전규칙 8). */
export const STUDENT_GUIDE: Guide = {
  key: 'student',
  audience: '학생',
  lead: '특강 끝나고 3분. 가입도, 로그인도, 앱 설치도 없습니다.',
  steps: [
    {
      title: '교실 앞 QR 찍기',
      body: '강사 선생님이 띄운 QR을 휴대폰 카메라로 찍으면 바로 열립니다.',
    },
    {
      title: '참여 코드 넣기',
      body: '기관에서 나눠 준 코드를 넣으면 지난 특강에서 고른 분야까지 이어서 봐 줍니다.',
      note: '코드는 이름이 아닙니다. 이름·연락처·학교를 적는 칸은 없습니다.',
    },
    {
      title: '세 가지만 답하기',
      body: '오늘 수업은 어땠는지, 더 배우고 싶은 분야, 해 보고 싶은 것.',
    },
    {
      title: '다음에 배울 곳 보기',
      body: '우리 지역부터 찾고, 없으면 옆 지역까지. 관련된 직업도 같이 나옵니다.',
    },
    {
      title: '"더 배우고 싶어요" 누르기',
      body: '누른 내용은 기관 선생님 화면에 모입니다.',
      note: '강사 선생님에게 바로 가지 않습니다. 수업 신청은 보호자님이 문의 폼으로 하셔야 합니다.',
    },
    {
      title: '궁금한 건 공개 Q&A에',
      body: '지역 강사 선생님이 답을 씁니다. 다른 학생도 읽는 공개 글입니다.',
      note: '선생님과 1:1로 주고받는 비밀 대화는 만들지 않았습니다.',
    },
  ],
  notes: [
    '이름·연락처·학교는 저장하지 않습니다. 기관이 나눠 준 참여 코드만 씁니다.',
    '답한 내용은 반 전체 숫자로만 쓰입니다.',
    '이 화면에서 결제하는 기능은 없습니다.',
  ],
}

export const GUIDES: readonly Guide[] = [INSTRUCTOR_GUIDE, STUDENT_GUIDE]
