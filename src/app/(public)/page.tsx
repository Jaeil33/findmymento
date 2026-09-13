import Link from 'next/link'
import type { ComponentType, ReactNode, SVGProps } from 'react'
import { Badge } from '@/components/ui/Badge'
import { FieldIcon } from '@/components/ui/FieldIcon'
import { HeroPreview } from '@/components/landing/HeroPreview'
import { DemandMock, ProjectionMock } from '@/components/landing/Mockups'
import { RegionRings } from '@/components/landing/RegionRings'
import { Faq, type FaqItem } from '@/components/landing/Faq'
import { loadDataset } from '@/lib/db/dataset'
import { publicPrograms, supplyByField, supplySummary } from '@/lib/db/queries'
import { PILOT_REGION_CODE, neighbors, regionName, twoHopNeighbors } from '@/lib/region'
import { cn } from '@/lib/cn'
import { FIELDS, type Field } from '@/types/domain'
import {
  IconArrowRight,
  IconChart,
  IconChat,
  IconCheck,
  IconEyeOff,
  IconLock,
  IconQr,
  IconSend,
  IconShield,
} from '@/components/ui/Icons'

export const metadata = {
  // 루트 레이아웃의 `%s · Find My Mento` 템플릿을 타면 서비스명이 두 번 붙는다.
  title: { absolute: 'Find My Mento · 우리 지역 직업인 강사 찾기' },
}

const WRAP = 'mx-auto max-w-6xl px-4 sm:px-6'

const CTA_PRIMARY =
  'inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-point px-5 text-base font-semibold text-white transition-colors hover:bg-point-hover'
const CTA_SECONDARY =
  'inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-line-strong bg-card px-5 text-base font-medium text-ink transition-colors hover:bg-muted'

const FIELD_COPY: Record<Field, string> = {
  드론: '조종 기초부터 항공 촬영·드론 코딩까지. 운동장에서 직접 날려 봅니다.',
  '3D 모델링·프린팅': '떠올린 아이디어를 모델링하고, 3D 프린터에서 꺼내 봅니다.',
  'VR·AR': '가상·증강현실 콘텐츠를 체험하고 직접 만들어 봅니다.',
  'AI·코딩': '생활 속 문제를 코드와 AI 도구로 풀어 봅니다.',
  뷰티: '뷰티 산업의 직업을 실습으로 만나 봅니다.',
}

type Step = {
  when: string
  title: string
  body: string
  Icon: ComponentType<SVGProps<SVGSVGElement>>
}

const STEPS: Step[] = [
  {
    when: '교실에서',
    title: '특강 마지막 3분, QR 한 번',
    body: '강사가 교실 프로젝터에 QR을 띄웁니다. 학생은 가입 없이 답하고, 바로 자기에게 맞는 다음 교육을 봅니다.',
    Icon: IconQr,
  },
  {
    when: '기관 대시보드',
    title: '더 배우고 싶다는 신호가 모입니다',
    body: '응답이 분야·학년대별로 쌓입니다. 만족도와 후속 의향을 따로 집계하고, 강사가 없는 분야도 수요로 남깁니다.',
    Icon: IconChart,
  },
  {
    when: '섭외',
    title: '기관이 후속 과정을 엽니다',
    body: '기관이 수요를 확인하고 보호자 동의를 기록한 뒤, 지역 강사에게 섭외 요청을 보냅니다.',
    Icon: IconSend,
  },
]

const SAFETY: { t: string; d: string; Icon: ComponentType<SVGProps<SVGSVGElement>> }[] = [
  {
    t: '학생 개인정보를 저장하지 않습니다',
    d: '실명·연락처·학교를 받는 입력란이 없습니다. 학생 식별은 기관이 발급한 가명코드뿐이고, 코드와 실명을 잇는 표는 기관만 가지고 있습니다.',
    Icon: IconLock,
  },
  {
    t: '1:1 비공개 메시지 기능이 없습니다',
    d: '학생과 강사의 소통은 기관 담당자가 함께 볼 수 있는 공개 Q&A 스레드뿐입니다. 실시간 채팅도 만들지 않습니다.',
    Icon: IconChat,
  },
  {
    t: '강사 연락처를 어디에도 싣지 않습니다',
    d: '공개 디렉토리에도 전화번호·SNS·주소가 없습니다. 연락처는 별도 테이블에 있고 비로그인 조회 권한이 없습니다.',
    Icon: IconEyeOff,
  },
  {
    t: '심사를 통과한 강사만 노출됩니다',
    d: '자격 증빙과 성범죄경력 조회 증빙을 운영자가 직접 확인합니다. 심사 전 강사는 추천·디렉토리·Q&A 어디에도 나타나지 않습니다.',
    Icon: IconShield,
  },
]

