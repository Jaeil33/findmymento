'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback } from 'react'
import { FIELDS, PROGRAM_FORMAT_LABEL, type ProgramFormat } from '@/types/domain'
import { Chip } from '@/components/ui/Chip'
import { Select } from '@/components/ui/Input'
import type { Region } from '@/lib/region'

/**
 * 디렉토리 필터. 값을 URL 에 두므로 링크를 공유할 수 있고, 뒤로 가기가 기대대로 동작한다.
 * 클라이언트 컴포넌트는 입력·상호작용에만 쓴다 — 조회는 서버에서 한다.
 */
export function ProgramFilters({
  regions,
  total,
}: {
  regions: Pick<Region, 'code' | 'label'>[]
  total: number
}) {
  const router = useRouter()
  const params = useSearchParams()

  const current = {
    region: params.get('region') ?? '',
    field: params.get('field') ?? '',
    grade: params.get('grade') ?? '',
    format: params.get('format') ?? '',
  }

  const update = useCallback(
    (key: string, value: string) => {
      const next = new URLSearchParams(params.toString())
      if (value === '' || value === next.get(key)) next.delete(key)
      else next.set(key, value)
      const qs = next.toString()
      router.push(qs ? `/programs?${qs}` : '/programs', { scroll: false })
    },
    [params, router],
  )

  return (
    <div className="space-y-5 rounded-lg border border-line bg-card p-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <Select
          label="지역"
          placeholder="전체 지역"
          value={current.region}
          onChange={(e) => update('region', e.target.value)}
          options={regions.map((r) => ({ value: r.code, label: r.label }))}
        />
        <Select
          label="대상 학년"
          placeholder="전체"
          value={current.grade}
          onChange={(e) => update('grade', e.target.value)}
          options={[
            { value: 'elementary', label: '초등' },
            { value: 'middle', label: '중등' },
            { value: 'high', label: '고등' },
          ]}
        />
        <Select
          label="형태"
          placeholder="전체"
          value={current.format}
          onChange={(e) => update('format', e.target.value)}
          options={(Object.keys(PROGRAM_FORMAT_LABEL) as ProgramFormat[]).map((f) => ({
            value: f,
            label: PROGRAM_FORMAT_LABEL[f],
          }))}
        />
      </div>

      <fieldset>
        <legend className="mb-2.5 text-sm font-medium text-body">분야</legend>
        <div className="flex flex-wrap gap-2">
          {FIELDS.map((f) => (
            <Chip key={f} selected={current.field === f} onClick={() => update('field', f)}>
              {f}
            </Chip>
          ))}
        </div>
      </fieldset>

      <p className="text-xs text-sub tabular-nums">
        조건에 맞는 프로그램 {total}개
        {current.region || current.field || current.grade || current.format ? (
          <button
            type="button"
            onClick={() => router.push('/programs', { scroll: false })}
            className="ml-3 text-sub underline underline-offset-4 hover:text-ink"
          >
            조건 지우기
          </button>
        ) : null}
      </p>
    </div>
  )
}
