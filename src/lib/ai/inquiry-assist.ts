import { callJsonLlm, numbersWithin, sanitizeText } from '@/lib/ai/guard'
import { demoInquiryMessage } from '@/lib/ai/demo-writer'
import type { Dataset } from '@/lib/db/dataset'
import { searchDirectory } from '@/lib/db/queries'
import { moderate } from '@/lib/moderation'
import { expansionMessage } from '@/lib/region'
import {
  FIELDS,
  type Field,
  type GradeBand,
  type InquiryAssistDraft,
  type InquiryAssistMatch,
} from '@/types/domain'

/**
 * 보호자 문의 도우미 = **규칙 정리 + LLM 문의 글** (ADR-026).
 *
 * 보호자는 "아이가 드론 특강 듣고 영상에 빠졌어요"까지는 쓸 수 있지만, 그걸 강사가 답할 수 있는
 * 문의로 옮기는 데서 멈춘다. 그래서 강사에게 오는 리드가 "연락 주세요" 한 줄이 된다.
 * 이 모듈이 그 사이를 메운다 — 쓰는 사람은 보호자이고, 답할 수 있는 리드를 받는 쪽은 강사다.
 *
 * - 학년대·분야·시간대는 **규칙**이 글에서 읽고, 프로그램은 공개 디렉토리 규칙 그대로 고른다.
 *   LLM 은 문의 글 한 편만 쓰고 그 밖의 값을 바꾸지 못한다.
 * - 보호자가 적은 아이 이름·학교·연락처·나이는 **LLM 에 보내기 전에** 지운다.
 * - 초안에 숫자를 두지 않는다. 학년 숫자·나이·생년이 문장으로 새면 학년대까지만 받는 설계가 무너진다.
 * - 아무것도 저장하지 않는다. 접수는 보호자가 기존 폼으로 직접 한다.
 *
 * 개인화 단위는 여전히 학생이 아니다. 학습 수준을 진단하지 않고 학습경로를 만들지 않는다 —
 * 공개 디렉토리의 필터 세 개(학년대·분야·지역)를 보호자 대신 채우고 문의 글을 다듬는 일까지다.
 */

export type InquiryAssistInput = {
  /** 보호자가 적은 설명 원문. 원문은 이 모듈 밖(LLM·응답)으로 나가지 않는다. */
  situation: string
  regionCode: string
  /** 폼에서 이미 고른 값. 글에 단서가 없을 때만 쓴다. */
  gradeBand: GradeBand | null
  field: Field | null
}

/** 문의 폼 요청 내용 칸의 최대 길이와 같다 (`validateInquiry`). */
export const INQUIRY_MESSAGE_MAX = 300
const MAX_MATCHES = 3
/** 가리고 남은 설명이 이보다 짧으면 LLM 에 보낼 내용이 없다. */
const MIN_CLEAN_LENGTH = 5

const BAND_CHILD: Record<GradeBand, string> = {
  elementary: '초등학생',
  middle: '중학생',
  high: '고등학생',
}

// ============================================================================
// 1. 조건 정리 — 규칙. 글에서 가장 먼저 나온 단서를 쓰고, 단서가 없으면 비워 둔다
// ============================================================================

const FIELD_CUES: [Field, RegExp][] = [
  ['드론', /드론|항공\s?촬영|비행/],
  ['3D 모델링·프린팅', /3\s?[dD]|모델링|프린터|프린팅|피규어/],
  ['VR·AR', /\b(?:VR|AR)\b|가상\s?현실|증강\s?현실|메타버스/i],
  ['AI·코딩', /코딩|프로그래밍|인공지능|\bAI\b|파이썬|스크래치|엔트리|게임\s?만들|앱\s?만들/i],
  ['뷰티', /뷰티|메이크업|화장품|네일|헤어/],
]

const BAND_CUES: [GradeBand, RegExp][] = [
  ['elementary', /초등|초\s?[1-6](?!\d)/],
  ['middle', /중학|중등|중\s?[1-3](?!\d)/],
  ['high', /고등|고교|고\s?[1-3](?!\d)/],
]

/** 문의 폼·설문과 같은 시간대 이름을 쓴다. "주말"은 토·일 둘 다다. */
const TIME_CUES: [string, RegExp][] = [
  ['평일 방과후', /평일|방과\s?후|하교\s?후/],
  ['토요일', /토요일|주말/],
  ['일요일', /일요일|주말/],
  ['방학 중', /방학/],
]

function earliest<T>(text: string, cues: [T, RegExp][]): T | null {
  let best: { value: T; at: number } | null = null
  for (const [value, re] of cues) {
    const at = text.search(re)
    if (at >= 0 && (best === null || at < best.at)) best = { value, at }
  }
  return best?.value ?? null
}

