import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FIELDS } from '@/types/domain'

/**
 * 수업 후 AI 3종(결과보고서·후속 과정·수업 회고)의 공통 가드 (ADR-024).
 *
 * 여기서 반드시 지켜지는 것:
 * - 5건 미만 집계는 쓰지 않는다는 임계치가 교안 쪽과 같은 값이다 (ADR-018)
 * - 연락처·링크가 섞인 LLM 문장은 통째로 버린다
 * - 규칙이 확정한 숫자 밖의 숫자, 금지된 이름이 들어간 문장을 가려낼 수 있다
 * - LLM 호출은 어떤 경우에도 throw 하지 않는다 — 실패는 null 이다
 *
 * Anthropic SDK 는 가짜로 바꾼다. 실제 API 를 호출하지 않는다.
 */

const createMock = vi.fn()

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: (...args: unknown[]) => createMock(...args) }
  },
}))

const {
  MIN_AGGREGATE_RESPONSES,
  callJsonLlm,
  containsAny,
  numbersWithin,
  sanitizeList,
  sanitizeText,
} = await import('@/lib/ai/guard')
const { PRIOR_MIN_RESPONSES } = await import('@/lib/ai/lesson-plan')

const textBlock = (text: string) => ({ content: [{ type: 'text', text }] })

describe('MIN_AGGREGATE_RESPONSES', () => {
  it('5건이고 교안의 PRIOR_MIN_RESPONSES 와 같다 — 임계치가 기능마다 달라지면 가장 낮은 곳이 뚫린다', () => {
    expect(MIN_AGGREGATE_RESPONSES).toBe(5)
    expect(MIN_AGGREGATE_RESPONSES).toBe(PRIOR_MIN_RESPONSES)
  })
})

describe('sanitizeText', () => {
  it('정상 문장은 그대로 반환한다', () => {
    expect(sanitizeText('학생들이 조립 활동에 가장 오래 집중했습니다.', 100)).toBe(
      '학생들이 조립 활동에 가장 오래 집중했습니다.',
    )
  })

  it('연속 공백·줄바꿈을 하나로 정리하고 앞뒤를 자른다', () => {
    expect(sanitizeText('  조립   활동이\n\n좋았습니다  ', 100)).toBe('조립 활동이 좋았습니다')
  })

  it('전화번호가 섞이면 null', () => {
    expect(sanitizeText('문의는 010-1234-5678 로 주세요', 100)).toBeNull()
  })

  it('URL 이 섞이면 null', () => {
    expect(sanitizeText('자료는 https://example.com/plan 에 있습니다', 100)).toBeNull()
    expect(sanitizeText('www.example.com 참고', 100)).toBeNull()
  })

  it('이메일이 섞이면 null', () => {
    expect(sanitizeText('teacher@example.com 로 보내 주세요', 100)).toBeNull()
  })

  it('길이가 max 를 넘으면 null, 정확히 max 면 통과', () => {
    expect(sanitizeText('가'.repeat(11), 10)).toBeNull()
    expect(sanitizeText('가'.repeat(10), 10)).toBe('가'.repeat(10))
  })

  it('길이 제한은 공백 정리 뒤에 잰다', () => {
    expect(sanitizeText('가     나', 3)).toBe('가 나')
  })

  it('빈 문자열·공백뿐이면 null', () => {
    expect(sanitizeText('', 10)).toBeNull()
    expect(sanitizeText('   \n ', 10)).toBeNull()
  })

  it('문자열이 아니면 null', () => {
    expect(sanitizeText(42, 10)).toBeNull()
    expect(sanitizeText(null, 10)).toBeNull()
    expect(sanitizeText(undefined, 10)).toBeNull()
    expect(sanitizeText({ text: '안녕' }, 10)).toBeNull()
    expect(sanitizeText(['안녕'], 10)).toBeNull()
  })
})

