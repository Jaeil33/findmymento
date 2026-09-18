'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { IconCheck, IconMapPin } from '@/components/ui/Icons'
import { PROGRAM_FORMAT_LABEL, type Grade, type ProgramFormat } from '@/types/domain'
import { CareerCards, type CareerCardItem } from './CareerCards'

export type RecommendItem = {
  programId: string
  instructorId: string
  title: string
  field: string
  format: ProgramFormat
  sessionCount: number
  summary: string
  instructorName: string
  providerName: string | null
  regionLabel: string
  distance: 0 | 1 | 2
  reason: string
}

export type RecommendResponse = {
  ok: boolean
  source?: 'llm' | 'rule'
  stage?: 'same' | 'adjacent' | 'two_hop' | 'none'
  regionName?: string
  stageMessage?: string
  unmetFields?: string[]
  items?: RecommendItem[]
  /** 추천할 수업이 0건일 때만 채워진다 (ADR-027). */
  careers?: CareerCardItem[]
}

/**
 * 학생 결과 화면. **이 화면이 학생이 QR 을 찍은 이유다.**
 *
 * 카드에 강사 사진·연락처·평점이 없다. 가치는 "추천 이유 한 줄"이다.
 * "AI가 분석했어요" 같은 배지를 붙이지 않는다 (UI_GUIDE 안티패턴).
 *
 * 추천이 0건이면 Q&A 유도를 가장 크게 둔다 — 파일럿에서 과반으로 예상되는 경로다 (E-07).
 * 단 진로 카드가 왔으면 진로 카드가 화면의 주인공이다 (ADR-027). 다음 행동은 교실의 선생님에게
 * 말하는 것이고, 누를 버튼은 없다.
 */
export function RecommendResultView({
  result,
  entryCode,
  pseudoCode,
  grade,
  orgName,
  sessionField,
}: {
  result: RecommendResponse | null
  entryCode: string
  pseudoCode: string | null
  grade: Grade
  orgName: string
  sessionField: string
}) {
  const items = result?.items ?? []
  const careers = result?.careers ?? []
  const showCareers = items.length === 0 && careers.length > 0
  const unmet = (result?.unmetFields ?? []).filter((f) => f !== '아직 잘 모르겠어요')

  return (
    <div className="animate-fade-in space-y-7">
      <header className="space-y-2.5">
        <div className="flex items-center gap-2 text-point">
          <IconCheck width={18} height={18} />
          <p className="text-sm font-medium">답 고마워요</p>
        </div>
        <h1 className="text-xl leading-snug font-semibold tracking-tight text-ink">
          {items.length > 0
            ? '나에게 맞는 다음 교육'
            : showCareers
              ? '오늘 수업과 이어지는 진로'
              : '지금은 바로 들을 수업이 없어요'}
        </h1>
        {showCareers ? (
          <p className="text-sm leading-relaxed text-body">
            답해 준 내용을 보고 오늘 배운 {sessionField} 수업과 이어지는 직업을 골라 봤어요.
          </p>
        ) : result?.stageMessage ? (
          <p className="text-sm leading-relaxed text-body">{result.stageMessage}</p>
        ) : null}
      </header>

      {items.length > 0 ? (
        <ul className="space-y-4">
          {items.map((item) => (
            <li key={item.programId}>
              <ResultCard
                item={item}
                entryCode={entryCode}
                pseudoCode={pseudoCode}
                grade={grade}
                orgName={orgName}
              />
            </li>
          ))}
        </ul>
      ) : showCareers ? (
        <div className="space-y-5">
          <CareerCards items={careers} />
          <div className="rounded-xl border border-line bg-muted px-5 py-4">
            <p className="text-sm leading-relaxed text-body">
              더 배우고 싶은 게 생기면 {orgName} 선생님께 말해 주세요.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="rounded-xl border border-line bg-card p-5">
            <p className="text-base leading-relaxed text-body">
              {sessionField}
              {unmet.length > 0 ? ` · ${unmet.join(' · ')}` : ''} 를 더 배우고 싶다고 한 건 기록해
              뒀어요. 우리 지역에 이 분야 선생님이 생기면 {orgName} 선생님이 알려줄 거예요.
            </p>
          </div>

          <div className="space-y-2.5">
            <Link
              href="/qna"
              className="flex min-h-14 w-full items-center justify-center rounded-xl bg-point text-base font-semibold text-white"
            >
              지역 강사에게 직접 물어보기
            </Link>
            <p className="text-center text-xs leading-relaxed text-sub">
              공개 Q&amp;A에 질문을 남기면 지역 강사가 답변해요. 질문과 답변은 모두에게 공개돼요.
            </p>
          </div>

          <Link
            href="/programs"
            className="flex min-h-12 w-full items-center justify-center rounded-lg border border-line-strong bg-card text-base font-medium text-body"
          >
            다른 지역 프로그램도 보기
          </Link>
        </div>
      )}

      {showCareers ? (
        <footer className="border-t border-line pt-5 text-xs leading-relaxed text-sub">
          <p>직업 소개는 누구나 확인할 수 있는 일반적인 내용을 담았어요.</p>
        </footer>
      ) : (
        <footer className="space-y-2 border-t border-line pt-5 text-xs leading-relaxed text-sub">
          <p>
            선생님 연락처는 알려주지 않아요. 수업을 듣고 싶으면 {orgName} 선생님이 보호자님께 먼저
            확인해요.
          </p>
          <p>
            궁금한 건{' '}
            <Link href="/qna" className="underline underline-offset-4 hover:text-ink">
              공개 Q&amp;A
            </Link>
            에 남기면 돼요.
          </p>
        </footer>
      )}
    </div>
  )
}

