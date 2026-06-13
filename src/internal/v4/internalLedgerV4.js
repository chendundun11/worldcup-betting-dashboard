import {
  INTERNAL_V4_INITIAL_BANKROLL,
  INTERNAL_V4_LEDGER_KEY,
  INTERNAL_V4_VERSION,
  RECORD_STATUS_V4,
} from './internalTypesV4.js'
import {
  getMatchIdV4,
  getMatchNameV4,
  getRecordIdV4,
  getTeamNameV4,
  roundTo,
  toFiniteNumber,
} from './internalSelectorsV4.js'
import { settleInternalV4Record } from './internalSettlementV4.js'

function hasStorage() {
  return typeof window !== 'undefined' && Boolean(window.localStorage)
}

function nowIso() {
  return new Date().toISOString()
}

function normalizeLedger(raw) {
  const initialBankroll = toFiniteNumber(raw?.initialBankroll, INTERNAL_V4_INITIAL_BANKROLL)
  const currentBankroll = toFiniteNumber(raw?.currentBankroll, initialBankroll)
  return {
    version: INTERNAL_V4_VERSION,
    initialBankroll,
    currentBankroll,
    records: Array.isArray(raw?.records) ? raw.records : [],
    settlements: Array.isArray(raw?.settlements) ? raw.settlements : [],
    createdAt: raw?.createdAt ?? nowIso(),
    updatedAt: raw?.updatedAt ?? nowIso(),
  }
}

export function createDefaultLedger() {
  return {
    version: INTERNAL_V4_VERSION,
    initialBankroll: INTERNAL_V4_INITIAL_BANKROLL,
    currentBankroll: INTERNAL_V4_INITIAL_BANKROLL,
    records: [],
    settlements: [],
    createdAt: nowIso(),
    updatedAt: nowIso(),
  }
}

export function getInternalLedgerV4() {
  if (!hasStorage()) return createDefaultLedger()

  try {
    const raw = window.localStorage.getItem(INTERNAL_V4_LEDGER_KEY)
    if (!raw) return createDefaultLedger()
    return normalizeLedger(JSON.parse(raw))
  } catch {
    return createDefaultLedger()
  }
}

export function saveInternalLedgerV4(ledger) {
  const normalized = normalizeLedger({
    ...ledger,
    updatedAt: nowIso(),
  })
  if (hasStorage()) {
    window.localStorage.setItem(INTERNAL_V4_LEDGER_KEY, JSON.stringify(normalized))
  }
  return normalized
}

export function resetInternalLedgerV4() {
  const ledger = createDefaultLedger()
  if (hasStorage()) {
    window.localStorage.setItem(INTERNAL_V4_LEDGER_KEY, JSON.stringify(ledger))
  }
  return ledger
}

function createPlannedRecord(match, analysis, stakePlan, existingRecord = null) {
  const totalStake = toFiniteNumber(stakePlan?.totalStake, 0)
  return {
    id: getRecordIdV4(match),
    matchId: getMatchIdV4(match),
    matchName: getMatchNameV4(match),
    homeTeam: getTeamNameV4(match, 'home'),
    awayTeam: getTeamNameV4(match, 'away'),
    kickoff: match?.kickoff ?? analysis?.match?.kickoff ?? '',
    plannedAt: existingRecord?.plannedAt ?? nowIso(),
    settledAt: existingRecord?.settledAt ?? null,
    status: totalStake > 0 ? RECORD_STATUS_V4.pending : RECORD_STATUS_V4.skipped,
    analysisSnapshot: analysis,
    stakePlanSnapshot: stakePlan,
    actualScore: existingRecord?.actualScore ?? null,
    itemResults: existingRecord?.itemResults ?? [],
    totalStake,
    totalReturn: existingRecord?.totalReturn ?? 0,
    profit: existingRecord?.profit ?? 0,
    bankrollAfter: existingRecord?.bankrollAfter ?? null,
  }
}

export function upsertPlannedRecord(ledger, match, analysis, stakePlan) {
  const normalizedLedger = normalizeLedger(ledger)
  const recordId = getRecordIdV4(match)
  const existingIndex = normalizedLedger.records.findIndex((record) => record.id === recordId)
  const existingRecord = existingIndex >= 0 ? normalizedLedger.records[existingIndex] : null

  if (existingRecord?.status === RECORD_STATUS_V4.settled) {
    return {
      ledger: normalizedLedger,
      record: existingRecord,
      action: 'kept-settled',
    }
  }

  const nextRecord = createPlannedRecord(match, analysis, stakePlan, existingRecord)
  const records =
    existingIndex >= 0
      ? normalizedLedger.records.map((record, index) =>
          index === existingIndex ? nextRecord : record,
        )
      : [nextRecord, ...normalizedLedger.records]

  return {
    ledger: normalizeLedger({
      ...normalizedLedger,
      records,
      updatedAt: nowIso(),
    }),
    record: nextRecord,
    action: existingIndex >= 0 ? 'updated' : 'planned',
  }
}

