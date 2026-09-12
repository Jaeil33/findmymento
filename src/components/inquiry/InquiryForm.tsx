'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { FIELDS, GRADE_BAND_LABEL, type Field, type GradeBand } from '@/types/domain'

const GRADE_BANDS: GradeBand[] = ['elementary', 'middle', 'high']

export type InquiryFormProps = {
  regions: { code: string; label: string }[]
  defaultRegion?: string
  defaultField?: string
  targetType: 'program' | 'instructor' | 'none'
  targetId: string | null
  targetLabel: string | null
}

/**
 * 보호자 문의 폼.
 *
 * **아이 이름·학교·생년월일 입력란을 만들지 않는다.** 학년대까지만 받는다 —
 * 디자인 선택이 아니라 ADR-014 의 제약이다.
 * 제출은 `/api/inquiry` 를 경유한다. 클라이언트에서 직접 INSERT 하지 않는다 (E-21).
 */
export function InquiryForm({
  regions,
  defaultRegion,
  defaultField,
  targetType,
  targetId,
  targetLabel,
}: InquiryFormProps) {
  const router = useRouter()
  const [guardianName, setGuardianName] = useState('')
  const [guardianContact, setGuardianContact] = useState('')
  const [regionCode, setRegionCode] = useState(defaultRegion ?? '')
  const [gradeBand, setGradeBand] = useState<GradeBand | ''>('')
  const [field, setField] = useState<Field | ''>(
    (FIELDS as readonly string[]).includes(defaultField ?? '') ? (defaultField as Field) : '',
  )
  const [message, setMessage] = useState('')
  const [consent, setConsent] = useState(false)
  const [showConsentDetail, setShowConsentDetail] = useState(false)
  const [error, setError] = useState<{ field?: string; message: string } | null>(null)
  const [pending, setPending] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setPending(true)
    try {
      const res = await fetch('/api/inquiry', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          guardianName,
          guardianContact,
          regionCode,
          gradeBand,
          field,
          targetType,
          targetId,
          message,
          consent,
        }),
      })
      const data = (await res.json()) as { ok: boolean; field?: string; message?: string }
      if (!res.ok || !data.ok) {
        setError({ field: data.field, message: data.message ?? '접수에 실패했어요.' })
        return
      }
      router.push('/inquiry/done')
    } catch {
      setError({ message: '네트워크 문제로 접수되지 않았어요. 다시 시도해 주세요.' })
    } finally {
      setPending(false)
    }
  }

  const fieldError = (name: string) => (error?.field === name ? error.message : undefined)

  return (
    <form onSubmit={submit} className="space-y-6" noValidate>
      {targetLabel ? (
        <div className="rounded-md border border-point-line bg-point-bg px-4 py-3 text-sm">
          <p className="text-sub">문의 대상</p>
          <p className="mt-0.5 font-medium text-ink">{targetLabel}</p>
        </div>
      ) : null}

      <Input
        label="보호자 이름"
        required
        value={guardianName}
        onChange={(e) => setGuardianName(e.target.value)}
        autoComplete="name"
        error={fieldError('guardianName')}
      />

      <Input
        label="연락처"
        required
        hint="휴대폰 번호 또는 이메일. 강사가 이 연락처로 연락드립니다."
        value={guardianContact}
        onChange={(e) => setGuardianContact(e.target.value)}
        inputMode="tel"
        autoComplete="tel"
        placeholder="010-1234-5678"
        error={fieldError('guardianContact')}
      />

      <Select
        label="지역"
        required
        placeholder="시·군·구를 선택해 주세요"
        value={regionCode}
        onChange={(e) => setRegionCode(e.target.value)}
        options={regions.map((r) => ({ value: r.code, label: r.label }))}
        error={fieldError('regionCode')}
      />

      <fieldset>
        <legend className="text-sm font-medium text-body">
          학년대 <span className="text-negative">*</span>
        </legend>
        <p className="mt-1 text-xs text-sub">
          아이를 특정할 수 있는 정보는 받지 않습니다. 학년대까지만 선택해 주세요.
        </p>
        <div className="mt-2.5 flex flex-wrap gap-2">
          {GRADE_BANDS.map((b) => (
            <Chip key={b} selected={gradeBand === b} onClick={() => setGradeBand(b)}>
              {GRADE_BAND_LABEL[b]}
            </Chip>
          ))}
        </div>
        {fieldError('gradeBand') ? (
          <p className="mt-1.5 text-xs text-negative">{fieldError('gradeBand')}</p>
        ) : null}
      </fieldset>

      <fieldset>
        <legend className="text-sm font-medium text-body">
          관심 분야 <span className="text-negative">*</span>
        </legend>
        <div className="mt-2.5 flex flex-wrap gap-2">
          {FIELDS.map((f) => (
            <Chip key={f} selected={field === f} onClick={() => setField(f)}>
              {f}
            </Chip>
          ))}
        </div>
        {fieldError('field') ? (
          <p className="mt-1.5 text-xs text-negative">{fieldError('field')}</p>
        ) : null}
      </fieldset>

      <Textarea
        label="요청 내용"
        hint="원하시는 시간대나 궁금한 점을 적어 주세요. 선택 항목입니다."
        maxLength={300}
        counter={{ value: message.length, max: 300 }}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        error={fieldError('message')}
        placeholder="예) 주말 오전에 가능한 수업을 찾습니다."
      />

      <div className="rounded-lg border border-line bg-card p-4">
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            className="mt-0.5 h-4.5 w-4.5 shrink-0 rounded border-line-strong accent-point"
          />
          <span className="text-sm leading-relaxed text-body">
            개인정보 수집·이용에 동의합니다 <span className="text-negative">*</span>
          </span>
        </label>

        <button
          type="button"
          onClick={() => setShowConsentDetail((v) => !v)}
          className="mt-2.5 ml-7.5 text-xs text-sub underline underline-offset-4 hover:text-ink"
          aria-expanded={showConsentDetail}
        >
          {showConsentDetail ? '자세한 내용 접기' : '수집 항목·목적·보유기간 보기'}
        </button>

        {showConsentDetail ? (
          <dl className="mt-3 ml-7.5 space-y-2 border-l-2 border-line pl-4 text-xs leading-relaxed text-sub">
            <div>
              <dt className="font-medium text-body">수집 항목</dt>
              <dd>보호자 이름, 연락처(휴대폰 또는 이메일), 지역, 학년대, 관심 분야, 요청 내용</dd>
            </div>
            <div>
              <dt className="font-medium text-body">수집 목적</dt>
              <dd>문의 확인 및 해당 강사·교육업체 연결</dd>
            </div>
            <div>
              <dt className="font-medium text-body">제3자 제공</dt>
              <dd>운영자가 배정한 해당 강사(및 소속 교육업체)에게 문의 내용과 연락처를 전달합니다</dd>
            </div>
            <div>
              <dt className="font-medium text-body">보유 기간</dt>
              <dd>문의 처리 완료 후 6개월. 기간이 지나면 삭제합니다</dd>
            </div>
            <div>
              <dt className="font-medium text-body">받지 않는 정보</dt>
              <dd>자녀의 이름·학교·생년월일은 수집하지 않습니다</dd>
            </div>
          </dl>
        ) : null}

        {fieldError('consent') ? (
          <p className="mt-2 ml-7.5 text-xs text-negative">{fieldError('consent')}</p>
        ) : null}
      </div>

      {error && !error.field ? (
        <p className="rounded-md border border-negative/25 bg-negative-bg px-4 py-3 text-sm text-negative">
          {error.message}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? '접수하고 있어요' : '문의 접수하기'}
        </Button>
        <p className="text-xs text-sub">접수 후 영업일 2일 안에 연락드립니다.</p>
      </div>
    </form>
  )
}
