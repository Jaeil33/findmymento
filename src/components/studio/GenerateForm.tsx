'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AssistProgress } from '@/components/ai/AssistProgress'
import { GenerateResult, type GenerateResultData } from '@/components/studio/GenerateResult'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Input, Select } from '@/components/ui/Input'
import { VENUES, GRADE_BAND_LABEL, type GradeBand, type Venue } from '@/types/domain'
import { SHAPE_FORMS, SHAPE_FORM_LABEL, type ShapeForm } from '@/types/studio'

/**
 * 생성 폼. **회차를 고르면 수업 조건 입력이 닫힌다** — 학년대·인원·시수·장소·장비는 기관이
 * 입력한 회차 값이 정하고 강사는 읽기만 한다 (ADR-015·016). 서버도 같은 규칙으로 본문을 무시한다.
 *
 * 이 컴포넌트는 LLM 을 직접 부르지 않는다. `/api/studio/generate` 만 부른다
 * (CLAUDE.md 아키텍처 규칙).
 */

export type SessionOption = {
  id: string
  label: string
  /** 회차가 정하는 수업 조건 요약. 강사에게 그대로 보여준다 */
  conditions: string
}

export type RecipeOption = { id: string; title: string; difficulty: number }

/**
 * 진행 단계. 2D 와 3D 가 지나는 길이 다르므로 문구도 다르다 (ADR-036·037).
 * 실제로 하지 않는 일을 적지 않는다 — 기다리는 동안 보는 유일한 설명이다.
 */
const STAGES: Record<ShapeForm, string[]> = {
  flat: [
    '수업 조건 확인',
    '검수된 실루엣 찾기',
    '없으면 윤곽 제안받기',
    '좌표·치수 만들기',
    '검증하고 모양 확인하기',
  ],
  solid: [
    '수업 조건 확인',
    '검수된 도안 후보 고르기',
    '좌표·치수 만들기',
    '검증하고 필요하면 고치기',
  ],
}

/** 고른 모드가 **무엇을 만들어 주는지**를 한 줄로 적는다. 2D·3D 는 결과물이 다르다 */
const FORM_HINT: Record<ShapeForm, string> = {
  flat: '윤곽 한 장을 그려 떼어냅니다. 키링·명패·장식으로 쓰고, 짧은 시수에서도 끝납니다.',
  solid:
    '부품을 조립하거나, 같은 모양을 여러 장 겹쳐 두께를 만듭니다. 그리는 시간이 더 걸립니다.',
}

type Failure = { message: string; field?: string }

