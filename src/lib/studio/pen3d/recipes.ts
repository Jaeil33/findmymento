/**
 * 3D펜 도안 레시피. **좌표를 만드는 유일한 주체다** (ADR-029).
 *
 * 각 레시피는 파라미터 하나 묶음(`PenRecipeParams`)을 받아 부품과 접합을 결정론적으로 만든다.
 * LLM 은 이 목록에서 **고르기만** 한다 — 목록 밖의 모양은 존재할 수 없고, 그래서 모든 산출물이
 * 검증 가능하다.
 *
 * 새 레시피를 더할 때 지켜야 하는 것:
 * - 부품 좌표는 `normalizeStrokes` 로 (0,0) 기준으로 맞춘다. 배치가 bbox 를 쓴다
 * - 윤곽선은 반드시 닫는다 (`closed: true`). 열린 윤곽은 떼어낼 때 분해된다
 * - 모든 부품이 접합에 한 번은 등장해야 한다. 조립되지 않는 부품은 쓰레기다
 * - 고리·슬릿의 폭은 **학년 최소 간격보다 크게** 잡는다. 좁으면 녹아 붙는다
 * - **치수에 비례하지 않는 고정 값은 가장 빡빡한 임계값(간격 4mm · 선분 8mm) 이상으로 둔다.**
 *   그보다 작으면 개선 라운드가 도안을 키워도 그 값은 그대로여서 레시피가 영구 실패한다.
 *   `tests/studio-pen3d-recipes.test.ts` 가 size_range 최솟값에서 이걸 검사한다
 */

import {
  circlePoints,
  ellipsePoints,
  normalizeStrokes,
  rectPoints,
  regularPolygon,
  trianglePoints,
} from '@/lib/studio/geometry'
import type { GradeBand } from '@/types/domain'
import type { PenJoint, PenPart, PenPattern, Point, Stroke } from '@/types/studio'

export type PenRecipeParams = {
  /** 기준 치수 (mm). 레시피마다 의미가 다르다 — 한 변 또는 반지름 */
  size: number
  /** 장식 단계. 0 이면 윤곽만, 1 이상이면 안쪽 선·추가 꽃잎이 붙는다 */
  detail: number
  /** 선택 부품(뚜껑·잎)을 포함하는가. 시간이 초과되면 먼저 떨어진다 */
  extras: boolean
}

export type PenRecipe = {
  id: string
  title: string
  summary: string
  /** 주제 매칭 키워드. 규칙이 후보를 좁히는 데만 쓴다 */
  keywords: readonly string[]
  defaults: PenRecipeParams
  /** size 허용 범위 — 개선 라운드가 이 안에서만 조정한다 */
  size_range: [number, number]
  nominal_difficulty: number
  build: (params: PenRecipeParams) => { parts: PenPart[]; joints: PenJoint[] }
}

// ============================================================================
// 부품 조립 도우미
// ============================================================================

const outline = (points: Point[]): Stroke => ({ kind: 'outline', points, closed: true })

function part(
  id: string,
  name: string,
  quantity: number,
  strokes: Stroke[],
  optional = false,
): PenPart {
  return {
    id,
    name,
    quantity,
    strokes: normalizeStrokes(strokes),
    origin: { x: 0, y: 0 },
    optional,
  }
}

function weld(
  id: string,
  a: string,
  b: string,
  count: number,
  length_mm: number,
  flush: boolean,
  how: string,
): PenJoint {
  return { id, kind: 'weld', a, b, count, length_mm: Math.round(length_mm * 10) / 10, flush, how }
}

/** 고리(도넛) — 바깥 원과 안쪽 원 두 줄. 두께가 곧 선 간격이다. */
function ring(outerRadius: number, thickness: number): Stroke[] {
  return [outline(circlePoints(outerRadius, 48)), outline(circlePoints(outerRadius - thickness, 48))]
}

/**
 * 원판 + 가운데까지 들어간 슬릿. 같은 원판 둘을 십자로 끼워 입체를 만든다.
 *
 * 슬릿 폭은 두 조건을 **동시에** 만족해야 한다 — 끼울 원판의 두께 + 여유(0.3~1.2mm)이고,
 * 학년 최소 선 간격보다 넓어야 한다. 그래서 끼우는 쪽을 3겹으로 덧그려 3mm 로 만들고
 * 슬릿은 4.1mm 로 잡는다.
 *
 * 슬릿 끝은 **반원으로 둥글린다.** 네모로 막으면 바닥에 4mm 짜리 짧은 선이 하나 생기고,
 * 그게 중등 최소 선분 길이(6mm)에 걸려 레시피 전체가 실패한다. 둥근 끝은 벽과 접선이 이어져
 * 사람이 한 번에 긋는 하나의 선이 된다 — 실제로 그리기도 쉽고 더 튼튼하다.
 */