function ResultCard({
  item,
  entryCode,
  pseudoCode,
  grade,
  orgName,
}: {
  item: RecommendItem
  entryCode: string
  pseudoCode: string | null
  grade: Grade
  orgName: string
}) {
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'error'>('idle')
  const [message, setMessage] = useState<string | null>(null)

  async function express() {
    setState('sending')
    try {
      const res = await fetch('/api/interest', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ entryCode, pseudoCode, grade, programId: item.programId }),
      })
      const data = (await res.json()) as { ok: boolean; message?: string }
      if (data.ok) {
        setMessage(data.message ?? null)
        setState('done')
      } else {
        setMessage(data.message ?? '전달하지 못했어요. 다시 시도해 주세요.')
        setState('error')
      }
    } catch {
      setMessage('인터넷 연결이 끊긴 것 같아요. 다시 시도해 주세요.')
      setState('error')
    }
  }

  return (
    <article className="rounded-xl border border-line bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <Badge tone="point">{item.field}</Badge>
        {item.distance === 0 ? <Badge tone="positive">우리 동네</Badge> : null}
      </div>

      <h2 className="mt-3 text-base leading-snug font-semibold text-ink">{item.title}</h2>

      {/* 추천 이유 한 줄 — 이 카드에서 가장 중요한 문장이다. */}
      <p className="mt-2.5 border-l-2 border-point pl-3 text-sm leading-relaxed text-body">
        {item.reason}
      </p>

      <dl className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-sub">
        <div className="flex items-center gap-1.5">
          <IconMapPin width={14} height={14} />
          <dt className="sr-only">지역</dt>
          <dd className="font-medium text-body">{item.regionLabel}</dd>
        </div>
        <div>
          <dt className="sr-only">형태</dt>
          <dd className="tabular-nums">
            {PROGRAM_FORMAT_LABEL[item.format]} {item.sessionCount}회
          </dd>
        </div>
        <div>
          <dt className="sr-only">강사</dt>
          <dd>
            {item.instructorName} 강사
            {item.providerName ? ` · ${item.providerName}` : ''}
          </dd>
        </div>
      </dl>

      {state === 'done' ? (
        <div className="mt-4 rounded-lg border border-point-line bg-point-bg px-4 py-3">
          <p className="flex items-center gap-1.5 text-sm font-medium text-point">
            <IconCheck width={16} height={16} />
            전달했어요
          </p>
          <p className="mt-1 text-xs leading-relaxed text-body">
            {message ?? `${orgName} 선생님께 전달됐어요.`}
          </p>
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          <Button size="student" onClick={express} disabled={state === 'sending'}>
            {state === 'sending' ? '전달하고 있어요' : '더 배우고 싶어요'}
          </Button>
          <p className="text-xs leading-relaxed text-sub">
            누르면 {orgName} 선생님께 전달돼요. 선생님에게 바로 가지 않고, 보호자님 확인을 거쳐요.
          </p>
          {state === 'error' && message ? (
            <p className="text-xs text-negative">{message}</p>
          ) : null}
        </div>
      )}
    </article>
  )
}
