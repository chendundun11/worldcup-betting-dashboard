import { execSync } from 'node:child_process'

import {
  MAIN_PICK_TYPES,
  buildV3InternalAnalysis,
  checkV3Consistency,
} from '../src/services/scoringV3Internal.js'

const BANKROLL = 10000
const FORBIDDEN_WORDS = [
  ['稳', '赚'].join(''),
  ['必', '中'].join(''),
  ['保证', '命中'].join(''),
  ['内', '幕'].join(''),
  ['不', '确定'].join(''),
  ['看', '情况'].join(''),
  ['可能', '都行'].join(''),
  ['暂时', '无法判断'].join(''),
  ['临场', '再说'].join(''),
  ['模糊', '倾向'].join(''),
]

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function team(name, strength, recentForm, attack, defense) {
  return {
    name,
    shortName: name,
    teamStrength: strength,
    recentForm,
    attackRating: attack,
    defenseRating: defense,
    morale: 62,
    fatigue: 44,
    injuryRisk: 38,
  }
}

function match(id, homeTeam, awayTeam, model, totalModel, odds, extra = {}) {
  return {
    id,
    homeTeam,
    awayTeam,
    kickoff: '2026-06-18T20:00:00+08:00',
    model,
    odds,
    totalGoals: { model: totalModel },
    scoreLeans: [{ score: '1-0' }, { score: '1-1' }],
    ...extra,
  }
}

const samples = [
  match(
    'v3-home-stable',
    team('Home Alpha', 84, 80, 79, 82),
    team('Away Beta', 56, 55, 56, 55),
    { home: 0.64, draw: 0.22, away: 0.14 },
    { over25Probability: 0.44, under25Probability: 0.56 },
    { home: 1.78, draw: 3.7, away: 4.6, over25: 2.02, under25: 1.82 },
  ),
  match(
    'v3-away-stable',
    team('Home Gamma', 55, 55, 54, 56),
    team('Away Delta', 82, 78, 80, 79),
    { home: 0.16, draw: 0.23, away: 0.61 },
    { over25Probability: 0.42, under25Probability: 0.58 },
    { home: 5.1, draw: 3.9, away: 1.72, over25: 2.06, under25: 1.8 },
  ),
  match(
    'v3-draw-low',
    team('Home Close', 66, 64, 62, 66),
    team('Away Close', 65, 65, 62, 65),
    { home: 0.34, draw: 0.36, away: 0.3 },
    { over25Probability: 0.38, under25Probability: 0.62 },
    { home: 2.7, draw: 3.05, away: 2.86, over25: 2.1, under25: 1.76 },
    { contextRisk: 48 },
  ),
  match(
    'v3-boundary',
    team('Home Open', 73, 72, 76, 65),
    team('Away Open', 64, 63, 70, 61),
    { home: 0.5, draw: 0.26, away: 0.24 },
    { over25Probability: 0.63, under25Probability: 0.37 },
    { home: 2.02, draw: 3.5, away: 3.6, over25: 1.74, under25: 2.16 },
    { contextRisk: 50 },
  ),
  {
    id: 'v3-no-pool',
    homeTeam: team('No Data Home', 50, 50, 50, 50),
    awayTeam: team('No Data Away', 50, 50, 50, 50),
    kickoff: '2026-06-18T22:00:00+08:00',
  },
]

function parseScore(score) {
  const matchResult = String(score ?? '').match(/^(\d{1,2})-(\d{1,2})$/)
  assert(matchResult, `Invalid score ${score}`)

  const home = Number(matchResult[1])
  const away = Number(matchResult[2])

  return {
    home,
    away,
    total: home + away,
    outcome: home > away ? 'home' : home < away ? 'away' : 'draw',
  }
}

function assertNoInvalidValue(value, path = 'analysis') {
  assert(value !== undefined, `${path} is undefined`)
  assert(value !== null, `${path} is null`)

  if (typeof value === 'number') {
    assert(Number.isFinite(value), `${path} is not finite`)
    return
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoInvalidValue(item, `${path}[${index}]`))
    return
  }

  if (typeof value === 'object') {
    for (const [key, nextValue] of Object.entries(value)) {
      assertNoInvalidValue(nextValue, `${path}.${key}`)
    }
  }
}

function assertForbiddenWords(text, label) {
  for (const word of FORBIDDEN_WORDS) {
    assert(!text.includes(word), `${label} includes forbidden word: ${word}`)
  }
}

