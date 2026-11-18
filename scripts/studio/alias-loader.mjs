/**
 * `@/...` 를 `src/...` 로 바꿔 주는 ESM 로더. **오프라인 스크립트 전용이다.**
 *
 * 왜 필요한가: 아틀라스 생산 스크립트(`atlas.ts`)는 런타임과 **같은** 모양 코드를 써야 한다.
 * 복사해 두면 스크립트가 통과시킨 모양이 런타임에서 떨어진다. 그런데 Node 는 tsconfig 의
 * 경로 별칭을 모르므로, 여기서 한 줄 해석해 준다. Node 24 의 타입 스트리핑으로 .ts 를 그대로 읽는다.
 */

import { existsSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'

const ROOT = process.cwd()
const EXTENSIONS = ['.ts', '.tsx', '/index.ts', '.mjs', '.js']

export async function resolve(specifier, context, next) {
  if (specifier.startsWith('@/')) {
    const base = join(ROOT, 'src', specifier.slice(2))
    for (const ext of EXTENSIONS) {
      if (existsSync(base + ext)) {
        return next(pathToFileURL(base + ext).href, context)
      }
    }
    if (existsSync(base)) return next(pathToFileURL(base).href, context)
  }
  return next(specifier, context)
}
