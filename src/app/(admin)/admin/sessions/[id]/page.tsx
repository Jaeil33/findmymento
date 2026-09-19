import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { AdminResponseTable } from '@/components/report/AdminResponseTable'
import { SessionReportView } from '@/components/report/SessionReportView'
import { PageHeader, Panel } from '@/components/ui/Section'
import { StatTile } from '@/components/ui/StatTile'
import { IconArrowLeft } from '@/components/ui/Icons'
import { getActor } from '@/lib/auth/actor'
import { loadDataset } from '@/lib/db/dataset'
import { isClosed, sessionReport, supplyByField } from '@/lib/db/queries'
import { loadRecommendationLogs } from '@/lib/db/recommendation-logs'
import { adminSessionRows, aiSummary } from '@/lib/report/admin-session'

export const metadata = { title: '회차 설문 전체' }

/** 대략의 원화 환산. 정산용이 아니라 감을 잡는 용도다. */
const KRW_PER_USD = 1400

/**
 * 운영자 — 한 회차의 설문 전체 자료.
 * 요약(기관 리포트와 같은 집계) + 응답 하나하나와 그 학생이 본 카드·이유·AI 여부 + AI 사용 현황.
 */
export default async function AdminSessionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const actor = await getActor()
  if (!actor || actor.role !== 'admin') redirect('/login')

  const ds = await loadDataset()
  const session = ds.lectureSessions.find((s) => s.id === id)
  if (!session) notFound()
  const report = sessionReport(ds, id)
  if (!report) notFound()

  const logs = await loadRecommendationLogs([id])
  const rows = adminSessionRows(ds, id, logs)
  const ai = aiSummary(logs)
  const interests = ds.interests.filter((i) => i.session_id === id).length
  const errorText = Object.entries(ai.errors)
    .map(([k, v]) => `${k} ${v}건`)
    .join(', ')

  return (
    <div className="space-y-8">
      <Link href="/admin/sessions" className="inline-flex items-center gap-1.5 text-sm text-sub hover:text-ink">
        <IconArrowLeft width={16} height={16} />
        수업·설문 목록
      </Link>

      <PageHeader
        eyebrow={`${report.orgName} · ${session.held_on}`}
        title={session.title}
        description={`입장 코드 ${session.entry_code} · 강사 ${report.instructorName ?? '미배정'} · ${
          isClosed(session) ? '응답 마감' : '응답 받는 중'
        }`}
      />

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile emphasis label="응답" value={rows.length} unit="건" sub={`예상 ${session.expected_students}명`} />
        <StatTile
          label="AI 가 고른 추천"
          value={ai.total === 0 ? '-' : `${ai.llm}/${ai.total}`}
          unit={ai.total === 0 ? undefined : '건'}
          sub={errorText ? `규칙으로 대체: ${errorText}` : '나머지는 규칙 문장'}
        />
        <StatTile
          label="추천 평균 시간"
          value={ai.avgLatencyMs === null ? '-' : (ai.avgLatencyMs / 1000).toFixed(1)}
          unit={ai.avgLatencyMs === null ? undefined : '초'}
        />
        <StatTile
          label="AI 비용 (추정)"
          value={Math.round(ai.usd * KRW_PER_USD).toLocaleString('ko-KR')}
          unit="원"
          sub={`토큰 입력 ${ai.inputTokens.toLocaleString('ko-KR')} · 출력 ${ai.outputTokens.toLocaleString('ko-KR')}`}
        />
      </section>

      <Panel
        title={`응답 전체 (${rows.length}건)`}
        description={`한 줄이 학생 한 명이에요. 자유서술은 저장 전에 연락처 등이 가려진 값입니다.${
          interests > 0 ? ` "더 배우고 싶어요" 버튼 ${interests}건.` : ''
        }`}
      >
        <AdminResponseTable rows={rows} />
      </Panel>

      <Panel title="응답 요약">
        <SessionReportView report={report} supplyByField={supplyByField(ds)} />
      </Panel>
    </div>
  )
}
