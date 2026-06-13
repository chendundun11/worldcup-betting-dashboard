import { getLedgerSummary } from './internalLedgerV4.js'

export function buildInternalV4Report(ledger, scanResult = null) {
  const summary = getLedgerSummary(ledger)
  return {
    generatedAt: new Date().toISOString(),
    funds: {
      initial: summary.initialBankroll,
      current: summary.currentBankroll,
      profit: summary.totalProfit,
      drawdown: summary.drawdown,
    },
    counts: {
      records: summary.recordCount,
      settled: summary.settledCount,
      pending: summary.pendingCount,
      skipped: summary.skippedCount,
      win: summary.winCount,
      loss: summary.lossCount,
    },
    scan: scanResult
      ? {
          planned: scanResult.planned,
          settled: scanResult.settled,
          skipped: scanResult.skipped,
          pending: scanResult.pending,
          duplicates: scanResult.duplicates,
        }
      : null,
    recent: summary.lastRecords.map((record) => ({
      matchName: record.matchName,
      actualScore: record.actualScore,
      profit: record.profit,
      bankrollAfter: record.bankrollAfter,
      settledAt: record.settledAt,
    })),
  }
}
