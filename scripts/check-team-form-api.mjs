import { execFileSync } from 'node:child_process'
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from 'node:fs'
import { join } from 'node:path'

const apiPath = 'api/team-form.js'
const adapterPath = 'api/providers/apiFootballTeamFormAdapter.js'
const servicePath = 'src/services/teamFormApi.js'
const mockPath = 'src/data/mockTeamFormSnapshot.js'
const appPath = 'src/App.jsx'
const betEnginePath = 'src/services/betEngine.js'
const matchApiPath = 'src/services/matchApi.js'
const teamFormMergePath = 'src/services/teamFormMerge.js'
const packagePath = 'package.json'
const apiMatchesPath = 'api/matches.js'
const databaseUrlToken = 'DATABASE_' + 'URL'
const allowedModifiedPaths = new Set([
  'api/team-form.js',
  'api/providers/apiFootballTeamFormAdapter.js',
  'scripts/check-team-form-api.mjs',
  'scripts/check-match-team-form-integration.mjs',
])

delete process.env.API_FOOTBALL_KEY
delete process.env.TEAM_FORM_API_ENABLED
delete process.env.TEAM_FORM_PROVIDER

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

function gitStatus() {
  return execFileSync('git', ['status', '--short'], {
    encoding: 'utf8',
  }).trimEnd()
}

function normalizeGitPath(path) {
  return path.replaceAll('\\', '/')
}

for (const path of [
  apiPath,
  adapterPath,
  servicePath,
  mockPath,
  appPath,
  betEnginePath,
  matchApiPath,
  teamFormMergePath,
  apiMatchesPath,
  packagePath,
]) {
  assert(existsSync(path), `${path} must exist.`)
}

const apiText = readText(apiPath)
const adapterText = readText(adapterPath)
const serviceText = readText(servicePath)
const mockText = readText(mockPath)
const appText = readText(appPath)
const betEngineText = readText(betEnginePath)
const matchApiText = readText(matchApiPath)
const teamFormMergeText = readText(teamFormMergePath)
const packageText = readText(packagePath)
const sourceFiles = readSourceTree('src')

