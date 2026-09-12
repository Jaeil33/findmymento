import Link from 'next/link'
import { buttonClass } from '@/components/ui/Button'
import { IconCheck } from '@/components/ui/Icons'

export const metadata = { title: '문의 접수 완료' }

/**
 * 접수 완료 화면.
 *
 * "접수됐어요"로 끝내지 않는다. **언제 연락이 오는지**를 본문 크기로 쓴다 —
 * 운영자가 수동 배정하므로 즉시 연락이 아니다. 이 한 줄이 없으면 씹혔다고 느끼고 다시 문의한다.
 */
export default function InquiryDonePage() {
  return (
    <div className="mx-auto max-w-xl px-4 py-16 sm:px-6">
      <div className="flex items-center gap-2 text-point">
        <IconCheck width={20} height={20} />
        <p className="text-sm font-medium">접수 완료</p>
      </div>

      <h1 className="mt-3 text-2xl font-semibold tracking-tight text-ink">
        문의가 접수됐습니다
      </h1>

      <p className="mt-5 text-base leading-relaxed text-body">
        <strong className="font-semibold text-ink">영업일 2일 안에</strong> 담당 강사가 알려주신
        연락처로 연락드립니다. 운영자가 문의 내용을 먼저 확인하고 지역·분야가 맞는 강사를 배정하기
        때문에 바로 연락이 가지는 않습니다.
      </p>

      <dl className="mt-8 divide-y divide-line overflow-hidden rounded-lg border border-line bg-card text-sm">
        {[
          ['1. 운영자 확인', '문의 내용과 지역·분야를 확인합니다. (보통 당일)'],
          ['2. 강사 배정', '지역과 분야가 맞는 심사 완료 강사에게 전달합니다.'],
          ['3. 강사 연락', '강사가 알려주신 연락처로 직접 연락드립니다.'],
        ].map(([t, d]) => (
          <div key={t} className="px-5 py-4">
            <dt className="font-medium text-ink">{t}</dt>
            <dd className="mt-1 leading-relaxed text-body">{d}</dd>
          </div>
        ))}
      </dl>

      <p className="mt-6 text-sm leading-relaxed text-sub">
        수강료와 일정은 강사와 직접 정하시게 됩니다. 플랫폼은 결제를 중개하지 않습니다.
      </p>

      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/programs" className={buttonClass({ variant: 'secondary' })}>
          다른 프로그램 보기
        </Link>
        <Link href="/qna" className={buttonClass({ variant: 'text' })}>
          공개 Q&amp;A 둘러보기
        </Link>
      </div>
    </div>
  )
}
