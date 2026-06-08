import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'

const matchApiPath = 'src/services/matchApi.js'
const appPath = 'src/App.jsx'
const betEnginePath = 'src/services/betEngine.js'
const teamFormMergePath = 'src/services/teamFormMerge.js'
const apiMatchesPath = 'api/matches.js'
const apiTeamFormPath = 'api/team-form.js'
const adapterPath = 'api/providers/apiFootballTeamFormAdapter.js'
const packagePath = 'package.json'
const databaseUrlToken = 'DATABASE_' + 'URL'
const allowedModifiedPaths = new Set([
  'src/services/betEngine.js',
  'scripts/check-bet-engine.mjs',
  'scripts/check-match-team-form-integration.mjs',
])
const knownIgnoredEnvFiles = new Set(['.env.local'])

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function readText(path) {
  return readFileSync(path, 'utf8')
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

function gitCheckIgnore(path) {
  try {
    execFileSync('git', ['check-ignore', '--quiet', '--', path])
    return true
  } catch {
    return false
  }
}

function assertEnvFileBoundary() {
  const envFileNames = readdirSync('.', { withFileTypes: true })
    .filter((entry) =>
      entry.isFile() &&
      (entry.name === '.env' || entry.name.startsWith('.env.')),
    )
    .map((entry) => entry.name)
  const untrackedEnvFiles = execFileSync(
    'git',
    ['ls-files', '--others', '--exclude-standard', '--', '.env', '.env.*'],
    { encoding: 'utf8' },
  )
    .trim()
    .split('\n')
    .filter(Boolean)

  assert(
    untrackedEnvFiles.length === 0,
    'New untracked .env files are not allowed.',
  )

  let ignoredEnvFileCount = 0
  for (const envFileName of envFileNames) {
    const tracked = Boolean(git(['ls-files', '--', envFileName]))
    const ignored = gitCheckIgnore(envFileName)

    assert(
      tracked || ignored,
      `${envFileName} must be tracked or explicitly ignored.`,
    )
    assert(
      !git(['status', '--short', '--', envFileName]),
      `${envFileName} must not be modified.`,
    )

    if (ignored) {
      ignoredEnvFileCount += 1
      assert(
        knownIgnoredEnvFiles.has(envFileName),
        'Only the pre-existing ignored .env.local file is allowed.',
      )
    }
  }

  if (ignoredEnvFileCount > 0) {
    console.log(`Ignored .env files present: ${ignoredEnvFileCount}; contents not inspected.`)
  }
}

assertEnvFileBoundary()

for (const path of [
  matchApiPath,
  appPath,
  betEnginePath,
  teamFormMergePath,
  apiMatchesPath,
  apiTeamFormPath,
  adapterPath,
  packagePath,
]) {
  assert(existsSync(path), `${path} must exist.`)
}

const matchApiText = readText(matchApiPath)
const appText = readText(appPath)
const betEngineText = readText(betEnginePath)
const teamFormMergeText = readText(teamFormMergePath)
const apiMatchesText = readText(apiMatchesPath)
const apiTeamFormText = readText(apiTeamFormPath)
const adapterText = readText(adapterPath)
const packageText = readText(packagePath)

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
  matchApiPath,
  appPath,
  teamFormMergePath,
  apiMatchesPath,
  apiTeamFormPath,
  adapterPath,
  packagePath,
]) {
  const status = git(['status', '--short', '--', path])
  assert(!status, `${path} must not be modified.`)
}

