import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'

const mergePath = 'src/services/oddsMerge.js'
const appPath = 'src/App.jsx'
const betEnginePath = 'src/services/betEngine.js'
const matchApiPath = 'src/services/matchApi.js'
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

function assertStandardMarketsShape(markets, label) {
  assert(markets && typeof markets === 'object', `${label} markets must be an object.`)
  assert(markets.matchWinner && typeof markets.matchWinner === 'object', `${label} markets.matchWinner must exist.`)
  assert(markets.asianHandicap && typeof markets.asianHandicap === 'object', `${label} markets.asianHandicap must exist.`)
  assert(markets.overUnder && typeof markets.overUnder === 'object', `${label} markets.overUnder must exist.`)
  assert(['home', 'draw', 'away'].every((field) => Object.prototype.hasOwnProperty.call(markets.matchWinner, field)), `${label} markets.matchWinner must include home/draw/away.`)
  assert(['line', 'homeOdds', 'awayOdds'].every((field) => Object.prototype.hasOwnProperty.call(markets.asianHandicap, field)), `${label} markets.asianHandicap must include line/homeOdds/awayOdds.`)
  assert(['line', 'overOdds', 'underOdds'].every((field) => Object.prototype.hasOwnProperty.call(markets.overUnder, field)), `${label} markets.overUnder must include line/overOdds/underOdds.`)
}

assert(existsSync(mergePath), `${mergePath} must exist.`)

const mergeText = readText(mergePath)
const appText = readText(appPath)
const betEngineText = readText(betEnginePath)
const matchApiText = readText(matchApiPath)
const packageText = readText(packagePath)

assert(mergeText.includes('export function mergeOddsIntoMatches'), 'oddsMerge must export mergeOddsIntoMatches.')
assert(!/oddsMerge|mergeOddsIntoMatches/.test(appText), 'App.jsx must not reference oddsMerge.')
assert(!/oddsMerge|mergeOddsIntoMatches|remoteOdds/.test(betEngineText), 'BetEngine must not reference oddsMerge or remoteOdds.')
assert(!/remoteOdds/.test(matchApiText), 'matchApi must not read or write remoteOdds directly.')

const packageStatus = git(['status', '--short', '--', packagePath])
assert(!packageStatus, 'package.json must not be modified for odds merge helper.')

const packageJson = JSON.parse(packageText)
const dependencies = {
  ...(packageJson.dependencies ?? {}),
  ...(packageJson.devDependencies ?? {}),
}

assert(!Object.prototype.hasOwnProperty.call(dependencies, 'axios'), 'package.json must not add axios.')
assert(!Object.prototype.hasOwnProperty.call(dependencies, 'openai'), 'package.json must not add openai.')

const { mergeOddsIntoMatches } = await import('../src/services/oddsMerge.js')

assert(typeof mergeOddsIntoMatches === 'function', 'mergeOddsIntoMatches must be importable.')

