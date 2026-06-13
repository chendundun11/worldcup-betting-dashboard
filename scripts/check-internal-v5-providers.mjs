import assert from 'node:assert/strict'
import { autoReviewFinishedMatches } from '../src/internal/v4/internalAutoReviewV4.js'
import { createDefaultLedger } from '../src/internal/v4/internalLedgerV4.js'
import { buildInternalStakePlan } from '../src/internal/v4/internalStakeV4.js'
import { setOddsOverrideV5 } from '../src/internal/v4/internalOddsOverrideV5.js'
import {
  getInternalScoreProviderV5,
  isUsableScoreProviderResultV5,
} from '../src/internal/v4/internalScoreProviderV5.js'
import { INTERNAL_V4_VERSION, RECORD_STATUS_V4 } from '../src/internal/v4/internalTypesV4.js'

function makeAnalysis(overrides = {}) {
  return {
    version: INTERNAL_V4_VERSION,
    match: { id: 'provider-match', matchName: 'Provider Match' },
    classification: { gameType: '标准计划', ...(overrides.classification ?? {}) },
    decision: {
      mainPick: '主队胜',
      executionLevel: '标准计划',
      poolStatus: '标准观察',
      grade: 'B',
      fundingTier: 'B',
      directionStrength: '中强',
      ...(overrides.decision ?? {}),
    },
    predictions: {
      primaryScore: '2-0',
      secondaryScore: '2-1',
      overUnder: '2.5球分界',
      ...(overrides.predictions ?? {}),
    },
    consistency: {
      consistencyFactor: 1,
      hasHardConflict: false,
      severity: 'none',
      ...(overrides.consistency ?? {}),
    },
    confidence: {
      directionConfidence: 81,
      scoreConfidence: 90,
      overUnderConfidence: 80,
      dataConfidence: 76,
      internalConfidence: 82,
      gameTypeModifier: 76,
      ...(overrides.confidence ?? {}),
    },
  }
}

function makeMatch(overrides = {}) {
  return {
    id: 'provider-match',
    kickoff: '2026-06-13T08:00:00+08:00',
    status: 'scheduled',
    homeTeam: {
      name: 'France',
      teamStrength: 84,
      recentForm: 78,
      attackRating: 82,
      defenseRating: 75,
      fatigue: 34,
      injuryRisk: 22,
    },
    awayTeam: {
      name: 'Haiti',
      teamStrength: 52,
      recentForm: 49,
      attackRating: 48,
      defenseRating: 45,
      fatigue: 50,
      injuryRisk: 42,
    },
    contextRisk: 36,
    ...overrides,
  }
}

const now = new Date('2026-06-13T10:00:00+08:00')
const ledger = createDefaultLedger()
const noOddsMatch = makeMatch()
const defaultPlan = buildInternalStakePlan(makeAnalysis(), ledger, {
  match: noOddsMatch,
})

assert.equal(defaultPlan.items.length, 4)
for (const item of defaultPlan.items) {
  assert.equal(Number.isFinite(item.stake), true)
  assert.equal(Number.isFinite(item.odds), true)
  assert.equal(item.odds > 1, true)
  assert.equal(item.oddsSource, 'default_estimate')
  assert.equal(item.oddsSourceLabel, '默认估算')
  assert.equal(Number.isFinite(item.potentialProfit), true)
  assert.ok(['pending', 'observation'].includes(item.status))
}

const boundaryOu = defaultPlan.items.find((item) => item.key === 'overUnder')
assert.equal(boundaryOu.stake <= Math.floor(defaultPlan.totalStake * 0.05), true)
assert.equal(boundaryOu.status, 'observation')

