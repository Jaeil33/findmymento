import { regionName } from '@/lib/region'
import { cn } from '@/lib/cn'

type Stage = 'same' | 'adjacent' | 'two_hop' | 'none' | 'all'

/**
 * 지역 확장 3단계를 **화면에 그대로 보여준다** (E-07).
 * "광명시에는 아직 없어요. 가까운 구로구·시흥시에서 찾았어요"가 빈 결과보다 훨씬 낫다.
 */
export function StageNotice({
  stage,
  originCode,
  codes,
}: {
  stage: Stage
  originCode: string | null
  codes: string[]
}) {
  if (stage === 'all' || !originCode) return null

  const here = regionName(originCode)
  const names = codes.slice(0, 3).map(regionName)
  const rest = codes.length - names.length

  const steps: { key: Stage; label: string }[] = [
    { key: 'same', label: `${here}` },
    { key: 'adjacent', label: '인접 지역' },
    { key: 'two_hop', label: '조금 더 넓게' },
  ]
  const reachedIndex = stage === 'same' ? 0 : stage === 'adjacent' ? 1 : 2

  return (
    <div
      className={cn(
        'rounded-md border px-4 py-3.5',
        stage === 'none' ? 'border-caution/30 bg-caution-bg' : 'border-point-line bg-point-bg',
      )}
    >
      <p
        className={cn(
          'text-sm leading-relaxed font-medium',
          stage === 'none' ? 'text-caution' : 'text-point',
        )}
      >
        {stage === 'same' ? `${here}에서 찾았어요.` : null}
        {stage === 'adjacent'
          ? `${here}에는 아직 없어요. 가까운 ${names.join('·')}${rest > 0 ? ` 등 ${codes.length}곳` : ''}까지 넓혀 찾았어요.`
          : null}
        {stage === 'two_hop'
          ? `${here}와 바로 옆 지역에는 없어서 조금 더 넓혔어요. ${names.join('·')}${rest > 0 ? ` 등 ${codes.length}곳` : ''}의 결과예요.`
          : null}
        {stage === 'none' ? `${here}와 주변 지역에 아직 이 조건의 수업이 없어요.` : null}
      </p>

      <ol className="mt-2.5 flex flex-wrap items-center gap-1.5 text-xs">
        {steps.map((s, i) => (
          <li key={s.key} className="flex items-center gap-1.5">
            <span
              className={cn(
                'rounded px-1.5 py-0.5 tabular-nums',
                i < reachedIndex && stage !== 'none' && 'text-faint line-through',
                i === reachedIndex && stage !== 'none' && 'bg-point text-white font-medium',
                stage === 'none' && 'text-caution/70 line-through',
                i > reachedIndex && stage !== 'none' && 'text-faint',
              )}
            >
              {s.label}
            </span>
            {i < steps.length - 1 ? (
              <span aria-hidden="true" className="text-faint">
                →
              </span>
            ) : null}
          </li>
        ))}
        {stage === 'none' ? (
          <li className="flex items-center gap-1.5">
            <span aria-hidden="true" className="text-caution/70">
              →
            </span>
            <span className="rounded bg-caution px-1.5 py-0.5 font-medium text-white">
              Q&amp;A로 먼저 물어보기
            </span>
          </li>
        ) : null}
      </ol>
    </div>
  )
}
