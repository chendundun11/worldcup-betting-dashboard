function createMemoryStorage() {
  const store = new Map()

  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null
    },
    setItem(key, value) {
      store.set(key, String(value))
    },
    removeItem(key) {
      store.delete(key)
    },
    clear() {
      store.clear()
    },
  }
}

globalThis.localStorage = createMemoryStorage()

const {
  getLedger,
  getLedgerSummary,
  resetLedger,
} = await import('../src/services/internalLedgerV3.js')
const { settleV3Match } = await import('../src/services/settlementV3.js')

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function approx(actual, expected, label) {
  assert(Math.abs(actual - expected) < 0.001, `${label}: expected ${expected}, got ${actual}`)
}

function assertNoInvalidValue(value, path = 'value') {
  assert(value !== undefined, `${path} is undefined`)
  assert(value !== null, `${path} is null`)

  if (typeof value === 'number') {
    assert(Number.isFinite(value), `${path} is not finite`)
    return
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoInvalidValue(item, `${path}[${index}]`))
    return
  }

  if (typeof value === 'object') {
    for (const [key, nextValue] of Object.entries(value)) {
      assertNoInvalidValue(nextValue, `${path}.${key}`)
    }
  }
}

function makeAnalysis({
  mainPick = '主队胜',
  primaryScore = '2-1',
  secondaryScore = '1-0',
  overUnder = '小 2.5',
  stakes = {},
  odds = {},
} = {}) {
  const stakeItems = [
    {
      key: 'main',
      label: '主方向',
      pick: mainPick,
      stake: stakes.main ?? 0,
      odds: odds.main ?? 1.7,
      reason: 'settlement test',
      settlementType: 'mainDirection',
    },
    {
      key: 'primaryScore',
      label: '主推比分',
      pick: primaryScore,
      stake: stakes.primaryScore ?? 0,
      odds: odds.primaryScore ?? 7.5,
      reason: 'settlement test',
      settlementType: 'exactScore',
    },
    {
      key: 'secondaryScore',
      label: '备用比分',
      pick: secondaryScore,
      stake: stakes.secondaryScore ?? 0,
      odds: odds.secondaryScore ?? 8.5,
      reason: 'settlement test',
      settlementType: 'exactScore',
    },
    {
      key: 'overUnder',
      label: '大小球',
      pick: overUnder,
      stake: stakes.overUnder ?? 0,
      odds: odds.overUnder ?? 1.85,
      reason: 'settlement test',
      settlementType: 'overUnder',
    },
  ]
  const totalStake = stakeItems.reduce((sum, item) => sum + item.stake, 0)

  return {
    version: 'v3-internal-1',
    matchInfo: {
      matchId: `settlement-${mainPick}-${primaryScore}-${overUnder}`,
      matchName: 'Settlement Home vs Settlement Away',
      homeTeam: 'Settlement Home',
      awayTeam: 'Settlement Away',
      kickoff: '2026-06-18T20:00:00+08:00',
    },
    decision: {
      mainPick,
    },
    predictions: {
      primaryScore,
      secondaryScore,
      overUnder,
      totalGoals: '1-2球',
    },
    stakePlan: {
      bankrollBefore: 10000,
      totalStake,
      maxSingleMatchStake: 500,
      mainStake: stakes.main ?? 0,
      primaryScoreStake: stakes.primaryScore ?? 0,
      secondaryScoreStake: stakes.secondaryScore ?? 0,
      overUnderStake: stakes.overUnder ?? 0,
      stakeItems,
    },
  }
}

function settleFresh(analysis, actualScore) {
  const ledger = resetLedger()
  return settleV3Match(analysis, actualScore, ledger)
}

function assertMainPick(mainPick, actualScore, expectedResult, label) {
  const result = settleFresh(
    makeAnalysis({
      mainPick,
      stakes: { main: 100 },
    }),
    actualScore,
  )
  const mainResult = result.itemResults.find((item) => item.key === 'main')

  assert(mainResult.result === expectedResult, `${label}: wrong main result`)
  approx(result.profit, expectedResult === 'win' ? 70 : -100, `${label}: wrong profit`)
  approx(result.bankrollAfter, 10000 + result.profit, `${label}: wrong bankrollAfter`)
  assertNoInvalidValue(result, label)
}

