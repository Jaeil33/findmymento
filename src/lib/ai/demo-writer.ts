import { isDemoMode } from '@/lib/supabase/env'

/**
 * 시연용 AI 응답 (ADR-025).
 *
 * 데모 배포에는 LLM 키가 없다. 그래도 창업 심사·파일럿 시연에서는 "LLM 을 붙이면 이 화면이 어떻게
 * 달라지는가"를 그대로 보여줘야 한다. 이 모듈은 **각 기능이 LLM 에 보내는 페이로드만 읽고**, LLM 이
 * 돌려줄 JSON 과 같은 모양을 만든다.
 *
 * - 규칙이 확정한 숫자·후보·항목은 여기서 바꿀 수 없다. 결과는 실제 LLM 응답과 **같은 병합·가드**
 *   (문장 정리 → 숫자 가드 → 이름 가드 → 모집 단어 가드)를 통과해야 화면에 남는다.
 * - 페이로드에 없는 사실을 만들지 않는다. 학생 의견 요약은 주어진 인용에 실제로 있는 주제만 쓴다.
 * - 켜지는 조건은 셋이 모두 맞을 때뿐이다: 데모 데이터 모드 · LLM 키 없음 · `DEMO_AI` 가 `off` 아님.
 *   **실 DB 에 붙은 배포에서는 켜지지 않는다** — 실제 기관 화면에 미리 쓴 문장이 나가면 안 된다.
 */

export function demoAiEnabled(): boolean {
  if (process.env.DEMO_AI?.trim().toLowerCase() === 'off') return false
  const key = process.env.ANTHROPIC_API_KEY
  if (key && key.trim() !== '') return false
  return isDemoMode()
}

// ============================================================================
// 0. 페이로드 읽기 — 모양이 달라도 throw 하지 않는다
// ============================================================================

type Obj = Record<string, unknown>

function obj(v: unknown): Obj {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Obj) : {}
}
function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}
function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}
function strs(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
}
function objs(v: unknown): Obj[] {
  return Array.isArray(v) ? v.map(obj) : []
}
/** 긴 문장이 들어가지 않으면 짧은 문장으로. 둘 다 넘으면 짧은 쪽을 그대로 — 가드가 버린다. */
function fit(long: string, short: string, max: number): string {
  return long.length <= max ? long : short
}

// ============================================================================
// 1. 분야별 표현 — 현장 강사에게 받은 말투를 기준으로 쓴다
// ============================================================================

type FieldVoice = {
  /** "…해 보는" — 무엇을 체험했는가 (관형형) */
  experience: string
  /** 창체 진로활동 기록 참고 문구. 회차 단위, 숫자 없음, 한 문장, "~함." */
  record: string
  jobs: string
  courseTitle: string
  /** 후속 과정 4차시. 숫자를 쓰지 않는다 — 숫자 가드가 허용하는 수가 회차마다 다르다. */
  outline: [string, string, string, string]
  requirements: string[]
  preparations: string[]
  /** "~할 수 있습니다" 로 끝나는 시수 안의 활동 */
  canDo: string
}

