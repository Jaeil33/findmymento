import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { Badge } from '@/components/ui/Badge'
import { PageHeader, Panel } from '@/components/ui/Section'
import { getActor } from '@/lib/auth/actor'
import { loadDataset } from '@/lib/db/dataset'
import { regionLabel } from '@/lib/region'
import { GRADE_BAND_LABEL, PROGRAM_FORMAT_LABEL } from '@/types/domain'
import { IconShield } from '@/components/ui/Icons'

export const metadata = { title: '프로필' }

/**
 * 강사 프로필·프로그램.
 *
 * MVP 에서 프로필·프로그램 등록은 **운영자가 대행한다** (ADR-008). 이 화면은 조회와
 * 수정 요청까지다 — 셀프 온보딩 퍼널을 만들지 않는다.
 */
export default async function InstructorProfilePage() {
  const actor = await getActor()
  if (!actor || actor.role !== 'instructor') redirect('/login')

  const ds = await loadDataset()
  const me = ds.instructors.find((i) => i.id === actor.instructorId)
  if (!me) notFound()

  const provider = me.provider_id ? ds.providers.find((p) => p.id === me.provider_id) : undefined
  const programs = ds.programs.filter((p) => p.instructor_id === me.id)

  return (
    <div className="max-w-3xl space-y-8">
      <PageHeader
        title="프로필"
        description="보호자·기관이 보는 공개 정보입니다. 수정이 필요하면 운영자에게 알려주세요."
        actions={
          me.status === 'approved' ? (
            <Link
              href={`/instructors/${me.id}`}
              className="rounded-lg border border-line-strong bg-card px-4 py-2.5 text-sm font-medium text-body hover:bg-muted"
            >
              공개 화면으로 보기
            </Link>
          ) : null
        }
      />

      <Panel title="심사 상태">
        <div className="flex flex-wrap items-center gap-3">
          {me.status === 'approved' ? (
            <Badge tone="positive">심사 완료 · 공개 중</Badge>
          ) : me.status === 'pending' ? (
            <Badge tone="caution">심사 대기</Badge>
          ) : me.status === 'suspended' ? (
            <Badge tone="negative">일시 중지</Badge>
          ) : (
            <Badge tone="negative">반려</Badge>
          )}
          <p className="text-sm text-sub">
            {me.status === 'approved'
              ? '추천·디렉토리·Q&A에 노출됩니다.'
              : '심사가 끝나기 전에는 학생·기관·공개 디렉토리 어디에도 노출되지 않습니다.'}
          </p>
        </div>
      </Panel>

      <Panel title="공개 정보">
        <dl className="divide-y divide-line text-sm">
          <div className="flex flex-wrap items-baseline justify-between gap-4 py-3 first:pt-0">
            <dt className="text-sub">이름</dt>
            <dd className="font-medium text-ink">{me.name}</dd>
          </div>
          <div className="flex flex-wrap items-baseline justify-between gap-4 py-3">
            <dt className="text-sub">활동 지역</dt>
            <dd className="text-body">{regionLabel(me.region_code)}</dd>
          </div>
          <div className="flex flex-wrap items-baseline justify-between gap-4 py-3">
            <dt className="text-sub">분야</dt>
            <dd className="text-body">{me.fields.join(' · ')}</dd>
          </div>
          <div className="flex flex-wrap items-baseline justify-between gap-4 py-3">
            <dt className="text-sub">소속</dt>
            <dd className="text-body">{provider?.name ?? '프리랜서'}</dd>
          </div>
          <div className="py-3">
            <dt className="text-sub">소개</dt>
            <dd className="mt-1.5 leading-relaxed text-body">{me.bio}</dd>
          </div>
          <div className="py-3 last:pb-0">
            <dt className="text-sub">경력</dt>
            <dd className="mt-1.5">
              <ul className="space-y-1 text-body">
                {me.career.map((c) => (
                  <li key={c}>· {c}</li>
                ))}
              </ul>
            </dd>
          </div>
        </dl>
      </Panel>

      <Panel
        title="프로그램"
        description="공개 디렉토리의 기본 단위입니다. 지역·대상 학년·형태가 보호자가 가장 먼저 보는 정보입니다."
      >
        {programs.length === 0 ? (
          <p className="text-sm text-sub">등록된 프로그램이 없습니다. 운영자에게 등록을 요청하세요.</p>
        ) : (
          <ul className="divide-y divide-line">
            {programs.map((p) => (
              <li key={p.id} className="py-4 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="text-sm font-semibold text-ink">{p.title}</h3>
                  <p className="text-xs text-sub tabular-nums">
                    {p.field} · {PROGRAM_FORMAT_LABEL[p.format]} {p.session_count}회 ·{' '}
                    {p.target_grades.map((g) => GRADE_BAND_LABEL[g]).join('·')}
                  </p>
                </div>
                <p className="mt-1.5 text-sm leading-relaxed text-body">{p.summary}</p>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <div className="flex items-start gap-2.5 rounded-md border border-line bg-muted px-4 py-3 text-xs leading-relaxed text-body">
        <IconShield width={16} height={16} className="mt-0.5 shrink-0 text-sub" />
        <p>
          연락처는 공개 화면 어디에도 표시되지 않습니다. 보호자 문의는 운영자가 확인한 뒤 문의 리드로
          전달되고, 학생과의 소통은 공개 Q&amp;A 스레드만 가능합니다. 개인 사진·평점 항목은 만들지
          않습니다.
        </p>
      </div>
    </div>
  )
}
