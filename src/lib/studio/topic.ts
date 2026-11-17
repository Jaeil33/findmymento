/**
 * 주제 문자열 다듬기 — **캐릭터·상표 이름을 일반 형태로** (ADR-034).
 *
 * 조합이 생기면서 "피카츄 만들기"처럼 특정 캐릭터를 그대로 만들려는 요청이 들어온다.
 * 이 제품의 산출물은 **인쇄되어 교실로 들어가는 물건**이므로, 캐릭터 도안을 만들어 배포하면
 * 상표·저작권 문제가 플랫폼으로 온다.
 *
 * 그래서 거절하지 않고 **일반 형태로 바꾼다** — 강사의 입력을 버리면 다시 쓰지 않는다.
 * 바꿨다는 사실은 화면에 그대로 적는다 (없는 일처럼 넘기지 않는다).
 *
 * 이 목록은 **완전하지 않다.** 교실에서 자주 나오는 이름만 담은 1차 방어이고,
 * 2차 방어는 프롬프트(“캐릭터·상표 이름을 쓰지 않는다”)와 조각 목록 자체의 한계다 —
 * 검수된 조각으로는 특정 캐릭터를 재현할 수 없다.
 */

type Rule = { re: RegExp; to: string }

const RULES: Rule[] = [
  { re: /피카츄|피카추|파이리|꼬부기|이상해씨|포켓몬|포켓 몬스터/gi, to: '둥근 귀 동물' },
  { re: /뽀로로|펭수/gi, to: '펭귄' },
  { re: /도라에몽|짱구|코난/gi, to: '동물 친구' },
  { re: /엘사|올라프|디즈니|미키\s?마우스|미니\s?마우스/gi, to: '눈사람' },
  { re: /마리오|루이지|슈퍼\s?마리오/gi, to: '사람 모형' },
  { re: /헬로\s?키티|키티/gi, to: '고양이' },
  { re: /스파이더\s?맨|아이언\s?맨|마블|배트맨|슈퍼맨/gi, to: '사람 모형' },
  { re: /카카오\s?프렌즈|라이언|어피치|무지/gi, to: '동물 친구' },
  { re: /among\s?us|어몽어스|마인크래프트|minecraft|로블록스|roblox/gi, to: '사각 캐릭터' },
  { re: /산리오|쿠로미|시나모롤/gi, to: '동물 친구' },
]

export type GeneralizedTopic = {
  text: string
  /** 바꿨는가. 화면에 안내를 띄울지 판단한다 */
  replaced: boolean
  /** 화면에 그대로 보여주는 문구. 바꾸지 않았으면 null */
  note: string | null
}

export function generalizeCharacter(topic: string): GeneralizedTopic {
  let text = topic
  let replaced = false

  for (const rule of RULES) {
    if (rule.re.test(text)) {
      replaced = true
      text = text.replace(rule.re, rule.to)
    }
    rule.re.lastIndex = 0
  }

  // 치환 뒤 공백 정리. 빈 문자열이 되면 원문을 쓴다 — 주제 없는 생성은 만들지 않는다.
  text = text.replace(/\s+/g, ' ').trim()
  if (text === '') return { text: topic, replaced: false, note: null }

  return {
    text,
    replaced,
    note: replaced
      ? '특정 캐릭터 대신 일반 형태로 만들었습니다. 캐릭터 도안은 저작권 때문에 수업 배포용으로 만들지 않습니다.'
      : null,
  }
}
