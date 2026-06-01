import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'

const apiPath = 'api/internal/snapshots.js'
const packagePath = 'package.json'
const databaseUrlToken = 'DATABASE_' + 'URL'

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
  apiText.includes('export function createSnapshotHandler') &&
    apiText.includes('export default createSnapshotHandler()'),
  'API must export a default handler and a mockable handler factory.',
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
assert(
  apiText.includes(databaseUrlToken),
  `API must read ${databaseUrlToken} only after write gating.`,
)
assert(
  apiText.includes('@neondatabase/serverless'),
  'API must use @neondatabase/serverless.',
)
assert(!/from\s+['"]pg['"]|import\(['"]pg['"]\)|require\(['"]pg['"]\)/.test(apiText), 'API must not use pg.')
assert(/insert\s+into\s+analysis_snapshots/i.test(apiText), 'API must insert into analysis_snapshots.')
assert(!/\bfetch\b/.test(apiText), 'API must not use fetch.')
assert(!/axios/i.test(apiText), 'API must not use axios.')
assert(!/openai/i.test(apiText), 'API must not mention OpenAI.')
assert(!/\bgpt\b/i.test(apiText), 'API must not mention GPT.')
assert(!/App\.jsx/.test(apiText), 'API must not import App.jsx.')
assert(!/betEngine\.js/.test(apiText), 'API must not import betEngine.js.')
assert(!/snapshotPayload/.test(apiText), 'API must not import snapshotPayload.')
assert(!/matchApi/.test(apiText), 'API must not import matchApi.')
assert(!/src\/data|src\\data/.test(apiText), 'API must not import src/data.')
assert(
  apiText.includes('buildAnalysisSnapshotRow'),
  'API must map payloads through buildAnalysisSnapshotRow.',
)
assert(
  apiText.includes('x-snapshot-write-token'),
  'API must read x-snapshot-write-token.',
)
assert(
  apiText.includes('Snapshot writing is disabled.'),
  'API must return the disabled response message.',
)
assert(
  apiText.includes('DATABASE_URL_MISSING'),
  `API must return ${databaseUrlToken} missing safely.`,
)
assert(
  apiText.includes('DATABASE_WRITE_FAILED'),
  'API must return database write failures safely.',
)
assert(
  apiText.includes('Snapshot written.'),
  'API must return the write success message.',
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
  Object.prototype.hasOwnProperty.call(dependencies, '@neondatabase/serverless'),
  'package.json must include @neondatabase/serverless.',
)
assert(!Object.prototype.hasOwnProperty.call(dependencies, 'pg'), 'package.json must not include pg.')

const packageStatus = git(['status', '--short', '--', packagePath])
assert(
  !packageStatus || packageStatus.startsWith('M '),
  'package.json may only be modified to add the allowed dependency.',
)

console.log('Snapshot API checks passed.')