const localOddsPlan = buildInternalStakePlan(
  makeAnalysis({ predictions: { overUnder: '小2.5' } }),
  ledger,
  {
    match: makeMatch({
      odds: { home: 1.55, draw: 4.1, away: 6.3, over25: 1.82, under25: 2.02 },
    }),
  },
)
assert.equal(localOddsPlan.items.find((item) => item.key === 'mainDirection').odds, 1.55)
assert.equal(localOddsPlan.items.find((item) => item.key === 'mainDirection').oddsSource, 'local_odds')
assert.equal(localOddsPlan.items.find((item) => item.key === 'overUnder').odds, 2.02)
assert.equal(localOddsPlan.items.find((item) => item.key === 'primaryScore').oddsSource, 'default_estimate')

const manualOverrides = setOddsOverrideV5({}, 'provider-match', 'primaryScore', 12.25)
const manualPlan = buildInternalStakePlan(makeAnalysis(), ledger, {
  match: noOddsMatch,
  oddsOverrides: manualOverrides,
})
const defaultPrimary = defaultPlan.items.find((item) => item.key === 'primaryScore')
const manualPrimary = manualPlan.items.find((item) => item.key === 'primaryScore')
assert.equal(manualPrimary.stake, defaultPrimary.stake)
assert.equal(manualPrimary.odds, 12.25)
assert.equal(manualPrimary.oddsSource, 'manual')
assert.equal(manualPrimary.oddsSourceLabel, '手动覆盖')
assert.notEqual(manualPrimary.potentialProfit, defaultPrimary.potentialProfit)

for (const item of manualPlan.items) {
  assert.equal(Object.hasOwn(item, 'stake'), true)
  assert.equal(Object.hasOwn(item, 'odds'), true)
  assert.equal(Object.hasOwn(item, 'oddsSource'), true)
  assert.equal(Object.hasOwn(item, 'potentialProfit'), true)
  assert.equal(Object.hasOwn(item, 'status'), true)
}

const futureFinished = makeMatch({
  id: 'future-finished',
  kickoff: '2026-06-14T12:00:00+08:00',
  status: 'finished',
  actualScore: { home: 2, away: 0 },
})
const futureScore = getInternalScoreProviderV5(futureFinished, { now })
assert.equal(isUsableScoreProviderResultV5(futureScore, futureFinished, now), false)

const predictionOnly = makeMatch({
  id: 'prediction-only',
  status: 'finished',
  score: { home: 2, away: 0 },
  scoreSource: 'prediction',
  primaryScore: '2-0',
  secondaryScore: '2-1',
})
const predictionScore = getInternalScoreProviderV5(predictionOnly, { now })
assert.equal(predictionScore.status, 'not_found')
assert.equal(isUsableScoreProviderResultV5(predictionScore, predictionOnly, now), false)

const trustedResult = makeMatch({
  id: 'trusted-result',
  status: 'finished',
  result: { home: 2, away: 0 },
})
const trustedScore = getInternalScoreProviderV5(trustedResult, { now })
assert.equal(trustedScore.status, 'found')
assert.equal(trustedScore.source, 'project_actual')
assert.equal(isUsableScoreProviderResultV5(trustedScore, trustedResult, now), true)

const predictionScan = autoReviewFinishedMatches([predictionOnly], createDefaultLedger(), {
  now,
  planScope: 'future_24h',
})
assert.equal(predictionScan.settled, 0)
assert.equal(predictionScan.blockedUntrustedScore, 1)
assert.equal(predictionScan.ledger.currentBankroll, 10000)
assert.equal(
  predictionScan.ledger.records.find((record) => record.matchId === 'prediction-only')?.status,
  RECORD_STATUS_V4.pendingSettlement,
)

const trustedScan = autoReviewFinishedMatches([trustedResult], createDefaultLedger(), {
  now,
  planScope: 'future_24h',
})
assert.equal(trustedScan.settled, 1)
assert.equal(trustedScan.foundScores, 1)
assert.equal(trustedScan.ledger.records[0].settlementSource, 'auto')
assert.equal(trustedScan.ledger.records[0].actualScoreSource, 'project_actual')

console.log('check-internal-v5-providers: ok')