/**
 * 공개 랜딩.
 *
 * 홈페이지다운 구성(제품 모형·분야·이용 방법·FAQ)을 쓰되, 사실과 제약을 먼저 적는다는 원칙은 그대로다.
 * - 공급 규모를 숫자로 숨기지 않는다 (UI_GUIDE 안전규칙 5)
 * - 강사가 없는 분야를 빼지 않고 "강사 모집 중"으로 보여준다 (PRD 확정 결정 10)
 * - 제품 모형은 고정 예시이며 "화면 예시"로 표시한다 — 실 DB 의 기관 데이터를 공개 화면에 끌어오지 않는다
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

  const stats = [
    { label: '등록 업체', value: supply.providerCount, unit: '곳' },
    { label: '심사 완료 강사', value: supply.instructorCount, unit: '명' },
    { label: '공개 프로그램', value: supply.programCount, unit: '개' },
    {
      label: '수업이 있는 분야',
      value: supply.coveredFields.length,
      unit: ` / ${FIELDS.length}개 분야`,
    },
  ]

  const faq: FaqItem[] = [
    {
      q: '수강료는 어떻게 되나요?',
      a: '기관·학교가 여는 후속 과정은 기관 사업비로 운영되어 학생·보호자에게 청구되지 않습니다. 보호자 문의로 이어진 개인·소그룹 수업은 강사와 직접 정하시고, 플랫폼은 결제를 중개하지 않습니다.',
    },
    {
      q: '학생이 강사에게 직접 신청할 수 있나요?',
      a: '아니요. 학생의 관심 표현은 기관 선생님의 대시보드로 모이고, 개인 수업 문의는 성인 보호자만 남길 수 있습니다. 학생이 궁금한 점은 기관 선생님도 함께 보는 공개 Q&A에 남기면 지역 강사가 답변합니다.',
    },
    {
      q: '강사는 어떻게 확인하나요?',
      a: '자격 증빙과 성범죄경력 조회 증빙을 운영자가 직접 확인합니다. 심사를 통과하기 전에는 추천·디렉토리·Q&A 어디에도 나타나지 않습니다.',
    },
    {
      q: '우리 동네에 원하는 수업이 없으면요?',
      a: `${pilot}에 없으면 ${ring1.slice(0, 3).join('·')} 같은 바로 옆 지역까지, 그래도 없으면 한 단계 더 넓혀 찾습니다. 끝내 없으면 그 관심을 미충족 수요로 기록해 새 강사를 모으는 근거로 씁니다.`,
    },
    {
      q: '문의를 남기면 언제 연락이 오나요?',
      a: '운영자가 문의 내용을 확인하고 지역·분야가 맞는 심사 완료 강사에게 전달합니다. 영업일 2일 안에 담당 강사가 알려주신 연락처로 연락드립니다.',
    },
    {
      q: '기관·학교·강사는 어떻게 시작하나요?',
      a: '공개 가입 화면은 없습니다. 운영자가 보낸 초대 링크로 계정을 만들고, 이후에는 이메일로 받은 링크로 로그인합니다. 비밀번호를 저장하지 않습니다.',
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
            'grid items-center gap-14 py-14 sm:py-20 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-10 lg:py-24',
          )}
        >
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-point-line bg-point-bg px-3 py-1 text-xs font-semibold text-point">
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-point" />
              파일럿 운영 중 · 경기도 {pilot}
            </p>

            <h1 className="mt-6 text-[2rem] leading-[1.25] font-bold tracking-tight text-ink sm:text-5xl sm:leading-[1.18] lg:text-[2.75rem]">
              특강 한 번으로
              <br className="hidden sm:inline" /> 끝나던 관심을
              <br /> <span className="text-point">우리 지역 강사</span>와 잇습니다
            </h1>

            <p className="mt-6 max-w-xl text-base leading-relaxed text-body sm:text-lg sm:leading-relaxed">
              진로체험·직업인 특강이 끝나면 학생의 관심은 그날로 사라집니다. 더 배우고 싶다는 신호를
              모아 기관·학교의 후속 과정으로, 보호자의 개별 문의로 이어 드립니다.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/programs" className={CTA_PRIMARY}>
                우리 지역 프로그램 보기
                <IconArrowRight />
              </Link>
              <Link href="/inquiry" className={CTA_SECONDARY}>
                보호자님, 문의 남기기
              </Link>
            </div>

            <ul className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-sm text-body">
              {['학생 개인정보 저장 안 함', '심사 통과 강사만 노출', '1:1 비공개 메시지 없음'].map(
                (t) => (
                  <li key={t} className="flex items-center gap-1.5">
                    <IconCheck width={16} height={16} className="shrink-0 text-point" />
                    {t}
                  </li>
                ),
              )}
            </ul>
          </div>

          <HeroPreview pilot={pilot} />
        </div>
      </section>

      {/* ── 공급 현황 — 파일럿 규모를 숨기지 않는다 ─────────────── */}
      <section aria-labelledby="supply-title" className="border-b border-line">
        <div className={cn(WRAP, 'py-10')}>
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
            <h2 id="supply-title" className="text-sm font-semibold text-ink">
              지금 등록된 공급
            </h2>
            <p className="text-sm text-body">
              파일럿 단계라 숫자가 작습니다. 부풀리지 않고 그대로 보여 드립니다.
            </p>
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line lg:grid-cols-4">
            {stats.map((s) => (
              <div key={s.label} className="bg-card px-5 py-5">
                <dt className="text-sm text-sub">{s.label}</dt>
                <dd className="mt-1 text-3xl font-semibold tracking-tight text-ink tabular-nums">
                  {s.value}
                  <span className="ml-0.5 text-base font-medium text-body">{s.unit}</span>
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ── 분야 ─────────────────────────────────────────────── */}
      <section aria-labelledby="fields-title" className={cn(WRAP, 'py-20')}>
        <SectionIntro id="fields-title" eyebrow="분야" title="신산업 5개 분야, 직접 만져 보는 수업">
          드론을 날려 보고 3D 프린터에서 출력물을 꺼내 보는 경험은 화면으로 옮겨지지 않습니다. 그래서
          강사가 직접 찾아가는 지역 기반 오프라인 수업만 연결합니다.
        </SectionIntro>

        <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {FIELDS.map((f) => {
            const instructorCount = instructorsByField[f] ?? 0
            const programCount = programs.filter((p) => p.field === f).length

            return (
              <li key={f} className="h-full">
                {instructorCount > 0 ? (
                  <Link
                    href={`/programs?field=${encodeURIComponent(f)}`}
                    className="group flex h-full flex-col rounded-lg border border-line bg-card p-5 transition-colors hover:border-point"
                  >
                    <FieldIcon field={f} width={36} height={36} className="text-point" />
                    <h3 className="mt-5 text-base font-semibold text-ink">{f}</h3>
                    <p className="mt-2 flex-1 text-sm leading-relaxed text-body">{FIELD_COPY[f]}</p>
                    <p className="mt-5 flex items-center justify-between gap-2 border-t border-line pt-3 text-xs font-medium text-point tabular-nums">
                      프로그램 {programCount}개 · 강사 {instructorCount}명
                      <IconArrowRight width={14} height={14} className="shrink-0" />
                    </p>
                  </Link>
                ) : (
                  <div className="flex h-full flex-col rounded-lg border border-dashed border-line-strong bg-card p-5">
                    <FieldIcon field={f} width={36} height={36} className="text-faint" />
                    <h3 className="mt-5 text-base font-semibold text-ink">{f}</h3>
                    <p className="mt-2 flex-1 text-sm leading-relaxed text-body">{FIELD_COPY[f]}</p>
                    <div className="mt-5 border-t border-line pt-3">
                      <p className="text-xs font-semibold text-caution">강사 모집 중</p>
                      <p className="mt-1 text-xs leading-relaxed text-sub">
                        고른 학생의 관심은 미충족 수요로 기록합니다
                      </p>
                    </div>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      </section>

      {/* ── 이용 방법 ────────────────────────────────────────── */}
      <section
        id="how"
        aria-labelledby="how-title"
        className="scroll-mt-16 border-y border-line bg-card"
      >
        <div className={cn(WRAP, 'py-20')}>
          <SectionIntro id="how-title" eyebrow="이용 방법" title="연결은 이렇게 일어납니다">
            학생이 강사에게 직접 신청하는 경로는 없습니다. 기관이 한 번 확인하고, 보호자 동의를 기록한
            뒤에만 연결이 진행됩니다.
          </SectionIntro>

          <ol className="mt-12 grid gap-10 lg:grid-cols-3 lg:gap-8">
            {STEPS.map((s, i) => (
              <li key={s.title}>
                <div className="flex items-center gap-4">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 border-point text-sm font-bold text-point tabular-nums">
                    {i + 1}
                  </span>
                  {i < STEPS.length - 1 ? (
                    <span aria-hidden="true" className="hidden h-px flex-1 bg-point-line lg:block" />
                  ) : null}
                </div>
                <p className="mt-5 flex items-center gap-2 text-sm font-medium text-sub">
                  <s.Icon width={18} height={18} className="text-point" />
                  {s.when}
                </p>
                <h3 className="mt-2 text-lg font-semibold text-ink">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-body">{s.body}</p>
              </li>
            ))}
          </ol>

          <div className="mt-14 flex flex-col gap-4 rounded-lg border border-line bg-page p-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-ink">개인 경로 · 보호자</p>
              <p className="mt-1 text-sm leading-relaxed text-body">
                공개 디렉토리에서 프로그램을 보고 문의를 남기면, 운영자가 확인해 지역·분야가 맞는
                강사에게 전달합니다.
              </p>
            </div>
            <Link
              href="/inquiry"
              className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg border border-line-strong bg-card px-4 text-sm font-medium text-ink transition-colors hover:bg-muted"
            >
              보호자님, 문의 남기기
            </Link>
          </div>
        </div>
      </section>

      {/* ── 대상별 안내 ──────────────────────────────────────── */}
      <section id="who" aria-labelledby="who-title" className={cn(WRAP, 'scroll-mt-16 py-20')}>
        <SectionIntro
          id="who-title"
          eyebrow="대상별 안내"
          title="학교·기관, 강사, 보호자 — 각자의 화면이 있습니다"
        />

        <div className="mt-14 space-y-20 lg:space-y-28">
          <FeatureRow
            badge="학교 · 청소년기관"
            title="인맥 밖의 강사를 찾고, 근거를 남깁니다"
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
            reverse
            badge="강사 · 직업인"
            title="다음 일감이 어디에 있는지 보입니다"
            body="배정된 회차의 QR을 교실에 띄우고, 수업이 끝나면 내 수업을 좋아한 학생 집단을 숫자로 확인합니다. 회차는 기관이 만들고, 강사는 배정받아 수업에 집중합니다."
            points={[
              '배정 회차의 교실 투사용 QR과 회차 리포트',
              '학급 조건에 맞춘 교안 초안 — AI 수업 설계 도우미',
              '우리 지역 수요 집계 (집계치만)',
              '기관 섭외 요청과 전달받은 보호자 문의',
            ]}
            link={{ href: '/login', label: '강사 로그인' }}
            visual={<ProjectionMock />}
          />

          <FeatureRow
            badge="보호자"
            title="아이가 계속 배울 곳을, 우리 동네부터 찾습니다"
            body={`로그인 없이 지역 프로그램을 볼 수 있습니다. ${pilot}에 원하는 수업이 없으면 바로 옆 지역까지, 그래도 없으면 한 단계 더 넓혀 찾습니다.`}
            points={[
              '계정을 만들지 않고 문의 한 건만 남깁니다',
              '운영자가 확인해 심사 완료 강사에게 전달',
              '영업일 2일 안에 강사가 직접 연락',
              '아이 정보는 학년대(초·중·고)까지만 받습니다',
            ]}
            link={{ href: '/programs', label: '우리 지역 프로그램 보기' }}
            visual={<RegionRings center={pilot} ring1={ring1} ring2={ring2} />}
          />
        </div>
      </section>

      {/* ── 안전 설계 ────────────────────────────────────────── */}
      <section
        id="safety"
        aria-labelledby="safety-title"
        className="scroll-mt-16 border-y border-line bg-card"
      >
        <div
          className={cn(
            WRAP,
            'grid gap-12 py-20 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-16',
          )}
        >
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold text-point">
              <IconShield width={18} height={18} />
              안전 설계
            </p>
            <h2
              id="safety-title"
              className="mt-2 text-2xl leading-snug font-bold tracking-tight text-ink sm:text-3xl sm:leading-snug"
            >
              미성년자를 대상으로 하므로 기능부터 제약합니다
            </h2>
            <p className="mt-3 text-base leading-relaxed text-body">
              설정으로 끄는 방식이 아니라, 애초에 만들지 않는 방식입니다. 권한은 화면이 아니라
              데이터베이스 단계에서 막습니다.
            </p>
          </div>

          <dl className="grid gap-px self-start overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-2">
            {SAFETY.map((item) => (
              <div key={item.t} className="bg-card p-6">
                <dt className="flex items-start gap-2.5 text-base leading-snug font-semibold text-ink">
                  <item.Icon width={20} height={20} className="mt-0.5 shrink-0 text-point" />
                  {item.t}
                </dt>
                <dd className="mt-2 text-sm leading-relaxed text-body sm:pl-[1.875rem]">{item.d}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ── 자주 묻는 질문 ───────────────────────────────────── */}
      <section
        id="faq"
        aria-labelledby="faq-title"
        className={cn(
          WRAP,
          'grid scroll-mt-16 gap-10 py-20 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-16',
        )}
      >
        <div>
          <SectionIntro id="faq-title" eyebrow="FAQ" title="자주 묻는 질문">
            더 궁금한 점은 공개 Q&amp;A에 남겨 주세요. 지역 강사가 답변합니다.
          </SectionIntro>
          <Link
            href="/qna"
            className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-point hover:text-point-hover"
          >
            공개 Q&amp;A 둘러보기
            <IconArrowRight width={16} height={16} />
          </Link>
        </div>
        <Faq items={faq} />
      </section>

      {/* ── 마무리 CTA ───────────────────────────────────────── */}
      <section className={WRAP}>
        <div className="rounded-xl bg-point px-6 py-12 sm:px-12 sm:py-14">
          <div className="flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-xl">
              <h2 className="text-2xl leading-snug font-bold tracking-tight text-white sm:text-3xl sm:leading-snug">
                우리 지역에 어떤 수업이 있는지부터 보세요
              </h2>
              <p className="mt-3 text-base leading-relaxed text-point-soft">
                로그인 없이 볼 수 있습니다. 수업 문의는 보호자님이 남겨 주세요.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/programs"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-card px-5 text-base font-semibold text-point transition-colors hover:bg-point-bg focus-visible:outline-white"
              >
                프로그램 찾기
                <IconArrowRight />
              </Link>
              <Link
                href="/inquiry"
                className="inline-flex min-h-12 items-center justify-center rounded-lg border border-point-soft/60 px-5 text-base font-medium text-white transition-colors hover:bg-point-hover focus-visible:outline-white"
              >
                보호자님, 문의 남기기
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

function SectionIntro({
  id,
  eyebrow,
  title,
  children,
}: {
  id: string
  eyebrow: string
  title: string
  children?: ReactNode
}) {
  return (
    <div className="max-w-2xl">
      <p className="text-sm font-semibold text-point">{eyebrow}</p>
      <h2
        id={id}
        className="mt-2 text-2xl leading-snug font-bold tracking-tight text-ink sm:text-3xl sm:leading-snug"
      >
        {title}
      </h2>
      {children ? <p className="mt-3 text-base leading-relaxed text-body">{children}</p> : null}
    </div>
  )
}

function FeatureRow({
  badge,
  title,
  body,
  points,
  link,
  visual,
  reverse = false,
}: {
  badge: string
  title: string
  body: string
  points: string[]
  link: { href: string; label: string }
  visual: ReactNode
  reverse?: boolean
}) {
  return (
    <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
      <div className={cn(reverse && 'lg:order-2')}>
        <Badge tone="point">{badge}</Badge>
        <h3 className="mt-4 text-2xl leading-snug font-bold tracking-tight text-ink">{title}</h3>
        <p className="mt-3 text-base leading-relaxed text-body">{body}</p>
        <ul className="mt-6 space-y-3 text-sm leading-relaxed text-body">
          {points.map((t) => (
            <li key={t} className="flex gap-2.5">
              <IconCheck className="mt-0.5 shrink-0 text-point" />
              <span>{t}</span>
            </li>
          ))}
        </ul>
        <Link
          href={link.href}
          className="mt-7 inline-flex items-center gap-1.5 text-sm font-semibold text-point hover:text-point-hover"
        >
          {link.label}
          <IconArrowRight width={16} height={16} />
        </Link>
      </div>
      <div className={cn('min-w-0', reverse && 'lg:order-1')}>{visual}</div>
    </div>
  )
}