const VOICE: Record<string, FieldVoice> = {
  드론: {
    experience: '기체를 직접 띄우며 조종과 항공 촬영의 기초를 익히는',
    record:
      '진로활동으로 드론 분야 직업인 특강에 참여하여 기체 조종과 항공 촬영의 원리를 직접 체험하고, 드론 조종사와 항공 영상 제작자가 하는 일을 탐색함.',
    jobs: '드론 조종사·항공 촬영 감독·드론 정비사',
    courseTitle: '드론 항공 촬영 심화 과정: 우리 동네를 영상으로',
    outline: [
      '비행 안전 규정과 기체 점검, 실내 정밀 호버링 연습',
      '항로 계획을 세우고 구도를 살려 항공 촬영하기',
      '모둠별로 우리 동네 장면을 기획해 촬영하기',
      '짧은 영상으로 편집해 상영하고 관련 직업 알아보기',
    ],
    requirements: [
      '학생이 번갈아 직접 조종할 수 있는 기체 수 확보',
      '프로펠러 가드와 보호안경 등 안전장비 지참',
      '비행 금지 구역과 기상 조건 사전 확인',
      '마무리에 드론 관련 직업 사례 소개 포함',
    ],
    preparations: [
      '운동장·체육관 등 비행 가능한 공간 확보',
      '이착륙 구역 표시용 테이프와 안전선',
      '배터리 충전용 멀티탭과 전원',
      '마무리 QR 안내용 화면 또는 인쇄물',
    ],
    canDo: '이륙부터 제자리 비행, 착륙까지 모든 학생이 직접 해 볼 수 있습니다',
  },
  '3D 모델링·프린팅': {
    experience: '아이디어를 입체 모델로 설계하고 출력해 보는',
    record:
      '진로활동으로 3D 모델링·프린팅 분야 직업인 특강에 참여하여 아이디어를 입체 모델로 설계하고 출력하는 과정을 체험하며, 제품 디자이너와 설계 엔지니어가 하는 일을 탐색함.',
    jobs: '제품 디자이너·설계 엔지니어·메이커 교육자',
    courseTitle: '3D 모델링·프린팅 심화 과정: 내 물건 설계하기',
    outline: [
      '모델링 프로그램 기초와 치수 재는 법 익히기',
      '생활 속 불편을 찾아 내 물건 설계하기',
      '모둠별 시제품 출력과 수정·보완',
      '작품 발표와 제품 설계 관련 직업 알아보기',
    ],
    requirements: [
      '학생 계정 없이 쓸 수 있는 모델링 도구 사용',
      '출력 시간을 고려한 작은 크기의 과제 설계',
      '노즐·베드 화상 방지 수칙 안내',
      '완성 출력물 예시 지참',
    ],
    preparations: [
      '학생 수에 맞춘 노트북 또는 태블릿',
      '프린터 전원과 환기가 되는 자리',
      '출력물 보관용 모둠별 상자',
      '마무리 QR 안내용 화면 또는 인쇄물',
    ],
    canDo: '기본 도형을 조합해 내 물건을 모델링하고 출력 과정까지 지켜볼 수 있습니다',
  },
  'VR·AR': {
    experience: '실감 콘텐츠를 체험하며 가상 공간이 만들어지는 방식을 살펴보는',
    record:
      '진로활동으로 VR·AR 분야 직업인 특강에 참여하여 실감 콘텐츠를 체험하고 가상 공간이 만들어지는 과정을 살펴보며, 실감 콘텐츠 개발자가 하는 일을 탐색함.',
    jobs: '실감 콘텐츠 개발자·게임 기획자·가상 공간 디자이너',
    courseTitle: 'VR·AR 심화 과정: 나만의 가상 공간 만들기',
    outline: [
      '기기 안전 수칙과 실감 콘텐츠의 구조 이해하기',
      '간단한 가상 공간을 직접 만들어 보기',
      '모둠별 체험형 콘텐츠 기획과 제작',
      '시연회와 실감 콘텐츠 관련 직업 알아보기',
    ],
    requirements: [
      '한 번 착용 시간을 짧게 나눈 수업 설계',
      '기기 위생 관리용 1인 1커버 준비',
      '어지러움을 느끼면 바로 쉴 수 있는 대체 활동',
      '마무리에 관련 직업 사례 소개 포함',
    ],
    preparations: [
      '착용 시 주변을 비울 수 있는 넓은 공간',
      '기기 충전용 전원과 멀티탭',
      '순서를 기다리는 학생용 관찰 활동지',
      '마무리 QR 안내용 화면 또는 인쇄물',
    ],
    canDo: '착용 시간을 나눠 모든 학생이 한 번 이상 체험할 수 있습니다',
  },
  'AI·코딩': {
    experience: '인공지능이 데이터를 학습하는 원리를 코딩으로 확인해 보는',
    record:
      '진로활동으로 AI·코딩 분야 직업인 특강에 참여하여 인공지능이 데이터를 학습하는 원리를 코딩으로 체험하고, 소프트웨어 개발자와 데이터 전문가가 하는 일을 탐색함.',
    jobs: '소프트웨어 개발자·데이터 분석가·서비스 기획자',
    courseTitle: 'AI·코딩 심화 과정: 생활 문제를 푸는 서비스 만들기',
    outline: [
      '인공지능이 학습하는 원리와 안전한 사용 수칙',
      '블록 코딩으로 간단한 분류 프로그램 만들기',
      '모둠별로 생활 속 문제를 푸는 서비스 기획',
      '결과 발표와 소프트웨어 관련 직업 알아보기',
    ],
    requirements: [
      '학생 계정 없이 쓸 수 있는 도구 사용',
      '개인정보를 입력하지 않도록 먼저 안내',
      '생성 결과의 근거를 확인하는 활동 포함',
      '마무리에 관련 직업 사례 소개 포함',
    ],
    preparations: [
      '학생 수에 맞춘 노트북과 인터넷 연결',
      '교사용 화면 공유 장치',
      '모둠 활동지',
      '마무리 QR 안내용 화면 또는 인쇄물',
    ],
    canDo: '간단한 분류 모델을 직접 학습시켜 결과가 달라지는 것을 확인할 수 있습니다',
  },
  뷰티: {
    experience: '피부 관리와 메이크업 도구를 직접 다뤄 보는',
    record:
      '진로활동으로 뷰티 분야 직업인 특강에 참여하여 피부 관리와 메이크업 도구 사용을 체험하고, 뷰티 산업 종사자가 하는 일과 필요한 역량을 탐색함.',
    jobs: '메이크업 아티스트·화장품 연구원·뷰티 콘텐츠 제작자',
    courseTitle: '뷰티 심화 과정: 콘셉트 메이크업 기획하기',
    outline: [
      '피부 타입 이해와 위생·패치 테스트 수칙',
      '기초 메이크업 도구 사용 실습',
      '모둠별 콘셉트 메이크업 기획과 시연',
      '결과 공유와 뷰티 산업 관련 직업 알아보기',
    ],
    requirements: [
      '도구는 1인 1세트로 준비',
      '피부에 닿는 제품의 패치 테스트 절차 포함',
      '알레르기 확인 안내문 사전 배부',
      '마무리에 관련 직업 사례 소개 포함',
    ],
    preparations: [
      '거울과 조명이 있는 책상 배치',
      '손 세정 도구와 물티슈',
      '사용한 도구를 모을 위생 봉투',
      '마무리 QR 안내용 화면 또는 인쇄물',
    ],
    canDo: '기초 단계를 직접 따라 하며 도구 사용법을 익힐 수 있습니다',
  },
}

