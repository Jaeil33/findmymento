/**
 * 콘텐츠 스튜디오 도메인 타입. `docs/STUDIO.md` 와 1:1로 대응한다.
 *
 * 이 파일에서 절대 하지 말아야 하는 것:
 * - 학생 개인을 가리키는 필드를 넣는 것. 성과 피드백은 **회차 단위 집계**다 (ADR-032).
 * - 렌더된 SVG 문자열을 산출물 타입에 넣는 것. 패턴에서 결정론적으로 렌더하므로 저장할 필요가
 *   없고, 저장하면 패턴과 어긋난 SVG 가 남는다.
 * - 임계값을 여기에 적는 것. 숫자는 `lib/studio/constants.ts` 한 곳에만 있다.
 */

import type { GradeBand, Venue } from '@/types/domain'

export const CONTENT_KINDS = ['pen3d', 'drone'] as const
export type ContentKind = (typeof CONTENT_KINDS)[number]

export const CONTENT_KIND_LABEL: Record<ContentKind, string> = {
  pen3d: '3D펜 도안',
  drone: '드론 비행 코드',
}

/**
 * 강사가 넣는 생성 조건. 회차에서 생성하면 회차의 수업 조건이 그대로 들어온다
 * (`lecture_sessions` 의 grade_band·expected_students·duration_minutes·venue·equipment).
 */
export type StudioSpec = {
  kind: ContentKind
  grade_band: GradeBand
  student_count: number
  duration_minutes: number
  venue: Venue
  /** 보유 장비. 사물만 적는다 — 학생에 대한 서술을 넣지 말 것 */
  equipment: string[]
  /** 교육 주제. 마스킹(`lib/moderation`)을 통과한 값만 들어온다 */
  topic: string
  /** 회차에 붙은 생성이면 회차 id. 라이브러리 단독 생성이면 null */
  session_id: string | null
}

// ============================================================================
// 공통 — 검증 결과
// ============================================================================

export type Severity = 'error' | 'warn'

/**
 * 검증 지적 한 건. `code` 는 고정 목록이며(`constants.ts`) 화면이 코드별로 안내 문구를 붙인다.
 * `measured`·`limit` 는 "2.4mm 로 3.0mm 미달" 처럼 숫자를 그대로 보여주기 위한 값이다.
 */
export type Finding = {
  code: string
  severity: Severity
  message: string
  /** 어느 부품·어느 명령에서 걸렸는지 */
  where?: string
  measured?: number
  limit?: number
}

export type ValidationReport = {
  /** `findings` 에 error 가 하나도 없다는 뜻. warn 은 ok 를 깨지 않는다 */
  ok: boolean
  findings: Finding[]
}

export function reportOf(findings: Finding[]): ValidationReport {
  return { ok: findings.every((f) => f.severity !== 'error'), findings }
}

/** `draft`·`failed` 는 내려받기·인쇄를 막는다 (ADR-030). */
export type StudioStatus = 'draft' | 'validated' | 'failed' | 'approved'

export const STUDIO_STATUS_LABEL: Record<StudioStatus, string> = {
  draft: '검증 전',
  failed: '검증 실패',
  validated: '검증 통과 · 강사 확인 필요',
  approved: '수업 사용 가능',
}

/** 산출물을 수업에 쓸 수 있다고 표시해도 되는 상태인가. 화면과 API 가 같은 함수를 쓴다. */
export function isUsable(status: StudioStatus): boolean {
  return status === 'validated' || status === 'approved'
}

/**
 * 생성·개선 라운드 한 건. 전부 저장하고 강사 화면에 그대로 보여준다 —
 * "간격 2.4mm 미달 → 1.15배 확대 → 3.1mm 통과" 가 강사가 결과를 믿는 유일한 근거다 (ADR-030).
 */
export type StudioRound = {
  round: number
  action: 'generated' | 'repaired'
  /** 무엇을 고쳤는지. `generated` 라운드는 null */
  repair: string | null
  /** 그 라운드에 쓴 생성 파라미터. 재현에 필요하다 */
  params: Record<string, number | boolean | string> | null
  ok: boolean
  findings: Finding[]
}

