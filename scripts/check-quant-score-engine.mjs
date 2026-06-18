import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import buildBetPlan from '../src/services/betEngine.js'
import { buildInternalV4Analysis } from '../src/internal/v4/internalEngineV4.js'
import { buildQuantScoreModel } from '../src/services/quantScoreEngine.js'

function total(score) {
  return String(score)
    .split('-')
    .map((part) => Number(part))
    .reduce((sum, value) => sum + value, 0)
}

function outcome(score) {
  const [home, away] = String(score)
    .split('-')
    .map((part) => Number(part))
  if (home > away) return 'home'
  if (away > home) return 'away'
  return 'draw'
}

const teams = {
  extremeHome: {
    name: 'Extreme Favorite',
    shortName: 'Extreme Favorite',
    teamStrength: 96,
    recentForm: 92,
    attackRating: 95,
    defenseRating: 88,
    morale: 92,
    fatigue: 20,
    injuryRisk: 14,
  },
  extremeAway: {
    name: 'Extreme Opponent',
    shortName: 'Extreme Opponent',
    teamStrength: 54,
    recentForm: 45,
    attackRating: 48,
    defenseRating: 42,
    morale: 44,
    fatigue: 58,
    injuryRisk: 55,
  },
  lowHome: {
    name: 'Low Block Home',
    shortName: 'Low Block Home',
    teamStrength: 76,
    recentForm: 66,
    attackRating: 35,
    defenseRating: 86,
    morale: 64,
    fatigue: 44,
    injuryRisk: 30,
  },
  lowAway: {
    name: 'Low Block Away',
    shortName: 'Low Block Away',
    teamStrength: 63,
    recentForm: 58,
    attackRating: 31,
    defenseRating: 84,
    morale: 58,
    fatigue: 45,
    injuryRisk: 32,
  },
}

const extremeMatch = {
  id: 'quant-extreme',
  homeTeam: teams.extremeHome,
  awayTeam: teams.extremeAway,
  odds: { home: 1.55, draw: 4.2, away: 7.4, over25: 1.68, under25: 2.15 },
  localOdds: { homeWin: 1.55, draw: 4.2, awayWin: 7.4, over25: 1.68, under25: 2.15 },
  model: { home: 0.66, draw: 0.21, away: 0.13 },
  totalGoals: { model: { over25Probability: 0.62, under25Probability: 0.38 } },
  contextRisk: 34,
}

const lowMatch = {
  id: 'quant-low',
  homeTeam: teams.lowHome,
  awayTeam: teams.lowAway,
  odds: { home: 1.92, draw: 3.1, away: 4.5, over25: 2.3, under25: 1.62 },
  model: { home: 0.52, draw: 0.2, away: 0.28 },
  totalGoals: { model: { over25Probability: 0.31, under25Probability: 0.69 } },
  contextRisk: 40,
}

const extremeScore = buildQuantScoreModel(extremeMatch, { preferredOutcome: 'home' })
assert.equal(outcome(extremeScore.primaryScore), 'home')
assert.equal(outcome(extremeScore.secondaryScore), 'home')
assert.equal(total(extremeScore.secondaryScore) >= 4, true, 'extreme favorite needs a 4+ goal tail candidate')
assert.equal(extremeScore.distribution.some((item) => total(item.score) >= 4), true)
assert.equal(extremeScore.version, 'quant-score-v1')

const lowScore = buildQuantScoreModel(lowMatch, {
  gameType: '低比分胶着局',
  mainPick: '主队胜',
})
assert.equal(total(lowScore.primaryScore) <= 2, true)
assert.equal(total(lowScore.secondaryScore) <= 2, true)
assert.equal(lowScore.overUnder, '小2.5')

const drawProtection = buildInternalV4Analysis({
  id: 'quant-draw-protect',
  homeTeam: {
    ...teams.lowHome,
    attackRating: 67,
    defenseRating: 72,
    teamStrength: 74,
  },
  awayTeam: {
    ...teams.lowAway,
    attackRating: 67,
    defenseRating: 71,
    teamStrength: 73,
  },
  odds: { home: 2.55, draw: 3.05, away: 2.8, over25: 2.04, under25: 1.78 },
  model: { home: 0.34, draw: 0.32, away: 0.34 },
  totalGoals: { model: { over25Probability: 0.44, under25Probability: 0.56 } },
  contextRisk: 42,
})
assert.equal(drawProtection.classification.gameType, '平局保护局')
assert.equal(
  [drawProtection.predictions.primaryScore, drawProtection.predictions.secondaryScore].some(
    (score) => outcome(score) === 'draw',
  ),
  true,
  'draw protection must keep a draw candidate',
)

const matchData = JSON.parse(readFileSync('src/data/matches.json', 'utf8'))
const teamData = JSON.parse(readFileSync('src/data/teams.json', 'utf8'))
const teamMap = new Map(teamData.teams.map((team) => [team.id, team]))
const datasetScores = []

for (const match of matchData.matches) {
  const enriched = {
    ...match,
    homeTeam: teamMap.get(match.homeTeamId),
    awayTeam: teamMap.get(match.awayTeamId),
  }
  const plan = buildBetPlan(enriched, { bankroll: 0, maxStakePerMatch: 0 })
  for (const pick of plan.scorePicks) {
    assert.equal(pick.highVariance, true)
    assert.match(pick.score, /^\d+-\d+$/)
    datasetScores.push(pick.score)
  }
}

assert.equal(new Set(datasetScores).size >= 5, true, 'dataset score output must not collapse to one template')
assert.equal(
  datasetScores.some((score) => total(score) >= 4),
  true,
  'dataset score output must include at least one 4+ goal tail path',
)

console.log('check-quant-score-engine: ok')
