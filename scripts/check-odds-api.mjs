import { execFileSync } from 'node:child_process'
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from 'node:fs'
import { join } from 'node:path'

const apiPath = 'api/odds.js'
const adapterPath = 'api/providers/theOddsApiAdapter.js'
const servicePath = 'src/services/oddsApi.js'
const mockOddsPath = 'src/data/mockOddsSnapshot.js'
const appPath = 'src/App.jsx'
const betEnginePath = 'src/services/betEngine.js'
const packagePath = 'package.json'
const databaseUrlToken = 'DATABASE_' + 'URL'

delete process.env.ODDS_API_ENABLED
delete process.env.ODDS_PROVIDER
delete process.env.THE_ODDS_API_KEY

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function readText(path) {
  return readFileSync(path, 'utf8')
}

function readSourceTree(path) {
  const entries = []

  for (const name of readdirSync(path)) {
    const entryPath = join(path, name)
    if (statSync(entryPath).isDirectory()) {
      entries.push(...readSourceTree(entryPath))
    } else {
      entries.push([entryPath, readText(entryPath)])
    }
  }

  return entries
}

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim()
}

for (const path of [
  apiPath,
  adapterPath,
  servicePath,
  mockOddsPath,
  appPath,
  betEnginePath,
  packagePath,
]) {
  assert(existsSync(path), `${path} must exist.`)
}

const apiText = readText(apiPath)
const adapterText = readText(adapterPath)
const serviceText = readText(servicePath)
const mockOddsText = readText(mockOddsPath)
const appText = readText(appPath)
const betEngineText = readText(betEnginePath)
const packageText = readText(packagePath)
const sourceFiles = readSourceTree('src')

