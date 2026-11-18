/**
 * 콘텐츠 스튜디오의 **임계값 유일 출처**. `docs/STUDIO.md` 의 표와 1:1이고,
 * `tests/studio-constants.test.ts` 가 문서와 이 파일이 어긋나면 터진다.
 *
 * 이 파일 밖에 수치 임계값을 적지 말 것. 검증을 통과시키려고 값을 낮추는 것도 금지다 —
 * 여기 있는 숫자는 물리 현상이고, 3mm 선 간격은 협상 대상이 아니다 (CLAUDE.md · ADR-030).
 */

import type { GradeBand, Venue } from '@/types/domain'
import type { DroneCommandName, Severity } from '@/types/studio'

// ============================================================================
// 3D펜 — 물리 상수
// ============================================================================

/** PLA 1.75mm · 노즐 0.7mm 에서 실제로 깔리는 비드 폭. */
export const BEAD_WIDTH_MM = 1.6

/** 윤곽이 닫혔다고 보는 허용 오차. */
export const CLOSED_TOLERANCE_MM = 0.1

/** 끼움 접합의 슬롯 폭은 `탭 두께 + [0.3, 1.2]mm` 안에 있어야 한다. */
export const SLOT_CLEARANCE_MM: [number, number] = [0.3, 1.2]

export type PenLimit = {
  /** 이어지지 않은 두 선 사이 최소 거리. 이보다 좁으면 녹아 붙는다 */
  min_gap_mm: number
  /** 이보다 짧은 선분은 학생에게 점으로 보인다 */
  min_segment_mm: number
  /** 이보다 날카로운 꼭짓점에는 덩어리가 생긴다 */
  min_angle_deg: number
  /** **학생 기준** 그리기 속도. 멈춤·수정을 포함한 값이고 장비 스펙이 아니다 */
  draw_speed_mm_s: number
  /** 1인 기준 부품 수 상한 */
  max_parts: number
  /** 권장 난이도 범위 (1~5) */
  difficulty: [number, number]
}

export const PEN_LIMITS: Record<GradeBand, PenLimit> = {
  elementary: {
    min_gap_mm: 4.0,
    min_segment_mm: 8,
    min_angle_deg: 40,
    draw_speed_mm_s: 6,
    max_parts: 6,
    difficulty: [1, 2],
  },
  middle: {
    min_gap_mm: 3.0,
    min_segment_mm: 6,
    min_angle_deg: 30,
    draw_speed_mm_s: 9,
    max_parts: 10,
    difficulty: [2, 4],
  },
  high: {
    min_gap_mm: 3.0,
    min_segment_mm: 5,
    min_angle_deg: 25,
    draw_speed_mm_s: 12,
    max_parts: 14,
    difficulty: [3, 5],
  },
}

/**
 * 조합(ADR-034)이 조각을 줄일 수 있는 하한. 이보다 작은 조각은 쓰지 않는다 —
 * 가장 빡빡한 학년 기준(선분 8mm)에 여유를 둔 값이고, `tests/studio-pen3d-pieces.test.ts`
 * 가 모든 조각을 이 치수에서 검사한다.
 */
export const COMPOSE_MIN_PIECE_MM = 14

/** 조합 한 건이 쓸 수 있는 조각 종류 수 상한. 몸통 1 + 붙이는 조각 4 */
export const COMPOSE_MAX_PIECES = 5

// ============================================================================
// 모양 제안 — 아틀라스·윤곽 제안이 지켜야 하는 범위 (ADR-036)
// ============================================================================

/**
 * 윤곽 점 개수 [하한, 상한].
 *
 * 8개 미만은 모양이 되지 않고, 64개를 넘겨 받아도 보정 단계의 리샘플이 다시 정하므로
 * 의미가 없다. 범위를 벗어난 제안은 **통째로 버린다** (`pen3d/shape.ts`).
 */
export const SHAPE_POINTS: [number, number] = [8, 64]

/**
 * 받아는 주는 점 개수 상한. 요청 범위(`SHAPE_POINTS`)보다 많이 와도 **코드가 솎아서** 쓴다 —
 * 점이 촘촘한 것은 지시를 무시한 것이 아니라 더 그린 것이고, 솎는 일은 결정론이다.
 * 이것보다 많으면 버린다.
 */
