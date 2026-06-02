import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'

const mergePath = 'src/services/teamFormMerge.js'
const appPath = 'src/App.jsx'
const betEnginePath = 'src/services/betEngine.js'
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

assert(existsSync(mergePath), `${mergePath} must exist.`)

const mergeText = readText(mergePath)
const appText = readText(appPath)
const betEngineText = readText(betEnginePath)
const packageText = readText(packagePath)

assert(mergeText.includes('export function mergeTeamFormIntoMatches'), 'teamFormMerge must export mergeTeamFormIntoMatches.')
assert(!/teamFormMerge|mergeTeamFormIntoMatches|remoteTeamForm/.test(appText), 'App.jsx must not reference teamFormMerge or remoteTeamForm.')
assert(!/teamFormMerge|mergeTeamFormIntoMatches|remoteTeamForm/.test(betEngineText), 'BetEngine must not reference teamFormMerge or remoteTeamForm.')

const packageStatus = git(['status', '--short', '--', packagePath])
assert(!packageStatus, 'package.json must not be modified for team form merge helper.')

const packageJson = JSON.parse(packageText)
const dependencies = {
  ...(packageJson.dependencies ?? {}),
  ...(packageJson.devDependencies ?? {}),
}

assert(!Object.prototype.hasOwnProperty.call(dependencies, 'axios'), 'package.json must not add axios.')
assert(!Object.prototype.hasOwnProperty.call(dependencies, 'openai'), 'package.json must not add openai.')

const { mergeTeamFormIntoMatches } = await import('../src/services/teamFormMerge.js')

assert(typeof mergeTeamFormIntoMatches === 'function', 'mergeTeamFormIntoMatches must be importable.')

const baseMatch = Object.freeze({
  homeTeam: 'France',
  awayTeam: 'Senegal',
  localOdds: Object.freeze({ homeWin: 1.72 }),
  odds: Object.freeze({ home: 1.7 }),
  recommendation: Object.freeze({ level: 'light' }),
  scoreReference: Object.freeze(['2-1']),
  totalGoalsDirection: 'over25',
  remoteOdds: Object.freeze({ provider: 'mock' }),
})
const homeOnlyMatch = Object.freeze({
  homeTeam: Object.freeze({ id: 'Portugal', name: 'Portugal' }),
  awayTeam: Object.freeze({ id: 'Unknown Away', name: 'Unknown Away' }),
  localOdds: Object.freeze({ homeWin: 1.9 }),
  odds: Object.freeze({ home: 1.88 }),
  recommendation: Object.freeze({ level: 'watch' }),
  scoreReference: Object.freeze(['1-1']),
  totalGoalsDirection: 'under35',
  remoteOdds: Object.freeze({ provider: 'mock' }),
})
const unmatchedMatch = Object.freeze({
  homeTeam: 'Brazil',
  awayTeam: 'Morocco',
  localOdds: Object.freeze({ homeWin: 1.5 }),
  odds: Object.freeze({ home: 1.48 }),
  recommendation: Object.freeze({ level: 'watch' }),
  scoreReference: Object.freeze(['1-0']),
  totalGoalsDirection: 'under25',
  remoteOdds: Object.freeze({ provider: 'mock' }),
})
const matches = Object.freeze([baseMatch, homeOnlyMatch, unmatchedMatch])
const teamFormSnapshot = Object.freeze({
  ok: true,
  disabled: false,
  provider: 'mock',
  dataSource: 'mock',
  updatedAt: '2026-06-02T00:00:00.000Z',
  teams: Object.freeze([
    Object.freeze({
      teamName: 'France',
      formStatus: 'stable',
      confidence: 'medium',
      recentMatches: Object.freeze({
        sampleSize: null,
        wins: null,
        draws: null,
        losses: null,
        goalsFor: null,
        goalsAgainst: null,
      }),
      homeAwaySplit: Object.freeze({
        homeStatus: 'stable',
        awayStatus: 'mixed',
      }),
      scheduleLoad: Object.freeze({
        density: 'medium',
        restDays: null,
        travelRisk: 'low',
      }),
      trendFlags: Object.freeze(['attackRhythmReview']),
      riskFlags: Object.freeze(['realRecentMatchesMissing']),
      reviewPoints: Object.freeze(['fallback only']),
      fallbackReason: null,
    }),
    Object.freeze({
      teamName: 'Senegal',
      formStatus: 'unknown',
      confidence: 'low',
      recentMatches: Object.freeze({
        sampleSize: null,
        wins: null,
        draws: null,
        losses: null,
        goalsFor: null,
        goalsAgainst: null,
      }),
      homeAwaySplit: Object.freeze({
        homeStatus: 'unknown',
        awayStatus: 'unknown',
      }),
      scheduleLoad: Object.freeze({
        density: 'unknown',
        restDays: null,
        travelRisk: 'unknown',
      }),
      trendFlags: Object.freeze(['formTrendUnknown']),
      riskFlags: Object.freeze(['realFormUnavailable']),
      reviewPoints: Object.freeze(['fallback only']),
      fallbackReason: 'MOCK_FORM_MISSING',
    }),
    Object.freeze({
      teamName: 'Portugal',
      formStatus: 'mixed',
      confidence: 'low',
      recentMatches: Object.freeze({
        sampleSize: null,
        wins: null,
        draws: null,
        losses: null,
        goalsFor: null,
        goalsAgainst: null,
      }),
      homeAwaySplit: Object.freeze({
        homeStatus: 'stable',
        awayStatus: 'unknown',
      }),
      scheduleLoad: Object.freeze({
        density: 'high',
        restDays: null,
        travelRisk: 'medium',
      }),
      trendFlags: Object.freeze(['rotationPatternReview']),
      riskFlags: Object.freeze(['restDaysMissing']),
      reviewPoints: Object.freeze(['fallback only']),
      fallbackReason: 'MOCK_FORM_PARTIAL',
    }),
  ]),
})