describe('sanitizeList', () => {
  it('배열이 아니면 null', () => {
    expect(sanitizeList('조립', 20, 3)).toBeNull()
    expect(sanitizeList(null, 20, 3)).toBeNull()
    expect(sanitizeList({ 0: '조립' }, 20, 3)).toBeNull()
  })

  it('살아남은 항목이 0개면 null', () => {
    expect(sanitizeList([], 20, 3)).toBeNull()
    expect(sanitizeList(['010-1234-5678', 7, '', null], 20, 3)).toBeNull()
  })

  it('무효 항목만 빠지고 순서는 유지된다', () => {
    expect(sanitizeList(['조립', 'https://x.com', 3, '  비행  연습 '], 20, 5)).toEqual([
      '조립',
      '비행 연습',
    ])
  })

  it('앞에서부터 최대 limit 개만 남긴다', () => {
    expect(sanitizeList(['가', '나', '다', '라'], 20, 2)).toEqual(['가', '나'])
  })

  it('limit 은 무효 항목을 뺀 뒤에 적용한다', () => {
    expect(sanitizeList(['010-1234-5678', '가', '나', '다'], 20, 2)).toEqual(['가', '나'])
  })
})

describe('numbersWithin — 규칙이 확정한 숫자 밖의 숫자를 잡는다', () => {
  it('소수는 정확히 같아야 한다', () => {
    expect(numbersWithin('만족도 평균은 4.3점입니다', [4.3])).toBe(true)
    expect(numbersWithin('만족도 평균은 4.3점입니다', [4.33])).toBe(false)
  })

  it('75% 는 75 로 읽는다', () => {
    expect(numbersWithin('응답률 75%', [75])).toBe(true)
  })

  it('ignore 에 든 분야명의 숫자는 세지 않는다', () => {
    expect(numbersWithin('3D 모델링·프린팅 분야', [], FIELDS)).toBe(true)
    expect(numbersWithin('3D 모델링·프린팅 분야', [])).toBe(false)
  })

  it('ignore 로 지운 뒤에도 남은 숫자는 검사한다', () => {
    expect(numbersWithin('3D 모델링·프린팅 관심 12명', [], FIELDS)).toBe(false)
    expect(numbersWithin('3D 모델링·프린팅 관심 12명', [12], FIELDS)).toBe(true)
  })

  it('허용 목록에 없는 숫자가 하나라도 있으면 false', () => {
    expect(numbersWithin('10명이 응답했습니다', [9])).toBe(false)
    expect(numbersWithin('10명 중 9명이 응답했습니다', [9])).toBe(false)
    expect(numbersWithin('10명 중 9명이 응답했습니다', [9, 10])).toBe(true)
  })

  it('1,200 은 1200 으로 읽는다', () => {
    expect(numbersWithin('1,200원', [1200])).toBe(true)
    expect(numbersWithin('1,200원', [1, 200])).toBe(false)
  })

  it('숫자가 없으면 true', () => {
    expect(numbersWithin('학생들이 조립에 더 오래 집중했습니다.', [])).toBe(true)
  })

  it('문장 끝 마침표는 소수점으로 읽지 않는다', () => {
    expect(numbersWithin('응답은 12건입니다. 평균 4.', [12, 4])).toBe(true)
  })
})

describe('containsAny — 금지 이름이 들어간 문장을 잡는다', () => {
  it('이름이 그대로 들어 있으면 true', () => {
    expect(containsAny('박서연 강사님이 진행했습니다', ['박서연'])).toBe(true)
  })

  it('공백을 끼워 넣어도 걸린다', () => {
    expect(containsAny('박 서연 강사님이 진행했습니다', ['박서연'])).toBe(true)
    expect(containsAny('박서연 강사님', ['박 서연'])).toBe(true)
  })

  it('없으면 false', () => {
    expect(containsAny('강사님이 진행했습니다', ['박서연', '광명시청소년수련관'])).toBe(false)
  })

  it('null·빈 문자열·한 글자 항목은 무시한다 — 성씨 한 글자로 모든 문장이 걸리지 않는다', () => {
    expect(containsAny('가나다 학생들이 좋아했습니다', [null, '', '가'])).toBe(false)
    expect(containsAny('가나다', [undefined, '  ', ' 가 '])).toBe(false)
  })
})

