import Link from 'next/link'
import type { ReactNode } from 'react'
import { FieldIcon } from '@/components/ui/FieldIcon'
import { DemandMock, ProjectionMock } from '@/components/landing/Mockups'
import { RegionRings } from '@/components/landing/RegionRings'
import { StencilSheet } from '@/components/landing/StencilSheet'
import { Faq, type FaqItem } from '@/components/landing/Faq'
import { HowTo } from '@/components/landing/HowTo'
import { TourPanel } from '@/components/landing/TourPanel'
import { blockedSample, passSample } from '@/lib/landing/sample'
import { loadDataset } from '@/lib/db/dataset'
import { isSupabaseConfigured } from '@/lib/supabase/env'
import { publicPrograms, supplyByField, supplySummary } from '@/lib/db/queries'
import { PILOT_REGION_CODE, neighbors, regionName, twoHopNeighbors } from '@/lib/region'
import { tourHref } from '@/lib/demo/tour'
import { cn } from '@/lib/cn'
import { FIELDS, type Field } from '@/types/domain'

export const metadata = {
  // 루트 레이아웃의 `%s · Find My Mento` 템플릿을 타면 서비스명이 두 번 붙는다.
  title: { absolute: 'Find My Mento · 실습 수업 콘텐츠 스튜디오' },
}

const WRAP = 'mx-auto max-w-6xl px-4 sm:px-6'

const CTA_PRIMARY =
  'inline-flex min-h-12 items-center justify-center rounded-sm border border-point bg-point px-5 text-base font-semibold text-white transition-colors hover:bg-point-hover'
const CTA_SECONDARY =
  'inline-flex min-h-12 items-center justify-center rounded-sm border border-line-strong bg-card px-5 text-base font-semibold text-ink transition-colors hover:bg-muted'

const FIELD_COPY: Record<Field, string> = {
  드론: '운동장에서 직접 날립니다. 비행 코드와 안전 구역 표시까지 도안에 같이 나옵니다.',
  '3D 모델링·프린팅': '3D펜으로 먼저 손으로 세워 보고, 모델링과 출력으로 넘어갑니다.',
  'VR·AR': '가상·증강현실 콘텐츠를 체험하고 직접 만들어 봅니다.',
  'AI·코딩': '생활 속 문제를 코드와 AI 도구로 풀어 봅니다.',
  뷰티: '뷰티 산업의 직업을 실습으로 만나 봅니다.',
}

/**
 * 공개 랜딩.
 *
 * 첫 화면에 **이 요청에서 실제로 생성한 도안 한 장**을 둔다. 제품이 파는 것이 교실에 들고 갈
 * 종이이므로, 그 종이를 모형이 아니라 실물로 보여준다 (`lib/landing/sample.ts`).
 *
 * - 공급 규모를 숫자로 숨기지 않는다 (UI_GUIDE 안전규칙 5)
 * - 강사가 없는 분야를 빼지 않고 "강사 모집 중"으로 보여준다 (PRD 확정 결정 10)
 * - 제품 화면 모형은 고정 예시이며 "화면 예시"로 표시한다 — 실 DB 의 기관 데이터를 끌어오지 않는다
 * - 문의 버튼은 보호자를 주체로 적는다 (UI_GUIDE 안전규칙 6)
 */
