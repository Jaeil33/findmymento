import QRCode from 'qrcode'
import { cn } from '@/lib/cn'

/**
 * 회차 입장 QR.
 *
 * QR 이 가리키는 도메인은 **환경변수로 주입한다.** 하드코딩하면 배포 도메인이 바뀌는 순간
 * 교실에서 찍힌 QR 전부가 죽는다 (step 15).
 *
 * `projection` 은 교실 프로젝터용이다 — 교실 **뒤에서 보인다**는 기준으로 QR 최소 320px,
 * 입장 코드는 `text-5xl tabular-nums`, 다른 요소를 같이 띄우지 않는다 (UI_GUIDE 안전규칙 9).
 */
export async function QrPanel({
  entryCode,
  siteUrl,
  size = 'inline',
}: {
  entryCode: string
  siteUrl: string
  size?: 'inline' | 'projection'
}) {
  const target = `${siteUrl}/s/${entryCode}`
  // 투사용은 교실 뒤에서 보이는 크기(≥320px)를 지키되, 1080p 프로젝터 한 화면에 제목·코드까지
  // 같이 들어가야 하므로 무한정 키우지 않는다.
  const px = size === 'projection' ? 384 : 176

  const svg = await QRCode.toString(target, {
    type: 'svg',
    margin: 1,
    width: px,
    errorCorrectionLevel: 'M',
    color: { dark: '#171717', light: '#ffffff' },
  })

  return (
    <div className={cn('flex flex-col items-center', size === 'projection' ? 'gap-6' : 'gap-4')}>
      <div
        className={cn(
          'bg-white',
          size === 'projection'
            ? 'rounded-xl border border-line p-5'
            : 'rounded-md border border-line p-3',
        )}
        style={{ width: px + (size === 'projection' ? 40 : 24) }}
        // QRCode.toString 이 만든 SVG 문자열을 그대로 넣는다. 사용자 입력이 섞이지 않는다.
        dangerouslySetInnerHTML={{ __html: svg }}
      />

      <div className="text-center">
        <p
          className={cn(
            'text-sub',
            size === 'projection' ? 'text-xl' : 'text-xs',
          )}
        >
          참여 코드
        </p>
        <p
          className={cn(
            'font-semibold text-ink tabular-nums',
            size === 'projection'
              ? 'mt-1 text-6xl tracking-[0.1em] sm:text-7xl'
              : 'mt-0.5 text-2xl tracking-wider',
          )}
        >
          {entryCode}
        </p>
        {size === 'inline' ? (
          <p className="mt-2 text-xs break-all text-faint">{target}</p>
        ) : null}
      </div>
    </div>
  )
}