function voiceOf(field: string): FieldVoice {
  return (
    VOICE[field] ?? {
      experience: '관련 기술을 직접 다뤄 보는',
      record: `진로활동으로 ${field} 분야 직업인 특강에 참여하여 관련 기술을 직접 체험하고 직업 세계를 탐색함.`,
      jobs: '관련 직업',
      courseTitle: `${field} 심화 과정`,
      outline: [
        '기초 원리와 안전 수칙 익히기',
        '특강에서 해 본 활동을 직접 이어 가기',
        '모둠별 결과물 만들기',
        '결과 공유와 관련 직업 알아보기',
      ],
      requirements: ['학생이 직접 해 볼 수 있는 실습 중심 구성', '마무리에 관련 직업 사례 소개 포함'],
      preparations: ['실습 공간과 전원 확보', '마무리 QR 안내용 화면 또는 인쇄물'],
      canDo: '기본 활동을 한 번 이상 직접 해 볼 수 있습니다',
    }
  )
}

/** 학생 자유서술 주제. **인용에 실제로 있는 주제만** 요약에 쓴다 — 없는 의견을 만들지 않는다. */
const VOICE_THEMES: { re: RegExp; text: string }[] = [
  { re: /영상|촬영|찍|편집/, text: '직접 찍은 장면을 영상으로 만들어 보고 싶다는' },
  { re: /자격증|직업|돈|진로|취업/, text: '이 분야의 자격증과 직업으로 이어지는 길을 알고 싶다는' },
  { re: /조립|원리|어떻게|구조|정비|분해/, text: '장비가 움직이는 원리와 내부 구조를 더 알고 싶다는' },
  { re: /축구|대회|리그|게임|공모전/, text: '대회·게임처럼 목표가 있는 활동으로 이어 가고 싶다는' },
  { re: /디자인|설계|피규어|부품|물건/, text: '자기 아이디어를 직접 설계해 결과물로 만들고 싶다는' },
  { re: /프로그램|블렌더|코딩|소프트웨어/, text: '전문 프로그램 사용법을 제대로 배우고 싶다는' },
  { re: /체육대회|동아리|행사/, text: '학교 행사나 동아리 활동에 배운 기술을 써 보고 싶다는' },
]

// ============================================================================
// 2. 결과보고서 (기능 4) — result-report.ts buildLlmPayload
// ============================================================================

export function demoResultReport(payload: unknown): unknown {
  const p = obj(payload)
  const s = obj(p.회차)
  const a = obj(p.집계)
  const judge = obj(p.규칙_판단)

  const field = str(s.분야)
  const voice = voiceOf(field)
  const n = num(a.응답_수)
  const expected = num(a.예상_인원)
  const rate = num(a.응답률_퍼센트)
  const avg = num(a.만족도_평균_5점만점)
  const high = num(a.후속의향_3점이상_수)
  const highPct = num(a.후속의향_3점이상_퍼센트)
  const tops = objs(a.관심분야_상위)
    .map((t) => ({ field: str(t.field), count: num(t.count) }))
    .filter((t) => t.field !== '' && t.count !== null)
  const top = tops[0]

  const outcomes: string[] = [
    fit(
      `${str(s.학년대)} 학생을 대상으로 ${str(s.장소)}에서 ${num(s.시수_분)}분 동안 ${field} 분야 특강을 운영했고, 예상 인원 ${expected}명 중 ${n}명이 설문에 응답했습니다(응답률 ${rate}%).`,
      `예상 인원 ${expected}명 중 ${n}명이 설문에 응답해 응답률 ${rate}%를 기록했습니다.`,
      120,
    ),
  ]
  if (avg !== null) {
    const tone =
      avg >= 4 ? '높게 나타났습니다' : avg >= 3.5 ? '대체로 긍정적이었습니다' : '보완이 필요한 수준이었습니다'
    outcomes.push(
      fit(
        `학생들은 ${voice.experience} 활동을 경험했으며, 만족도는 5점 만점에 평균 ${avg}점으로 ${tone}.`,
        `만족도는 5점 만점에 평균 ${avg}점으로 ${tone}.`,
        120,
      ),
    )
  }
  if (high !== null && highPct !== null) {
    outcomes.push(
      highPct >= 40
        ? `응답자의 ${highPct}%(${high}명)가 더 배우고 싶다고 답해, 일회성 체험을 넘어 후속 교육으로 이어질 수요가 확인되었습니다.`
        : `더 배우고 싶다는 응답은 ${high}명(${highPct}%)으로, 후속 과정을 편성하기 전에 수요를 더 확인할 필요가 있습니다.`,
    )
  }
  if (top) {
    const list = tops.map((t) => `${t.field}(${t.count}건)`).join(', ')
    outcomes.push(
      fit(
        `관심 분야는 ${list} 순으로 많아, 다음 회차와 후속 과정 분야를 정하는 근거로 쓸 수 있습니다.`,
        `가장 많이 고른 관심 분야는 ${top.field}(${top.count}건)입니다.`,
        120,
      ),
    )
  }

  const quotes = strs(p.학생_자유서술)
  const studentVoice = VOICE_THEMES.map((t) => ({ t, hits: quotes.filter((q) => t.re.test(q)).length }))
    .filter((x) => x.hits > 0)
    .sort((x, y) => y.hits - x.hits)
    .slice(0, 4)
    .map(({ t, hits }) =>
      hits >= 2 ? `여러 응답에서 ${t.text} 의견이 공통으로 나왔습니다.` : `${t.text} 의견이 있었습니다.`,
    )
  if (studentVoice.length === 0 && quotes.length > 0) {
    studentVoice.push(`학생들이 직접 쓴 의견에서 ${field} 분야 활동을 더 해 보고 싶다는 반응이 확인되었습니다.`)
  }

  const improvements = strs(judge.개선점).map((rule) => {
    if (rule.includes('응답률')) {
      return '응답률을 높이기 위해 수업 종료 3분 전에 QR 안내 시간을 따로 두고, 응답이 모일 때까지 화면을 띄워 둔 채 마무리합니다.'
    }
    if (rule.includes('후속 의향')) {
      return fit(
        `마무리 단계에서 심화 과정과 관련 직업(${voice.jobs})을 구체적으로 소개해, 체험이 다음 배움으로 이어지도록 합니다.`,
        '마무리 단계에서 심화 과정과 관련 직업을 구체적으로 소개해, 체험이 다음 배움으로 이어지도록 합니다.',
        120,
      )
    }
    if (rule.includes('1·2점')) {
      return '어려움을 느낀 학생이 적지 않아, 첫 실습의 성공 기준을 낮추고 시범을 한 번 더 넣는 방안을 강사와 협의합니다.'
    }
    if (rule.includes('관심 분야 1위') && top) {
      return `학생 관심이 가장 높은 ${top.field} 분야와 연결되는 직업 사례를 마무리에 소개해 관심의 흐름을 이어 갑니다.`
    }
    if (rule.includes('배정 강사')) {
      return '배정 강사를 먼저 지정해 강사가 교실에서 QR을 띄우고 결과를 함께 확인할 수 있게 합니다.'
    }
    return '반응이 좋았던 활동은 다음 회차에서 비중을 늘리고, 응답 결과를 강사와 공유해 운영에 반영합니다.'
  })

  const nextSteps = strs(judge.후속_계획).map((rule) => {
    if (rule.includes('개설 여부')) {
      return `더 배우고 싶다고 답한 ${high}명의 관심을 근거로 ${top?.field ?? field} 분야 후속 과정 개설을 검토합니다.`
    }
    if (rule.includes('섭외')) {
      return '후속 과정을 열기로 하면 가까운 지역 강사에게 섭외 요청을 보내고, 학기 일정에 맞춰 운영 시기를 조율합니다.'
    }
    return '이번 회차만으로는 후속 수요가 뚜렷하지 않아, 다음 회차 응답을 함께 모아 편성 여부를 판단합니다.'
  })
  if (nextSteps.length < 4) nextSteps.push('결과를 담당 교사와 공유해 이번 학기 진로활동 계획에 반영합니다.')

  return {
    outcomes,
    student_voice: studentVoice,
    improvements,
    next_steps: nextSteps,
    record_reference: voice.record,
  }
}

