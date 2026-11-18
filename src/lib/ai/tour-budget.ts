/**
 * 체험 세션이 쓸 수 있는 LLM 예산 (ADR-035).
 *
 * 체험은 로그인 없이 누구나 들어오는 익명 경로다. 그래서 기본값은 "LLM 을 부르지 않는다"
 * 이고(ADR-033), 유일한 예외가 **스튜디오 저작**이다 — 방문자가 적은 문장을 읽고 검수된
 * 조각으로 모양을 짜는 일. 그 한 가지는 시연용 고정 응답으로 보여 줄 수 없다. 고정 응답은
 * 미리 적어 둔 네 가지 주제(물고기·동물·새·사람)만 알아듣기 때문이다.
 *
 * 예외를 여는 대신 **상한을 셋** 둔다. 어느 하나라도 걸리면 거절이 아니라 시연용 응답으로
 * 떨어진다 — 체험 화면은 계속 돌아가야 한다.
 *
 * 1. 스위치: `TOUR_LLM=off` 한 줄로 전부 닫는다
 * 2. 하루 총량: `TOUR_LLM_DAILY_MAX` (기본 {@link TOUR_LLM_DAILY_MAX_DEFAULT})
 * 3. 방문자별: {@link TOUR_LLM_PER_VISITOR} — 라우트가 IP 기준으로 건다
 *
 * **이 카운터는 프로세스 메모리다.** 서버리스에서는 인스턴스마다 한 벌이므로 하루 총량은
 * 정확한 상한이 아니라 브레이크다. 정확한 과금 상한은 Anthropic 콘솔의 예산 한도로 건다 —
 * 여기서 하는 일은 "한 사람이 F5 를 누르는 동안 예산이 비지 않게" 막는 것이다.
 */

/** 환경변수를 넣지 않았을 때의 하루 상한. 시연·심사 트래픽을 기준으로 잡았다. */
export const TOUR_LLM_DAILY_MAX_DEFAULT = 150

/** 방문자 한 명(IP)이 쓸 수 있는 호출. 라우트의 레이트 리밋에 그대로 넘긴다. */
export const TOUR_LLM_PER_VISITOR = { limit: 5, windowMs: 10 * 60_000 } as const

/** 한국 날짜(YYYY-MM-DD). 하루 상한은 KST 자정에 돌아간다. */
function kstDay(now = Date.now()): string {
  return new Date(now + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

const counter = { day: kstDay(), used: 0 }

/** 하루 상한. `0` 이면 기능을 끈 것이다. 숫자가 아니면 기본값을 쓴다. */
export function tourLlmDailyMax(): number {
  const raw = process.env.TOUR_LLM_DAILY_MAX?.trim()
  if (raw === undefined || raw === '') return TOUR_LLM_DAILY_MAX_DEFAULT
  const n = Number(raw)
  if (!Number.isInteger(n) || n < 0) return TOUR_LLM_DAILY_MAX_DEFAULT
  return n
}

/** 체험에서 LLM 을 쓸 수 있는 설정인가. 키가 있는지는 보지 않는다 — 그건 `client.ts` 가 본다. */
export function tourLlmEnabled(): boolean {
  if (process.env.TOUR_LLM?.trim().toLowerCase() === 'off') return false
  return tourLlmDailyMax() > 0
}

/** 오늘 쓴 양. 운영자 화면·헬스체크가 그대로 읽는다. */
export function tourLlmBudget(): { day: string; used: number; max: number } {
  const today = kstDay()
  if (counter.day !== today) {
    counter.day = today
    counter.used = 0
  }
  return { day: counter.day, used: counter.used, max: tourLlmDailyMax() }
}

/**
 * 호출 하나를 예산에서 뺀다. **부르기 직전에** 부르고, 돌려주지 않는다 —
 * 실패한 호출도 비용이 들기 때문이다.
 */
export function takeTourLlmCall(): boolean {
  if (!tourLlmEnabled()) return false
  const budget = tourLlmBudget()
  if (budget.used >= budget.max) return false
  counter.used += 1
  return true
}

/** 테스트용. 운영 코드에서 부르지 않는다. */
export function resetTourLlmBudget(): void {
  counter.day = kstDay()
  counter.used = 0
}
