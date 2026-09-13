import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * 소스 전체를 훑는 안전 불변식.
 *
 * 화면은 나중에 고칠 수 있지만 아래 규칙이 깨지면 서비스가 끝난다.
 * 새 화면을 만들 때 실수로 규칙을 넘기면 이 테스트가 먼저 터지도록 둔다.
 */

const SRC = join(process.cwd(), 'src')

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry)
    return statSync(full).isDirectory() ? walk(full) : [full]
  })
}

const files = walk(SRC).filter((f) => /\.(ts|tsx)$/.test(f))
const read = (f: string) => readFileSync(f, 'utf8')
const rel = (f: string) => relative(process.cwd(), f).replace(/\\/g, '/')

/** 주석을 뺀 코드만 본다 — 주석의 단어가 위반으로 잡히면 규칙을 설명할 수 없다. */
function codeOnly(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//') && !line.trim().startsWith('*'))
    .join('\n')
}

describe('service_role 키 노출 금지', () => {
  it('클라이언트 컴포넌트에서 SUPABASE_SERVICE_ROLE_KEY 를 읽지 않는다', () => {
    const offenders = files.filter((f) => {
      const src = read(f)
      return src.includes("'use client'") && src.includes('SUPABASE_SERVICE_ROLE_KEY')
    })
    expect(offenders.map(rel)).toEqual([])
  })

  it('서버 전용 키에 NEXT_PUBLIC_ 접두사를 붙이지 않는다', () => {
    for (const f of files) {
      expect(codeOnly(read(f))).not.toContain('NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY')
      expect(codeOnly(read(f))).not.toContain('NEXT_PUBLIC_ANTHROPIC_API_KEY')
    }
  })

  it('service_role 클라이언트는 서버 파일에서만 만든다', () => {
    const offenders = files.filter((f) => {
      const src = read(f)
      return src.includes("'use client'") && src.includes('getServiceSupabase')
    })
    expect(offenders.map(rel)).toEqual([])
  })
})

describe('LLM 호출은 서버에서만 (CLAUDE.md 아키텍처 규칙)', () => {
  it('클라이언트 컴포넌트에서 Anthropic SDK 를 쓰지 않는다', () => {
    const offenders = files.filter((f) => {
      const src = read(f)
      return src.includes("'use client'") && src.includes('@anthropic-ai/sdk')
    })
    expect(offenders.map(rel)).toEqual([])
  })

  it('ANTHROPIC_API_KEY 는 lib/ai 와 서버 경로에서만 읽는다', () => {
    const readers = files.filter((f) => codeOnly(read(f)).includes('ANTHROPIC_API_KEY'))
    for (const f of readers) {
      expect(read(f)).not.toContain("'use client'")
    }
  })
})

describe('강사 연락처 비노출 (CLAUDE.md CRITICAL)', () => {
  const clientFiles = files.filter((f) => read(f).includes("'use client'"))

  it('클라이언트 컴포넌트가 InstructorContact 타입을 import 하지 않는다', () => {
    for (const f of clientFiles) {
      expect(codeOnly(read(f))).not.toContain('InstructorContact')
    }
  })

  it('공개·학생 화면이 instructorContacts 시드를 읽지 않는다', () => {
    const publicish = files.filter((f) =>
      /src[\\/]app[\\/]\((public|student)\)|src[\\/]components[\\/](directory|survey|qna|inquiry)/.test(
        f,
      ),
    )
    expect(publicish.length).toBeGreaterThan(0)
    for (const f of publicish) {
      expect(codeOnly(read(f))).not.toContain('instructorContacts')
    }
  })

  it('공개 Recommendation 타입에 연락처 필드가 없다', () => {
    const domain = read(join(SRC, 'types', 'domain.ts'))
    const block = domain.slice(
      domain.indexOf('export type Recommendation'),
      domain.indexOf('export type RegionExpansion'),
    )
    expect(block).not.toMatch(/phone|email|sns|photo|rating/i)
  })
})

