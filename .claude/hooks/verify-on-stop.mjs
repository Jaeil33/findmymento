/**
 * Stop: 커밋되지 않은 코드 변경(src · tests · supabase)이 있을 때만 lint + 테스트를 돌린다.
 *
 * - 변경이 없으면(질문에 답만 한 턴, 이미 커밋한 턴) 바로 끝낸다.
 * - 같은 코드 상태로 이미 통과했으면 다시 돌리지 않는다 (node_modules/.cache 에 지문을 남긴다).
 * - 실패하면 exit 2 + stderr 로 Claude 가 고치게 한다. 한 번 막힌 뒤(stop_hook_active)에는
 *   다시 막지 않는다 — 고칠 수 없는 실패로 끝없이 도는 것을 막는다.
 * - 빌드는 돌리지 않는다. 느리고(.next 를 덮어써 켜 둔 dev 서버와 충돌한다) Vercel 이 배포 때 빌드한다.
 *   배포 전 전체 확인은 `npm run verify`.
 */
import { execFileSync, execSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const PATHS = ['src', 'tests', 'supabase']

let raw = ''
for await (const chunk of process.stdin) raw += chunk
let input = {}
try {
  input = JSON.parse(raw)
} catch {
  // 입력이 없어도 검사는 할 수 있다.
}
if (input.stop_hook_active) process.exit(0)

const root = process.env.CLAUDE_PROJECT_DIR || process.cwd()
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })

let status
try {
  status = git('status', '--porcelain', '--', ...PATHS).trim()
} catch {
  process.exit(0) // git 을 못 쓰면 검사하지 않는다
}
if (!status) process.exit(0)

// 지문 = 추적 파일의 변경 내용 + 새 파일의 경로·크기·수정 시각
const hash = createHash('sha1').update(git('diff', 'HEAD', '--', ...PATHS))
for (const file of git('ls-files', '--others', '--exclude-standard', '--', ...PATHS).split('\n').filter(Boolean)) {
  try {
    const s = statSync(join(root, file))
    hash.update(`${file}:${s.size}:${s.mtimeMs}\n`)
  } catch {
    hash.update(`${file}:gone\n`)
  }
}
const fingerprint = hash.digest('hex')
const cacheDir = join(root, 'node_modules', '.cache')
const cacheFile = join(cacheDir, 'claude-verify-on-stop.txt')
try {
  if (readFileSync(cacheFile, 'utf8').trim() === fingerprint) process.exit(0)
} catch {
  // 처음 실행
}

for (const script of ['lint', 'test']) {
  try {
    execSync(`npm run ${script}`, { cwd: root, encoding: 'utf8', stdio: 'pipe', maxBuffer: 64 * 1024 * 1024 })
  } catch (err) {
    const out = `${err.stdout ?? ''}\n${err.stderr ?? ''}`.trim().split('\n').slice(-40).join('\n')
    process.stderr.write(`커밋되지 않은 코드 변경이 있는데 npm run ${script} 가 실패했습니다. 고친 뒤 마치세요.\n${out}\n`)
    process.exit(2)
  }
}

try {
  mkdirSync(cacheDir, { recursive: true })
  writeFileSync(cacheFile, fingerprint)
} catch {
  // 지문을 못 남기면 다음에 한 번 더 돌 뿐이다.
}
