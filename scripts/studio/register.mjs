/** 별칭 로더를 등록한다. `node --import ./scripts/studio/register.mjs` 로 쓴다 */
import { register } from 'node:module'
register('./alias-loader.mjs', import.meta.url)