function assertStructure(analysis, label) {
  for (const key of [
    'version',
    'matchInfo',
    'profile',
    'scores',
    'decision',
    'predictions',
    'stakePlan',
    'explanations',
    'consistency',
  ]) {
    assert(Object.hasOwn(analysis, key), `${label}: missing ${key}`)
  }

  assert(analysis.version === 'v3-internal-1', `${label}: wrong version`)
  assert(analysis.matchInfo.matchId, `${label}: missing matchId`)
  assert(analysis.matchInfo.matchName, `${label}: missing matchName`)
  assert(analysis.decision.mainPick, `${label}: missing mainPick`)
  assert(MAIN_PICK_TYPES.includes(analysis.decision.mainPick), `${label}: invalid mainPick`)
  assert(analysis.predictions.primaryScore, `${label}: missing primaryScore`)
  assert(analysis.predictions.secondaryScore, `${label}: missing secondaryScore`)
  assert(analysis.predictions.totalGoals, `${label}: missing totalGoals`)
  assert(analysis.predictions.overUnder, `${label}: missing overUnder`)
  assert(analysis.stakePlan, `${label}: missing stakePlan`)
  assert(Array.isArray(analysis.stakePlan.stakeItems), `${label}: missing stakeItems`)
  assert(analysis.stakePlan.stakeItems.length === 4, `${label}: stakeItems must have 4 items`)
}

function assertStakePlan(analysis, label) {
  const itemSum = analysis.stakePlan.stakeItems.reduce((sum, item) => sum + item.stake, 0)

  assert(
    analysis.stakePlan.totalStake <= BANKROLL * 0.05,
    `${label}: totalStake exceeds bankroll 5%`,
  )
  assert(
    itemSum === analysis.stakePlan.totalStake,
    `${label}: totalStake does not equal stake item sum`,
  )
  assert(
    analysis.stakePlan.maxSingleMatchStake === BANKROLL * 0.05,
    `${label}: maxSingleMatchStake must equal bankroll 5%`,
  )

  if (analysis.predictions.overUnder === '2.5球分界') {
    assert(analysis.stakePlan.overUnderStake === 0, `${label}: boundary overUnderStake must be 0`)
  }

  if (analysis.decision.mainPick === '不进主推池') {
    assert(analysis.stakePlan.totalStake === 0, `${label}: no-pool totalStake must be 0`)
  }
}

function assertScoreConsistency(analysis, label) {
  const primary = parseScore(analysis.predictions.primaryScore)
  const secondary = parseScore(analysis.predictions.secondaryScore)

  assert(
    analysis.predictions.primaryScore !== analysis.predictions.secondaryScore,
    `${label}: scores must not repeat`,
  )

  const consistency = checkV3Consistency({
    bankroll: BANKROLL,
    decision: analysis.decision,
    predictions: analysis.predictions,
    stakePlan: analysis.stakePlan,
  })

  assert(consistency.directionAligned, `${label}: direction and score conflict`)
  assert(consistency.scoreAligned, `${label}: score alignment failed`)
  assert(consistency.totalGoalsAligned, `${label}: total goals conflict`)
  assert(consistency.overUnderAligned, `${label}: over-under conflict`)
  assert(consistency.stakeAligned, `${label}: stake alignment failed`)
  assert(!consistency.hasConflict, `${label}: unexpected conflict ${consistency.conflictReasons.join('; ')}`)

  if (primary.total <= 2 && secondary.total <= 2) {
    assert(analysis.predictions.overUnder === '小 2.5', `${label}: low scores must map to under 2.5`)
  }
  if (primary.total >= 3 && secondary.total >= 3) {
    assert(analysis.predictions.overUnder === '大 2.5', `${label}: high scores must map to over 2.5`)
  }
}

for (const sample of samples) {
  const analysis = buildV3InternalAnalysis(sample, { bankroll: BANKROLL })
  const label = sample.id

  assertStructure(analysis, label)
  assertNoInvalidValue(analysis, label)
  assertForbiddenWords(JSON.stringify(analysis), label)
  assertStakePlan(analysis, label)
  assertScoreConsistency(analysis, label)
}

const protectedStatus = execSync('git status --short -- src/services/betEngine.js', {
  encoding: 'utf8',
}).trim()
assert(!protectedStatus, `BetEngine must not be modified:\n${protectedStatus}`)

console.log('V3 internal checks passed.')