/**
 * 설명에서 학년대·분야·시간대를 읽는다. **정해진 목록 안의 값만** 돌려준다.
 * 원문을 읽지만 결과는 목록 값뿐이라 아이 정보가 새지 않는다.
 */
export function extractConditions(text: string): {
  gradeBand: GradeBand | null
  field: Field | null
  times: string[]
} {
  return {
    gradeBand: earliest(text, BAND_CUES),
    field: earliest(text, FIELD_CUES),
    times: TIME_CUES.filter(([, re]) => re.test(text)).map(([t]) => t),
  }
}

// ============================================================================
// 2. 아이 식별 정보 지우기 — LLM 에 보내기 전에
// ============================================================================

/** 줄여 쓴 학교명. `lib/moderation` 은 "○○중학교"까지 잡고 "광명중 2학년"은 놓친다. */
const SCHOOL_SHORT = /[가-힣]{2,6}(?:초|중|고|여중|여고)(?=\s*(?:[1-6]\s*학년|다니|다녀|재학))/g
const AGE = /\d{2,4}\s*년\s*생|\d{1,2}\s*(?:살|세)/g
/** "중2"는 "중"만, "2학년"은 통째로 지운다. 학년대는 남기고 학년 숫자는 남기지 않는다. */
const GRADE_YEAR = /([초중고])\s?[1-6](?!\d)|\s?[1-6]\s*학년/g

/**
 * 연락처·링크·학교명·이름(`lib/moderation`) → 줄인 학교명 → 나이·생년 → 학년 숫자 순으로 지운다.
 * 연락처를 먼저 지워야 전화번호 숫자가 나이 규칙에 먹히지 않는다.
 */
export function cleanSituation(raw: string): { clean: string; masked: boolean } {
  const scan = moderate(raw, 'mask')
  let text = scan.clean
  let masked = scan.findings.length > 0

  SCHOOL_SHORT.lastIndex = 0
  if (SCHOOL_SHORT.test(text)) {
    masked = true
    SCHOOL_SHORT.lastIndex = 0
    text = text.replace(SCHOOL_SHORT, '[학교명 삭제]')
  }

  AGE.lastIndex = 0
  if (AGE.test(text)) {
    masked = true
    AGE.lastIndex = 0
    text = text.replace(AGE, '[나이 삭제]')
  }

  text = text.replace(GRADE_YEAR, (_m, band: string | undefined) => band ?? '')

  return { clean: text.replace(/[ \t]{2,}/g, ' ').trim(), masked }
}

// ============================================================================
// 3. 규칙 초안 — LLM 이 없어도 이것만으로 폼을 채울 수 있다
// ============================================================================

function ruleMessage(gradeBand: GradeBand | null, field: Field | null, times: string[]): string {
  return [
    '안녕하세요.',
    gradeBand ? `${BAND_CHILD[gradeBand]} 자녀를 둔 보호자입니다.` : '자녀 교육 때문에 문의드립니다.',
    field
      ? `아이가 ${field} 분야에 관심이 있어 계속 배울 수 있는 수업을 찾고 있습니다.`
      : '아이가 관심을 보이는 분야를 계속 배울 수 있는 수업을 찾고 있습니다.',
    times.length > 0 ? `참여할 수 있는 시간은 ${times.join('·')}입니다.` : null,
    '처음 배우는 아이도 따라갈 수 있는지, 수업 장소와 진행 방식, 준비물, 가능한 일정과 비용을 안내해 주시면 감사하겠습니다.',
  ]
    .filter((v): v is string => v !== null)
    .join(' ')
}

function noticesFor(masked: boolean): string[] {
  return [
    '초안입니다. 보내기 전에 내용을 직접 확인하고 고쳐 주세요.',
    ...(masked
      ? ['적어 주신 내용 중 아이를 알아볼 수 있는 부분(이름·학교·연락처·나이)은 빼고 정리했습니다.']
      : []),
    '아이 이름·학교·생년월일은 문의에 적지 않습니다. 학년대까지만 전달됩니다.',
    '이 칸에 적은 설명은 저장되지 않습니다. 접수되는 것은 아래 폼에 채워진 내용뿐입니다.',
  ]
}

