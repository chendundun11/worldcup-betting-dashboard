import assert from 'node:assert/strict'
import { autoReviewFinishedMatches } from '../src/internal/v4/internalAutoReviewV4.js'
import {
  createDefaultLedger,
  getLedgerSummary,
  settleRecord,
} from '../src/internal/v4/internalLedgerV4.js'
import { settleInternalV4Record } from '../src/internal/v4/internalSettlementV4.js'
import {
  INTERNAL_V4_LEDGER_VERSION,
  RECORD_STATUS_V4,
} from '../src/internal/v4/internalTypesV4.js'

function makeTeams() {
  return {
    homeTeam: {
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
    awayTeam: {
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
}

function makeMatch(overrides = {}) {
  return {
    id: 'settlement-match',
    kickoff: '2026-06-12T12:00:00+08:00',
    status: 'finished',
    ...makeTeams(),
    odds: { home: 1.74, draw: 3.85, away: 5.4, over25: 1.95, under25: 1.92 },
    model: { home: 0.57, draw: 0.25, away: 0.18 },
    totalGoals: { model: { over25Probability: 0.51, under25Probability: 0.49 } },
    contextRisk: 36,
    ...overrides,
  }
}

function makeRecord(overrides = {}) {
  return {
    id: 'v5-settle-sample',
    matchId: 'settle-sample',
    matchName: 'Settle Sample',
    status: RECORD_STATUS_V4.pendingSettlement,
    totalStake: 200,
    stakePlanSnapshot: {
      items: [
        {
          key: 'mainDirection',
          label: '主方向投入',
          pick: '主队胜',
          stake: 100,
          odds: 1.7,
        },
        {
          key: 'primaryScore',
          label: '主推比分投入',
          pick: '2-0',
          stake: 50,
          odds: 7.5,
        },
        {
          key: 'secondaryScore',
          label: '备用比分投入',
          pick: '2-1',
          stake: 20,
          odds: 8.5,
        },
        {
          key: 'overUnder',
          label: '大小球投入',
          pick: '小2.5',
          stake: 30,
          odds: 1.85,
        },
      ],
    },
    ...overrides,
  }
}

const settlement = settleInternalV4Record(makeRecord(), { home: 2, away: 0 }, {
  bankrollBefore: 10000,
  settlementSource: 'manual',
  actualScoreSource: 'manual',
})
assert.equal(settlement.totalStake, 200)
assert.equal(settlement.totalReturn, 600.5)
assert.equal(settlement.profit, 400.5)
assert.equal(settlement.bankrollAfter, 10400.5)
assert.equal(settlement.settlementSource, 'manual')
assert.equal(settlement.actualScoreSource, 'manual')
assert.deepEqual(
  settlement.itemResults.map((item) => item.result),
  ['win', 'win', 'loss', 'win'],
)

let ledger = createDefaultLedger()
ledger = {
  ...ledger,
  records: [makeRecord()],
}

const first = settleRecord(ledger, 'v5-settle-sample', { home: 2, away: 0 }, {
  settlementSource: 'manual',
  actualScoreSource: 'manual',
})
assert.equal(first.action, 'settled-manual')
assert.equal(first.record.status, RECORD_STATUS_V4.settledManual)
assert.equal(first.record.settlementSource, 'manual')
assert.equal(first.ledger.version, INTERNAL_V4_LEDGER_VERSION)
assert.equal(first.ledger.currentBankroll, 10400.5)
assert.equal(first.ledger.settledProfit, 400.5)
assert.equal(first.ledger.pendingExposure, 0)

const duplicate = settleRecord(first.ledger, 'v5-settle-sample', { home: 2, away: 0 }, {
  settlementSource: 'manual',
})
assert.equal(duplicate.duplicate, true)
assert.equal(duplicate.ledger.currentBankroll, 10400.5)
assert.equal(duplicate.ledger.records.length, 1)

const summary = getLedgerSummary(first.ledger)
assert.equal(summary.currentBankroll, summary.initialBankroll + summary.settledProfit)
assert.equal(summary.settledCount, 1)
assert.equal(summary.winCount, 1)
assert.equal(summary.lossCount, 0)
assert.equal(summary.totalProfit, 400.5)

const now = new Date('2026-06-13T00:00:00+08:00')

const futureFinished = makeMatch({
  id: 'future-finished',
  kickoff: '2026-06-20T12:00:00+08:00',
  status: 'FINISHED',
  actualScore: { home: 2, away: 0 },
})
const futureScan = autoReviewFinishedMatches([futureFinished], createDefaultLedger(), { now })
assert.equal(futureScan.settled, 0)
assert.equal(futureScan.blockedFuture, 1)
assert.equal(futureScan.ledger.currentBankroll, 10000)
assert.equal(futureScan.ledger.settledProfit, 0)

const predictionOnly = makeMatch({
  id: 'prediction-only',
  score: { home: 2, away: 0 },
  scoreSource: 'prediction',
})
const predictionScan = autoReviewFinishedMatches([predictionOnly], createDefaultLedger(), { now })
assert.equal(predictionScan.settled, 0)
assert.equal(predictionScan.blockedUntrustedScore, 1)
assert.equal(predictionScan.ledger.currentBankroll, 10000)

const trustedFinished = makeMatch({
  id: 'trusted-finished',
  result: { home: 2, away: 0 },
})
const trustedScan = autoReviewFinishedMatches([trustedFinished], createDefaultLedger(), { now })
assert.equal(trustedScan.settled, 1)
assert.equal(trustedScan.ledger.settledCount, 1)
assert.equal(trustedScan.ledger.records[0].status, RECORD_STATUS_V4.settledAuto)
assert.equal(trustedScan.ledger.records[0].settlementSource, 'auto')
assert.equal(trustedScan.ledger.records[0].actualScoreSource, 'result')

const duplicateAutoScan = autoReviewFinishedMatches([trustedFinished], trustedScan.ledger, { now })
assert.equal(duplicateAutoScan.settled, 0)
assert.equal(duplicateAutoScan.ledger.settledCount, 1)
assert.equal(duplicateAutoScan.ledger.currentBankroll, trustedScan.ledger.currentBankroll)

console.log('check-internal-v4-settlement: ok')