export const SHAPE_POINTS_TOLERATED = 200

/**
 * 좌표가 0~1 을 살짝 벗어난 것은 **끌어당겨** 쓴다. 모양은 바로 뒤에서 bbox 로 다시 정규화되므로
 * 당겨도 치수의 결정권은 그대로 코드에 있다. 이 폭을 넘으면 지시를 무시한 응답이므로 버린다.
 */
export const SHAPE_COORD_TOLERANCE = 0.25

/** 내부 디테일선 상한. 간격 임계값을 지키면서 A4 에 들어가는 한계다 */
export const SHAPE_MAX_DETAILS = 6

/** 구멍 상한 */
export const SHAPE_MAX_HOLES = 2

/**
 * 스무딩 라운드 상한. 뾰족한 꼭짓점·짧은 선분을 임계값 안으로 넣기 위해 Chaikin 을
 * 몇 번까지 돌릴 수 있는가. 여기서 못 넣으면 그 모양은 검증에서 실패한다 —
 * **임계값을 낮추는 선택지는 없다** (ADR-030).
 */
export const SHAPE_SMOOTH_MAX = 6

/**
 * 생성 한 번의 LLM 예산 (ms). 강사는 생성 버튼 앞에서 기다린다 — 합이 30초를 넘지 않는다
 * (ADR-038). 넘기면 그 단계를 포기하고 다음 수단으로 간다.
 */
export const SHAPE_AUTHOR_TIMEOUT_MS = 12_000

/**
 * 윤곽을 **직접 그려 받는** 호출 한 번의 상한. 목록에서 고르기(12초)와 다르다 — 점 수십 개를
 * 쓰는 응답이고 실측 13~20초다. 12초로 두면 거의 전부 타임아웃이었다.
 */
export const SHAPE_OUTLINE_TIMEOUT_MS = 18_000

/**
 * 윤곽 제안을 **몇 번까지** 받을 것인가 (ADR-036).
 *
 * 1회로 두면 "윤곽이 스스로 교차한다"처럼 **다시 그리면 풀리는** 거절에서 강사가 바로 실패
 * 화면을 본다(실측: 물고기가 그랬다). 거절 이유를 되먹여 한 번 더 그려 달라고 한다.
 * 타임아웃·한도는 다시 걸어도 같으므로 재시도하지 않는다.
 */
export const SHAPE_OUTLINE_ATTEMPTS = 2
export const SHAPE_REVIEW_TIMEOUT_MS = 8_000

/** 보정이 목표로 삼는 여유. 임계값에 딱 걸치면 반올림에서 뒤집힌다 */
export const SHAPE_MARGIN = { gap_mm: 0.4, segment_mm: 0.6, angle_deg: 3 }

/** 종횡비 허용 범위. 1:5 를 넘는 조각은 모양이 아니라 막대다 */
export const SHAPE_ASPECT: [number, number] = [0.2, 5]

// ============================================================================
// 2D·적층 (ADR-037)
// ============================================================================

/**
 * 적층 층 수. 두께가 보이는 최소 장수에서 시작하고, 시간이 모자라면 개선 라운드가 줄인다.
 * 같은 실루엣이므로 **인쇄는 한 번**이고 수량 표기(`×N`)로 나간다.
 */
export const LAYER_COUNT: Record<GradeBand, number> = {
  elementary: 3,
  middle: 4,
  high: 5,
}

/** 측면 띠 분절 수. 둘레를 한 줄로 그리면 A4 사용 폭(190mm)을 넘는다 */
export const BAND_SEGMENTS = 3

/** 2D 고리 — 바깥 반지름·두께. 두께가 곧 선 간격이다 (`name-keyring` 과 같은 값) */
export const HANGER_OUTER_R_MM = 9
export const HANGER_THICKNESS_MM = 5

/** 적층 층간 용접 길이 = 실루엣 둘레 × 이 비율. 둘레의 절반을 넘을 수 없다 */
export const LAYER_WELD_RATIO = 0.3

export const PEEL_SECONDS_PER_PART = 30
export const WELD_SECONDS_PER_JOINT = 45

/** 도입·시범 12분 + 정리 8분. 장비 배부를 포함한다. */
export const CLASS_OVERHEAD_MINUTES = 20

