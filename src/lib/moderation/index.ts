/**
 * 연락처·외부링크·이름 마스킹 필터.
 *
 * E-08(학생이 자유서술에 이름·연락처를 썼다), E-09(Q&A 연락처),
 * E-10(강사가 답변에 자기 번호를 썼다), E-22(보호자가 문의에 아이 실명·학교를 적었다)가
 * 전부 이 모듈 하나를 재사용한다. 같은 규칙이 네 곳에서 달라지면 가장 약한 곳이 뚫린다.
 *
 * 두 가지 모드가 있다.
 * - `mask`  : 저장 전에 지운다. **원문을 남기지 않는다.** 설문 자유서술·보호자 문의 내용.
 * - `block` : 작성 자체를 거부한다. Q&A 질문·답변 — 외부 직거래 이탈 경로를 막는 목적도 있다.
 *
 * 차단 안내는 짧게 한 줄만 돌려준다. 규칙 상세를 알려주면 우회 방법을 알려주는 것과 같다 (E-09).
 */

export type Finding = 'phone' | 'email' | 'url' | 'messenger' | 'school' | 'name'

export type ModerationResult = {
  /** 마스킹이 끝난 텍스트. 저장·LLM 전송에는 항상 이 값만 쓴다. */
  clean: string
  findings: Finding[]
  /** block 모드에서 차단 대상이 발견됐는지. */
  blocked: boolean
  /** 사용자에게 보여줄 한 줄. 규칙 상세를 적지 않는다. */
  message: string | null
}

const PLACEHOLDER: Record<Finding, string> = {
  phone: '[연락처 삭제]',
  email: '[이메일 삭제]',
  url: '[링크 삭제]',
  messenger: '[아이디 삭제]',
  school: '[학교명 삭제]',
  name: '[이름 삭제]',
}

/** 차단 대상 — 연락처와 외부 링크. 학교명·이름은 차단이 아니라 마스킹으로 처리한다. */
const BLOCKING: Finding[] = ['phone', 'email', 'url', 'messenger']

const RULES: { finding: Finding; re: RegExp }[] = [
  // 이메일이 전화번호보다 먼저다 — 숫자로 시작하는 주소가 전화번호로 먹히면 @ 뒤가 남는다.
  { finding: 'email', re: /[\w.+-]{2,}\s*(?:@|＠|\[?골뱅이\]?)\s*[\w-]{2,}\s*(?:\.|\[?점\]?)\s*[A-Za-z]{2,}(?:\.[A-Za-z]{2,})?/g },
  // http/https, www, 그리고 맨눈에 링크로 보이는 도메인
  { finding: 'url', re: /(?:https?:\/\/|www\.)\S+/gi },
  {
    finding: 'url',
    re: /\b[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.(?:com|net|org|io|me|kr|co\.kr|ne\.kr|or\.kr|gg|ly|shop|site|link|xyz|app)\b(?:\/\S*)?/gi,
  },
  // 휴대폰 — 구분자를 바꿔 적거나 공백을 넣은 형태까지 잡는다
  { finding: 'phone', re: /(?:\+?82[\s.\-]?)?0?1[016789][\s.\-]?\d{3,4}[\s.\-]?\d{4}/g },
  // 일반 전화 / 구분자가 있는 번호
  { finding: 'phone', re: /\b0\d{1,2}[\s.\-]\d{3,4}[\s.\-]\d{4}\b/g },
  // 숫자를 한글로 적은 우회
  { finding: 'phone', re: /(?:공|영|일|이|삼|사|오|육|칠|팔|구){9,}/g },
  // 메신저·SNS 아이디 유도
  {
    finding: 'messenger',
    re: /(카카오톡|카톡|오픈\s?채팅|오픈\s?카톡|인스타\s?그?램?|insta(?:gram)?|텔레\s?그램|telegram|디스코드|discord|라인\s?아이디|페이스북|틱톡|tiktok|디엠|\bDM\b)/gi,
  },
  { finding: 'messenger', re: /@[A-Za-z0-9._]{3,30}/g },
  // 학교명 — 보호자·학생이 아이를 특정할 수 있는 가장 흔한 정보다
  { finding: 'school', re: /[가-힣]{2,8}(?:초등학교|중학교|고등학교|여자중학교|여자고등학교|여중|여고)/g },
  // 이름 — 소개 어구가 붙은 경우만. 어구 없이 2~4글자 한글을 지우면 본문이 전부 날아간다.
  {
    finding: 'name',
    re: /(이름(?:은|이|:)?|저는|제\s?이름은|내\s?이름은)\s*([가-힣]{2,4})(?=\s|이고|이에요|예요|입니다|이야|야|,|\.|$)/g,
  },
]

export function moderate(
  input: string | null | undefined,
  mode: 'mask' | 'block' = 'mask',
): ModerationResult {
  const original = (input ?? '').toString()
  if (original.trim() === '') {
    return { clean: '', findings: [], blocked: false, message: null }
  }

  let text = original
  const findings = new Set<Finding>()

  for (const { finding, re } of RULES) {
    // 정규식에 g 플래그가 있으므로 매 호출마다 lastIndex 를 초기화한다.
    re.lastIndex = 0
    if (!re.test(text)) continue
    findings.add(finding)
    re.lastIndex = 0
    text =
      finding === 'name'
        ? text.replace(re, (_m, cue: string) => `${cue} ${PLACEHOLDER.name}`)
        : text.replace(re, PLACEHOLDER[finding])
  }

  const list = [...findings]
  const blocked = mode === 'block' && list.some((f) => BLOCKING.includes(f))

  return {
    clean: text.replace(/[ \t]{2,}/g, ' ').trim(),
    findings: list,
    blocked,
    message: blocked
      ? '연락처나 외부 링크는 올릴 수 없어요. 질문 내용만 남겨 주세요.'
      : list.length > 0
        ? '개인정보로 보이는 부분은 저장하지 않고 가렸어요.'
        : null,
  }
}

/** 저장용 헬퍼. 반드시 이 함수를 거친 값만 DB 에 넣는다. */
export function maskForStorage(input: string | null | undefined): string | null {
  const r = moderate(input, 'mask')
  return r.clean === '' ? null : r.clean
}

/**
 * 학생 표시 이름. 가명코드 원문을 화면에 노출하지 않는다 (UI_GUIDE 안전규칙 2).
 * `중2 학생 A` 형태.
 */
export function studentAlias(gradeLabel: string, ordinal: number): string {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  const n = Math.max(0, ordinal)
  const suffix =
    n < letters.length
      ? letters[n]
      : `${letters[Math.floor(n / letters.length) - 1] ?? 'Z'}${letters[n % letters.length]}`
  return `${gradeLabel} 학생 ${suffix}`
}