// ============================================================================
// 3D펜 도안
// ============================================================================

/** 밀리미터. 종이 좌표계이고 원점은 A4 왼쪽 위 여백 안쪽이다. */
export type Point = { x: number; y: number }

/**
 * 한 번에 긋는 선. `outline` 은 실선(덧그릴 윤곽), `fold` 는 파선(접는 선)이다.
 * `closed` 면 마지막 점에서 첫 점으로 돌아간다.
 */
export type Stroke = {
  kind: 'outline' | 'fold'
  points: Point[]
  closed: boolean
}

export type PenPart = {
  id: string
  name: string
  /** 같은 모양이 몇 개 필요한가 */
  quantity: number
  /** 부품 로컬 좌표. 배치는 `origin` 으로 평행이동한다 */
  strokes: Stroke[]
  origin: Point
  /** 시간이 초과되면 제거 후보가 되는 장식 부품인가 */
  optional: boolean
}

export type PenJointKind = 'weld' | 'slot'

export type PenJoint = {
  id: string
  kind: PenJointKind
  /** 부품 id 두 개. 양쪽 모두 존재해야 한다. 같은 부품의 복제끼리 붙으면 `a === b` 다 */
  a: string
  b: string
  /** 같은 접합이 몇 군데인가. 정육면체는 같은 패널끼리 모서리 12곳이다 */
  count: number
  /** weld: 맞붙는 변의 길이 */
  length_mm?: number
  /**
   * 두 변이 **끝에서 끝까지 딱 맞붙는가.** 정육면체 면끼리는 true 이고,
   * 팔 끝을 중앙판 변의 중간에 붙이는 접합은 false 다. true 면 양쪽 부품에
   * 그 길이의 실제 변이 있어야 한다 (`PEN_JOINT_SIZE_MISMATCH`).
   */
  flush?: boolean
  /** slot: 끼우는 쪽 두께와 받는 쪽 폭 */
  tab_thickness_mm?: number
  slot_width_mm?: number
  /** 조립 지시 한 문장. 규칙이 만든다 */
  how: string
}

export type PenPattern = {
  recipe_id: string
  title: string
  /** 레시피 기본 치수에 곱한 배율. 개선 라운드가 바꾸는 값이다 */
  scale: number
  parts: PenPart[]
  joints: PenJoint[]
}

export type PenMetrics = {
  /** quantity 를 합친 총 부품 수 */
  part_count: number
  unique_part_count: number
  joint_count: number
  total_stroke_mm: number
  /**
   * 이어지지 않은 두 선 사이의 최단거리. 탐색 반경(8mm) 안에 그런 쌍이 없으면 `null` 이다
   * — JSON 에 Infinity 를 넣을 수 없으므로 null 로 둔다. null 은 "충분히 떨어져 있다"는 뜻이다.
   */
  min_gap_mm: number | null
  /** 사람이 한 번에 긋는 선 단위의 최소 길이. 선이 없으면 null */
  min_segment_mm: number | null
  min_angle_deg: number | null
  draw_seconds: number
  peel_seconds: number
  weld_seconds: number
  estimated_minutes: number
  available_minutes: number
  /** 1~5 */
  difficulty: number
  page_fit: boolean
}

export type PenArtifact = {
  kind: 'pen3d'
  pattern: PenPattern
  metrics: PenMetrics
  /** 조립 순서. 규칙이 접합 그래프에서 만든다 */
  assembly: string[]
  /** 학생에게 주는 실습 과제. LLM 이 문장을 쓰고 규칙이 개수를 정한다 */
  tasks: string[]
  safety_notes: string[]
}

// ============================================================================
// 드론 비행 코드
// ============================================================================

export const DRONE_COMMANDS = [
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
] as const
export type DroneCommandName = (typeof DRONE_COMMANDS)[number]

/** `value` 단위는 이동이면 cm, 회전이면 도, hover 면 초다. takeoff·land 는 0 */
export type DroneCommand = { name: DroneCommandName; value: number }

