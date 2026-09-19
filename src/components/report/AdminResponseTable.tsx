import type { AdminResponseRow } from '@/lib/report/admin-session'

const FOLLOWUP: Record<number, string> = {
  1: '아니요',
  2: '잘 모르겠어요',
  3: '조금',
  4: '많이',
}

/** 운영자 — 응답 전체 표. 한 줄 = 학생 한 명의 답 + 그 학생이 본 카드·이유. */
export function AdminResponseTable({ rows }: { rows: AdminResponseRow[] }) {
  if (rows.length === 0) return <p className="text-sm text-sub">아직 응답이 없어요.</p>

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1080px] text-left text-sm">
        <thead className="text-xs text-sub">
          <tr>
            <th className="py-2 pr-3 font-medium">시간</th>
            <th className="py-2 pr-3 font-medium">학년</th>
            <th className="py-2 pr-3 font-medium">만족도</th>
            <th className="py-2 pr-3 font-medium">더 배우고 싶은 정도</th>
            <th className="py-2 pr-3 font-medium">관심 분야</th>
            <th className="py-2 pr-3 font-medium">배우고 싶은 것</th>
            <th className="py-2 pr-3 font-medium">관심 직업(꿈)</th>
            <th className="py-2 pr-3 font-medium">가능 시간</th>
            <th className="py-2 pr-3 font-medium">보여 준 카드와 이유</th>
            <th className="py-2 font-medium">추천 방식</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-line align-top">
              <td className="py-3 pr-3 whitespace-nowrap text-sub">{r.time}</td>
              <td className="py-3 pr-3 whitespace-nowrap">{r.grade}</td>
              <td className="py-3 pr-3 whitespace-nowrap">{r.satisfaction}/5</td>
              <td className="py-3 pr-3 whitespace-nowrap">{FOLLOWUP[r.followupIntent] ?? r.followupIntent}</td>
              <td className="py-3 pr-3">{r.interestFields.join(', ') || '-'}</td>
              <td className="py-3 pr-3">
                <span>{r.wantToLearn || '-'}</span>
              </td>
              <td className="py-3 pr-3">
                <span>{r.desiredJob || '-'}</span>
              </td>
              <td className="py-3 pr-3">{r.availableTimes.join(', ') || '-'}</td>
              <td className="py-3 pr-3">
                {r.cards.length === 0 ? (
                  <span className="text-sub">-</span>
                ) : (
                  <ul className="space-y-2">
                    {r.cards.map((c, i) => (
                      <li key={`${r.id}-${i}`}>
                        <span className="font-medium text-ink">{c.title}</span>{' '}
                        <span className="text-xs text-sub">· {c.kind}</span>
                        <p className="mt-0.5 text-xs leading-relaxed text-body">{c.reason}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </td>
              <td className="py-3 whitespace-nowrap">
                {r.source === 'llm' ? (
                  <span className="font-medium text-point">AI</span>
                ) : r.source === 'rule' ? (
                  <span className="text-caution">{`규칙${r.error ? ` (${r.error})` : ''}`}</span>
                ) : (
                  <span className="text-sub">-</span>
                )}
                {r.latencyMs !== null ? (
                  <span className="block text-xs text-sub">{(r.latencyMs / 1000).toFixed(1)}초</span>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
