import { buildInternalV4Analysis } from './internalEngineV4.js'
import { buildInternalStakePlan } from './internalStakeV4.js'
import {
  settleRecord,
  upsertPlannedRecord,
} from './internalLedgerV4.js'
import {
  getActualScoreFromMatchV4,
  getRecordIdV4,
  isFinishedMatchV4,
} from './internalSelectorsV4.js'

export function autoReviewFinishedMatches(matches = [], ledger, options = {}) {
  let workingLedger = ledger
  const results = []
  const counts = {
    planned: 0,
    updated: 0,
    settled: 0,
    skipped: 0,
    pending: 0,
    duplicates: 0,
  }

  for (const match of matches) {
    const recordId = getRecordIdV4(match)
    const existing = workingLedger?.records?.find((record) => record.id === recordId)

    if (existing?.status !== 'settled') {
      const analysis = buildInternalV4Analysis(match, {
        bankroll: workingLedger?.currentBankroll,
      })
      const stakePlan = buildInternalStakePlan(analysis, workingLedger, options.stakeOptions)
      const upsertResult = upsertPlannedRecord(workingLedger, match, analysis, stakePlan)
      workingLedger = upsertResult.ledger
      if (upsertResult.action === 'planned') counts.planned += 1
      if (upsertResult.action === 'updated') counts.updated += 1
    }

    if (!isFinishedMatchV4(match)) {
      results.push({ recordId, action: 'not-finished' })
      continue
    }

    const actualScore = getActualScoreFromMatchV4(match)
    if (!actualScore) {
      results.push({ recordId, action: 'missing-score' })
      continue
    }

    const settlement = settleRecord(workingLedger, recordId, actualScore)
    workingLedger = settlement.ledger

    if (settlement.duplicate) {
      counts.duplicates += 1
    } else if (settlement.action === 'settled') {
      counts.settled += 1
    } else {
      results.push({
        recordId,
        action: settlement.action,
        duplicate: settlement.duplicate,
        profit: settlement.settlement?.profit ?? 0,
      })
      continue
    }

    results.push({
      recordId,
      action: settlement.action,
      duplicate: settlement.duplicate,
      profit: settlement.settlement?.profit ?? 0,
    })
  }

  const finalRecords = workingLedger?.records ?? []
  counts.pending = finalRecords.filter((record) => record.status === 'pending').length
  counts.skipped += finalRecords.filter((record) => record.status === 'skipped').length

  return {
    ledger: workingLedger,
    ...counts,
    results,
  }
}
