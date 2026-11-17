/**
 * PreToolUse (Bash · PowerShell): 되돌리기 어려운 명령을 실행 전에 막는다.
 *
 * 훅 입력은 stdin JSON 이고 명령은 `tool_input.command` 에 있다. 막을 때는 exit 2 + stderr —
 * Claude 가 이유를 읽고 사용자에게 직접 실행을 요청한다. 입력을 못 읽으면 막지 않는다
 * (훅 오류로 모든 명령이 멈추면 안 된다).
 */
const DANGEROUS = [
  [/\brm\s+-[a-z]*(?:rf|fr)[a-z]*\b/i, 'rm -rf'],
  [/\bremove-item\b[^;|\n]*\s-recurse\b/i, 'Remove-Item -Recurse'],
  [/\bgit\s+push\b[^;|&\n]*(?:\s--force\b|\s-f\b)/i, 'git push --force'],
  [/\bgit\s+reset\s+--hard\b/i, 'git reset --hard'],
  [/\bdrop\s+table\b/i, 'DROP TABLE'],
]

let raw = ''
for await (const chunk of process.stdin) raw += chunk

let command = ''
try {
  command = String(JSON.parse(raw)?.tool_input?.command ?? '')
} catch {
  process.exit(0)
}

const hit = DANGEROUS.find(([pattern]) => pattern.test(command))
if (hit) {
  process.stderr.write(
    `BLOCKED: 위험한 명령어(${hit[1]})가 감지되었습니다. 꼭 필요하면 사용자에게 직접 실행해 달라고 요청하세요.\n`,
  )
  process.exit(2)
}
