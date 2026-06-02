import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'

const apiPath = 'api/odds.js'
const servicePath = 'src/services/oddsApi.js'
const mockOddsPath = 'src/data/mockOddsSnapshot.js'
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
assert(existsSync(mockOddsPath), `${mockOddsPath} must exist.`)

const apiText = readText(apiPath)
const serviceText = readText(servicePath)
const mockOddsText = readText(mockOddsPath)
const appText = readText(appPath)
const betEngineText = readText(betEnginePath)
const packageText = readText(packagePath)

assert(!/\bfetch\s*\(/.test(apiText), 'Odds API endpoint must not fetch an external supplier.')
assert(!/axios|football-data|rapidapi|the-odds|oddsapi|api-football/i.test(apiText), 'Odds API endpoint must not mention an external supplier.')
assert(!/process\.env|import\.meta\.env|API_KEY|TOKEN|SECRET|X-Auth-Token/i.test(apiText), 'Odds API endpoint must not read provider credentials.')
assert(!new RegExp(`${databaseUrlToken}|@neondatabase|SNAPSHOT_WRITE|internal/snapshots|analysis_snapshots`, 'i').test(apiText), 'Odds API endpoint must not touch database or snapshot writes.')
assert(!/openai|\bgpt\b/i.test(apiText), 'Odds API endpoint must not mention OpenAI or GPT.')
assert(apiText.includes('../src/data/mockOddsSnapshot.js'), 'Odds API endpoint must read the local mock odds snapshot.')
assert(!/import\(/.test(apiText), 'Odds API endpoint must not dynamically import provider clients.')
for (const match of apiText.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
  assert(match[1] === '../src/data/mockOddsSnapshot.js', 'Odds API endpoint may only import the local mock odds snapshot.')
}

assert(!/oddsApi|getOddsSnapshot|api\/odds/.test(appText), 'App.jsx must not reference oddsApi or /api/odds.')
assert(!/oddsApi|getOddsSnapshot|api\/odds/.test(betEngineText), 'BetEngine must not reference oddsApi or /api/odds.')
assert(serviceText.includes("'/api/odds'") || serviceText.includes('"/api/odds"'), 'oddsApi.js must request /api/odds.')
assert(!/src\/services\/oddsApi|src\\services\\oddsApi/.test(apiText), 'Odds API endpoint must not import frontend odds service.')
assert(!/openai|\bgpt\b/i.test(mockOddsText), 'Mock odds snapshot must not mention OpenAI or GPT.')

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
const { createMockOddsSnapshot } = await import('../src/data/mockOddsSnapshot.js')

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

  assert(Array.isArray(snapshot.markets), `${label} markets must be an array.`)
  assert(snapshot.meta && typeof snapshot.meta === 'object', `${label} meta must be an object.`)
}

function assertDisabledShape(snapshot, label) {
  assertOddsShape(snapshot, label)
  assert(snapshot.ok === false, `${label} must remain ok=false.`)
  assert(snapshot.disabled === true, `${label} must remain disabled=true.`)
  assert(snapshot.fallbackReason === 'ODDS_API_DISABLED', `${label} must keep ODDS_API_DISABLED.`)
  assert(['mock', 'none'].includes(snapshot.provider), `${label} provider must be mock or none.`)
  assert(['mock', 'disabled'].includes(snapshot.dataSource), `${label} dataSource must be mock or disabled.`)
}

function assertServiceFallbackShape(snapshot, label) {
  assertDisabledShape(snapshot, label)
  assert(snapshot.provider === 'none', `${label} must use provider=none.`)
  assert(snapshot.dataSource === 'disabled', `${label} must use dataSource=disabled.`)
}

const marketStatuses = new Set(['available', 'missing', 'stale'])
const confidenceValues = new Set(['high', 'medium', 'low'])
const favoriteTrendValues = new Set(['stable', 'shortening', 'drifting', 'unknown'])
const totalGoalsTrendValues = new Set(['stable', 'over-heating', 'under-support', 'unknown'])
const positiveRiskPattern = /guarantee|guaranteed|lock|sure|profit|boost|bonus|positive|must.?bet|稳胆|必中|必胜|稳赚|重仓|加分|抬高|提高|正向|盈利/i

function assertMarketShape(market, label) {
  for (const field of [
    'matchKey',
    'homeTeam',
    'awayTeam',
    'marketStatus',
    'oddsConfidence',
    'bookmakers',
    'mainMarkets',
    'handicap',
    'totalGoals',
    'marketMovement',
    'riskFlags',
    'reviewPoints',
    'fallbackReason',
  ]) {
    assert(Object.prototype.hasOwnProperty.call(market, field), `${label} must include ${field}.`)
  }

  assert(typeof market.matchKey === 'string' && market.matchKey.includes('__'), `${label} must include a stable matchKey.`)
  assert(typeof market.homeTeam === 'string' && market.homeTeam, `${label} must include homeTeam.`)
  assert(typeof market.awayTeam === 'string' && market.awayTeam, `${label} must include awayTeam.`)
  assert(marketStatuses.has(market.marketStatus), `${label} marketStatus must use the allowed enum.`)
  assert(confidenceValues.has(market.oddsConfidence), `${label} oddsConfidence must use the allowed enum.`)
  assert(Array.isArray(market.bookmakers), `${label} bookmakers must be an array.`)
  assert(market.bookmakers.length === 0, `${label} must not include real bookmaker data.`)
  assert(['homeWin', 'draw', 'awayWin'].every((field) => Object.prototype.hasOwnProperty.call(market.mainMarkets, field)), `${label} mainMarkets must include 1X2 fields.`)
  assert(['line', 'home', 'away'].every((field) => Object.prototype.hasOwnProperty.call(market.handicap, field)), `${label} handicap must include line/home/away.`)
  assert(['line', 'over', 'under'].every((field) => Object.prototype.hasOwnProperty.call(market.totalGoals, field)), `${label} totalGoals must include line/over/under.`)
  assert(favoriteTrendValues.has(market.marketMovement.favoriteTrend), `${label} favoriteTrend must use the allowed enum.`)
  assert(totalGoalsTrendValues.has(market.marketMovement.totalGoalsTrend), `${label} totalGoalsTrend must use the allowed enum.`)
  assert(Array.isArray(market.riskFlags), `${label} riskFlags must be an array.`)
  assert(Array.isArray(market.reviewPoints), `${label} reviewPoints must be an array.`)

  for (const riskFlag of market.riskFlags) {
    assert(typeof riskFlag === 'string', `${label} riskFlags must be strings.`)
    assert(!positiveRiskPattern.test(riskFlag), `${label} riskFlags must not contain positive scoring semantics.`)
  }
}

function assertMockOddsSnapshot(snapshot, label) {
  for (const field of ['provider', 'dataSource', 'updatedAt', 'markets', 'meta']) {
    assert(Object.prototype.hasOwnProperty.call(snapshot, field), `${label} must include ${field}.`)
  }

  assert(snapshot.provider === 'mock', `${label} must use provider=mock.`)
  assert(snapshot.dataSource === 'mock', `${label} must use dataSource=mock.`)
  assert(Array.isArray(snapshot.markets), `${label} markets must be an array.`)
  assert(snapshot.markets.length > 0, `${label} must include at least one mock market.`)
  assert(snapshot.meta?.schemaVersion === 'odds-snapshot-v1', `${label} must use odds-snapshot-v1.`)
  snapshot.markets.forEach((market, index) => assertMarketShape(market, `${label} market ${index}`))
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

const mockSnapshot = createMockOddsSnapshot()
assertMockOddsSnapshot(mockSnapshot, 'createMockOddsSnapshot')

const disabledSnapshot = createDisabledOddsSnapshot()
assertDisabledShape(disabledSnapshot, 'createDisabledOddsSnapshot')
assert(disabledSnapshot.provider === 'mock', 'Disabled API snapshot must use mock provider while real odds are disabled.')
assert(disabledSnapshot.dataSource === 'mock', 'Disabled API snapshot must use mock dataSource while real odds are disabled.')
assert(disabledSnapshot.markets.length === mockSnapshot.markets.length, 'Disabled API snapshot must expose the mock fallback market structure.')
assert(disabledSnapshot.meta.schemaVersion === 'odds-snapshot-v1', 'Disabled API snapshot must expose the mock odds schema version.')
assert(disabledSnapshot.meta.message === 'Odds API is not enabled. Mock fallback structure returned.', 'Disabled snapshot must explain the disabled mock fallback.')

const fallbackSnapshot = createFallbackOddsSnapshot()
assertServiceFallbackShape(fallbackSnapshot, 'createFallbackOddsSnapshot')

const getResponse = createMockResponse()
await handler({ method: 'GET' }, getResponse)
assert(getResponse.statusCode === 200, 'GET /api/odds must return 200.')
assertDisabledShape(getResponse.body, 'GET /api/odds response')
assert(getResponse.body.markets.length === mockSnapshot.markets.length, 'GET /api/odds must return mock fallback markets.')

const postResponse = createMockResponse()
await handler({ method: 'POST' }, postResponse)
assert(postResponse.statusCode === 405, 'Non-GET /api/odds must return 405.')
assert(postResponse.headers.Allow === 'GET', 'Non-GET /api/odds must expose Allow: GET.')
assertDisabledShape(postResponse.body, 'Non-GET /api/odds response')

const serviceSnapshot = await getOddsSnapshot({
  fetchImpl: async () => ({
    ok: true,
    json: async () => disabledSnapshot,
  }),
})
assertDisabledShape(serviceSnapshot, 'getOddsSnapshot success response')
serviceSnapshot.markets.forEach((market, index) => assertMarketShape(market, `getOddsSnapshot market ${index}`))

const missingMarketsSnapshot = await getOddsSnapshot({
  fetchImpl: async () => ({
    ok: true,
    json: async () => ({
      ...disabledSnapshot,
      markets: undefined,
    }),
  }),
})
assertDisabledShape(missingMarketsSnapshot, 'getOddsSnapshot missing markets response')
assert(missingMarketsSnapshot.markets.length === 0, 'getOddsSnapshot must tolerate missing markets.')

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
