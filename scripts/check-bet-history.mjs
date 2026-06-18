import { readFileSync } from 'node:fs'

import {
  getManualLineupForMatch,
  manualLineups,
} from '../src/data/manualLineups.js'
import { settlePredictionSnapshot } from '../src/services/predictionSettlement.js'

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

const historyData = JSON.parse(readFileSync('src/data/betHistory.json', 'utf8'))
const appText = readFileSync('src/App.jsx', 'utf8')
const settlementText = readFileSync('src/services/predictionSettlement.js', 'utf8')
const identityText = readFileSync('src/services/matchIdentity.js', 'utf8')
const betEngineText = readFileSync('src/services/betEngine.js', 'utf8')

const koreaCzechiaLineup = manualLineups.south_korea__czechia

assert(koreaCzechiaLineup, 'South Korea vs Czechia lineup must exist.')
assert(
  koreaCzechiaLineup.lineupStatus === 'confirmed',
  'South Korea vs Czechia lineup must be confirmed.',
)
assert(
  koreaCzechiaLineup.sourceLabel === 'Reuters / Guardian confirmed XI',
  'South Korea vs Czechia lineup must keep the provided source label.',
)
assert(
  koreaCzechiaLineup.home.formation === '3-4-3' &&
    koreaCzechiaLineup.away.formation === '3-4-3',
  'South Korea vs Czechia formations must be 3-4-3.',
)
assert(
  koreaCzechiaLineup.home.goalkeeper.length +
    koreaCzechiaLineup.home.defenders.length +
    koreaCzechiaLineup.home.midfielders.length +
    koreaCzechiaLineup.home.forwards.length ===
    11,
  'South Korea lineup must include 11 starters.',
)
assert(
  koreaCzechiaLineup.away.goalkeeper.length +
    koreaCzechiaLineup.away.defenders.length +
    koreaCzechiaLineup.away.midfielders.length +
    koreaCzechiaLineup.away.forwards.length ===
    11,
  'Czechia lineup must include 11 starters.',
)

assert(
  getManualLineupForMatch({
    homeTeam: { name: 'South Korea' },
    awayTeam: { name: 'Czechia' },
  }) === koreaCzechiaLineup,
  'South Korea vs Czechia must match by canonical names.',
)
assert(
  getManualLineupForMatch({
    homeTeam: { name: 'Korea Republic' },
    awayTeam: { name: 'Czech Republic' },
  }) === koreaCzechiaLineup,
  'Korea Republic vs Czech Republic must match by exact aliases.',
)
assert(
  getManualLineupForMatch({
    homeTeam: { name: 'South Korea B' },
    awayTeam: { name: 'Czechia' },
  }) === null,
  'Lineup matching must not fuzzy match altered team names.',
)

const mexicoHistory = historyData.records.find(
  (record) => record.id === 'history-mexico-south-africa-2026-06-12',
)
assert(mexicoHistory, 'Mexico vs South Africa history record must exist.')
assert(
  mexicoHistory.matchKey === 'Mexico__South Africa',
  'Mexico vs South Africa history must use the stable match key.',
)
assert(
  mexicoHistory.finalResult?.finalScore === '2-0' &&
    mexicoHistory.finalResult?.homeGoals === 2 &&
    mexicoHistory.finalResult?.awayGoals === 0,
  'Mexico vs South Africa final score must be 2-0.',
)
assert(
  !JSON.stringify(mexicoHistory).includes('3-1'),
  'Mexico vs South Africa history must not retain a 3-1 result.',
)
assert(
  mexicoHistory.predictionSnapshot?.snapshotSource ===
    'user_confirmed_pre_match_page' ||
    mexicoHistory.predictionSnapshot?.source === 'user_confirmed_pre_match_page',
  'Mexico vs South Africa prediction snapshot must be user-confirmed pre-match page.',
)
assert(
  mexicoHistory.predictionSnapshot?.mainPick === 'Mexico win / Mexico 主胜',
  'Mexico vs South Africa main pick snapshot must be Mexico win / Mexico 主胜.',
)
assert(
  mexicoHistory.predictionSnapshot?.totalGoalsDirection === 'over25' &&
    mexicoHistory.predictionSnapshot?.totalGoalsLabel === '大 2.5',
  'Mexico vs South Africa total goals snapshot must be 大 2.5.',
)
assert(
  mexicoHistory.predictionSnapshot?.scorePredictions?.includes('2-0'),
  'Mexico vs South Africa score snapshot must include 2-0.',
)
assert(
  mexicoHistory.settlement?.settlementStatus === 'settled',
  'Mexico vs South Africa settlement must be settled.',
)
assert(
  mexicoHistory.settlement?.mainPickHit === true,
  'Mexico vs South Africa main pick must hit.',
)
assert(
  mexicoHistory.settlement?.scoreHit === true &&
    mexicoHistory.settlement?.matchedScore === '2-0',
  'Mexico vs South Africa exact score must hit 2-0.',
)
assert(
  mexicoHistory.settlement?.totalGoalsHit === false,
  'Mexico vs South Africa over 2.5 must miss on 2-0.',
)
assert(
  !/stake|stakePlan|bankroll|totalStake/i.test(JSON.stringify(mexicoHistory)),
  'Mexico vs South Africa history must not expose internal amount fields.',
)

