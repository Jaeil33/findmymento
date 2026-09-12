import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { Badge } from '@/components/ui/Badge'
import { buttonClass } from '@/components/ui/Button'
import { PageHeader, Panel } from '@/components/ui/Section'
import { getActor } from '@/lib/auth/actor'
import { loadDataset } from '@/lib/db/dataset'
import { gradeBandLabel, sessionStudents } from '@/lib/db/queries'
import { issueCodes } from '../../../actions'
import { IconArrowLeft } from '@/components/ui/Icons'
import { PrintButton } from '@/components/session/PrintButton'

export const metadata = { title: '가명코드 발급' }

/**
 * 학생 가명코드 발급·인쇄.
 *
 * 이 화면이 만드는 것은 **코드와 학년뿐이다.** 이름·학교 칸이 없다 —
 * 코드와 실명을 잇는 표는 기관이 따로 보관하고, 플랫폼은 그 표를 갖지 않는다 (ADR-003).
 */
export default async function SessionCodesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const actor = await getActor()
  if (!actor || actor.role !== 'org_member') redirect('/login')

  const ds = await loadDataset()
  const session = ds.lectureSessions.find((s) => s.id === id && s.org_id === actor.orgId)
  if (!session) notFound()

  const students = sessionStudents(ds, id)
  const respondedCount = students.filter((s) => s.responded).length

  const years = session.grade_band === 'elementary' ? [1, 2, 3, 4, 5, 6] : [1, 2, 3]

  return (
    <div className="space-y-8">
      <div className="no-print space-y-8">
        <Link
          href={`/org/sessions/${id}`}
          className="inline-flex items-center gap-1.5 text-sm text-sub hover:text-ink"
        >
          <IconArrowLeft width={16} height={16} />
          {session.title}
        </Link>

        <PageHeader
          title="학생 가명코드"
          description={
            <>
              학생은 이 6자리 코드로 자기 기록을 이어갑니다. 코드와 실제 학생을 잇는 표는
              <strong className="font-semibold text-ink"> 기관에서만 </strong>
              보관해 주세요. 플랫폼에는 코드와 학년대만 저장됩니다.
            </>
          }
          actions={<PrintButton />}
        />

        <Panel title="코드 발급" description="스티커·명찰·좌석표로 나눠 쓸 만큼 한 번에 발급하세요.">
          <form action={issueCodes} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="sessionId" value={session.id} />
            <label className="space-y-1.5">
              <span className="block text-sm font-medium text-body">학년</span>
              <select
                name="gradeYear"
                defaultValue={String(years[0])}
                className="block rounded-lg border border-line-strong bg-card px-4 py-2.5 text-sm text-ink focus:border-point focus:ring-1 focus:ring-point focus:outline-none"
              >
                {years.map((y) => (
                  <option key={y} value={y}>
                    {gradeBandLabel(session.grade_band)} {y}학년
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1.5">
              <span className="block text-sm font-medium text-body">발급 수</span>
              <input
                type="number"
                name="count"
                min={1}
                max={120}
                defaultValue={Math.min(120, session.expected_students)}
                className="block w-28 rounded-lg border border-line-strong bg-card px-4 py-2.5 text-sm text-ink tabular-nums focus:border-point focus:ring-1 focus:ring-point focus:outline-none"
              />
            </label>
            <button type="submit" className={buttonClass({ variant: 'primary' })}>
              발급
            </button>
          </form>
        </Panel>

        <p className="text-sm text-sub tabular-nums">
          코드 {students.length}개 · 응답 완료 {respondedCount}개
        </p>
      </div>

      {/* 인쇄 영역 — 잘라서 배부한다 */}
      <section className="print-sheet">
        <header className="mb-4 hidden print:block">
          <h1 className="text-lg font-semibold">
            {session.title} · 참여 코드
          </h1>
          <p className="text-sm">
            입장 코드 {session.entry_code} · {session.held_on}
          </p>
        </header>

        {students.length === 0 ? (
          <p className="text-sm text-sub">아직 발급된 코드가 없습니다. 위에서 발급해 주세요.</p>
        ) : (
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 print:grid-cols-4">
            {students.map((s) => (
              <li
                key={s.code}
                className="rounded-md border border-line bg-card px-3 py-3 text-center"
              >
                <p className="text-xs text-sub">{s.gradeLabel}</p>
                <p className="mt-0.5 text-xl font-semibold text-ink tabular-nums tracking-wider">
                  {s.code}
                </p>
                <p className="mt-1 no-print">
                  {s.responded ? (
                    <Badge tone="positive">응답 완료</Badge>
                  ) : (
                    <span className="text-xs text-faint">미응답</span>
                  )}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