/** 남은 시간을 전부 쓰지 않는다. */
export const TIME_SAFETY = 0.85

/** 가용 시간의 이 비율을 넘으면 warn. */
export const TIME_TIGHT_RATIO = 0.9

/**
 * A4. `margin` 을 뺀 영역이 사용 영역이고, `gutter` 는 부품 간 배치 간격이다.
 *
 * 간격이 14mm 인 이유: 떼어내기 여유만 보면 6mm 로 충분하지만, 그 간격에서는 종이 위의
 * 부품 번호와 이름이 옆 부품에 바싹 붙어서 "몇 번이 어느 모양인지"가 한눈에 읽히지 않는다.
 * 도안은 A4 의 20~30% 만 쓰므로 간격을 넓혀도 도안이 작아지지 않는다 — 24mm 까지 올려도
 * 축소·개선 라운드가 늘지 않는 것을 확인했다.
 */
export const PAGE = {
  width_mm: 210,
  height_mm: 297,
  margin_mm: 10,
  gutter_mm: 14,
} as const

export const PAGE_USABLE = {
  width_mm: PAGE.width_mm - PAGE.margin_mm * 2,
  height_mm: PAGE.height_mm - PAGE.margin_mm * 2,
} as const

/**
 * 부품 라벨 블록(번호 배지·이름·수량·치수)이 차지하는 자리. **배치가 이 값을 예약한다.**
 *
 * 렌더가 그리는 것과 배치가 예약하는 것이 어긋나면 라벨이 옆·아래 부품의 선 위로 올라간다.
 * 그래서 글자 크기·줄 간격까지 여기 한 곳에 두고 `layout.ts` 와 `render.ts` 가 같이 읽는다.
 * SVG 는 `viewBox` 가 1 단위 = 1mm 이므로 글자 크기의 px 값이 곧 mm 다.
 */
export const PEN_LABEL = {
  /** 이름·수량 줄 */
  name_font_mm: 3.4,
  /** 치수 줄 */
  dim_font_mm: 2.9,
  /** 번호 배지 안의 숫자 */
  num_font_mm: 3.2,
  /** 줄 간격 */
  line_mm: 4.2,
  /** 부품 아래 끝에서 첫 줄 기준선까지. 배지 반지름보다 커야 배지가 부품 위로 올라가지 않는다 */
  lead_mm: 3.8,
  /** 마지막 줄 기준선 아래 여유 (글자 꼬리) */
  descent_mm: 1.2,
  badge_radius_mm: 2.3,
  /** 배지를 비켜 첫 줄 글자가 시작하는 위치 */
  badge_text_x_mm: 5.6,
  /** 라벨이 들어갈 칸의 최소 폭. 부품이 이보다 좁아도 칸은 이만큼 잡는다 */
  min_width_mm: 32,
} as const

/** 보유 장비 문자열에서 3D펜 보유를 판별하는 키워드. 하나라도 걸리면 보유로 본다. */
export const PEN_EQUIPMENT_KEYWORDS = ['3d펜', '3d 펜', '3디펜', '필라멘트', '3d pen'] as const

// ============================================================================
// 3D펜 — 검증 코드
// ============================================================================

export const PEN_FINDING_SEVERITY: Record<string, Severity> = {
  PEN_EQUIPMENT_MISSING: 'error',
  PEN_PATH_NOT_CLOSED: 'error',
  PEN_SELF_INTERSECT: 'error',
  PEN_SEGMENT_TOO_SHORT: 'error',
  PEN_ANGLE_TOO_SHARP: 'error',
  PEN_GAP_TOO_SMALL: 'error',
  PEN_PART_OUT_OF_PAGE: 'error',
  PEN_PARTS_OVERLAP: 'error',
  PEN_TOO_MANY_PARTS: 'error',
  PEN_TIME_OVER: 'error',
  PEN_JOINT_UNPAIRED: 'error',
  PEN_JOINT_SIZE_MISMATCH: 'error',
  PEN_ASSEMBLY_DISCONNECTED: 'error',
  PEN_FLAT_NO_SILHOUETTE: 'error',
  PEN_SHAPE_UNAVAILABLE: 'error',
  PEN_LAYER_COUNT_INVALID: 'error',
  PEN_DIFFICULTY_MISMATCH: 'warn',
  PEN_TIME_TIGHT: 'warn',
  // 모양이 그 단어로 보이는가 — 물리 검증이 아니므로 **막지 않는다** (ADR-036·038)
  PEN_SHAPE_UNRECOGNIZED: 'warn',
  PEN_SHAPE_UNREVIEWED: 'warn',
  /**
   * 요청한 모양을 찾지 못해 **명패로 만들었다** (ADR-042). warn 인 이유: 산출물은 인쇄해서
   * 수업에 쓸 수 있는 물건이고 물리 검증을 전부 통과했다. 막을 근거가 없다.
   *
   * **차단이 아니라 고지다.** 강사는 명패를 받고, 그것이 요청한 모양이 아니라는 사실을
   * 화면에서 읽는다 — 요청한 모양이 나온 것처럼 보이는 것이 유일하게 해서는 안 되는 일이다.
   */
  PEN_SHAPE_FALLBACK: 'warn',
}

