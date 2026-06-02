import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'

const apiPath = 'api/team-form.js'
const servicePath = 'src/services/teamFormApi.js'
const mockPath = 'src/data/mockTeamFormSnapshot.js'
const appPath = 'src/App.jsx'
const betEnginePath = 'src/services/betEngine.js'
const packagePath = 'package.json'
const apiMatchesPath = 'api/matches.js'
const apiOddsPath = 'api/odds.js'
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

for (const path of [
  apiPath,
  servicePath,
  mockPath,
  appPath,
  betEnginePath,
  packagePath,
]) {
  assert(existsSync(path), `${path} must exist.`)
}

const apiText = readText(apiPath)
const serviceText = readText(servicePath)
const mockText = readText(mockPath)
const appText = readText(appPath)
const betEngineText = readText(betEnginePath)
const packageText = readText(packagePath)

assert(!/\bfetch\s*\(/.test(apiText), 'Team form API endpoint must not fetch an external supplier.')
assert(!/axios|rapidapi|api-football|football-data|sportmonks|statsbomb|opta|wyscout/i.test(apiText), 'Team form API endpoint must not mention an external supplier.')
assert(!/process\.env|import\.meta\.env|API_KEY|TOKEN|SECRET|X-Auth-Token/i.test(apiText), 'Team form API endpoint must not read provider credentials.')
assert(!new RegExp(`${databaseUrlToken}|@neondatabase|SNAPSHOT_WRITE|internal/snapshots|analysis_snapshots`, 'i').test(apiText), 'Team form API endpoint must not touch database or snapshot writes.')
assert(!/openai|\bgpt\b/i.test(apiText), 'Team form API endpoint must not mention OpenAI or GPT.')
assert(apiText.includes('../src/data/mockTeamFormSnapshot.js'), 'Team form API endpoint must read the local mock team form snapshot.')
assert(!/import\(/.test(apiText), 'Team form API endpoint must not dynamically import provider clients.')
for (const match of apiText.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
  assert(match[1] === '../src/data/mockTeamFormSnapshot.js', 'Team form API endpoint may only import the local mock team form snapshot.')
}

assert(!/teamFormApi|getTeamFormSnapshot|api\/team-form/.test(appText), 'App.jsx must not reference teamFormApi or /api/team-form.')
assert(!/teamFormApi|getTeamFormSnapshot|api\/team-form/.test(betEngineText), 'BetEngine must not reference teamFormApi or /api/team-form.')
assert(serviceText.includes("'/api/team-form'") || serviceText.includes('"/api/team-form"'), 'teamFormApi.js must request /api/team-form.')
assert(!/src\/services\/teamFormApi|src\\services\\teamFormApi/.test(apiText), 'Team form API endpoint must not import frontend team form service.')
assert(!/openai|\bgpt\b/i.test(mockText), 'Mock team form snapshot must not mention OpenAI or GPT.')

for (const path of [packagePath, apiMatchesPath, apiOddsPath]) {
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
const { createFallbackTeamFormSnapshot, getTeamFormSnapshot } = await import('../src/services/teamFormApi.js')
const { createMockTeamFormSnapshot } = await import('../src/data/mockTeamFormSnapshot.js')

const formStatusValues = new Set(['strong', 'stable', 'mixed', 'weak', 'unknown'])
const confidenceValues = new Set(['high', 'medium', 'low'])
const loadValues = new Set(['low', 'medium', 'high', 'unknown'])
const positivePattern = /guarantee|guaranteed|lock|sure|profit|boost|bonus|positive|must.?bet|recommend|pick|stake|bankroll|guaranteedWin|sureWin|increaseScore|raiseScore|bestBet|heavy/i

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
}

function assertDisabledShape(snapshot, label) {
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
  assert(snapshot.fallbackReason === 'TEAM_FORM_API_DISABLED', `${label} must keep TEAM_FORM_API_DISABLED.`)
  assert(Array.isArray(snapshot.teams), `${label} teams must be an array.`)
}

function assertTeamShape(team, label) {
  for (const field of [
    'teamName',
    'formStatus',
    'confidence',
    'recentMatches',
    'homeAwaySplit',
    'scheduleLoad',
    'trendFlags',
    'riskFlags',
    'reviewPoints',
    'fallbackReason',
  ]) {
    assert(Object.prototype.hasOwnProperty.call(team, field), `${label} must include ${field}.`)
  }

  assert(typeof team.teamName === 'string' && team.teamName, `${label} must include teamName.`)
  assert(formStatusValues.has(team.formStatus), `${label} formStatus must use the allowed enum.`)
  assert(confidenceValues.has(team.confidence), `${label} confidence must use the allowed enum.`)
  assert(['sampleSize', 'wins', 'draws', 'losses', 'goalsFor', 'goalsAgainst'].every((field) => Object.prototype.hasOwnProperty.call(team.recentMatches, field)), `${label} recentMatches must include all fields.`)
  assert(formStatusValues.has(team.homeAwaySplit.homeStatus), `${label} homeStatus must use the allowed enum.`)
  assert(formStatusValues.has(team.homeAwaySplit.awayStatus), `${label} awayStatus must use the allowed enum.`)
  assert(loadValues.has(team.scheduleLoad.density), `${label} schedule density must use the allowed enum.`)
  assert(Object.prototype.hasOwnProperty.call(team.scheduleLoad, 'restDays'), `${label} scheduleLoad must include restDays.`)
  assert(loadValues.has(team.scheduleLoad.travelRisk), `${label} travelRisk must use the allowed enum.`)
  assert(Array.isArray(team.trendFlags), `${label} trendFlags must be an array.`)
  assert(Array.isArray(team.riskFlags), `${label} riskFlags must be an array.`)
  assert(Array.isArray(team.reviewPoints), `${label} reviewPoints must be an array.`)

  for (const trendFlag of team.trendFlags) {
    assert(typeof trendFlag === 'string', `${label} trendFlags must be strings.`)
    assert(!positivePattern.test(trendFlag), `${label} trendFlags must not contain direct recommendation semantics.`)
  }

  for (const riskFlag of team.riskFlags) {
    assert(typeof riskFlag === 'string', `${label} riskFlags must be strings.`)
    assert(!positivePattern.test(riskFlag), `${label} riskFlags must not contain positive scoring semantics.`)
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

const mockSnapshot = createMockTeamFormSnapshot()
assertMockSnapshot(mockSnapshot, 'createMockTeamFormSnapshot')

const disabledSnapshot = createDisabledTeamFormSnapshot()
assertDisabledShape(disabledSnapshot, 'createDisabledTeamFormSnapshot')
assert(disabledSnapshot.provider === 'mock', 'Disabled team form snapshot must use mock provider while disabled.')
assert(disabledSnapshot.dataSource === 'mock', 'Disabled team form snapshot must use mock dataSource while disabled.')
assert(disabledSnapshot.teams.length === mockSnapshot.teams.length, 'Disabled team form snapshot must expose mock fallback teams.')
assert(disabledSnapshot.meta.schemaVersion === 'team-form-snapshot-v1', 'Disabled team form snapshot must expose the schema version.')

const fallbackSnapshot = createFallbackTeamFormSnapshot()
assertDisabledShape(fallbackSnapshot, 'createFallbackTeamFormSnapshot')
assert(fallbackSnapshot.provider === 'none', 'Service fallback must use provider=none.')
assert(fallbackSnapshot.dataSource === 'disabled', 'Service fallback must use dataSource=disabled.')

const getResponse = createMockResponse()
await handler({ method: 'GET' }, getResponse)
assert(getResponse.statusCode === 200, 'GET /api/team-form must return 200.')
assertDisabledShape(getResponse.body, 'GET /api/team-form response')
assert(getResponse.body.teams.length === mockSnapshot.teams.length, 'GET /api/team-form must return mock fallback teams.')

const postResponse = createMockResponse()
await handler({ method: 'POST' }, postResponse)
assert(postResponse.statusCode === 405, 'Non-GET /api/team-form must return 405.')
assert(postResponse.headers.Allow === 'GET', 'Non-GET /api/team-form must expose Allow: GET.')
assertDisabledShape(postResponse.body, 'Non-GET /api/team-form response')

const serviceSnapshot = await getTeamFormSnapshot({
  fetchImpl: async () => ({
    ok: true,
    json: async () => disabledSnapshot,
  }),
})
assertDisabledShape(serviceSnapshot, 'getTeamFormSnapshot success response')
serviceSnapshot.teams.forEach((team, index) => assertTeamShape(team, `getTeamFormSnapshot team ${index}`))

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