export function addSettlementRecord(ledger, settlement) {
  const normalizedLedger = normalizeLedger(ledger)
  const settlements = [
    {
      ...settlement,
      id: `${settlement.recordId}-${settlement.settledAt}`,
    },
    ...normalizedLedger.settlements,
  ].slice(0, 200)

  return normalizeLedger({
    ...normalizedLedger,
    settlements,
    updatedAt: nowIso(),
  })
}

export function settleRecord(ledger, recordIdOrMatch, actualScore) {
  const normalizedLedger = normalizeLedger(ledger)
  const recordId =
    typeof recordIdOrMatch === 'string'
      ? recordIdOrMatch
      : getRecordIdV4(recordIdOrMatch)
  const record = normalizedLedger.records.find((item) => item.id === recordId)

  if (!record) {
    return {
      ledger: normalizedLedger,
      settlement: null,
      action: 'missing-record',
      duplicate: false,
    }
  }

  if (record.status === RECORD_STATUS_V4.settled) {
    return {
      ledger: normalizedLedger,
      settlement: record,
      action: 'duplicate-settlement',
      duplicate: true,
    }
  }

  const settlement = settleInternalV4Record(record, actualScore, {
    bankrollBefore: normalizedLedger.currentBankroll,
  })
  const settledRecord = {
    ...record,
    status: RECORD_STATUS_V4.settled,
    settledAt: settlement.settledAt,
    actualScore: settlement.actualScore,
    itemResults: settlement.itemResults,
    totalStake: settlement.totalStake,
    totalReturn: settlement.totalReturn,
    profit: settlement.profit,
    bankrollAfter: settlement.bankrollAfter,
  }
  const withRecord = normalizeLedger({
    ...normalizedLedger,
    currentBankroll: settlement.bankrollAfter,
    records: normalizedLedger.records.map((item) =>
      item.id === recordId ? settledRecord : item,
    ),
  })
  const withSettlement = addSettlementRecord(withRecord, settlement)

  return {
    ledger: withSettlement,
    settlement,
    record: settledRecord,
    action: 'settled',
    duplicate: false,
  }
}

export function getLedgerSummary(ledger) {
  const normalizedLedger = normalizeLedger(ledger)
  const records = normalizedLedger.records
  const settledRecords = records.filter((record) => record.status === RECORD_STATUS_V4.settled)
  const pendingRecords = records.filter((record) => record.status === RECORD_STATUS_V4.pending)
  const skippedRecords = records.filter((record) => record.status === RECORD_STATUS_V4.skipped)
  const totalProfit = roundTo(
    settledRecords.reduce((sum, record) => sum + toFiniteNumber(record.profit, 0), 0),
    2,
  )
  const totalStaked = records.reduce((sum, record) => sum + toFiniteNumber(record.totalStake, 0), 0)
  const settledStake = settledRecords.reduce(
    (sum, record) => sum + toFiniteNumber(record.totalStake, 0),
    0,
  )
  const pendingStake = pendingRecords.reduce(
    (sum, record) => sum + toFiniteNumber(record.totalStake, 0),
    0,
  )
  const winCount = settledRecords.filter((record) => toFiniteNumber(record.profit, 0) > 0).length
  const lossCount = settledRecords.filter((record) => toFiniteNumber(record.profit, 0) < 0).length
  const flatCount = settledRecords.length - winCount - lossCount
  let peak = normalizedLedger.initialBankroll
  let maxDrawdown = 0

  for (const settlement of [...normalizedLedger.settlements].reverse()) {
    const bankrollAfter = toFiniteNumber(settlement.bankrollAfter, peak)
    peak = Math.max(peak, bankrollAfter)
    maxDrawdown = Math.max(maxDrawdown, peak - bankrollAfter)
  }

  return {
    initialBankroll: normalizedLedger.initialBankroll,
    currentBankroll: normalizedLedger.currentBankroll,
    totalProfit,
    totalStaked,
    settledStake,
    pendingStake,
    recordCount: records.length,
    settledCount: settledRecords.length,
    pendingCount: pendingRecords.length,
    skippedCount: skippedRecords.length + flatCount,
    winCount,
    lossCount,
    drawdown: roundTo(maxDrawdown, 2),
    lastRecords: settledRecords
      .slice()
      .sort((a, b) => String(b.settledAt).localeCompare(String(a.settledAt)))
      .slice(0, 20),
  }
}

export function exportLedgerJson(ledger) {
  return JSON.stringify(normalizeLedger(ledger), null, 2)
}

export function importLedgerJson(jsonText) {
  const parsed = JSON.parse(jsonText)
  return saveInternalLedgerV4(normalizeLedger(parsed))
}

export function clearPendingRecords(ledger) {
  const normalizedLedger = normalizeLedger(ledger)
  return normalizeLedger({
    ...normalizedLedger,
    records: normalizedLedger.records.filter(
      (record) => record.status === RECORD_STATUS_V4.settled,
    ),
    updatedAt: nowIso(),
  })
}
