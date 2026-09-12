import Link from 'next/link'
import { buttonClass } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { loadDataset } from '@/lib/db/dataset'
import { supplySummary } from '@/lib/db/queries'
import { PILOT_REGION_CODE, regionName, neighbors } from '@/lib/region'
import { IconArrowRight, IconCheck, IconShield } from '@/components/ui/Icons'

export const metadata = {
  title: 'Find My Mento · 우리 지역 직업인 강사 찾기',
}

/** 랜딩 1장. 마케팅 랜딩의 장식을 쓰지 않고, 사실과 제약을 그대로 적는다. */
export default async function LandingPage() {
  const ds = await loadDataset()
  const supply = supplySummary(ds)
  const pilot = regionName(PILOT_REGION_CODE)
  const around = neighbors(PILOT_REGION_CODE).map(regionName)

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6">
      {/* ── 한 줄 정의 ─────────────────────────────────────── */}
      <section className="border-b border-line py-14 sm:py-20">
        <p className="text-xs font-medium tracking-wide text-point uppercase">
          파일럿 · 경기도 {pilot}
        </p>
        <h1 className="mt-3 max-w-3xl text-3xl leading-tight font-semibold tracking-tight text-ink sm:text-4xl sm:leading-[1.2]">
          특강 한 번으로 끝나던 관심을
          <br />
          우리 지역 강사와 잇습니다.
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-relaxed text-body">
          진로체험·직업인 특강이 끝나면 학생의 관심은 그날로 사라집니다. 더 배우고 싶다는 신호를
          모아 기관·학교의 후속 과정으로, 그리고 보호자의 개별 문의로 잇는 일을 합니다.
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Link href="/programs" className={buttonClass({ variant: 'primary' })}>
            우리 지역 프로그램 보기
            <IconArrowRight />
          </Link>
          <Link href="/inquiry" className={buttonClass({ variant: 'secondary' })}>
            보호자님, 문의 남기기
          </Link>
        </div>

        {/* 공급 규모를 숨기지 않는다. 파일럿 시점에는 한 업체로 쏠린다는 사실을 먼저 밝힌다. */}
        <div className="mt-8 inline-flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-line bg-card px-4 py-3 text-sm">
          <span className="font-medium text-ink tabular-nums">{supply.sentence}</span>
          <span className="text-line-strong" aria-hidden="true">
            |
          </span>
          <span className="text-sub">
            지금 수업이 있는 분야는 {supply.coveredFields.join(' · ')} 입니다
          </span>
        </div>
        {supply.uncoveredFields.length > 0 ? (
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-sub">
            {supply.uncoveredFields.join(' · ')}에는 아직 강사가 없습니다. 그래도 선택지에서 빼지
            않습니다 — 어느 지역에 어떤 수요가 있었는지가 새 강사를 모으는 근거가 되기 때문입니다.
          </p>
        ) : null}
      </section>

      {/* ── 연결 방식 ─────────────────────────────────────── */}
      <section className="py-14">
        <h2 className="text-xl font-semibold tracking-tight text-ink">연결은 이렇게 일어납니다</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-sub">
          학생이 강사에게 직접 신청하는 경로는 없습니다. 기관이 한 번 확인하고, 보호자 동의를 기록한
          뒤에만 연결이 진행됩니다.
        </p>

        <ol className="mt-8 grid gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-3">
          {[
            {
              n: '01',
              title: '특강 마지막 3분',
              body: '강사가 QR을 띄웁니다. 학생은 가입 없이 3분 동안 답하고, 바로 자기한테 맞는 다음 교육을 봅니다.',
            },
            {
              n: '02',
              title: '수요가 모입니다',
              body: '더 배우고 싶다는 응답이 기관 대시보드에 분야·학년대별로 쌓입니다. 만족도와는 따로 집계합니다.',
            },
            {
              n: '03',
              title: '기관이 과정을 엽니다',
              body: '기관이 수요를 확인하고 보호자 동의를 기록한 뒤 지역 강사에게 섭외 요청을 보냅니다.',
            },
          ].map((step) => (
            <li key={step.n} className="bg-card p-6">
              <span className="text-xs font-semibold tracking-widest text-point tabular-nums">
                {step.n}
              </span>
              <h3 className="mt-3 text-base font-semibold text-ink">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-body">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* ── 대상별 가치 ───────────────────────────────────── */}
      <section className="border-t border-line py-14">
        <h2 className="text-xl font-semibold tracking-tight text-ink">누가 쓰나요</h2>

        <div className="mt-8 grid gap-5 md:grid-cols-3">
          <article className="rounded-lg border border-line bg-card p-6">
            <Badge tone="point">학교 · 청소년기관</Badge>
            <h3 className="mt-3 text-base font-semibold text-ink">
              인맥 밖의 강사를 찾고, 근거를 남깁니다
            </h3>
            <ul className="mt-4 space-y-2.5 text-sm leading-relaxed text-body">
              {[
                '회차별 만족도와 후속 의향을 따로 집계',
                '분야 × 학년대 수요 클러스터와 학생이 직접 쓴 문장',
                '예산 기안·사업 보고에 쓸 수 있는 숫자',
                '섭외 요청 발송과 상태 추적',
              ].map((t) => (
                <li key={t} className="flex gap-2">
                  <IconCheck className="mt-0.5 shrink-0 text-point" />
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </article>

          <article className="rounded-md border border-line bg-card p-6">
            <Badge tone="point">강사 · 직업인</Badge>
            <h3 className="mt-3 text-base font-semibold text-ink">
              다음 일감이 어디에 있는지 보입니다
            </h3>
            <ul className="mt-4 space-y-2.5 text-sm leading-relaxed text-body">
              {[
                '내 수업을 좋아한 학생 집단이 실제로 있다는 증거',
                '배정된 회차의 교실 투사용 QR과 회차 리포트',
                '우리 지역 수요 집계 (집계치만)',
                '기관 섭외 요청과 전달받은 보호자 문의',
              ].map((t) => (
                <li key={t} className="flex gap-2">
                  <IconCheck className="mt-0.5 shrink-0 text-point" />
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </article>

          <article className="rounded-xl border border-line bg-card p-6">
            <Badge tone="point">보호자</Badge>
            <h3 className="mt-3 text-base font-semibold text-ink">
              아이가 계속 배울 곳을 찾습니다
            </h3>
            <ul className="mt-4 space-y-2.5 text-sm leading-relaxed text-body">
              {[
                '로그인 없이 지역 프로그램 열람',
                `${pilot}에 없으면 ${around.slice(0, 2).join('·')} 까지 자동으로 넓혀 찾기`,
                '문의 한 건 — 운영자가 확인해 강사에게 전달',
                '계정을 만들지 않고, 아이 정보는 학년대까지만 받습니다',
              ].map((t) => (
                <li key={t} className="flex gap-2">
                  <IconCheck className="mt-0.5 shrink-0 text-point" />
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </article>
        </div>
      </section>

      {/* ── 안전 설계 ─────────────────────────────────────── */}
      <section className="border-t border-line py-14">
        <div className="rounded-lg border border-line bg-card">
          <div className="flex items-start gap-3 border-b border-line px-6 py-5">
            <IconShield className="mt-0.5 shrink-0 text-point" width={20} height={20} />
            <div>
              <h2 className="text-base font-semibold text-ink">
                미성년자를 대상으로 하므로 기능부터 제약합니다
              </h2>
              <p className="mt-1 text-sm leading-relaxed text-sub">
                설정으로 끄는 방식이 아니라, 애초에 만들지 않는 방식입니다.
              </p>
            </div>
          </div>
          <dl className="grid gap-px bg-line sm:grid-cols-2">
            {[
              {
                t: '학생 개인정보를 저장하지 않습니다',
                d: '실명·연락처·학교를 받는 입력란이 없습니다. 학생 식별은 기관이 발급한 가명코드뿐이고, 코드와 실명을 잇는 표는 기관만 가지고 있습니다.',
              },
              {
                t: '1:1 비공개 메시지 기능이 없습니다',
                d: '학생과 강사의 소통은 기관 담당자가 함께 볼 수 있는 공개 Q&A 스레드뿐입니다. 실시간 채팅·알림도 만들지 않습니다.',
              },
              {
                t: '강사 연락처를 어디에도 싣지 않습니다',
                d: '공개 디렉토리에도 전화번호·SNS·주소가 없습니다. 연락처는 별도 테이블에 있고 비로그인 조회 권한이 없습니다.',
              },
              {
                t: '심사를 통과한 강사만 노출됩니다',
                d: '자격 증빙과 성범죄경력 조회 증빙을 운영자가 직접 확인합니다. 심사 전 강사는 추천·디렉토리·Q&A 어디에도 나타나지 않습니다.',
              },
            ].map((item) => (
              <div key={item.t} className="bg-card px-6 py-5">
                <dt className="text-sm font-semibold text-ink">{item.t}</dt>
                <dd className="mt-1.5 text-sm leading-relaxed text-body">{item.d}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ── 진입구 ───────────────────────────────────────── */}
      <section className="border-t border-line py-14">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <h2 className="text-xl font-semibold tracking-tight text-ink">
              담당자·강사로 들어오셨나요
            </h2>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-sub">
              계정은 초대로만 만들어집니다. 초대 메일의 링크로 계정을 만든 뒤에는 이메일 링크
              로그인만 쓰고, 비밀번호를 저장하지 않습니다.
            </p>
          </div>
          <Link href="/login" className={buttonClass({ variant: 'secondary' })}>
            로그인 화면으로
            <IconArrowRight />
          </Link>
        </div>
      </section>
    </div>
  )
}
