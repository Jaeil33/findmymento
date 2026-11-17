/**
 * 조각(프리미티브) 라이브러리 — **조합이 쓸 수 있는 모양의 전부다** (ADR-034).
 *
 * 레시피 목록(`recipes.ts`)과 같은 지위다. LLM 은 주제를 보고 이 목록에서 조각을 고르고
 * **비율만** 제안한다. mm 와 좌표는 `compose.ts` 가 정하고, 판정은 기존 검증기가 한다.
 * 그래서 "물고기"·"토끼" 처럼 레시피에 없는 주제도 만들 수 있으면서,
 * 도안의 숫자는 여전히 결정론적 생성기가 만든다 (CLAUDE.md · ADR-029 의 경계를 그대로 지킨다).
 *
 * 조각을 더할 때 지켜야 하는 것 (`tests/studio-pen3d-pieces.test.ts` 가 검사한다):
 * - 윤곽은 닫는다. 열린 윤곽은 떼어낼 때 분해된다
 * - `COMPOSE_MIN_PIECE_MM` 에서도 **간격 4mm · 선분 8mm · 내각 40도**를 만족한다.
 *   그보다 작으면 개선 라운드가 도안을 키워도 그 조각이 들어간 조합은 영원히 실패한다
 * - 윤곽이 스스로 교차하지 않는다
 * - 가로 치수는 인자로 받은 값 그대로다. 조합이 mm 를 계산할 수 있어야 한다
 */

import { circlePoints, ellipsePoints, normalizeStrokes, rectPoints } from '@/lib/studio/geometry'
import type { Point, Stroke } from '@/types/studio'

export type PieceRole = 'body' | 'limb' | 'fin' | 'ear' | 'tail' | 'wing' | 'deco'

export type PenPiece = {
  id: string
  name: string
  summary: string
  /** 몸통(기준 조각)이 될 수 있는가 */
  can_be_base: boolean
  /** 어디에 쓰는 조각인가. 접합 문장과 LLM 설명에 쓴다 */
  role: PieceRole
  /** 세로/가로 비. `outline(w)` 의 높이는 `w * aspect` 다 */
  aspect: number
  /** 가로 `w` mm 짜리 윤곽. (0,0) 기준으로 정규화해 돌려준다 */
  outline: (w: number) => Stroke[]
}

const closed = (points: Point[]): Stroke => ({ kind: 'outline', points, closed: true })
const one = (points: Point[]): Stroke[] => normalizeStrokes([closed(points)])

/**
 * 물방울 — 아래는 둥글고 위는 한 점으로 모인다.
 *
 * 꼭짓점에서 원까지는 **접선 바깥쪽**(t = ±55도)에서 만나게 한다. 접점보다 위에서 이으면
 * 직선이 원을 파고들어 윤곽이 스스로 교차하고, 그런 선은 떼어낼 때 찢어진다.
 * 끝 각도는 약 70도로 남아 임계값(40도)에 걸리지 않는다.
 */
function teardrop(w: number, h: number): Point[] {
  const r = w / 2
  const cy = h - r
  const start = (-55 * Math.PI) / 180
  const sweep = (290 * Math.PI) / 180
  const divisions = 48

  const pts: Point[] = [{ x: r, y: 0 }]
  for (let i = 0; i <= divisions; i += 1) {
    const t = start + (sweep * i) / divisions
    pts.push({ x: r + r * Math.cos(t), y: cy + r * Math.sin(t) })
  }
  return pts
}

/** 사다리꼴 — 위가 좁다. 꼬리·지느러미에 쓴다. */
function trapezoid(w: number, h: number, topRatio: number): Point[] {
  const top = w * topRatio
  const inset = (w - top) / 2
  return [
    { x: 0, y: h },
    { x: inset, y: 0 },
    { x: inset + top, y: 0 },
    { x: w, y: h },
  ]
}

/** 이등변 삼각형. 꼭짓점 각도가 임계값 아래로 내려가지 않도록 높이를 제한해 쓴다. */
function isoTriangle(w: number, h: number): Point[] {
  return [
    { x: 0, y: h },
    { x: w / 2, y: 0 },
    { x: w, y: h },
  ]
}

/** 반원(둥근 귀·지느러미). 아래가 평평해 몸통에 붙이기 쉽다. */
function halfDisc(w: number): Point[] {
  const r = w / 2
  const pts: Point[] = []
  const divisions = 32
  for (let i = 0; i <= divisions; i += 1) {
    const t = Math.PI + (i * Math.PI) / divisions
    pts.push({ x: r + r * Math.cos(t), y: r + r * Math.sin(t) })
  }
  return pts
}

