'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/Input'
import { Panel } from '@/components/ui/Section'
import { IconArrowRight, IconCheck, IconMapPin } from '@/components/ui/Icons'
import {
  GRADE_BAND_LABEL,
  PROGRAM_FORMAT_LABEL,
  type Field,
  type GradeBand,
  type InquiryAssistDraft,
} from '@/types/domain'

/**
 * 보호자 문의 도우미 (ADR-026).
 *
 * 문의 폼 **안에** 들어가 폼의 지역·학년대·분야를 함께 보내고, 보호자가 누를 때만 결과를 폼에 채운다.
 *
 * - 자기 API 라우트만 부른다. LLM 을 클라이언트에서 부르지 않는다.
 * - 문의를 접수하지 않는다. 접수는 폼의 기존 버튼뿐이다.
 * - 설명·초안을 브라우저 저장소에 남기지 않는다. 공용 PC 에서 다음 사람이 아이 이야기를 보면 안 된다.
 * - 프로그램은 공개 상세 링크뿐이고 "추천"·"인기" 같은 배지를 달지 않는다 (ADR-009).
 */

const MIN_LENGTH = 5
const MAX_LENGTH = 500

/** 시연 모드 전용 예시. 이름·학교가 들어 있어 가림 처리가 화면에서 실제로 보인다. */
const DEMO_EXAMPLE =
  '중학교 2학년 아들이에요. 이름은 민준이고 광명하안중학교 다녀요. 학교에서 드론 특강을 듣고 나서 영상 찍는 데 푹 빠졌어요. 주말에 다닐 수 있는 수업이 있을까요?'

export type InquiryAssistApply = Pick<InquiryAssistDraft, 'grade_band' | 'field' | 'message'>

