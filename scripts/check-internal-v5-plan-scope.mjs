import assert from 'node:assert/strict'
import {
  DEFAULT_PLAN_SCOPE_V5,
  PLAN_SCOPE_V5,
  isFormalPlanScopeV5,
  isPreviewPlanScopeV5,
  selectMatchesByPlanScopeV5,
} from '../src/internal/v4/internalPlanScopeV5.js'
import {
  createDefaultLedger,
  getLedgerSummaryForMatches,
} from '../src/internal/v4/internalLedgerV4.js'
import { RECORD_STATUS_V4 } from '../src/internal/v4/internalTypesV4.js'

const now = new Date('2026-06-13T10:00:00+08:00')
const matches = [
  { id: 'future-two-hours', kickoff: '2026-06-13T12:00:00+08:00', status: 'scheduled' },
  { id: 'future-twenty-three', kickoff: '2026-06-14T09:00:00+08:00', status: 'scheduled' },
  { id: 'future-twenty-six', kickoff: '2026-06-14T12:30:00+08:00', status: 'scheduled' },
  { id: 'today-past', kickoff: '2026-06-13T08:00:00+08:00', status: 'finished' },
]

assert.equal(DEFAULT_PLAN_SCOPE_V5, PLAN_SCOPE_V5.future24h)
assert.equal(isFormalPlanScopeV5(PLAN_SCOPE_V5.future24h), true)
assert.equal(isFormalPlanScopeV5(PLAN_SCOPE_V5.todayBeijing), true)
assert.equal(isPreviewPlanScopeV5(PLAN_SCOPE_V5.allPreview), true)

const future24h = selectMatchesByPlanScopeV5(matches, PLAN_SCOPE_V5.future24h, { now })
assert.deepEqual(
  future24h.map((match) => match.id),
  ['future-two-hours', 'future-twenty-three'],
)

const todayBeijing = selectMatchesByPlanScopeV5(matches, PLAN_SCOPE_V5.todayBeijing, { now })
assert.deepEqual(
  todayBeijing.map((match) => match.id),
  ['future-two-hours', 'today-past'],
)

const allPreview = selectMatchesByPlanScopeV5(matches, PLAN_SCOPE_V5.allPreview, { now })
assert.equal(allPreview.length, matches.length)

const ledger = {
  ...createDefaultLedger(),
  records: [
    {
      id: 'v5-future-two-hours',
      matchId: 'future-two-hours',
      matchName: 'Future 2h',
      planScope: PLAN_SCOPE_V5.future24h,
      status: RECORD_STATUS_V4.upcoming,
      totalStake: 120,
      plannedAt: '2026-06-13T02:00:00.000Z',
    },
    {
      id: 'v5-future-twenty-six',
      matchId: 'future-twenty-six',
      matchName: 'Future 26h',
      planScope: PLAN_SCOPE_V5.future24h,
      status: RECORD_STATUS_V4.upcoming,
      totalStake: 900,
      plannedAt: '2026-06-13T02:00:00.000Z',
    },
    {
      id: 'v5-today-past',
      matchId: 'today-past',
      matchName: 'Today Past',
      planScope: PLAN_SCOPE_V5.todayBeijing,
      status: RECORD_STATUS_V4.pendingSettlement,
      totalStake: 80,
      plannedAt: '2026-06-13T02:00:00.000Z',
    },
    {
      id: 'v5-old-settled',
      matchId: 'old-settled',
      matchName: 'Old Settled',
      planScope: PLAN_SCOPE_V5.future24h,
      status: RECORD_STATUS_V4.settledManual,
      settlementSource: 'manual',
      totalStake: 50,
      totalReturn: 95,
      profit: 45,
      bankrollAfter: 10045,
      settledAt: '2026-06-12T02:00:00.000Z',
    },
  ],
}

const futureSummary = getLedgerSummaryForMatches(ledger, future24h, {
  emptyMatchesMeansEmpty: true,
  planScope: PLAN_SCOPE_V5.future24h,
  useGlobalBankroll: true,
})
assert.equal(futureSummary.totalMatches, 2)
assert.equal(futureSummary.pendingExposure, 120)
assert.equal(futureSummary.totalPlannedStake, 120)
assert.equal(futureSummary.currentBankroll, 10045)
assert.equal(futureSummary.currentBankroll, futureSummary.initialBankroll + futureSummary.settledProfit)

const todaySummary = getLedgerSummaryForMatches(ledger, todayBeijing, {
  emptyMatchesMeansEmpty: true,
  planScope: PLAN_SCOPE_V5.todayBeijing,
  useGlobalBankroll: true,
})
assert.equal(todaySummary.pendingExposure, 80)
assert.equal(todaySummary.totalPlannedStake, 80)

const previewSummary = getLedgerSummaryForMatches(ledger, allPreview, {
  emptyMatchesMeansEmpty: true,
  ignoreRecords: true,
  includePendingExposure: false,
  useGlobalBankroll: true,
})
assert.equal(previewSummary.totalMatches, matches.length)
assert.equal(previewSummary.pendingExposure, 0)
assert.equal(previewSummary.totalPlannedStake, 0)
assert.equal(previewSummary.currentBankroll, 10045)

const emptyFuture = getLedgerSummaryForMatches(ledger, [], {
  emptyMatchesMeansEmpty: true,
  planScope: PLAN_SCOPE_V5.future24h,
  useGlobalBankroll: true,
})
assert.equal(emptyFuture.totalMatches, 0)
assert.equal(emptyFuture.pendingExposure, 0)
assert.equal(emptyFuture.plannedCount, 0)

console.log('check-internal-v5-plan-scope: ok')
