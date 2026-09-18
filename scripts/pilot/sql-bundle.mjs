#!/usr/bin/env node
/**
 * supabase/migrations/*.sql 을 파일명 순서대로 이어 붙여 pilot-data/setup-all.sql 한 파일로 만든다.
 * Supabase SQL Editor 에 한 번 붙여 넣고 Run 하면 파일럿 DB 가 완성된다.
 *
 *   npm run pilot:sql
 *
 * bootstrap.sql · seed.sql 은 넣지 않는다 — 파일럿 데이터는 npm run pilot:setup 이 넣는다.
 * 전체를 begin/commit 으로 감싼다. 중간에 실패하면 아무것도 적용되지 않는다.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { PILOT_DIR, cliArgs, fail, migrationFiles, runMain } from './common.mjs'

const USAGE = `사용법: npm run pilot:sql
  supabase/migrations/*.sql → pilot-data/setup-all.sql (Supabase SQL Editor 에 붙여 넣을 파일)`

await runMain(async () => {
  cliArgs({}, USAGE)

  const files = migrationFiles()
  if (files.length === 0) fail('supabase/migrations 에 .sql 파일이 없어요.')

  const stamp = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 16).replace('T', ' ')
  const names = files.map((f) => `supabase/migrations/${basename(f)}`)

  const header = [
    '-- ============================================================================',
    '-- Find My Mento · 파일럿 DB 한 번에 만들기 (자동 생성 — 이 파일을 직접 고치지 말 것)',
    `-- 생성: ${stamp} KST · scripts/pilot/sql-bundle.mjs`,
    '--',
    '-- 포함 파일 (이 순서대로 실행된다):',
    ...names.map((n, i) => `--   ${i + 1}. ${n}`),
    '--',
    '-- 사용법: Supabase → SQL Editor → New query → 이 파일 전체를 붙여 넣고 Run.',
    '--   · 새 프로젝트에서 **딱 한 번만** 실행한다. 두 번 실행하면 "already exists" 오류가 난다.',
    '--   · 전체가 하나의 트랜잭션이다. 중간에 실패하면 아무것도 적용되지 않는다.',
    '--   · bootstrap.sql · seed.sql 은 넣지 않았다. 파일럿 데이터는 npm run pilot:setup 이 넣는다.',
    '--   · 마지막 결과 표에서 rls_disabled_tables 가 0 이어야 한다 (모든 테이블 RLS 켜짐).',
    '-- ============================================================================',
    '',
  ].join('\n')

  const body = files
    .map((f, i) => `-- ===== ${names[i]} =====\n\n${readFileSync(f, 'utf8').replace(/^﻿/, '').trimEnd()}\n`)
    .join('\n')

  const verify = [
    '-- ===== 확인: public 테이블 수와 RLS 가 꺼진 테이블 (0 이어야 한다) =====',
    'select',
    "  (select count(*) from pg_tables where schemaname = 'public') as public_tables,",
    "  (select count(*) from pg_tables where schemaname = 'public' and not rowsecurity) as rls_disabled_tables,",
    "  (select coalesce(string_agg(tablename, ', '), '') from pg_tables where schemaname = 'public' and not rowsecurity) as rls_disabled_list;",
    '',
  ].join('\n')

  const sql = `${header}\nbegin;\n\n${body}\ncommit;\n\n${verify}`
  mkdirSync(PILOT_DIR, { recursive: true })
  const out = join(PILOT_DIR, 'setup-all.sql')
  writeFileSync(out, sql, 'utf8')

  const bytes = Buffer.byteLength(sql, 'utf8')
  console.log(`✔ ${out}`)
  console.log(`  ${files.length}개 파일 · ${sql.split('\n').length}줄 · ${(bytes / 1024).toFixed(1)}KB`)
  for (const n of names) console.log(`  - ${n}`)
  console.log('\n다음: Supabase → SQL Editor → New query → 이 파일 내용을 전부 붙여 넣고 Run (새 프로젝트에서 한 번만).')
  console.log('     결과 표의 rls_disabled_tables 가 0 인지 확인하세요.')

  // 원본을 다시 읽어 누락이 없는지 한 번 더 본다 — 복사 중 잘린 파일로 DB 를 만들면 원인을 찾기 어렵다.
  for (const f of files) {
    if (!sql.includes(readFileSync(f, 'utf8').replace(/^﻿/, '').trimEnd())) fail(`번들에 ${basename(f)} 가 온전히 들어가지 않았어요.`)
  }
})