const baseMatch = Object.freeze({
  matchKey: 'France__Senegal',
  homeTeam: 'France',
  awayTeam: 'Senegal',
  localOdds: Object.freeze({ homeWin: 1.72 }),
  odds: Object.freeze({ home: 1.7 }),
  recommendation: Object.freeze({ level: 'light' }),
  scoreReference: Object.freeze(['2-1']),
  totalGoalsDirection: 'over25',
})
const unmatchedMatch = Object.freeze({
  homeTeam: 'Brazil',
  awayTeam: 'Morocco',
  localOdds: Object.freeze({ homeWin: 1.5 }),
  odds: Object.freeze({ home: 1.48 }),
  recommendation: Object.freeze({ level: 'watch' }),
  scoreReference: Object.freeze(['1-1']),
  totalGoalsDirection: 'under35',
})
const matches = Object.freeze([baseMatch, unmatchedMatch])
const oddsSnapshot = Object.freeze({
  ok: true,
  disabled: false,
  provider: 'mock',
  dataSource: 'mock',
  updatedAt: '2026-06-02T00:00:00.000Z',
  markets: Object.freeze([
    Object.freeze({
      status: 'mock',
      matchKey: 'France__Senegal',
      homeTeam: 'France',
      awayTeam: 'Senegal',
      marketStatus: 'available',
      marketTone: 'neutral',
      favoriteSide: 'home',
      oddsConfidence: 'medium',
      mainMarkets: Object.freeze({
        homeWin: 1.72,
        draw: 3.55,
        awayWin: 5.1,
      }),
      handicap: Object.freeze({
        line: -0.75,
        home: null,
        away: null,
      }),
      totalGoals: Object.freeze({
        line: 2.5,
        over: null,
        under: null,
      }),
      markets: Object.freeze({
        matchWinner: Object.freeze({
          home: 1.72,
          draw: 3.55,
          away: 5.1,
        }),
        asianHandicap: Object.freeze({
          line: -0.75,
          homeOdds: null,
          awayOdds: null,
        }),
        overUnder: Object.freeze({
          line: 2.5,
          overOdds: null,
          underOdds: null,
        }),
      }),
      marketMovement: Object.freeze({
        favoriteTrend: 'stable',
        totalGoalsTrend: 'unknown',
      }),
      valueFlags: Object.freeze([]),
      riskFlags: Object.freeze(['mockOnly', 'marketMovementMissing']),
      reviewPoints: Object.freeze(['fallback only']),
      riskNotes: Object.freeze([]),
      fallbackReason: null,
      rawAvailable: false,
    }),
  ]),
})

const merged = mergeOddsIntoMatches(matches, oddsSnapshot)

assert(Array.isArray(merged), 'merge result must be an array.')
assert(merged !== matches, 'merge result must be a new matches array.')
assert(matches[0] === baseMatch, 'original matches array must not be modified.')
assert(matches[0].remoteOdds === undefined, 'original match object must not receive remoteOdds.')
assert(merged[0] !== baseMatch, 'matched item must be returned as a new match object.')
assert(merged[0].remoteOdds, 'matched item must receive remoteOdds.')
assert(merged[1] === unmatchedMatch, 'unmatched item must be preserved.')
assert(merged[1].remoteOdds === undefined, 'unmatched item must not receive remoteOdds.')

assert(merged[0].localOdds === baseMatch.localOdds, 'merge must not overwrite localOdds.')
assert(merged[0].odds === baseMatch.odds, 'merge must not overwrite odds.')
assert(merged[0].recommendation === baseMatch.recommendation, 'merge must not overwrite recommendation.')
assert(merged[0].scoreReference === baseMatch.scoreReference, 'merge must not overwrite scoreReference.')
assert(merged[0].totalGoalsDirection === baseMatch.totalGoalsDirection, 'merge must not overwrite totalGoalsDirection.')

