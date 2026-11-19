import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { GenerateResult } from '@/components/studio/GenerateResult'
import {
  LessonPlanPanel,
  StudentGuidePanel,
  VerificationPanel,
} from '@/components/studio/LessonPackage'
import { penHarness } from '@/lib/studio/harness/pipeline'
import type { LessonPackage, StudioSpec } from '@/types/studio'

/**
 * 수업 패키지 화면 (ADR-044).
 *
 * 화면에서 반드시 지켜져야 하는 것:
 * - **추정값을 "검증 완료"로 적지 않는다.** 네 항목(기하·시간·주제 일치·현장)을 따로 보여준다
 * - 입력으로 알 수 없는 것은 **확인 항목으로 보인다.** 숨기면 강사가 교실에서 발견한다
 * - 미리 써 둔 문장을 실시간 AI 가 쓴 것처럼 적지 않는다 (ADR-025)
 * - 대체 모양·명패는 "요청한 모양이 아니다"가 화면에 남는다 (ADR-030·042)
 */

const spec = (over: Partial<StudioSpec> = {}): StudioSpec => ({
  kind: 'pen3d',
  grade_band: 'middle',
  student_count: 20,
  duration_minutes: 90,
  venue: '교실',
  equipment: ['3D펜 20자루', 'PLA 필라멘트'],
  topic: '바다에 사는 물고기 모양 장식 만들기',
  session_id: null,
  form: 'flat',
  ...over,
})

const result = (over: Partial<StudioSpec> = {}) => penHarness(spec(over), { authoredBy: 'pack' })

describe('검증 상태 패널', () => {
  it('네 항목을 따로 적고, 추정값을 통과로 쓰지 않는다', () => {
    render(<VerificationPanel pkg={result().package} />)
    expect(screen.getByText('기하·물리 검증')).toBeInTheDocument()
    expect(screen.getByText('제작 시간')).toBeInTheDocument()
    expect(screen.getByText('주제 일치')).toBeInTheDocument()
    expect(screen.getByText('현장 결과')).toBeInTheDocument()
    expect(screen.getByText(/추정값입니다/)).toBeInTheDocument()
    expect(screen.getByText(/수업에서 써 본 기록이 없습니다/)).toBeInTheDocument()
  })

  it('확인이 필요한 항목을 숨기지 않는다', () => {
    render(<VerificationPanel pkg={result().package} />)
    expect(screen.getByText('입력으로 알 수 없어 확인이 필요한 것')).toBeInTheDocument()
    expect(screen.getByText(/콘센트·전원/)).toBeInTheDocument()
  })

  it('미리 써 둔 문장이라는 사실을 적는다 (ADR-025)', () => {
    render(<VerificationPanel pkg={result().package} />)
    expect(screen.getByText(/미리 만들어 둔 도안의 문장입니다/)).toBeInTheDocument()
  })

  it('실시간 AI 가 쓴 경우에는 그렇게 적는다', () => {
    const pkg: LessonPackage = { ...result().package, authored_by: 'llm' }
    render(<VerificationPanel pkg={pkg} />)
    expect(screen.getByText(/AI가 이번 요청을 읽고/)).toBeInTheDocument()
    expect(screen.queryByText(/미리 만들어 둔 도안의 문장입니다/)).not.toBeInTheDocument()
  })

  it('출처와 라이선스를 싣는다 (ADR-041)', () => {
    render(<VerificationPanel pkg={result().package} />)
    expect(screen.getByText(/CC-BY 4.0/)).toBeInTheDocument()
  })

  it('기하 검증이 실패하면 통과로 적지 않는다', () => {
    const failed = penHarness(spec({ equipment: ['색연필'] }), { authoredBy: 'pack' })
    render(<VerificationPanel pkg={failed.package} />)
    expect(screen.getByText(/실패 — 걸린 항목은/)).toBeInTheDocument()
  })
})

describe('학생용 사용법 패널', () => {
  it('단계와 주의사항을 보여준다', () => {
    const harness = result({ topic: '기린' })
    render(<StudentGuidePanel pkg={harness.package} />)
    expect(screen.getByText(/선을 따라 펜으로 덧그립니다/)).toBeInTheDocument()
    expect(screen.getByText(/식은 뒤에 종이에서 떼어냅니다/)).toBeInTheDocument()
    // 팩 항목의 주의사항이 1단계에 붙는다 (떼어내기 단계에도 주의가 하나 더 있다)
    expect(screen.getAllByText(/^주의 · /).length).toBeGreaterThan(0)
  })

  it('색은 참고 그림이라고 적는다 — 채우라고 하지 않는다 (ADR-039)', () => {
    const harness = result({ topic: '나비' })
    render(<StudentGuidePanel pkg={harness.package} />)
    const text = document.body.textContent ?? ''
    if (harness.artifact.pattern.parts.some((p) => p.art.length > 0)) {
      expect(text).toContain('인쇄된 색은 참고 그림입니다')
      expect(text).not.toContain('색을 채웁니다')
    }
  })
})

