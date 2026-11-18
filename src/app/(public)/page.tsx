import Link from 'next/link'
import type { ReactNode } from 'react'
import { FieldIcon } from '@/components/ui/FieldIcon'
import { IconCheck } from '@/components/ui/Icons'
import { HeroPreview } from '@/components/landing/HeroPreview'
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
import { cn } from '@/lib/cn'
import { FIELDS, type Field } from '@/types/domain'

export const metadata = {
  // 루트 레이아웃의 `%s · Find My Mento` 템플릿을 타면 서비스명이 두 번 붙는다.
  title: { absolute: 'Find My Mento · 우리 지역 직업인 강사 찾기' },
}

const WRAP = 'mx-auto max-w-6xl px-4 sm:px-6'

const CTA_PRIMARY =
  'inline-flex min-h-12 items-center justify-center rounded-sm border border-point bg-point px-5 text-base font-semibold text-white transition-colors hover:bg-point-hover'
const CTA_SECONDARY =
  'inline-flex min-h-12 items-center justify-center rounded-sm border border-line-strong bg-card px-5 text-base font-semibold text-ink transition-colors hover:bg-muted'

/** 분야 설명은 한 줄 명사구다. 분야 다섯 개가 문장 다섯 개가 되면 목록이 글이 된다. */
const FIELD_COPY: Record<Field, string> = {
  드론: '운동장에서 직접 날리기 · 비행 코드 · 항공 촬영',
  '3D 모델링·프린팅': '3D펜으로 세워 보고 모델링·출력까지',
  'VR·AR': '가상·증강현실 콘텐츠 체험과 제작',
  'AI·코딩': '생활 속 문제를 코드와 AI 도구로',
  뷰티: '뷰티 산업의 직업을 실습으로',
}

/** 히어로 아래 한 줄 — 이 서비스의 제약 셋. 문장으로 늘리지 않는다. */
const HERO_FACTS = ['학생 개인정보 저장 안 함', '심사 통과 강사만 노출', '1:1 비공개 메시지 없음']

const SAFETY: { t: string; d: string }[] = [
  {
    t: '학생 개인정보를 저장하지 않습니다',
    d: '실명·연락처·학교 입력란 없음 · 식별은 기관이 발급한 가명코드뿐',
  },
  { t: '1:1 비공개 메시지가 없습니다', d: '기관 담당자도 보는 공개 Q&A 하나뿐 · 채팅 없음' },
  { t: '강사 연락처를 싣지 않습니다', d: '공개 디렉토리에도 없음 · 비로그인 조회 권한 자체가 없음' },
  { t: '심사 통과 강사만 노출합니다', d: '자격·성범죄경력 조회 증빙을 운영자가 직접 확인' },
  { t: '산출물은 학생에게 가지 않습니다', d: '도안·교안은 작성 강사 · 발주 기관 · 운영자까지' },
  { t: '캐릭터·상표 도안을 만들지 않습니다', d: '일반 형태로 바꿔 만들고 바꿨다는 사실을 화면에 표시' },
]