export default async function LandingPage() {
  const ds = await loadDataset()
  const supply = supplySummary(ds)
  const programs = publicPrograms(ds)
  const instructorsByField = supplyByField(ds)
  const pilot = regionName(PILOT_REGION_CODE)
  const ring1 = neighbors(PILOT_REGION_CODE).map(regionName)
  const ring2 = twoHopNeighbors(PILOT_REGION_CODE).map(regionName)

  const pass = passSample()
  const blocked = blockedSample()

  const faq: FaqItem[] = [
    {
      q: '도안의 치수는 누가 정하나요?',
      a: '프로그램이 정합니다. 선 간격, 선 길이, 꺾이는 각도, 부품 수, 접합 길이, 예상 제작시간은 모두 계산된 값이고 학년대별 기준으로 판정합니다. AI는 검수된 도안 목록에서 주제에 맞는 것을 고르고 설명 문장을 쓰는 데까지만 관여합니다.',
    },
    {
      q: '검증에 걸린 도안은 어떻게 되나요?',
      a: '인쇄와 내려받기가 열리지 않습니다. 대신 걸린 항목의 측정값과 기준값, 무엇을 바꾸면 통과하는지를 보여 줍니다. 기준을 낮춰 통과시키는 설정은 없습니다 — 3mm 선 간격은 교실에서 그대로 드러나기 때문입니다.',
    },
    {
      q: '인쇄한 도안이 1:1이 맞는지 어떻게 아나요?',
      a: '종이 아래쪽에 50mm 기준선이 같이 인쇄됩니다. 자로 재서 50mm가 나오면 축척이 맞습니다. 프린터의 "용지에 맞추기" 설정이 켜져 있으면 치수가 전부 달라지므로 첫 장은 꼭 재 보세요.',
    },
    {
      q: '수강료는 어떻게 되나요?',
      a: '기관·학교가 여는 후속 과정은 기관 사업비로 운영되어 학생·보호자에게 청구되지 않습니다. 보호자 문의로 이어진 개인·소그룹 수업은 강사와 직접 정하시고, 플랫폼은 결제를 중개하지 않습니다.',
    },
    {
      q: '학생이 강사에게 직접 신청할 수 있나요?',
      a: '아니요. 학생의 관심 표현은 기관 선생님의 대시보드로 모이고, 개인 수업 문의는 성인 보호자만 남길 수 있습니다. 학생이 궁금한 점은 기관 선생님도 함께 보는 공개 Q&A에 남기면 지역 강사가 답변합니다.',
    },
    {
      q: '우리 동네에 원하는 수업이 없으면요?',
      a: `${pilot}에 없으면 ${ring1.slice(0, 3).join('·')} 같은 바로 옆 지역까지, 그래도 없으면 한 단계 더 넓혀 찾습니다. 끝내 없으면 그 관심을 미충족 수요로 기록해 새 강사를 모으는 근거로 씁니다.`,
    },
    {
      q: '기관·학교·강사는 어떻게 시작하나요?',
      a: '공개 가입 화면은 없습니다. 운영자가 보낸 초대 링크로 계정을 만들고, 이후에는 아이디와 비밀번호로 로그인합니다.',
    },
  ]

  return (
    // 한글 본문을 어절 단위로 줄바꿈한다 — "배우고 싶 / 다는" 같은 끊김을 막는다.
    <div className="break-keep">
      {/* ── 히어로 — 도안 한 장이 먼저다 ───────────────────── */}
      <section className="border-b border-line">
        <div
          className={cn(
            WRAP,
            'grid items-start gap-12 py-12 sm:py-16 lg:grid-cols-[minmax(0,1fr)_26rem] lg:gap-14 lg:py-20',
          )}
        >
          <div>
            <p className="text-sm font-semibold text-point">파일럿 운영 · 경기도 {pilot}</p>

            <h1 className="mt-5 text-[2.1rem] leading-[1.18] text-ink sm:text-[2.9rem] sm:leading-[1.14]">
              수업 조건을 넣으면
              <br />
              A4 1:1 도안이 나옵니다
            </h1>

            <p className="mt-6 max-w-xl text-base leading-[1.75] text-body sm:text-lg">
              학년대·학생 수·수업 시간·보유 장비·주제를 넣습니다. 좌표와 치수, 부품 수, 예상 제작
              시간은 프로그램이 계산합니다. 선 간격과 제작 시간 기준에 걸리면 인쇄 버튼이 열리지
              않습니다.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              {/* 체험 입구는 평범한 `<a>` 다 — `next/link` 는 누르기 전에 주소를 미리 호출한다 (ADR-033). */}
              <a href={tourHref('instructor')} className={CTA_PRIMARY}>
                강사 화면 열어 보기
              </a>
              <Link href="/programs" className={CTA_SECONDARY}>
                우리 지역 프로그램 보기
              </Link>
            </div>

            <p className="mt-4 text-sm text-sub">
              계정을 만들지 않고 들어갑니다. 강사·학생·운영자 화면이 데모 데이터로 열립니다.
            </p>

            <div className="mt-10 border-t-2 border-ink pt-5">
              <h2 className="text-base text-ink">이 도안의 검증 결과</h2>
              <p className="mt-1.5 text-sm leading-relaxed text-body">
                {pass.conditions} 조건으로 검사했습니다. 측정값과 기준을 같이 적습니다 — 통과했다는
                말보다 이 숫자가 근거입니다.
              </p>
              <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
                {pass.checks.map((c) => (
                  <div key={c.label} className="border-t border-line pt-2.5">
                    <dt className="text-xs text-sub">{c.label}</dt>
                    <dd className="mt-1 text-lg font-semibold text-positive tabular-nums">
                      {c.measured}
                    </dd>
                    <dd className="text-xs text-sub tabular-nums">기준 {c.limit}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>

          <figure className="mx-auto w-full max-w-[26rem] lg:mx-0">
            <div className="border border-line bg-card p-1.5 shadow-[0_20px_44px_-24px_rgba(19,36,43,0.5)]">
              <StencilSheet artifact={pass.artifact} />
            </div>
            <figcaption className="mt-3 text-xs leading-relaxed text-sub">
              <span className="font-semibold text-body">이 페이지를 열 때 생성한 도안입니다.</span>{' '}
              스크린샷이 아니고, 강사 화면이 쓰는 것과 같은 생성기·같은 검증기를 거쳤습니다.
            </figcaption>
          </figure>
        </div>
      </section>

      {/* ── 통과하지 못하면 어떻게 되는지 ─────────────────────── */}
      <Band
        heading="통과하지 못한 도안은 인쇄되지 않습니다"
        note="같은 도안을 조건만 바꿔 다시 돌린 결과입니다. 지어낸 예시가 아닙니다."
      >
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="self-start border border-line bg-card p-5">
            <div className="flex items-baseline justify-between gap-3 border-b border-line pb-3">
              <p className="text-base font-semibold text-ink">{blocked.title}</p>
              <p className="text-xs font-semibold text-negative">검증 실패</p>
            </div>
            <p className="mt-3 text-sm text-sub">{blocked.conditions}</p>
            <ul className="mt-4 space-y-3">
              {blocked.reasons.map((r) => (
                <li key={r.message} className="border-l-2 border-negative pl-3">
                  <p className="text-sm leading-relaxed text-body">{r.message}</p>
                  {r.measured ? (
                    <p className="mt-0.5 text-xs text-sub tabular-nums">{r.measured}</p>
                  ) : null}
                </li>
              ))}
            </ul>
            <p className="mt-4 border-t border-line pt-3 text-xs leading-relaxed text-sub">
              {blocked.rounds > 1
                ? `치수를 고쳐 ${blocked.rounds - 1}번 다시 검증했고, 그래도 넘지 못해 실패로 남았습니다.`
                : '첫 검증에서 기준을 넘지 못해 실패로 남았습니다.'}
            </p>
          </div>

          <div className="space-y-5">
            <Fact title="기준을 낮추는 설정은 없습니다">
              3mm 선 간격은 물리 현상입니다. 3D펜 노즐로 그 아래를 그리면 선이 붙습니다. 통과율을
              올리려고 임계값을 내리면 그 결과는 교실에서 학생의 손으로 드러납니다.
            </Fact>
            <Fact title="실패 화면에도 다음 행동이 있습니다">
              걸린 항목마다 무엇을 바꾸면 되는지 같이 적습니다 — 수업 시간을 늘리거나, 부품이 적은
              도안을 고르거나, 학년대를 올리는 식입니다.
            </Fact>
            <Fact title="드론 수업의 안전 문구는 고정입니다">
              사람 위 비행 금지, 프로펠러 가드, 이착륙 구역 표시, 조종자 1명. AI가 고쳐 쓰지
              못합니다.
            </Fact>
          </div>
        </div>
      </Band>

      {/* ── 로그인 없이 둘러보기 (ADR-033) ───────────────────── */}
      <Band
        id="tour"
        heading="계정 없이 들어가 보세요"
        note="도안 생성과 검증처럼 실제로 계산하는 기능은 체험에서도 그대로 작동합니다."
      >
        <TourPanel live={isSupabaseConfigured()} />
      </Band>

      {/* ── 사용 방법 — 강사 · 학생 ───────────────────────────── */}
      <Band
        id="guide"
        heading="강사와 학생은 이렇게 씁니다"
        note="여기 적힌 단계는 전부 지금 화면에 있는 것입니다."
      >
        <HowTo />
      </Band>

      {/* ── 공급 현황 — 파일럿 규모를 숨기지 않는다 ─────────────── */}
      <section aria-labelledby="supply-title" className="border-b border-line bg-card">
        <div className={cn(WRAP, 'py-8')}>
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
            <h2 id="supply-title" className="text-base text-ink">
              지금 등록된 공급
            </h2>
            <p className="text-sm text-sub">
              파일럿 단계라 숫자가 작습니다. 부풀리지 않고 그대로 적습니다.
            </p>
          </div>
          <dl className="mt-5 grid grid-cols-2 border-y border-line lg:grid-cols-4">
            {[
              { label: '등록 업체', value: supply.providerCount, unit: '곳' },
              { label: '심사 완료 강사', value: supply.instructorCount, unit: '명' },
              { label: '공개 프로그램', value: supply.programCount, unit: '개' },
              {
                label: '수업이 있는 분야',
                value: supply.coveredFields.length,
                unit: ` / ${FIELDS.length}개 분야`,
              },
            ].map((s) => (
              <div key={s.label} className="rule-cell px-4 py-4 first:pl-0 sm:first:pl-4">
                <dt className="text-xs text-sub">{s.label}</dt>
                <dd className="mt-1 font-display text-3xl font-bold tracking-tight text-ink tabular-nums">
                  {s.value}
                  <span className="ml-0.5 text-base font-medium text-sub">{s.unit}</span>
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ── 분야 ─────────────────────────────────────────────── */}
      <Band
        heading="신산업 5개 분야"
        note="직접 만져 보는 수업만 연결합니다. 드론을 날리고 출력물을 꺼내 보는 경험은 화면으로 옮겨지지 않습니다."
        labelledBy="fields-title"
      >
        <ul className="divide-y divide-line border-y border-line">
          {FIELDS.map((f) => {
            const instructorCount = instructorsByField[f] ?? 0
            const programCount = programs.filter((p) => p.field === f).length
            const covered = instructorCount > 0

            return (
              <li key={f}>
                {covered ? (
                  <Link
                    href={`/programs?field=${encodeURIComponent(f)}`}
                    className="group grid grid-cols-[2.25rem_minmax(0,1fr)] items-start gap-x-4 gap-y-1.5 py-5 transition-colors hover:bg-card sm:grid-cols-[2.25rem_10.5rem_minmax(0,1fr)_10.5rem] sm:items-center"
                  >
                    <FieldIcon field={f} width={28} height={28} className="text-point" />
                    <h3 className="text-base text-ink group-hover:text-point">{f}</h3>
                    <p className="col-start-2 text-sm leading-relaxed text-body sm:col-start-auto">
                      {FIELD_COPY[f]}
                    </p>
                    <p className="col-start-2 text-sm font-semibold text-point tabular-nums sm:col-start-auto sm:text-right sm:whitespace-nowrap">
                      프로그램 {programCount}개 · 강사 {instructorCount}명
                    </p>
                  </Link>
                ) : (
                  <div className="grid grid-cols-[2.25rem_minmax(0,1fr)] items-start gap-x-4 gap-y-1.5 py-5 sm:grid-cols-[2.25rem_10.5rem_minmax(0,1fr)_10.5rem] sm:items-center">
                    <FieldIcon field={f} width={28} height={28} className="text-faint" />
                    <h3 className="text-base text-sub">{f}</h3>
                    <p className="col-start-2 text-sm leading-relaxed text-body sm:col-start-auto">
                      {FIELD_COPY[f]} 고른 학생의 관심은 미충족 수요로 기록합니다.
                    </p>
                    <p className="col-start-2 text-sm font-semibold text-caution sm:col-start-auto sm:text-right">
                      강사 모집 중
                    </p>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      </Band>

      {/* ── 대상별 안내 ──────────────────────────────────────── */}
      <Band
        full
        id="who"
        heading="강사, 학교·기관, 보호자"
        note="각자 다른 화면을 봅니다. 학생이 강사에게 직접 닿는 버튼은 어디에도 없습니다."
      >
        <div className="space-y-16 lg:space-y-20">
          <FeatureRow
            who="강사 · 직업인"
            title="수업 전날 밤에 여는 화면"
            body="조건을 넣어 도안을 만들고, 검증 결과를 읽고, 통과한 것만 승인해 인쇄합니다. 수업이 끝나면 실제로 걸린 시간을 남기고, 같은 도안 3건이 모이면 다음 예상 시간에 반영됩니다."
            points={[
              '검증을 통과한 산출물에만 인쇄·내려받기가 열립니다',
              '배정 회차를 고르면 그 회차의 조건이 그대로 들어옵니다',
              '교실 투사용 QR과 회차 리포트',
              '성과 기록은 회차 단위입니다 — 누가 못 했는지는 받지 않습니다',
            ]}
            link={{ href: '/login', label: '강사 로그인' }}
            visual={<ProjectionMock />}
          />

          <FeatureRow
            reverse
            who="학교 · 청소년기관"
            title="섭외의 근거가 남는 화면"
            body="매년 같은 업체만 부르던 섭외를 수요 데이터로 바꿉니다. 회차가 끝나면 후속 의향과 분야별 관심이 리포트로 남고, 강사가 없는 분야는 새 강사를 찾을 근거가 됩니다."
            points={[
              '회차별 만족도와 후속 의향을 따로 집계',
              '분야 × 학년대 수요와 학생이 직접 쓴 문장',
              '예산 기안·사업 보고에 쓸 수 있는 숫자',
              '지역 강사 섭외 요청 발송과 상태 추적',
            ]}
            link={{ href: '/login', label: '기관 담당자 로그인' }}
            visual={<DemandMock />}
          />

          <FeatureRow
            who="보호자"
            title="우리 동네부터 넓혀 가며 찾는 화면"
            body={`로그인 없이 지역 프로그램을 볼 수 있습니다. ${pilot}에 원하는 수업이 없으면 바로 옆 지역까지, 그래도 없으면 한 단계 더 넓혀 찾습니다.`}
            points={[
              '계정을 만들지 않고 문의 한 건만 남깁니다',
              '운영자가 확인해 심사 완료 강사에게 전달',
              '영업일 2일 안에 강사가 알려주신 연락처로 연락',
              '아이 정보는 학년대(초·중·고)까지만 받습니다',
            ]}
            link={{ href: '/inquiry', label: '보호자님, 문의 남기기' }}
            visual={<RegionRings center={pilot} ring1={ring1} ring2={ring2} />}
          />
        </div>
      </Band>

      {/* ── 안전 설계 ────────────────────────────────────────── */}
      <Band
        id="safety"
        heading="미성년자를 대상으로 하므로 기능부터 제약합니다"
        note="설정으로 끄는 방식이 아니라 애초에 만들지 않는 방식입니다. 권한은 화면이 아니라 데이터베이스 단계에서 막습니다."
      >
        <dl className="grid gap-x-10 gap-y-6 sm:grid-cols-2">
          {[
            {
              t: '학생 개인정보를 저장하지 않습니다',
              d: '실명·연락처·학교를 받는 입력란이 없습니다. 학생 식별은 기관이 발급한 가명코드뿐이고, 코드와 실명을 잇는 표는 기관만 가지고 있습니다.',
            },
            {
              t: '1:1 비공개 메시지 기능이 없습니다',
              d: '학생과 강사의 소통은 기관 담당자가 함께 볼 수 있는 공개 Q&A 스레드뿐입니다. 실시간 채팅도 만들지 않습니다.',
            },
            {
              t: '강사 연락처를 어디에도 싣지 않습니다',
              d: '공개 디렉토리에도 전화번호·SNS·주소가 없습니다. 연락처는 별도 테이블에 있고 비로그인 조회 권한이 없습니다.',
            },
            {
              t: '심사를 통과한 강사만 노출됩니다',
              d: '자격 증빙과 성범죄경력 조회 증빙을 운영자가 직접 확인합니다. 심사 전 강사는 추천·디렉토리·Q&A 어디에도 나타나지 않습니다.',
            },
            {
              t: '산출물은 학생에게 도달하지 않습니다',
              d: '도안과 교안을 읽을 수 있는 주체는 작성 강사·발주 기관 구성원·운영자 셋뿐입니다. 학생·보호자 쪽으로 가는 경로를 만들지 않았습니다.',
            },
            {
              t: '캐릭터·상표 도안을 만들지 않습니다',
              d: '캐릭터 이름이 들어온 주제는 일반 형태로 바꿔 만들고, 바꿨다는 사실을 화면에 적습니다. 인쇄물이 교실로 가기 때문입니다.',
            },
          ].map((item) => (
            <div key={item.t} className="border-t border-line pt-4">
              <dt className="text-base leading-snug font-semibold text-ink">{item.t}</dt>
              <dd className="mt-1.5 text-sm leading-relaxed text-body">{item.d}</dd>
            </div>
          ))}
        </dl>
      </Band>

      {/* ── 자주 묻는 질문 ───────────────────────────────────── */}
      <Band id="faq" heading="자주 묻는 질문" note="더 궁금한 점은 공개 Q&A에 남겨 주세요. 지역 강사가 답변합니다.">
        <Faq items={faq} />
        <Link
          href="/qna"
          className="mt-6 inline-flex text-sm font-semibold text-point underline underline-offset-4 hover:text-point-hover"
        >
          공개 Q&amp;A 둘러보기
        </Link>
      </Band>

      {/* ── 마무리 ───────────────────────────────────────────── */}
      <section className="border-t-2 border-ink bg-card">
        <div
          className={cn(
            WRAP,
            'flex flex-col gap-6 py-12 lg:flex-row lg:items-end lg:justify-between',
          )}
        >
          <div className="max-w-xl">
            <h2 className="text-2xl leading-snug text-ink">
              다음 수업에 쓸 도안부터 한 장 만들어 보세요
            </h2>
            <p className="mt-3 text-base leading-relaxed text-body">
              계정 없이 강사 화면이 열립니다. 수업 문의는 보호자님이 남겨 주세요.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <a href={tourHref('instructor')} className={CTA_PRIMARY}>
              강사 화면 열어 보기
            </a>
            <Link href="/inquiry" className={CTA_SECONDARY}>
              보호자님, 문의 남기기
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}

/**
 * 섹션 한 덩어리. 제목은 **왼쪽 여백에 걸어** 두고 본문은 오른쪽에 둔다 —
 * 도면의 여백 주석과 같은 자리다. 섹션마다 흰 면·회색 면을 번갈아 칠하지 않는다.
 */
function Band({
  id,
  heading,
  note,
  labelledBy,
  full = false,
  children,
}: {
  id?: string
  heading: string
  note?: string
  /** 테스트·링크가 참조하는 제목 id 를 따로 줄 때만 쓴다 */
  labelledBy?: string
  /** 본문이 화면 전체 폭을 써야 할 때 (제품 화면 모형처럼). 제목이 본문 위로 올라간다. */
  full?: boolean
  children: ReactNode
}) {
  const titleId = labelledBy ?? (id ? `${id}-title` : undefined)

  const title = (
    <div className={cn(full ? 'max-w-2xl' : 'lg:sticky lg:top-24 lg:self-start')}>
      <h2 id={titleId} className="text-xl leading-snug text-ink sm:text-[1.4rem]">
        {heading}
      </h2>
      {note ? <p className="mt-3 text-sm leading-relaxed text-sub">{note}</p> : null}
    </div>
  )

  return (
    <section
      id={id}
      aria-labelledby={titleId}
      className={cn('border-b border-line', id && 'scroll-mt-16')}
    >
      <div
        className={cn(
          WRAP,
          'py-14 sm:py-16',
          !full && 'grid gap-x-12 gap-y-6 lg:grid-cols-[15rem_minmax(0,1fr)]',
        )}
      >
        {title}
        <div className={cn('min-w-0', full && 'mt-10')}>{children}</div>
      </div>
    </section>
  )
}

function Fact({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="border-t border-line pt-4">
      <h3 className="text-base text-ink">{title}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-body">{children}</p>
    </div>
  )
}

function FeatureRow({
  who,
  title,
  body,
  points,
  link,
  visual,
  reverse = false,
}: {
  who: string
  title: string
  body: string
  points: string[]
  link: { href: string; label: string }
  visual: ReactNode
  reverse?: boolean
}) {
  return (
    <div className="grid items-center gap-8 lg:grid-cols-2 lg:gap-12">
      <div className={cn(reverse && 'lg:order-2')}>
        <p className="text-sm font-semibold text-point">{who}</p>
        <h3 className="mt-2 text-xl leading-snug text-ink">{title}</h3>
        <p className="mt-3 text-base leading-relaxed text-body">{body}</p>
        <ul className="mt-5 divide-y divide-line border-y border-line">
          {points.map((t) => (
            <li key={t} className="py-2.5 text-sm leading-relaxed text-body">
              {t}
            </li>
          ))}
        </ul>
        <Link
          href={link.href}
          className="mt-5 inline-flex text-sm font-semibold text-point underline underline-offset-4 hover:text-point-hover"
        >
          {link.label}
        </Link>
      </div>
      <div className={cn('min-w-0', reverse && 'lg:order-1')}>{visual}</div>
    </div>
  )
}