/** 개선 라운드 상한. 넘으면 `failed` 로 끝낸다 — 임계값을 낮추지 않는다 (ADR-030). */
export const MAX_REPAIR_ROUNDS = 3

/** 개선 라운드의 확대·축소 배율. */
export const SCALE_UP_STEP = 1.15
export const SCALE_DOWN_STEP = 0.9

// ============================================================================
// 드론 — 기체와 장소
// ============================================================================

export type DroneModel = {
  id: string
  /** `docs/STUDIO.md` 기체 표의 이름과 같아야 한다 */
  label: string
  commands: readonly DroneCommandName[]
  indoor: boolean
  max_altitude_cm: number
  /** 1회 비행 한계(초). 시뮬레이터는 null */
  flight_seconds: number | null
  /** 한 명령의 이동량 하한·상한 (cm) */
  step_cm: [number, number]
  /** 장비 문자열 판별 키워드 */
  keywords: readonly string[]
}

const FULL_COMMANDS: readonly DroneCommandName[] = [
  'takeoff',
  'land',
  'up',
  'down',
  'forward',
  'back',
  'left',
  'right',
  'cw',
  'ccw',
  'hover',
  'flip',
]

export const DRONE_MODELS: readonly DroneModel[] = [
  {
    id: 'tello',
    label: 'DJI Tello / RoboMaster TT',
    commands: FULL_COMMANDS,
    indoor: true,
    max_altitude_cm: 300,
    flight_seconds: 300,
    step_cm: [20, 500],
    keywords: ['tello', '텔로', 'robomaster', '로보마스터', 'tt'],
  },
  {
    id: 'codrone-edu',
    label: 'RoboLink CoDrone EDU',
    commands: FULL_COMMANDS.filter((c) => c !== 'flip'),
    indoor: true,
    max_altitude_cm: 200,
    flight_seconds: 240,
    step_cm: [20, 200],
    keywords: ['codrone', '코드론', 'robolink', '로보링크'],
  },
  {
    id: 'sim',
    label: '교육용 시뮬레이터',
    commands: FULL_COMMANDS,
    indoor: true,
    max_altitude_cm: 500,
    flight_seconds: null,
    step_cm: [20, 500],
    keywords: ['시뮬레이터', 'simulator', '시뮬'],
  },
]

/** 장소 치수 (cm). x 가로 · y 세로 · z 천장. */
export const VENUE_DIMENSIONS: Record<Venue, { x: number; y: number; z: number }> = {
  교실: { x: 800, y: 700, z: 260 },
  강당: { x: 2000, y: 1500, z: 600 },
  체육관: { x: 2800, y: 1500, z: 700 },
  운동장: { x: 6000, y: 4000, z: 1000 },
  컴퓨터실: { x: 700, y: 600, z: 250 },
  메이커실: { x: 900, y: 700, z: 270 },
}

export const DRONE_WALL_CLEARANCE_CM = 50
export const DRONE_OBSTACLE_CLEARANCE_CM = 50
export const DRONE_MIN_ALTITUDE_CM = 30
export const DRONE_CEILING_MARGIN_CM = 50

/** 실내 flip 을 warn 으로 잡는 천장 높이 기준. */
export const FLIP_MIN_CEILING_CM = 250

