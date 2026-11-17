import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * UI_GUIDE "AI 슬롭 안티패턴" 표를 소스 스캔으로 고정한다.
 *
 * 공개 화면을 홈페이지답게 다듬을수록 이 장식들이 슬그머니 들어온다.
 * 사람이 리뷰에서 매번 잡는 대신 여기서 먼저 터지게 둔다.
 */

const SRC = join(process.cwd(), 'src')

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry)
    return statSync(full).isDirectory() ? walk(full) : [full]
  })
}

const files = walk(SRC).filter((f) => /\.(tsx|ts|css)$/.test(f))
const rel = (f: string) => relative(process.cwd(), f).replace(/\\/g, '/')

/** 주석을 뺀 코드만 본다 — 금지 규칙을 설명하는 주석이 위반으로 잡히면 안 된다. */
function codeOnly(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//') && !line.trim().startsWith('*'))
    .join('\n')
}

function offenders(pattern: RegExp): string[] {
  return files.filter((f) => pattern.test(codeOnly(readFileSync(f, 'utf8')))).map(rel)
}

describe('UI_GUIDE 안티패턴', () => {
  it('glass morphism(backdrop blur)을 쓰지 않는다', () => {
    expect(offenders(/backdrop-blur|backdrop-filter/)).toEqual([])
  })

  it('그라데이션 텍스트·그라데이션 배경을 쓰지 않는다', () => {
    expect(offenders(/bg-clip-text|bg-gradient-|bg-linear-|bg-radial-|bg-conic-|linear-gradient|radial-gradient/)).toEqual([])
  })

  it('배경 blur orb 를 쓰지 않는다', () => {
    expect(offenders(/\bblur-(xl|2xl|3xl)\b/)).toEqual([])
  })

  it('보라·인디고 계열 색을 쓰지 않는다 — 포인트 색은 딥 틸 한 가지다', () => {
    expect(offenders(/\b(?:bg|text|border|ring|fill|stroke)-(?:purple|indigo|violet|fuchsia)-/)).toEqual([])
  })

  it('fade-in / slide-up 외의 애니메이션을 쓰지 않는다', () => {
    expect(offenders(/\banimate-(?:pulse|spin|bounce|ping)\b/)).toEqual([])
  })

  it('"Powered by AI" 류 장식 배지를 만들지 않는다', () => {
    expect(offenders(/Powered by AI/i)).toEqual([])
  })

  it('라벨을 대문자로 늘려 쓰지 않는다 — 제목 위 색칠한 꼬리표(eyebrow)의 흔한 모양이다', () => {
    expect(offenders(/uppercase/)).toEqual([])
  })

  it('모서리 반경은 정해진 4단만 쓴다 (xs·sm·md·xl)', () => {
    // rounded-lg / rounded-2xl 이 섞이면 "용도별로 다른 반경"이 그냥 제각각이 된다.
    expect(offenders(/rounded-(lg|2xl|3xl)/)).toEqual([])
  })
})

/**
 * 버튼·링크 문구 뒤에 화살표를 붙이지 않는다.
 *
 * 생성형 랜딩의 가장 흔한 버릇이고, 누르면 어디로 가는지는 문구가 말한다.
 * 목록 행 끝의 이동 표시(`ProgramCardView` 처럼 카드 전체가 링크인 경우)는 이 규칙이 아니다 —
 * 여기서 막는 건 **문구 바로 뒤에 붙은** 화살표다.
 */
describe('CTA 문구 뒤 화살표', () => {
  it('버튼 모양 링크 안에서 문구 다음에 화살표 아이콘을 두지 않는다', () => {
    const offending = files.filter((f) => {
      const code = codeOnly(readFileSync(f, 'utf8'))
      return /(?:CTA_PRIMARY|CTA_SECONDARY|buttonClass\()[\s\S]{0,400}?<IconArrowRight/.test(code)
    })
    expect(offending.map(rel)).toEqual([])
  })
})