export function ruleInquiryAssist(ds: Dataset, input: InquiryAssistInput): InquiryAssistDraft {
  const found = extractConditions(input.situation)
  // 글에 적힌 것이 가장 최근의 뜻이다. 글에 단서가 없을 때만 폼 선택을 쓴다.
  const gradeBand = found.gradeBand ?? input.gradeBand
  const field = found.field ?? input.field
  const { masked } = cleanSituation(input.situation)

  let matches: InquiryAssistMatch[] = []
  let stage: InquiryAssistDraft['stage'] = null
  let stageMessage: string | null = null

  if (field) {
    // 공개 디렉토리와 **같은 함수**다. 승인 강사만, 같은 시군구 → 인접 → 2-hop, 업체·구독 무관 정렬.
    const result = searchDirectory(ds, {
      regionCode: input.regionCode,
      field,
      gradeBand: gradeBand ?? undefined,
    })
    if (result.stage !== 'all') {
      stage = result.stage
      stageMessage = expansionMessage(input.regionCode, { stage: result.stage, codes: result.stageCodes })
    }
    matches = result.items.slice(0, MAX_MATCHES).map((card) => ({
      program_id: card.program.id,
      title: card.program.title,
      field: card.program.field,
      format: card.program.format,
      session_count: card.program.session_count,
      region_label: card.regionLabel,
      instructor_name: card.instructor.name,
      provider_name: card.provider?.name ?? null,
    }))
  }

  return {
    masked,
    grade_band: gradeBand,
    field,
    times: found.times,
    matches,
    stage,
    stage_message: stageMessage,
    message: ruleMessage(gradeBand, field, found.times),
    notices: noticesFor(masked),
    source: 'rule',
  }
}

// ============================================================================
// 4. LLM — 문의 글 한 편만
// ============================================================================

const SYSTEM = `너는 보호자가 지역 강사에게 보낼 수업 문의 글을 정리해 주는 도우미다.

입력은 두 가지다. 보호자_설명(아이를 알아볼 수 있는 부분은 이미 지워져 있다)과, 규칙이 정리한 조건(학년대·관심 분야·희망 시간대).

쓰는 것:
- message: 보호자 본인이 강사에게 보내는 문의 글. 존댓말, 300자 이내.
  아이가 무엇에 관심을 보였는지와, 강사에게 확인하고 싶은 점(수업 장소·진행 방식·준비물·일정과 비용 등)을 담는다.

지켜야 할 것:
- 보호자_설명과 조건에 없는 사실을 만들지 않는다. 조건이 비어 있으면 비어 있는 대로 쓴다.
- 숫자를 쓰지 않는다. 학년은 초등학생·중학생·고등학생까지만 쓴다. 분야 이름에 든 숫자는 그대로 둔다.
- 아이 이름·학교·나이·생년월일을 쓰지 않는다. [이름 삭제] 같은 표시를 옮기지 않는다.
- 연락처·링크·SNS를 쓰지 않는다. 연락처는 폼의 연락처 칸으로 따로 전달된다.
- 특정 강사·업체 이름을 쓰지 않는다. 과장하지 않는다.

출력은 JSON 하나만. 설명을 덧붙이지 않는다.
{"message":"..."}`

/** LLM 에 가는 값. 원문이 아니라 **가린 설명**과 규칙 조건뿐이다. 강사·프로그램 정보도 보내지 않는다. */
export function buildLlmPayload(input: InquiryAssistInput, draft: InquiryAssistDraft) {
  return {
    보호자_설명: cleanSituation(input.situation).clean,
    정리된_조건: {
      학년대: draft.grade_band ? BAND_CHILD[draft.grade_band] : null,
      관심_분야: draft.field,
      희망_시간대: draft.times,
    },
  }
}

const PLACEHOLDER = /\[(?:이름|학교명|연락처|이메일|링크|아이디|나이) 삭제\]/
const SCHOOL_SHORT_ONCE = new RegExp(SCHOOL_SHORT.source)

/**
 * LLM 응답에서 **문의 글 하나만** 읽는다. 연락처·링크·학교명·이름(`sanitizeText`), 숫자,
 * 가림 표시, 줄인 학교명 중 하나라도 걸리면 null — 호출자는 규칙 글을 쓴다.
 */
export function acceptLlmMessage(raw: unknown): string | null {
  if (typeof raw !== 'object' || raw === null) return null
  const message = sanitizeText((raw as Record<string, unknown>).message, INQUIRY_MESSAGE_MAX)
  if (message === null) return null
  if (!numbersWithin(message, [], FIELDS)) return null
  if (PLACEHOLDER.test(message)) return null
  if (SCHOOL_SHORT_ONCE.test(message)) return null
  return message
}

/** **어떤 경우에도 초안을 반환한다.** 예외를 던지지 않는다. */
export async function generateInquiryAssist(
  ds: Dataset,
  input: InquiryAssistInput,
): Promise<InquiryAssistDraft> {
  const draft = ruleInquiryAssist(ds, input)
  try {
    const payload = buildLlmPayload(input, draft)
    const meaningful = payload.보호자_설명.replace(PLACEHOLDER, '').replace(/\[[^\]]*삭제\]/g, '').trim()
    if (meaningful.length < MIN_CLEAN_LENGTH) return draft

    const raw = await callJsonLlm({
      system: SYSTEM,
      payload,
      maxTokens: 800,
      timeoutMs: 10_000,
      demo: demoInquiryMessage,
    })
    const message = acceptLlmMessage(raw)
    return message ? { ...draft, message, source: 'llm' } : draft
  } catch {
    return draft
  }
}