// ============================================================================
// 3. 후속 과정 제안 (기능 5) — followup-plan.ts buildLlmPayload
// ============================================================================

export function demoFollowupPlan(payload: unknown): unknown {
  const p = obj(payload)
  const origin = obj(p.원_회차)
  const d = obj(p.후속_수요)
  const shape = obj(p.과정안_형식)

  const field = str(d.관심분야_1위) || str(origin.분야)
  const voice = voiceOf(field)
  const total = num(d.응답_수)
  const high = num(d.후속의향_3점이상_수)
  const fieldCount = num(d.관심분야_1위_응답_수)
  const time = str(d.참여가능시간_1위)
  const count = num(shape.차시_수) ?? 4
  const minutes = num(shape.회당_분) ?? num(origin.시수_분)
  const title = str(origin.제목)
  // 회차 제목의 숫자는 숫자 가드가 허용하지 않을 수 있다(공통 허용은 차시 번호 1~4). 섞이면 제목을 빼고 쓴다.
  const titleOk = title !== '' && !/\d/.test(title.replace(/(?<!\d)[1-4](?!\d)/g, ''))
  const where = !titleOk ? '지난 특강' : title.endsWith('특강') ? `「${title}」` : `「${title}」 특강`

  const sentences = [
    '안녕하세요.',
    `저희 기관에서 운영한 ${where} 이후 학생 설문 응답 ${total}건 가운데 ${high}건이 더 배우고 싶다고 답했고, 그중 ${fieldCount}건이 ${field} 분야를 골랐습니다.`,
    `이 관심을 이어 가기 위해 「${voice.courseTitle}」(회당 ${minutes}분, ${count}차시)를 검토하고 있습니다.`,
    time ? `학생들이 가장 많이 고른 참여 가능 시간은 ${time}입니다.` : null,
    '기초 실습에서 시작해 모둠 프로젝트와 결과 공유로 마무리하는 흐름을 생각하고 있으며, 세부 내용은 강사님의 경험에 맞춰 조정하겠습니다.',
    '진행 가능 여부와 가능한 일정, 필요한 장비를 회신해 주시면 일정을 조율해 다시 안내드리겠습니다. 감사합니다.',
  ].filter((v): v is string => v !== null)

  let message = sentences.join(' ')
  if (message.length > 400) message = sentences.filter((_, i) => i !== 4).join(' ')

  return {
    suggested_title: voice.courseTitle,
    outline: voice.outline.slice(0, count),
    request_message: message,
  }
}

// ============================================================================
// 4. 수업 회고 (기능 6) — session-debrief.ts buildLlmPayload
// ============================================================================