assert(apiText.includes('../src/data/mockTeamFormSnapshot.js'), 'Team form API endpoint must retain the local mock fallback.')
assert(apiText.includes('./providers/apiFootballTeamFormAdapter.js'), 'Team form API endpoint must import the server-side provider adapter.')
assert(apiText.includes('process.env.API_FOOTBALL_KEY'), 'Team form API endpoint must read API_FOOTBALL_KEY.')
assert(apiText.includes('process.env.TEAM_FORM_API_ENABLED'), 'Team form API endpoint must read TEAM_FORM_API_ENABLED.')
assert(apiText.includes('process.env.TEAM_FORM_PROVIDER'), 'Team form API endpoint must read TEAM_FORM_PROVIDER.')
assert(/TEAM_FORM_API_ENABLED\s*===\s*['"]true['"]/.test(apiText), 'Team form API endpoint must require an explicit enabled flag.')
assert(/TEAM_FORM_PROVIDER\s*===\s*['"]api-football['"]/.test(apiText), 'Team form API endpoint must require api-football provider.')
assert(apiText.includes('createProviderFallback'), 'Team form API endpoint must normalize provider failures to mock fallback.')
assert(adapterText.includes('https://v3.football.api-sports.io'), 'Provider adapter must use the expected API-Football origin.')
assert(adapterText.includes('AbortController'), 'Provider adapter must use an abortable timeout.')
assert(adapterText.includes('setTimeout'), 'Provider adapter must configure a timeout.')
assert(adapterText.includes('TEAM_FORM_API_UNAUTHORIZED'), 'Provider adapter must normalize 401.')
assert(adapterText.includes('TEAM_FORM_API_FORBIDDEN'), 'Provider adapter must normalize 403.')
assert(adapterText.includes('TEAM_FORM_API_QUOTA_EXCEEDED'), 'Provider adapter must normalize 429.')
assert(adapterText.includes('TEAM_FORM_API_UPSTREAM_ERROR'), 'Provider adapter must normalize upstream failures.')
assert(adapterText.includes('TEAM_FORM_API_INVALID_RESPONSE'), 'Provider adapter must normalize invalid JSON.')
assert(adapterText.includes('TEAM_FORM_API_PROVIDER_ERROR'), 'Provider adapter must normalize provider response errors.')
assert(adapterText.includes('TEAM_FORM_TEAM_UNMATCHED'), 'Provider adapter must keep unmatched teams as fallback.')
assert(adapterText.includes('API_FOOTBALL_PROVIDER_ERRORS'), 'Provider adapter must expose a safe provider error category.')
assert(adapterText.includes("providerStage: 'teams_search'"), 'Provider adapter must identify the teams search stage.')
assert(adapterText.includes("providerStage: 'fixtures_recent'"), 'Provider adapter must identify the recent fixtures stage.')
assert(adapterText.includes('this.upstreamStatus'), 'Provider adapter errors must expose a sanitized upstreamStatus.')
assert(adapterText.includes('providerErrorKeys'), 'Provider adapter errors must expose sanitized provider error keys.')
assert(adapterText.includes('MAX_PROVIDER_ERROR_KEYS = 10'), 'Provider adapter must limit provider error keys.')
assert(apiText.includes('SAFE_ERROR_CODES'), 'Team form API endpoint must allowlist diagnostic error codes.')
assert(apiText.includes('SAFE_PROVIDER_STAGES'), 'Team form API endpoint must allowlist provider stages.')
assert(apiText.includes('providerErrorKeys'), 'Team form API endpoint must expose sanitized provider error keys.')
assert(apiText.includes('MAX_PROVIDER_ERROR_KEYS = 10'), 'Team form API endpoint must limit provider error keys.')
assert(!/process\.env|import\.meta\.env/.test(adapterText), 'Provider adapter must receive credentials from the API endpoint.')
assert(!/src\/services\/teamFormApi|src\\services\\teamFormApi/.test(apiText), 'Team form API endpoint must not import frontend team form service.')
assert(!/bookmakers|mainMarkets|handicap|totalGoals|oddsConfidence/i.test(adapterText), 'Team form adapter must not return odds structures.')
assert(!/openai|\bgpt\b/i.test(apiText), 'Team form API endpoint must not mention OpenAI or GPT.')
assert(!/openai|\bgpt\b/i.test(adapterText), 'Provider adapter must not mention OpenAI or GPT.')
assert(!new RegExp(`${databaseUrlToken}|@neondatabase|SNAPSHOT_WRITE|internal/snapshots|analysis_snapshots`, 'i').test(apiText), 'Team form API endpoint must not touch database or snapshot writes.')
assert(!new RegExp(`${databaseUrlToken}|@neondatabase|SNAPSHOT_WRITE|internal/snapshots|analysis_snapshots`, 'i').test(adapterText), 'Provider adapter must not touch database or snapshot writes.')
assert(!/levenshtein|similarity|distance|fuzzy|soundex|jaro/i.test(adapterText), 'Provider adapter must not use fuzzy matching.')
assert(/normalizeTeamKey/.test(adapterText), 'Provider adapter must use deterministic normalized keys.')

for (const [path, text] of sourceFiles) {
  assert(!text.includes('API_FOOTBALL_KEY'), `${path} must not reference API_FOOTBALL_KEY.`)
  assert(!text.includes('TEAM_FORM_API_ENABLED'), `${path} must not reference TEAM_FORM_API_ENABLED.`)
  assert(!text.includes('TEAM_FORM_PROVIDER'), `${path} must not reference TEAM_FORM_PROVIDER.`)
  assert(!text.includes('v3.football.api-sports.io'), `${path} must not reference the supplier origin.`)
  assert(!text.includes('apiFootballTeamFormAdapter'), `${path} must not import the server-side adapter.`)
}

assert(!/teamFormApi|getTeamFormSnapshot|api\/team-form/.test(appText), 'App.jsx must not reference teamFormApi or /api/team-form.')
assert(!/teamFormApi|getTeamFormSnapshot|api\/team-form/.test(betEngineText), 'BetEngine must not reference teamFormApi or /api/team-form.')
assert(serviceText.includes("'/api/team-form'") || serviceText.includes('"/api/team-form"'), 'teamFormApi.js must request /api/team-form.')
assert(!/openai|\bgpt\b/i.test(mockText), 'Mock team form snapshot must not mention OpenAI or GPT.')
assert(teamFormMergeText.includes('comparison: createComparison()'), 'teamFormMerge must keep comparison locally unknown.')
assert(matchApiText.includes('mergeTeamFormIntoMatches'), 'matchApi must retain the existing team form merge path.')

const changedPaths = gitStatus()
  .split('\n')
  .map((line) => line.trimEnd())
  .filter((line) => line.trim())
  .map((line) => normalizeGitPath(line.slice(3).trim()))

for (const changedPath of changedPaths) {
  assert(
    allowedModifiedPaths.has(changedPath),
    `${changedPath} is outside the allowed team-form provider change set.`,
  )
}

for (const path of [
  servicePath,
  mockPath,
  appPath,
  betEnginePath,
  matchApiPath,
  teamFormMergePath,
  apiMatchesPath,
  packagePath,
]) {
  const status = git(['status', '--short', '--', path])
  assert(!status, `${path} must not be modified.`)
}

const packageJson = JSON.parse(packageText)
const dependencies = {
  ...(packageJson.dependencies ?? {}),
  ...(packageJson.devDependencies ?? {}),
}

assert(!Object.prototype.hasOwnProperty.call(dependencies, 'axios'), 'package.json must not add axios.')
assert(!Object.prototype.hasOwnProperty.call(dependencies, 'openai'), 'package.json must not add openai.')

const { createDisabledTeamFormSnapshot, default: handler } = await import('../api/team-form.js')
const {
  ApiFootballTeamFormError,
  fetchApiFootballTeamFormSnapshot,
} = await import('../api/providers/apiFootballTeamFormAdapter.js')
const { createFallbackTeamFormSnapshot, getTeamFormSnapshot } = await import('../src/services/teamFormApi.js')
const { createMockTeamFormSnapshot } = await import('../src/data/mockTeamFormSnapshot.js')

const formStatusValues = new Set(['strong', 'stable', 'mixed', 'weak', 'unknown'])
const standardStatuses = new Set(['available', 'mock', 'disabled', 'fallback'])
const formTrendValues = new Set(['strong', 'stable', 'weak', 'volatile', 'unknown'])
const attackDefenseTrendValues = new Set(['strong', 'normal', 'weak', 'unknown'])
const confidenceValues = new Set(['high', 'medium', 'low'])
const loadValues = new Set(['low', 'medium', 'high', 'unknown'])
const providerStageValues = new Set([
  'teams_search',
  'fixtures_recent',
  'parse_json',
  'provider_errors',
  'timeout',
  'network',
  'unknown',
])
const providerErrorCodeValues = new Set([
  'API_FOOTBALL_KEY_MISSING',
  'API_FOOTBALL_AUTH_ERROR',
  'API_FOOTBALL_FORBIDDEN',
  'API_FOOTBALL_RATE_LIMIT',
  'API_FOOTBALL_UPSTREAM_ERROR',
  'API_FOOTBALL_INVALID_JSON',
  'API_FOOTBALL_PROVIDER_ERRORS',
  'API_FOOTBALL_TIMEOUT',
  'API_FOOTBALL_NETWORK_ERROR',
  'API_FOOTBALL_TEAM_UNMATCHED',
  'API_FOOTBALL_DATA_UNAVAILABLE',
])
const providerErrorKeyPattern = /^[A-Za-z0-9_-]{1,40}$/
const positivePattern = /guarantee|guaranteed|lock|sure|profit|boost|bonus|positive|must.?bet|recommend|pick|stake|bankroll|guaranteedWin|sureWin|increaseScore|raiseScore|bestBet|heavy/i

function assertMetaShape(meta, label) {
  for (const field of ['status', 'error', 'source']) {
    assert(Object.prototype.hasOwnProperty.call(meta, field), `${label} must include ${field}.`)
  }

  assert(typeof meta.status === 'string' && meta.status, `${label} status must be a string.`)
  assert(meta.error === null || typeof meta.error === 'string', `${label} error must be null or a string.`)
  assert(typeof meta.source === 'string' && meta.source, `${label} source must be a string.`)
}

function assertSnapshotShape(snapshot, label) {
  for (const field of [
    'provider',
    'dataSource',
    'updatedAt',
    'teams',
    'meta',
  ]) {
    assert(Object.prototype.hasOwnProperty.call(snapshot, field), `${label} must include ${field}.`)
  }

  assert(Array.isArray(snapshot.teams), `${label} teams must be an array.`)
  assert(snapshot.meta && typeof snapshot.meta === 'object', `${label} meta must be an object.`)
  assertMetaShape(snapshot.meta, `${label} meta`)
}

function assertDisabledShape(snapshot, label, fallbackReason = 'TEAM_FORM_API_DISABLED') {
  for (const field of [
    'ok',
    'disabled',
    'provider',
    'dataSource',
    'updatedAt',
    'fallbackReason',
    'teams',
    'meta',
  ]) {
    assert(Object.prototype.hasOwnProperty.call(snapshot, field), `${label} must include ${field}.`)
  }

  assert(snapshot.ok === false, `${label} must keep ok=false.`)
  assert(snapshot.disabled === true, `${label} must keep disabled=true.`)
  assert(snapshot.fallbackReason === fallbackReason, `${label} must keep ${fallbackReason}.`)
  assert(Array.isArray(snapshot.teams), `${label} teams must be an array.`)
}

function assertTeamShape(team, label) {
  for (const field of [
    'status',
    'teamName',
    'formStatus',
    'formTrend',
    'confidence',
    'recentMatches',
    'recentResults',
    'attackTrend',
    'defenseTrend',
    'volatility',
    'dataQuality',
    'homeAwaySplit',
    'scheduleLoad',
    'trendFlags',
    'riskFlags',
    'reviewPoints',
    'riskNotes',
    'fallbackReason',
    'rawAvailable',
  ]) {
    assert(Object.prototype.hasOwnProperty.call(team, field), `${label} must include ${field}.`)
  }

  assert(standardStatuses.has(team.status), `${label} status must use the allowed enum.`)
  assert(typeof team.teamName === 'string' && team.teamName, `${label} must include teamName.`)
  assert(formStatusValues.has(team.formStatus), `${label} formStatus must use the allowed enum.`)
  assert(formTrendValues.has(team.formTrend), `${label} formTrend must use the allowed enum.`)
  assert(confidenceValues.has(team.confidence), `${label} confidence must use the allowed enum.`)
  assert(['sampleSize', 'wins', 'draws', 'losses', 'goalsFor', 'goalsAgainst'].every((field) => Object.prototype.hasOwnProperty.call(team.recentMatches, field)), `${label} recentMatches must include all fields.`)
  assert(Array.isArray(team.recentResults), `${label} recentResults must be an array.`)
  assert(attackDefenseTrendValues.has(team.attackTrend), `${label} attackTrend must use the allowed enum.`)
  assert(attackDefenseTrendValues.has(team.defenseTrend), `${label} defenseTrend must use the allowed enum.`)
  assert(loadValues.has(team.volatility), `${label} volatility must use the allowed enum.`)
  assert(loadValues.has(team.dataQuality), `${label} dataQuality must use the allowed enum.`)
  assert(formStatusValues.has(team.homeAwaySplit.homeStatus), `${label} homeStatus must use the allowed enum.`)
  assert(formStatusValues.has(team.homeAwaySplit.awayStatus), `${label} awayStatus must use the allowed enum.`)
  assert(loadValues.has(team.scheduleLoad.density), `${label} schedule density must use the allowed enum.`)
  assert(Object.prototype.hasOwnProperty.call(team.scheduleLoad, 'restDays'), `${label} scheduleLoad must include restDays.`)
  assert(loadValues.has(team.scheduleLoad.travelRisk), `${label} travelRisk must use the allowed enum.`)
  assert(Array.isArray(team.trendFlags), `${label} trendFlags must be an array.`)
  assert(Array.isArray(team.riskFlags), `${label} riskFlags must be an array.`)
  assert(Array.isArray(team.reviewPoints), `${label} reviewPoints must be an array.`)
  assert(Array.isArray(team.riskNotes), `${label} riskNotes must be an array.`)
  assert(typeof team.rawAvailable === 'boolean', `${label} rawAvailable must be a boolean.`)

  for (const trendFlag of team.trendFlags) {
    assert(typeof trendFlag === 'string', `${label} trendFlags must be strings.`)
    assert(!positivePattern.test(trendFlag), `${label} trendFlags must not contain direct recommendation semantics.`)
  }

  for (const riskFlag of team.riskFlags) {
    assert(typeof riskFlag === 'string', `${label} riskFlags must be strings.`)
    assert(!positivePattern.test(riskFlag), `${label} riskFlags must not contain positive scoring semantics.`)
  }

  for (const riskNote of team.riskNotes) {
    assert(typeof riskNote === 'string', `${label} riskNotes must be strings.`)
    assert(!positivePattern.test(riskNote), `${label} riskNotes must not contain positive scoring semantics.`)
  }
}

function assertMockSnapshot(snapshot, label) {
  assertSnapshotShape(snapshot, label)
  assert(snapshot.provider === 'mock', `${label} must use provider=mock.`)
  assert(snapshot.dataSource === 'mock', `${label} must use dataSource=mock.`)
  assert(snapshot.teams.length > 0, `${label} must include at least one mock team.`)
  assert(snapshot.meta?.schemaVersion === 'team-form-snapshot-v1', `${label} must use team-form-snapshot-v1.`)
  snapshot.teams.forEach((team, index) => assertTeamShape(team, `${label} team ${index}`))
}

function assertRemoteSnapshot(snapshot, label) {
  assertSnapshotShape(snapshot, label)
  assert(snapshot.ok === true, `${label} must set ok=true.`)
  assert(snapshot.disabled === false, `${label} must set disabled=false.`)
  assert(snapshot.status === 'available', `${label} must set status=available.`)
  assert(snapshot.provider === 'api-football', `${label} must identify api-football.`)
  assert(snapshot.dataSource === 'remote', `${label} must use dataSource=remote.`)
  assert(snapshot.fallbackReason === null, `${label} must not set a top-level fallback reason.`)
  assert(snapshot.rawAvailable === true, `${label} must mark normalized remote data as available.`)
  snapshot.teams.forEach((team, index) => assertTeamShape(team, `${label} team ${index}`))
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
  return {
    ok: options.ok ?? true,
    status: options.status ?? 200,
    headers: options.headers ?? {
      'x-provider-secret': 'provider-header-must-not-leak',
    },
    async json() {
      if (options.jsonError) throw new Error('invalid json')
      return {
        errors: options.errors ?? [],
        response: options.payload,
      }
    },
  }
}

function assertNoForbiddenResponseKeys(value, label, path = 'body') {
  if (!value || typeof value !== 'object') return

  for (const [key, child] of Object.entries(value)) {
    const normalizedKey = key.toLowerCase().replaceAll('_', '')
    assert(
      ![
        'apikey',
        'errors',
        'headers',
        'rawresponse',
        'xapisportskey',
      ].includes(normalizedKey),
      `${label} must not expose ${path}.${key}.`,
    )
    assertNoForbiddenResponseKeys(child, label, `${path}.${key}`)
  }
}

function assertProviderErrorKeys(keys, expectedKeys, label) {
  assert(Array.isArray(keys), `${label} providerErrorKeys must be an array.`)
  assert(keys.length <= 10, `${label} providerErrorKeys must contain at most 10 items.`)
  assert(new Set(keys).size === keys.length, `${label} providerErrorKeys must not contain duplicates.`)

  for (const key of keys) {
    assert(typeof key === 'string', `${label} providerErrorKeys must contain only strings.`)
    assert(providerErrorKeyPattern.test(key), `${label} providerErrorKeys must contain only safe short keys.`)
  }

  assert(
    JSON.stringify(keys) === JSON.stringify(expectedKeys),
    `${label} providerErrorKeys must contain only the expected normalized keys.`,
  )
}

async function assertEndpointFallback(options) {
  const {
    label,
    fetchImpl,
    expectedFallbackReason,
    expectedErrorCode,
    expectedProviderStage,
    expectedUpstreamStatus = null,
    expectedProviderErrorKeys,
  } = options
  const previousFetch = globalThis.fetch
  const response = createMockResponse()

  try {
    globalThis.fetch = fetchImpl
    await handler({ method: 'GET' }, response)
  } finally {
    globalThis.fetch = previousFetch
  }

  assert(response.statusCode === 200, `${label} endpoint fallback must return HTTP 200.`)
  assert(response.body && typeof response.body === 'object', `${label} endpoint fallback must return JSON.`)
  assertDisabledShape(response.body, `${label} endpoint fallback`, expectedFallbackReason)
  assert(['mock', 'api-football'].includes(response.body.provider), `${label} endpoint fallback must use a compatible provider value.`)
  assert(['mock', 'disabled'].includes(response.body.dataSource), `${label} endpoint fallback must use a compatible dataSource.`)
  assert(['fallback', 'disabled'].includes(response.body.status), `${label} endpoint fallback must use fallback or disabled status.`)
  assert(response.body.meta?.error === expectedFallbackReason, `${label} endpoint fallback must expose only the normalized error code.`)
  assert(response.body.meta?.errorCode === expectedErrorCode, `${label} endpoint fallback must expose the safe diagnostic errorCode.`)
  assert(response.body.meta?.providerStage === expectedProviderStage, `${label} endpoint fallback must expose the safe providerStage.`)
  assert(providerErrorCodeValues.has(response.body.meta.errorCode), `${label} endpoint fallback errorCode must use the safe enum.`)
  assert(providerStageValues.has(response.body.meta.providerStage), `${label} endpoint fallback providerStage must use the safe enum.`)
  assert(response.body.meta?.upstreamStatus === expectedUpstreamStatus, `${label} endpoint fallback must expose only a real upstream HTTP status.`)
  if (expectedErrorCode === 'API_FOOTBALL_PROVIDER_ERRORS') {
    assert(
      Object.prototype.hasOwnProperty.call(response.body.meta, 'providerErrorKeys'),
      `${label} endpoint fallback must expose providerErrorKeys for provider errors.`,
    )
    assertProviderErrorKeys(
      response.body.meta.providerErrorKeys,
      expectedProviderErrorKeys ?? [],
      `${label} endpoint fallback`,
    )
  } else {
    assert(
      !Object.prototype.hasOwnProperty.call(response.body.meta, 'providerErrorKeys'),
      `${label} endpoint fallback must not expose providerErrorKeys for unrelated errors.`,
    )
  }
  assert(response.body.teams.length === mockSnapshot.teams.length, `${label} endpoint fallback must retain the mock team list.`)
  response.body.teams.forEach((team, index) =>
    assertTeamShape(team, `${label} endpoint fallback team ${index}`),
  )

  const serialized = JSON.stringify(response.body)
  for (const forbiddenValue of [
    'test-key-not-real',
    'provider-header-must-not-leak',
    'raw-response-must-not-leak',
    'raw-private-field-must-not-leak',
    'provider failed',
    'provider fixture failed',
    'provider-object-value-must-not-leak',
    'provider-string-secret-must-not-leak',
    'provider-array-secret-must-not-leak',
    'provider-array-token-must-not-leak',
    'network down',
  ]) {
    assert(!serialized.includes(forbiddenValue), `${label} endpoint fallback must not expose ${forbiddenValue}.`)
  }
  assertNoForbiddenResponseKeys(response.body, `${label} endpoint fallback`)
}

function teamPayload(teamId, teamName) {
  return [
    {
      team: {
        id: teamId,
        name: teamName,
        logo: 'must-not-leak-logo',
      },
      venue: {
        id: 9999,
      },
    },
  ]
}

function fixturePayload(teamId, teamName, opponentName = 'Opponent') {
  return [
    {
      fixture: {
        id: 'fixture-id-must-not-leak',
        date: '2026-06-01T20:00:00Z',
      },
      league: {
        id: 'league-id-must-not-leak',
        name: 'Private League',
      },
      teams: {
        home: { id: teamId, name: teamName },
        away: { id: 9001, name: opponentName },
      },
      goals: { home: 2, away: 0 },
      raw_private_field: 'must-not-leak',
    },
    {
      fixture: {
        id: 'fixture-id-must-not-leak-2',
        date: '2026-05-25T20:00:00Z',
      },
      teams: {
        home: { id: 9002, name: `${opponentName} B` },
        away: { id: teamId, name: teamName },
      },
      goals: { home: 1, away: 1 },
    },
    {
      fixture: {
        id: 'fixture-id-must-not-leak-3',
        date: '2026-05-18T20:00:00Z',
      },
      teams: {
        home: { id: teamId, name: teamName },
        away: { id: 9003, name: `${opponentName} C` },
      },
      goals: { home: 0, away: 1 },
    },
    {
      fixture: {
        id: 'fixture-id-must-not-leak-4',
        date: '2026-05-11T20:00:00Z',
      },
      teams: {
        home: { id: 9004, name: `${opponentName} D` },
        away: { id: teamId, name: teamName },
      },
      goals: { home: 1, away: 3 },
    },
    {
      fixture: {
        id: 'fixture-id-must-not-leak-5',
        date: '2026-05-04T20:00:00Z',
      },
      teams: {
        home: { id: teamId, name: teamName },
        away: { id: 9005, name: `${opponentName} E` },
      },
      goals: { home: 2, away: 2 },
    },
  ]
}

function createApiFootballFetch(options = {}) {
  const teams = new Map([
    ['France', 2],
    ['Portugal', 27],
    ['Senegal', 13],
  ])

  return async (url, requestOptions = {}) => {
    assert(url instanceof URL, 'Provider request must use URL objects.')
    assert(url.origin === 'https://v3.football.api-sports.io', 'Provider request must use the API-Football origin.')
    assert(requestOptions.headers?.['x-apisports-key'] === 'test-key-not-real', 'Provider request must use the server-provided key.')
    assert(requestOptions.signal, 'Provider request must pass an abort signal.')

    if (options.onRequest) options.onRequest(url)

    if (url.pathname === '/teams') {
      const search = url.searchParams.get('search')
      if (options.unmatchedSearch) return createSupplierResponse({ payload: [] })
      const teamId = teams.get(search)
      return createSupplierResponse({
        payload: teamId ? teamPayload(teamId, search) : [],
      })
    }

    if (url.pathname === '/fixtures') {
      const teamId = Number(url.searchParams.get('team'))
      const teamName = [...teams.entries()].find(([, id]) => id === teamId)?.[0]
      return createSupplierResponse({
        payload: teamName ? fixturePayload(teamId, teamName) : [],
      })
    }

    throw new Error(`Unexpected provider path ${url.pathname}`)
  }
}

const mockSnapshot = createMockTeamFormSnapshot()
assertMockSnapshot(mockSnapshot, 'createMockTeamFormSnapshot')

const disabledSnapshot = createDisabledTeamFormSnapshot()
assertDisabledShape(disabledSnapshot, 'createDisabledTeamFormSnapshot')
assert(disabledSnapshot.provider === 'mock', 'Disabled team form snapshot must use mock provider while disabled.')
assert(disabledSnapshot.dataSource === 'mock', 'Disabled team form snapshot must use mock dataSource while disabled.')
assert(disabledSnapshot.teams.length === mockSnapshot.teams.length, 'Disabled team form snapshot must expose mock fallback teams.')
assert(disabledSnapshot.meta.schemaVersion === 'team-form-snapshot-v1', 'Disabled team form snapshot must expose the schema version.')
assert(!Object.prototype.hasOwnProperty.call(disabledSnapshot.meta, 'providerStage'), 'Disabled team form snapshot must not expose a misleading providerStage.')
assert(!Object.prototype.hasOwnProperty.call(disabledSnapshot.meta, 'errorCode'), 'Disabled team form snapshot must not expose a misleading provider errorCode.')
assert(!Object.prototype.hasOwnProperty.call(disabledSnapshot.meta, 'providerErrorKeys'), 'Disabled team form snapshot must not expose misleading providerErrorKeys.')

const fallbackSnapshot = createFallbackTeamFormSnapshot()
assertDisabledShape(fallbackSnapshot, 'createFallbackTeamFormSnapshot')
assert(fallbackSnapshot.provider === 'none', 'Service fallback must use provider=none.')
assert(fallbackSnapshot.dataSource === 'disabled', 'Service fallback must use dataSource=disabled.')

const originalFetch = globalThis.fetch
let supplierCallCount = 0

try {
  globalThis.fetch = async () => {
    supplierCallCount += 1
    throw new Error('Default fallback must not call the supplier.')
  }

  const getResponse = createMockResponse()
  await handler({ method: 'GET' }, getResponse)
  assert(getResponse.statusCode === 200, 'GET /api/team-form must return 200.')
  assertDisabledShape(getResponse.body, 'GET /api/team-form default response')
  assert(getResponse.body.provider === 'mock', 'Default team form response must use provider=mock.')
  assert(getResponse.body.dataSource === 'mock', 'Default team form response must use dataSource=mock.')
  assert(getResponse.body.fallbackReason === 'TEAM_FORM_API_DISABLED', 'Default team form response must keep TEAM_FORM_API_DISABLED.')
  assert(getResponse.body.teams.length === mockSnapshot.teams.length, 'GET /api/team-form must return mock fallback teams.')
  assert(!Object.prototype.hasOwnProperty.call(getResponse.body.meta, 'providerStage'), 'Default GET /api/team-form must not expose a providerStage.')
  assert(!Object.prototype.hasOwnProperty.call(getResponse.body.meta, 'errorCode'), 'Default GET /api/team-form must not expose a provider errorCode.')
  assert(!Object.prototype.hasOwnProperty.call(getResponse.body.meta, 'providerErrorKeys'), 'Default GET /api/team-form must not expose providerErrorKeys.')
  assert(supplierCallCount === 0, 'Default GET /api/team-form must not call the supplier.')

  const postResponse = createMockResponse()
  await handler({ method: 'POST' }, postResponse)
  assert(postResponse.statusCode === 405, 'Non-GET /api/team-form must return 405.')
  assert(postResponse.headers.Allow === 'GET', 'Non-GET /api/team-form must expose Allow: GET.')
  assertDisabledShape(postResponse.body, 'Non-GET /api/team-form response')
  assert(supplierCallCount === 0, 'Non-GET /api/team-form must not call the supplier.')

  process.env.TEAM_FORM_API_ENABLED = 'true'
  process.env.TEAM_FORM_PROVIDER = 'api-football'

  const missingKeyResponse = createMockResponse()
  await handler({ method: 'GET' }, missingKeyResponse)
  assertDisabledShape(
    missingKeyResponse.body,
    'GET /api/team-form missing key response',
    'TEAM_FORM_API_KEY_MISSING',
  )
  assert(missingKeyResponse.body.provider === 'api-football', 'Missing key fallback must identify the configured provider.')
  assert(missingKeyResponse.body.meta.error === 'TEAM_FORM_API_KEY_MISSING', 'Missing key fallback must expose only a safe error code.')
  assert(missingKeyResponse.body.meta.errorCode === 'API_FOOTBALL_KEY_MISSING', 'Missing key fallback must expose a safe diagnostic errorCode.')
  assert(missingKeyResponse.body.meta.providerStage === 'unknown', 'Missing key fallback must not claim that a provider request stage ran.')
  assert(!Object.prototype.hasOwnProperty.call(missingKeyResponse.body.meta, 'providerErrorKeys'), 'Missing key fallback must not expose providerErrorKeys.')
  assert(supplierCallCount === 0, 'Missing key fallback must not call the supplier.')

  process.env.API_FOOTBALL_KEY = 'test-key-not-real'
  process.env.TEAM_FORM_API_ENABLED = 'false'
  const disabledFlagResponse = createMockResponse()
  await handler({ method: 'GET' }, disabledFlagResponse)
  assertDisabledShape(disabledFlagResponse.body, 'Disabled flag response')
  assert(supplierCallCount === 0, 'TEAM_FORM_API_ENABLED=false must not call the supplier.')

  process.env.TEAM_FORM_API_ENABLED = 'true'
  process.env.TEAM_FORM_PROVIDER = 'mock'
  const wrongProviderResponse = createMockResponse()
  await handler({ method: 'GET' }, wrongProviderResponse)
  assertDisabledShape(wrongProviderResponse.body, 'Wrong provider response')
  assert(supplierCallCount === 0, 'TEAM_FORM_PROVIDER mismatch must not call the supplier.')

  process.env.TEAM_FORM_PROVIDER = 'api-football'
  globalThis.fetch = createApiFootballFetch({
    onRequest() {
      supplierCallCount += 1
    },
  })

  const enabledResponse = createMockResponse()
  await handler({ method: 'GET' }, enabledResponse)
  assert(enabledResponse.statusCode === 200, 'Enabled GET /api/team-form must return 200.')
  assertRemoteSnapshot(enabledResponse.body, 'Enabled GET /api/team-form response')
  assert(enabledResponse.body.teams.length === mockSnapshot.teams.length, 'Enabled provider response must preserve the existing team form list shape.')
  assert(enabledResponse.body.teams.every((team) => team.rawAvailable === true), 'Enabled provider response must mark exact matched teams rawAvailable=true.')
  assert(supplierCallCount > 0, 'All three gates satisfied must call the provider.')
  assert(!JSON.stringify(enabledResponse.body).includes('test-key-not-real'), 'Enabled response must not expose API_FOOTBALL_KEY.')
  assert(!JSON.stringify(enabledResponse.body).includes('must-not-leak'), 'Enabled response must not expose raw provider fields.')
  assert(!JSON.stringify(enabledResponse.body).includes('fixture-id'), 'Enabled response must not expose provider fixture ids.')

  globalThis.fetch = createApiFootballFetch({ unmatchedSearch: true })
  const unmatchedResponse = createMockResponse()
  await handler({ method: 'GET' }, unmatchedResponse)
  assertDisabledShape(
    unmatchedResponse.body,
    'Unmatched team fallback response',
    'TEAM_FORM_TEAM_UNMATCHED',
  )
  assert(unmatchedResponse.body.teams.every((team) => team.rawAvailable === false), 'Unmatched fallback must keep rawAvailable=false.')
  assert(unmatchedResponse.body.teams.every((team) => team.dataQuality === 'low'), 'Unmatched fallback must keep low data quality.')

  const endpointFallbackCases = [
    {
      label: '401',
      expectedFallbackReason: 'TEAM_FORM_API_UNAUTHORIZED',
      expectedErrorCode: 'API_FOOTBALL_AUTH_ERROR',
      expectedProviderStage: 'teams_search',
      expectedUpstreamStatus: 401,
      fetchImpl: async () => createSupplierResponse({
        ok: false,
        status: 401,
        payload: [{ raw_private_field: 'raw-private-field-must-not-leak' }],
      }),
    },
    {
      label: '403',
      expectedFallbackReason: 'TEAM_FORM_API_FORBIDDEN',
      expectedErrorCode: 'API_FOOTBALL_FORBIDDEN',
      expectedProviderStage: 'teams_search',
      expectedUpstreamStatus: 403,
      fetchImpl: async () => createSupplierResponse({
        ok: false,
        status: 403,
        payload: [{ raw_private_field: 'raw-private-field-must-not-leak' }],
      }),
    },
    {
      label: '429',
      expectedFallbackReason: 'TEAM_FORM_API_QUOTA_EXCEEDED',
      expectedErrorCode: 'API_FOOTBALL_RATE_LIMIT',
      expectedProviderStage: 'teams_search',
      expectedUpstreamStatus: 429,
      fetchImpl: async () => createSupplierResponse({
        ok: false,
        status: 429,
        payload: [{ raw_private_field: 'raw-private-field-must-not-leak' }],
      }),
    },
    {
      label: '5xx',
      expectedFallbackReason: 'TEAM_FORM_API_UPSTREAM_ERROR',
      expectedErrorCode: 'API_FOOTBALL_UPSTREAM_ERROR',
      expectedProviderStage: 'teams_search',
      expectedUpstreamStatus: 503,
      fetchImpl: async () => createSupplierResponse({
        ok: false,
        status: 503,
        payload: [{ raw_private_field: 'raw-private-field-must-not-leak' }],
      }),
    },
    {
      label: 'non-2xx',
      expectedFallbackReason: 'TEAM_FORM_API_REQUEST_FAILED',
      expectedErrorCode: 'API_FOOTBALL_UPSTREAM_ERROR',
      expectedProviderStage: 'teams_search',
      expectedUpstreamStatus: 400,
      fetchImpl: async () => createSupplierResponse({
        ok: false,
        status: 400,
        payload: [{ raw_private_field: 'raw-private-field-must-not-leak' }],
      }),
    },
    {
      label: 'invalid JSON',
      expectedFallbackReason: 'TEAM_FORM_API_INVALID_RESPONSE',
      expectedErrorCode: 'API_FOOTBALL_INVALID_JSON',
      expectedProviderStage: 'parse_json',
      fetchImpl: async () => createSupplierResponse({
        payload: null,
        jsonError: true,
      }),
    },
    {
      label: 'teams search provider response errors',
      expectedFallbackReason: 'TEAM_FORM_API_PROVIDER_ERROR',
      expectedErrorCode: 'API_FOOTBALL_PROVIDER_ERRORS',
      expectedProviderStage: 'teams_search',
      expectedProviderErrorKeys: [
        'requests',
        'subscription',
        'plan',
        'access',
        'token',
        'parameters',
        'endpoint',
        'quota',
        'season',
        'league',
      ],
      fetchImpl: async () => createSupplierResponse({
        payload: [{ raw_private_field: 'raw-private-field-must-not-leak' }],
        errors: {
          requests: {
            message: 'provider-object-value-must-not-leak',
            rawResponse: 'raw-response-must-not-leak',
            headers: {
              authorization: 'provider-header-must-not-leak',
            },
          },
          subscription: 'provider-object-value-must-not-leak',
          plan: 'provider-object-value-must-not-leak',
          access: 'provider-object-value-must-not-leak',
          token: 'provider-object-value-must-not-leak',
          parameters: 'provider-object-value-must-not-leak',
          endpoint: 'provider-object-value-must-not-leak',
          quota: 'provider-object-value-must-not-leak',
          season: 'provider-object-value-must-not-leak',
          league: 'provider-object-value-must-not-leak',
          extra_one: 'provider-object-value-must-not-leak',
          extra_two: 'provider-object-value-must-not-leak',
          'bad key': 'provider-object-value-must-not-leak',
          'https://bad.example': 'provider-object-value-must-not-leak',
          ['x'.repeat(41)]: 'provider-object-value-must-not-leak',
        },
      }),
    },
    {
      label: 'recent fixtures provider response errors',
      expectedFallbackReason: 'TEAM_FORM_API_PROVIDER_ERROR',
      expectedErrorCode: 'API_FOOTBALL_PROVIDER_ERRORS',
      expectedProviderStage: 'fixtures_recent',
      expectedProviderErrorKeys: ['access', 'parameters'],
      fetchImpl: async (url) => {
        if (url.pathname === '/teams') {
          return createSupplierResponse({
            payload: teamPayload(2, 'France'),
          })
        }
        return createSupplierResponse({
          payload: [{ raw_private_field: 'raw-private-field-must-not-leak' }],
          errors: {
            access: {
              message: 'provider fixture failed',
              rawResponse: 'raw-response-must-not-leak',
              headers: {
                authorization: 'provider-header-must-not-leak',
              },
            },
            parameters: 'provider-object-value-must-not-leak',
          },
        })
      },
    },
    {
      label: 'provider response errors string',
      expectedFallbackReason: 'TEAM_FORM_API_PROVIDER_ERROR',
      expectedErrorCode: 'API_FOOTBALL_PROVIDER_ERRORS',
      expectedProviderStage: 'teams_search',
      expectedProviderErrorKeys: ['unknown'],
      fetchImpl: async () => createSupplierResponse({
        payload: [],
        errors: 'provider-string-secret-must-not-leak',
      }),
    },
    {
      label: 'provider response errors array',
      expectedFallbackReason: 'TEAM_FORM_API_PROVIDER_ERROR',
      expectedErrorCode: 'API_FOOTBALL_PROVIDER_ERRORS',
      expectedProviderStage: 'teams_search',
      expectedProviderErrorKeys: ['unknown'],
      fetchImpl: async () => createSupplierResponse({
        payload: [],
        errors: [
          'provider-array-secret-must-not-leak',
          {
            token: 'provider-array-token-must-not-leak',
          },
        ],
      }),
    },
    {
      label: 'timeout',
      expectedFallbackReason: 'TEAM_FORM_API_TIMEOUT',
      expectedErrorCode: 'API_FOOTBALL_TIMEOUT',
      expectedProviderStage: 'timeout',
      fetchImpl: async () => {
        const error = new Error('provider timeout')
        error.name = 'AbortError'
        throw error
      },
    },
    {
      label: 'network error throw',
      expectedFallbackReason: 'TEAM_FORM_API_NETWORK_ERROR',
      expectedErrorCode: 'API_FOOTBALL_NETWORK_ERROR',
      expectedProviderStage: 'network',
      fetchImpl() {
        throw new Error('network down')
      },
    },
    {
      label: 'network error reject',
      expectedFallbackReason: 'TEAM_FORM_API_NETWORK_ERROR',
      expectedErrorCode: 'API_FOOTBALL_NETWORK_ERROR',
      expectedProviderStage: 'network',
      fetchImpl() {
        return Promise.reject(new Error('network down'))
      },
    },
  ]

  for (const endpointFallbackCase of endpointFallbackCases) {
    await assertEndpointFallback(endpointFallbackCase)
  }
} finally {
  delete process.env.API_FOOTBALL_KEY
  delete process.env.TEAM_FORM_API_ENABLED
  delete process.env.TEAM_FORM_PROVIDER
  globalThis.fetch = originalFetch
}

let requestedUrls = []
const adapterSnapshot = await fetchApiFootballTeamFormSnapshot({
  apiKey: 'test-key-not-real',
  teamNames: ['France', 'Portugal', 'Senegal'],
  timeoutMs: 100,
  fetchImpl: createApiFootballFetch({
    onRequest(url) {
      requestedUrls.push(url)
    },
  }),
})

assert(requestedUrls.length === 6, 'Provider adapter must resolve teams and fixtures with mock fetch only.')
assert(requestedUrls.some((url) => url.pathname === '/teams' && url.searchParams.get('search') === 'France'), 'Provider adapter must search for exact team names.')
assert(requestedUrls.some((url) => url.pathname === '/fixtures' && url.searchParams.get('last') === '5'), 'Provider adapter must request recent fixtures.')
assertRemoteSnapshot(adapterSnapshot, 'Provider adapter snapshot')
assert(adapterSnapshot.teams[0].teamName === 'France', 'Provider adapter must keep the local team name.')
assert(adapterSnapshot.teams[0].recentMatches.sampleSize === 5, 'Provider adapter must normalize recent match sample size.')
assert(adapterSnapshot.teams[0].recentMatches.wins === 2, 'Provider adapter must normalize wins.')
assert(adapterSnapshot.teams[0].recentMatches.draws === 2, 'Provider adapter must normalize draws.')
assert(adapterSnapshot.teams[0].recentMatches.losses === 1, 'Provider adapter must normalize losses.')
assert(adapterSnapshot.teams[0].recentResults.length === 5, 'Provider adapter must expose controlled recent results only.')
assert(adapterSnapshot.teams[0].scheduleLoad.restDays === 7, 'Provider adapter must normalize rest-day spacing.')
assert(!JSON.stringify(adapterSnapshot).includes('test-key-not-real'), 'Provider adapter snapshot must not expose the API key.')
assert(!JSON.stringify(adapterSnapshot).includes('must-not-leak'), 'Provider adapter snapshot must not expose raw provider fields.')
assert(!JSON.stringify(adapterSnapshot).includes('fixture-id'), 'Provider adapter snapshot must not expose provider fixture ids.')

const partialSnapshot = await fetchApiFootballTeamFormSnapshot({
  apiKey: 'test-key-not-real',
  teamNames: ['France', 'Unmatched Team'],
  timeoutMs: 100,
  fetchImpl: createApiFootballFetch(),
})
assertRemoteSnapshot(partialSnapshot, 'Partial provider adapter snapshot')
assert(partialSnapshot.teams[0].rawAvailable === true, 'Matched team must keep rawAvailable=true.')
assert(partialSnapshot.teams[1].rawAvailable === false, 'Unmatched team must keep rawAvailable=false.')
assert(partialSnapshot.teams[1].fallbackReason === 'TEAM_FORM_TEAM_UNMATCHED', 'Unmatched team must expose TEAM_FORM_TEAM_UNMATCHED.')
assert(partialSnapshot.teams[1].dataQuality === 'low', 'Unmatched team must use low data quality.')

async function assertAdapterError(
  responseOptions,
  expectedCode,
  expectedErrorCode,
  expectedProviderStage = 'teams_search',
  expectedStatus = null,
  expectedProviderErrorKeys,
) {
  let caught = null

  try {
    await fetchApiFootballTeamFormSnapshot({
      apiKey: 'test-key-not-real',
      teamNames: ['France'],
      timeoutMs: 100,
      fetchImpl: async () => createSupplierResponse(responseOptions),
    })
  } catch (error) {
    caught = error
  }

  assert(caught instanceof ApiFootballTeamFormError, `${expectedCode} must use ApiFootballTeamFormError.`)
  assert(caught.code === expectedCode, `${expectedCode} must be normalized.`)
  assert(caught.errorCode === expectedErrorCode, `${expectedCode} must expose a safe diagnostic errorCode.`)
  assert(caught.providerStage === expectedProviderStage, `${expectedCode} must expose a safe providerStage.`)
  assert(caught.upstreamStatus === expectedStatus, `${expectedCode} must expose a sanitized upstreamStatus.`)
  assert(caught.status === expectedStatus, `${expectedCode} must expose only a real upstream HTTP status.`)
  assert(providerErrorCodeValues.has(caught.errorCode), `${expectedCode} errorCode must use the safe enum.`)
  assert(providerStageValues.has(caught.providerStage), `${expectedCode} providerStage must use the safe enum.`)
  if (expectedErrorCode === 'API_FOOTBALL_PROVIDER_ERRORS') {
    assertProviderErrorKeys(
      caught.providerErrorKeys,
      expectedProviderErrorKeys ?? [],
      expectedCode,
    )
  } else {
    assert(
      !Object.prototype.hasOwnProperty.call(caught, 'providerErrorKeys'),
      `${expectedCode} must not expose providerErrorKeys for unrelated errors.`,
    )
  }
  assert(!caught.message.includes('test-key-not-real'), `${expectedCode} must not expose the API key.`)
}

await assertAdapterError(
  { ok: false, status: 401, payload: [] },
  'TEAM_FORM_API_UNAUTHORIZED',
  'API_FOOTBALL_AUTH_ERROR',
  'teams_search',
  401,
)
await assertAdapterError(
  { ok: false, status: 403, payload: [] },
  'TEAM_FORM_API_FORBIDDEN',
  'API_FOOTBALL_FORBIDDEN',
  'teams_search',
  403,
)
await assertAdapterError(
  { ok: false, status: 429, payload: [] },
  'TEAM_FORM_API_QUOTA_EXCEEDED',
  'API_FOOTBALL_RATE_LIMIT',
  'teams_search',
  429,
)
await assertAdapterError(
  { ok: false, status: 500, payload: [] },
  'TEAM_FORM_API_UPSTREAM_ERROR',
  'API_FOOTBALL_UPSTREAM_ERROR',
  'teams_search',
  500,
)
await assertAdapterError(
  { ok: false, status: 400, payload: [] },
  'TEAM_FORM_API_REQUEST_FAILED',
  'API_FOOTBALL_UPSTREAM_ERROR',
  'teams_search',
  400,
)
await assertAdapterError(
  { payload: { items: [] } },
  'TEAM_FORM_API_INVALID_RESPONSE',
  'API_FOOTBALL_DATA_UNAVAILABLE',
)
await assertAdapterError(
  { payload: null, jsonError: true },
  'TEAM_FORM_API_INVALID_RESPONSE',
  'API_FOOTBALL_INVALID_JSON',
  'parse_json',
)
await assertAdapterError(
  { payload: [], errors: { key: 'bad key' } },
  'TEAM_FORM_API_PROVIDER_ERROR',
  'API_FOOTBALL_PROVIDER_ERRORS',
  'teams_search',
  null,
  ['key'],
)

const sanitizedProviderKeysError = new ApiFootballTeamFormError(
  'TEAM_FORM_API_PROVIDER_ERROR',
  {
    providerErrorKeys: [
      'requests',
      'subscription',
      'plan',
      'access',
      'token',
      'parameters',
      'endpoint',
      'quota',
      'season',
      'league',
      'extra_one',
      'bad key',
      'x'.repeat(41),
      'requests',
      42,
    ],
  },
)
assertProviderErrorKeys(
  sanitizedProviderKeysError.providerErrorKeys,
  [
    'requests',
    'subscription',
    'plan',
    'access',
    'token',
    'parameters',
    'endpoint',
    'quota',
    'season',
    'league',
  ],
  'Sanitized provider error',
)

const sanitizedDiagnosticError = new ApiFootballTeamFormError(
  'TEAM_FORM_API_PROVIDER_ERROR',
  {
    errorCode: 'provider-secret-error',
    providerStage: 'provider-secret-stage',
    status: 0,
  },
)
assert(sanitizedDiagnosticError.errorCode === 'API_FOOTBALL_UPSTREAM_ERROR', 'Adapter errors must reject diagnostic error codes outside the safe enum.')
assert(sanitizedDiagnosticError.providerStage === 'unknown', 'Adapter errors must reject provider stages outside the safe enum.')
assert(sanitizedDiagnosticError.upstreamStatus === null, 'Adapter errors must reject values that are not upstream HTTP statuses.')

let unmatchedError = null
try {
  await fetchApiFootballTeamFormSnapshot({
    apiKey: 'test-key-not-real',
    teamNames: ['France'],
    timeoutMs: 100,
    fetchImpl: async (url) => {
      if (url.pathname === '/teams') {
        return createSupplierResponse({ payload: teamPayload(2, 'France B') })
      }
      return createSupplierResponse({ payload: [] })
    },
  })
} catch (error) {
  unmatchedError = error
}
assert(unmatchedError instanceof ApiFootballTeamFormError, 'Exact mismatch must use ApiFootballTeamFormError.')
assert(unmatchedError.code === 'TEAM_FORM_TEAM_UNMATCHED', 'Exact mismatch must normalize as TEAM_FORM_TEAM_UNMATCHED.')
assert(unmatchedError.errorCode === 'API_FOOTBALL_TEAM_UNMATCHED', 'Exact mismatch must expose a safe diagnostic errorCode.')
assert(unmatchedError.providerStage === 'teams_search', 'Exact mismatch must identify the teams search stage.')

let timeoutError = null
try {
  await fetchApiFootballTeamFormSnapshot({
    apiKey: 'test-key-not-real',
    teamNames: ['France'],
    timeoutMs: 5,
    fetchImpl: async (_url, options) =>
      new Promise((_resolve, reject) => {
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
assert(timeoutError instanceof ApiFootballTeamFormError, 'Timeout must use ApiFootballTeamFormError.')
assert(timeoutError.code === 'TEAM_FORM_API_TIMEOUT', 'Timeout must use TEAM_FORM_API_TIMEOUT.')
assert(timeoutError.errorCode === 'API_FOOTBALL_TIMEOUT', 'Timeout must expose a safe diagnostic errorCode.')
assert(timeoutError.providerStage === 'timeout', 'Timeout must identify the timeout stage.')

const serviceSnapshot = await getTeamFormSnapshot({
  fetchImpl: async () => ({
    ok: true,
    json: async () => disabledSnapshot,
  }),
})
assertDisabledShape(serviceSnapshot, 'getTeamFormSnapshot success response')
serviceSnapshot.teams.forEach((team, index) => assertTeamShape(team, `getTeamFormSnapshot team ${index}`))

const remoteServiceSnapshot = await getTeamFormSnapshot({
  fetchImpl: async () => ({
    ok: true,
    json: async () => adapterSnapshot,
  }),
})
assert(remoteServiceSnapshot.ok === true, 'Frontend team form service must accept the normalized remote snapshot.')
assert(remoteServiceSnapshot.disabled === false, 'Frontend team form service must preserve enabled remote state.')
assert(remoteServiceSnapshot.provider === 'api-football', 'Frontend team form service must preserve provider.')
assertTeamShape(remoteServiceSnapshot.teams[0], 'Frontend normalized remote team')

const missingTeamsSnapshot = await getTeamFormSnapshot({
  fetchImpl: async () => ({
    ok: true,
    json: async () => ({
      ...disabledSnapshot,
      teams: undefined,
    }),
  }),
})
assertDisabledShape(missingTeamsSnapshot, 'getTeamFormSnapshot missing teams response')
assert(missingTeamsSnapshot.teams.length === 0, 'getTeamFormSnapshot must tolerate missing teams.')

const failedServiceSnapshot = await getTeamFormSnapshot({
  fetchImpl: async () => {
    throw new Error('network failed')
  },
})
assert(failedServiceSnapshot.fallbackReason === 'TEAM_FORM_API_FAILED', 'getTeamFormSnapshot must fallback on request failure.')
assert(failedServiceSnapshot.ok === false, 'getTeamFormSnapshot fallback must keep ok=false.')
assert(failedServiceSnapshot.disabled === true, 'getTeamFormSnapshot fallback must keep disabled=true.')
assert(Array.isArray(failedServiceSnapshot.teams), 'getTeamFormSnapshot fallback teams must be an array.')

console.log('Team form API checks passed.')