/**
 * 공개 랜딩.
 *
 * 첫 화면은 **관심이 어디로 이어지는가**다 — 특강에서 끝나던 관심을 기관의 후속 과정과
 * 보호자 문의로 잇는다는 것. 도안 생성은 그 다음 섹션에서 실물로 보여준다.
 *
 * 글을 줄이는 것이 이 화면의 설계다. 읽는 사람은 담당자·보호자이고 둘 다 스크롤하면서
 * 훑는다. 그래서 목록·라벨은 **명사로 끝내고**, 문장은 사람에게 말하는 자리에만 둔다.
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

  // 답은 한두 줄로 끝낸다. 길어지는 설명은 그 화면에서 읽는 쪽이 낫다.
  const faq: FaqItem[] = [
    {
      q: '도안의 치수는 누가 정하나요?',
      a: '프로그램이 계산합니다. AI는 검수된 도안 목록에서 고르고 설명 문장을 쓰는 데까지만 관여합니다.',
    },
    {
      q: '검증에 걸린 도안은 어떻게 되나요?',
      a: '인쇄와 내려받기가 열리지 않습니다. 걸린 항목의 측정값·기준값과 무엇을 바꾸면 되는지를 보여 줍니다.',
    },
    {
      q: '인쇄한 도안이 1:1인지 어떻게 아나요?',
      a: '종이 아래쪽 50mm 기준선을 자로 재 보세요. 프린터의 "용지에 맞추기"는 꼭 꺼 주세요.',
    },
    {
      q: '수강료는 어떻게 되나요?',
      a: '기관·학교가 여는 과정은 기관 사업비로 운영됩니다. 개인 수업은 강사와 직접 정하시고, 플랫폼은 결제를 중개하지 않습니다.',
    },
    {
      q: '학생이 강사에게 직접 신청할 수 있나요?',
      a: '아니요. 학생의 관심은 기관 선생님 화면으로 모이고, 수업 문의는 보호자만 남길 수 있습니다.',
    },
    {
      q: '우리 동네에 원하는 수업이 없으면요?',
      a: `${pilot} → ${ring1.slice(0, 3).join('·')} 같은 옆 지역 → 한 단계 더 넓혀 찾습니다. 끝내 없으면 미충족 수요로 기록합니다.`,
    },
    {
      q: '기관·학교·강사는 어떻게 시작하나요?',
      a: '공개 가입 화면은 없습니다. 운영자가 보낸 초대 링크로 계정을 만듭니다.',
    },
  ]

  return (
    // 한글 본문을 어절 단위로 줄바꿈한다 — "배우고 싶 / 다는" 같은 끊김을 막는다.
    <div className="break-keep">
      {/* ── 히어로 ─────────────────────────────────────────── */}
      <section className="border-b border-line bg-card">
        <div
          className={cn(
            WRAP,
            'grid items-center gap-12 py-12 sm:py-16 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-10 lg:py-20',
          )}
        >
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-point-line bg-point-bg px-3 py-1 text-xs font-semibold text-point">
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-point" />
              파일럿 운영 중 · 경기도 {pilot}
            </p>

            <h1 className="mt-6 text-[2.1rem] leading-[1.2] text-ink sm:text-[2.9rem] sm:leading-[1.15]">
              특강 한 번으로 끝나던 관심을
              <br />
              우리 지역 강사와 잇습니다
            </h1>

            <p className="mt-6 max-w-xl text-base leading-[1.7] text-body sm:text-lg">
              진로체험이 끝나면 사라지던 &ldquo;더 배우고 싶다&rdquo;를 모아, 기관의 후속 과정과
              보호자 문의로 이어 드립니다.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/programs" className={CTA_PRIMARY}>
                우리 지역 프로그램 보기
              </Link>
              <Link href="/inquiry" className={CTA_SECONDARY}>
                보호자님, 문의 남기기
              </Link>
            </div>

            <p className="mt-4 text-sm text-sub">
              담당자·강사시라면{' '}
              <Link href="#tour" className="font-semibold text-point underline underline-offset-4">
                계정 없이 둘러보기
              </Link>
            </p>

            <ul className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-sm text-body">
              {HERO_FACTS.map((t) => (
                <li key={t} className="flex items-center gap-1.5">
                  <IconCheck width={16} height={16} className="shrink-0 text-point" />
                  {t}
                </li>
              ))}
            </ul>
          </div>

          <HeroPreview pilot={pilot} />
        </div>
      </section>

      {/* ── 도안 — 모형이 아니라 이 요청에서 만든 종이 한 장 ───── */}
      <Band
        heading="수업에 쓸 도안은 조건을 넣으면 나옵니다"
        note="좌표·치수·부품 수·제작 시간은 프로그램이 계산합니다."
      >
        <div className="grid gap-8 lg:grid-cols-[17rem_minmax(0,1fr)] lg:gap-10">
          <figure>
            <div className="border border-line bg-card p-1.5 shadow-[0_20px_44px_-24px_rgba(19,36,43,0.5)]">
              <StencilSheet artifact={pass.artifact} />
            </div>
            <figcaption className="mt-2.5 text-xs leading-relaxed text-sub">
              이 페이지를 열 때 생성한 도안 · 강사 화면과 같은 렌더러
            </figcaption>
          </figure>

          <div>
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b-2 border-ink pb-2.5">
              <h3 className="text-base text-ink">{pass.conditions}</h3>
              <p className="text-sm font-semibold text-positive">검증 통과</p>
            </div>
            <dl className="grid grid-cols-2 gap-x-6 sm:grid-cols-4">
              {pass.checks.map((c) => (
                <div key={c.label} className="border-b border-line py-3">
                  <dt className="text-xs text-sub">{c.label}</dt>
                  <dd className="mt-1 text-lg font-semibold text-positive tabular-nums">
                    {c.measured}
                  </dd>
                  <dd className="text-xs text-sub tabular-nums">기준 {c.limit}</dd>
                </div>
              ))}
            </dl>

            <div className="mt-8 border border-line bg-card p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-line pb-2.5">
                <h3 className="text-base text-ink">
                  같은 도안 · {blocked.conditions}
                </h3>
                <p className="text-sm font-semibold text-negative">검증 실패</p>
              </div>
              <ul className="mt-3 space-y-2.5">
                {blocked.reasons.map((r) => (
                  <li key={r.message} className="border-l-2 border-negative pl-3">
                    <p className="text-sm leading-relaxed text-body">{r.message}</p>
                    {r.measured ? (
                      <p className="mt-0.5 text-xs text-sub tabular-nums">{r.measured}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
              <p className="mt-4 border-t border-line pt-3 text-sm leading-relaxed text-body">
                실패하면 인쇄·내려받기가 열리지 않습니다. 기준을 낮추는 설정은 없습니다 — 3mm 선
                간격은 3D펜 노즐에서 나온 값입니다.
              </p>
            </div>
          </div>
        </div>
      </Band>

      {/* ── 로그인 없이 둘러보기 (ADR-033) ───────────────────── */}
      <Band id="tour" heading="계정 없이 들어가 보세요">
        <TourPanel live={isSupabaseConfigured()} />
      </Band>

      {/* ── 사용 방법 — 강사 · 학생 ───────────────────────────── */}
      <Band id="guide" heading="강사와 학생은 이렇게 씁니다">
        <HowTo />
      </Band>

      {/* ── 공급 현황 — 파일럿 규모를 숨기지 않는다 ─────────────── */}
      <section aria-labelledby="supply-title" className="border-b border-line bg-card">
        <div className={cn(WRAP, 'py-8')}>
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
            <h2 id="supply-title" className="text-base text-ink">
              지금 등록된 공급
            </h2>
            <p className="text-sm text-sub">파일럿 단계 · 부풀리지 않은 숫자</p>
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
        note="직접 만져 보는 오프라인 수업만 연결합니다."
        labelledBy="fields-title"
      >
        <ul className="divide-y divide-line border-y border-line">
          {FIELDS.map((f) => {
            const instructorCount = instructorsByField[f] ?? 0
            const programCount = programs.filter((p) => p.field === f).length

            return (
              <li key={f}>
                {instructorCount > 0 ? (
                  <Link
                    href={`/programs?field=${encodeURIComponent(f)}`}
                    className="group grid grid-cols-[2.25rem_minmax(0,1fr)] items-start gap-x-4 gap-y-1 py-4 transition-colors hover:bg-card sm:grid-cols-[2.25rem_10.5rem_minmax(0,1fr)_10.5rem] sm:items-center"
                  >
                    <FieldIcon field={f} width={28} height={28} className="text-point" />
                    <h3 className="text-base text-ink group-hover:text-point">{f}</h3>
                    <p className="col-start-2 text-sm text-body sm:col-start-auto">
                      {FIELD_COPY[f]}
                    </p>
                    <p className="col-start-2 text-sm font-semibold text-point tabular-nums sm:col-start-auto sm:text-right sm:whitespace-nowrap">
                      프로그램 {programCount}개 · 강사 {instructorCount}명
                    </p>
                  </Link>
                ) : (
                  <div className="grid grid-cols-[2.25rem_minmax(0,1fr)] items-start gap-x-4 gap-y-1 py-4 sm:grid-cols-[2.25rem_10.5rem_minmax(0,1fr)_10.5rem] sm:items-center">
                    <FieldIcon field={f} width={28} height={28} className="text-faint" />
                    <h3 className="text-base text-sub">{f}</h3>
                    <p className="col-start-2 text-sm text-body sm:col-start-auto">
                      {FIELD_COPY[f]} · 관심은 미충족 수요로 기록
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
        note="학생이 눌러서 강사에게 바로 닿는 버튼은 어디에도 없습니다."
      >
        <div className="space-y-16 lg:space-y-20">
          <FeatureRow
            who="강사 · 직업인"
            title="수업 전날 밤에 여는 화면"
            body="조건을 넣어 도안을 만들고, 검증을 통과한 것만 승인해 인쇄합니다."
            points={[
              '통과한 산출물에만 인쇄·내려받기',
              '배정 회차를 고르면 조건이 그대로 입력',
              '교실 투사용 QR과 회차 리포트',
              '성과 기록은 회차 단위 — 누가 못 했는지는 받지 않음',
            ]}
            link={{ href: '/login', label: '강사 로그인' }}
            visual={<ProjectionMock />}
          />

          <FeatureRow
            reverse
            who="학교 · 청소년기관"
            title="섭외의 근거가 남는 화면"
            body="같은 업체만 부르던 섭외를 수요 숫자로 바꿉니다."
            points={[
              '회차별 만족도와 후속 의향을 따로 집계',
              '분야 × 학년대 수요와 학생이 쓴 문장',
              '예산 기안·사업 보고에 쓰는 숫자',
              '지역 강사 섭외 요청과 상태 추적',
            ]}
            link={{ href: '/login', label: '기관 담당자 로그인' }}
            visual={<DemandMock />}
          />

          <FeatureRow
            who="보호자"
            title="우리 동네부터 넓혀 가며 찾는 화면"
            body={`로그인 없이 지역 프로그램을 봅니다. ${pilot}에 없으면 옆 지역, 그래도 없으면 한 단계 더 넓혀 찾습니다.`}
            points={[
              '계정 없이 문의 한 건',
              '운영자가 확인해 심사 완료 강사에게 전달',
              '영업일 2일 안에 알려주신 연락처로 연락',
              '아이 정보는 학년대(초·중·고)까지만',
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
        note="끄는 설정이 아니라 만들지 않는 방식입니다. 권한은 데이터베이스에서 막습니다."
      >
        <dl className="grid gap-x-10 sm:grid-cols-2">
          {SAFETY.map((item) => (
            <div key={item.t} className="border-t border-line py-4">
              <dt className="text-[0.95rem] leading-snug font-semibold text-ink">{item.t}</dt>
              <dd className="mt-1 text-sm leading-relaxed text-body">{item.d}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-6 border-l-2 border-line-strong pl-3 text-sm leading-relaxed text-sub">
          드론 수업의 안전 문구는 고정입니다 — 사람 위 비행 금지, 프로펠러 가드, 이착륙 구역 표시,
          조종자 1명.
        </p>
      </Band>

      {/* ── 자주 묻는 질문 ───────────────────────────────────── */}
      <Band id="faq" heading="자주 묻는 질문">
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
              우리 지역에 어떤 수업이 있는지부터 보세요
            </h2>
            <p className="mt-3 text-base text-body">
              로그인 없이 볼 수 있습니다. 수업 문의는 보호자님이 남겨 주세요.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/programs" className={CTA_PRIMARY}>
              프로그램 찾기
            </Link>
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
 *
 * `note` 는 **없는 쪽이 기본이다.** 제목이 이미 말한 것을 한 번 더 설명하는 자리가 되면
 * 화면이 글로 덮인다. 제목만으로 모자랄 때 한 줄만 쓴다.
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
      {note ? <p className="mt-2.5 text-sm leading-relaxed text-sub">{note}</p> : null}
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
          'py-12 sm:py-14',
          !full && 'grid gap-x-12 gap-y-6 lg:grid-cols-[15rem_minmax(0,1fr)]',
        )}
      >
        {title}
        <div className={cn('min-w-0', full && 'mt-8')}>{children}</div>
      </div>
    </section>
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
        <p className="mt-2.5 text-base leading-relaxed text-body">{body}</p>
        <ul className="mt-5 divide-y divide-line border-y border-line">
          {points.map((t) => (
            <li key={t} className="py-2.5 text-sm text-body">
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