/** 고리(도넛). 두께가 곧 선 간격이므로 6mm 아래로 내려가지 않게 한다. */
function ringStrokes(w: number): Stroke[] {
  const outer = w / 2
  const thickness = Math.max(6, w * 0.26)
  return normalizeStrokes([
    closed(circlePoints(outer, 48)),
    closed(circlePoints(Math.max(outer - thickness, outer * 0.2), 48)),
  ])
}

export const PEN_PIECES: readonly PenPiece[] = [
  {
    id: 'oval-body',
    name: '타원 몸통',
    summary: '둥근 몸통. 물고기·새·동물의 가운데 조각으로 쓴다.',
    can_be_base: true,
    role: 'body',
    aspect: 0.68,
    outline: (w) => one(ellipsePoints(w, w * 0.68)),
  },
  {
    id: 'round-body',
    name: '원 몸통',
    summary: '완전히 둥근 몸통. 얼굴·해·공 모양에 쓴다.',
    can_be_base: true,
    role: 'body',
    aspect: 1,
    outline: (w) => one(circlePoints(w / 2, 48)),
  },
  {
    id: 'box-body',
    name: '사각 몸통',
    summary: '네모난 몸통. 건물·가방·로봇 몸통에 쓴다.',
    can_be_base: true,
    role: 'body',
    aspect: 0.85,
    outline: (w) => one(rectPoints(w, w * 0.85)),
  },
  {
    id: 'drop-body',
    name: '물방울 몸통',
    summary: '아래가 둥글고 위가 모이는 몸통. 잎·불꽃·새 머리에 쓴다.',
    can_be_base: true,
    role: 'body',
    aspect: 1.25,
    outline: (w) => one(teardrop(w, w * 1.25)),
  },
  {
    id: 'fin-triangle',
    name: '삼각 지느러미',
    summary: '물고기 지느러미, 새 부리, 지붕에 쓴다.',
    can_be_base: false,
    role: 'fin',
    aspect: 0.8,
    outline: (w) => one(isoTriangle(w, w * 0.8)),
  },
  {
    id: 'tail-trapezoid',
    name: '사다리꼴 꼬리',
    summary: '물고기 꼬리, 치마, 받침에 쓴다.',
    can_be_base: false,
    role: 'tail',
    aspect: 0.75,
    outline: (w) => one(trapezoid(w, w * 0.75, 0.6)),
  },
  {
    id: 'ear-round',
    name: '둥근 귀',
    summary: '반원 조각. 동물 귀·구름·발에 쓴다.',
    can_be_base: false,
    role: 'ear',
    aspect: 0.5,
    outline: (w) => one(halfDisc(w)),
  },
  {
    id: 'ear-pointed',
    name: '뾰족 귀',
    summary: '길쭉한 삼각 조각. 토끼·고양이 귀, 뿔에 쓴다.',
    can_be_base: false,
    role: 'ear',
    aspect: 1.1,
    outline: (w) => one(isoTriangle(w, w * 1.1)),
  },
  {
    id: 'limb-bar',
    name: '팔다리 막대',
    summary: '모서리를 자른 긴 조각. 팔·다리·줄기·기둥에 쓴다.',
    can_be_base: false,
    role: 'limb',
    aspect: 2.2,
    outline: (w) => one(rectPoints(w, w * 2.2)),
  },
  {
    id: 'wing-drop',
    name: '날개',
    summary: '한쪽이 둥근 날개 조각. 새·나비·비행기에 쓴다.',
    can_be_base: false,
    role: 'wing',
    aspect: 0.62,
    outline: (w) => one(ellipsePoints(w, w * 0.62)),
  },
  {
    id: 'plate-rect',
    name: '받침판',
    summary: '납작한 네모 판. 바닥·명패·벽에 쓴다.',
    can_be_base: true,
    role: 'deco',
    aspect: 0.6,
    outline: (w) => one(rectPoints(w, w * 0.6)),
  },
  {
    id: 'ring-hoop',
    name: '고리',
    summary: '가운데가 뚫린 고리. 열쇠고리·바퀴·테두리에 쓴다.',
    can_be_base: false,
    role: 'deco',
    aspect: 1,
    outline: (w) => ringStrokes(w),
  },
]

export function pieceById(id: string): PenPiece | null {
  return PEN_PIECES.find((p) => p.id === id) ?? null
}
