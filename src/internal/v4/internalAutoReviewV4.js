import { buildInternalV4Analysis } from './internalEngineV4.js'
import { buildInternalStakePlan } from './internalStakeV4.js'
import {
  getPlanningLedgerBaselineForScope,
  getLedgerSummaryForMatches,
  settleRecord,
  upsertPlannedRecord,
} from './internalLedgerV4.js'
import {
  getRecordIdV4,
} from './internalSelectorsV4.js'
import {
  getInternalScoreProviderV5,
  isUsableScoreProviderResultV5,
  scoreProviderResultToActualScoreV5,
} from './internalScoreProviderV5.js'

function isSettled(record) {
  return record?.status === 'settled_auto' || record?.status === 'settled_manual'
}

export function autoReviewFinishedMatches(matches = [], ledger, options = {}) {
  let workingLedger = ledger
  const now = options.now ?? new Date()
  const results = []
  const shouldCreatePlans = options.createPlans !== false
  const planScope = options.planScope ?? 'future_24h'
  const forceRefresh = options.forceRefresh === true
  const planningBaseline = getPlanningLedgerBaselineForScope(ledger, planScope)
  const planningSummary = getLedgerSummaryForMatches(planningBaseline, matches, {
    emptyMatchesMeansEmpty: true,
    planScope,
    useGlobalBankroll: true,
  })
  const counts = {
    scanned: matches.length,
    planned: 0,
    updated: 0,
    autoSettled: 0,
    settled: 0,
    foundScores: 0,
    skipped: 0,
    blockedFuture: 0,
    blockedUntrustedScore: 0,
    pending: 0,
    upcoming: 0,
    duplicates: 0,
  }

  for (const match of matches) {
    const recordId = getRecordIdV4(match)
    const existing = workingLedger?.records?.find((record) => record.id === recordId)

    const scoreProviderResult = getInternalScoreProviderV5(match, { now })

    if (!isSettled(existing) && shouldCreatePlans) {
      const analysis = buildInternalV4Analysis(match, {
        bankroll: planningSummary.currentBankroll,
      })
      const stakePlan = buildInternalStakePlan(analysis, planningSummary, {
        ...(options.stakeOptions ?? {}),
        match,
        oddsOverrides: options.oddsOverrides ?? options.stakeOptions?.oddsOverrides ?? {},
      })
      const upsertResult = upsertPlannedRecord(workingLedger, match, analysis, stakePlan, {
        now,
        planScope,
        forceRefresh,
        scoreProviderSnapshot: scoreProviderResult,
      })
      workingLedger = upsertResult.ledger
      if (upsertResult.action === 'planned') counts.planned += 1
      if (upsertResult.action === 'updated') counts.updated += 1
    }

    const currentRecord = workingLedger?.records?.find((record) => record.id === recordId)
    if (isSettled(currentRecord)) {
      results.push({ recordId, action: 'already-settled' })
      counts.skipped += 1
      continue
    }

    if (!isUsableScoreProviderResultV5(scoreProviderResult, match, now)) {
      if (scoreProviderResult.reason?.includes('尚未开赛')) counts.blockedFuture += 1
      else counts.blockedUntrustedScore += 1
      counts.skipped += 1
      results.push({
        recordId,
        action: 'blocked',
        reason: scoreProviderResult.reason,
        scoreProvider: scoreProviderResult,
        scoreSource: scoreProviderResult.source,
      })
      continue
    }

    counts.foundScores += 1
    const settlement = settleRecord(workingLedger, recordId, scoreProviderResultToActualScoreV5(scoreProviderResult), {
      settlementSource: 'auto',
      actualScoreSource: scoreProviderResult.source,
    })
    workingLedger = settlement.ledger

    if (settlement.duplicate) {
      counts.duplicates += 1
    } else if (settlement.action === 'settled-auto') {
      counts.autoSettled += 1
      counts.settled += 1
    }

    results.push({
      recordId,
      action: settlement.action,
      duplicate: settlement.duplicate,
      profit: settlement.settlement?.profit ?? 0,
      settlementSource: 'auto',
      actualScoreSource: scoreProviderResult.source,
      scoreProvider: scoreProviderResult,
    })
  }

  const currentRecordIds = new Set(matches.map((match) => getRecordIdV4(match)))
  const finalRecords = (workingLedger?.records ?? []).filter((record) =>
    currentRecordIds.has(record.id) && record.planScope === planScope,
  )
  counts.pending = finalRecords.filter(
    (record) =>
      record.status === 'pending_settlement' || record.status === 'live_or_unknown',
  ).length
  counts.upcoming = finalRecords.filter((record) => record.status === 'upcoming').length

  return {
    ledger: workingLedger,
    ...counts,
    results,
  }
}