export function GenerateForm({
  sessions,
  recipes,
  lineageId = null,
  defaultTopic = '',
  defaultSessionId = '',
  demoAi = false,
}: {
  sessions: SessionOption[]
  recipes: RecipeOption[]
  lineageId?: string | null
  defaultTopic?: string
  defaultSessionId?: string
  /** 시연용 문장을 쓰는 세션인가. 결과 화면이 실제 AI 처럼 표시하지 않기 위해 받는다 (ADR-025) */
  demoAi?: boolean
}) {
  const router = useRouter()
  const [topic, setTopic] = useState(defaultTopic)
  const [sessionId, setSessionId] = useState(defaultSessionId)
  const [gradeBand, setGradeBand] = useState<GradeBand>('middle')
  const [studentCount, setStudentCount] = useState('20')
  const [durationMinutes, setDurationMinutes] = useState('90')
  const [venue, setVenue] = useState<Venue>('교실')
  const [equipment, setEquipment] = useState('3D펜 20자루, PLA 필라멘트, 실리콘 매트')
  const [recipeId, setRecipeId] = useState('')
  // 기본값은 2D 다 — 짧은 시수에서 실패하지 않는 쪽이다 (ADR-037).
  const [form, setForm] = useState<ShapeForm>('flat')
  const [pending, setPending] = useState(false)
  const [stage, setStage] = useState(0)
  const [failure, setFailure] = useState<Failure | null>(null)
  /**
   * 저장이 화면 레이어에 닿지 않는 세션(데모·체험)의 결과. 이때는 이동하지 않고 여기서 그린다 —
   * 서버리스에서는 라우트가 저장한 산출물을 상세 페이지가 읽지 못한다 (ADR-033).
   */
  const [result, setResult] = useState<GenerateResultData | null>(null)
  const ticker = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => () => { if (ticker.current) clearInterval(ticker.current) }, [])

  const selected = sessions.find((s) => s.id === sessionId) ?? null

  async function submit() {
    setPending(true)
    setFailure(null)
    setStage(0)
    ticker.current = setInterval(
      () => setStage((s) => Math.min(s + 1, STAGES[form].length - 1)),
      1400,
    )

    try {
      const response = await fetch('/api/studio/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          kind: 'pen3d',
          topic,
          sessionId: sessionId || null,
          lineageId,
          recipeId: form === 'flat' ? null : recipeId || null,
          form,
          gradeBand,
          studentCount: Number(studentCount),
          durationMinutes: Number(durationMinutes),
          venue,
          equipment: equipment
            .split(',')
            .map((v) => v.trim())
            .filter((v) => v !== ''),
        }),
      })
      const json = (await response.json()) as {
        ok?: boolean
        id?: string
        saved?: boolean
        persisted?: boolean
        message?: string
        field?: string
        topic_note?: string | null
        demo_ai?: boolean
        nearest_note?: string | null
      } & Partial<GenerateResultData>

      if (!response.ok || !json.ok) {
        setFailure({ message: json.message ?? '만들지 못했습니다.', field: json.field })
        return
      }
      // 저장이 화면에 닿지 않는 세션: 상세 페이지로 보내면 404 다. 결과를 그 자리에서 보여준다.
      if (json.persisted === false && json.artifact && json.spec && json.status) {
        setResult({
          status: json.status,
          recipe_id: json.recipe_id ?? '',
          reason: json.reason ?? '',
          source: json.source ?? 'rule',
          calibrated: json.calibrated ?? false,
          rounds: json.rounds ?? [],
          artifact: json.artifact,
          spec: json.spec,
          topic_note: json.topic_note ?? null,
          demo_ai: json.demo_ai,
          shape_source: json.shape_source,
          shape_review: json.shape_review,
          shape_missing: json.shape_missing ?? null,
          nearest_note: json.nearest_note ?? null,
        })
        return
      }
      if (!json.saved || !json.id) {
        // 만들기는 했는데 저장이 안 됐다. 있는 척하지 않고 그대로 말한다.
        setFailure({
          message: '도안은 만들었지만 저장에 실패했습니다. 다시 시도해 주세요.',
        })
        return
      }
      // 검증 실패도 상세 화면으로 보낸다 — 거기서 이유와 조치를 보여준다 (ADR-030).
      router.push(`/instructor/studio/${json.id}`)
      router.refresh()
    } catch {
      setFailure({ message: '인터넷 연결이 끊긴 것 같습니다. 다시 시도해 주세요.' })
    } finally {
      if (ticker.current) clearInterval(ticker.current)
      setPending(false)
    }
  }

  if (result) {
    return <GenerateResult data={result} demoAi={demoAi} onReset={() => setResult(null)} />
  }

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault()
        if (!pending) void submit()
      }}
    >
      <Input
        label="교육 주제"
        value={topic}
        onChange={(e) => setTopic(e.target.value)}
        placeholder="예) 바다에 사는 물고기 모양 장식 만들기"
        hint="단어나 문장으로 적습니다. 검수된 도안에 없는 주제면 적은 단어대로 윤곽을 만듭니다."
        error={failure?.field === 'topic' ? failure.message : undefined}
        required
        maxLength={80}
      />

      <fieldset className="space-y-2">
        <legend className="block text-sm font-semibold text-ink">무엇으로 만들까요</legend>
        <div className="flex flex-wrap gap-2">
          {SHAPE_FORMS.map((value) => (
            <Chip key={value} selected={form === value} onClick={() => setForm(value)}>
              {SHAPE_FORM_LABEL[value]}
            </Chip>
          ))}
        </div>
        <p className="text-xs leading-relaxed text-sub">{FORM_HINT[form]}</p>
      </fieldset>

      {sessions.length > 0 ? (
        <Select
          label="배정 회차에 붙이기 (선택)"
          value={sessionId}
          onChange={(e) => setSessionId(e.target.value)}
          options={sessions.map((s) => ({ value: s.id, label: s.label }))}
          placeholder="붙이지 않고 라이브러리에만 저장"
          hint="회차를 고르면 학년대·인원·시수·장소·장비는 그 회차 값을 씁니다."
        />
      ) : null}

      {selected ? (
        <p className="rounded-md border border-point-line bg-point-bg px-3 py-2 text-xs leading-relaxed text-body">
          이 회차의 수업 조건으로 만듭니다 — {selected.conditions}
          <br />
          수업 조건은 기관이 입력합니다. 바꿔야 하면 담당자에게 요청해 주세요.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="학년대"
            value={gradeBand}
            onChange={(e) => setGradeBand(e.target.value as GradeBand)}
            options={(['elementary', 'middle', 'high'] as GradeBand[]).map((b) => ({
              value: b,
              label: GRADE_BAND_LABEL[b],
            }))}
          />
          <Select
            label="수업 장소"
            value={venue}
            onChange={(e) => setVenue(e.target.value as Venue)}
            options={VENUES.map((v) => ({ value: v, label: v }))}
          />
          <Input
            label="학생 수"
            type="number"
            min={1}
            max={200}
            value={studentCount}
            onChange={(e) => setStudentCount(e.target.value)}
            error={failure?.field === 'studentCount' ? failure.message : undefined}
          />
          <Input
            label="수업 시간 (분)"
            type="number"
            min={20}
            max={300}
            value={durationMinutes}
            onChange={(e) => setDurationMinutes(e.target.value)}
            hint="준비·정리 20분을 뺀 시간으로 제작 시간을 계산합니다."
            error={failure?.field === 'durationMinutes' ? failure.message : undefined}
          />
          <Input
            className="sm:col-span-2"
            label="보유 장비"
            value={equipment}
            onChange={(e) => setEquipment(e.target.value)}
            hint="쉼표로 구분합니다. 3D펜이나 필라멘트가 없으면 도안을 만들 수 없습니다."
            error={failure?.field === 'equipment' ? failure.message : undefined}
          />
        </div>
      )}