function slittedDisc(radius: number, slitWidth: number): Stroke[] {
  const hw = slitWidth / 2
  const yEdge = Math.sqrt(Math.max(radius * radius - hw * hw, 1))
  // 오른쪽 벽: 원 테두리에서 슬릿 끝(반원 시작)까지.
  const pts: Point[] = [
    { x: hw, y: yEdge },
    { x: hw, y: hw },
  ]
  // 슬릿 끝 반원 — 중심 (0, hw), 반지름 hw. 가장 깊은 점이 원판 중심 (0,0) 이다.
  const bottomDivisions = 16
  for (let i = 1; i < bottomDivisions; i += 1) {
    const t = (i * Math.PI) / bottomDivisions
    pts.push({ x: hw * Math.cos(t), y: hw - hw * Math.sin(t) })
  }
  pts.push({ x: -hw, y: hw })
  pts.push({ x: -hw, y: yEdge })
  // 큰 원호: 슬릿 왼쪽 끝에서 한 바퀴 돌아 오른쪽 끝으로 돌아온다.
  const startAngle = Math.atan2(yEdge, -hw)
  const endAngle = Math.atan2(yEdge, hw) + 2 * Math.PI
  const divisions = 44
  for (let i = 1; i < divisions; i += 1) {
    const t = startAngle + ((endAngle - startAngle) * i) / divisions
    pts.push({ x: radius * Math.cos(t), y: radius * Math.sin(t) })
  }
  return [outline(pts)]
}

// ============================================================================
// 레시피
// ============================================================================

const cubeLantern: PenRecipe = {
  id: 'cube-lantern',
  title: '정육면체 조명 갓',
  summary: '정사각 패널 6장을 모서리끼리 붙여 정육면체를 만든다. 안에 LED 티라이트를 넣으면 조명이 된다.',
  keywords: ['조명', '램프', '등갓', '정육면체', '큐브', '상자'],
  defaults: { size: 45, detail: 1, extras: false },
  size_range: [28, 70],
  nominal_difficulty: 2,
  build: ({ size, detail }) => {
    const strokes = [outline(rectPoints(size, size))]
    if (detail >= 1) {
      // 안쪽 창. 테두리 폭이 선 간격이 되므로 한 변의 25% 로 넉넉히 둔다.
      const inset = size * 0.25
      strokes.push(outline(rectPoints(size - inset * 2, size - inset * 2).map((p) => ({
        x: p.x + inset,
        y: p.y + inset,
      }))))
    }
    return {
      parts: [part('panel', '정사각 패널', 6, strokes)],
      joints: [
        weld(
          'panel-edges',
          'panel',
          'panel',
          12,
          size,
          true,
          '패널 두 장을 직각으로 세우고 맞닿은 변을 펜으로 녹여 붙입니다. 모서리 12곳을 같은 방법으로 잇습니다.',
        ),
      ],
    }
  },
}

const pyramidLamp: PenRecipe = {
  id: 'pyramid-lamp',
  title: '사각뿔 등',
  summary: '정사각 밑면 1장과 이등변 삼각형 4장으로 사각뿔을 만든다. 밑면을 빼면 갓이 된다.',
  keywords: ['피라미드', '사각뿔', '삼각형', '텐트', '고깔'],
  defaults: { size: 60, detail: 0, extras: true },
  size_range: [35, 90],
  nominal_difficulty: 2,
  build: ({ size, extras }) => {
    const height = size * 0.9
    const slant = Math.hypot(size / 2, height)
    const parts = [part('side', '삼각 면', 4, [outline(trianglePoints(size, height))])]
    const joints: PenJoint[] = [
      weld(
        'side-side',
        'side',
        'side',
        4,
        slant,
        true,
        '삼각 면 두 장의 비스듬한 변을 맞대고 위에서 아래로 녹여 붙입니다. 네 곳을 이으면 뿔이 섭니다.',
      ),
    ]
    if (extras) {
      parts.push(part('base', '정사각 밑면', 1, [outline(rectPoints(size, size))], true))
      joints.push(
        weld(
          'base-side',
          'base',
          'side',
          4,
          size,
          true,
          '밑면의 네 변에 삼각 면의 밑변을 각각 맞대어 붙입니다.',
        ),
      )
    }
    return { parts, joints }
  },
}

