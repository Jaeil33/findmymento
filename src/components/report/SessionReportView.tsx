import { Badge } from '@/components/ui/Badge'
import { StatTile } from '@/components/ui/StatTile'
import { Panel } from '@/components/ui/Section'
import { Distribution } from '@/components/data/Distribution'
import { EmptyState } from '@/components/ui/EmptyState'
import type { SessionReport } from '@/lib/db/queries'
import { FIELDS } from '@/types/domain'

/**
 * 회차 리포트. 기관·학교와 배정 강사가 같은 컴포넌트를 본다.
 *
 * **집계치만 있다.** 학생 단위 원본 응답은 이 컴포넌트에 들어오지 않는다 —
 * 강사에게 학생별 행을 보여주면 가명코드 단위 추적이 가능해진다 (ARCHITECTURE 권한 모델).
 *
 * 배치 규칙: **후속 의향이 만족도보다 먼저, 더 크게** 온다. 후속 전환을 예측하는 건 그쪽이고,
 * 만족도가 높아도 후속 의향이 낮으면 과정을 열면 안 된다 (SURVEY.md).
 */
export function SessionReportView({
  report,
  supplyByField,
}: {
  report: SessionReport
  /** 분야별 승인 강사 수. 0이면 미충족 수요로 표시한다 (E-16). */
  supplyByField: Record<string, number>
}) {
  if (report.responseCount === 0) {
    return (
      <EmptyState
        title="이 회차는 응답이 0건입니다"
        description={
          <>
            기능으로 막을 수 없는 상황입니다. 대부분 수업 마무리에 QR 안내가 빠진 경우입니다 —
            배정 강사에게 마지막 3분 안내를 요청하고, 응답 마감 전이면 다시 열 수 있습니다.
          </>
        }
      />
    )
  }

  const pct = (v: number) => `${Math.round(v * 100)}%`

  return (
    <div className="space-y-8">
      {/* ── 핵심 숫자 ───────────────────────────────────── */}
      <section>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile
            emphasis
            label="더 배우고 싶다 (3점 이상)"
            value={report.followupHighCount}
            unit="명"
            tone="point"
            sub={`응답자의 ${pct(report.followupHighRate)} · 후속 과정 편성의 1차 근거`}
          />
          <StatTile
            emphasis
            label="후속 의향 평균"
            value={report.followupAvg.toFixed(2)}
            unit="/ 4"
            sub="만족도보다 이 숫자를 먼저 봅니다"
          />
          <StatTile
            label="응답 수"
            value={report.responseCount}
            unit={`/ ${report.expected}명`}
            sub={`응답률 ${pct(report.responseRate)} · 익명 ${report.anonymousCount}건 포함`}
          />
          <StatTile
            label="만족도 평균"
            value={report.satisfactionAvg.toFixed(2)}
            unit="/ 5"
            sub="수업 경험 지표. 후속 전환과는 다릅니다"
          />
        </div>

        {report.anonymousCount > 0 ? (
          <p className="mt-3 text-xs leading-relaxed text-sub">
            익명 응답 {report.anonymousCount}건은 가명코드가 없어 같은 학생의 중복 여부를 확인할 수
            없습니다. 한 기기를 여러 학생이 돌려 쓴 경우도 여기 섞일 수 있으니 판단에 참고해 주세요.
          </p>
        ) : null}
      </section>

      {/* ── 분포 ───────────────────────────────────────── */}
      <section className="grid gap-5 lg:grid-cols-2">
        <Panel
          title="더 배워보고 싶어요?"
          description="이 설문의 핵심 문항입니다. 3점 이상이 후속 수요입니다."
        >
          <Distribution
            rows={report.followupDist.map((d) => ({
              label: d.label,
              count: d.count,
              tone: d.value >= 3 ? 'point' : d.value === 2 ? 'neutral' : 'negative',
            }))}
            total={report.responseCount}
          />
        </Panel>

        <Panel title="오늘 수업 만족도" description="수업 경험에 대한 응답입니다.">
          <Distribution
            rows={report.satisfactionDist.map((d) => ({
              label: d.label,
              count: d.count,
              tone: d.value >= 4 ? 'positive' : d.value === 3 ? 'neutral' : 'negative',
            }))}
            total={report.responseCount}
          />
        </Panel>
      </section>

      {/* ── 분야별 관심 ─────────────────────────────────── */}
      <Panel
        title="더 배우고 싶은 분야"
        description="학생이 고른 분야입니다. 지금 공급이 없는 분야도 그대로 집계합니다."
      >
        <ul className="space-y-2.5">
          {report.fieldCounts.map((f) => {
            const supply = supplyByField[f.field] ?? 0
            const known = (FIELDS as readonly string[]).includes(f.field)
            return (
              <li key={f.field} className="grid grid-cols-[1fr_auto] items-center gap-3">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className="text-sm text-ink">{f.field}</span>
                  {known && supply === 0 ? (
                    <Badge tone="caution">지역 공급 0 · 미충족 수요</Badge>
                  ) : null}
                  {known && supply > 0 ? (
                    <span className="text-xs text-sub tabular-nums">강사 {supply}명</span>
                  ) : null}
                </div>
                <span className="text-sm font-medium text-ink tabular-nums">{f.count}명</span>
              </li>
            )
          })}
        </ul>
      </Panel>

      {/* ── 시간대 / 직업 ──────────────────────────────── */}
      <section className="grid gap-5 lg:grid-cols-2">
        <Panel
          title="참여 가능 시간"
          description="후속 과정을 편성할 때 그대로 쓰는 데이터입니다. 후속 의향 3점 이상인 학생만 답했습니다."
        >
          {report.timeCounts.length > 0 ? (
            <Distribution
              rows={report.timeCounts.map((t) => ({ label: t.label, count: t.count, tone: 'point' }))}
              total={report.followupHighCount || report.responseCount}
            />
          ) : (
            <p className="text-sm text-sub">아직 응답이 없습니다.</p>
          )}
        </Panel>

        <Panel title="관심 직업" description="학생이 직접 쓴 답입니다.">
          {report.desiredJobs.length > 0 ? (
            <ul className="flex flex-wrap gap-2">
              {report.desiredJobs.map((j) => (
                <li
                  key={j.label}
                  className="rounded border border-line bg-muted px-2.5 py-1 text-sm text-body"
                >
                  {j.label}
                  <span className="ml-1.5 text-xs text-sub tabular-nums">{j.count}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-sub">아직 응답이 없습니다.</p>
          )}
        </Panel>
      </section>

      {/* ── 인용구 ─────────────────────────────────────── */}
      <Panel
        title="학생이 직접 쓴 말"
        description="예산 기안·사업 보고에 그대로 인용할 수 있는 문장입니다."
        footer="이름·학교·연락처로 보이는 부분은 저장 전에 가려졌습니다. 원문은 남기지 않습니다."
      >
        {report.quotes.length > 0 ? (
          <ul className="space-y-3">
            {report.quotes.map((q, i) => (
              <li
                key={`${q.text}-${i}`}
                className="border-l-2 border-point-line pl-4 text-sm leading-relaxed text-body"
              >
                <p>&ldquo;{q.text}&rdquo;</p>
                <p className="mt-1 text-xs text-sub">— {q.gradeLabel} 학생</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-sub">자유서술 응답이 아직 없습니다.</p>
        )}
      </Panel>
    </div>
  )
}
