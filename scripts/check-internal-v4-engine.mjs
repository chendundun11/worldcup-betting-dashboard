import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildInternalV4Analysis } from '../src/internal/v4/internalEngineV4.js'
import {
  GAME_TYPES_V4,
  GRADES_V4,
  MAIN_PICKS_V4,
  OVER_UNDER_PICKS_V4,
  POOL_STATUS_V4,
  EXECUTION_LEVELS_V4,
  assertInternalV4AnalysisShape,
} from '../src/internal/v4/internalTypesV4.js'

const forbiddenImports = [
  'betEngine',
  'sharePoster',
  'shareText',
  'posterPresentation',
  'displayConfidence',
]

for (const file of [
  'src/internal/v4/internalEngineV4.js',
  'src/internal/v4/internalRulesV4.js',
]) {
  const source = readFileSync(file, 'utf8')
  for (const forbidden of forbiddenImports) {
    assert.equal(
      source.includes(forbidden),
      false,
      `${file} must stay independent from ${forbidden}`,
    )
  }
}

const ruleSource = readFileSync('src/internal/v4/internalRulesV4.js', 'utf8')
for (const group of [
  'strengthRules',
  'tempoRules',
  'drawRules',
  'goalRules',
  'overUnderRules',
  'volatilityRules',
  'rejectionRules',
  'poolRules',
]) {
  assert.match(ruleSource, new RegExp(`export function ${group}\\(`))
}

const baseTeams = {
  strongHome: {
    name: 'France',
    shortName: 'France',
    teamStrength: 84,
    recentForm: 78,
    attackRating: 82,
    defenseRating: 75,
    morale: 76,
    fatigue: 34,
    injuryRisk: 22,
  },
  midHome: {
    name: 'Spain',
    shortName: 'Spain',
    teamStrength: 74,
    recentForm: 70,
    attackRating: 68,
    defenseRating: 72,
    morale: 68,
    fatigue: 42,
    injuryRisk: 30,
  },
  midAway: {
    name: 'Germany',
    shortName: 'Germany',
    teamStrength: 73,
    recentForm: 69,
    attackRating: 67,
    defenseRating: 71,
    morale: 67,
    fatigue: 44,
    injuryRisk: 31,
  },
  weakAway: {
    name: 'Haiti',
    shortName: 'Haiti',
    teamStrength: 52,
    recentForm: 49,
    attackRating: 48,
    defenseRating: 45,
    morale: 48,
    fatigue: 50,
    injuryRisk: 42,
  },
}

const samples = [
  {
    id: 'engine-strong-home',
    kickoff: '2026-06-18T10:00:00+08:00',
    status: 'scheduled',
    homeTeam: baseTeams.strongHome,
    awayTeam: baseTeams.weakAway,
    odds: { home: 1.74, draw: 3.85, away: 5.4, over25: 1.95, under25: 1.92 },
    model: { home: 0.57, draw: 0.25, away: 0.18 },
    totalGoals: { model: { over25Probability: 0.51, under25Probability: 0.49 } },
    contextRisk: 36,
  },
  {
    id: 'engine-draw-protect',
    kickoff: '2026-06-18T12:00:00+08:00',
    status: 'scheduled',
    homeTeam: baseTeams.midHome,
    awayTeam: baseTeams.midAway,
    odds: { home: 2.55, draw: 3.05, away: 2.8, over25: 2.04, under25: 1.78 },
    model: { home: 0.34, draw: 0.32, away: 0.34 },
    totalGoals: { model: { over25Probability: 0.44, under25Probability: 0.56 } },
    contextRisk: 42,
  },
  {
    id: 'engine-conflict',
    kickoff: '2026-06-18T14:00:00+08:00',
    status: 'scheduled',
    homeTeam: baseTeams.midHome,
    awayTeam: baseTeams.midAway,
    odds: { home: 1.55, draw: 4.1, away: 6.2, over25: 1.82, under25: 2.02 },
    model: { home: 0.31, draw: 0.22, away: 0.47 },
    totalGoals: { model: { over25Probability: 0.58, under25Probability: 0.42 } },
    contextRisk: 54,
  },
  {
    id: 'engine-info-light',
    kickoff: '2026-06-18T16:00:00+08:00',
    status: 'scheduled',
    homeTeam: baseTeams.midHome,
    awayTeam: baseTeams.weakAway,
    odds: null,
    model: { home: 0.42, draw: 0.3, away: 0.28 },
    totalGoals: { model: { over25Probability: 0.5, under25Probability: 0.5 } },
    contextRisk: 45,
  },
]

for (const sample of samples) {
  const analysis = buildInternalV4Analysis(sample, { bankroll: 10000 })
  assert.equal(assertInternalV4AnalysisShape(analysis), true)
  assert.equal(analysis.version, 'internal-v4')
  assert.ok(GAME_TYPES_V4.includes(analysis.classification.gameType))
  assert.ok(EXECUTION_LEVELS_V4.includes(analysis.decision.executionLevel))
  assert.ok(POOL_STATUS_V4.includes(analysis.decision.poolStatus))
  assert.ok(GRADES_V4.includes(analysis.decision.grade))
  assert.ok(MAIN_PICKS_V4.includes(analysis.decision.mainPick))
  assert.match(analysis.predictions.primaryScore, /^\d+-\d+$/)
  assert.match(analysis.predictions.secondaryScore, /^\d+-\d+$/)
  assert.notEqual(analysis.predictions.primaryScore, analysis.predictions.secondaryScore)
  assert.ok(OVER_UNDER_PICKS_V4.includes(analysis.predictions.overUnder))
  assert.ok(Array.isArray(analysis.rules.triggered))
  assert.ok(analysis.rules.triggered.every((rule) => typeof rule.id === 'string'))
  assert.ok(analysis.rules.triggered.every((rule) => typeof rule.label === 'string'))
  assert.ok(analysis.rules.triggered.every((rule) => typeof rule.effect === 'string'))
  assert.ok(analysis.rules.triggered.every((rule) => Number.isFinite(rule.weight)))
  assert.equal(typeof analysis.consistency.hasConflict, 'boolean')
}

const conflictAnalysis = buildInternalV4Analysis(samples[2], { bankroll: 10000 })
assert.equal(conflictAnalysis.classification.gameType, '方向冲突局')
assert.equal(conflictAnalysis.decision.mainPick, '不进主推池')

console.log('check-internal-v4-engine: ok')
