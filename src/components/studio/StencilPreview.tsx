import { renderPenSvg } from '@/lib/studio/pen3d/render'
import { isUsable, type PenArtifact, type StudioStatus } from '@/types/studio'

/**
 * 도안 미리보기.
 *
 * SVG 를 **`<img>` 의 data URI 로** 넣는다. `dangerouslySetInnerHTML` 로 문서에 삽입하지
 * 않는 이유는, 제목 같은 문자열이 LLM 을 거쳐 들어오기 때문이다 — 렌더러가 이스케이프하지만
 * `<img>` 안에서는 스크립트가 아예 실행되지 않으므로 방어선을 하나 더 둔다.
 *
 * 검증을 통과하지 않은 산출물도 **보여준다.** 대신 렌더러가 워터마크를 찍는다 (ADR-030).
 * 파일로 내려받는 경로는 `/api/studio/[id]/svg` 가 막는다.
 */
export function StencilPreview({
  artifact,
  status,
}: {
  artifact: PenArtifact
  status: StudioStatus
}) {
  const svg = renderPenSvg(artifact, { status })
  const src = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`

  return (
    <figure className="space-y-2">
      <div className="mx-auto max-w-md border border-line bg-white p-2">
        {/* eslint-disable-next-line @next/next/no-img-element -- data URI 라 최적화 대상이 아니고, next/image 는 data URI 를 통과시키지 않는다 */}
        <img
          src={src}
          alt={`${artifact.pattern.title} 도안 — 부품 ${artifact.metrics.part_count}개`}
          width={210}
          height={297}
          className="h-auto w-full"
        />
      </div>
      <figcaption className="text-xs leading-relaxed text-sub">
        A4 1:1 도안입니다. 인쇄한 뒤 종이 아래쪽 <strong className="text-body">50mm 기준선을 자로
        재서</strong> 축척이 맞는지 확인하세요 — 프린터의 &ldquo;용지에 맞추기&rdquo; 설정이 켜져
        있으면 치수가 전부 달라집니다.
        {isUsable(status) ? null : ' 이 도안은 검증을 통과하지 않아 워터마크가 찍혀 있습니다.'}
      </figcaption>
    </figure>
  )
}
