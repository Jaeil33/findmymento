import * as seed from './demo'

/**
 * 데모 시드의 **프로세스 단위 인스턴스 하나.**
 *
 * 왜 필요한가: Next 는 라우트 핸들러(`app/api/**`)와 서버 컴포넌트를 **서로 다른 번들 레이어**로
 * 묶는다. 그래서 같은 `data/demo.ts` 가 한 프로세스 안에 두 번 올라오고, 배열도 두 벌이 된다.
 * 데모·체험 모드의 쓰기는 배열에 `push` 하는 것이므로, 라우트에서 만든 산출물이 화면에서는
 * 보이지 않는다 — 생성 직후 상세 페이지가 404 가 된다. 실제로 그렇게 터졌다.
 *
 * 그래서 먼저 올라온 인스턴스를 전역에 고정하고, 읽기·쓰기는 전부 이 객체를 거친다.
 * `data/demo.ts` 를 직접 import 하는 곳은 이 파일뿐이어야 한다 (`tests/tour-mode.test.ts` 가 확인).
 *
 * 실 DB 모드에서는 이 배열을 아무도 바꾸지 않는다. 체험·데모 모드의 쓰기는 서버 메모리에만
 * 남고 재시작하면 사라진다 — 그 사실은 화면 상단 띠에 적혀 있다 (ADR-033).
 */
type Seed = typeof seed

const globalStore = globalThis as typeof globalThis & { __fmmDemoSeed?: Seed }

/**
 * 테스트에서는 고정하지 않는다. vitest 는 테스트 파일마다 모듈을 새로 올리므로, 전역에 고정하면
 * 먼저 실행된 파일의 시드가 다음 파일로 새어 나가 "앞 테스트가 넣은 행"이 보인다.
 */
const pin = !process.env.VITEST

export const demo: Seed = pin ? (globalStore.__fmmDemoSeed ??= seed) : seed