const initialLedger = resetLedger()
assert(initialLedger.initialBankroll === 10000, 'initial ledger must start at 10000')
assert(initialLedger.currentBankroll === 10000, 'current ledger must start at 10000')
assert(getLedger().currentBankroll === 10000, 'getLedger must read initial bankroll')

assertMainPick('主队胜', { home: 2, away: 1 }, 'win', 'home win settlement')
assertMainPick('客队胜', { home: 1, away: 2 }, 'win', 'away win settlement')
assertMainPick('平局', { home: 1, away: 1 }, 'win', 'draw settlement')
assertMainPick('主队不败', { home: 1, away: 1 }, 'win', 'home unbeaten settlement')
assertMainPick('客队不败', { home: 1, away: 1 }, 'win', 'away unbeaten settlement')

const exactWin = settleFresh(
  makeAnalysis({
    primaryScore: '2-1',
    stakes: { primaryScore: 20 },
  }),
  { home: 2, away: 1 },
)
assert(
  exactWin.itemResults.find((item) => item.key === 'primaryScore').result === 'win',
  'exact score win must settle as win',
)
approx(exactWin.profit, 130, 'exact score win profit')

const exactLoss = settleFresh(
  makeAnalysis({
    primaryScore: '2-1',
    stakes: { primaryScore: 20 },
  }),
  { home: 1, away: 1 },
)
assert(
  exactLoss.itemResults.find((item) => item.key === 'primaryScore').result === 'loss',
  'exact score loss must settle as loss',
)
approx(exactLoss.profit, -20, 'exact score loss profit')

const underWin = settleFresh(
  makeAnalysis({
    overUnder: '小 2.5',
    stakes: { overUnder: 50 },
  }),
  { home: 1, away: 1 },
)
assert(
  underWin.itemResults.find((item) => item.key === 'overUnder').result === 'win',
  'under 2.5 must win when total goals <= 2',
)
approx(underWin.profit, 42.5, 'under 2.5 profit')

const overWin = settleFresh(
  makeAnalysis({
    overUnder: '大 2.5',
    stakes: { overUnder: 50 },
  }),
  { home: 2, away: 1 },
)
assert(
  overWin.itemResults.find((item) => item.key === 'overUnder').result === 'win',
  'over 2.5 must win when total goals >= 3',
)
approx(overWin.profit, 42.5, 'over 2.5 profit')

const boundarySkipped = settleFresh(
  makeAnalysis({
    overUnder: '2.5球分界',
    stakes: { overUnder: 0 },
  }),
  { home: 2, away: 1 },
)
const boundaryItem = boundarySkipped.itemResults.find((item) => item.key === 'overUnder')
assert(boundaryItem.result === 'skipped', '2.5 boundary must be skipped')
assert(boundaryItem.stake === 0, '2.5 boundary must not invest')
approx(boundarySkipped.profit, 0, '2.5 boundary profit')

const combined = settleFresh(
  makeAnalysis({
    mainPick: '主队胜',
    primaryScore: '2-0',
    overUnder: '大 2.5',
    stakes: {
      main: 100,
      primaryScore: 20,
      overUnder: 40,
    },
  }),
  { home: 2, away: 1 },
)
approx(combined.totalStake, 160, 'combined totalStake')
approx(combined.profit, 84, 'combined profit')
approx(combined.totalReturn, 244, 'combined totalReturn')
approx(combined.bankrollAfter, 10084, 'combined bankrollAfter')

const summary = getLedgerSummary(getLedger())
assert(summary.initialBankroll === 10000, 'summary initialBankroll')
assert(summary.currentBankroll === 10084, 'summary currentBankroll')
approx(summary.totalProfit, 84, 'summary totalProfit')
assert(summary.totalStaked === 160, 'summary totalStaked')
assert(summary.settledCount === 1, 'summary settledCount')
assert(summary.winCount === 1, 'summary winCount')
assert(summary.lossCount === 0, 'summary lossCount')
assert(Array.isArray(summary.lastRecords) && summary.lastRecords.length === 1, 'summary lastRecords')

const reset = resetLedger()
assert(reset.currentBankroll === 10000, 'resetLedger currentBankroll')
assert(getLedgerSummary(reset).settledCount === 0, 'resetLedger settledCount')

assertNoInvalidValue(summary, 'summary')

console.log('V3 settlement checks passed.')
