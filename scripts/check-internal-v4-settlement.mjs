import assert from 'node:assert/strict'
import {
  createDefaultLedger,
  getLedgerSummary,
  settleRecord,
} from '../src/internal/v4/internalLedgerV4.js'
import { settleInternalV4Record } from '../src/internal/v4/internalSettlementV4.js'

function makeRecord() {
  return {
    id: 'v4-settle-sample',
    matchId: 'settle-sample',
    matchName: 'Settle Sample',
    status: 'pending',
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
  }
}

const settlement = settleInternalV4Record(makeRecord(), { home: 2, away: 0 }, {
  bankrollBefore: 10000,
})
assert.equal(settlement.totalStake, 200)
assert.equal(settlement.totalReturn, 600.5)
assert.equal(settlement.profit, 400.5)
assert.equal(settlement.bankrollAfter, 10400.5)
assert.deepEqual(
  settlement.itemResults.map((item) => item.result),
  ['win', 'win', 'loss', 'win'],
)

let ledger = createDefaultLedger()
ledger = {
  ...ledger,
  records: [makeRecord()],
}

const first = settleRecord(ledger, 'v4-settle-sample', { home: 2, away: 0 })
assert.equal(first.action, 'settled')
assert.equal(first.ledger.currentBankroll, 10400.5)
assert.equal(first.ledger.settlements.length, 1)

const duplicate = settleRecord(first.ledger, 'v4-settle-sample', { home: 2, away: 0 })
assert.equal(duplicate.duplicate, true)
assert.equal(duplicate.ledger.currentBankroll, 10400.5)
assert.equal(duplicate.ledger.settlements.length, 1)

const summary = getLedgerSummary(first.ledger)
assert.equal(summary.settledCount, 1)
assert.equal(summary.winCount, 1)
assert.equal(summary.lossCount, 0)
assert.equal(summary.totalProfit, 400.5)

console.log('check-internal-v4-settlement: ok')