/** 학생 1명이 조종대에 서서 끝낼 때까지의 교체·대기 시간. */
export const DRONE_SWAP_SECONDS = 60

/** 도입·시범 + 코스 설치 + 정리. */
export const DRONE_OVERHEAD_MINUTES = 20

export const DRONE_FINDING_SEVERITY: Record<string, Severity> = {
  DRONE_EQUIPMENT_MISSING: 'error',
  DRONE_NO_TAKEOFF: 'error',
  DRONE_NO_LAND: 'error',
  DRONE_COMMAND_AFTER_LAND: 'error',
  DRONE_UNSUPPORTED_COMMAND: 'error',
  DRONE_VENUE_TOO_SMALL: 'error',
  DRONE_OUT_OF_BOUNDS: 'error',
  DRONE_ALTITUDE_LIMIT: 'error',
  DRONE_OBSTACLE_CLEARANCE: 'error',
  DRONE_STEP_TOO_LARGE: 'error',
  DRONE_TIME_OVER: 'error',
  DRONE_FLIP_INDOOR: 'warn',
  DRONE_TIME_TIGHT: 'warn',
}

/**
 * 생성물에 항상 들어가는 안전 문구. **LLM 이 지우거나 바꿔 쓰면 되돌린다** (CLAUDE.md).
 * 실제 기체가 아이들 머리 위에서 돈다 — 이 네 줄이 없으면 산출물을 내보내지 않는다.
 */
export const DRONE_SAFETY_NOTES = [
  '사람 위로 비행하지 않는다. 비행 구역 안에 학생이 들어오지 않게 한 뒤 이륙한다.',
  '프로펠러 가드를 장착한다.',
  '이착륙 구역을 바닥 테이프로 표시하고 그 안에서만 띄운다.',
  '조종자는 1명, 나머지는 선 밖에서 본다.',
] as const

// ============================================================================
// 성과 피드백 보정 (ADR-032)
// ============================================================================

/** 이 건수 미만의 피드백은 상수 보정에 쓰지 않는다. ADR-018 과 같은 이유다. */
export const CALIBRATION_MIN_SAMPLES = 3

/** 속도 보정 계수 절단 범위. */
export const SPEED_FACTOR_RANGE: [number, number] = [0.6, 1.6]

/** 이보다 짧은 용접은 떼어낼 때 떨어진다. */
export const WELD_MIN_LENGTH_MM = 8

/**
 * 3D펜 산출물에 항상 들어가는 안전 문구. **LLM 이 지우거나 바꿔 쓰면 되돌린다.**
 * 노즐은 200도 가까이 올라가고, 쓰는 사람은 초등학생이다.
 */
export const PEN_SAFETY_NOTES = [
  '펜 끝(노즐)은 200도 가까이 올라갑니다. 끝을 만지지 않고, 쓰지 않을 때는 거치대에 세워 둡니다.',
  '실리콘 매트나 종이 위에서만 그립니다. 책상에 바로 그리면 자국이 남습니다.',
  '환기를 하고, 얼굴을 도안에 가까이 대지 않습니다.',
  '부품을 뗄 때는 식은 뒤에 떼고, 떼기 어려우면 선생님에게 말합니다.',
] as const

// ── 비행 상수 (docs/STUDIO.md 비행 상수 표) ─────────────────────────────────

/** 교실·체육관에서 학생이 조종할 때 쓰는 속도. 기체 최고 속도가 아니다. */
export const DRONE_SPEED_CM_S = 50
export const DRONE_YAW_DEG_S = 90
/** 이륙 명령 하나로 올라가는 기본 높이. */
export const DRONE_TAKEOFF_ALTITUDE_CM = 100
export const DRONE_TAKEOFF_SECONDS = 5
export const DRONE_LAND_SECONDS = 4
/**
 * 게이트 개구부 안쪽 여유. 벽·장애물의 50cm 와 다르다 —
 * 게이트는 **통과하라고 놓은 물건**이고, 50cm 를 요구하면 교육용 게이트는 전부 실격된다.
 */
export const DRONE_GATE_MARGIN_CM = 15
/** 콘(기둥)의 반지름. 교육용 라바콘 기준. */
export const DRONE_CONE_RADIUS_CM = 15