export function demoDebrief(payload: unknown): unknown {
  const p = obj(payload)
  const s = obj(p.회차)
  const m = obj(p.지표)
  const judge = obj(p.규칙_판단)
  const steps = objs(p.교안_단계).map((x) => ({ phase: str(x.구분), title: str(x.제목) }))

  const field = str(s.분야)
  const n = num(m.응답_수)
  const rate = num(m.응답률_퍼센트)
  const avg = num(m.만족도_평균_5점만점)
  const highSat = num(m['만족도_4·5점_퍼센트'])
  const fu = num(m.후속의향_3점이상_퍼센트)
  const top = str(m.관심분야_1위)

  const closing = steps.find((x) => x.phase === '마무리')?.title ?? ''
  const firstBody = steps.find((x) => x.phase === '전개')?.title ?? ''

  const wentWell = strs(judge.잘된_점).map((rule) => {
    if (rule.includes('4·5점')) {
      return `만족도 4·5점 응답이 ${highSat}%입니다. ${field} 실습이 이 반 학생들에게 잘 맞았다는 신호로 볼 수 있습니다.`
    }
    if (rule.includes('후속 의향')) {
      return `더 배우고 싶다는 응답이 ${fu}%로, 체험이 다음 배움에 대한 관심으로 이어졌습니다. 후속 과정을 제안할 근거가 됩니다.`
    }
    return `응답 ${n}건이 모여 이 반의 반응을 숫자로 확인할 수 있게 되었습니다.`
  })

  const changeNext = strs(judge.바꿀_점).map((rule) => {
    if (rule.includes('후속 의향')) {
      return fit(
        `마무리 「${closing}」 단계에서 이어지는 심화 과정과 관련 직업을 조금 더 소개해 보세요. 후속 의향 3점 이상은 ${fu}%였습니다.`,
        `마무리 단계에서 이어지는 심화 과정과 관련 직업을 조금 더 소개해 보세요. 후속 의향 3점 이상은 ${fu}%였습니다.`,
        closing ? 100 : 0,
      )
    }
    if (rule.includes('1·2점')) {
      return fit(
        `첫 실습 「${firstBody}」에서 시범을 한 번 더 넣고 성공 기준을 낮춰 보세요. 따라오기 어려웠던 학생이 있었습니다.`,
        '첫 실습에서 시범을 한 번 더 넣고 성공 기준을 낮춰 보세요. 따라오기 어려웠던 학생이 있었습니다.',
        firstBody ? 100 : 0,
      )
    }
    if (rule.includes('관심 분야 1위')) {
      return `학생 관심 분야 1위는 ${top}입니다. 마무리에서 ${field} 기술이 그 분야와 함께 쓰이는 직업 사례를 소개해 보세요.`
    }
    if (rule.includes('응답률')) {
      return `응답률이 ${rate}%였습니다. 수업 종료 3분 전에 QR을 먼저 띄우고, 응답이 모인 뒤에 인사로 마무리해 보세요.`
    }
    return rule
  })

  const summary = [
    `${str(s.일시)}에 ${str(s.학년대)} 학생을 대상으로 ${str(s.장소)}에서 ${num(s.시수_분)}분 동안 ${field} 진로체험 특강을 진행했습니다.`,
    `수업 후 설문에는 ${n}명이 응답했으며(응답률 ${rate}%), 만족도는 5점 만점에 평균 ${avg}점, 4·5점 응답은 ${highSat}%입니다.`,
    fu !== null
      ? `더 배우고 싶다는 후속 의향 3점 이상 응답은 ${fu}%로, ${fu >= 40 ? '심화 과정으로 이어 갈 수요가 확인되었습니다' : '후속 교육 안내를 보강할 필요가 있습니다'}.`
      : null,
    top ? `학생들이 가장 관심을 보인 분야는 ${top}입니다.` : null,
    '본 요약은 학생 개인이 아닌 회차 전체 응답의 집계입니다.',
  ]
    .filter((v): v is string => v !== null)
    .join(' ')

  return { went_well: wentWell, change_next: changeNext, school_summary: summary }
}

// ============================================================================
// 5. 회차 기획 (기능 3) — session-plan.ts refineByLlm payload
// ============================================================================

export function demoSessionPlan(payload: unknown): unknown {
  const p = obj(payload)
  const c = obj(p.조건)
  const field = str(p.후보_분야)
  const voice = voiceOf(field)
  const supply = num(obj(p.관내_공급)[field]) ?? 0
  const unmet = objs(p.미충족_수요)
    .map((u) => ({ field: str(u.field), count: num(u.interest_count) }))
    .filter((u) => u.field !== '')

  const first = `${str(c.학년대)} ${num(c.인원)}명 규모라면 관내 승인 강사 ${supply}명이 있는 ${field} 분야가 바로 섭외하기 좋고, ${num(c.시수_분)}분이면 ${voice.canDo}.`
  const second = unmet[0]
    ? ` 관심은 모였지만 관내 공급이 없는 ${unmet[0].field} 분야는 신규 강사 발굴의 근거로 남겨 두시길 권합니다.`
    : ''

  return {
    rationale: fit(first + second, first, 200),
    instructor_requirements: voice.requirements,
    preparations: voice.preparations,
  }
}

// ============================================================================
// 6. 수업 설계 (기능 2) — lesson-plan.ts refineByLlm payload
// ============================================================================

type Activity = { re: RegExp; base: string; fast: string; slow: string }

