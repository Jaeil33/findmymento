import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { GenerateForm, type SessionOption } from '@/components/studio/GenerateForm'
import { PageHeader, Panel } from '@/components/ui/Section'
import { demoAiEnabled } from '@/lib/ai/demo-writer'
import { studioLlmAvailable, studioTourLlmAvailable } from '@/lib/ai/studio-llm'
import { atlasCount } from '@/lib/studio/atlas'
import { packCount } from '@/lib/studio/pack'
import { getActor } from '@/lib/auth/actor'
import { loadDataset } from '@/lib/db/dataset'
import { instructorSessions } from '@/lib/db/queries'
import { studioLineage } from '@/lib/studio/library'
import { PEN_RECIPES } from '@/lib/studio/pen3d/recipes'
import { GRADE_BAND_LABEL } from '@/types/domain'

export const metadata = { title: '도안 만들기' }

/**
 * 생성 화면. 레시피 목록을 **서버에서 내려준다** — 클라이언트 번들에 기하 계산 코드를
 * 넣지 않기 위해서다. 목록 자체가 "LLM 이 고를 수 있는 전부"이기도 하다 (ADR-029).
 */
export default async function StudioNewPage({
  searchParams,
}: {
  searchParams: Promise<{ lineage?: string; session?: string }>
}) {
  const actor = await getActor()
  if (!actor || actor.role !== 'instructor') redirect('/login')

  const { lineage, session } = await searchParams
  const ds = await loadDataset()
  const me = ds.instructors.find((i) => i.id === actor.instructorId)
  if (!me) notFound()

  // 새 버전을 만드는 경우. 남의 계보에는 붙일 수 없다 (서버 라우트도 같은 것을 막는다).
  const history = lineage ? studioLineage(ds.studioContents, lineage) : []
  const head = history[0] ?? null
  if (lineage && (!head || head.instructor_id !== me.id)) notFound()

  const sessions: SessionOption[] = instructorSessions(ds, me.id)
    .filter((s) => !s.closed)
    .map(({ session: row, orgName }) => ({
      id: row.id,
      label: `${row.title} · ${orgName}`,
      conditions: `${GRADE_BAND_LABEL[row.grade_band]} ${row.expected_students}명 · ${row.duration_minutes}분 · ${row.venue} · 장비 ${row.equipment.join(', ') || '없음'}`,
    }))

  const recipes = PEN_RECIPES.map((r) => ({
    id: r.id,
    title: r.title,
    difficulty: r.nominal_difficulty,
  }))

  // 체험 세션이어도 도안 저작은 실제 AI 가 한다 (ADR-035). 그 사실을 적어 둔다.
  const tourLlm = await studioTourLlmAvailable()

  /**
   * 2D 를 기본값으로 둘 수 있는가 (ADR-036·037).
   *
   * 2D 는 **모양 경로가 하나뿐이다** — 검수된 실루엣이거나 LLM 윤곽 제안이다. 아틀라스가 비어
   * 있고 키도 없는 세션(체험)에서 2D 를 기본값으로 두면 강사·방문자는 **첫 화면부터 실패**를 본다.
   * 그래서 기본값을 조건에서 계산한다 — 아틀라스가 쌓이거나 키가 붙는 순간 저절로 2D 가 된다.
   */
  /** AI 가 모양을 **먼저** 그리는 세션인가 (ADR-046). 화면 문구와 진행 단계가 이 값으로 갈린다 */
  const llmDraws = await studioLlmAvailable()
  const flatReady = atlasCount() > 0 || llmDraws

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={head ? `${head.title} · v${head.version} 다음 버전` : undefined}
        title={head ? '새 버전 만들기' : '3D펜 도안 만들기'}
        description={
          head
            ? '앞 버전은 그대로 남습니다. 수업에서 무엇이 더 나았는지 비교할 수 있어야 하기 때문입니다.'
            : llmDraws
              ? `주제와 수업 조건을 넣으면 AI 가 주제대로 윤곽과 색을 그려 보고, 검증에 걸리면 미리 만들어 둔 검수된 도안 ${packCount()}개에서 찾습니다. A4 1:1 도안·학생용 사용법·강사용 지도안·검증 리포트를 함께 만듭니다.`
              : `주제와 수업 조건을 넣으면 미리 만들어 둔 검수된 도안 ${packCount()}개에서 찾고, A4 1:1 도안·학생용 사용법·강사용 지도안·검증 리포트를 함께 만듭니다.`
        }
        actions={
          <Link href="/instructor/studio" className="text-sm text-sub underline-offset-4 hover:underline">
            목록으로
          </Link>
        }
      />

      {tourLlm ? (
        <p className="border-l-2 border-point bg-point-bg px-4 py-3 text-sm leading-relaxed text-body">
          체험 중이지만 <strong>도안 저작은 실제 AI</strong>가 합니다. 적으신 문장을 읽고 검수된
          조각으로 모양을 짭니다 — 하루 사용량을 넘으면 미리 만들어 둔 도안과 시연용 문장으로
          바뀝니다.
        </p>
      ) : null}

      <Panel title="수업 조건">
        <GenerateForm
          sessions={sessions}
          recipes={recipes}
          lineageId={lineage ?? null}
          defaultTopic={head?.spec.topic ?? ''}
          defaultSessionId={session ?? head?.session_id ?? ''}
          defaultForm={flatReady ? 'flat' : 'solid'}
          // 시연용 문장을 쓰는 세션이면 결과 화면이 그렇게 표시한다 (ADR-025).
          demoAi={await demoAiEnabled()}
          llmDraws={llmDraws}
        />
      </Panel>

      <Panel
        title="조립해서 만드는 입체 도안"
        description={
          llmDraws
            ? `사람이 검수한 목록입니다. 2D 한 장으로 만드는 모양은 AI 가 주제대로 그려 보고, 검증에 걸리면 미리 만들어 둔 도안 ${packCount()}개에서 찾습니다 — 검증을 통과하지 못한 도안은 내보내지 않습니다.`
            : `사람이 검수한 목록입니다. 2D 한 장으로 만드는 모양은 미리 만들어 둔 도안 ${packCount()}개에서 주제로 찾습니다 — 검증을 통과하지 못하면 내보내지 않습니다.`
        }
      >
        <ul className="grid gap-3 sm:grid-cols-2">
          {PEN_RECIPES.map((recipe) => (
            <li key={recipe.id} className="rounded-md border border-line bg-card p-4">
              <p className="flex items-center justify-between gap-2 text-sm font-semibold text-ink">
                {recipe.title}
                <span className="shrink-0 text-xs font-medium tabular-nums text-sub">
                  난이도 {recipe.nominal_difficulty}
                </span>
              </p>
              <p className="mt-1.5 text-xs leading-relaxed text-body">{recipe.summary}</p>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  )
}