const houseLamp: PenRecipe = {
  id: 'house-lamp',
  title: '우리 동네 집 모형',
  summary: '측면 벽 2장, 앞뒤 벽(오각형) 2장, 지붕 2장으로 집을 만든다. 창문 선을 더하면 건물 모형이 된다.',
  keywords: ['집', '건물', '마을', '동네', '랜드마크', '타워', '학교', '가게', '지붕'],
  defaults: { size: 50, detail: 1, extras: false },
  size_range: [32, 80],
  nominal_difficulty: 2,
  build: ({ size, detail }) => {
    const wallH = size * 0.8
    const depth = size * 0.7
    const rise = size * 0.36
    const slant = Math.hypot(size / 2, rise)

    const gable: Point[] = [
      { x: 0, y: rise },
      { x: size / 2, y: 0 },
      { x: size, y: rise },
      { x: size, y: rise + wallH },
      { x: 0, y: rise + wallH },
    ]

    const sideStrokes = [outline(rectPoints(depth, wallH))]
    if (detail >= 1) {
      // 창문 — 벽 가운데에 사각형 하나. 벽 테두리와 25% 이상 떨어뜨린다.
      const w = depth * 0.4
      const h = wallH * 0.35
      const x = (depth - w) / 2
      const y = (wallH - h) / 2
      sideStrokes.push(outline(rectPoints(w, h).map((p) => ({ x: p.x + x, y: p.y + y }))))
    }

    // 앞뒤 벽의 문. 집을 "네모 몇 장"이 아니라 집으로 보이게 하는 선이다.
    // 치수는 전부 size 에 비례한다 — 개선 라운드가 도안을 키우면 여백도 같이 커진다.
    const gableStrokes = [outline(gable)]
    if (detail >= 1) {
      const dw = size * 0.3
      const dh = wallH * 0.5
      const dx = (size - dw) / 2
      // 바닥에서 띄운다. 벽 윤곽에 닿으면 떼어낼 때 문이 뚫린 구멍이 된다.
      const dy = rise + wallH - dh - size * 0.18
      gableStrokes.push(outline(rectPoints(dw, dh).map((p) => ({ x: p.x + dx, y: p.y + dy }))))
    }

    return {
      parts: [
        part('wall', '측면 벽', 2, sideStrokes),
        part('gable', '앞뒤 벽 (오각형)', 2, gableStrokes),
        part('roof', '지붕', 2, [outline(rectPoints(size, slant))]),
      ],
      joints: [
        weld(
          'wall-gable',
          'wall',
          'gable',
          4,
          wallH,
          true,
          '측면 벽의 세로 변을 앞뒤 벽의 세로 변에 직각으로 맞대어 붙입니다. 네 곳을 이으면 상자가 됩니다.',
        ),
        weld(
          'roof-gable',
          'roof',
          'gable',
          4,
          slant,
          true,
          '지붕의 긴 변이 아래로 가게 놓고, 앞뒤 벽의 비스듬한 변에 맞대어 붙입니다.',
        ),
        weld(
          'roof-roof',
          'roof',
          'roof',
          1,
          size,
          true,
          '지붕 두 장의 위쪽 긴 변을 서로 맞대어 용마루를 붙입니다.',
        ),
      ],
    }
  },
}

const nameKeyring: PenRecipe = {
  id: 'name-keyring',
  title: '이름 키링',
  summary: '이름을 쓸 판 1장과 고리 1개. 판 안쪽에 자기 이름을 펜으로 직접 그린다.',
  keywords: ['키링', '이름', '열쇠고리', '명찰', '뱃지', '선물'],
  defaults: { size: 70, detail: 1, extras: false },
  size_range: [45, 110],
  nominal_difficulty: 1,
  build: ({ size, detail }) => {
    const h = size * 0.4
    const plateStrokes = [outline(rectPoints(size, h))]
    if (detail >= 1) {
      // 이름 쓸 자리. 테두리에서 띄운 폭이 곧 선 간격이므로 최소 치수에서도 4.5mm 이상 둔다.
      const inset = Math.max(4.5, size * 0.09)
      plateStrokes.push(
        outline(
          rectPoints(size - inset * 2, h - inset * 2).map((p) => ({
            x: p.x + inset,
            y: p.y + inset,
          })),
        ),
      )
    }
    return {
      parts: [
        part('plate', '이름판', 1, plateStrokes),
        // 바깥 반지름이 9mm 아래로 내려가면 두께 5mm 를 빼고 남는 구멍이 사라진다.
        part('hoop', '고리', 1, ring(Math.max(9, size * 0.13), 5)),
      ],
      joints: [
        weld(
          'plate-hoop',
          'plate',
          'hoop',
          1,
          10,
          false,
          '고리를 이름판 짧은 변 가운데에 세워 대고 맞닿은 부분을 녹여 붙입니다.',
        ),
      ],
    }
  },
}

