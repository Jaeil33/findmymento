/**
 * 폴백 사슬의 **바닥** — 2D 는 빈손으로 끝나지 않는다 (ADR-042).
 *
 * 지금까지 모양 경로의 마지막은 `failed` 였다. 코퍼스에 없고 모델 제안도 읽히지 않으면
 * 강사는 실패 화면을 받았고, 그 화면에 "더 일반적인 단어로 적어 보세요" 가 적혀 있었다.
 * **강사에게 단어를 고쳐 오라고 하는 것은 제품이 할 일을 강사에게 떠넘기는 것이다.**
 *
 * 그래서 바닥을 깐다: 단어를 적은 **명패**. 둥근 네모 한 장과 고리 하나이고, 색은 단어에서
 * 결정론적으로 고른다. 요청한 모양은 아니지만 **인쇄해서 수업은 된다** — 학생은 선을 따라
 * 그려 떼어내고 거기에 자기 무늬를 넣는다.
 *
 * 세 가지를 반드시 지킨다:
 *   ① 물리 임계값을 면제하지 않는다. 명패도 간격·선분·내각·시간 검사를 그대로 받는다
 *   ② 바닥으로 내려갔다는 사실을 **화면에 적는다** — 요청한 모양이 나온 것처럼 보이지 않게
 *   ③ 차단이 아니라 고지다. 입력을 버리거나 바꾸지 않는다 (ADR-042 와 같은 성격)
 *
 * 결정론이다 — 같은 단어는 항상 같은 명패다. 색이 매번 바뀌면 강사는 생성 버튼을 다시 누르고,
 * 그건 우리가 의도한 동작이 아니다.
 */

import { PALETTE_NAMES, type ArtRegion, type NormPoint, type PaletteName, type PenShape } from '@/types/studio'

/** 모서리를 둥글리는 정도 (가로 대비). 직각이면 꼭짓점에 덩어리가 생긴다 */
const CORNER = 0.14

/** 둥근 모서리를 몇 점으로 그리는가. 선분 길이 하한을 지키려면 과하게 촘촘하면 안 된다 */
const CORNER_STEPS = 4

/** 명패의 세로/가로 비. 이름이 들어가는 칸이라 가로로 길다 */
const ASPECT = 0.62

/**
 * 단어에서 색을 고른다. 같은 단어면 항상 같은 색이다.
 *
 * 흰색·크림은 제외한다 — 종이와 구별되지 않아 색을 칠한 의미가 없다. 검정·진회색도 제외한다:
 * 덧그릴 선이 검정이라 선이 색에 묻힌다.
 */
export function fallbackColor(word: string): PaletteName {
  const usable = PALETTE_NAMES.filter(
    (name) => !['흰색', '크림', '검정', '진회색', '연회색'].includes(name),
  )
  let hash = 2166136261
  for (const ch of word.trim()) {
    hash ^= ch.codePointAt(0) ?? 0
    hash = Math.imul(hash, 16777619)
  }
  return usable[Math.abs(hash) % usable.length]!
}

/** 둥근 네모의 정규화 윤곽. x 는 0~1, y 는 0~`ASPECT` */
function plateOutline(): NormPoint[] {
  const r = CORNER * ASPECT
  const points: NormPoint[] = []

  /** 모서리 하나를 호로 돈다 */
  const corner = (cx: number, cy: number, from: number) => {
    for (let i = 0; i <= CORNER_STEPS; i += 1) {
      const t = from + (Math.PI / 2) * (i / CORNER_STEPS)
      points.push({ x: cx + Math.cos(t) * r, y: cy + Math.sin(t) * r })
    }
  }

  corner(1 - r, r, -Math.PI / 2) // 오른쪽 위
  corner(1 - r, ASPECT - r, 0) // 오른쪽 아래
  corner(r, ASPECT - r, Math.PI / 2) // 왼쪽 아래
  corner(r, r, Math.PI) // 왼쪽 위
  return points
}

/**
 * 바닥 모양을 만든다. **요청한 단어를 제목으로 쓴다** — 라벨에 그 단어가 인쇄되므로,
 * 학생은 자기가 무엇을 만드는지 종이에서 읽는다.
 */
export function fallbackShape(word: string): PenShape {
  const trimmed = word.trim() || '이름판'
  const outline = plateOutline()
  const color = fallbackColor(trimmed)

  /**
   * 색 영역은 명패 **안쪽**이다. 윤곽과 같은 자리에 깔면 덧그릴 선이 색 경계와 겹쳐
   * 어느 선을 그어야 하는지 알 수 없게 된다. 안으로 들여서 테두리를 남긴다.
   */
  const inset = 0.06
  const inner: NormPoint[] = outline.map((p) => ({
    x: inset + p.x * (1 - inset * 2),
    y: inset * ASPECT + p.y * (1 - inset * 2),
  }))

  const art: ArtRegion[] = [
    { outline: { points: inner, closed: true }, holes: [], color, z: 0 },
  ]

  return {
    id: `fallback-${trimmed.replace(/\s+/g, '-')}`,
    word: trimmed,
    title: trimmed,
    words: [trimmed],
    silhouette: { points: outline, closed: true },
    details: [],
    holes: [],
    // 명패는 걸 수 있어야 쓸모가 있다. 고리는 코드가 붙인다 (`shapeRecipe`).
    hanger: true,
    aspect: ASPECT,
    art,
    source: 'dsl',
    // **검수된 모양이 아니다.** 사람이 그 단어를 보고 그린 것이 아니므로 false 다.
    reviewed: false,
  }
}