assert(apiText.includes('../src/data/mockOddsSnapshot.js'), 'Odds API endpoint must retain the local mock fallback.')
assert(apiText.includes('./providers/theOddsApiAdapter.js'), 'Odds API endpoint must import the server-side provider adapter.')
assert(apiText.includes('process.env.ODDS_API_ENABLED'), 'Odds API endpoint must read ODDS_API_ENABLED.')
assert(apiText.includes('process.env.ODDS_PROVIDER'), 'Odds API endpoint must read ODDS_PROVIDER.')
assert(apiText.includes('process.env.THE_ODDS_API_KEY'), 'Odds API endpoint must read THE_ODDS_API_KEY.')
assert(/ODDS_API_ENABLED\s*===\s*['"]true['"]/.test(apiText), 'Odds API endpoint must require an explicit enabled flag.')
assert(/ODDS_PROVIDER\s*===\s*['"]the-odds-api['"]/.test(apiText), 'Odds API endpoint must require the-odds-api provider.')
assert(apiText.includes('createProviderFallback'), 'Odds API endpoint must normalize provider failures to mock fallback.')
assert(adapterText.includes('https://api.the-odds-api.com/v4'), 'Provider adapter must use the expected API origin.')
assert(adapterText.includes('AbortController'), 'Provider adapter must use an abortable timeout.')
assert(adapterText.includes('setTimeout'), 'Provider adapter must configure a timeout.')
assert(adapterText.includes('ODDS_API_UNAUTHORIZED'), 'Provider adapter must normalize 401.')
assert(adapterText.includes('ODDS_API_FORBIDDEN'), 'Provider adapter must normalize 403.')
assert(adapterText.includes('ODDS_API_QUOTA_EXCEEDED'), 'Provider adapter must normalize 429.')
assert(adapterText.includes('ODDS_API_UPSTREAM_ERROR'), 'Provider adapter must normalize upstream failures.')
assert(!/process\.env|import\.meta\.env/.test(adapterText), 'Provider adapter must receive credentials from the API endpoint.')
assert(!/src\/services\/oddsApi|src\\services\\oddsApi/.test(apiText), 'Odds API endpoint must not import frontend odds service.')
assert(!/openai|\bgpt\b/i.test(apiText), 'Odds API endpoint must not mention OpenAI or GPT.')
assert(!/openai|\bgpt\b/i.test(adapterText), 'Provider adapter must not mention OpenAI or GPT.')
assert(!new RegExp(`${databaseUrlToken}|@neondatabase|SNAPSHOT_WRITE|internal/snapshots|analysis_snapshots`, 'i').test(apiText), 'Odds API endpoint must not touch database or snapshot writes.')
assert(!new RegExp(`${databaseUrlToken}|@neondatabase|SNAPSHOT_WRITE|internal/snapshots|analysis_snapshots`, 'i').test(adapterText), 'Provider adapter must not touch database or snapshot writes.')

for (const [path, text] of sourceFiles) {
  assert(!text.includes('THE_ODDS_API_KEY'), `${path} must not reference THE_ODDS_API_KEY.`)
  assert(!text.includes('ODDS_API_ENABLED'), `${path} must not reference ODDS_API_ENABLED.`)
  assert(!text.includes('ODDS_PROVIDER'), `${path} must not reference ODDS_PROVIDER.`)
  assert(!text.includes('api.the-odds-api.com'), `${path} must not reference the supplier origin.`)
  assert(!text.includes('theOddsApiAdapter'), `${path} must not import the server-side adapter.`)
}

assert(!/oddsApi|getOddsSnapshot|api\/odds/.test(appText), 'App.jsx must not reference oddsApi or /api/odds.')
assert(!/oddsApi|getOddsSnapshot|api\/odds/.test(betEngineText), 'BetEngine must not reference oddsApi or /api/odds.')
assert(!/theOddsApiAdapter/.test(appText), 'App.jsx must not import the provider adapter.')
assert(!/theOddsApiAdapter/.test(betEngineText), 'BetEngine must not import the provider adapter.')
assert(serviceText.includes("'/api/odds'") || serviceText.includes('"/api/odds"'), 'oddsApi.js must request /api/odds.')
assert(!/openai|\bgpt\b/i.test(mockOddsText), 'Mock odds snapshot must not mention OpenAI or GPT.')

const packageStatus = git(['status', '--short', '--', packagePath])
assert(!packageStatus, 'package.json must not be modified for odds API integration.')

const packageJson = JSON.parse(packageText)
const dependencies = {
  ...(packageJson.dependencies ?? {}),
  ...(packageJson.devDependencies ?? {}),
}

assert(!Object.prototype.hasOwnProperty.call(dependencies, 'axios'), 'package.json must not add axios.')
assert(!Object.prototype.hasOwnProperty.call(dependencies, 'openai'), 'package.json must not add openai.')

const { createDisabledOddsSnapshot, default: handler } = await import('../api/odds.js')
const {
  TheOddsApiError,
  fetchTheOddsApiSnapshot,
} = await import('../api/providers/theOddsApiAdapter.js')
const { createFallbackOddsSnapshot, getOddsSnapshot } = await import('../src/services/oddsApi.js')
const { createMockOddsSnapshot } = await import('../src/data/mockOddsSnapshot.js')

function assertMetaShape(meta, label) {
  for (const field of ['status', 'error', 'source']) {
    assert(Object.prototype.hasOwnProperty.call(meta, field), `${label} must include ${field}.`)
  }

  assert(typeof meta.status === 'string' && meta.status, `${label} status must be a string.`)
  assert(meta.error === null || typeof meta.error === 'string', `${label} error must be null or a string.`)
  assert(typeof meta.source === 'string' && meta.source, `${label} source must be a string.`)
}

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
  assertMetaShape(snapshot.meta, `${label} meta`)
}

function assertDisabledShape(snapshot, label, fallbackReason = 'ODDS_API_DISABLED') {
  assertOddsShape(snapshot, label)
  assert(snapshot.ok === false, `${label} must remain ok=false.`)
  assert(snapshot.disabled === true, `${label} must remain disabled=true.`)
  assert(snapshot.fallbackReason === fallbackReason, `${label} must keep ${fallbackReason}.`)
  assert(['mock', 'none', 'the-odds-api'].includes(snapshot.provider), `${label} provider must use an allowed fallback value.`)
  assert(['mock', 'disabled'].includes(snapshot.dataSource), `${label} dataSource must be mock or disabled.`)
}

function assertServiceFallbackShape(snapshot, label) {
  assertDisabledShape(snapshot, label)
  assert(snapshot.provider === 'none', `${label} must use provider=none.`)
  assert(snapshot.dataSource === 'disabled', `${label} must use dataSource=disabled.`)
}

const marketStatuses = new Set(['available', 'missing', 'stale'])
const standardStatuses = new Set(['available', 'mock', 'disabled', 'fallback'])
const confidenceValues = new Set(['high', 'medium', 'low'])
const favoriteSideValues = new Set(['home', 'away', 'draw', 'none', 'unknown'])
const favoriteTrendValues = new Set(['stable', 'shortening', 'drifting', 'unknown'])
const totalGoalsTrendValues = new Set(['stable', 'over-heating', 'under-support', 'unknown'])
const positiveRiskPattern = /guarantee|guaranteed|lock|sure|profit|boost|bonus|positive|must.?bet|稳胆|必中|必胜|稳赚|重仓|加分|抬高|提高|正向|盈利/i

function assertStandardMarketsShape(markets, label) {
  assert(markets && typeof markets === 'object', `${label} markets must be an object.`)
  assert(markets.matchWinner && typeof markets.matchWinner === 'object', `${label} markets.matchWinner must exist.`)
  assert(markets.asianHandicap && typeof markets.asianHandicap === 'object', `${label} markets.asianHandicap must exist.`)
  assert(markets.overUnder && typeof markets.overUnder === 'object', `${label} markets.overUnder must exist.`)
  assert(['home', 'draw', 'away'].every((field) => Object.prototype.hasOwnProperty.call(markets.matchWinner, field)), `${label} markets.matchWinner must include home/draw/away.`)
  assert(['line', 'homeOdds', 'awayOdds'].every((field) => Object.prototype.hasOwnProperty.call(markets.asianHandicap, field)), `${label} markets.asianHandicap must include line/homeOdds/awayOdds.`)
  assert(['line', 'overOdds', 'underOdds'].every((field) => Object.prototype.hasOwnProperty.call(markets.overUnder, field)), `${label} markets.overUnder must include line/overOdds/underOdds.`)
}

function assertMarketShape(market, label, options = {}) {
  for (const field of [
    'status',
    'matchKey',
    'homeTeam',
    'awayTeam',
    'marketStatus',
    'marketTone',
    'favoriteSide',
    'oddsConfidence',
    'bookmakers',
    'mainMarkets',
    'handicap',
    'totalGoals',
    'markets',
    'marketMovement',
    'valueFlags',
    'riskFlags',
    'reviewPoints',
    'riskNotes',
    'fallbackReason',
    'rawAvailable',
  ]) {
    assert(Object.prototype.hasOwnProperty.call(market, field), `${label} must include ${field}.`)
  }

  assert(standardStatuses.has(market.status), `${label} status must use the allowed enum.`)
  assert(typeof market.matchKey === 'string' && market.matchKey.includes('__'), `${label} must include a stable matchKey.`)
  assert(typeof market.homeTeam === 'string' && market.homeTeam, `${label} must include homeTeam.`)
  assert(typeof market.awayTeam === 'string' && market.awayTeam, `${label} must include awayTeam.`)
  assert(marketStatuses.has(market.marketStatus), `${label} marketStatus must use the allowed enum.`)
  assert(typeof market.marketTone === 'string' && market.marketTone, `${label} marketTone must be a string.`)
  assert(favoriteSideValues.has(market.favoriteSide), `${label} favoriteSide must use the allowed enum.`)
  assert(confidenceValues.has(market.oddsConfidence), `${label} oddsConfidence must use the allowed enum.`)
  assert(Array.isArray(market.bookmakers), `${label} bookmakers must be an array.`)
  if (options.requireEmptyBookmakers) {
    assert(market.bookmakers.length === 0, `${label} must not include real bookmaker data.`)
  }
  assert(['homeWin', 'draw', 'awayWin'].every((field) => Object.prototype.hasOwnProperty.call(market.mainMarkets, field)), `${label} mainMarkets must include 1X2 fields.`)
  assert(['line', 'home', 'away'].every((field) => Object.prototype.hasOwnProperty.call(market.handicap, field)), `${label} handicap must include line/home/away.`)
  assert(['line', 'over', 'under'].every((field) => Object.prototype.hasOwnProperty.call(market.totalGoals, field)), `${label} totalGoals must include line/over/under.`)
  assertStandardMarketsShape(market.markets, label)
  assert(favoriteTrendValues.has(market.marketMovement.favoriteTrend), `${label} favoriteTrend must use the allowed enum.`)
  assert(totalGoalsTrendValues.has(market.marketMovement.totalGoalsTrend), `${label} totalGoalsTrend must use the allowed enum.`)
  assert(Array.isArray(market.valueFlags), `${label} valueFlags must be an array.`)
  assert(Array.isArray(market.riskFlags), `${label} riskFlags must be an array.`)
  assert(Array.isArray(market.reviewPoints), `${label} reviewPoints must be an array.`)
  assert(Array.isArray(market.riskNotes), `${label} riskNotes must be an array.`)
  assert(typeof market.rawAvailable === 'boolean', `${label} rawAvailable must be a boolean.`)

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
  assertMetaShape(snapshot.meta, `${label} meta`)
  snapshot.markets.forEach((market, index) =>
    assertMarketShape(market, `${label} market ${index}`, {
      requireEmptyBookmakers: true,
    }),
  )
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

function createSupplierResponse(options = {}) {
  const headerEntries = Object.entries(options.headers ?? {}).map(([key, value]) => [
    key.toLowerCase(),
    String(value),
  ])
  const headers = new Map(headerEntries)

  return {
    ok: options.ok ?? true,
    status: options.status ?? 200,
    headers: {
      get(name) {
        return headers.get(String(name).toLowerCase()) ?? null
      },
    },
    async json() {
      if (options.jsonError) throw new Error('invalid json')
      return options.payload
    },
  }
}

const supplierPayload = [
  {
    id: 'supplier-event-id-must-not-leak',
    sport_key: 'soccer_test',
    commence_time: '2026-06-15T18:00:00Z',
    home_team: 'France',
    away_team: 'Senegal',
    raw_private_field: 'must-not-leak',
    bookmakers: [
      {
        key: 'book-a',
        title: 'Book A',
        last_update: '2026-06-07T10:00:00Z',
        markets: [
          {
            key: 'h2h',
            outcomes: [
              { name: 'France', price: 1.35 },
              { name: 'Draw', price: 4.2 },
              { name: 'Senegal', price: 8.1 },
            ],
          },
          {
            key: 'spreads',
            outcomes: [
              { name: 'France', price: 1.91, point: -1.5 },
              { name: 'Senegal', price: 1.89, point: 1.5 },
            ],
          },
          {
            key: 'totals',
            outcomes: [
              { name: 'Over', price: 1.65, point: 3.5 },
              { name: 'Under', price: 2.15, point: 3.5 },
            ],
          },
        ],
      },
      {
        key: 'book-b',
        title: 'Book B',
        last_update: '2026-06-07T10:05:00Z',
        markets: [
          {
            key: 'h2h',
            outcomes: [
              { name: 'France', price: 1.85 },
              { name: 'Draw', price: 3.7 },
              { name: 'Senegal', price: 5.9 },
            ],
          },
        ],
      },
    ],
  },
]

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

const originalFetch = globalThis.fetch
let supplierCallCount = 0

try {
  globalThis.fetch = async () => {
    supplierCallCount += 1
    throw new Error('Default fallback must not call the supplier.')
  }

  const getResponse = createMockResponse()
  await handler({ method: 'GET' }, getResponse)
  assert(getResponse.statusCode === 200, 'GET /api/odds must return 200.')
  assertDisabledShape(getResponse.body, 'GET /api/odds default response')
  assert(getResponse.body.markets.length === mockSnapshot.markets.length, 'GET /api/odds must return mock fallback markets.')
  assert(supplierCallCount === 0, 'Default GET /api/odds must not call the supplier.')

  const postResponse = createMockResponse()
  await handler({ method: 'POST' }, postResponse)
  assert(postResponse.statusCode === 405, 'Non-GET /api/odds must return 405.')
  assert(postResponse.headers.Allow === 'GET', 'Non-GET /api/odds must expose Allow: GET.')
  assertDisabledShape(postResponse.body, 'Non-GET /api/odds response')
  assert(supplierCallCount === 0, 'Non-GET /api/odds must not call the supplier.')

  process.env.ODDS_API_ENABLED = 'true'
  process.env.ODDS_PROVIDER = 'the-odds-api'

  const missingKeyResponse = createMockResponse()
  await handler({ method: 'GET' }, missingKeyResponse)
  assertDisabledShape(
    missingKeyResponse.body,
    'GET /api/odds missing key response',
    'ODDS_API_KEY_MISSING',
  )
  assert(missingKeyResponse.body.provider === 'the-odds-api', 'Missing key fallback must identify the configured provider.')
  assert(missingKeyResponse.body.meta.error === 'ODDS_API_KEY_MISSING', 'Missing key fallback must expose only a safe error code.')
  assert(supplierCallCount === 0, 'Missing key fallback must not call the supplier.')

  process.env.THE_ODDS_API_KEY = 'test-key-not-real'
  globalThis.fetch = async (url) => {
    supplierCallCount += 1
    assert(url.searchParams.get('apiKey') === 'test-key-not-real', 'Supplier request must use the server-provided key.')
    return createSupplierResponse({
      payload: supplierPayload,
      headers: {
        'x-requests-remaining': '498',
        'x-requests-used': '2',
        'x-requests-last': '1',
      },
    })
  }

  const enabledResponse = createMockResponse()
  await handler({ method: 'GET' }, enabledResponse)
  assert(enabledResponse.statusCode === 200, 'Enabled GET /api/odds must return 200.')
  assertOddsShape(enabledResponse.body, 'Enabled GET /api/odds response')
  assert(enabledResponse.body.ok === true, 'Enabled provider response must set ok=true.')
  assert(enabledResponse.body.disabled === false, 'Enabled provider response must set disabled=false.')
  assert(enabledResponse.body.provider === 'the-odds-api', 'Enabled provider response must identify the provider.')
  assert(enabledResponse.body.dataSource === 'remote', 'Enabled provider response must use dataSource=remote.')
  assert(
    enabledResponse.body.markets.length === mockSnapshot.markets.length,
    'Enabled provider response must retain unmatched mock fallback markets.',
  )
  assertMarketShape(enabledResponse.body.markets[0], 'Enabled provider market')
  assert(
    enabledResponse.body.markets.some(
      (market) =>
        market.matchKey === 'Portugal__Congo DR' &&
        market.rawAvailable === false,
    ),
    'Enabled provider response must keep mock fallback for unmatched matches.',
  )

  globalThis.fetch = async () =>
    createSupplierResponse({
      ok: false,
      status: 429,
      headers: {
        'x-requests-remaining': '0',
        'x-requests-used': '500',
      },
    })

  const quotaResponse = createMockResponse()
  await handler({ method: 'GET' }, quotaResponse)
  assertDisabledShape(
    quotaResponse.body,
    'GET /api/odds quota fallback',
    'ODDS_API_QUOTA_EXCEEDED',
  )
  assert(quotaResponse.body.meta.error === 'ODDS_API_QUOTA_EXCEEDED', 'Quota fallback must expose a safe normalized error.')
  assert(quotaResponse.body.meta.usage.remaining === '0', 'Quota fallback must retain safe usage metadata.')
} finally {
  delete process.env.ODDS_API_ENABLED
  delete process.env.ODDS_PROVIDER
  delete process.env.THE_ODDS_API_KEY
  globalThis.fetch = originalFetch
}

let requestedUrl = null
const adapterSnapshot = await fetchTheOddsApiSnapshot({
  apiKey: 'test-key-not-real',
  sportKey: 'soccer_test',
  timeoutMs: 100,
  fetchImpl: async (url) => {
    requestedUrl = url
    return createSupplierResponse({
      payload: supplierPayload,
      headers: {
        'x-requests-remaining': '498',
        'x-requests-used': '2',
        'x-requests-last': '1',
      },
    })
  },
})

assert(requestedUrl instanceof URL, 'Provider adapter must build a URL object.')
assert(requestedUrl.origin === 'https://api.the-odds-api.com', 'Provider adapter must use the expected origin.')
assert(requestedUrl.pathname === '/v4/sports/soccer_test/odds', 'Provider adapter must use the sport odds endpoint.')
assert(requestedUrl.searchParams.get('regions') === 'us,uk,eu', 'Provider adapter must set default regions.')
assert(requestedUrl.searchParams.get('markets') === 'h2h,spreads,totals', 'Provider adapter must set default markets.')
assert(requestedUrl.searchParams.get('oddsFormat') === 'decimal', 'Provider adapter must request decimal odds.')
assert(requestedUrl.searchParams.get('dateFormat') === 'iso', 'Provider adapter must request ISO dates.')
assertOddsShape(adapterSnapshot, 'Provider adapter snapshot')
assert(adapterSnapshot.ok === true, 'Provider adapter snapshot must set ok=true.')
assert(adapterSnapshot.disabled === false, 'Provider adapter snapshot must set disabled=false.')
assert(adapterSnapshot.meta.usage.remaining === '498', 'Provider adapter must retain safe usage metadata.')
assert(adapterSnapshot.markets.length === 1, 'Provider adapter must normalize one event.')

const remoteMarket = adapterSnapshot.markets[0]
assertMarketShape(remoteMarket, 'Provider adapter market')
assert(remoteMarket.matchKey === 'France__Senegal', 'Provider adapter must build an exact team matchKey.')
assert(remoteMarket.sourceKickoffAt === '2026-06-15T18:00:00Z', 'Provider adapter must retain the supplier kickoff candidate.')
assert(remoteMarket.sourceUpdatedAt === '2026-06-07T10:05:00.000Z', 'Provider adapter must retain the latest bookmaker update.')
assert(remoteMarket.markets.matchWinner.home === 1.35, 'h2h home price must map to matchWinner.home.')
assert(remoteMarket.markets.matchWinner.draw === 4.2, 'h2h draw price must map to matchWinner.draw.')
assert(remoteMarket.markets.matchWinner.away === 8.1, 'h2h away price must map to matchWinner.away.')
assert(remoteMarket.markets.asianHandicap.line === -1.5, 'spreads point must map to asianHandicap.line.')
assert(remoteMarket.markets.asianHandicap.homeOdds === 1.91, 'spreads home price must map to asianHandicap.homeOdds.')
assert(remoteMarket.markets.overUnder.line === 3.5, 'totals point must map to overUnder.line.')
assert(remoteMarket.markets.overUnder.overOdds === 1.65, 'totals over price must map to overUnder.overOdds.')
assert(remoteMarket.mainMarkets.homeWin === 1.35, 'Legacy mainMarkets must remain populated.')
assert(remoteMarket.handicap.line === -1.5, 'Legacy handicap must remain populated.')
assert(remoteMarket.totalGoals.line === 3.5, 'Legacy totalGoals must remain populated.')
assert(remoteMarket.favoriteSide === 'home', 'Provider adapter must derive favoriteSide.')
assert(remoteMarket.marketTone === 'odds-conflict', 'Provider adapter must derive marketTone.')
assert(remoteMarket.oddsConfidence === 'medium', 'Provider adapter must derive oddsConfidence.')
assert(remoteMarket.valueFlags.includes('favorite_too_hot'), 'Provider adapter must flag a hot favorite.')
assert(remoteMarket.valueFlags.includes('odds_conflict'), 'Provider adapter must flag bookmaker conflicts.')
assert(remoteMarket.valueFlags.includes('over_line_hot'), 'Provider adapter must flag a hot over line.')
assert(remoteMarket.riskNotes.length === 3, 'Provider adapter must provide controlled risk notes.')
assert(remoteMarket.rawAvailable === true, 'Provider adapter must mark normalized supplier data as available.')
assert(!JSON.stringify(adapterSnapshot).includes('supplier-event-id-must-not-leak'), 'Provider adapter must not expose the supplier event id.')
assert(!JSON.stringify(adapterSnapshot).includes('must-not-leak'), 'Provider adapter must not expose raw supplier fields.')

async function assertAdapterError(responseOptions, expectedCode) {
  let caught = null

  try {
    await fetchTheOddsApiSnapshot({
      apiKey: 'test-key-not-real',
      timeoutMs: 100,
      fetchImpl: async () => createSupplierResponse(responseOptions),
    })
  } catch (error) {
    caught = error
  }

  assert(caught instanceof TheOddsApiError, `${expectedCode} must use TheOddsApiError.`)
  assert(caught.code === expectedCode, `${expectedCode} must be normalized.`)
  assert(!caught.message.includes('test-key-not-real'), `${expectedCode} must not expose the API key.`)
}

await assertAdapterError({ ok: false, status: 401 }, 'ODDS_API_UNAUTHORIZED')
await assertAdapterError({ ok: false, status: 403 }, 'ODDS_API_FORBIDDEN')
await assertAdapterError({ ok: false, status: 429 }, 'ODDS_API_QUOTA_EXCEEDED')
await assertAdapterError({ ok: false, status: 500 }, 'ODDS_API_UPSTREAM_ERROR')
await assertAdapterError({ payload: { events: [] } }, 'ODDS_API_INVALID_RESPONSE')
await assertAdapterError({ payload: null, jsonError: true }, 'ODDS_API_INVALID_RESPONSE')

let timeoutError = null
try {
  await fetchTheOddsApiSnapshot({
    apiKey: 'test-key-not-real',
    timeoutMs: 5,
    fetchImpl: async (_url, options) =>
      new Promise((resolve, reject) => {
        options.signal.addEventListener(
          'abort',
          () => {
            const error = new Error('aborted')
            error.name = 'AbortError'
            reject(error)
          },
          { once: true },
        )
      }),
  })
} catch (error) {
  timeoutError = error
}
assert(timeoutError instanceof TheOddsApiError, 'Timeout must use TheOddsApiError.')
assert(timeoutError.code === 'ODDS_API_TIMEOUT', 'Timeout must use ODDS_API_TIMEOUT.')

const serviceSnapshot = await getOddsSnapshot({
  fetchImpl: async () => ({
    ok: true,
    json: async () => disabledSnapshot,
  }),
})
assertDisabledShape(serviceSnapshot, 'getOddsSnapshot success response')
serviceSnapshot.markets.forEach((market, index) =>
  assertMarketShape(market, `getOddsSnapshot market ${index}`, {
    requireEmptyBookmakers: true,
  }),
)

const remoteServiceSnapshot = await getOddsSnapshot({
  fetchImpl: async () => ({
    ok: true,
    json: async () => adapterSnapshot,
  }),
})
assert(remoteServiceSnapshot.ok === true, 'Frontend odds service must accept the normalized remote snapshot.')
assert(remoteServiceSnapshot.disabled === false, 'Frontend odds service must preserve enabled remote state.')
assert(remoteServiceSnapshot.provider === 'the-odds-api', 'Frontend odds service must preserve provider.')
assertMarketShape(remoteServiceSnapshot.markets[0], 'Frontend normalized remote market')

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
