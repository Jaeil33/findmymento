// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * 파일럿 스크립트는 최상위 `await runMain(...)` 에서 본문이 돈다. 그보다 아래에 `const`·`let` 으로 선언한 값은
 * 본문이 도는 동안 아직 초기화 전이라, 부르는 순간 ReferenceError(TDZ) 로 스크립트가 멈춘다.
 * 실제로 교실용 QR 을 만들다 멈췄다. 아래쪽 도우미는 function 선언으로 쓴다 — 선언이 끌어올려진다.
 */
const dir = join(process.cwd(), 'scripts', 'pilot')
const scripts = readdirSync(dir)
  .filter((f) => f.endsWith('.mjs'))
  .map((f) => ({ name: f, src: readFileSync(join(dir, f), 'utf8') }))
  .filter((s) => s.src.includes('await runMain('))

describe('파일럿 스크립트 — runMain 아래에 const·let 을 두지 않는다', () => {
  it('검사할 스크립트가 있다', () => {
    expect(scripts.map((s) => s.name)).toEqual(expect.arrayContaining(['setup.mjs', 'rehearse.mjs', 'export.mjs']))
  })

  it.each(scripts.map((s) => [s.name, s.src] as const))('%s', (_name, src) => {
    const below = src
      .slice(src.indexOf('await runMain('))
      .split(/\r?\n/)
      .filter((line) => /^(const|let)\s+\w+\s*=/.test(line))
    expect(below).toEqual([])
  })
})