{/* 검수된 레시피는 전부 입체다. 2D 에서는 고를 것이 없다 (ADR-037). */}
      {form === 'solid' ? (
        <Select
          label="도안 직접 고르기 (선택)"
          value={recipeId}
          onChange={(e) => setRecipeId(e.target.value)}
          options={recipes.map((r) => ({
            value: r.id,
            label: `${r.title} · 난이도 ${r.difficulty}`,
          }))}
          placeholder="주제에 맞는 모양을 자동으로 고르기"
          hint="고르지 않으면 주제와 같은 모양을 찾고, 없으면 적은 단어대로 윤곽을 만듭니다."
        />
      ) : null}

      {failure && !failure.field ? (
        <p className="rounded-md border border-negative/20 bg-negative-bg px-3 py-2 text-sm text-negative">
          {failure.message}
        </p>
      ) : null}

      {pending ? (
        <div className="rounded-md border border-line bg-muted px-4 py-3">
          <AssistProgress stages={STAGES[form]} active={stage} />
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending || topic.trim().length < 2}>
          {pending ? '만들고 있습니다' : lineageId ? '새 버전 만들기' : '도안 만들기'}
        </Button>
        <p className="text-xs text-sub">
          좌표와 치수는 프로그램이 계산하고, 검증을 통과한 도안만 수업에 쓸 수 있다고 표시합니다.
        </p>
      </div>
    </form>
  )
}
