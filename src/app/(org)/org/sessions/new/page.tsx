import Link from 'next/link'
import { redirect } from 'next/navigation'
import { PageHeader, Panel } from '@/components/ui/Section'
import { Button } from '@/components/ui/Button'
import { getActor } from '@/lib/auth/actor'
import { loadDataset } from '@/lib/db/dataset'
import { approvedInstructors } from '@/lib/db/queries'
import { regionName } from '@/lib/region'
import { SessionPlanAssist } from '@/components/session/SessionPlanAssist'
import { CLASS_TRAITS, FIELDS, VENUES } from '@/types/domain'
import { createSession } from '../../actions'
import { IconAlert, IconArrowLeft } from '@/components/ui/Icons'

export const metadata = { title: '회차 만들기' }

/**
 * 회차 생성 폼. 순수 `<form action={serverAction}>` 이라 JS 없이도 동작한다.
 * **배정 강사 선택을 강하게 유도한다** — 미배정이면 강사가 QR·리포트를 못 보고, 그러면
 * 수업 마무리 안내가 빠져 응답이 0건이 된다 (E-23·E-24).
 */
export default async function NewSessionPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const sp = await searchParams
  const actor = await getActor()
  if (!actor || actor.role !== 'org_member') redirect('/login')

  const ds = await loadDataset()
  const org = ds.organizations.find((o) => o.id === actor.orgId)
  const instructors = approvedInstructors(ds)

  const today = new Date()
  const iso = (d: Date) => d.toISOString().slice(0, 10)
  const defaultHeld = iso(today)
  const defaultCloses = iso(new Date(today.getTime() + 7 * 86_400_000))

  return (
    <div className="max-w-2xl space-y-8">
      <Link href="/org/sessions" className="inline-flex items-center gap-1.5 text-sm text-sub hover:text-ink">
        <IconArrowLeft width={16} height={16} />
        회차 목록
      </Link>

      <PageHeader
        title="특강 회차 만들기"
        description={`${org?.name ?? '기관'}에서 진행하는 특강 회차를 등록합니다. 저장하면 6자리 입장 코드와 QR이 만들어집니다.`}
      />

      {sp.error ? (
        <p className="flex items-center gap-2 rounded-md border border-negative/25 bg-negative-bg px-4 py-3 text-sm text-negative">
          <IconAlert width={16} height={16} />
          {sp.error === 'instructor'
            ? '선택한 강사를 배정할 수 없습니다. 심사가 완료된 강사만 배정할 수 있습니다.'
            : '입력값을 다시 확인해 주세요.'}
        </p>
      ) : null}

      <form action={createSession} className="space-y-6">
        <Panel title="회차 정보">
          <div className="space-y-5">
            <label className="block space-y-1.5">
              <span className="block text-sm font-medium text-body">
                회차 제목 <span className="text-negative">*</span>
              </span>
              <input
                name="title"
                required
                maxLength={60}
                placeholder="예) 드론으로 우리 동네 찍어보기"
                className="block w-full rounded-lg border border-line-strong bg-card px-4 py-3 text-sm text-ink focus:border-point focus:ring-1 focus:ring-point focus:outline-none"
              />
            </label>

            <div className="grid gap-5 sm:grid-cols-2">
              <label className="block space-y-1.5">
                <span className="block text-sm font-medium text-body">
                  분야 <span className="text-negative">*</span>
                </span>
                <select
                  name="field"
                  required
                  defaultValue=""
                  className="block w-full rounded-lg border border-line-strong bg-card px-4 py-3 text-sm text-ink focus:border-point focus:ring-1 focus:ring-point focus:outline-none"
                >
                  <option value="" disabled>
                    선택
                  </option>
                  {FIELDS.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block space-y-1.5">
                <span className="block text-sm font-medium text-body">
                  대상 학년대 <span className="text-negative">*</span>
                </span>
                <select
                  name="gradeBand"
                  required
                  defaultValue="middle"
                  className="block w-full rounded-lg border border-line-strong bg-card px-4 py-3 text-sm text-ink focus:border-point focus:ring-1 focus:ring-point focus:outline-none"
                >
                  <option value="elementary">초등</option>
                  <option value="middle">중등</option>
                  <option value="high">고등</option>
                </select>
              </label>

              <label className="block space-y-1.5">
                <span className="block text-sm font-medium text-body">
                  진행일 <span className="text-negative">*</span>
                </span>
                <input
                  type="date"
                  name="heldOn"
                  required
                  defaultValue={defaultHeld}
                  className="block w-full rounded-lg border border-line-strong bg-card px-4 py-3 text-sm text-ink focus:border-point focus:ring-1 focus:ring-point focus:outline-none"
                />
              </label>

              <label className="block space-y-1.5">
                <span className="block text-sm font-medium text-body">
                  응답 마감일 <span className="text-negative">*</span>
                </span>
                <input
                  type="date"
                  name="closesOn"
                  required
                  defaultValue={defaultCloses}
                  className="block w-full rounded-lg border border-line-strong bg-card px-4 py-3 text-sm text-ink focus:border-point focus:ring-1 focus:ring-point focus:outline-none"
                />
                <span className="block text-xs text-sub">
                  마감 뒤에 QR을 찍은 학생에게는 안내 화면이 보입니다.
                </span>
              </label>

              <label className="block space-y-1.5">
                <span className="block text-sm font-medium text-body">
                  예상 학생 수 <span className="text-negative">*</span>
                </span>
                <input
                  type="number"
                  name="expectedStudents"
                  required
                  min={1}
                  max={500}
                  defaultValue={30}
                  className="block w-full rounded-lg border border-line-strong bg-card px-4 py-3 text-sm text-ink tabular-nums focus:border-point focus:ring-1 focus:ring-point focus:outline-none"
                />
                <span className="block text-xs text-sub">응답률 계산에 쓰입니다.</span>
              </label>
            </div>
          </div>
        </Panel>

        <SessionPlanAssist />

        <Panel
          title="수업 조건"
          description="배정 강사가 이 조건으로 교안 초안을 받습니다. 학생 개인이 아니라 이 반 전체에 대한 정보만 받습니다."
        >
          <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block space-y-1.5">
                <span className="block text-sm font-medium text-body">수업 시간 (분)</span>
                <input
                  type="number"
                  name="durationMinutes"
                  min={20}
                  max={300}
                  step={5}
                  defaultValue={50}
                  className="block w-full rounded-lg border border-line-strong bg-card px-4 py-3 text-sm text-ink focus:border-point focus:ring-1 focus:ring-point focus:outline-none tabular-nums"
                />
              </label>

              <label className="block space-y-1.5">
                <span className="block text-sm font-medium text-body">장소</span>
                <select name="venue" defaultValue="교실" className="block w-full rounded-lg border border-line-strong bg-card px-4 py-3 text-sm text-ink focus:border-point focus:ring-1 focus:ring-point focus:outline-none">
                  {VENUES.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <fieldset className="space-y-2.5">
              <legend className="text-sm font-medium text-body">학급 특성 (해당하는 것만)</legend>
              <div className="flex flex-wrap gap-2">
                {CLASS_TRAITS.map((t) => (
                  <label
                    key={t}
                    className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-line-strong bg-card px-3 py-2 text-sm text-body has-checked:border-point has-checked:bg-point-bg has-checked:text-point"
                  >
                    <input type="checkbox" name="classTraits" value={t} className="accent-point" />
                    {t}
                  </label>
                ))}
              </div>
              {/* 자유 입력란을 두지 않는다. 열어 두면 특정 학생의 진단명이 적힌다 (ADR-016). */}
              <p className="rounded-md border border-line bg-muted px-3.5 py-2.5 text-xs leading-relaxed text-sub">
                강사에게는 <strong className="font-medium text-body">이 반에 어떤 대응이 필요한지</strong>만
                전달됩니다. 특정 학생을 알아볼 수 있는 내용은 적지 마세요 — 여기에는 적는 칸이 없습니다.
              </p>
            </fieldset>

            <label className="block space-y-1.5">
              <span className="block text-sm font-medium text-body">보유 장비</span>
              <textarea
                name="equipment"
                rows={2}
                placeholder="드론 10대, 태블릿 25대"
                className="block w-full rounded-lg border border-line-strong bg-card px-4 py-3 text-sm text-ink focus:border-point focus:ring-1 focus:ring-point focus:outline-none resize-none"
              />
              <span className="block text-xs text-sub">
                쉼표 또는 줄바꿈으로 구분합니다. 없는 장비를 전제한 교안이 나오지 않게 하는 데 쓰입니다.
              </span>
            </label>
          </div>
        </Panel>

        <Panel
          title="배정 강사"
          description="수업을 진행하는 강사를 지정해 주세요. 배정하지 않으면 강사가 교실에서 QR을 띄울 수도, 회차 리포트를 볼 수도 없습니다."
        >
          <div className="space-y-3">
            <select
              name="instructorId"
              defaultValue=""
              className="block w-full rounded-lg border border-line-strong bg-card px-4 py-3 text-sm text-ink focus:border-point focus:ring-1 focus:ring-point focus:outline-none"
            >
              <option value="">나중에 배정 (권장하지 않음)</option>
              {instructors.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name} · {i.fields.join('·')} · {regionName(i.region_code)}
                </option>
              ))}
            </select>

            <p className="rounded-md border border-caution/25 bg-caution-bg px-3.5 py-2.5 text-xs leading-relaxed text-caution">
              학생 유입의 실제 트리거는 교실 벽의 포스터가 아니라 강사의 한마디입니다. 배정된 강사에게
              수업 마지막 3분 안내를 부탁하면 응답률이 크게 달라집니다.
            </p>
          </div>
        </Panel>

        <div className="flex items-center gap-3">
          <Button type="submit">회차 만들기</Button>
          <Link href="/org/sessions" className="text-sm text-sub hover:text-ink">
            취소
          </Link>
        </div>
      </form>
    </div>
  )
}
