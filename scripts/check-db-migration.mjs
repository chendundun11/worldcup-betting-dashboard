import { existsSync, readFileSync } from 'node:fs'

const migrationPath = 'db/migrations/001_analysis_snapshots.sql'

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

assert(existsSync(migrationPath), 'migration 文件不存在')

const sql = readFileSync(migrationPath, 'utf8')
const compactSql = sql.toLowerCase().replace(/\s+/g, ' ')

for (const required of [
  'create table if not exists analysis_snapshots',
  'public_match_snapshot jsonb not null',
  'engine_snapshot jsonb not null',
  'internal_snapshot jsonb',
]) {
  assert(compactSql.includes(required), `migration 缺少 ${required}`)
}

for (const [label, pattern] of [
  ['DATABASE_URL', /DATABASE_URL/i],
  ['process.env', /process\.env/i],
  ['insert into', /insert\s+into/i],
  ['GPT/OpenAI', /\b(gpt|openai)\b/i],
  ['Supabase auth', /\bauth\b/i],
  ['Supabase realtime', /\brealtime\b/i],
  ['Supabase storage', /\bstorage\b/i],
  ['drop table', /drop\s+table/i],
]) {
  assert(!pattern.test(sql), `migration 不应包含 ${label}`)
}

console.log(
  JSON.stringify(
    {
      migrationPath,
      table: 'analysis_snapshots',
      checks: [
        'create table',
        'snapshot jsonb columns',
        'no insert',
        'no database connection',
        'no Supabase-only features',
        'no drop table',
      ],
    },
    null,
    2,
  ),
)
console.log('DB migration checks passed.')
