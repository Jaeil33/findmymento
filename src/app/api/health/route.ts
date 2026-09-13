import { NextResponse } from 'next/server'
import { demoAiEnabled } from '@/lib/ai/demo-writer'
import { isDemoMode, siteUrl } from '@/lib/supabase/env'

/**
 * 배포 직후 "환경변수가 실제로 들어갔는지"를 한 번에 확인하는 지점.
 *
 * 파일럿 현장에서 QR 이 죽는 가장 흔한 원인은 코드가 아니라 `NEXT_PUBLIC_SITE_URL` 오타다.
 * QR 은 전부 이 값으로 만들어지므로(`lib/supabase/env.ts` siteUrl), 교실에 들어가기 전에
 * `student_entry_example` 을 눈으로 확인한다.
 *
 * **키 값은 내려보내지 않는다.** 설정 여부(boolean)와 공개 도메인까지다.
 */

export const dynamic = 'force-dynamic'

const isSet = (v: string | undefined) => Boolean(v && v.trim() !== '')

export function GET() {
  const site = siteUrl()

  return NextResponse.json({
    ok: true,
    mode: isDemoMode() ? 'demo' : 'live',
    // llm: 실제 LLM · demo: 시연용 AI 응답(ADR-025) · rule: 규칙 문장
    ai_mode: isSet(process.env.ANTHROPIC_API_KEY) ? 'llm' : demoAiEnabled() ? 'demo' : 'rule',
    site_url: site,
    // 입장코드 자리에 예시 6자리를 넣은 학생 진입 URL. 도메인 오타가 여기서 보인다.
    student_entry_example: `${site}/s/123456`,
    config: {
      supabase_url: isSet(process.env.NEXT_PUBLIC_SUPABASE_URL),
      supabase_anon_key: isSet(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
      // 운영자 기능(심사·초대·문의 배정)에만 쓴다. 없으면 그 화면들만 동작하지 않는다.
      service_role_key: isSet(process.env.SUPABASE_SERVICE_ROLE_KEY),
      // 없으면 추천이 규칙 기반으로 동작한다 (E-06, ADR-004). 차단 사유가 아니다.
      anthropic_api_key: isSet(process.env.ANTHROPIC_API_KEY),
      // false 면 Vercel 이 주는 도메인으로 떨어진 것이다. 프로덕션에서는 true 여야 한다.
      site_url_explicit: isSet(process.env.NEXT_PUBLIC_SITE_URL),
    },
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
    checked_at: new Date().toISOString(),
  })
}
