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
  exportLedgerJson,
  getLedgerSummaryForMatches,
  getPlanningLedgerBaselineForScope,
  importLedgerJson,
  parseInternalV5ImportJson,
} from '../src/internal/v4/internalLedgerV4.js'
import { autoReviewFinishedMatches } from '../src/internal/v4/internalAutoReviewV4.js'
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

const richHome = {
  name: 'France',
  shortName: 'France',
  teamStrength: 88,
  recentForm: 82,
  attackRating: 84,
  defenseRating: 78,
  morale: 78,
  fatigue: 28,
  injuryRisk: 18,
}
const richAway = {
  name: 'Haiti',
  shortName: 'Haiti',
  teamStrength: 52,
  recentForm: 49,
  attackRating: 48,
  defenseRating: 45,
  morale: 48,
  fatigue: 50,
  injuryRisk: 42,
}
const formalPlanMatches = [
  {
    id: 'scope-stable-one',
    kickoff: '2026-06-13T12:00:00+08:00',
    status: 'scheduled',
    homeTeam: richHome,
    awayTeam: richAway,
    odds: { home: 1.72, draw: 3.85, away: 5.8, over25: 1.94, under25: 1.92 },
    model: { home: 0.58, draw: 0.25, away: 0.17 },
    totalGoals: { model: { over25Probability: 0.52, under25Probability: 0.48 } },
    contextRisk: 34,
  },
  {
    id: 'scope-stable-two',
    kickoff: '2026-06-13T18:00:00+08:00',
    status: 'scheduled',
    homeTeam: richAway,
    awayTeam: richHome,
    odds: { home: 5.4, draw: 3.75, away: 1.76, over25: 2.04, under25: 1.82 },
    model: { home: 0.2, draw: 0.25, away: 0.55 },
    totalGoals: { model: { over25Probability: 0.47, under25Probability: 0.53 } },
    contextRisk: 40,
  },
]

const firstPlanRun = autoReviewFinishedMatches(formalPlanMatches, createDefaultLedger(), {
  now,
  planScope: PLAN_SCOPE_V5.future24h,
})
assert.equal(firstPlanRun.planned, formalPlanMatches.length)

const firstFormalSummary = getLedgerSummaryForMatches(firstPlanRun.ledger, formalPlanMatches, {
  emptyMatchesMeansEmpty: true,
  planScope: PLAN_SCOPE_V5.future24h,
  useGlobalBankroll: true,
})
const firstStakes = new Map(
  firstPlanRun.ledger.records.map((record) => [record.id, record.totalStake]),
)
const firstItemStakes = new Map(
  firstPlanRun.ledger.records.map((record) => [
    record.id,
    (record.stakePlanSnapshot?.items ?? []).map((item) => `${item.key}:${item.stake}`).join('|'),
  ]),
)
assert.equal(firstFormalSummary.pendingExposure > 0, true)

const stablePlanRun = autoReviewFinishedMatches(formalPlanMatches, firstPlanRun.ledger, {
  now,
  planScope: PLAN_SCOPE_V5.future24h,
})
assert.equal(stablePlanRun.planned, 0)
assert.equal(stablePlanRun.updated, 0)

const stableFormalSummary = getLedgerSummaryForMatches(stablePlanRun.ledger, formalPlanMatches, {
  emptyMatchesMeansEmpty: true,
  planScope: PLAN_SCOPE_V5.future24h,
  useGlobalBankroll: true,
})
assert.equal(stableFormalSummary.pendingExposure, firstFormalSummary.pendingExposure)
for (const record of stablePlanRun.ledger.records) {
  if (record.planScope === PLAN_SCOPE_V5.future24h) {
    assert.equal(record.totalStake, firstStakes.get(record.id))
    assert.equal(
      (record.stakePlanSnapshot?.items ?? []).map((item) => `${item.key}:${item.stake}`).join('|'),
      firstItemStakes.get(record.id),
    )
  }
}

const planningBaseline = getPlanningLedgerBaselineForScope(
  stablePlanRun.ledger,
  PLAN_SCOPE_V5.future24h,
)
assert.equal(
  planningBaseline.records.some(
    (record) =>
      record.planScope === PLAN_SCOPE_V5.future24h &&
      record.status !== RECORD_STATUS_V4.settledAuto &&
      record.status !== RECORD_STATUS_V4.settledManual,
  ),
  false,
)

const previewAfterPlanSummary = getLedgerSummaryForMatches(stablePlanRun.ledger, formalPlanMatches, {
  emptyMatchesMeansEmpty: true,
  ignoreRecords: true,
  includePendingExposure: false,
  useGlobalBankroll: true,
})
assert.equal(previewAfterPlanSummary.pendingExposure, 0)
assert.equal(previewAfterPlanSummary.totalPlannedStake, 0)
assert.equal(previewAfterPlanSummary.currentBankroll, stableFormalSummary.currentBankroll)

const exportJson = exportLedgerJson(stablePlanRun.ledger, {
  activeScope: PLAN_SCOPE_V5.future24h,
  envelope: true,
  oddsOverrides: {
    'scope-stable-one': {
      mainDirection: {
        odds: 1.88,
        source: 'manual',
      },
    },
  },
  planScope: PLAN_SCOPE_V5.future24h,
})
const exportPayload = JSON.parse(exportJson)
assert.equal(exportPayload.version, 'internal-v5-export')
assert.equal(exportPayload.planScope, PLAN_SCOPE_V5.future24h)
assert.equal(exportPayload.activeScope, PLAN_SCOPE_V5.future24h)
assert.equal(exportPayload.ledger.records.length, stablePlanRun.ledger.records.length)
assert.equal(exportPayload.oddsOverrides['scope-stable-one'].mainDirection.odds, 1.88)
assert.equal(exportJson.includes('undefined'), false)
assert.equal(exportJson.includes('NaN'), false)
assert.equal(exportJson.includes('null'), false)

const parsedImport = parseInternalV5ImportJson(exportJson)
assert.equal(parsedImport.version, 'internal-v5-export')
assert.equal(parsedImport.planScope, PLAN_SCOPE_V5.future24h)
assert.equal(parsedImport.oddsOverrides['scope-stable-one'].mainDirection.source, 'manual')
assert.equal(parsedImport.ledger.records.length, stablePlanRun.ledger.records.length)

const importedLedger = importLedgerJson(exportJson)
assert.equal(importedLedger.records.length, stablePlanRun.ledger.records.length)

console.log('check-internal-v5-plan-scope: ok')
