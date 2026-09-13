import { IconCheck, IconMapPin } from '@/components/ui/Icons'
import { MockCaption } from './Mockups'

/**
 * 랜딩 첫 화면의 제품 모형 — 학생 추천 화면(휴대폰) + 같은 회차의 기관 리포트.
 *
 * 숫자와 문장은 고정 예시다 (Mockups.tsx 머리 주석 참고). 학생 화면 문구는 실제 화면과 맞춘다 —
 * 제목은 "나에게 맞는 다음 교육"이고 "만족도 조사"라는 말을 쓰지 않는다 (UI_GUIDE 안전규칙 8).
 * 강사 개인 사진은 모형에도 넣지 않는다.
 */
export function HeroPreview({ pilot }: { pilot: string }) {
  return (
    <figure className="w-full">
      <div
        className="flex flex-col items-center gap-6 sm:flex-row sm:items-end sm:gap-0"
        aria-hidden="true"
      >
        <PhoneMock pilot={pilot} />
        <ReportMock />
      </div>
      <MockCaption className="text-center sm:text-left">
        학생이 설문 직후 보는 추천 화면과, 같은 회차의 기관 리포트
      </MockCaption>
    </figure>
  )
}

const BADGE = 'rounded border px-1.5 py-px text-[10px] font-medium whitespace-nowrap'

function PhoneMock({ pilot }: { pilot: string }) {
  return (
    <div className="relative z-10 w-56 shrink-0 sm:-mr-10">
      <div className="rounded-[2.5rem] bg-ink p-2 shadow-[0_32px_64px_-28px_rgba(23,23,23,0.5)]">
        <div className="overflow-hidden rounded-[2.1rem] bg-card">
          <div className="flex justify-center pt-2.5">
            <span className="h-[18px] w-[4.5rem] rounded-full bg-ink" />
          </div>

          <div className="px-3.5 pt-3 pb-4">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold tracking-tight text-ink">Find My Mento</span>
              <span className="text-[10px] text-sub tabular-nums">7 / 7</span>
            </div>
            <div className="mt-2 h-1 rounded-full bg-point" />

            <p className="mt-4 flex items-center gap-1 text-[11px] font-medium text-point">
              <IconCheck width={12} height={12} />
              답 고마워요
            </p>
            <p className="mt-1 text-[16px] leading-snug font-semibold tracking-tight text-ink">
              나에게 맞는 다음 교육
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-body">{pilot}에서 찾았어요.</p>

            <div className="mt-3 rounded-xl border border-line p-3">
              <div className="flex items-center justify-between gap-2">
                <span className={`${BADGE} border-point-line bg-point-bg text-point`}>드론</span>
                <span className={`${BADGE} border-positive/20 bg-positive-bg text-positive`}>
                  우리 동네
                </span>
              </div>
              <p className="mt-2 text-[13px] leading-snug font-semibold text-ink">
                주말 드론 입문 (4회)
              </p>
              <p className="mt-1.5 border-l-2 border-point pl-2 text-[11px] leading-relaxed text-body">
                직접 날려 보고 싶다고 해서, 가까운 4회 과정을 골랐어요.
              </p>
              <p className="mt-2 flex items-center gap-1 text-[10px] text-sub">
                <IconMapPin width={11} height={11} />
                {pilot} · 단기과정 4회
              </p>
              <div className="mt-3 flex h-9 items-center justify-center rounded-lg bg-point text-[12px] font-semibold text-white">
                더 배우고 싶어요
              </div>
            </div>

            <div className="mt-2.5 rounded-xl border border-line p-3">
              <span className={`${BADGE} border-point-line bg-point-bg text-point`}>
                3D 모델링·프린팅
              </span>
              <p className="mt-2 text-[13px] leading-snug font-semibold text-ink">
                3D 모델링으로 내 아이디어 만들기
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

const FIELD_ROWS = [
  { field: '드론', count: 16 },
  { field: 'VR·AR', count: 9, unmet: true },
  { field: '3D 모델링', count: 7 },
]

function ReportMock() {
  const max = Math.max(...FIELD_ROWS.map((r) => r.count))
  return (
    <div className="w-full min-w-0 sm:mb-14">
      <div className="overflow-hidden rounded-lg border border-line bg-card shadow-[0_24px_48px_-28px_rgba(23,23,23,0.28)]">
        <div className="border-b border-line px-5 py-3.5 sm:pl-14">
          <p className="text-[11px] font-medium text-point">회차 리포트</p>
          <p className="mt-0.5 truncate text-sm font-semibold text-ink">진로체험 · 드론 직업인 특강</p>
        </div>

        <div className="grid grid-cols-2 gap-px bg-line">
          <div className="bg-card px-5 py-4 sm:pl-14">
            <p className="text-[11px] text-sub">더 배우고 싶다</p>
            <p className="mt-1 text-3xl font-semibold tracking-tight text-ink tabular-nums">
              19<span className="ml-0.5 text-sm font-normal text-sub">명</span>
            </p>
            <p className="mt-0.5 text-[11px] font-medium text-point tabular-nums">응답자의 70%</p>
          </div>
          <div className="bg-card px-5 py-4">
            <p className="text-[11px] text-sub">응답</p>
            <p className="mt-1 text-3xl font-semibold tracking-tight text-ink tabular-nums">
              27<span className="ml-0.5 text-sm font-normal text-sub">/30</span>
            </p>
            <p className="mt-0.5 text-[11px] text-sub tabular-nums">응답률 90%</p>
          </div>
        </div>

        <div className="border-t border-line px-5 py-4 sm:pl-14">
          <p className="text-[11px] font-medium text-body">더 배우고 싶은 분야</p>
          <ul className="mt-2.5 space-y-2">
            {FIELD_ROWS.map((r) => (
              <li
                key={r.field}
                className="grid grid-cols-[4.25rem_minmax(0,1fr)_2.25rem] items-center gap-2 text-[11px]"
              >
                <span className="truncate text-body">{r.field}</span>
                <span className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <span
                    className={`block h-full rounded-full ${r.unmet ? 'bg-caution' : 'bg-point'}`}
                    style={{ width: `${(r.count / max) * 100}%` }}
                  />
                </span>
                <span className="text-right text-ink tabular-nums">{r.count}명</span>
              </li>
            ))}
          </ul>
          <p className="mt-2.5 text-[10.5px] text-caution">VR·AR · 지역 공급 0 · 미충족 수요</p>
        </div>

        <div className="border-t border-line px-5 py-3.5 sm:pl-14">
          <p className="text-[11px] text-sub">학생이 직접 쓴 말</p>
          <p className="mt-1 text-[12px] leading-relaxed text-body">
            “운동장에서 날려 본 게 제일 재밌었어요. 촬영도 배워 보고 싶어요.”
          </p>
          <p className="mt-1 text-[10.5px] text-sub">중2 학생 A</p>
        </div>
      </div>
    </div>
  )
}
