import {
  DEFAULT_INTERNAL_ODDS_V4,
  GAME_TYPE_STAKE_SPLITS_V4,
  GRADE_STAKE_CAPS_V4,
  STAKE_ITEM_KEYS_V4,
  STAKE_ITEM_LABELS_V4,
} from './internalTypesV4.js'
import { roundTo, toFiniteNumber } from './internalSelectorsV4.js'

function getBankroll(ledger) {
  const current = toFiniteNumber(ledger?.currentBankroll, NaN)
  if (Number.isFinite(current) && current > 0) return current
  const initial = toFiniteNumber(ledger?.initialBankroll, NaN)
  return Number.isFinite(initial) && initial > 0 ? initial : 10000
}

function getCapPercent(analysis) {
  const grade = analysis?.decision?.grade ?? 'D'
  let cap = GRADE_STAKE_CAPS_V4[grade] ?? 0

  if (analysis?.classification?.gameType === '信息不足局') {
    cap = Math.min(cap, 0.008)
  }

  if (
    analysis?.classification?.gameType === '方向冲突局' ||
    analysis?.decision?.poolStatus === '剔除' ||
    analysis?.decision?.mainPick === '不进主推池' ||
    analysis?.consistency?.hardConflict
  ) {
    cap = 0
  }

  return Math.min(cap, 0.05)
}

function getOdds(options = {}) {
  return {
    mainDirection: toFiniteNumber(options.mainDirectionOdds, DEFAULT_INTERNAL_ODDS_V4.mainDirection),
    primaryScore: toFiniteNumber(options.primaryScoreOdds, DEFAULT_INTERNAL_ODDS_V4.primaryScore),
    secondaryScore: toFiniteNumber(
      options.secondaryScoreOdds,
      DEFAULT_INTERNAL_ODDS_V4.secondaryScore,
    ),
    overUnder: toFiniteNumber(options.overUnderOdds, DEFAULT_INTERNAL_ODDS_V4.overUnder),
  }
}

function getSplit(analysis) {
  return (
    GAME_TYPE_STAKE_SPLITS_V4[analysis?.classification?.gameType] ??
    GAME_TYPE_STAKE_SPLITS_V4['信息不足局']
  )
}

function getItemPick(analysis, key) {
  if (key === 'mainDirection') return analysis?.decision?.mainPick ?? '不进主推池'
  if (key === 'primaryScore') return analysis?.predictions?.primaryScore ?? '跳过'
  if (key === 'secondaryScore') return analysis?.predictions?.secondaryScore ?? '跳过'
  if (key === 'overUnder') return analysis?.predictions?.overUnder ?? '2.5分界'
  return '跳过'
}

function getItemReason(analysis, key, stake) {
  if (stake <= 0) {
    if (key === 'overUnder' && analysis?.predictions?.overUnder === '2.5分界') {
      return '大小球处于2.5分界，暂停该项投入。'
    }
    if (analysis?.decision?.poolStatus === '剔除') return '剔除状态不分配模拟资金。'
    if (analysis?.consistency?.hardConflict) return '一致性检查存在硬冲突，不分配模拟资金。'
    return '当前级别不分配该项模拟资金。'
  }

  if (key === 'mainDirection') return '主方向承担主要风险敞口。'
  if (key === 'primaryScore') return '主推比分用于验证比分判断。'
  if (key === 'secondaryScore') return '备用比分用于覆盖相邻路径。'
  return '大小球用于校验进球方向。'
}

function allocateAmounts(totalStake, split, analysis) {
  const amounts = Object.fromEntries(STAKE_ITEM_KEYS_V4.map((key) => [key, 0]))
  if (totalStake <= 0) return amounts

  for (const key of STAKE_ITEM_KEYS_V4) {
    amounts[key] = Math.floor((totalStake * (split[key] ?? 0)) / 100)
  }

  if (analysis?.predictions?.overUnder === '2.5分界') {
    amounts.mainDirection += amounts.overUnder
    amounts.overUnder = 0
  }

  if (
    analysis?.predictions?.primaryScore &&
    analysis?.predictions?.primaryScore === analysis?.predictions?.secondaryScore
  ) {
    amounts.mainDirection += amounts.secondaryScore
    amounts.secondaryScore = 0
  }

  const allocated = STAKE_ITEM_KEYS_V4.reduce((sum, key) => sum + amounts[key], 0)
  amounts.mainDirection += totalStake - allocated
  return amounts
}

export function buildInternalStakePlan(v4Analysis, ledger, options = {}) {
  const bankroll = getBankroll(ledger)
  const capPercent = getCapPercent(v4Analysis)
  const maxStake = Math.floor(bankroll * capPercent)
  const split = getSplit(v4Analysis)
  const odds = getOdds(options)
  const amounts = allocateAmounts(maxStake, split, v4Analysis)
  const totalStake = STAKE_ITEM_KEYS_V4.reduce((sum, key) => sum + amounts[key], 0)
  const items = STAKE_ITEM_KEYS_V4.map((key) => {
    const stake = amounts[key]
    const itemOdds = odds[key]
    return {
      key,
      label: STAKE_ITEM_LABELS_V4[key],
      pick: getItemPick(v4Analysis, key),
      stake,
      odds: itemOdds,
      potentialProfit: roundTo(stake > 0 ? stake * (itemOdds - 1) : 0, 2),
      reason: getItemReason(v4Analysis, key, stake),
    }
  })

  return {
    version: v4Analysis?.version ?? 'internal-v4',
    matchId: v4Analysis?.match?.id ?? null,
    matchName: v4Analysis?.match?.matchName ?? v4Analysis?.match?.name ?? '',
    bankroll,
    capPercent,
    maxStake,
    totalStake,
    split,
    items,
    hardRules: {
      capUnderFivePercent: capPercent <= 0.05,
      conflictZero:
        v4Analysis?.classification?.gameType !== '方向冲突局' || totalStake === 0,
      infoUnderPointEight:
        v4Analysis?.classification?.gameType !== '信息不足局' || capPercent <= 0.008,
      excludedZero: v4Analysis?.decision?.poolStatus !== '剔除' || totalStake === 0,
      boundaryOuZero:
        v4Analysis?.predictions?.overUnder !== '2.5分界' ||
        items.find((item) => item.key === 'overUnder')?.stake === 0,
      uniqueScores:
        v4Analysis?.predictions?.primaryScore !== v4Analysis?.predictions?.secondaryScore,
      itemSumMatches: items.reduce((sum, item) => sum + item.stake, 0) === totalStake,
    },
  }
}