const ACTIVITIES: Activity[] = [
  {
    re: /호버링|조작|조종|이륙|비행 연습/,
    base: '모둠마다 기체 한 대를 맡기고, 이륙 → 제자리 비행 → 착륙을 한 사람씩 번갈아 두 번 연습합니다.',
    fast: '제자리 비행이 안정되면 네모 경로를 따라 천천히 이동하는 미션을 줍니다.',
    slow: '강사가 조종기를 함께 잡고 이륙과 착륙만 먼저 성공하게 합니다.',
  },
  {
    re: /항로|경로|규정/,
    base: '활동 공간 약도를 나눠 주고 모둠별로 비행 경로와 이착륙 지점을 그린 뒤, 금지 구역을 서로 점검합니다.',
    fast: '장애물 하나를 경로에 더해 돌아가는 경로를 설계하게 합니다.',
    slow: '출발점과 도착점만 표시하는 직선 경로로 범위를 줄입니다.',
  },
  {
    re: /편집|상영/,
    base: '모둠별로 고른 컷을 이어 짧은 영상으로 편집하고, 한 모둠씩 화면에 띄워 함께 봅니다.',
    fast: '자막이나 배경음을 넣어 영상의 완성도를 높이게 합니다.',
    slow: '컷 두 개만 이어 붙이는 것으로 범위를 줄입니다.',
  },
  {
    re: /촬영|영상/,
    base: '모둠별로 찍을 장면 하나를 정하고, 높이와 각도를 바꿔 같은 장면을 세 번 촬영한 뒤 가장 좋은 컷을 고릅니다.',
    fast: '고른 컷에 한 줄 제목을 붙여 짧은 소개 장면으로 이어 붙이게 합니다.',
    slow: '강사가 정해 준 구도 하나만 따라 찍고 결과를 함께 확인합니다.',
  },
  {
    re: /코딩|블록/,
    base: '블록 코딩으로 앞으로·회전·착륙 명령을 조합해 짧은 경로를 만들고, 실행 전에 화면에서 먼저 확인합니다.',
    fast: '반복 블록을 써서 같은 경로를 더 짧은 코드로 줄이게 합니다.',
    slow: '완성 코드의 빈칸 두 곳만 채우는 형태로 바꿉니다.',
  },
  {
    re: /모델링|도면|치수|설계|스케치|아이디어/,
    base: '만들 물건의 치수를 자로 잰 뒤, 기본 도형을 조합해 같은 크기로 모델링합니다.',
    fast: '구멍이나 홈 같은 기능 요소를 하나 더해 실제로 쓸 수 있게 다듬습니다.',
    slow: '미리 준비한 기본 모델에서 크기만 바꿔 보는 과제로 줄입니다.',
  },
  {
    re: /출력|슬라이싱|후처리|프린터/,
    base: '슬라이싱 프로그램에서 채움 비율과 지지대를 바꿔 출력 시간이 어떻게 달라지는지 비교한 뒤 출력을 시작합니다.',
    fast: '같은 모델을 두 가지 설정으로 비교해 차이를 기록하게 합니다.',
    slow: '강사가 정한 설정 그대로 출력하고 과정을 관찰하게 합니다.',
  },
  {
    re: /정비|분해|조립|부품|모터|배터리/,
    base: '부품 이름표를 붙인 기체를 모둠별로 분해한 뒤, 역순으로 조립하며 각 부품이 하는 일을 말로 설명합니다.',
    fast: '조립 후 점검표를 직접 만들어 다른 모둠 기체를 점검하게 합니다.',
    slow: '프로펠러와 배터리 두 가지만 분리·장착해 보는 과제로 줄입니다.',
  },
  {
    re: /발표|공유|포트폴리오|리그|대회|시연/,
    base: '모둠별로 만든 결과를 보여 주고, 가장 어려웠던 점과 해결한 방법을 한 가지씩 말하게 합니다.',
    fast: '다른 모둠 결과에서 배울 점을 하나 찾아 질문하게 합니다.',
    slow: '결과물을 보여 주는 것만으로도 충분하다고 먼저 안내합니다.',
  },
]

/** 학급 특성 대응. **단계마다 무엇을 바꾸는지**가 다르다 — 같은 문장을 모든 단계에 반복하지 않는다. */
const TRAIT_HOW: Record<string, (field: string, phase: string) => string> = {
  '첫 경험 다수': (f, ph) =>
    ph === '도입'
      ? '무엇을 할지 강사가 먼저 한 번 시범으로 보여 주고, 오늘은 한 번 해 보는 것이 목표라고 안내합니다.'
      : ph === '마무리'
        ? '완성하지 못한 학생도 해 본 만큼 말할 수 있게 발표 기준을 낮춥니다.'
        : f === '드론'
          ? '첫 이륙 전에 강사가 한 번 시범 비행하고, 성공 기준을 "제자리에서 잠깐 떠 있기"로 낮춥니다.'
          : '첫 시도 전에 시범을 한 번 더 보여 주고, 성공 기준을 한 단계 낮춰 안내합니다.',
  '경험자 다수': (_f, ph) =>
    ph === '도입'
      ? '이미 해 본 학생에게는 오늘의 심화 목표를 따로 제시합니다.'
      : ph === '마무리'
        ? '처음 해 본 친구를 도운 경험을 함께 나누게 합니다.'
        : '기본 과제는 확인만 하고 넘어가고, 모둠 안에서 처음 하는 친구를 돕는 역할을 함께 줍니다.',
  '통합학급 포함': (_f, ph) =>
    ph === '도입'
      ? '짝을 먼저 정하고 두 사람의 역할(조작·기록)을 미리 나눠 둡니다.'
      : ph === '마무리'
        ? '짝이 함께 결과를 보여 주게 해 한 사람에게 발표 부담이 몰리지 않게 합니다.'
        : '짝 활동으로 바꿔 조작 담당과 기록 담당을 나누고, 중간에 역할을 한 번 바꿉니다.',
  '휠체어 사용 학생 있음': (f, ph) =>
    ph === '도입'
      ? '설명을 듣는 자리부터 통로 옆 앞자리로 잡아 이동 없이 시범을 볼 수 있게 합니다.'
      : ph === '마무리'
        ? '결과 공유는 각자 자리에서 할 수 있게 강사가 자리를 돌며 확인합니다.'
        : f === '드론'
          ? '조종 자리를 통로 옆 평평한 곳에 두고, 앉은 채로 조종할 수 있게 이착륙 구역을 가깝게 잡습니다.'
          : '앉은 자리에서 끝낼 수 있는 형태로 바꾸고, 이동 동선이 짧은 통로 옆 자리를 비워 둡니다.',
  '청각 보조 필요': (_f, ph) =>
    ph === '마무리'
      ? 'QR 안내 문장도 화면에 글로 함께 띄웁니다.'
      : '구두 설명과 같은 내용을 화면에 글로 띄우고, 시작·정지 신호를 손 신호로도 함께 약속합니다.',
  '시각 보조 필요': (_f, ph) =>
    ph === '마무리'
      ? 'QR을 크게 띄우고 입장 코드를 소리 내어 읽어 줍니다.'
      : '화면 대신 실물을 손으로 확인하게 하고, 안전 구역은 촉감이 다른 테이프로 표시합니다.',
  '한국어 보조 필요': (_f, ph) =>
    ph === '마무리'
      ? 'QR 안내를 짧은 문장과 그림으로 한 번 더 보여 줍니다.'
      : '핵심 용어를 그림 카드로 함께 보여 주고, 지시문을 한 번에 한 동작씩 짧게 나눕니다.',
  '집중 지속이 짧은 편': (_f, ph) =>
    ph === '도입'
      ? '설명은 짧게 끝내고 바로 손으로 해 보는 활동으로 넘어갑니다.'
      : ph === '마무리'
        ? '정리는 짧게 하고 QR 응답 시간을 먼저 확보합니다.'
        : '한 활동을 짧게 나누고, 활동 사이에 자리에서 일어나 다른 모둠 결과를 보러 가는 전환을 넣습니다.',
}

