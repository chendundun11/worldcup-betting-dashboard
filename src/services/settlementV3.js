import {
  addSettlementRecord,
  getLedgerSummary,
  normalizeLedger,
} from './internalLedgerV3.js'

function toNumber(value, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function roundMoney(value) {
  return Math.round(toNumber(value, 0) * 100) / 100
}

function normalizeGoal(value) {
  return Math.max(0, Math.round(toNumber(value, 0)))
}

function normalizeActualScore(actualScore) {
  return {
    home: normalizeGoal(actualScore?.home),
    away: normalizeGoal(actualScore?.away),
  }
}

function getOutcome(actualScore) {
  if (actualScore.home > actualScore.away) return 'home'
  if (actualScore.home < actualScore.away) return 'away'
  return 'draw'
}

function parseScore(score) {
  const match = String(score ?? '').trim().match(/^(\d{1,2})-(\d{1,2})$/)
  if (!match) return { home: 0, away: 0, valid: false }

  return {
    home: normalizeGoal(match[1]),
    away: normalizeGoal(match[2]),
    valid: true,
  }
}

function evaluateMainPick(pick, actualScore) {
  if (pick === '主队胜') return actualScore.home > actualScore.away
  if (pick === '客队胜') return actualScore.away > actualScore.home
  if (pick === '平局') return actualScore.home === actualScore.away
  if (pick === '主队不败') return actualScore.home >= actualScore.away
  if (pick === '客队不败') return actualScore.away >= actualScore.home
  return false
}

function evaluateExactScore(pick, actualScore) {
  const parsed = parseScore(pick)
  return parsed.valid && parsed.home === actualScore.home && parsed.away === actualScore.away
}

function evaluateOverUnder(pick, actualScore) {
  const totalGoals = actualScore.home + actualScore.away

  if (pick === '小 2.5') return totalGoals <= 2
  if (pick === '大 2.5') return totalGoals >= 3
  return false
}

function settleItem(item, actualScore) {
  const stake = roundMoney(item?.stake)
  const odds = roundMoney(item?.odds)
  const pick = String(item?.pick ?? '')
  const settlementType = String(item?.settlementType ?? '')

  if (stake <= 0 || pick === '不进主推池' || pick === '2.5球分界') {
    return {
      key: item?.key ?? '',
      label: item?.label ?? '',
      pick,
      stake,
      odds,
      result: 'skipped',
      profit: 0,
      returnAmount: 0,
    }
  }

  let won = false

  if (settlementType === 'mainDirection') {
    won = evaluateMainPick(pick, actualScore)
  } else if (settlementType === 'exactScore') {
    won = evaluateExactScore(pick, actualScore)
  } else if (settlementType === 'overUnder') {
    won = evaluateOverUnder(pick, actualScore)
  }

  const profit = won ? roundMoney(stake * (odds - 1)) : -stake
  const returnAmount = won ? roundMoney(stake * odds) : 0

  return {
    key: item?.key ?? '',
    label: item?.label ?? '',
    pick,
    stake,
    odds,
    result: won ? 'win' : 'loss',
    profit,
    returnAmount,
  }
}

function buildMatchResult(actualScore) {
  const outcome = getOutcome(actualScore)

  return {
    home: actualScore.home,
    away: actualScore.away,
    actualScore: `${actualScore.home}-${actualScore.away}`,
    outcome,
    outcomeText:
      outcome === 'home' ? '主胜' : outcome === 'away' ? '客胜' : '平局',
    totalGoals: actualScore.home + actualScore.away,
  }
}

export function settleV3Match(v3Analysis, actualScoreInput, ledgerInput) {
  const actualScore = normalizeActualScore(actualScoreInput)
  const ledger = normalizeLedger(ledgerInput)
  const itemResults = (v3Analysis?.stakePlan?.stakeItems ?? []).map((item) =>
    settleItem(item, actualScore),
  )
  const totalStake = roundMoney(itemResults.reduce((sum, item) => sum + item.stake, 0))
  const totalReturn = roundMoney(
    itemResults.reduce((sum, item) => sum + item.returnAmount, 0),
  )
  const profit = roundMoney(itemResults.reduce((sum, item) => sum + item.profit, 0))
  const bankrollAfter = roundMoney(ledger.currentBankroll + profit)
  const matchResult = buildMatchResult(actualScore)
  const record = {
    matchId: v3Analysis?.matchInfo?.matchId ?? '',
    matchName: v3Analysis?.matchInfo?.matchName ?? '',
    actualScore: matchResult.actualScore,
    matchResult: matchResult.outcomeText,
    itemResults,
    totalStake,
    totalReturn,
    profit,
    bankrollAfter,
  }
  const nextLedger = addSettlementRecord(record, ledger)
  const winItems = itemResults.filter((item) => item.result === 'win').length
  const lossItems = itemResults.filter((item) => item.result === 'loss').length
  const skippedItems = itemResults.filter((item) => item.result === 'skipped').length

  return {
    matchResult,
    itemResults,
    totalStake,
    totalReturn,
    profit,
    bankrollAfter,
    summary: {
      resultText: profit > 0 ? '本场盈利' : profit < 0 ? '本场亏损' : '本场走平',
      winItems,
      lossItems,
      skippedItems,
      ledgerSummary: getLedgerSummary(nextLedger),
    },
    ledger: nextLedger,
  }
}

export default settleV3Match
