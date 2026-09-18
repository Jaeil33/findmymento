'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Input, Textarea } from '@/components/ui/Input'
import { Progress } from '@/components/ui/Progress'
import { IconArrowLeft, IconCheck } from '@/components/ui/Icons'
import { FIELDS, FIELD_UNSURE, type Grade, type GradeBand } from '@/types/domain'
import { RecommendResultView, type RecommendResponse } from './RecommendResultView'

/**
 * 설문 흐름. **한 화면에 한 문항**이고 진행률을 항상 보여준다 (SURVEY.md 설계 원칙 6).
 *
 * 화면의 주제는 "만족도 조사"가 아니라 "나에게 맞는 다음 교육 찾기"다. 제목·버튼 어디에도
 * 만족도 조사라는 말을 쓰지 않는다 (UI_GUIDE 안전규칙 8).
 *
 * 입력값은 브라우저에 임시 보관한다. 교실 통신이 끊겨 제출이 실패해도, 새로고침해도
 * 답이 날아가지 않아야 한다 (E-05).
 */

type Answers = {
  pseudoCode: string
  anonymous: boolean
  grade: Grade | null
  satisfaction: number | null
  followupIntent: number | null
  interestFields: string[]
  wantToLearn: string
  desiredJob: string
  availableTimes: string[]
}

const EMPTY: Answers = {
  pseudoCode: '',
  anonymous: false,
  grade: null,
  satisfaction: null,
  followupIntent: null,
  interestFields: [],
  wantToLearn: '',
  desiredJob: '',
  availableTimes: [],
}

const SATISFACTION = [
  { value: 5, label: '정말 좋았어요' },
  { value: 4, label: '좋았어요' },
  { value: 3, label: '보통이에요' },
  { value: 2, label: '그냥 그랬어요' },
  { value: 1, label: '별로였어요' },
]

const FOLLOWUP = [
  { value: 4, label: '많이 배워보고 싶어요' },
  { value: 3, label: '조금 배워보고 싶어요' },
  { value: 2, label: '잘 모르겠어요' },
  { value: 1, label: '아니요' },
]

const TIMES = ['평일 방과후', '토요일', '일요일', '방학 중', '잘 모르겠어요']

const GRADES: { band: GradeBand; label: string; years: number[] }[] = [
  { band: 'elementary', label: '초등', years: [1, 2, 3, 4, 5, 6] },
  { band: 'middle', label: '중등', years: [1, 2, 3] },
  { band: 'high', label: '고등', years: [1, 2, 3] },
]

type Step = 'entry' | 'grade' | 'satisfaction' | 'followup' | 'fields' | 'want' | 'job' | 'times'