const flowerPot: PenRecipe = {
  id: 'flower-pot',
  title: '꽃 한 송이',
  summary: '꽃잎 5장과 줄기, 잎으로 꽃을 만든다. 꽃잎 수를 늘리면 더 풍성해진다.',
  keywords: ['꽃', '식물', '봄', '선물', '화분', '잎', '자연'],
  defaults: { size: 35, detail: 0, extras: true },
  size_range: [22, 55],
  nominal_difficulty: 2,
  build: ({ size, detail, extras }) => {
    const petals = detail >= 1 ? 7 : 5
    const parts = [
      part('petal', '꽃잎', petals, [outline(ellipsePoints(size * 0.52, size))]),
      // 줄기 폭은 8.5mm 아래로 내려가지 않는다. 6mm 로 두면 초등 선분 하한(8mm)에 걸리고,
      // 치수를 키워도 이 값은 그대로여서 개선이 통하지 않는다.
      part('stem', '줄기', 1, [outline(rectPoints(Math.max(8.5, size * 0.34), size * 1.7))]),
    ]
    const joints: PenJoint[] = [
      weld(
        'petal-petal',
        'petal',
        'petal',
        petals,
        8,
        false,
        '꽃잎의 좁은 쪽 끝을 한 점에 모아 옆 꽃잎과 붙입니다.',
      ),
      weld(
        'petal-stem',
        'petal',
        'stem',
        1,
        8,
        false,
        '모인 꽃잎 뒤쪽 가운데에 줄기 끝을 대고 붙입니다.',
      ),
    ]
    if (extras) {
      parts.push(part('leaf', '잎', 1, [outline(ellipsePoints(size * 0.4, size * 0.75))], true))
      joints.push(
        weld('leaf-stem', 'leaf', 'stem', 1, 10, false, '잎의 끝을 줄기 중간에 비스듬히 붙입니다.'),
      )
    }
    return { parts, joints }
  },
}

const hexBox: PenRecipe = {
  id: 'hex-box',
  title: '육각 보관함',
  summary: '육각형 밑면 1장과 직사각 측면 6장으로 통을 만든다. 뚜껑을 더하면 보관함이 된다.',
  keywords: ['상자', '보관함', '통', '육각', '정리', '필통', '연필'],
  defaults: { size: 36, detail: 0, extras: true },
  size_range: [24, 55],
  nominal_difficulty: 3,
  build: ({ size, extras }) => {
    const wallH = size * 0.8
    const parts = [
      part('base', '육각 밑면', 1, [outline(regularPolygon(6, size))]),
      part('side', '측면', 6, [outline(rectPoints(size, wallH))]),
    ]
    const joints: PenJoint[] = [
      weld(
        'base-side',
        'base',
        'side',
        6,
        size,
        true,
        '밑면의 변마다 측면 한 장을 세워 맞대고 붙입니다.',
      ),
      weld(
        'side-side',
        'side',
        'side',
        6,
        wallH,
        true,
        '세운 측면끼리 맞닿은 세로 변을 위에서 아래로 녹여 붙입니다.',
      ),
    ]
    if (extras) {
      parts.push(part('lid', '뚜껑', 1, [outline(regularPolygon(6, size * 1.04))], true))
      joints.push(
        weld('lid-side', 'lid', 'side', 1, size, false, '뚜껑을 통 위에 얹고 한 변만 붙여 여닫게 합니다.'),
      )
    }
    return { parts, joints }
  },
}