for (const field of [
  'status',
  'provider',
  'dataSource',
  'updatedAt',
  'matchKey',
  'homeTeam',
  'awayTeam',
  'marketStatus',
  'marketTone',
  'favoriteSide',
  'oddsConfidence',
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
  assert(Object.prototype.hasOwnProperty.call(merged[0].remoteOdds, field), `remoteOdds must include ${field}.`)
}

assert(merged[0].remoteOdds.provider === 'mock', 'remoteOdds must include provider.')
assert(merged[0].remoteOdds.dataSource === 'mock', 'remoteOdds must include dataSource.')
assert(merged[0].remoteOdds.updatedAt === oddsSnapshot.updatedAt, 'remoteOdds must include updatedAt.')
assert(merged[0].remoteOdds.status === 'mock', 'remoteOdds must include status.')
assert(merged[0].remoteOdds.matchKey === 'France__Senegal', 'remoteOdds must include matchKey.')
assert(merged[0].remoteOdds.homeTeam === 'France', 'remoteOdds must include homeTeam.')
assert(merged[0].remoteOdds.awayTeam === 'Senegal', 'remoteOdds must include awayTeam.')
assert(merged[0].remoteOdds.marketTone === 'neutral', 'remoteOdds must include marketTone.')
assert(merged[0].remoteOdds.favoriteSide === 'home', 'remoteOdds must include favoriteSide.')
assertStandardMarketsShape(merged[0].remoteOdds.markets, 'remoteOdds')
assert(merged[0].remoteOdds.mainMarkets !== oddsSnapshot.markets[0].mainMarkets, 'remoteOdds mainMarkets must be cloned.')
assert(merged[0].remoteOdds.handicap !== oddsSnapshot.markets[0].handicap, 'remoteOdds handicap must be cloned.')
assert(merged[0].remoteOdds.totalGoals !== oddsSnapshot.markets[0].totalGoals, 'remoteOdds totalGoals must be cloned.')
assert(merged[0].remoteOdds.markets !== oddsSnapshot.markets[0].markets, 'remoteOdds markets must be cloned.')
assert(merged[0].remoteOdds.markets.matchWinner !== oddsSnapshot.markets[0].markets.matchWinner, 'remoteOdds markets.matchWinner must be cloned.')
assert(merged[0].remoteOdds.markets.asianHandicap !== oddsSnapshot.markets[0].markets.asianHandicap, 'remoteOdds markets.asianHandicap must be cloned.')
assert(merged[0].remoteOdds.markets.overUnder !== oddsSnapshot.markets[0].markets.overUnder, 'remoteOdds markets.overUnder must be cloned.')
assert(merged[0].remoteOdds.marketMovement !== oddsSnapshot.markets[0].marketMovement, 'remoteOdds marketMovement must be cloned.')
assert(Array.isArray(merged[0].remoteOdds.valueFlags), 'remoteOdds valueFlags must be an array.')
assert(merged[0].remoteOdds.riskFlags !== oddsSnapshot.markets[0].riskFlags, 'remoteOdds riskFlags must be cloned.')
assert(merged[0].remoteOdds.reviewPoints !== oddsSnapshot.markets[0].reviewPoints, 'remoteOdds reviewPoints must be cloned.')
assert(Array.isArray(merged[0].remoteOdds.riskNotes), 'remoteOdds riskNotes must be an array.')
assert(merged[0].remoteOdds.rawAvailable === false, 'remoteOdds rawAvailable must be preserved.')

const homeAwayKeyMerge = mergeOddsIntoMatches(
  [{ homeTeam: 'France', awayTeam: 'Senegal' }],
  oddsSnapshot,
)
assert(homeAwayKeyMerge[0].remoteOdds, 'merge must support homeTeam + awayTeam key fallback.')

const disabledMerge = mergeOddsIntoMatches(matches, {
  ...oddsSnapshot,
  disabled: true,
})
assert(disabledMerge !== matches, 'disabled snapshot must still return a shallow copied array.')
assert(disabledMerge[0] === baseMatch, 'disabled snapshot must not clone match objects.')
assert(disabledMerge[0].remoteOdds === undefined, 'disabled snapshot must not attach remoteOdds.')

const missingMarketsMerge = mergeOddsIntoMatches(matches, {
  ...oddsSnapshot,
  markets: undefined,
})
assert(missingMarketsMerge !== matches, 'missing markets must still return a shallow copied array.')
assert(missingMarketsMerge[0] === baseMatch, 'missing markets must not clone match objects.')
assert(missingMarketsMerge[0].remoteOdds === undefined, 'missing markets must not attach remoteOdds.')

const invalidMarketsMerge = mergeOddsIntoMatches(matches, {
  ...oddsSnapshot,
  markets: {},
})
assert(invalidMarketsMerge !== matches, 'non-array markets must still return a shallow copied array.')
assert(invalidMarketsMerge[0].remoteOdds === undefined, 'non-array markets must not attach remoteOdds.')

const nonArrayMerge = mergeOddsIntoMatches(null, oddsSnapshot)
assert(Array.isArray(nonArrayMerge) && nonArrayMerge.length === 0, 'non-array matches must return an empty array.')

console.log('Odds merge checks passed.')
