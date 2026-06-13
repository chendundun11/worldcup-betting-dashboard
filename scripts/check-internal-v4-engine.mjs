import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildInternalV4Analysis } from '../src/internal/v4/internalEngineV4.js'
import {
  EXECUTION_LEVELS_V4,
  GAME_TYPES_V4,
  GRADES_V4,
  INTERNAL_V4_VERSION,
  MAIN_PICKS_V4,
  OVER_UNDER_PICKS_V4,
  POOL_STATUS_V4,
  SCORE_DIMENSION_KEYS_V4,
  assertInternalV4AnalysisShape,
} from '../src/internal/v4/internalTypesV4.js'
import {
  getScoreOutcomeV4,
  getScoreTotalGoalsV4,
} from '../src/internal/v4/internalSelectorsV4.js'

const sourceFiles = [
  'src/internal/v4/internalEngineV4.js',
  'src/internal/v4/internalRulesV4.js',
  'src/internal/v4/internalTypesV4.js',
  'src/components/InternalCommandCenterV4.jsx',
]

const forbiddenImports = [
  'betEngine',
  'sharePoster',
  'shareText',
  'posterPresentation',
  'displayConfidence',
]

for (const file of ['src/internal/v4/internalEngineV4.js', 'src/internal/v4/internalRulesV4.js']) {
  const source = readFileSync(file, 'utf8')
  for (const forbidden of forbiddenImports) {
    assert.equal(source.includes(forbidden), false, `${file} must stay independent from ${forbidden}`)
  }
}

