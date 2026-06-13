import assert from 'node:assert/strict'
import { buildInternalV4Analysis } from '../src/internal/v4/internalEngineV4.js'
import {
  createDefaultLedger,
  upsertPlannedRecord,
} from '../src/internal/v4/internalLedgerV4.js'
import { buildInternalStakePlan } from '../src/internal/v4/internalStakeV4.js'
import {
  GRADE_BASE_RATES_V4,
  INTERNAL_V4_VERSION,
  STAKE_ITEM_KEYS_V4,
  STAKE_ITEM_LABELS_V4,
} from '../src/internal/v4/internalTypesV4.js'

function makeAnalysis(overrides = {}) {
  const confidence = {
    directionConfidence: 78,
    scoreConfidence: 70,
    overUnderConfidence: 66,
    dataConfidence: 76,
    internalConfidence: 74,
    gameTypeModifier: 76,
    ...(overrides.confidence ?? {}),
  }

  return {
    version: INTERNAL_V4_VERSION,
    match: { id: 'stake-sample', matchName: 'Stake Sample' },
    classification: {
      gameType: '强队压制局',
      ...(overrides.classification ?? {}),
    },
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
    confidence,
  }
}

function assertPlanShape(plan, currentBankroll = 10000) {
  assert.equal(plan.version, INTERNAL_V4_VERSION)
  assert.equal(Number.isFinite(plan.totalStake), true)
  assert.equal(plan.totalStake <= Math.floor(currentBankroll * 0.05), true)
  assert.equal(
    plan.items.reduce((sum, item) => sum + item.stake, 0),
    plan.totalStake,
  )
  assert.deepEqual(
    plan.items.map((item) => item.key),
    STAKE_ITEM_KEYS_V4,
  )
  assert.deepEqual(
    plan.items.map((item) => item.label),
    STAKE_ITEM_KEYS_V4.map((key) => STAKE_ITEM_LABELS_V4[key]),
  )

  for (const item of plan.items) {
    assert.equal(typeof item.label, 'string')
    assert.equal(typeof item.pick, 'string')
    assert.equal(Number.isFinite(item.stake), true)
    assert.equal(Number.isFinite(item.odds), true)
    assert.equal(item.odds > 1, true)
    assert.equal(Number.isFinite(item.potentialProfit), true)
    assert.equal(typeof item.reason, 'string')
    assert.equal(typeof item.confidenceUsed, 'number')
  }
}

const ledger = createDefaultLedger()
const gradeCases = [
  ['A', 94],
  ['B+', 86],
  ['B', 78],
  ['C', 69],
  ['D+', 61],
  ['D', 45],
]
const totals = []

for (const [grade, internalConfidence] of gradeCases) {
  const plan = buildInternalStakePlan(
    makeAnalysis({
      decision: { grade, fundingTier: grade },
      confidence: { internalConfidence },
      predictions: { overUnder: '小2.5' },
    }),
    ledger,
  )

  assertPlanShape(plan)
  assert.equal(plan.baseRate, GRADE_BASE_RATES_V4[grade])
  assert.equal(plan.totalStake > 0, true, `${grade} must still receive stake`)
  assert.equal(plan.totalStake >= 10, true, `${grade} must respect minimum stake`)
  totals.push(plan.totalStake)
}

for (let index = 1; index < totals.length; index += 1) {
  assert.equal(totals[index - 1] > totals[index], true, 'higher confidence tiers should stake more')
}

const zeroBankrollPlan = buildInternalStakePlan(makeAnalysis(), {
  ...ledger,
  currentBankroll: 0,
})
assert.equal(zeroBankrollPlan.totalStake, 0)

const boundaryPlan = buildInternalStakePlan(
  makeAnalysis({
    confidence: {
      directionConfidence: 62,
      scoreConfidence: 64,
      overUnderConfidence: 95,
      internalConfidence: 74,
    },
    predictions: { overUnder: '2.5球分界' },
  }),
  ledger,
)
assertPlanShape(boundaryPlan)
const boundaryOu = boundaryPlan.items.find((item) => item.key === 'overUnder')
assert.equal(boundaryOu.stake <= Math.floor(boundaryPlan.totalStake * 0.05), true)

const scoreDominant = buildInternalStakePlan(
  makeAnalysis({
    confidence: {
      directionConfidence: 66,
      scoreConfidence: 91,
      overUnderConfidence: 63,
      internalConfidence: 82,
    },
    decision: { grade: 'B+', fundingTier: 'B+' },
    predictions: { overUnder: '小2.5' },
  }),
  ledger,
)
assert.equal(scoreDominant.dominantConfidence, 'score')
assert.equal(scoreDominant.split.primaryScore >= 20, true)
assertPlanShape(scoreDominant)

const futureMatch = {
  id: 'stake-ledger-pending',
  kickoff: '2026-06-20T12:00:00+08:00',
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
  odds: { home: 1.74, draw: 3.85, away: 5.4, over25: 1.95, under25: 1.92 },
  model: { home: 0.57, draw: 0.25, away: 0.18 },
  totalGoals: { model: { over25Probability: 0.51, under25Probability: 0.49 } },
}
const pendingAnalysis = buildInternalV4Analysis(futureMatch, { bankroll: ledger.currentBankroll })
const pendingPlan = buildInternalStakePlan(pendingAnalysis, ledger)
const pendingResult = upsertPlannedRecord(ledger, futureMatch, pendingAnalysis, pendingPlan, {
  now: new Date('2026-06-13T00:00:00+08:00'),
})

assert.equal(pendingResult.ledger.currentBankroll, 10000)
assert.equal(pendingResult.ledger.settledProfit, 0)
assert.equal(pendingResult.ledger.pendingExposure, pendingPlan.totalStake)
assert.equal(pendingResult.record.totalStake > 0, true)

console.log('check-internal-v4-stake: ok')