describe('학생 주체 연결 경로 금지 (PRD 안전 설계 3)', () => {
  it('학생이 강사에게 직접 도달하는 API 라우트가 없다', () => {
    const apiDir = join(SRC, 'app', 'api')
    const routes = walk(apiDir).map((f) => rel(f))
    // 존재하는 경로는 이것뿐이다. 새 경로를 추가하면 여기서 걸린다.
    // `health` 는 쓰기 경로가 아니라 배포 확인용이고, 아래 테스트가 그 사실을 고정한다.
    // `lesson-plan` 은 **강사 전용**, `session-plan` 은 **기관 전용**이다 —
    // 둘 다 학생·보호자 경로가 아니며 아래에서 그 사실을 고정한다.
    expect(routes.sort()).toEqual(
      [
        'src/app/api/health/route.ts',
        'src/app/api/inquiry/route.ts',
        'src/app/api/interest/route.ts',
        'src/app/api/lesson-plan/route.ts',
        'src/app/api/qna/route.ts',
        'src/app/api/session-plan/route.ts',
        'src/app/api/recommend/route.ts',
        'src/app/api/survey/route.ts',
      ].sort(),
    )
  })

  it('교안 라우트는 배정된 강사 본인만 통과한다 (ADR-015·019)', () => {
    const src = read(join(SRC, 'app', 'api', 'lesson-plan', 'route.ts'))
    // 역할 확인이 없으면 anon 이 남의 회차 교안을 만들어 낼 수 있다.
    expect(src).toContain("actor.role !== 'instructor'")
    // 배정 확인이 없으면 아무 강사나 남의 회차에 교안을 만든다.
    expect(src).toMatch(/instructor_id === actor\.instructorId/)
    // 응답에 연락처·학생 식별 필드를 만들지 않는다.
    for (const banned of ['phone', 'email', 'pseudo_code', 'student_id', 'guardian']) {
      expect(src, banned).not.toContain(banned)
    }
  })

  it('회차 기획 라우트는 기관 담당자만 통과하고 아무것도 저장하지 않는다 (ADR-021)', () => {
    const src = read(join(SRC, 'app', 'api', 'session-plan', 'route.ts'))
    expect(src).toContain("actor.role !== 'org_member'")
    // 저장하지 않는 화면이다. 쓰기 경로가 생기면 RLS 를 같이 설계해야 한다.
    for (const banned of ['insert', 'upsert', 'update(']) {
      expect(src, banned).not.toContain(banned)
    }
  })

  it('회차 기획이 관내에 없는 공급을 제안하지 못한다 (ADR-021)', () => {
    const src = read(join(SRC, 'lib', 'ai', 'session-plan.ts'))
    // 후보는 규칙이 확정한다 — LLM 출력에서 분야를 읽어오면 안 된다.
    expect(src).toContain('const available = FIELDS.filter')
    // LLM 응답에서 읽어도 되는 것은 문장 세 개뿐이다. 분야·공급·미충족 수요를 읽으면
    // 모델이 관내에 없는 공급을 있다고 말할 수 있게 된다.
    const merge = src.slice(src.indexOf('export function mergeLlmDraft'))
    for (const banned of ['o.suggested_field', 'o.supply_by_field', 'o.unmet', 'o.suggested_title']) {
      expect(merge, banned).not.toContain(banned)
    }
  })

  it('교안 생성 로직이 학생 개인 레코드를 읽지 않는다 (ADR-016·018)', () => {
    const src = read(join(SRC, 'lib', 'ai', 'lesson-plan.ts'))
    // 학급 특성은 회차에서만 온다.
    expect(src).toContain('session.class_traits')
    expect(src).not.toMatch(/ds\.students/)
    // 자유서술은 마스킹을 통과한 것만 본다.
    expect(src).toContain('maskForStorage')
    // k-익명성 임계치가 코드에 박혀 있다.
    expect(src).toMatch(/PRIOR_MIN_RESPONSES\s*=\s*5/)
  })

  it('health 라우트는 읽기 전용이고 DB 를 건드리지 않는다', () => {
    const src = read(join(SRC, 'app', 'api', 'health', 'route.ts'))
    expect(src).not.toMatch(/export\s+(async\s+)?function\s+(POST|PUT|PATCH|DELETE)/)
    expect(src).not.toContain('loadDataset')
    expect(src).not.toContain('getServiceSupabase')
    expect(src).not.toContain('getServerSupabase')
  })

  it('관심 표현 라우트는 기관 경유를 명시한다', () => {
    const src = read(join(SRC, 'app', 'api', 'interest', 'route.ts'))
    expect(src).toContain('선생님께 전달')
  })
})