const mexicoSettlement = settlePredictionSnapshot(
  mexicoHistory.predictionSnapshot,
  mexicoHistory.finalResult,
)
assert(mexicoSettlement.mainPickHit === true, 'Confirmed Mexico win must hit 2-0.')
assert(
  mexicoSettlement.scoreHit === true && mexicoSettlement.matchedScore === '2-0',
  'Confirmed score 2-0 must hit the final score.',
)
assert(
  mexicoSettlement.totalGoalsHit === false,
  'Confirmed over 2.5 must miss on a 2-0 final score.',
)

const syntheticOverResult = settlePredictionSnapshot(
  {
    mainPick: 'home',
    totalGoalsDirection: 'over25',
    scorePredictions: ['2-0', '1-0'],
  },
  mexicoHistory.finalResult,
)
assert(syntheticOverResult.mainPickHit === true, 'Home pick must hit on 2-0.')
assert(
  syntheticOverResult.totalGoalsHit === false,
  'Over 2.5 must miss on 2-0.',
)
assert(
  syntheticOverResult.scoreHit === true &&
    syntheticOverResult.matchedScore === '2-0',
  'Exact score 2-0 must hit on 2-0.',
)

const syntheticUnderResult = settlePredictionSnapshot(
  {
    mainPick: 'away',
    totalGoalsDirection: 'under25',
    scorePredictions: ['1-1'],
  },
  mexicoHistory.finalResult,
)
assert(
  syntheticUnderResult.mainPickHit === false,
  'Away pick must miss on 2-0.',
)
assert(
  syntheticUnderResult.totalGoalsHit === true,
  'Under 2.5 must hit on 2-0.',
)
assert(syntheticUnderResult.scoreHit === false, 'Wrong exact score must miss on 2-0.')

const missingSnapshotResult = settlePredictionSnapshot(null, mexicoHistory.finalResult)
assert(
  missingSnapshotResult.settlementStatus === 'missing_prediction_snapshot' &&
    missingSnapshotResult.mainPickHit === null &&
    missingSnapshotResult.totalGoalsHit === null &&
    missingSnapshotResult.scoreHit === null,
  'Missing snapshot must not produce hit or miss values.',
)

assert(
  appText.includes('RecentHistoryPanel') &&
    appText.includes('history-result-panel') &&
    appText.includes('history-result-score'),
  'App must render the recent history result panel.',
)
assert(
  appText.includes('formatHistoryTotalGoalsResult') && appText.includes('未打出'),
  'App must display a clear total-goals miss label.',
)
assert(
  !betEngineText.includes('predictionSettlement') &&
    !betEngineText.includes('betHistory'),
  'Settlement history must not affect BetEngine.',
)

for (const [label, pattern] of Object.entries({
  betEngineImport: /betEngine/i,
  networkCall: /\bfetch\s*\(|XMLHttpRequest|axios\.|https?:\/\//i,
  envRead: /process\.env|import\.meta\.env|OPENAI_API_KEY|API_FOOTBALL_KEY|THE_ODDS_API_KEY/i,
  database: /DATABASE|SUPABASE|postgres|sqlite/i,
})) {
  assert(
    !pattern.test(`${settlementText}\n${identityText}`),
    `settlement and identity helpers must not contain ${label}.`,
  )
}

for (const [label, pattern] of Object.entries({
  promiseCopy: /稳赚|必中|保证命中/,
  officialFakeCopy: /预测首发[\s\S]{0,120}官方首发/,
})) {
  assert(!pattern.test(appText), `App must not contain ${label}.`)
}

console.log('Bet history checks passed.')
