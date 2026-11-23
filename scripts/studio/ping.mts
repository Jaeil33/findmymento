/**
 * 클로드 API 연결 점검 — **토큰을 쓰지 않는다** (ADR-046).
 *
 *   npm run studio:ping
 *   npm run studio:ping -- --topic "바다에 사는 물고기"
 *
 * 무엇을 확인하는가:
 *
 *   1. `STUDIO_LLM` 스위치 상태 — 꺼져 있으면 스튜디오는 클로드를 **한 번도** 부르지 않는다
 *   2. 키·작업공간 헤더·네트워크가 살아 있는가 → `GET /v1/models/{id}` (**과금 없음**)
 *   3. 도안 생성 한 번이 **입력 토큰 몇 개인가** → `POST /v1/messages/count_tokens` (**과금 없음**)
 *
 * **`messages.create` 를 부르지 않는다.** 그래서 이 스크립트는 몇 번 돌려도 요금이 0 이다.
 * 실제 생성은 앱에서 스위치를 켜고 생성 버튼을 눌러야 일어난다.
 *
 * 보내는 프롬프트는 **런타임과 같은 것**이다 (`pen3d/outline-prompt.ts`) — 다른 문장으로
 * 세면 토큰 수가 실제와 달라지고, 그러면 이 숫자로 예산을 잡을 수 없다.
 */

import { anthropicModel, createAnthropic } from '@/lib/ai/anthropic'
import { ART_ONLY_SYSTEM } from '@/lib/studio/pen3d/outline-prompt'
import { GRADE_BAND_LABEL } from '@/types/domain'

type Args = { topic: string }

function parseArgs(argv: string[]): Args {
  const args: Args = { topic: '바다에 사는 물고기' }
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--topic' && argv[i + 1]) {
      args.topic = argv[i + 1]!
      i += 1
    }
  }
  return args
}

/**
 * 1M 토큰당 단가 (USD). 모델 이름으로 찾지 못하면 비용 줄을 적지 않는다 —
 * **틀린 숫자를 적는 것보다 비우는 쪽이 낫다.**
 */
const PRICE: Record<string, { input: number; output: number }> = {
  'claude-opus-5': { input: 5, output: 25 },
  'claude-opus-5-5': { input: 4, output: 20 },
  'claude-sonnet-5': { input: 2, output: 10 },
  'claude-sonnet-5-5': { input: 2, output: 10 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5 },
}

/** 도안 저작 응답의 상한 (`author.ts` 의 `max_tokens`, 윤곽을 받는 경우) */
const OUTPUT_CAP = 2400

function line(label: string, value: string): void {
  console.log(`  ${label.padEnd(22, ' ')} ${value}`)
}

async function main(): Promise<void> {
  const { topic } = parseArgs(process.argv.slice(2))
  const model = anthropicModel()
  const key = process.env.ANTHROPIC_API_KEY?.trim()
  const workspace = process.env.ANTHROPIC_WORKSPACE_ID?.trim()
  const switchOn = process.env.STUDIO_LLM?.trim().toLowerCase() === 'on'

  console.log('\n클로드 API 연결 점검 — 토큰을 쓰지 않습니다 (생성 호출 없음)\n')
  line('STUDIO_LLM', switchOn ? 'on — 앱의 도안 생성이 클로드를 부릅니다' : 'off — 앱은 클로드를 부르지 않습니다 (기본값)')
  line('ANTHROPIC_API_KEY', key ? `있음 (${key.slice(0, 8)}…, ${key.length}자)` : '없음')
  line('ANTHROPIC_WORKSPACE_ID', workspace ? `있음 (${workspace})` : '없음 — 작업공간에 묶인 키면 비워 둡니다')
  line('모델', model)

  if (!key) {
    console.log('\n키가 없습니다. `.env.local` 의 ANTHROPIC_API_KEY 를 채운 뒤 다시 돌려 주세요.\n')
    process.exitCode = 1
    return
  }

  const client = createAnthropic(key)

  // ── 1. 키·헤더·네트워크 (과금 없음) ─────────────────────────────────────────
  console.log('\n[1/2] 키와 모델 확인 — GET /v1/models (과금 없음)')
  try {
    const info = await client.models.retrieve(model)
    line('응답', `${info.id}${info.display_name ? ` (${info.display_name})` : ''}`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.log(`  실패: ${message}`)
    console.log(
      '\n  401·403 이면 키나 작업공간 헤더를, 404 면 모델 이름(ANTHROPIC_MODEL)을 확인해 주세요.\n',
    )
    process.exitCode = 1
    return
  }

  // ── 2. 도안 생성 한 번의 입력 토큰 (과금 없음) ──────────────────────────────
  console.log('\n[2/2] 도안 생성 한 번의 입력 토큰 — POST /v1/messages/count_tokens (과금 없음)')

  /** 런타임이 2D 저작에서 보내는 것과 **같은 모양**의 페이로드 (`studio/author.ts`) */
  const payload = {
    주제: topic,
    학년대: GRADE_BAND_LABEL.middle,
    인원: 20,
    시수_분: 90,
    장소: '교실',
    보유_장비: ['3D펜 20자루', 'PLA 필라멘트', '실리콘 매트'],
    조각: null,
    후보: [],
    지난_수업_피드백: null,
  }

  try {
    const counted = await client.messages.countTokens({
      model,
      system: ART_ONLY_SYSTEM,
      messages: [{ role: 'user', content: JSON.stringify(payload) }],
    })
    const input = counted.input_tokens
    line('주제', topic)
    line('입력 토큰', `${input.toLocaleString()}개`)
    line('출력 상한', `${OUTPUT_CAP.toLocaleString()}개 (author.ts max_tokens)`)

    const price = PRICE[model]
    if (price) {
      const worst = (input / 1_000_000) * price.input + (OUTPUT_CAP / 1_000_000) * price.output
      line('생성 1회 상한', `$${worst.toFixed(4)} (출력이 상한까지 갔을 때)`)
      line('$10 로', `약 ${Math.floor(10 / worst).toLocaleString()}회`)
    } else {
      line('단가', `${model} 의 단가를 모릅니다 — 비용 줄을 비웁니다`)
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.log(`  실패: ${message}`)
    process.exitCode = 1
    return
  }

  console.log('\n결과: 연결 정상. 생성 호출은 하지 않았으므로 **토큰 사용량 0** 입니다.')
  if (!switchOn) {
    console.log('앱에서 실제로 쓰려면 `.env.local` 에 STUDIO_LLM=on 한 줄을 넣고 서버를 다시 띄우세요.\n')
  } else {
    console.log('STUDIO_LLM 이 on 입니다 — 앱에서 도안을 만들면 토큰이 나갑니다.\n')
  }
}

await main()
