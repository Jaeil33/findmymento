import type { FollowupPlanDraft, ResultReportDraft, SessionDebriefDraft } from '@/types/domain'

/**
 * 수업 후 AI 초안의 복사용 평문 (ADR-024).
 *
 * 초안은 저장하지 않으므로 담당자·강사가 가져가는 방법은 복사뿐이다. 붙여 넣는 곳이 한글 문서·메일·
 * 기안 본문이라 마크다운 기호 없이 대괄호 제목과 줄바꿈만 쓴다.
 *
 * 숫자는 초안의 값을 그대로 옮기고 새로 계산하지 않는다 — 보고서의 숫자는 규칙이 확정한 값이어야 한다.
 * 표본 부족으로 비어 있는 값은 `표본 부족`으로 쓰고, 비어 있는 섹션은 줄째 뺀다.
 */

export const SAMPLE_SHORT = '표본 부족'

export type ReportSection = {
  key: 'outcomes' | 'student_voice' | 'improvements' | 'next_steps'
  /** `1. 운영 성과` — 보이는 섹션 기준 번호 */
  heading: string
  items: string[]
}

const SECTION_TITLES = [
  ['outcomes', '운영 성과'],
  ['student_voice', '학생 의견'],
  ['improvements', '개선점'],
  ['next_steps', '향후 계획'],
] as const

/**
 * 결과보고서 본문의 번호 섹션. 빈 목록은 섹션째 빼고 번호는 남은 섹션 기준으로 다시 매긴다.
 * 화면과 복사본이 같은 함수를 써서 번호가 어긋나지 않게 한다.
 */
export function reportSections(draft: ResultReportDraft): ReportSection[] {
  return SECTION_TITLES.map(([key, title]) => ({
    key,
    title,
    items: draft[key].filter((item) => item.trim() !== ''),
  }))
    .filter((s) => s.items.length > 0)
    .map(({ key, title, items }, i) => ({ key, heading: `${i + 1}. ${title}`, items }))
}

/** 만족도 평균은 화면과 복사본 모두 소수 첫째 자리로 쓴다. */
export function formatAverage(value: number): string {
  return value.toFixed(1)
}

function notices(list: readonly string[]): string[] {
  return list.filter((n) => n.trim() !== '').map((n) => `※ ${n}`)
}

function joinBlocks(blocks: string[][]): string {
  return blocks
    .filter((b) => b.length > 0)
    .map((b) => b.join('\n'))
    .join('\n\n')
}

export function resultReportToText(draft: ResultReportDraft): string {
  const m = draft.metrics

  const followup =
    m.followup_high_count === null
      ? SAMPLE_SHORT
      : m.followup_high_pct === null
        ? `${m.followup_high_count}건`
        : `${m.followup_high_count}건 (${m.followup_high_pct}%)`

  const metrics = [
    '[주요 지표]',
    `응답 수: ${m.response_count}건 (예상 인원 ${m.expected}명)`,
    `응답률: ${m.response_rate_pct}%`,
    `만족도 평균: ${m.satisfaction_avg === null ? SAMPLE_SHORT : `${formatAverage(m.satisfaction_avg)} / 5`}`,
    `더 배우고 싶다(후속 의향 3점 이상): ${followup}`,
  ]
  if (m.top_fields.length > 0) {
    metrics.push(`관심 분야 상위: ${m.top_fields.map((f) => `${f.field} ${f.count}명`).join(' · ')}`)
  } else if (!draft.sample_sufficient) {
    metrics.push(`관심 분야 상위: ${SAMPLE_SHORT}`)
  }

  const record = draft.record_reference.trim()

  return joinBlocks([
    [draft.title],
    ['[운영 개요]', ...draft.overview.map((o) => `${o.label}: ${o.value}`)],
    metrics,
    ...reportSections(draft).map((s) => [s.heading, ...s.items.map((item) => `- ${item}`)]),
    record ? ['[창체 진로활동 기록 참고 문구 (회차 단위)]', record] : [],
    notices(draft.notices),
  ])
}

/** 섭외 요청 화면의 요청 메모에 붙여 넣는 문안 그대로. 문안이 없으면 ''. */
export function followupMessageToText(draft: FollowupPlanDraft): string {
  return draft.request_message
}

/**
 * `요약 복사` 버튼이 쓰는 학교 제출용 요약. 잘 된 점·바꿀 점은 **강사 자신을 위한 집계**라 넣지 않고,
 * 초안 고지문은 붙여 넣은 곳에서도 초안임이 보이도록 같이 싣는다.
 */
export function debriefToText(draft: SessionDebriefDraft): string {
  const summary = draft.school_summary.trim()
  return joinBlocks([
    summary ? ['[학교 제출용 결과 요약]', summary] : [],
    notices(draft.notices),
  ])
}