assert(matchApiText.includes("import { getTeamFormSnapshot } from './teamFormApi'"), 'matchApi must import getTeamFormSnapshot from teamFormApi.')
assert(matchApiText.includes("import { mergeTeamFormIntoMatches } from './teamFormMerge'"), 'matchApi must import mergeTeamFormIntoMatches from teamFormMerge.')
assert(!/fetch\s*\(/.test(matchApiText), 'matchApi must not fetch team form directly.')
assert(!/['"]\/api\/team-form['"]/.test(matchApiText), 'matchApi must not reference /api/team-form directly.')
assert(/async function attachRemoteTeamForm/.test(matchApiText), 'matchApi must isolate team form attachment in attachRemoteTeamForm.')
assert(/attachRemoteTeamForm\(\s*await attachRemoteOdds\(/.test(matchApiText), 'matchApi must attach team form after preserving remote odds attachment.')
assert(matchApiText.includes('teamFormMeta'), 'matchApi must expose teamFormMeta when team form attachment completes.')

const attachRemoteTeamFormBlock = matchApiText.match(/async function attachRemoteTeamForm[\s\S]*?\n}\n\nfunction createOddsMeta/)
assert(attachRemoteTeamFormBlock, 'matchApi must keep attachRemoteTeamForm guarded before odds metadata helpers.')
assert(/try\s*{[\s\S]*getTeamFormSnapshot\(\)[\s\S]*mergeTeamFormIntoMatches\([\s\S]*catch/.test(attachRemoteTeamFormBlock[0]), 'team form attachment must be guarded by try/catch.')
assert(/catch\s*\([^)]*\)\s*{[\s\S]*return snapshot/.test(attachRemoteTeamFormBlock[0]), 'team form attachment must return the current snapshot on failure.')
assert(!/\bdataSource\s*:/.test(attachRemoteTeamFormBlock[0]), 'attachRemoteTeamForm must not overwrite snapshot.dataSource.')
assert(!/\bprovider\s*:/.test(attachRemoteTeamFormBlock[0]), 'attachRemoteTeamForm must not overwrite snapshot.provider.')
assert(!/\bmeta\s*:/.test(attachRemoteTeamFormBlock[0]), 'attachRemoteTeamForm must not overwrite snapshot.meta.')

for (const field of [
  'odds',
  'localOdds',
  'remoteOdds',
  'recommendation',
  'scoreReference',
  'totalGoalsDirection',
  'betScore',
  'recommendLevel',
  'stake',
  'stakePlan',
]) {
  assert(!new RegExp(`\\b${field}\\s*:`).test(attachRemoteTeamFormBlock[0]), `attachRemoteTeamForm must not assign match.${field}.`)
  assert(!new RegExp(`\\.${field}\\s*=`).test(attachRemoteTeamFormBlock[0]), `attachRemoteTeamForm must not mutate match.${field}.`)
}

assert(!/remoteTeamForm/.test(appText), 'App.jsx must not read remoteTeamForm.')
assert(
  betEngineText.includes('export function getRemoteTeamFormSignal'),
  'BetEngine must isolate remote team form reads in getRemoteTeamFormSignal.',
)
assert(
  betEngineText.includes("const REMOTE_TEAM_FORM_KEY = ['remote', 'TeamForm'].join('')"),
  'BetEngine must use a single guarded remote team form key.',
)
assert(
  !/(rawResponse|upstreamBody|providerErrors|apiKey|API_FOOTBALL_KEY|\.headers\b)/.test(
    betEngineText,
  ),
  'BetEngine must not read raw provider payloads, headers, credentials, or provider error values.',
)
assert(
  betEngineText.includes('MAX_TEAM_FORM_RISK_PENALTY = 5') &&
    betEngineText.includes('MAX_TEAM_FORM_INFO_PENALTY = 7'),
  'BetEngine must cap team form risk and information penalties.',
)
assert(
  betEngineText.includes('preTeamFormBetScore') &&
    betEngineText.includes('directionScoreResult'),
  'BetEngine must preserve the pre-team-form public and direction baselines.',
)
assert(!/teamFormMeta/.test(appText), 'App.jsx must not read teamFormMeta.')
assert(!/teamFormMeta/.test(betEngineText), 'BetEngine must not read teamFormMeta.')
assert(!/getTeamFormSnapshot|api\/team-form|API_FOOTBALL_KEY|TEAM_FORM_API_ENABLED|TEAM_FORM_PROVIDER/.test(appText), 'App.jsx must not connect team form provider state.')
assert(!/getTeamFormSnapshot|api\/team-form|API_FOOTBALL_KEY|TEAM_FORM_API_ENABLED|TEAM_FORM_PROVIDER/.test(betEngineText), 'BetEngine must not connect team form provider state.')
assert(!/remoteTeamForm|API_FOOTBALL_KEY|TEAM_FORM_API_ENABLED|TEAM_FORM_PROVIDER/.test(apiMatchesText), 'api/matches.js must remain provider-independent.')

assert(apiTeamFormText.includes('./providers/apiFootballTeamFormAdapter.js'), 'Team form API endpoint must use the server-side adapter.')
assert(apiTeamFormText.includes('process.env.API_FOOTBALL_KEY'), 'Team form API endpoint may read the server key.')
assert(apiTeamFormText.includes('process.env.TEAM_FORM_API_ENABLED'), 'Team form API endpoint must keep the enabled gate.')
assert(apiTeamFormText.includes('process.env.TEAM_FORM_PROVIDER'), 'Team form API endpoint must keep the provider gate.')
assert(!/src\/services\/teamFormApi|src\\services\\teamFormApi/.test(apiTeamFormText), 'Team form API endpoint must not import frontend team form service.')
assert(!/process\.env|import\.meta\.env/.test(adapterText), 'Team form provider adapter must not read env directly.')
assert(!/bookmakers|mainMarkets|handicap|totalGoals|oddsConfidence/i.test(adapterText), 'Team form provider adapter must not add odds structures.')

assert(teamFormMergeText.includes('comparison: createComparison()'), 'teamFormMerge must keep comparison as the local unknown structure.')
assert(teamFormMergeText.includes("formEdge: 'unknown'"), 'teamFormMerge must keep formEdge unknown.')
assert(teamFormMergeText.includes("attackEdge: 'unknown'"), 'teamFormMerge must keep attackEdge unknown.')
assert(teamFormMergeText.includes("defenseEdge: 'unknown'"), 'teamFormMerge must keep defenseEdge unknown.')
assert(teamFormMergeText.includes("volatilityRisk: 'unknown'"), 'teamFormMerge must keep volatilityRisk unknown.')
assert(!/betScore|recommendLevel|stakePlan|scoreReference|mainPick|secondaryPick/.test(teamFormMergeText), 'teamFormMerge must not affect recommendation, score, or stake fields.')

assert(!/openai|\bgpt\b/i.test(apiTeamFormText), 'Team form API endpoint must not mention OpenAI or GPT.')
assert(!/openai|\bgpt\b/i.test(adapterText), 'Team form adapter must not mention OpenAI or GPT.')
assert(!/openai|\bgpt\b/i.test(packageText), 'package.json must not add OpenAI or GPT dependencies.')
assert(!new RegExp(`${databaseUrlToken}|@neondatabase|SNAPSHOT_WRITE|internal/snapshots|analysis_snapshots`, 'i').test(apiTeamFormText), 'Team form API endpoint must not touch database or snapshot writes.')
assert(!new RegExp(`${databaseUrlToken}|@neondatabase|SNAPSHOT_WRITE|internal/snapshots|analysis_snapshots`, 'i').test(adapterText), 'Team form adapter must not touch database or snapshot writes.')

const packageJson = JSON.parse(packageText)
const dependencies = {
  ...(packageJson.dependencies ?? {}),
  ...(packageJson.devDependencies ?? {}),
}

assert(!Object.prototype.hasOwnProperty.call(dependencies, 'axios'), 'package.json must not add axios.')
assert(!Object.prototype.hasOwnProperty.call(dependencies, 'openai'), 'package.json must not add openai.')

const [
  { default: buildBetPlan, getRemoteTeamFormSignal },
  { mergeTeamFormIntoMatches },
] = await Promise.all([
  import('../src/services/betEngine.js'),
  import('../src/services/teamFormMerge.js'),
])

const baseMatch = Object.freeze({
  id: 'team-form-integration',
  homeTeam: Object.freeze({
    name: 'France',
    shortName: 'France',
    teamStrength: 78,
    recentForm: 74,
    attackRating: 75,
    defenseRating: 73,
  }),
  awayTeam: Object.freeze({
    name: 'Senegal',
    shortName: 'Senegal',
    teamStrength: 64,
    recentForm: 63,
    attackRating: 65,
    defenseRating: 64,
  }),
  kickoffTime: '2026-06-20T12:00:00.000Z',
  localOdds: Object.freeze({
    homeWin: 1.72,
    draw: 3.7,
    awayWin: 5.1,
    over25: 1.82,
    under25: 2.02,
    scoreReference: '2-1 / 1-0',
    totalGoalsDirection: 'over25',
  }),
  odds: Object.freeze({
    home: 1.72,
    draw: 3.7,
    away: 5.1,
    over25: 1.82,
    under25: 2.02,
  }),
  recommendation: Object.freeze({
    direction: 'home',
    level: 'standard',
  }),
  model: Object.freeze({
    home: 0.64,
    draw: 0.22,
    away: 0.14,
    powerDiff: 12,
  }),
  totalGoals: Object.freeze({
    model: Object.freeze({
      over25Probability: 0.57,
      under25Probability: 0.43,
    }),
  }),
})

function teamFormSide(teamName, overrides = {}) {
  return Object.freeze({
    status: 'fallback',
    teamName,
    formStatus: 'unknown',
    formTrend: 'unknown',
    confidence: 'low',
    recentMatches: Object.freeze({
      sampleSize: null,
      wins: null,
      draws: null,
      losses: null,
      goalsFor: null,
      goalsAgainst: null,
    }),
    recentResults: Object.freeze([]),
    attackTrend: 'unknown',
    defenseTrend: 'unknown',
    volatility: 'unknown',
    dataQuality: 'low',
    homeAwaySplit: Object.freeze({
      homeStatus: 'unknown',
      awayStatus: 'unknown',
    }),
    scheduleLoad: Object.freeze({
      density: 'unknown',
      restDays: null,
      travelRisk: 'unknown',
    }),
    trendFlags: Object.freeze([]),
    riskFlags: Object.freeze(['realFormUnavailable']),
    reviewPoints: Object.freeze(['fallback only']),
    riskNotes: Object.freeze([]),
    fallbackReason: 'TEAM_FORM_API_PROVIDER_ERROR',
    rawAvailable: false,
    ...overrides,
  })
}

const fallbackSnapshot = Object.freeze({
  ok: false,
  disabled: false,
  status: 'fallback',
  provider: 'api-football',
  dataSource: 'mock',
  updatedAt: new Date().toISOString(),
  fallbackReason: 'TEAM_FORM_API_PROVIDER_ERROR',
  rawAvailable: false,
  teams: Object.freeze([
    teamFormSide('France'),
    teamFormSide('Senegal'),
  ]),
})

const [mergedMatch] = mergeTeamFormIntoMatches([baseMatch], fallbackSnapshot)
assert(mergedMatch !== baseMatch, 'Matched fallback data must return a new match object.')
assert(mergedMatch.remoteTeamForm, 'Merged match must expose remoteTeamForm to BetEngine.')
assert(mergedMatch.homeTeam === baseMatch.homeTeam, 'Fallback merge must preserve homeTeam.')
assert(mergedMatch.awayTeam === baseMatch.awayTeam, 'Fallback merge must preserve awayTeam.')
assert(mergedMatch.odds === baseMatch.odds, 'Fallback merge must preserve odds.')
assert(mergedMatch.localOdds === baseMatch.localOdds, 'Fallback merge must preserve localOdds.')
assert(
  mergedMatch.recommendation === baseMatch.recommendation,
  'Fallback merge must preserve the existing recommendation.',
)

const planOptions = {
  bankroll: 10000,
  maxStakePerMatch: 500,
}
const baselinePlan = buildBetPlan(baseMatch, planOptions)
const fallbackPlan = buildBetPlan(mergedMatch, planOptions)
const signal = getRemoteTeamFormSignal(mergedMatch)

assert(signal.hasRemoteTeamForm === true, 'BetEngine must read match.remoteTeamForm.')
assert(signal.infoPenalty > 0, 'Fallback team form must produce only a penalty or warning.')
assert(fallbackPlan.betScore <= baselinePlan.betScore, 'Fallback team form must not increase betScore.')
assert(fallbackPlan.totalStake <= baselinePlan.totalStake, 'Fallback team form must not increase stake.')
assert(
  JSON.stringify(fallbackPlan.mainPick) === JSON.stringify(baselinePlan.mainPick),
  'Team form must not change the public main pick.',
)
assert(
  JSON.stringify(fallbackPlan.secondaryPick) ===
    JSON.stringify(baselinePlan.secondaryPick),
  'Team form must not change the public secondary pick.',
)
assert(
  JSON.stringify(fallbackPlan.scorePicks.map(({ score }) => score)) ===
    JSON.stringify(baselinePlan.scorePicks.map(({ score }) => score)),
  'Team form must not change public score predictions.',
)
assert(
  fallbackPlan.valueEdge.totalGoals.bestDirection ===
    baselinePlan.valueEdge.totalGoals.bestDirection,
  'Team form must not change the total-goals direction.',
)
assert(
  fallbackPlan.publicSummary === baselinePlan.publicSummary,
  'Team form must not change the public recommendation summary.',
)

const providerErrorValue = 'PROVIDER_ERROR_VALUE_MUST_NOT_LEAK'
const providerErrorMatch = {
  ...mergedMatch,
  remoteTeamForm: {
    ...mergedMatch.remoteTeamForm,
    meta: {
      error: 'TEAM_FORM_API_PROVIDER_ERROR',
      errorCode: 'API_FOOTBALL_PROVIDER_ERRORS',
      providerStage: 'provider_errors',
      providerErrorKeys: ['plan'],
      providerErrors: {
        plan: providerErrorValue,
      },
    },
    errors: {
      plan: providerErrorValue,
    },
    rawResponse: {
      sentinel: 'RAW_RESPONSE_MUST_NOT_LEAK',
    },
    headers: {
      authorization: 'HEADER_MUST_NOT_LEAK',
    },
    apiKey: 'API_KEY_MUST_NOT_LEAK',
  },
}
const providerErrorPlan = buildBetPlan(providerErrorMatch, planOptions)
const providerErrorSignal = getRemoteTeamFormSignal(providerErrorMatch)
const providerErrorOutput = JSON.stringify({
  signal: providerErrorSignal,
  internalAnalysis: providerErrorPlan.internalAnalysis,
  dataQuality: providerErrorPlan.dataQuality,
  cancelRules: providerErrorPlan.cancelRules,
})

assert(
  providerErrorSignal.meta.providerErrorKeys.includes('plan'),
  'BetEngine must retain only the safe provider error key.',
)
assert(
  providerErrorPlan.scoreBreakdown.infoPenalty.reason.includes('套餐限制'),
  'Provider plan limits must produce a safe Chinese explanation.',
)
for (const forbiddenValue of [
  providerErrorValue,
  'RAW_RESPONSE_MUST_NOT_LEAK',
  'HEADER_MUST_NOT_LEAK',
  'API_KEY_MUST_NOT_LEAK',
]) {
  assert(
    !providerErrorOutput.includes(forbiddenValue),
    `BetEngine output must not expose ${forbiddenValue}.`,
  )
}

console.log('Match team form integration checks passed.')