describe('강사용 지도안 패널', () => {
  it('시간 배분 네 칸과 수업 목표를 보여준다', () => {
    const harness = result({ topic: '자전거' })
    render(<LessonPlanPanel pkg={harness.package} durationMinutes={90} />)
    expect(screen.getByText('도입')).toBeInTheDocument()
    expect(screen.getByText('안전·시범')).toBeInTheDocument()
    expect(screen.getByText('제작 실습')).toBeInTheDocument()
    expect(screen.getByText('정리·발표')).toBeInTheDocument()
    expect(screen.getByText('수업 목표')).toBeInTheDocument()
    expect(screen.getByText('70분')).toBeInTheDocument()
  })

  it('장비 수량을 읽지 못하면 확인 필요라고 적는다', () => {
    const harness = penHarness(spec({ equipment: ['3D펜', '필라멘트'] }), { authoredBy: 'pack' })
    render(<LessonPlanPanel pkg={harness.package} durationMinutes={90} />)
    expect(screen.getByText('수량 확인 필요')).toBeInTheDocument()
  })

  it('펜을 나눠 쓰면 교대 조 수를 적는다', () => {
    const harness = penHarness(spec({ student_count: 24, equipment: ['3D펜 6자루', 'PLA 필라멘트'] }), {
      authoredBy: 'pack',
    })
    render(<LessonPlanPanel pkg={harness.package} durationMinutes={90} />)
    expect(screen.getByText(/3D펜 6자루 · 교대 4조/)).toBeInTheDocument()
    expect(screen.getByText(/나눠 씁니다/)).toBeInTheDocument()
  })
})

describe('생성 결과 화면 — 패키지가 함께 그려진다', () => {
  const harness = result()

  const data = {
    status: harness.status,
    recipe_id: harness.recipe_id,
    reason: '바다 생물 주제에 맞는 검수된 실루엣입니다.',
    source: 'rule' as const,
    calibrated: false,
    rounds: harness.rounds,
    artifact: harness.artifact,
    spec: spec(),
    shape_source: 'pack' as const,
    nearest_note: harness.substitute_note,
    authored_by: 'pack' as const,
  }

  it('도안·사용법·지도안·검증 상태가 한 화면에 있다', () => {
    render(<GenerateResult data={data} demoAi={false} onReset={() => {}} />)
    expect(screen.getByText('무엇이 검증됐는가')).toBeInTheDocument()
    expect(screen.getByText('학생용 사용법')).toBeInTheDocument()
    expect(screen.getByText('강사용 수업 지도안')).toBeInTheDocument()
    expect(screen.getByText('도안')).toBeInTheDocument()
  })

  it('미리 만들어 둔 도안이라는 배지를 붙인다', () => {
    render(<GenerateResult data={data} demoAi={false} onReset={() => {}} />)
    expect(screen.getByText('미리 만들어 둔 검수된 도안')).toBeInTheDocument()
  })

  it('요청한 모양이 아니라는 고지를 지우지 않는다 (ADR-030)', () => {
    render(<GenerateResult data={data} demoAi={false} onReset={() => {}} />)
    // 띠 한 줄과 검증 결과의 지적 양쪽에 남는다 — 어느 쪽을 봐도 읽힌다
    expect(screen.getAllByText(/가장 가까운/).length).toBeGreaterThan(0)
  })

  it('명패로 떨어진 경우 그 사실을 배지로 적는다 (ADR-042)', () => {
    const fallback = penHarness(spec({ topic: '읽을수없는주제엑스와이지' }))
    render(
      <GenerateResult
        data={{
          ...data,
          artifact: fallback.artifact,
          rounds: fallback.rounds,
          status: fallback.status,
          shape_source: 'fallback',
          nearest_note: null,
        }}
        demoAi={false}
        onReset={() => {}}
      />,
    )
    expect(screen.getByText('이름 명패 · 요청한 모양이 아님')).toBeInTheDocument()
  })
})
