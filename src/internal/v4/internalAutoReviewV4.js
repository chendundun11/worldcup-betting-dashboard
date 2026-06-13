import { buildInternalV4Analysis } from './internalEngineV4.js'
import { buildInternalStakePlan } from './internalStakeV4.js'
import {
  getLedgerSummaryForMatches,
  settleRecord,
  upsertPlannedRecord,
} from './internalLedgerV4.js'
import {
  getRecordIdV4,
  getTrustedActualScoreV4,
} from './internalSelectorsV4.js'

function isSettled(record) {
  return record?.status === 'settled_auto' || record?.status === 'settled_manual'
}

export function autoReviewFinishedMatches(matches = [], ledger, options = {}) {
  let workingLedger = ledger
  const now = options.now ?? new Date()
  const results = []
  const counts = {
    planned: 0,
    updated: 0,
    autoSettled: 0,
    settled: 0,
    blockedFuture: 0,
    blockedUntrustedScore: 0,
    pending: 0,
    upcoming: 0,
    duplicates: 0,
  }

  for (const match of matches) {
    const recordId = getRecordIdV4(match)
    const existing = workingLedger?.records?.find((record) => record.id === recordId)

    if (!isSettled(existing)) {
      const scopedLedger = getLedgerSummaryForMatches(workingLedger, matches)
      const analysis = buildInternalV4Analysis(match, {
        bankroll: scopedLedger.currentBankroll,
      })
      const stakePlan = buildInternalStakePlan(analysis, scopedLedger, options.stakeOptions)
      const upsertResult = upsertPlannedRecord(workingLedger, match, analysis, stakePlan, {
        now,
      })
      workingLedger = upsertResult.ledger
      if (upsertResult.action === 'planned') counts.planned += 1
      if (upsertResult.action === 'updated') counts.updated += 1
    }

    const currentRecord = workingLedger?.records?.find((record) => record.id === recordId)
    if (isSettled(currentRecord)) {
      results.push({ recordId, action: 'already-settled' })
      continue
    }

    const gate = getTrustedActualScoreV4(match, now)
    if (!gate.trusted) {
      if (gate.reason === 'future-kickoff') counts.blockedFuture += 1
      if (gate.reason === 'missing-trusted-final-score') counts.blockedUntrustedScore += 1
      results.push({
        recordId,
        action: 'blocked',
        reason: gate.reason,
        scoreSource: gate.source,
      })
      continue
    }

    const settlement = settleRecord(workingLedger, recordId, gate.score, {
      settlementSource: 'auto',
      actualScoreSource: gate.source,
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
      actualScoreSource: gate.source,
    })
  }

  const currentRecordIds = new Set(matches.map((match) => getRecordIdV4(match)))
  const finalRecords = (workingLedger?.records ?? []).filter((record) =>
    currentRecordIds.has(record.id),
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
