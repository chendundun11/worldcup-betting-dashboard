import assert from 'node:assert/strict'
import { buildInternalStakePlan } from '../src/internal/v4/internalStakeV4.js'

function makeAnalysis(overrides = {}) {
  return {
    version: 'internal-v4',
    match: { id: 'stake-sample', matchName: 'Stake Sample' },
    classification: {
      gameType: '强队压制局',
      ...(overrides.classification ?? {}),
    },
    decision: {
      mainPick: '主队胜',
      executionLevel: '强推候选',
      poolStatus: '主推池',
      grade: 'A',
      ...(overrides.decision ?? {}),
    },
    predictions: {
      primaryScore: '2-0',
      secondaryScore: '2-1',
      overUnder: '小2.5',
      ...(overrides.predictions ?? {}),
    },
    consistency: {
      hardConflict: false,
      ...(overrides.consistency ?? {}),
    },
  }
}

const ledger = { initialBankroll: 10000, currentBankroll: 10000, records: [] }

for (const [grade, expectedStake] of [
  ['A', 500],
  ['B+', 350],
  ['B', 250],
  ['C', 120],
  ['D', 0],
]) {
  const plan = buildInternalStakePlan(
    makeAnalysis({
      decision: {
        grade,
        poolStatus: grade === 'D' ? '剔除' : '主推池',
        mainPick: grade === 'D' ? '不进主推池' : '主队胜',
      },
    }),
    ledger,
  )
  assert.equal(plan.totalStake, expectedStake)
  assert.equal(plan.capPercent <= 0.05, true)
  assert.equal(
    plan.items.reduce((sum, item) => sum + item.stake, 0),
    plan.totalStake,
  )
}

const conflictPlan = buildInternalStakePlan(
  makeAnalysis({
    classification: { gameType: '方向冲突局' },
    decision: { grade: 'A', poolStatus: '剔除', mainPick: '不进主推池' },
    consistency: { hardConflict: true },
  }),
  ledger,
)
assert.equal(conflictPlan.totalStake, 0)

const infoPlan = buildInternalStakePlan(
  makeAnalysis({
    classification: { gameType: '信息不足局' },
    decision: { grade: 'A', poolStatus: '观察池' },
  }),
  ledger,
)
assert.equal(infoPlan.totalStake <= 80, true)

const boundaryPlan = buildInternalStakePlan(
  makeAnalysis({
    predictions: { overUnder: '2.5分界' },
  }),
  ledger,
)
assert.equal(boundaryPlan.items.find((item) => item.key === 'overUnder').stake, 0)
assert.equal(
  boundaryPlan.items.reduce((sum, item) => sum + item.stake, 0),
  boundaryPlan.totalStake,
)

for (const item of boundaryPlan.items) {
  assert.equal(typeof item.label, 'string')
  assert.equal(Number.isFinite(item.odds), true)
  assert.equal(Number.isFinite(item.potentialProfit), true)
  assert.equal(typeof item.reason, 'string')
}

assert.deepEqual(
  buildInternalStakePlan(makeAnalysis(), ledger).items.map((item) => item.label),
  ['主方向投入', '主推比分投入', '备用比分投入', '大小球投入'],
)

console.log('check-internal-v4-stake: ok')