function assertRemoteTeamSide(side, label) {
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
    assert(Object.prototype.hasOwnProperty.call(side, field), `${label} must include ${field}.`)
  }
}

function assertProtectedFields(resultMatch, originalMatch, label) {
  assert(resultMatch.localOdds === originalMatch.localOdds, `${label} must not overwrite localOdds.`)
  assert(resultMatch.odds === originalMatch.odds, `${label} must not overwrite odds.`)
  assert(resultMatch.recommendation === originalMatch.recommendation, `${label} must not overwrite recommendation.`)
  assert(resultMatch.scoreReference === originalMatch.scoreReference, `${label} must not overwrite scoreReference.`)
  assert(resultMatch.totalGoalsDirection === originalMatch.totalGoalsDirection, `${label} must not overwrite totalGoalsDirection.`)
  assert(resultMatch.remoteOdds === originalMatch.remoteOdds, `${label} must not overwrite remoteOdds.`)
}

const merged = mergeTeamFormIntoMatches(matches, teamFormSnapshot)

assert(Array.isArray(merged), 'merge result must be an array.')
assert(merged !== matches, 'merge result must be a new matches array.')
assert(matches[0] === baseMatch, 'original matches array must not be modified.')
assert(matches[0].remoteTeamForm === undefined, 'original match object must not receive remoteTeamForm.')
assert(merged[0] !== baseMatch, 'matched item must be returned as a new match object.')
assert(merged[0].remoteTeamForm, 'matched item must receive remoteTeamForm.')
assert(merged[0].remoteTeamForm.home, 'matched item must include home team form.')
assert(merged[0].remoteTeamForm.away, 'matched item must include away team form.')
assertRemoteTeamSide(merged[0].remoteTeamForm.home, 'remoteTeamForm.home')
assertRemoteTeamSide(merged[0].remoteTeamForm.away, 'remoteTeamForm.away')
assert(merged[0].remoteTeamForm.provider === 'mock', 'remoteTeamForm must include provider.')
assert(merged[0].remoteTeamForm.dataSource === 'mock', 'remoteTeamForm must include dataSource.')
assert(merged[0].remoteTeamForm.updatedAt === teamFormSnapshot.updatedAt, 'remoteTeamForm must include updatedAt.')
assert(merged[0].remoteTeamForm.home.recentMatches !== teamFormSnapshot.teams[0].recentMatches, 'home recentMatches must be cloned.')
assert(merged[0].remoteTeamForm.home.trendFlags !== teamFormSnapshot.teams[0].trendFlags, 'home trendFlags must be cloned.')
assert(merged[0].remoteTeamForm.away.riskFlags !== teamFormSnapshot.teams[1].riskFlags, 'away riskFlags must be cloned.')
assertProtectedFields(merged[0], baseMatch, 'matched item')

assert(merged[1] !== homeOnlyMatch, 'one-sided match must be returned as a new match object.')
assert(merged[1].remoteTeamForm.home, 'one-sided match must include matched home side.')
assert(merged[1].remoteTeamForm.away === null, 'one-sided match must keep missing away side as null.')
assertProtectedFields(merged[1], homeOnlyMatch, 'one-sided item')

assert(merged[2] === unmatchedMatch, 'unmatched item must be preserved.')
assert(merged[2].remoteTeamForm === undefined, 'unmatched item must not receive remoteTeamForm.')

const nameFallbackMerge = mergeTeamFormIntoMatches(
  [{ homeTeamName: 'France', awayTeamName: 'Senegal' }],
  teamFormSnapshot,
)
assert(nameFallbackMerge[0].remoteTeamForm?.home, 'merge must support homeTeamName fallback.')
assert(nameFallbackMerge[0].remoteTeamForm?.away, 'merge must support awayTeamName fallback.')

const disabledMerge = mergeTeamFormIntoMatches(matches, {
  ...teamFormSnapshot,
  disabled: true,
})
assert(disabledMerge !== matches, 'disabled snapshot must still return a shallow copied array.')
assert(disabledMerge[0] === baseMatch, 'disabled snapshot must not clone match objects.')
assert(disabledMerge[0].remoteTeamForm === undefined, 'disabled snapshot must not attach remoteTeamForm.')

const missingTeamsMerge = mergeTeamFormIntoMatches(matches, {
  ...teamFormSnapshot,
  teams: undefined,
})
assert(missingTeamsMerge !== matches, 'missing teams must still return a shallow copied array.')
assert(missingTeamsMerge[0] === baseMatch, 'missing teams must not clone match objects.')
assert(missingTeamsMerge[0].remoteTeamForm === undefined, 'missing teams must not attach remoteTeamForm.')

const invalidTeamsMerge = mergeTeamFormIntoMatches(matches, {
  ...teamFormSnapshot,
  teams: {},
})
assert(invalidTeamsMerge !== matches, 'non-array teams must still return a shallow copied array.')
assert(invalidTeamsMerge[0].remoteTeamForm === undefined, 'non-array teams must not attach remoteTeamForm.')

const nonArrayMerge = mergeTeamFormIntoMatches(null, teamFormSnapshot)
assert(Array.isArray(nonArrayMerge) && nonArrayMerge.length === 0, 'non-array matches must return an empty array.')

console.log('Team form merge checks passed.')
