export const V3_LEDGER_STORAGE_KEY = 'worldcup_v3_internal_ledger'
export const V3_INITIAL_BANKROLL = 10000

let memoryLedger = null

function nowIso() {
  return new Date().toISOString()
}

function toNumber(value, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function roundMoney(value) {
  return Math.round(toNumber(value, 0) * 100) / 100
}

function getStorage() {
  try {
    if (globalThis.localStorage) return globalThis.localStorage
  } catch {
    return null
  }

  return null
}

export function createInitialLedger() {
  return {
    initialBankroll: V3_INITIAL_BANKROLL,
    currentBankroll: V3_INITIAL_BANKROLL,
    totalProfit: 0,
    totalStaked: 0,
    settledMatches: [],
    updatedAt: nowIso(),
  }
}

export function normalizeLedger(ledger) {
  const base = createInitialLedger()
  const source = ledger && typeof ledger === 'object' ? ledger : base
  const initialBankroll = roundMoney(source.initialBankroll ?? base.initialBankroll)
  const currentBankroll = roundMoney(source.currentBankroll ?? initialBankroll)
  const settledMatches = Array.isArray(source.settledMatches)
    ? source.settledMatches.filter((record) => record && typeof record === 'object')
    : []

  return {
    initialBankroll,
    currentBankroll,
    totalProfit: roundMoney(source.totalProfit ?? currentBankroll - initialBankroll),
    totalStaked: roundMoney(source.totalStaked ?? 0),
    settledMatches,
    updatedAt: source.updatedAt || nowIso(),
  }
}

export function getLedger() {
  const storage = getStorage()

  if (storage) {
    try {
      const raw = storage.getItem(V3_LEDGER_STORAGE_KEY)
      if (!raw) return saveLedger(createInitialLedger())

      return normalizeLedger(JSON.parse(raw))
    } catch {
      return saveLedger(createInitialLedger())
    }
  }

  if (!memoryLedger) memoryLedger = createInitialLedger()
  return normalizeLedger(memoryLedger)
}

export function saveLedger(ledger) {
  const normalized = {
    ...normalizeLedger(ledger),
    updatedAt: nowIso(),
  }
  const storage = getStorage()

  if (storage) {
    try {
      storage.setItem(V3_LEDGER_STORAGE_KEY, JSON.stringify(normalized))
    } catch {
      memoryLedger = normalized
    }
  } else {
    memoryLedger = normalized
  }

  return normalized
}

export function resetLedger() {
  return saveLedger(createInitialLedger())
}

function normalizeRecord(record, ledger) {
  const profit = roundMoney(record.profit)
  const bankrollAfter = roundMoney(record.bankrollAfter ?? ledger.currentBankroll + profit)
  const totalStake = roundMoney(record.totalStake)
  const settledAt = record.settledAt || nowIso()

  return {
    id: record.id || `${record.matchId || 'match'}-${settledAt}`,
    matchId: record.matchId || '',
    matchName: record.matchName || '',
    actualScore: record.actualScore || '',
    matchResult: record.matchResult || '',
    itemResults: Array.isArray(record.itemResults) ? record.itemResults : [],
    totalStake,
    totalReturn: roundMoney(record.totalReturn),
    profit,
    bankrollAfter,
    resultType: profit > 0 ? 'win' : profit < 0 ? 'loss' : 'push',
    settledAt,
  }
}

export function addSettlementRecord(record, ledger = getLedger()) {
  const baseLedger = normalizeLedger(ledger)
  const normalizedRecord = normalizeRecord(record, baseLedger)
  const settledMatches = [...baseLedger.settledMatches, normalizedRecord]
  const nextLedger = {
    ...baseLedger,
    currentBankroll: normalizedRecord.bankrollAfter,
    totalProfit: roundMoney(normalizedRecord.bankrollAfter - baseLedger.initialBankroll),
    totalStaked: roundMoney(baseLedger.totalStaked + normalizedRecord.totalStake),
    settledMatches,
    updatedAt: nowIso(),
  }

  return saveLedger(nextLedger)
}

export function getLedgerSummary(ledger = getLedger()) {
  const normalized = normalizeLedger(ledger)
  const settledMatches = normalized.settledMatches
  const winCount = settledMatches.filter((record) => record.profit > 0).length
  const lossCount = settledMatches.filter((record) => record.profit < 0).length
  const pushCount = settledMatches.filter((record) => record.profit === 0).length
  const skippedCount = settledMatches.reduce(
    (count, record) =>
      count +
      (record.itemResults ?? []).filter((item) => item.result === 'skipped').length,
    0,
  )

  return {
    initialBankroll: normalized.initialBankroll,
    currentBankroll: normalized.currentBankroll,
    totalProfit: normalized.totalProfit,
    totalStaked: normalized.totalStaked,
    settledCount: settledMatches.length,
    winCount,
    lossCount,
    pushCount,
    skippedCount,
    lastRecords: settledMatches.slice(-10).reverse(),
  }
}