describe('1:1 메시지 기능 금지 (ADR-006)', () => {
  it('메시지·채팅 경로가 없다', () => {
    const routes = walk(join(SRC, 'app')).map((f) => rel(f))
    for (const r of routes) {
      expect(r).not.toMatch(/\/(messages?|chat|dm)\//)
    }
  })
})

describe('공개 회원가입 금지 (ADR-011)', () => {
  it('signup·register 화면이 없다', () => {
    const routes = walk(join(SRC, 'app')).map((f) => rel(f))
    for (const r of routes) {
      expect(r).not.toMatch(/\/(signup|sign-up|register|join)\//)
    }
  })

  it('비밀번호 가입 API 를 쓰지 않는다', () => {
    for (const f of files) {
      expect(codeOnly(read(f))).not.toContain('signUp(')
      expect(codeOnly(read(f))).not.toContain('signInWithPassword')
    }
  })
})

describe('역할 판별 (CLAUDE.md CRITICAL)', () => {
  const actor = read(join(SRC, 'lib', 'auth', 'actor.ts'))

  it('데모 쿠키 경로는 isDemoMode() 안에서만 실행된다', () => {
    const demoBlock = actor.slice(actor.indexOf('if (isDemoMode())'), actor.indexOf('const sb ='))
    expect(demoBlock).toContain('DEMO_ROLE_COOKIE')
    // 쿠키를 읽는 코드가 isDemoMode 블록 밖에 또 있으면 안 된다
    expect(actor.match(/DEMO_ROLE_COOKIE/g)!.length).toBe(2) // 선언 1 + 사용 1
  })

  it('실 DB 경로는 세 테이블 조회로만 판별한다', () => {
    const realBlock = actor.slice(actor.indexOf('const sb ='))
    expect(realBlock).toContain(".from('admins')")
    expect(realBlock).toContain(".from('org_members')")
    expect(realBlock).toContain(".from('instructors')")
    expect(realBlock).not.toContain('DEMO_ROLE_COOKIE')
    expect(realBlock).not.toMatch(/jwt|claims/i)
  })

  it('organizations.type 으로 권한을 판단하지 않는다 (ADR-013)', () => {
    for (const f of files) {
      const src = codeOnly(read(f))
      // `org.type === 'school'` 같은 분기가 권한 체크와 섞이면 안 된다
      const matches = src.match(/\.type\s*===\s*'(school|youth_center|edu_company|local_gov)'/g)
      if (matches) {
        expect(src).not.toMatch(/redirect\([^)]*\)[\s\S]{0,80}\.type\s*===/)
      }
    }
  })
})

describe('UI_GUIDE 안티패턴', () => {
  const styleFiles = [
    ...files.filter((f) => /\.tsx$/.test(f)),
    join(SRC, 'app', 'globals.css'),
  ]

  it('backdrop-blur · glass morphism 을 쓰지 않는다', () => {
    for (const f of styleFiles) {
      const src = codeOnly(readFileSync(f, 'utf8'))
      expect(src).not.toContain('backdrop-blur')
      expect(src).not.toContain('backdrop-filter')
    }
  })

  it('그라데이션 텍스트·배경을 쓰지 않는다', () => {
    for (const f of styleFiles) {
      const src = codeOnly(readFileSync(f, 'utf8'))
      expect(src).not.toContain('bg-gradient')
      expect(src).not.toContain('bg-clip-text')
      expect(src).not.toContain('linear-gradient')
    }
  })

  it('blur-3xl 배경 장식(orb)을 쓰지 않는다', () => {
    for (const f of styleFiles) {
      expect(codeOnly(readFileSync(f, 'utf8'))).not.toMatch(/blur-(2xl|3xl)/)
    }
  })

  it('보라·인디고 계열 색을 쓰지 않는다', () => {
    for (const f of styleFiles) {
      const src = codeOnly(readFileSync(f, 'utf8'))
      expect(src).not.toMatch(/\b(bg|text|border|from|to)-(purple|violet|indigo|fuchsia)-\d{2,3}\b/)
    }
  })

  it('다크 테마 분기를 만들지 않는다 — 라이트 단일 톤으로 확정됐다', () => {
    for (const f of styleFiles) {
      const src = codeOnly(readFileSync(f, 'utf8'))
      expect(src).not.toContain('prefers-color-scheme')
      // Tailwind 의 `dark:` variant 만 잡는다 (QR 라이브러리의 `color.dark` 옵션은 제외)
      expect(src).not.toMatch(/\sdark:[a-z[]/)
    }
  })

  it('"Powered by AI" 류 배지를 만들지 않는다', () => {
    for (const f of styleFiles) {
      // 금지 문구를 금지한다고 적어 둔 주석은 위반이 아니다
      const src = codeOnly(readFileSync(f, 'utf8'))
      expect(src).not.toMatch(/Powered by AI|AI 기반/i)
    }
  })

  it('학생 설문 화면에 "만족도 조사"라는 말을 쓰지 않는다 (안전규칙 8)', () => {
    const studentFiles = files.filter((f) =>
      /src[\\/](app[\\/]\(student\)|components[\\/]survey)/.test(f),
    )
    expect(studentFiles.length).toBeGreaterThan(0)
    for (const f of studentFiles) {
      expect(codeOnly(read(f))).not.toContain('만족도 조사')
    }
  })

  it('상태관리 라이브러리와 UI 라이브러리를 설치하지 않았다', () => {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>
      devDependencies: Record<string, string>
    }
    const all = { ...pkg.dependencies, ...pkg.devDependencies }
    for (const banned of [
      'zustand',
      'redux',
      '@reduxjs/toolkit',
      'jotai',
      'recoil',
      '@mui/material',
      '@chakra-ui/react',
      'antd',
      'react-bootstrap',
    ]) {
      expect(all).not.toHaveProperty(banned)
    }
  })
})

describe('쓰기 경로는 API 라우트·서버 액션을 지난다', () => {
  it('클라이언트 컴포넌트가 Supabase 로 직접 INSERT 하지 않는다', () => {
    const clientFiles = files.filter((f) => read(f).includes("'use client'"))
    for (const f of clientFiles) {
      const src = codeOnly(read(f))
      expect(src).not.toMatch(/\.from\(['"][a-z_]+['"]\)\s*\n?\s*\.insert/)
      expect(src).not.toMatch(/\.from\(['"][a-z_]+['"]\)\s*\n?\s*\.update/)
      expect(src).not.toMatch(/\.from\(['"][a-z_]+['"]\)\s*\n?\s*\.delete/)
    }
  })

  it('보호자 문의 라우트는 접수된 문의를 응답에 담지 않는다', () => {
    const src = read(join(SRC, 'app', 'api', 'inquiry', 'route.ts'))
    expect(src).not.toContain('guardian_contact')
    expect(src).toMatch(/NextResponse\.json\(\{ ok: true, id/)
  })
})
