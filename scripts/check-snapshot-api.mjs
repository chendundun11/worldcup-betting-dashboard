import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'

const apiPath = 'api/internal/snapshots.js'
const packagePath = 'package.json'

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function readText(path) {
  return readFileSync(path, 'utf8')
}

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim()
}

assert(existsSync(apiPath), `${apiPath} must exist.`)

const apiText = readText(apiPath)
const packageText = readText(packagePath)
const packageJson = JSON.parse(packageText)
const dependencies = {
  ...(packageJson.dependencies ?? {}),
  ...(packageJson.devDependencies ?? {}),
}

assert(
  apiText.includes('export default async function handler'),
  'API must export a default async handler.',
)
assert(
  apiText.includes("request.method !== 'POST'") && apiText.includes('405'),
  'API must restrict methods to POST.',
)
assert(
  apiText.includes('SNAPSHOT_WRITE_ENABLED'),
  'API must read SNAPSHOT_WRITE_ENABLED.',
)
assert(apiText.includes('SNAPSHOT_WRITE_TOKEN'), 'API must read SNAPSHOT_WRITE_TOKEN.')
assert(!apiText.includes('DATABASE_URL'), 'API must not read DATABASE_URL.')
assert(
  !apiText.includes('@neondatabase/serverless'),
  'API must not use @neondatabase/serverless.',
)
assert(!/from\s+['"]pg['"]|import\(['"]pg['"]\)|require\(['"]pg['"]\)/.test(apiText), 'API must not use pg.')
assert(!/insert\s+into/i.test(apiText), 'API must not contain insert statements.')
assert(!/\bfetch\b/.test(apiText), 'API must not use fetch.')
assert(!/openai/i.test(apiText), 'API must not mention OpenAI.')
assert(!/\bgpt\b/i.test(apiText), 'API must not mention GPT.')
assert(!/App\.jsx/.test(apiText), 'API must not import App.jsx.')
assert(!/betEngine\.js/.test(apiText), 'API must not import betEngine.js.')
assert(!/snapshotPayload/.test(apiText), 'API must not import snapshotPayload.')
assert(
  apiText.includes('x-snapshot-write-token'),
  'API must read x-snapshot-write-token.',
)
assert(
  apiText.includes('Snapshot writing is disabled.'),
  'API must return the disabled response message.',
)
assert(
  apiText.includes('Snapshot payload accepted. Database write not implemented.'),
  'API must return the dry-run response message.',
)
assert(
  ['totalStake', 'stakePlan', 'bankroll', 'stake', 'amount', 'money', 'internalSnapshot'].every(
    (field) => apiText.includes(field),
  ),
  'API must list blocked public snapshot fields.',
)
assert(
  ['selectedIndex', 'sourceIndex', 'showInternalEngine'].every((field) =>
    apiText.includes(field),
  ),
  'API must list blocked UI fields.',
)
assert(
  ['totalStake', 'stakePlan', 'bankroll', 'lightDataLayer'].every((field) =>
    apiText.includes(field),
  ),
  'API must list allowed internal snapshot fields.',
)
assert(
  !Object.prototype.hasOwnProperty.call(dependencies, '@neondatabase/serverless'),
  'package.json must not include @neondatabase/serverless.',
)
assert(!Object.prototype.hasOwnProperty.call(dependencies, 'pg'), 'package.json must not include pg.')
assert(!git(['status', '--short', '--', packagePath]), 'package.json must not be modified.')

console.log('Snapshot API checks passed.')