for (const file of sourceFiles) {
  const source = readFileSync(file, 'utf8')
  assert.equal(source.includes('模型主方向概率'), false, `${file} must not display fake direction probability`)
  assert.equal(source.includes('不进主推池'), false, `${file} must not keep no-plan main-pool wording`)
  assert.equal(source.includes('剔除'), false, `${file} must not keep excluded-match wording`)
  for (const forbidden of ['稳赚', '必中', '保证命中', '内幕']) {
    assert.equal(source.includes(forbidden), false, `${file} must not contain forbidden claim: ${forbidden}`)
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

const teams = {
  strongHome: {
    name: 'France',
    shortName: 'France',
    teamStrength: 88,
    recentForm: 82,
    attackRating: 84,
    defenseRating: 78,
    morale: 78,
    fatigue: 28,
    injuryRisk: 18,
  },
  solidHome: {
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
  solidAway: {
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
  lowAttackHome: {
    name: 'Uruguay',
    shortName: 'Uruguay',
    teamStrength: 76,
    recentForm: 65,
    attackRating: 35,
    defenseRating: 84,
    morale: 61,
    fatigue: 48,
    injuryRisk: 34,
  },
  lowAttackAway: {
    name: 'Iran',
    shortName: 'Iran',
    teamStrength: 61,
    recentForm: 57,
    attackRating: 32,
    defenseRating: 82,
    morale: 58,
    fatigue: 47,
    injuryRisk: 36,
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
    homeTeam: teams.strongHome,
    awayTeam: teams.weakAway,
    odds: { home: 1.74, draw: 3.85, away: 5.4, over25: 1.95, under25: 1.92 },
    model: { home: 0.57, draw: 0.25, away: 0.18 },
    totalGoals: { model: { over25Probability: 0.51, under25Probability: 0.49 } },
    contextRisk: 36,
  },
  {
    id: 'engine-draw-protect',
    kickoff: '2026-06-18T12:00:00+08:00',
    status: 'scheduled',
    homeTeam: teams.solidHome,
    awayTeam: teams.solidAway,
    odds: { home: 2.55, draw: 3.05, away: 2.8, over25: 2.04, under25: 1.78 },
    model: { home: 0.34, draw: 0.32, away: 0.34 },
    totalGoals: { model: { over25Probability: 0.44, under25Probability: 0.56 } },
    contextRisk: 42,
  },
  {
    id: 'engine-low-score',
    kickoff: '2026-06-18T14:00:00+08:00',
    status: 'scheduled',
    homeTeam: teams.lowAttackHome,
    awayTeam: teams.lowAttackAway,
    odds: { home: 1.92, draw: 3.1, away: 4.5, over25: 2.3, under25: 1.62 },
    model: { home: 0.52, draw: 0.2, away: 0.28 },
    totalGoals: { model: { over25Probability: 0.31, under25Probability: 0.69 } },
    contextRisk: 40,
  },
  {
    id: 'engine-info-light',
    kickoff: '2026-06-18T16:00:00+08:00',
    status: 'scheduled',
    homeTeam: teams.solidHome,
    awayTeam: teams.weakAway,
    odds: null,
    model: { home: 0.42, draw: 0.3, away: 0.28 },
    totalGoals: { model: { over25Probability: 0.5, under25Probability: 0.5 } },
    contextRisk: 76,
  },
]

function assertScoreLinkage(analysis) {
  const { gameType } = analysis.classification
  const { primaryScore, secondaryScore, overUnder } = analysis.predictions
  assert.match(primaryScore, /^\d+-\d+$/)
  assert.match(secondaryScore, /^\d+-\d+$/)
  assert.notEqual(primaryScore, secondaryScore)

  if (gameType === '平局保护局') {
    assert.equal(
      [primaryScore, secondaryScore].some((score) => getScoreOutcomeV4(score) === 'draw'),
      true,
      'draw protection must include at least one draw score',
    )
  }

  if (gameType === '低比分胶着局') {
    assert.equal(getScoreTotalGoalsV4(primaryScore) <= 2, true)
    assert.equal(getScoreTotalGoalsV4(secondaryScore) <= 2, true)
  }

  const totals = [primaryScore, secondaryScore].map(getScoreTotalGoalsV4)
  const expectedOverUnder =
    totals.every((total) => total >= 3)
      ? '大2.5'
      : totals.every((total) => total <= 2)
        ? '小2.5'
        : '2.5球分界'
  assert.equal(overUnder, expectedOverUnder)
}

function assertConfidenceFormula(analysis) {
  const confidence = analysis.confidence
  const expected = Math.round(
    confidence.directionConfidence * 0.35 +
      confidence.scoreConfidence * 0.2 +
      confidence.overUnderConfidence * 0.2 +
      confidence.dataConfidence * 0.15 +
      confidence.gameTypeModifier * 0.1,
  )

  assert.equal(Math.abs(confidence.internalConfidence - expected) <= 2, true)
}

for (const sample of samples) {
  const analysis = buildInternalV4Analysis(sample, { bankroll: 10000 })
  assert.equal(assertInternalV4AnalysisShape(analysis), true)
  assert.equal(analysis.version, INTERNAL_V4_VERSION)
  assert.ok(GAME_TYPES_V4.includes(analysis.classification.gameType))
  assert.ok(EXECUTION_LEVELS_V4.includes(analysis.decision.executionLevel))
  assert.ok(POOL_STATUS_V4.includes(analysis.decision.poolStatus))
  assert.ok(GRADES_V4.includes(analysis.decision.grade))
  assert.ok(MAIN_PICKS_V4.includes(analysis.decision.mainPick))
  assert.ok(OVER_UNDER_PICKS_V4.includes(analysis.predictions.overUnder))
  assert.notEqual(analysis.decision.mainPick, '不进主推池')
  assert.notEqual(analysis.decision.poolStatus, '剔除')

  for (const key of SCORE_DIMENSION_KEYS_V4) {
    const value = analysis.score.dimensions[key]
    assert.equal(Number.isFinite(value), true, `${key} must be finite`)
    assert.equal(value >= 0 && value <= 100, true, `${key} must be 0-100`)
  }

  for (const key of [
    'directionConfidence',
    'scoreConfidence',
    'overUnderConfidence',
    'dataConfidence',
    'internalConfidence',
  ]) {
    const value = analysis.confidence[key]
    assert.equal(Number.isFinite(value), true, `${key} must be finite`)
    assert.equal(value >= 0 && value <= 100, true, `${key} must be 0-100`)
  }

  assertScoreLinkage(analysis)
  assertConfidenceFormula(analysis)
  assert.ok(Array.isArray(analysis.rules.triggered))
  assert.ok(analysis.rules.triggered.every((rule) => typeof rule.id === 'string'))
  assert.ok(analysis.rules.triggered.every((rule) => typeof rule.label === 'string'))
  assert.ok(analysis.rules.triggered.every((rule) => typeof rule.effect === 'string'))
  assert.ok(analysis.rules.triggered.every((rule) => Number.isFinite(rule.weight)))

  const serialized = JSON.stringify(analysis)
  assert.equal(serialized.includes('undefined'), false)
  assert.equal(serialized.includes('NaN'), false)
  assert.equal(serialized.includes('null'), false)
}

const drawProtection = buildInternalV4Analysis(samples[1], { bankroll: 10000 })
assert.equal(drawProtection.classification.gameType, '平局保护局')
assertScoreLinkage(drawProtection)

const lowScore = buildInternalV4Analysis(samples[2], { bankroll: 10000 })
assert.equal(lowScore.classification.gameType, '低比分胶着局')
assertScoreLinkage(lowScore)

console.log('check-internal-v4-engine: ok')
