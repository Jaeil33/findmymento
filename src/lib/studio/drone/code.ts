/**
 * 미션 → 기체별 코드.
 *
 * 이 코드는 **학생이 그대로 실행하는 산출물이다.** 그래서 두 가지를 지킨다:
 * 1. 검증을 통과한 미션에서만 나온다 (호출부가 보장한다)
 * 2. 안전 문구 네 줄이 주석으로 항상 맨 위에 붙는다 (CLAUDE.md — LLM 이 지울 수 없는 자리)
 *
 * Tello 는 djitellopy 파이썬 코드, 나머지는 블록 코딩으로 옮겨 적는 의사코드다.
 * 없는 라이브러리를 있는 것처럼 쓰지 않는다.
 */

import { DRONE_SAFETY_NOTES, type DroneModel } from '@/lib/studio/constants'
import type { DroneCommand, DroneMission } from '@/types/studio'

const PY: Record<DroneCommand['name'], (value: number) => string> = {
  takeoff: () => 'tello.takeoff()',
  land: () => 'tello.land()',
  up: (v) => `tello.move_up(${v})`,
  down: (v) => `tello.move_down(${v})`,
  forward: (v) => `tello.move_forward(${v})`,
  back: (v) => `tello.move_back(${v})`,
  left: (v) => `tello.move_left(${v})`,
  right: (v) => `tello.move_right(${v})`,
  cw: (v) => `tello.rotate_clockwise(${v})`,
  ccw: (v) => `tello.rotate_counter_clockwise(${v})`,
  hover: (v) => `time.sleep(${v})`,
  flip: () => "tello.flip('b')",
}

const KO: Record<DroneCommand['name'], (value: number) => string> = {
  takeoff: () => '이륙',
  land: () => '착륙',
  up: (v) => `위로 ${v}cm`,
  down: (v) => `아래로 ${v}cm`,
  forward: (v) => `앞으로 ${v}cm`,
  back: (v) => `뒤로 ${v}cm`,
  left: (v) => `왼쪽으로 ${v}cm`,
  right: (v) => `오른쪽으로 ${v}cm`,
  cw: (v) => `오른쪽으로 ${v}도 회전`,
  ccw: (v) => `왼쪽으로 ${v}도 회전`,
  hover: (v) => `${v}초 제자리`,
  flip: () => '뒤집기',
}

export function commandLabel(command: DroneCommand): string {
  return KO[command.name](command.value)
}

function safetyHeader(prefix: string): string[] {
  return [`${prefix} 비행 전에 반드시 확인하세요`, ...DRONE_SAFETY_NOTES.map((n) => `${prefix} ${n}`)]
}

export function emitCode(
  mission: DroneMission,
  model: DroneModel,
): { language: 'python' | 'pseudo'; body: string } {
  if (model.id === 'tello') {
    const lines = [
      ...safetyHeader('#'),
      '',
      'import time',
      'from djitellopy import Tello',
      '',
      'tello = Tello()',
      'tello.connect()',
      'print("배터리:", tello.get_battery(), "%")',
      '',
      ...mission.commands.map((c) => `${PY[c.name](c.value)}  # ${commandLabel(c)}`),
      '',
      'tello.end()',
    ]
    return { language: 'python', body: lines.join('\n') }
  }

  const lines = [
    ...safetyHeader('※'),
    '',
    `[${model.label}] ${mission.title}`,
    '블록 코딩 화면에 아래 순서대로 블록을 놓습니다.',
    '',
    ...mission.commands.map((c, i) => `${i + 1}. ${commandLabel(c)}`),
  ]
  return { language: 'pseudo', body: lines.join('\n') }
}

/** 코스 설치 안내. 장애물 좌표를 줄자로 잴 수 있는 문장으로 바꾼다. */
export function courseSetup(mission: DroneMission): string[] {
  const steps = [
    `바닥에 ${mission.course_cm.x}×${mission.course_cm.y}cm 비행 구역을 테이프로 표시합니다.`,
    `구역 왼쪽 위 모서리에서 가로 ${mission.takeoff_cm.x}cm · 세로 ${mission.takeoff_cm.y}cm 지점을 이착륙 지점으로 표시합니다.`,
  ]
  for (const o of mission.obstacles) {
    const dx = o.x - mission.takeoff_cm.x
    const dy = o.y - mission.takeoff_cm.y
    const where = `이착륙 지점에서 ${dx >= 0 ? '앞' : '뒤'} ${Math.abs(Math.round(dx))}cm · ${dy >= 0 ? '오른쪽' : '왼쪽'} ${Math.abs(Math.round(dy))}cm`
    steps.push(
      o.kind === 'cone'
        ? `${where}에 높이 ${o.height_cm}cm 콘을 놓습니다 (${o.id}).`
        : `${where}에 게이트를 세웁니다 — 아래 끝이 바닥에서 ${o.height_cm}cm, 개구부 ${o.opening_w_cm}×${o.opening_h_cm}cm (${o.id}).`,
    )
  }
  steps.push('구역 밖으로 학생을 물리고, 조종자 한 명만 구역 선 앞에 섭니다.')
  return steps
}
