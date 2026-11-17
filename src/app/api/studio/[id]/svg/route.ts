import { getActor } from '@/lib/auth/actor'
import { loadDataset } from '@/lib/db/dataset'
import { studioContentById } from '@/lib/studio/library'
import { renderPenSvg } from '@/lib/studio/pen3d/render'
import { isUsable } from '@/types/studio'

/**
 * 도안 내려받기 (A4 1:1 SVG).
 *
 * **검증을 통과하지 않은 산출물은 내려받을 수 없다** (ADR-030). 미리보기 화면은 같은 렌더러로
 * 워터마크가 찍힌 도안을 보여주지만, 파일로 나가는 경로는 여기서 막는다 — 파일은 교실까지
 * 따라가고, 그 파일에 워터마크가 있는지 없는지는 그때 확인되지 않는다.
 *
 * 열람 경계는 `studio_contents` RLS 와 같다 — 작성 강사 · 발주 기관 구성원 · 운영자.
 */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const actor = await getActor()
  if (!actor) return new Response('권한이 없습니다.', { status: 403 })

  const { id } = await context.params
  const ds = await loadDataset()
  const content = studioContentById(ds.studioContents, id)
  if (!content) return new Response('찾을 수 없습니다.', { status: 404 })

  const session = content.session_id
    ? ds.lectureSessions.find((s) => s.id === content.session_id)
    : null

  const allowed =
    (actor.role === 'instructor' && content.instructor_id === actor.instructorId) ||
    (actor.role === 'org_member' && session?.org_id === actor.orgId) ||
    actor.role === 'admin'

  // 권한이 없으면 존재 여부를 알려주지 않는다.
  if (!allowed) return new Response('찾을 수 없습니다.', { status: 404 })

  if (!isUsable(content.status)) {
    return new Response('검증을 통과하지 않은 도안은 내려받을 수 없습니다.', { status: 403 })
  }

  // 산출물 자체의 종류로 가른다. 행의 kind 가 아니라 artifact 의 kind 가 렌더 가능 여부를 정한다.
  const artifact = content.artifact
  if (artifact.kind !== 'pen3d') {
    return new Response('이 콘텐츠는 SVG 로 내려받을 수 없습니다.', { status: 400 })
  }

  const svg = renderPenSvg(artifact, { status: content.status })
  const filename = `stencil-${content.recipe_id}-v${content.version}.svg`

  return new Response(svg, {
    headers: {
      'content-type': 'image/svg+xml; charset=utf-8',
      'content-disposition': `attachment; filename="${filename}"`,
      // 산출물은 강사 소유다. 중간 캐시에 남기지 않는다 (ADR-031).
      'cache-control': 'private, no-store',
    },
  })
}
