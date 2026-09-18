import Link from 'next/link'
import { SurveyFlow } from '@/components/survey/SurveyFlow'
import { loadEntryContext } from '@/lib/db/student-gate'
import { IconAlert } from '@/components/ui/Icons'

export const metadata = { title: '나에게 맞는 다음 교육 찾기' }

/**
 * QR 진입 화면. 경로의 `code` 는 회차 입장 코드다 (가명코드가 아니다).
 *
 * 코드를 못 찾거나 마감된 회차여도 **404 를 보여주지 않는다** — 안내와 Q&A 유도로 보낸다
 * (E-01·E-17). 교실에서 404 를 본 학생은 그대로 이탈한다.
 *
 * 코드 확인은 서버 게이트가 한다 — anon 은 회차를 읽을 수 없다(RLS). 기관이 가명코드를 발급하지 않았으면
 * 설문은 코드 입력 없이 익명으로 바로 시작한다.
 */
export default async function StudentEntryPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const ctx = await loadEntryContext(code)

  return (
    <div className="mx-auto w-full max-w-md px-4 py-7">
      {!ctx ? (
        <Notice
          title="이 코드로는 들어갈 수 없어요"
          body="번호를 잘못 읽었을 수 있어요. 선생님이 띄워 준 화면의 6자리 숫자를 다시 확인해 주세요."
        />
      ) : ctx.closed ? (
        <Notice
          title="이 수업의 응답 기간이 끝났어요"
          body={`${ctx.orgName}의 "${ctx.session.title}" 수업은 응답을 마감했어요. 더 배우고 싶은 게 있다면 공개 Q&A에 물어볼 수 있어요.`}
        />
      ) : (
        <SurveyFlow
          entryCode={ctx.session.entry_code}
          sessionTitle={ctx.session.title}
          sessionField={ctx.session.field}
          orgName={ctx.orgName}
          instructorName={ctx.instructorName}
          pseudoCodeEnabled={ctx.pseudoCodesIssued}
        />
      )}

      <p className="mt-10 text-xs leading-relaxed text-faint">
        이름·연락처·학교를 묻지 않아요. 답한 내용은 선생님들이 다음 수업을 준비할 때만 써요.
      </p>
    </div>
  )
}

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <div className="animate-fade-in space-y-5">
      <div className="flex items-center gap-2 text-caution">
        <IconAlert width={18} height={18} />
        <p className="text-sm font-medium">안내</p>
      </div>
      <h1 className="text-xl leading-snug font-semibold text-ink">{title}</h1>
      <p className="text-base leading-relaxed text-body">{body}</p>
      <div className="space-y-2.5 pt-2">
        <Link
          href="/qna"
          className="flex min-h-12 w-full items-center justify-center rounded-lg bg-point text-base font-medium text-white"
        >
          공개 Q&amp;A 보기
        </Link>
        <Link
          href="/programs"
          className="flex min-h-12 w-full items-center justify-center rounded-lg border border-line-strong bg-card text-base font-medium text-body"
        >
          우리 지역 프로그램 보기
        </Link>
      </div>
    </div>
  )
}
