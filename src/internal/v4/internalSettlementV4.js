import { STAKE_ITEM_KEYS_V4, STAKE_ITEM_LABELS_V4 } from './internalTypesV4.js'
import { getScoreTextV4, roundTo, toFiniteNumber } from './internalSelectorsV4.js'

function normalizeActualScore(actualScore) {
  const home = Number(actualScore?.home)
  const away = Number(actualScore?.away)
  if (!Number.isInteger(home) || !Number.isInteger(away) || home < 0 || away < 0) {
    throw new Error('Invalid actual score for V4 settlement')
  }
  return { home, away }
}

function getOutcome(score) {
  if (score.home > score.away) return 'home'
  if (score.away > score.home) return 'away'
  return 'draw'
}

function evaluateMainPick(mainPick, score) {
  const outcome = getOutcome(score)
  if (mainPick === '主队胜') return outcome === 'home'
  if (mainPick === '客队胜') return outcome === 'away'
  if (mainPick === '平局') return outcome === 'draw'
  if (mainPick === '主队不败') return outcome === 'home' || outcome === 'draw'
  if (mainPick === '客队不败') return outcome === 'away' || outcome === 'draw'
  return null
}

function evaluateScorePick(scorePick, score) {
  if (!scorePick || scorePick === '跳过') return null
  return scorePick === getScoreTextV4(score)
}

function evaluateOverUnderPick(overUnderPick, score) {
  const totalGoals = score.home + score.away
  if (overUnderPick === '大2.5') return totalGoals > 2.5
  if (overUnderPick === '小2.5') return totalGoals < 2.5
  return null
}

function evaluateItem(item, actualScore) {
  if (!item || item.stake <= 0) {
    return {
      key: item?.key ?? 'unknown',
      label: item?.label ?? '未分配',
      pick: item?.pick ?? '跳过',
      stake: 0,
      odds: toFiniteNumber(item?.odds, 0),
      result: 'skipped',
      profit: 0,
      totalReturn: 0,
    }
  }

  let hit = null
  if (item.key === 'mainDirection') hit = evaluateMainPick(item.pick, actualScore)
  if (item.key === 'primaryScore' || item.key === 'secondaryScore') {
    hit = evaluateScorePick(item.pick, actualScore)
  }
  if (item.key === 'overUnder') hit = evaluateOverUnderPick(item.pick, actualScore)

  if (hit === null) {
    return {
      key: item.key,
      label: item.label,
      pick: item.pick,
      stake: item.stake,
      odds: item.odds,
      result: 'skipped',
      profit: 0,
      totalReturn: 0,
    }
  }

  const totalReturn = hit ? roundTo(item.stake * item.odds, 2) : 0
  const profit = hit ? roundTo(item.stake * (item.odds - 1), 2) : -item.stake

  return {
    key: item.key,
    label: item.label,
    pick: item.pick,
    stake: item.stake,
    odds: item.odds,
    result: hit ? 'win' : 'loss',
    profit,
    totalReturn,
  }
}

export function settleInternalV4Record(record, actualScore, options = {}) {
  const score = normalizeActualScore(actualScore)
  const itemsByKey = new Map(
    (record?.stakePlanSnapshot?.items ?? []).map((item) => [item.key, item]),
  )
  const itemResults = STAKE_ITEM_KEYS_V4.map((key) =>
    evaluateItem(
      itemsByKey.get(key) ?? {
        key,
        label: STAKE_ITEM_LABELS_V4[key],
        stake: 0,
        pick: '跳过',
        odds: 0,
      },
      score,
    ),
  )
  const totalStake = itemResults.reduce((sum, item) => sum + item.stake, 0)
  const totalReturn = roundTo(itemResults.reduce((sum, item) => sum + item.totalReturn, 0), 2)
  const profit = roundTo(itemResults.reduce((sum, item) => sum + item.profit, 0), 2)
  const bankrollBefore = toFiniteNumber(
    options.bankrollBefore ?? record?.bankrollBefore ?? record?.bankrollAfter,
    0,
  )
  const bankrollAfter = roundTo(bankrollBefore + profit, 2)

  return {
    recordId: record?.id,
    matchId: record?.matchId,
    matchName: record?.matchName,
    actualScore: score,
    actualScoreText: getScoreTextV4(score),
    itemResults,
    totalStake,
    totalReturn,
    profit,
    bankrollBefore,
    bankrollAfter,
    settledAt: options.settledAt ?? new Date().toISOString(),
  }
}