/** 지난 회차 반복 표현 중 수업 주제로 쓸 수 있는 말만. 어미·조사 조각은 버린다. */
const PRIOR_KEYWORDS = ['영상', '촬영', '자격증', '축구', '조립', '코딩', '피규어', '부품', '게임', '편집', '설계']

export function demoLessonSteps(payload: unknown): unknown {
  const p = obj(payload)
  const lesson = obj(p.수업)
  const prior = p.지난_회차_응답 ? obj(p.지난_회차_응답) : null
  const field = str(lesson.분야)
  const venue = str(lesson.장소)
  const skeleton = objs(p.차시_골격)
  const keyword = prior ? strs(prior.반복된_표현).find((t) => PRIOR_KEYWORDS.includes(t)) : undefined

  const steps = skeleton.map((step) => {
    const phase = str(step.단계)
    const title = str(step.제목)
    const traits = strs(step.대응할_항목)
    const accommodations = traits.map((trait) => ({ trait, how: TRAIT_HOW[trait]?.(field, phase) ?? '' }))

    if (phase === '도입') {
      return {
        base: keyword
          ? `지난 회차 학생들이 '${keyword}' 이야기를 많이 했던 만큼 그와 이어지는 완성 예시로 시작하고, ${venue}에서 지킬 안전 수칙 두 가지를 따라 말하게 합니다.`
          : `완성된 결과물 예시를 먼저 보여 주고, ${venue}에서 지킬 안전 수칙 두 가지를 학생들이 소리 내어 따라 말하게 합니다.`,
        fast: '예시를 보고 오늘 스스로 도전할 목표를 한 가지 더 정해 두게 합니다.',
        slow: '오늘의 성공 기준을 "끝까지 한 번 해 보기"로 낮춰 먼저 안심시킵니다.',
        accommodations,
      }
    }

    if (phase === '마무리') {
      return {
        base: '모둠별 결과물을 짧게 보여 준 뒤 화면에 QR을 띄우고 "이거 찍으면 너한테 맞는 다음 교육을 찾아줘"라고 안내하며, 응답이 모일 때까지 기다렸다가 인사합니다.',
        fast: '먼저 끝낸 학생에게 오늘 가장 어려웠던 순간을 한 문장으로 설명하게 합니다.',
        slow: '완성하지 못했어도 해 본 부분을 먼저 말하게 하고 박수로 마무리합니다.',
        accommodations,
      }
    }

    const act = ACTIVITIES.find((a) => a.re.test(title))
    return {
      base: act?.base ?? `「${title}」 과제를 모둠별로 수행하고, 중간에 한 번 멈춰 서로의 결과를 보며 고칠 점을 찾습니다.`,
      fast: act?.fast ?? `「${title}」에 조건을 하나 더 붙인 심화 과제로 확장합니다.`,
      slow: act?.slow ?? '범위를 앞 절반으로 줄이고, 강사 시범을 한 번 더 본 뒤 따라 하게 합니다.',
      accommodations,
    }
  })

  return { steps }
}

// ============================================================================
// 7. 학생 추천 이유 (기능 1) — recommend.ts rankByLlm payload
// ============================================================================

