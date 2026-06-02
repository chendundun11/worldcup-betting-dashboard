import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'

const apiPath = 'api/odds.js'
const servicePath = 'src/services/oddsApi.js'
const appPath = 'src/App.jsx'
const betEnginePath = 'src/services/betEngine.js'
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
assert(existsSync(servicePath), `${servicePath} must exist.`)

const apiText = readText(apiPath)
const serviceText = readText(servicePath)
const appText = readText(appPath)
const betEngineText = readText(betEnginePath)
const packageText = readText(packagePath)

assert(!/\bfetch\s*\(/.test(apiText), 'Odds API endpoint must not fetch an external supplier.')
assert(!/axios|football-data|rapidapi|the-odds|oddsapi|api-football/i.test(apiText), 'Odds API endpoint must not mention an external supplier.')
assert(!/process\.env|import\.meta\.env|API_KEY|TOKEN|SECRET|X-Auth-Token/i.test(apiText), 'Odds API endpoint must not read provider credentials.')
assert(!new RegExp(`${databaseUrlToken}|@neondatabase|SNAPSHOT_WRITE|internal/snapshots|analysis_snapshots`, 'i').test(apiText), 'Odds API endpoint must not touch database or snapshot writes.')
assert(!/openai|\bgpt\b/i.test(apiText), 'Odds API endpoint must not mention OpenAI or GPT.')
assert(!/from\s+['"][^'"]+['"]|import\(/.test(apiText), 'Odds API endpoint must not import provider clients.')

assert(!/oddsApi|getOddsSnapshot|api\/odds/.test(appText), 'App.jsx must not reference oddsApi or /api/odds.')
assert(!/oddsApi|getOddsSnapshot|api\/odds/.test(betEngineText), 'BetEngine must not reference oddsApi or /api/odds.')
assert(serviceText.includes("'/api/odds'") || serviceText.includes('"/api/odds"'), 'oddsApi.js must request /api/odds.')
assert(!/src\/services\/oddsApi|src\\services\\oddsApi/.test(apiText), 'Odds API endpoint must not import frontend odds service.')

const packageStatus = git(['status', '--short', '--', packagePath])
assert(!packageStatus, 'package.json must not be modified for odds API base.')

const packageJson = JSON.parse(packageText)
const dependencies = {
  ...(packageJson.dependencies ?? {}),
  ...(packageJson.devDependencies ?? {}),
}

assert(!Object.prototype.hasOwnProperty.call(dependencies, 'axios'), 'package.json must not add axios.')
assert(!Object.prototype.hasOwnProperty.call(dependencies, 'openai'), 'package.json must not add openai.')

const { createDisabledOddsSnapshot, default: handler } = await import('../api/odds.js')
const { createFallbackOddsSnapshot, getOddsSnapshot } = await import('../src/services/oddsApi.js')

function assertOddsShape(snapshot, label) {
  for (const field of [
    'ok',
    'disabled',
    'provider',
    'dataSource',
    'updatedAt',
    'fallbackReason',
    'markets',
    'meta',
  ]) {
    assert(Object.prototype.hasOwnProperty.call(snapshot, field), `${label} must include ${field}.`)
  }

  assert(snapshot.ok === false, `${label} must remain disabled ok=false.`)
  assert(snapshot.disabled === true, `${label} must remain disabled=true.`)
  assert(snapshot.provider === 'none', `${label} must use provider=none.`)
  assert(snapshot.dataSource === 'disabled', `${label} must use dataSource=disabled.`)
  assert(snapshot.fallbackReason === 'ODDS_API_DISABLED', `${label} must use ODDS_API_DISABLED.`)
  assert(Array.isArray(snapshot.markets), `${label} markets must be an array.`)
  assert(snapshot.markets.length === 0, `${label} markets must be empty while disabled.`)
  assert(snapshot.meta && typeof snapshot.meta === 'object', `${label} meta must be an object.`)
}

function createMockResponse() {
  return {
    headers: {},
    statusCode: null,
    body: null,
    setHeader(key, value) {
      this.headers[key] = value
    },
    status(statusCode) {
      this.statusCode = statusCode
      return this
    },
    json(body) {
      this.body = body
      return this
    },
  }
}

const disabledSnapshot = createDisabledOddsSnapshot()
assertOddsShape(disabledSnapshot, 'createDisabledOddsSnapshot')
assert(disabledSnapshot.meta.message === 'Odds API is not enabled.', 'Disabled snapshot must explain the disabled odds API.')

const fallbackSnapshot = createFallbackOddsSnapshot()
assertOddsShape(fallbackSnapshot, 'createFallbackOddsSnapshot')

const getResponse = createMockResponse()
await handler({ method: 'GET' }, getResponse)
assert(getResponse.statusCode === 200, 'GET /api/odds must return 200.')
assertOddsShape(getResponse.body, 'GET /api/odds response')

const postResponse = createMockResponse()
await handler({ method: 'POST' }, postResponse)
assert(postResponse.statusCode === 405, 'Non-GET /api/odds must return 405.')
assert(postResponse.headers.Allow === 'GET', 'Non-GET /api/odds must expose Allow: GET.')
assertOddsShape(postResponse.body, 'Non-GET /api/odds response')

const serviceSnapshot = await getOddsSnapshot({
  fetchImpl: async () => ({
    ok: true,
    json: async () => disabledSnapshot,
  }),
})
assertOddsShape(serviceSnapshot, 'getOddsSnapshot success response')

const failedServiceSnapshot = await getOddsSnapshot({
  fetchImpl: async () => {
    throw new Error('network failed')
  },
})
assert(failedServiceSnapshot.fallbackReason === 'ODDS_API_FAILED', 'getOddsSnapshot must fallback on request failure.')
assert(failedServiceSnapshot.ok === false, 'getOddsSnapshot fallback must keep ok=false.')
assert(failedServiceSnapshot.disabled === true, 'getOddsSnapshot fallback must keep disabled=true.')
assert(Array.isArray(failedServiceSnapshot.markets), 'getOddsSnapshot fallback markets must be an array.')

console.log('Odds API checks passed.')