describe('callJsonLlm — 실패는 null, 절대 throw 하지 않는다', () => {
  const originalKey = process.env.ANTHROPIC_API_KEY
  const originalModel = process.env.ANTHROPIC_MODEL

  const req = {
    system: '너는 테스트용이다.',
    payload: { 응답수: 12, 분야: '드론' },
    maxTokens: 800,
  }

  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    delete process.env.ANTHROPIC_MODEL
    createMock.mockReset()
  })

  afterEach(() => {
    if (originalKey === undefined) delete process.env.ANTHROPIC_API_KEY
    else process.env.ANTHROPIC_API_KEY = originalKey
    if (originalModel === undefined) delete process.env.ANTHROPIC_MODEL
    else process.env.ANTHROPIC_MODEL = originalModel
  })

  it('키가 없으면 SDK 를 부르지 않고 null', async () => {
    delete process.env.ANTHROPIC_API_KEY
    await expect(callJsonLlm(req)).resolves.toBeNull()
    expect(createMock).not.toHaveBeenCalled()
  })

  it('키가 빈 문자열·공백이어도 SDK 를 부르지 않고 null', async () => {
    process.env.ANTHROPIC_API_KEY = ''
    await expect(callJsonLlm(req)).resolves.toBeNull()
    process.env.ANTHROPIC_API_KEY = '   '
    await expect(callJsonLlm(req)).resolves.toBeNull()
    expect(createMock).not.toHaveBeenCalled()
  })

  it('앞뒤에 설명이 붙은 JSON 텍스트도 파싱한다', async () => {
    createMock.mockResolvedValue(
      textBlock('초안을 드립니다.\n```json\n{"summary":"조립이 좋았습니다","items":["가","나"]}\n```\n참고하세요.'),
    )
    await expect(callJsonLlm(req)).resolves.toEqual({
      summary: '조립이 좋았습니다',
      items: ['가', '나'],
    })
  })

  it('텍스트 블록만 이어 붙인다', async () => {
    createMock.mockResolvedValue({
      content: [
        { type: 'thinking', thinking: '{"wrong":true}' },
        { type: 'text', text: '{"a":' },
        { type: 'text', text: '1}' },
      ],
    })
    await expect(callJsonLlm(req)).resolves.toEqual({ a: 1 })
  })

  it('JSON 이 없는 텍스트면 null', async () => {
    createMock.mockResolvedValue(textBlock('죄송하지만 만들 수 없습니다.'))
    await expect(callJsonLlm(req)).resolves.toBeNull()
  })

  it('중괄호는 있는데 파싱이 안 되면 null', async () => {
    createMock.mockResolvedValue(textBlock('{ summary: 따옴표 없음 }'))
    await expect(callJsonLlm(req)).resolves.toBeNull()
  })

  it('SDK 가 throw 해도 reject 되지 않고 null', async () => {
    createMock.mockRejectedValue(new Error('rate limit'))
    await expect(callJsonLlm(req)).resolves.toBeNull()
  })

  it('SDK 가 동기적으로 throw 해도 null', async () => {
    createMock.mockImplementation(() => {
      throw new Error('boom')
    })
    await expect(callJsonLlm(req)).resolves.toBeNull()
  })

  it('payload 를 직렬화할 수 없어도 throw 하지 않는다', async () => {
    const circular: Record<string, unknown> = {}
    circular.self = circular
    await expect(callJsonLlm({ ...req, payload: circular })).resolves.toBeNull()
  })

  it('session-plan 과 같은 방식으로 호출한다 — 기본 모델·effort low·timeout 12초·재시도 1회', async () => {
    createMock.mockResolvedValue(textBlock('{}'))
    await callJsonLlm(req)

    const [body, options] = createMock.mock.calls[0] ?? []
    expect(body).toEqual({
      model: 'claude-opus-5',
      max_tokens: 800,
      output_config: { effort: 'low' },
      system: req.system,
      messages: [{ role: 'user', content: JSON.stringify(req.payload) }],
    })
    expect(options).toEqual({ timeout: 12_000, maxRetries: 1 })
  })

  it('ANTHROPIC_MODEL 과 timeoutMs 를 반영한다', async () => {
    process.env.ANTHROPIC_MODEL = '  claude-sonnet-5  '
    createMock.mockResolvedValue(textBlock('{}'))
    await callJsonLlm({ ...req, timeoutMs: 5_000 })

    const [body, options] = createMock.mock.calls[0] ?? []
    expect((body as { model: string }).model).toBe('claude-sonnet-5')
    expect(options).toEqual({ timeout: 5_000, maxRetries: 1 })
  })
})
