import { getLedgerSummary } from './internalLedgerV4.js'

export function buildInternalV4Report(ledger, scanResult = null) {
  const summary = getLedgerSummary(ledger)
  return {
    generatedAt: new Date().toISOString(),
    funds: {
      initial: summary.initialBankroll,
      current: summary.currentBankroll,
      available: summary.availableBankroll,
      settledProfit: summary.settledProfit,
      pendingExposure: summary.pendingExposure,
      maxDrawdown: summary.maxDrawdown,
    },
    counts: {
      records: summary.recordCount,
      settled: summary.settledCount,
      pending: summary.pendingCount,
      upcoming: summary.upcomingCount,
      manual: summary.manualSettledCount,
      auto: summary.autoSettledCount,
      win: summary.winCount,
      loss: summary.lossCount,
    },
    scan: scanResult
      ? {
          planned: scanResult.planned,
          updated: scanResult.updated,
          settled: scanResult.settled,
          pending: scanResult.pending,
          upcoming: scanResult.upcoming,
          blockedFuture: scanResult.blockedFuture,
          blockedUntrustedScore: scanResult.blockedUntrustedScore,
        }
      : null,
    recent: summary.lastRecords.map((record) => ({
      matchName: record.matchName,
      actualScore: record.actualScore,
      actualScoreSource: record.actualScoreSource,
      settlementSource: record.settlementSource,
      profit: record.profit,
      bankrollAfter: record.bankrollAfter,
      settledAt: record.settledAt,
    })),
  }
}