export function SurveyFlow({
  entryCode,
  sessionTitle,
  sessionField,
  orgName,
  instructorName,
  pseudoCodeEnabled = true,
}: {
  entryCode: string
  sessionTitle: string
  sessionField: string
  orgName: string
  instructorName: string | null
  /**
   * 기관이 가명코드를 발급했는지. false 면 코드 입력 없이 "시작하기" 하나로 익명 참여한다 —
   * 교실 화면의 입장 코드 6자리를 학생이 "참여 코드" 칸에 그대로 넣는 혼동을 없앤다.
   */
  pseudoCodeEnabled?: boolean
}) {
  const storageKey = `fmm.survey.${entryCode}`
  const [answers, setAnswers] = useState<Answers>(EMPTY)
  const [stepIndex, setStepIndex] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [phase, setPhase] = useState<'form' | 'submitting' | 'result' | 'duplicate'>('form')
  const [result, setResult] = useState<RecommendResponse | null>(null)
  const [restored, setRestored] = useState(false)

  // ── 임시 보관 복원 (E-05)
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey)
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<Answers>
        setAnswers({ ...EMPTY, ...parsed })
        setRestored(true)
      }
    } catch {
      // 저장소를 못 쓰는 브라우저라도 설문 자체는 동작해야 한다.
    }
  }, [storageKey])

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(answers))
    } catch {
      /* 무시 */
    }
  }, [answers, storageKey])

  const steps = useMemo<Step[]>(() => {
    const base: Step[] = ['entry', 'grade', 'satisfaction', 'followup', 'fields']
    // 후속 의향이 낮은 학생에게 선택 문항을 묻지 않는다 (SURVEY.md 설계 원칙 4).
    if ((answers.followupIntent ?? 0) >= 3) base.push('want', 'job', 'times')
    return base
  }, [answers.followupIntent])

  const step = steps[Math.min(stepIndex, steps.length - 1)]!
  const isLast = stepIndex >= steps.length - 1

  /**
   * 진행 표시는 **필수 4문항과 선택 3문항을 나눠서** 보여준다.
   * 한 막대로 합치면 Q3을 답한 순간 `4/4` 가 `5/7` 로 튀어서 속았다는 인상을 준다.
   */
  const REQUIRED = 4
  const optional = stepIndex > REQUIRED
  const progress = optional
    ? { current: stepIndex - REQUIRED, total: steps.length - 1 - REQUIRED, label: '추가 질문 (선택)' }
    : { current: stepIndex, total: REQUIRED, label: '질문' }

  const patch = useCallback((p: Partial<Answers>) => {
    setAnswers((a) => ({ ...a, ...p }))
    setError(null)
  }, [])

  const next = useCallback(() => {
    setError(null)
    setStepIndex((i) => i + 1)
  }, [])

  const back = useCallback(() => {
    setError(null)
    setStepIndex((i) => Math.max(0, i - 1))
  }, [])

  const canAdvance = (() => {
    switch (step) {
      case 'entry':
        return answers.anonymous || /^\d{6}$/.test(answers.pseudoCode)
      case 'grade':
        return answers.grade !== null
      case 'satisfaction':
        return answers.satisfaction !== null
      case 'followup':
        return answers.followupIntent !== null
      case 'fields':
        return answers.interestFields.length > 0
      default:
        return true
    }
  })()

  async function submit() {
    if (!answers.grade || !answers.satisfaction || !answers.followupIntent) return
    setPhase('submitting')
    setError(null)

    const payload = {
      entryCode,
      pseudoCode: answers.anonymous ? null : answers.pseudoCode,
      grade: answers.grade,
      satisfaction: answers.satisfaction,
      followupIntent: answers.followupIntent,
      interestFields: answers.interestFields,
      wantToLearn: answers.wantToLearn,
      desiredJob: answers.desiredJob,
      availableTimes: answers.availableTimes,
    }

    try {
      const res = await fetch('/api/survey', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = (await res.json()) as {
        ok: boolean
        reason?: string
        message?: string
        responseId?: string
      }

      if (!data.ok) {
        if (data.reason === 'duplicate') {
          setPhase('duplicate')
          return
        }
        setError(data.message ?? '제출하지 못했어요. 다시 시도해 주세요.')
        setPhase('form')
        return
      }

      // 응답 id 를 추천 요청에 싣는다 — 학생에게 무엇을 보여 줬는지 기록이 이 응답에 이어진다.
      await loadRecommendation({ ...payload, responseId: data.responseId ?? null })
    } catch {
      setError('인터넷 연결이 끊긴 것 같아요. 답은 저장해 뒀으니 다시 시도해 주세요.')
      setPhase('form')
    }
  }

  async function loadRecommendation(payload: Record<string, unknown>) {
    try {
      const res = await fetch('/api/recommend', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = (await res.json()) as RecommendResponse
      setResult(data.ok ? data : null)
    } catch {
      setResult(null)
    }
    // 제출은 이미 성공했다. 추천을 못 받아도 결과 화면으로 간다 (E-06).
    setPhase('result')
    try {
      window.localStorage.removeItem(storageKey)
    } catch {
      /* 무시 */
    }
  }

  // ── 결과 / 중복 응답 ────────────────────────────────────
  if (phase === 'result') {
    return (
      <RecommendResultView
        result={result}
        entryCode={entryCode}
        pseudoCode={answers.anonymous ? null : answers.pseudoCode}
        grade={answers.grade!}
        orgName={orgName}
        sessionField={sessionField}
      />
    )
  }

  if (phase === 'duplicate') {
    return (
      <div className="animate-fade-in space-y-5">
        <div className="flex items-center gap-2 text-point">
          <IconCheck width={20} height={20} />
          <p className="text-sm font-medium">이미 응답했어요</p>
        </div>
        <h1 className="text-xl leading-snug font-semibold text-ink">
          이 수업에는 이미 답을 남겼어요
        </h1>
        <p className="text-base leading-relaxed text-body">
          같은 수업에는 한 번만 답할 수 있어요. 더 배우고 싶은 게 생겼다면 공개 Q&amp;A에 물어보거나,
          우리 지역 프로그램을 둘러볼 수 있어요.
        </p>
        <div className="space-y-2.5 pt-2">
          <Link
            href="/qna"
            className="flex min-h-12 w-full items-center justify-center rounded-lg bg-point text-base font-medium text-white"
          >
            공개 Q&amp;A에서 물어보기
          </Link>
          <Link
            href="/programs"
            className="flex min-h-12 w-full items-center justify-center rounded-lg border border-line-strong bg-card text-base font-medium text-body"
          >
            우리 지역 프로그램 보기
          </Link>
        </div>
      </div>
    )
  }

  // ── 설문 ──────────────────────────────────────────────
  return (
    <div className="space-y-7">
      <header className="space-y-3">
        {step === 'entry' ? (
          <>
            <p className="text-xs font-medium text-point">
              {orgName}
              {instructorName ? ` · ${instructorName} 강사` : ''}
            </p>
            <h1 className="text-xl leading-snug font-semibold tracking-tight text-ink">
              나에게 맞는 다음 교육 찾기
            </h1>
            <p className="text-base leading-relaxed text-body">
              오늘 들은 <span className="font-medium text-ink">{sessionTitle}</span> 수업에 대해 몇
              가지만 물어볼게요. 3분이면 끝나고, 바로 나한테 맞는 다음 교육을 알려줄게요.
            </p>
          </>
        ) : (
          <Progress current={progress.current} total={progress.total} label={progress.label} />
        )}
      </header>

      <div key={step} className="animate-slide-up space-y-5">
        {step === 'entry' && !pseudoCodeEnabled ? (
          <Button
            size="student"
            onClick={() => {
              patch({ anonymous: true, pseudoCode: '' })
              setStepIndex(1)
            }}
          >
            시작하기
          </Button>
        ) : null}

        {step === 'entry' && pseudoCodeEnabled ? (
          <div className="space-y-4">
            <Input
              label="참여 코드 6자리"
              size="student"
              inputMode="numeric"
              maxLength={6}
              value={answers.pseudoCode}
              onChange={(e) =>
                patch({
                  pseudoCode: e.target.value.replace(/\D/g, '').slice(0, 6),
                  anonymous: false,
                })
              }
              hint="선생님이 나눠준 번호예요. 이 번호로 내 기록이 이어져요."
              placeholder="예) 481000"
            />
            <div className="flex items-center gap-3">
              <span className="h-px flex-1 bg-line" />
              <span className="text-xs text-faint">또는</span>
              <span className="h-px flex-1 bg-line" />
            </div>
            <Button
              variant="secondary"
              size="student"
              onClick={() => {
                patch({ anonymous: true, pseudoCode: '' })
                setStepIndex(1)
              }}
            >
              코드 없이 참여하기
            </Button>
            <p className="text-xs leading-relaxed text-sub">
              코드가 없어도 괜찮아요. 추천은 똑같이 받을 수 있고, 다음에 들을 수업 기록만 이어지지
              않아요.
            </p>
          </div>
        ) : null}

        {step === 'grade' ? (
          <fieldset>
            <legend className="text-xl leading-snug font-semibold text-ink">
              몇 학년이에요?
            </legend>
            <div className="mt-5 space-y-4">
              {GRADES.map((g) => (
                <div key={g.band}>
                  <p className="mb-2 text-sm font-medium text-sub">{g.label}</p>
                  <div className="flex flex-wrap gap-2">
                    {g.years.map((y) => (
                      <Chip
                        key={y}
                        selected={answers.grade?.band === g.band && answers.grade?.year === y}
                        onClick={() => patch({ grade: { band: g.band, year: y } })}
                        className="min-w-14"
                      >
                        {y}학년
                      </Chip>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </fieldset>
        ) : null}

        {step === 'satisfaction' ? (
          <fieldset>
            <legend className="text-xl leading-snug font-semibold text-ink">
              오늘 수업 어땠어요?
            </legend>
            <div className="mt-5 space-y-2.5">
              {SATISFACTION.map((o) => (
                <OptionRow
                  key={o.value}
                  selected={answers.satisfaction === o.value}
                  onClick={() => patch({ satisfaction: o.value })}
                  label={o.label}
                />
              ))}
            </div>
          </fieldset>
        ) : null}

        {step === 'followup' ? (
          <fieldset>
            <legend className="text-xl leading-snug font-semibold text-ink">
              이 분야를 <span className="text-point">더 배워보고 싶어요?</span>
            </legend>
            <p className="mt-2 text-sm leading-relaxed text-sub">
              솔직하게 답해도 괜찮아요. 아니라고 해도 아무 일도 생기지 않아요.
            </p>
            <div className="mt-5 space-y-2.5">
              {FOLLOWUP.map((o) => (
                <OptionRow
                  key={o.value}
                  selected={answers.followupIntent === o.value}
                  onClick={() => patch({ followupIntent: o.value })}
                  label={o.label}
                />
              ))}
            </div>
          </fieldset>
        ) : null}

        {step === 'fields' ? (
          <fieldset>
            <legend className="text-xl leading-snug font-semibold text-ink">
              어떤 걸 더 배워보고 싶어요?
            </legend>
            <p className="mt-2 text-sm text-sub">최대 3개까지 고를 수 있어요.</p>
            <div className="mt-5 flex flex-wrap gap-2">
              {FIELDS.map((f) => (
                <Chip
                  key={f}
                  selected={answers.interestFields.includes(f)}
                  onClick={() => {
                    const has = answers.interestFields.includes(f)
                    const without = answers.interestFields.filter(
                      (x) => x !== f && x !== FIELD_UNSURE,
                    )
                    if (has) patch({ interestFields: without })
                    else if (without.length < 3) patch({ interestFields: [...without, f] })
                    else setError('3개까지만 고를 수 있어요.')
                  }}
                >
                  {f}
                </Chip>
              ))}
              {/* 단독 선택. 고르면 나머지는 해제된다. */}
              <Chip
                selected={answers.interestFields.includes(FIELD_UNSURE)}
                onClick={() =>
                  patch({
                    interestFields: answers.interestFields.includes(FIELD_UNSURE)
                      ? []
                      : [FIELD_UNSURE],
                  })
                }
              >
                {FIELD_UNSURE}
              </Chip>
            </div>
          </fieldset>
        ) : null}

        {step === 'want' ? (
          <div>
            <Textarea
              label="구체적으로 어떤 걸 배우고 싶어요?"
              size="student"
              maxLength={200}
              counter={{ value: answers.wantToLearn.length, max: 200 }}
              value={answers.wantToLearn}
              onChange={(e) => patch({ wantToLearn: e.target.value })}
              placeholder="자유롭게 써 주세요. 안 써도 괜찮아요."
              hint="이 내용으로 추천을 더 잘 찾아줄 수 있어요. 선택이에요."
            />
            <p className="mt-2 text-xs leading-relaxed text-sub">
              이름·학교·연락처는 쓰지 않아도 돼요. 혹시 적으면 저장하기 전에 지워요.
            </p>
          </div>
        ) : null}

        {step === 'job' ? (
          <Input
            label="혹시 관심 있는 직업이 있어요?"
            size="student"
            maxLength={50}
            value={answers.desiredJob}
            onChange={(e) => patch({ desiredJob: e.target.value })}
            placeholder="없으면 비워 두세요"
            hint="선택이에요."
          />
        ) : null}

        {step === 'times' ? (
          <fieldset>
            <legend className="text-xl leading-snug font-semibold text-ink">
              후속 수업이 열린다면 언제 참여할 수 있어요?
            </legend>
            <p className="mt-2 text-sm text-sub">여러 개 고를 수 있어요. 선택이에요.</p>
            <div className="mt-5 flex flex-wrap gap-2">
              {TIMES.map((t) => (
                <Chip
                  key={t}
                  selected={answers.availableTimes.includes(t)}
                  onClick={() =>
                    patch({
                      availableTimes: answers.availableTimes.includes(t)
                        ? answers.availableTimes.filter((x) => x !== t)
                        : [...answers.availableTimes, t],
                    })
                  }
                >
                  {t}
                </Chip>
              ))}
            </div>
          </fieldset>
        ) : null}
      </div>

      {restored && stepIndex === 0 ? (
        <p className="rounded-md border border-line bg-muted px-3.5 py-2.5 text-xs leading-relaxed text-body">
          쓰던 답을 그대로 불러왔어요. 이어서 하면 돼요.
        </p>
      ) : null}

      {error ? (
        <p className="rounded-md border border-negative/25 bg-negative-bg px-3.5 py-2.5 text-sm leading-relaxed text-negative">
          {error}
        </p>
      ) : null}

      {step !== 'entry' || (pseudoCodeEnabled && answers.pseudoCode.length > 0) ? (
        <div className="space-y-3">
          <Button
            size="student"
            disabled={!canAdvance || phase === 'submitting'}
            onClick={isLast ? submit : next}
          >
            {phase === 'submitting'
              ? '추천을 찾고 있어요'
              : isLast
                ? '내 추천 받기'
                : step === 'entry'
                  ? '시작하기'
                  : '다음'}
          </Button>

          {stepIndex > 0 ? (
            <button
              type="button"
              onClick={back}
              className="mx-auto flex min-h-11 items-center gap-1.5 px-2 text-sm text-sub hover:text-ink"
            >
              <IconArrowLeft width={16} height={16} />
              이전 질문
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

/** 학생 화면 선택지. 터치 타깃 48px 이상, 글자 16px. */
function OptionRow({
  selected,
  onClick,
  label,
}: {
  selected: boolean
  onClick: () => void
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={
        'flex min-h-13 w-full items-center justify-between gap-3 rounded-xl border px-4 py-3.5 text-left text-base transition-colors ' +
        (selected
          ? 'border-point bg-point-bg font-medium text-point'
          : 'border-line bg-card text-body active:bg-muted')
      }
    >
      <span>{label}</span>
      {selected ? <IconCheck className="shrink-0" /> : null}
    </button>
  )
}
