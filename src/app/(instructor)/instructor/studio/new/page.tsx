import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { GenerateForm, type SessionOption } from '@/components/studio/GenerateForm'
import { PageHeader, Panel } from '@/components/ui/Section'
import { demoAiEnabled } from '@/lib/ai/demo-writer'
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

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={head ? `${head.title} · v${head.version} 다음 버전` : 'AI 콘텐츠 스튜디오'}
        title={head ? '새 버전 만들기' : '3D펜 도안 만들기'}
        description={
          head
            ? '앞 버전은 그대로 남습니다. 수업에서 무엇이 더 나았는지 비교할 수 있어야 하기 때문입니다.'
            : '주제와 수업 조건을 넣으면 검수된 도안 중에서 고르고, A4 1:1 도안·조립 순서·실습 과제를 만듭니다.'
        }
        actions={
          <Link href="/instructor/studio" className="text-sm text-sub underline-offset-4 hover:underline">
            목록으로
          </Link>
        }
      />

      <Panel title="수업 조건">
        <GenerateForm
          sessions={sessions}
          recipes={recipes}
          lineageId={lineage ?? null}
          defaultTopic={head?.spec.topic ?? ''}
          defaultSessionId={session ?? head?.session_id ?? ''}
          // 시연용 문장을 쓰는 세션이면 결과 화면이 그렇게 표시한다 (ADR-025).
          demoAi={await demoAiEnabled()}
        />
      </Panel>

      <Panel
        title="만들 수 있는 도안"
        description="사람이 검수한 목록입니다. 이 목록 밖의 모양은 만들지 않습니다 — 검증할 수 없는 도안을 교실에 보내지 않기 위해서입니다."
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