export function InquiryAssist({
  regionCode,
  gradeBand,
  field,
  demoAi = false,
  onApply,
}: {
  regionCode: string
  gradeBand: GradeBand | ''
  field: Field | ''
  /** 서버가 판단한 시연 모드 여부 (ADR-025). */
  demoAi?: boolean
  onApply: (draft: InquiryAssistApply) => void
}) {
  const [situation, setSituation] = useState('')
  const [draft, setDraft] = useState<InquiryAssistDraft | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [applied, setApplied] = useState(false)

  const ready = situation.trim().length >= MIN_LENGTH

  async function run() {
    setError(null)
    setApplied(false)
    setPending(true)
    try {
      const res = await fetch('/api/inquiry-assist', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          situation,
          regionCode,
          gradeBand: gradeBand || null,
          field: field || null,
        }),
      })
      const data = (await res.json()) as { ok?: boolean; message?: string; draft?: InquiryAssistDraft }
      if (!res.ok || !data.ok || !data.draft) {
        setError(data.message ?? '정리하지 못했어요. 아래 폼을 직접 채워 주셔도 됩니다.')
        return
      }
      setDraft(data.draft)
    } catch {
      setError('인터넷 연결이 끊긴 것 같아요. 다시 시도해 주세요.')
    } finally {
      setPending(false)
    }
  }

  const sourceText =
    draft?.source === 'llm'
      ? demoAi
        ? '시연용 AI 문장입니다'
        : 'AI가 문장을 정리했습니다'
      : '적어 주신 조건으로 만들었습니다'

  return (
    <div role="region" aria-label="문의 도우미">
      <Panel
        title="무엇을 적어야 할지 막막하다면"
        description="아이가 어떤 수업을 듣고 무엇에 관심을 보였는지 편하게 적어 주세요. 학년대·분야·시간대를 정리하고, 가까운 프로그램과 문의 글 초안을 만들어 드립니다."
      >
        <Textarea
          label="아이 상황 설명"
          hint="아이 이름·학교는 적지 않으셔도 됩니다. 적으셨다면 정리할 때 뺍니다. 이 칸은 저장되지 않습니다."
          maxLength={MAX_LENGTH}
          counter={{ value: situation.length, max: MAX_LENGTH }}
          value={situation}
          onChange={(e) => setSituation(e.target.value)}
          placeholder="예) 학교에서 드론 특강을 듣고 나서 영상 찍는 데 관심이 생겼어요. 주말에 다닐 수 있으면 좋겠어요."
        />

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button type="button" variant="secondary" onClick={run} disabled={!ready || pending}>
            {pending ? '정리하는 중…' : '문의 내용 정리하기'}
          </Button>
          {demoAi ? (
            <Button type="button" variant="text" onClick={() => setSituation(DEMO_EXAMPLE)}>
              예시 문장 넣기
            </Button>
          ) : null}
        </div>

        {error ? <p className="mt-3 text-sm text-negative">{error}</p> : null}

        {draft ? (
          <div className="mt-5 space-y-5 border-t border-line pt-4">
            <p className="text-xs font-medium text-sub">{sourceText}</p>

            <div>
              <p className="text-sm font-medium text-ink">정리한 조건</p>
              <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-3">
                <Condition label="학년대" value={draft.grade_band ? GRADE_BAND_LABEL[draft.grade_band] : null} />
                <Condition label="관심 분야" value={draft.field} />
                <Condition
                  label="희망 시간대"
                  value={draft.times.length > 0 ? draft.times.join(' · ') : null}
                  empty="적지 않음"
                />
              </dl>
              {!draft.field ? (
                <p className="mt-2 text-xs leading-relaxed text-sub">
                  관심 분야를 글에서 찾지 못했습니다. 아래 폼에서 직접 골라 주세요.
                </p>
              ) : null}
            </div>

            {draft.field ? (
              <div>
                <p className="text-sm font-medium text-ink">조건에 맞는 프로그램</p>
                {draft.stage_message ? (
                  <p className="mt-1 text-sm leading-relaxed text-body">{draft.stage_message}</p>
                ) : null}
                {draft.matches.length > 0 ? (
                  <ul className="mt-2 space-y-2">
                    {draft.matches.map((m) => (
                      <li key={m.program_id}>
                        <Link
                          href={`/programs/${m.program_id}`}
                          className="flex items-center justify-between gap-3 rounded-md border border-line bg-card px-3.5 py-3 transition-colors hover:border-point"
                        >
                          <span className="min-w-0">
                            <span className="block text-sm font-medium text-ink">{m.title}</span>
                            <span className="mt-1 flex flex-wrap items-center gap-1 text-xs text-body">
                              <IconMapPin width={13} height={13} className="shrink-0" />
                              {`${m.region_label} · ${PROGRAM_FORMAT_LABEL[m.format]} ${m.session_count}회 · ${m.instructor_name} 강사`}
                            </span>
                          </span>
                          <IconArrowRight width={16} height={16} className="shrink-0 text-faint" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 rounded-md border border-caution/30 bg-caution-bg px-3.5 py-3 text-sm leading-relaxed text-body">
                    그래도 문의를 남겨 주세요. 운영자가 확인하고, 이 분야 강사를 새로 찾는 근거로 씁니다.
                  </p>
                )}
              </div>
            ) : null}

            <div>
              <p className="text-sm font-medium text-ink">문의 내용 초안</p>
              <p className="mt-2 rounded-md border border-line bg-muted px-3.5 py-3 text-sm leading-relaxed text-body">
                {draft.message}
              </p>
            </div>

            <div role="note" className="rounded-md border border-caution/30 bg-caution-bg px-3.5 py-3 text-xs">
              <ul className="space-y-1 leading-relaxed text-body">
                {draft.notices.map((n, i) => (
                  <li key={n} className={i === 0 ? 'font-semibold text-ink' : undefined}>
                    {n}
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                onClick={() => {
                  onApply({ grade_band: draft.grade_band, field: draft.field, message: draft.message })
                  setApplied(true)
                }}
              >
                이 내용으로 폼 채우기
              </Button>
              {applied ? (
                <span className="inline-flex items-center gap-1 text-xs text-point">
                  <IconCheck width={14} height={14} />
                  폼에 채웠습니다. 아래에서 확인해 주세요.
                </span>
              ) : null}
            </div>
          </div>
        ) : null}
      </Panel>
    </div>
  )
}

function Condition({ label, value, empty = '확인 필요' }: { label: string; value: string | null; empty?: string }) {
  return (
    <div className="rounded-md border border-line bg-card px-3 py-2">
      <dt className="text-xs text-sub">{label}</dt>
      <dd className={value ? 'mt-0.5 font-medium text-ink' : 'mt-0.5 text-body'}>{value ?? empty}</dd>
    </div>
  )
}
