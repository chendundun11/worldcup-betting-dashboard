import {
  INTERNAL_V4_INITIAL_BANKROLL,
  INTERNAL_V4_LEDGER_KEY,
  INTERNAL_V4_LEDGER_VERSION,
  LEGACY_INTERNAL_V4_LEDGER_KEY,
  RECORD_STATUS_V4,
} from './internalTypesV4.js'
import {
  getMatchIdV4,
  getMatchNameV4,
  getRecordIdV4,
  getRecordLifecycleStatusV4,
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

function isSettledStatus(status) {
  return status === RECORD_STATUS_V4.settledAuto || status === RECORD_STATUS_V4.settledManual
}

export function getInternalRecordMatchKeyV4(record) {
  const rawKey =
    record?.matchId ??
    record?.analysisSnapshot?.match?.id ??
    record?.stakePlanSnapshot?.matchId ??
    record?.id
  return String(rawKey ?? '').replace(/^v5-/, '')
}

function getRecordSortTime(record) {
  const time = Date.parse(record?.settledAt ?? record?.plannedAt ?? record?.updatedAt ?? '')
  return Number.isFinite(time) ? time : 0
}

function chooseRecordForMatch(existingRecord, nextRecord) {
  if (!existingRecord) return nextRecord

  const existingSettled = isSettledStatus(existingRecord.status)
  const nextSettled = isSettledStatus(nextRecord.status)
  if (nextSettled && !existingSettled) return nextRecord
  if (existingSettled && !nextSettled) return existingRecord

  return getRecordSortTime(nextRecord) >= getRecordSortTime(existingRecord)
    ? nextRecord
    : existingRecord
}

function dedupeRecordsByMatch(records) {
  const recordsByMatch = new Map()

  for (const record of records) {
    const matchKey = getInternalRecordMatchKeyV4(record)
    if (!matchKey) continue
    recordsByMatch.set(matchKey, chooseRecordForMatch(recordsByMatch.get(matchKey), record))
  }

  return Array.from(recordsByMatch.values())
}

function sortBySettledAt(records) {
  return records
    .slice()
    .sort((a, b) => String(a.settledAt ?? '').localeCompare(String(b.settledAt ?? '')))
}

function calculateMaxDrawdown(initialBankroll, settledRecords) {
  let peak = initialBankroll
  let maxDrawdown = 0

  for (const record of sortBySettledAt(settledRecords)) {
    const bankrollAfter = toFiniteNumber(record.bankrollAfter, peak)
    peak = Math.max(peak, bankrollAfter)
    maxDrawdown = Math.max(maxDrawdown, peak - bankrollAfter)
  }

  return roundTo(maxDrawdown, 2)
}

function normalizeRecord(record) {
  return {
    ...record,
    totalStake: toFiniteNumber(record?.totalStake, 0),
    totalReturn: toFiniteNumber(record?.totalReturn, 0),
    profit: toFiniteNumber(record?.profit, 0),
  }
}

function normalizeLedger(raw) {
  const initialBankroll = toFiniteNumber(raw?.initialBankroll, INTERNAL_V4_INITIAL_BANKROLL)
  const records = Array.isArray(raw?.records)
    ? dedupeRecordsByMatch(raw.records.map(normalizeRecord))
    : []
  const settledRecords = records.filter((record) => isSettledStatus(record.status))
  const unsettledRecords = records.filter((record) => !isSettledStatus(record.status))
  const settledProfit = roundTo(
    settledRecords.reduce((sum, record) => sum + toFiniteNumber(record.profit, 0), 0),
    2,
  )
  const currentBankroll = roundTo(initialBankroll + settledProfit, 2)
  const pendingExposure = roundTo(
    unsettledRecords.reduce((sum, record) => sum + toFiniteNumber(record.totalStake, 0), 0),
    2,
  )
  const availableBankroll = roundTo(currentBankroll - pendingExposure, 2)
  const totalPlannedStake = roundTo(
    records.reduce((sum, record) => sum + toFiniteNumber(record.totalStake, 0), 0),
    2,
  )
  const totalSettledStake = roundTo(
    settledRecords.reduce((sum, record) => sum + toFiniteNumber(record.totalStake, 0), 0),
    2,
  )
  const totalReturned = roundTo(
    settledRecords.reduce((sum, record) => sum + toFiniteNumber(record.totalReturn, 0), 0),
    2,
  )

  return {
    version: INTERNAL_V4_LEDGER_VERSION,
    initialBankroll,
    currentBankroll,
    settledProfit,
    pendingExposure,
    availableBankroll,
    totalPlannedStake,
    totalSettledStake,
    totalReturned,
    maxDrawdown: calculateMaxDrawdown(initialBankroll, settledRecords),
    plannedCount: records.length,
    pendingCount: unsettledRecords.filter(
      (record) =>
        record.status === RECORD_STATUS_V4.pendingSettlement ||
        record.status === RECORD_STATUS_V4.liveOrUnknown,
    ).length,
    upcomingCount: unsettledRecords.filter((record) => record.status === RECORD_STATUS_V4.upcoming)
      .length,
    settledCount: settledRecords.length,
    manualSettledCount: settledRecords.filter(
      (record) => record.settlementSource === 'manual',
    ).length,
    autoSettledCount: settledRecords.filter((record) => record.settlementSource === 'auto').length,
    winCount: settledRecords.filter((record) => toFiniteNumber(record.profit, 0) > 0).length,
    lossCount: settledRecords.filter((record) => toFiniteNumber(record.profit, 0) < 0).length,
    records,
    updatedAt: raw?.updatedAt ?? nowIso(),
  }
}

export function createDefaultLedger() {
  return normalizeLedger({
    version: INTERNAL_V4_LEDGER_VERSION,
    initialBankroll: INTERNAL_V4_INITIAL_BANKROLL,
    records: [],
    updatedAt: nowIso(),
  })
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

export function getLegacyInternalV4Ledger() {
  if (!hasStorage()) return null
  try {
    const raw = window.localStorage.getItem(LEGACY_INTERNAL_V4_LEDGER_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function clearLegacyInternalV4Ledger() {
  if (hasStorage()) {
    window.localStorage.removeItem(LEGACY_INTERNAL_V4_LEDGER_KEY)
  }
}

function createPlannedRecord(match, analysis, stakePlan, existingRecord = null, now = new Date()) {
  return {
    id: getRecordIdV4(match),
    matchId: getMatchIdV4(match),
    matchName: getMatchNameV4(match),
    homeTeam: getTeamNameV4(match, 'home'),
    awayTeam: getTeamNameV4(match, 'away'),
    kickoff: match?.kickoff ?? analysis?.match?.kickoff ?? '',
    plannedAt: existingRecord?.plannedAt ?? nowIso(),
    settledAt: existingRecord?.settledAt ?? null,
    status: getRecordLifecycleStatusV4(match, existingRecord, now),
    analysisSnapshot: analysis,
    stakePlanSnapshot: stakePlan,
    actualScore: existingRecord?.actualScore ?? null,
    actualScoreSource: existingRecord?.actualScoreSource ?? null,
    settlementSource: existingRecord?.settlementSource ?? null,
    itemResults: existingRecord?.itemResults ?? [],
    totalStake: toFiniteNumber(stakePlan?.totalStake, 0),
    totalReturn: existingRecord?.totalReturn ?? 0,
    profit: existingRecord?.profit ?? 0,
    bankrollBefore: existingRecord?.bankrollBefore ?? null,
    bankrollAfter: existingRecord?.bankrollAfter ?? null,
  }
}

export function upsertPlannedRecord(ledger, match, analysis, stakePlan, options = {}) {
  const normalizedLedger = normalizeLedger(ledger)
  const recordId = getRecordIdV4(match)
  const existingIndex = normalizedLedger.records.findIndex((record) => record.id === recordId)
  const existingRecord = existingIndex >= 0 ? normalizedLedger.records[existingIndex] : null

  if (existingRecord && isSettledStatus(existingRecord.status)) {
    return {
      ledger: normalizedLedger,
      record: existingRecord,
      action: 'kept-settled',
    }
  }

  const nextRecord = createPlannedRecord(
    match,
    analysis,
    stakePlan,
    existingRecord,
    options.now ?? new Date(),
  )
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

export function addSettlementRecord(ledger, settledRecord) {
  const normalizedLedger = normalizeLedger(ledger)
  const records = normalizedLedger.records.some((record) => record.id === settledRecord.id)
    ? normalizedLedger.records.map((record) =>
        record.id === settledRecord.id ? settledRecord : record,
      )
    : [settledRecord, ...normalizedLedger.records]

  return normalizeLedger({
    ...normalizedLedger,
    records,
    updatedAt: nowIso(),
  })
}

export function settleRecord(ledger, recordIdOrMatch, actualScore, options = {}) {
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

  if (isSettledStatus(record.status)) {
    return {
      ledger: normalizedLedger,
      settlement: record,
      record,
      action: 'duplicate-settlement',
      duplicate: true,
    }
  }

  const settlementSource = options.settlementSource === 'auto' ? 'auto' : 'manual'
  const settlement = settleInternalV4Record(record, actualScore, {
    bankrollBefore: normalizedLedger.currentBankroll,
    settlementSource,
    actualScoreSource: options.actualScoreSource ?? settlementSource,
  })
  const settledRecord = {
    ...record,
    status:
      settlementSource === 'auto'
        ? RECORD_STATUS_V4.settledAuto
        : RECORD_STATUS_V4.settledManual,
    settledAt: settlement.settledAt,
    actualScore: settlement.actualScore,
    actualScoreSource: settlement.actualScoreSource,
    settlementSource,
    itemResults: settlement.itemResults,
    totalStake: settlement.totalStake,
    totalReturn: settlement.totalReturn,
    profit: settlement.profit,
    bankrollBefore: settlement.bankrollBefore,
    bankrollAfter: settlement.bankrollAfter,
  }
  const nextLedger = addSettlementRecord(normalizedLedger, settledRecord)

  return {
    ledger: nextLedger,
    settlement,
    record: settledRecord,
    action: settlementSource === 'auto' ? 'settled-auto' : 'settled-manual',
    duplicate: false,
  }
}

export function getLedgerSummary(ledger) {
  const normalizedLedger = normalizeLedger(ledger)
  const settledRecords = normalizedLedger.records.filter((record) => isSettledStatus(record.status))
  const pendingRecords = normalizedLedger.records.filter((record) => !isSettledStatus(record.status))

  return {
    ...normalizedLedger,
    recordCount: normalizedLedger.records.length,
    settledStake: normalizedLedger.totalSettledStake,
    pendingStake: normalizedLedger.pendingExposure,
    totalProfit: normalizedLedger.settledProfit,
    totalStaked: normalizedLedger.totalPlannedStake,
    drawdown: normalizedLedger.maxDrawdown,
    pendingRecords,
    settledRecords,
    lastRecords: settledRecords
      .slice()
      .sort((a, b) => String(b.settledAt).localeCompare(String(a.settledAt)))
      .slice(0, 20),
  }
}

export function getLedgerSummaryForMatches(ledger, matches = []) {
  const normalizedLedger = normalizeLedger(ledger)
  const matchKeys = new Set(matches.map((match) => getMatchIdV4(match)))
  const totalMatches = matchKeys.size
  const scopedRecords = totalMatches
    ? normalizedLedger.records.filter((record) =>
        matchKeys.has(getInternalRecordMatchKeyV4(record)),
      )
    : normalizedLedger.records
  const dedupedRecords = dedupeRecordsByMatch(scopedRecords)
  const settledRecords = dedupedRecords.filter((record) => isSettledStatus(record.status))
  const pendingRecords = dedupedRecords.filter((record) => !isSettledStatus(record.status))
  const settledProfit = roundTo(
    settledRecords.reduce((sum, record) => sum + toFiniteNumber(record.profit, 0), 0),
    2,
  )
  const currentBankroll = roundTo(normalizedLedger.initialBankroll + settledProfit, 2)
  const pendingExposure = roundTo(
    pendingRecords.reduce((sum, record) => sum + toFiniteNumber(record.totalStake, 0), 0),
    2,
  )
  const totalPlannedStake = roundTo(
    dedupedRecords.reduce((sum, record) => sum + toFiniteNumber(record.totalStake, 0), 0),
    2,
  )
  const pendingCount = pendingRecords.filter(
    (record) =>
      record.status === RECORD_STATUS_V4.pendingSettlement ||
      record.status === RECORD_STATUS_V4.liveOrUnknown,
  ).length
  const upcomingCount = pendingRecords.filter(
    (record) => record.status === RECORD_STATUS_V4.upcoming,
  ).length
  const scopedTotal = totalMatches || dedupedRecords.length

  return {
    ...normalizedLedger,
    currentBankroll,
    settledProfit,
    pendingExposure,
    availableBankroll: roundTo(currentBankroll - pendingExposure, 2),
    totalPlannedStake,
    totalSettledStake: roundTo(
      settledRecords.reduce((sum, record) => sum + toFiniteNumber(record.totalStake, 0), 0),
      2,
    ),
    totalReturned: roundTo(
      settledRecords.reduce((sum, record) => sum + toFiniteNumber(record.totalReturn, 0), 0),
      2,
    ),
    maxDrawdown: calculateMaxDrawdown(normalizedLedger.initialBankroll, settledRecords),
    totalMatches: scopedTotal,
    plannedCount: Math.min(dedupedRecords.length, scopedTotal),
    pendingCount: Math.min(pendingCount, scopedTotal),
    upcomingCount: Math.min(upcomingCount, scopedTotal),
    settledCount: Math.min(settledRecords.length, scopedTotal),
    manualSettledCount: Math.min(
      settledRecords.filter((record) => record.settlementSource === 'manual').length,
      settledRecords.length,
    ),
    autoSettledCount: Math.min(
      settledRecords.filter((record) => record.settlementSource === 'auto').length,
      settledRecords.length,
    ),
    winCount: settledRecords.filter((record) => toFiniteNumber(record.profit, 0) > 0).length,
    lossCount: settledRecords.filter((record) => toFiniteNumber(record.profit, 0) < 0).length,
    records: dedupedRecords,
    recordCount: dedupedRecords.length,
    settledStake: roundTo(
      settledRecords.reduce((sum, record) => sum + toFiniteNumber(record.totalStake, 0), 0),
      2,
    ),
    pendingStake: pendingExposure,
    totalProfit: settledProfit,
    totalStaked: totalPlannedStake,
    drawdown: calculateMaxDrawdown(normalizedLedger.initialBankroll, settledRecords),
    pendingRecords,
    settledRecords,
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
    records: normalizedLedger.records.filter((record) => isSettledStatus(record.status)),
    updatedAt: nowIso(),
  })
}