/** 장애물. 바닥에 놓는 콘(기둥)과 통과하는 게이트(문) 두 종류뿐이다 */
export type DroneObstacle = {
  id: string
  kind: 'cone' | 'gate'
  /** 이륙 지점 원점 기준 cm */
  x: number
  y: number
  /** cone: 높이. gate: 개구부 아래 높이 */
  height_cm: number
  /** gate 전용 — 개구부 폭·높이 */
  opening_w_cm?: number
  opening_h_cm?: number
  /**
   * gate 전용 — 어느 축을 따라 통과하는가. 게이트는 **얇은 문틀**이어서 그 면을 가로지르는
   * 구간만 개구부 판정을 받는다. 옆을 지나가는 구간은 기둥과의 거리로 본다.
   */
  facing?: 'x' | 'y'
}

export type DroneMission = {
  recipe_id: string
  title: string
  model_id: string
  /** 바닥에 테이프로 표시하는 비행 구역 (cm). 좌표계의 원점은 이 사각형의 왼쪽 위다 */
  course_cm: { x: number; y: number }
  /** 구역 안의 이착륙 지점 */
  takeoff_cm: { x: number; y: number }
  commands: DroneCommand[]
  obstacles: DroneObstacle[]
}

export type DroneMetrics = {
  command_count: number
  /** 1회 비행 시간(초) */
  flight_seconds_one: number
  /** 명령을 적분한 경로 길이 */
  path_cm: number
  max_altitude_cm: number
  /** 경로와 장애물·벽 사이 최단거리. 장애물이 없으면 null */
  min_clearance_cm: number | null
  /** (1회 비행 + 교대) × 학생 수 */
  estimated_minutes: number
  available_minutes: number
  difficulty: number
  footprint_cm: { x: number; y: number }
}

export type DroneArtifact = {
  kind: 'drone'
  mission: DroneMission
  metrics: DroneMetrics
  /** 기체별 코드. 사람이 읽고 그대로 실행하는 산출물이다 */
  code: { language: 'python' | 'pseudo'; body: string }
  course_setup: string[]
  tasks: string[]
  safety_notes: string[]
}

export type StudioArtifact = PenArtifact | DroneArtifact

// ============================================================================
// 저장 레코드 (ADR-031 — 버전은 불변 행으로 쌓는다)
// ============================================================================

export type StudioContent = {
  id: string
  /** 한 산출물의 역사를 묶는 id. 첫 버전의 id 와 같다 */
  lineage_id: string
  version: number
  instructor_id: string
  session_id: string | null
  kind: ContentKind
  title: string
  spec: StudioSpec
  artifact: StudioArtifact
  rounds: StudioRound[]
  status: StudioStatus
  /** 레시피 선택과 문장을 무엇이 만들었는지. 좌표는 언제나 규칙이 만든다 */
  source: 'llm' | 'rule'
  recipe_id: string
  created_at: string
  approved_at: string | null
}

export const DIFFICULTY_VOTES = ['too_easy', 'right', 'too_hard'] as const
export type DifficultyVote = (typeof DIFFICULTY_VOTES)[number]

export const DIFFICULTY_VOTE_LABEL: Record<DifficultyVote, string> = {
  too_easy: '쉬웠다',
  right: '적당했다',
  too_hard: '어려웠다',
}

/**
 * 수업 후 성과 피드백. **회차 단위 집계뿐이다** (ADR-032).
 * 학생 개인 단위 필드를 추가하지 말 것 — 누가 완성하지 못했는지는 이 플랫폼에 들어오지 않는다.
 */
export type StudioFeedback = {
  id: string
  content_id: string
  session_id: string | null
  instructor_id: string
  attempted_count: number
  completed_count: number
  actual_minutes: number
  difficulty_vote: DifficultyVote
  /** 강사 의견. 마스킹 통과분만 저장한다 */
  note: string | null
  created_at: string
}

/** 레시피·학년대별 보정. 피드백 3건 이상일 때만 만들어진다 (ADR-032). */
export type StudioCalibration = {
  recipe_id: string
  grade_band: GradeBand
  sample_count: number
  /** 실제 시간 / 예상 시간의 중위수. 0.6~1.6 으로 자른다 */
  speed_factor: number
  /** too_hard 가 과반이면 true — 난이도 상한을 1 낮춘다 */
  lower_difficulty: boolean
}