/** 학생이 쓴 말과 프로그램 내용이 **둘 다** 맞을 때만 그 주제로 이유를 쓴다. */
const RECO_THEMES: { said: RegExp; program: RegExp; reason: string }[] = [
  {
    said: /영상|촬영|찍|편집|유튜브/,
    program: /촬영|영상|편집/,
    reason: '영상 찍어 보고 싶다고 했죠. 직접 촬영하고 편집하는 시간이 있어요.',
  },
  {
    said: /조립|정비|분해|원리|어떻게/,
    program: /조립|정비|분해|구조|원리/,
    reason: '작동 원리가 궁금하다고 했죠. 직접 분해하고 조립해 볼 수 있어요.',
  },
  {
    said: /축구|대회|리그|게임|팀/,
    program: /축구|리그|대회|미니 대회/,
    reason: '친구들과 겨루는 활동을 좋아한다면 꾸준히 이어 가기 좋아요.',
  },
  {
    said: /코딩|프로그램|명령/,
    program: /코딩|블록/,
    reason: '코딩에 관심 있다면 명령을 짜서 직접 움직여 볼 수 있어요.',
  },
  {
    said: /디자인|설계|피규어|부품|물건|만들/,
    program: /모델링|설계|도면|디자인|출력/,
    reason: '내 아이디어를 직접 설계해서 결과물로 가져갈 수 있어요.',
  },
]

export function demoRanking(payload: unknown): unknown {
  const p = obj(payload)
  const student = obj(p.학생)
  const said = `${str(student.직접_쓴_말)} ${str(student.관심_직업)}`
  const chosen = strs(student.고른_관심분야)

  const scored = objs(p.후보).map((c, i) => {
    const text = [str(c.제목), str(c.소개), ...strs(c.수업내용)].join(' ')
    const theme = RECO_THEMES.find((t) => t.said.test(said) && t.program.test(text))
    const score = (theme ? 2 : 0) + (chosen.includes(str(c.분야)) ? 1 : 0)
    return { c, i, theme, score }
  })
  scored.sort((a, b) => b.score - a.score || a.i - b.i)

  return {
    ranking: scored.map(({ c, theme }) => {
      const format = str(c.형태)
      const sessions = num(c.회차수)
      const base =
        theme?.reason ??
        (format === 'one_off'
          ? `오늘 해 본 ${str(c.분야)} 분야를 한 번 더 가볍게 이어 가기 좋은 수업이에요.`
          : format === 'club'
            ? '같은 관심을 가진 친구들과 꾸준히 활동하는 동아리예요.'
            : `${sessions}회 동안 기초부터 결과물까지 차근차근 이어지는 과정이에요.`)
      const near = str(c.거리) === '같은 시군구' ? ' 가까워서 다니기도 좋아요.' : ''
      return { id: str(c.id), reason: fit(base + near, base, 60) }
    }),
  }
}

// ============================================================================
// 8. 보호자 문의 도우미 (기능 7) — inquiry-assist.ts buildLlmPayload
// ============================================================================

/** 보호자 설명에 **실제로 있는** 이야기만 문의 글에 옮긴다. 없는 관심사를 만들지 않는다. */
const GUARDIAN_THEMES: { re: RegExp; text: string }[] = [
  { re: /영상|촬영|찍|편집|유튜브/, text: '직접 찍은 장면을 영상으로 만드는 데 관심이 커졌습니다' },
  { re: /게임|앱|프로그램/, text: '직접 게임이나 프로그램을 만들어 보고 싶어 합니다' },
  { re: /피규어|물건|만들|설계|디자인/, text: '자기 아이디어를 직접 만들어 보는 활동을 좋아합니다' },
  { re: /조립|분해|원리|구조|어떻게/, text: '장비가 움직이는 원리와 구조를 궁금해합니다' },
  { re: /체험|또 해|다시 해/, text: '체험을 한 번 더 해 보고 싶어 합니다' },
  { re: /축구|대회|친구|팀/, text: '친구들과 함께하는 활동을 좋아합니다' },
]

const LECTURE_CUE = /특강|진로\s?체험|체험\s?수업/
const BEGINNER_CUE = /처음|초보|걱정|따라갈|서툴/

export function demoInquiryMessage(payload: unknown): unknown {
  const p = obj(payload)
  const said = str(p.보호자_설명)
  const c = obj(p.정리된_조건)
  const child = str(c.학년대)
  const field = str(c.관심_분야)
  const times = strs(c.희망_시간대)

  const theme = GUARDIAN_THEMES.find((t) => t.re.test(said))
  const afterLecture = LECTURE_CUE.test(said)

  const interest = field
    ? afterLecture
      ? `학교에서 ${field} 특강을 들은 뒤로 아이가 이 분야를 더 배우고 싶어 합니다.`
      : `아이가 요즘 ${field} 분야에 관심이 많습니다.`
    : afterLecture
      ? '학교 특강을 들은 뒤로 아이가 무언가를 더 배우고 싶어 하는데, 어느 분야가 맞을지는 아직 정하지 못했습니다.'
      : '아이가 관심을 보이는 분야를 계속 배울 곳을 찾고 있는데, 어느 분야가 맞을지는 아직 정하지 못했습니다.'

  const sentences = [
    '안녕하세요.',
    child ? `${child} 자녀를 둔 보호자입니다.` : '자녀 교육 때문에 문의드립니다.',
    interest,
    theme ? `특히 ${theme.text}.` : null,
    times.length > 0 ? `${times.join('·')}에 참여할 수 있는 수업이 있을까요?` : null,
    BEGINNER_CUE.test(said) ? '처음 배우는 아이라 기초부터 따라갈 수 있는지 궁금합니다.' : null,
    field ? null : '아이 또래가 시작하기 좋은 수업이 있다면 알려 주셔도 좋습니다.',
    '수업 장소와 진행 방식, 준비물, 가능한 일정과 비용을 안내해 주시면 감사하겠습니다.',
  ].filter((v): v is string => v !== null)

  let message = sentences.join(' ')
  if (message.length > 300) message = sentences.filter((s) => !s.startsWith('특히')).join(' ')
  return { message }
}
