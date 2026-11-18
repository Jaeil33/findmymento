/**
 * 팔레트 — **색 이름에서 hex 로 가는 유일한 길** (ADR-039).
 *
 * LLM 이 돌려줄 수 있는 것은 `PALETTE_NAMES` 안의 **이름**뿐이고, hex 는 이 파일이 정한다.
 * 모델에게 `#ff8a3d` 를 받으면 채도가 튀는 색이 섞여 들어오고, 그런 색이 한 장에 네 개
 * 모이면 "세련됨" 이 무너진다. 이름만 받으면 **사람이 한 번 고른 24색 안에서만** 섞인다.
 *
 * ADR-013·027·034·036 과 같은 경계다 — 모델은 목록 안에서 고르고, 숫자는 코드가 쥔다.
 *
 * 색 값을 고른 기준:
 * - 3D펜 PLA 필라멘트로 실제로 구할 수 있는 색의 범위 안에 둔다. 도안의 색은 "이 색 필라멘트를
 *   꽂아라" 는 뜻이기도 하므로, 살 수 없는 색을 칠하면 도안이 거짓말을 한다.
 * - 명도를 두 덩어리로 가른다(진한 색 / 연한 색). 같은 명도끼리만 모이면 그림이 납작해진다.
 * - 흰색·크림은 종이와 구별되도록 **윤곽선이 있을 때만** 쓸 수 있다. `fillFor` 가 그 판정을 한다.
 */

import { PALETTE_NAMES, type PaletteName } from '@/types/studio'

/** 이름 → hex. `PALETTE_NAMES` 와 **키가 정확히 일치해야 한다** (아래 타입이 강제한다) */
export const PALETTE: Readonly<Record<PaletteName, string>> = {
  검정: '#1a1a1a',
  진회색: '#444a52',
  회색: '#7d858f',
  연회색: '#b9c0c8',
  흰색: '#fdfdfd',
  빨강: '#d8322f',
  주황: '#ef7c2a',
  노랑: '#f2c230',
  연두: '#8dc63f',
  초록: '#3f9e54',
  청록: '#2aa79b',
  하늘: '#5bb7e6',
  파랑: '#2f6fc4',
  남색: '#2a3f7a',
  보라: '#7b5ea7',
  분홍: '#ef96b4',
  자주: '#a93b6b',
  갈색: '#8a5a37',
  황토: '#c08b4a',
  베이지: '#e0cfae',
  살색: '#f2cdae',
  크림: '#f7efd9',
  민트: '#9fd9c7',
  금색: '#c9a227',
}

/** 목록 밖의 이름이 왔을 때 떨어지는 색. 회색이라 "정하지 못했다" 가 눈에 보인다 */
export const DEFAULT_COLOR: PaletteName = '회색'

/** 종이와 구별되지 않아 윤곽선 없이는 쓸 수 없는 색 */
const NEAR_WHITE: readonly PaletteName[] = ['흰색', '크림']

/**
 * 모델이 준 이름을 팔레트 이름으로 **스냅한다.** 목록 안이면 그대로, 밖이면 기본색이다.
 *
 * 공백·조사를 떼고 맞추므로 "진한 초록" · "초록색" 이 `초록` 으로 들어온다. 영어 이름도
 * 흔히 오므로 같이 받는다 — 받아주지 않으면 그 영역이 통째로 회색이 되고, 그건 네 번째
 * 라운드에서 고치게 되는 종류의 손실이다.
 */
export function snapColor(raw: unknown): PaletteName {
  if (typeof raw !== 'string') return DEFAULT_COLOR
  const text = raw.toLowerCase().replace(/[\s·,.\-_]/g, '').replace(/색$/, '')
  if (text === '') return DEFAULT_COLOR

  for (const name of PALETTE_NAMES) {
    const key = name.replace(/색$/, '')
    if (text === key || text === name || text.includes(key)) return name
  }

  const english = EN_TO_NAME[text]
  if (english) return english

  return DEFAULT_COLOR
}

/** 영어 이름 — 모델이 자주 섞어 쓴다. 팔레트를 늘리지 않고 **이름만** 더한다 */
const EN_TO_NAME: Readonly<Record<string, PaletteName>> = {
  black: '검정',
  darkgray: '진회색',
  darkgrey: '진회색',
  gray: '회색',
  grey: '회색',
  lightgray: '연회색',
  lightgrey: '연회색',
  white: '흰색',
  red: '빨강',
  orange: '주황',
  yellow: '노랑',
  lime: '연두',
  green: '초록',
  teal: '청록',
  skyblue: '하늘',
  lightblue: '하늘',
  blue: '파랑',
  navy: '남색',
  purple: '보라',
  violet: '보라',
  pink: '분홍',
  magenta: '자주',
  brown: '갈색',
  tan: '황토',
  beige: '베이지',
  skin: '살색',
  cream: '크림',
  mint: '민트',
  gold: '금색',
}

/** 그 색의 hex. 이름이 목록 밖이면 기본색의 hex다 */
export function hexFor(name: PaletteName): string {
  return PALETTE[name] ?? PALETTE[DEFAULT_COLOR]
}

/** 종이와 구별되지 않는 색인가 — 렌더가 이 색에 얇은 경계선을 둘러야 하는지 정한다 */
export function needsEdge(name: PaletteName): boolean {
  return NEAR_WHITE.includes(name)
}