const droneFrame: PenRecipe = {
  id: 'drone-frame',
  title: '드론 프레임 모형',
  summary: '중앙판 1장, 팔 4개, 프로펠러 가드 고리 4개로 쿼드콥터 모양을 만든다. 드론 수업과 이어서 쓴다.',
  keywords: ['드론', '쿼드콥터', '비행', '프로펠러', '항공', '로봇', '미래'],
  defaults: { size: 120, detail: 0, extras: false },
  size_range: [80, 170],
  nominal_difficulty: 3,
  build: ({ size }) => {
    const armLen = size * 0.45
    // 팔 폭이 곧 접합 길이다. 최소 접합 길이(8mm)와 선분 하한(8mm) 위로 여유를 둔다.
    const armW = Math.max(10, size * 0.1)
    return {
      parts: [
        part('plate', '중앙판', 1, [outline(rectPoints(size * 0.3, size * 0.3))]),
        part('arm', '팔', 4, [outline(rectPoints(armLen, armW))]),
        part('ring', '가드 고리', 4, ring(size * 0.18, 5)),
      ],
      joints: [
        weld(
          'plate-arm',
          'plate',
          'arm',
          4,
          armW,
          false,
          '중앙판 네 변의 가운데에 팔의 짧은 끝을 대고 붙입니다. 네 팔이 X 모양이 되게 합니다.',
        ),
        weld(
          'arm-ring',
          'arm',
          'ring',
          4,
          armW,
          false,
          '팔의 바깥 끝에 고리를 눕혀 올리고 닿는 부분을 붙입니다.',
        ),
      ],
    }
  },
}

const crossSphere: PenRecipe = {
  id: 'cross-sphere',
  title: '십자 끼움 구슬 장식',
  summary: '가운데까지 슬릿을 낸 원판 2장을 십자로 끼워 입체를 만든다. 접착 없이 끼움으로 조립한다.',
  keywords: ['구슬', '공 모양', '장식', '오너먼트', '끼움', '행성', '지구'],
  defaults: { size: 45, detail: 0, extras: false },
  size_range: [30, 80],
  nominal_difficulty: 4,
  build: ({ size }) => {
    // 슬릿 폭 = 끼울 원판 두께(3겹 ≈ 3mm) + 여유 1.1mm. 초등 간격 하한 4mm 보다도 넓다.
    const slitWidth = 4.1
    return {
      parts: [part('disc', '슬릿 원판', 2, slittedDisc(size, slitWidth))],
      joints: [
        {
          id: 'disc-cross',
          kind: 'slot',
          a: 'disc',
          b: 'disc',
          count: 1,
          tab_thickness_mm: 3,
          slot_width_mm: slitWidth,
          how: '원판을 3겹으로 덧그려 3mm 두께로 만듭니다. 하나를 세우고 다른 하나의 슬릿을 맞춰 직각으로 끼운 뒤, 빠지면 만나는 네 곳만 살짝 녹여 고정합니다.',
        },
      ],
    }
  },
}

export const PEN_RECIPES: readonly PenRecipe[] = [
  nameKeyring,
  cubeLantern,
  pyramidLamp,
  houseLamp,
  flowerPot,
  hexBox,
  droneFrame,
  crossSphere,
]

export function recipeById(id: string): PenRecipe | null {
  return PEN_RECIPES.find((r) => r.id === id) ?? null
}

/** 패턴을 만든다. `scale` 은 기본 치수에 대한 배율로 기록된다. */
export function buildPattern(recipe: PenRecipe, params: PenRecipeParams): PenPattern {
  const { parts, joints } = recipe.build(params)
  return {
    recipe_id: recipe.id,
    title: recipe.title,
    scale: Math.round((params.size / recipe.defaults.size) * 1000) / 1000,
    parts,
    joints,
  }
}

/** 학년대별 난이도 상한. 초등에 4단계 레시피를 후보로 올리지 않는다. */
const DIFFICULTY_CAP: Record<GradeBand, number> = {
  elementary: 2,
  middle: 4,
  high: 5,
}

/**
 * 주제 문자열로 후보를 추린다. **LLM 은 이 목록 밖으로 나갈 수 없다** (ADR-029).
 * 키워드가 하나도 맞지 않아도 빈 목록을 돌려주지 않는다 — 빈 화면을 보여주지 않는다.
 */
export function recipeCandidates(
  topic: string,
  gradeBand: GradeBand,
  difficultyCap = DIFFICULTY_CAP[gradeBand],
): PenRecipe[] {
  const text = topic.trim().toLowerCase()
  return PEN_RECIPES.filter((r) => r.nominal_difficulty <= difficultyCap)
    .map((r) => ({
      r,
      score: text === '' ? 0 : r.keywords.filter((k) => text.includes(k.toLowerCase())).length,
    }))
    .sort((a, b) => b.score - a.score || a.r.nominal_difficulty - b.r.nominal_difficulty || a.r.id.localeCompare(b.r.id))
    .map((x) => x.r)
}
