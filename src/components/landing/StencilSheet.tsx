import { renderPenSvg } from '@/lib/studio/pen3d/render'
import type { PenArtifact } from '@/types/studio'

/**
 * 랜딩 첫 화면의 주인공 — **실제로 생성된 도안 한 장.**
 *
 * 모형이 아니다. 강사 화면이 쓰는 것과 **같은 생성기(`generatePen`)와 같은 렌더러**가 만든
 * 종이를 그대로 보여준다. 부품 번호·치수·접합 범례·조립 순서·50mm 기준선까지 전부
 * 강사가 인쇄하는 것과 같은 SVG 다. 여기서 모양을 따로 그리면 코드가 바뀐 날부터
 * 랜딩이 거짓말을 하게 된다.
 *
 * `<img>` 의 data URI 로 넣는 것도 제품 화면(`StencilPreview`)과 같은 이유다 —
 * 문서에 SVG 를 직접 삽입하지 않는다.
 */
export function StencilSheet({ artifact }: { artifact: PenArtifact }) {
  const svg = renderPenSvg(artifact, { status: 'validated' })
  const src = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`

  return (
    /* eslint-disable-next-line @next/next/no-img-element -- data URI 라 최적화 대상이 아니고, next/image 는 data URI 를 통과시키지 않는다 */
    <img
      src={src}
      alt={`${artifact.pattern.title} 도안 — 부품 ${artifact.metrics.part_count}개, 예상 제작 ${Math.round(artifact.metrics.estimated_minutes)}분`}
      width={210}
      height={297}
      className="block h-auto w-full bg-white"
    />
  )
}
