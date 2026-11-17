import { notFound, redirect } from 'next/navigation'
import { PrintButton } from '@/components/session/PrintButton'
import { getActor } from '@/lib/auth/actor'
import { loadDataset } from '@/lib/db/dataset'
import { studioContentById } from '@/lib/studio/library'
import { renderPenSvg } from '@/lib/studio/pen3d/render'
import { isUsable } from '@/types/studio'

export const metadata = { title: '도안 인쇄' }

/**
 * 인쇄용 도안 한 장. **네비게이션이 없는 전용 화면이다** — 머리글·꼬리글이 끼면 축척이 바뀐다.
 *
 * `@page { size: A4; margin: 0 }` 과 `width: 210mm` 로 1:1 을 보장하고, 브라우저 인쇄
 * 대화상자의 "배율: 100%" 와 "머리글/바닥글 끄기"를 화면에서 안내한다. 서버에서 PDF 를
 * 만들지 않는다 — 없는 기능을 있다고 적지 않기 위해서다 (docs/STUDIO.md).
 *
 * 검증을 통과하지 않은 산출물은 여기서도 열리지 않는다 (ADR-030).
 */
export default async function StencilPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor()
  if (!actor) redirect('/login')

  const { id } = await params
  const ds = await loadDataset()
  const content = studioContentById(ds.studioContents, id)
  if (!content) notFound()

  const session = content.session_id
    ? ds.lectureSessions.find((s) => s.id === content.session_id)
    : null
  const allowed =
    (actor.role === 'instructor' && content.instructor_id === actor.instructorId) ||
    (actor.role === 'org_member' && session?.org_id === actor.orgId) ||
    actor.role === 'admin'
  if (!allowed) notFound()

  const artifact = content.artifact
  if (artifact.kind !== 'pen3d' || !isUsable(content.status)) notFound()

  const svg = renderPenSvg(artifact, { status: content.status })

  return (
    <div className="min-h-screen bg-page">
      <div className="mx-auto max-w-[210mm] px-4 py-6 print:hidden">
        <h1 className="text-lg font-semibold text-ink">{content.title}</h1>
        <p className="mt-1 text-sm leading-relaxed text-body">
          인쇄 대화상자에서 <strong>배율 100%</strong>(용지에 맞추기 끄기)와{' '}
          <strong>머리글·바닥글 끄기</strong>를 확인하세요. 인쇄한 뒤 종이 아래쪽 50mm 기준선을
          자로 재면 축척이 맞는지 알 수 있습니다.
        </p>
        <div className="mt-4">
          <PrintButton />
        </div>
      </div>

      <div
        className="mx-auto bg-white"
        style={{ width: '210mm', height: '297mm' }}
        // 서버에서 우리 렌더러가 만든 SVG 다. 제목 등 모든 문자열은 renderPenSvg 가
        // 이스케이프하고(tests/studio-pen3d-render.test.ts), 인쇄 축척을 지키려면
        // img 가 아니라 문서에 직접 들어가야 한다.
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    </div>
  )
}
