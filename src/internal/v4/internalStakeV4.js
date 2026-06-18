import {
  GRADE_BASE_RATES_V4,
  STAKE_ITEM_KEYS_V4,
  STAKE_ITEM_LABELS_V4,
} from './internalTypesV4.js'
import { roundTo, toFiniteNumber } from './internalSelectorsV4.js'
import { applyOddsToStakeItemsV5 } from './internalOddsProviderV5.js'

function getCurrentBankroll(ledger) {
  const current = toFiniteNumber(ledger?.currentBankroll, NaN)
  if (Number.isFinite(current)) return current
  const initial = toFiniteNumber(ledger?.initialBankroll, 10000)
  const settledProfit = toFiniteNumber(ledger?.settledProfit, 0)
  return initial + settledProfit
}

function getPendingExposure(ledger) {
  return toFiniteNumber(ledger?.pendingExposure, 0)
}

function getBaseRate(grade) {
  return GRADE_BASE_RATES_V4[grade] ?? GRADE_BASE_RATES_V4.D
}

function interpolate(value, minValue, maxValue, minFactor, maxFactor) {
  if (maxValue <= minValue) return minFactor
  const ratio = Math.min(Math.max((value - minValue) / (maxValue - minValue), 0), 1)
  return minFactor + (maxFactor - minFactor) * ratio
}

function getConfidenceFactor(grade, confidence) {
  if (grade === 'A') return interpolate(confidence, 90, 100, 1, 1.15)
  if (grade === 'B+') return interpolate(confidence, 82, 89, 0.9, 1)
  if (grade === 'B') return interpolate(confidence, 74, 81, 0.75, 0.9)
  if (grade === 'C') return interpolate(confidence, 66, 73, 0.55, 0.75)
  if (grade === 'D+') return interpolate(confidence, 58, 65, 0.4, 0.55)
  return interpolate(confidence, 0, 57, 0.25, 0.4)
}

function getDrawdownFactor(currentBankroll) {
  if (currentBankroll >= 10000) return 1
  if (currentBankroll >= 9500) return 0.75
  if (currentBankroll >= 9000) return 0.5
  if (currentBankroll >= 8500) return 0.25
  return 0.15
}

function getExposureFactor(currentBankroll, pendingExposure) {
  if (currentBankroll <= 0) return 0
  const ratio = pendingExposure / currentBankroll
  if (ratio <= 0.1) return 1
  if (ratio <= 0.2) return 0.75
  if (ratio <= 0.3) return 0.5
  if (ratio <= 0.4) return 0.3
  return 0.15
}

function getConsistencyFactor(analysis) {
  return toFiniteNumber(analysis?.consistency?.consistencyFactor, 1)
}

function getTotalStake(analysis, ledger) {
  const currentBankroll = getCurrentBankroll(ledger)
  const pendingExposure = getPendingExposure(ledger)
  if (currentBankroll <= 0) {
    return {
      totalStake: 0,
      currentBankroll,
      pendingExposure,
      effectiveBankroll: 0,
      baseRate: 0,
      confidenceFactor: 0,
      drawdownFactor: 0,
      exposureFactor: 0,
      consistencyFactor: 0,
      cappedByFivePercent: true,
    }
  }

  const grade = analysis?.decision?.grade ?? 'D'
  const confidence = toFiniteNumber(analysis?.confidence?.internalConfidence, 0)
  const baseRate = getBaseRate(grade)
  const confidenceFactor = getConfidenceFactor(grade, confidence)
  const drawdownFactor = getDrawdownFactor(currentBankroll)
  const exposureFactor = getExposureFactor(currentBankroll, pendingExposure)
  const consistencyFactor = getConsistencyFactor(analysis)
  const rawEffectiveBankroll = currentBankroll - pendingExposure * 0.5
  const effectiveBankroll =
    rawEffectiveBankroll < 0 ? currentBankroll * 0.25 : rawEffectiveBankroll
  const rawStake =
    effectiveBankroll *
    baseRate *
    confidenceFactor *
    drawdownFactor *
    exposureFactor *
    consistencyFactor
  const fivePercentCap = Math.floor(currentBankroll * 0.05)
  const rounded = Math.round(rawStake)
  const withFloor = Math.max(10, rounded)
  const totalStake = Math.max(0, Math.min(withFloor, fivePercentCap))

  return {
    totalStake,
    currentBankroll,
    pendingExposure,
    effectiveBankroll: roundTo(effectiveBankroll, 2),
    baseRate,
    confidenceFactor: roundTo(confidenceFactor, 3),
    drawdownFactor,
    exposureFactor,
    consistencyFactor,
    cappedByFivePercent: totalStake === fivePercentCap && withFloor > fivePercentCap,
  }
}

function getDominantConfidence(analysis) {
  const values = {
    direction: toFiniteNumber(analysis?.confidence?.directionConfidence, 0),
    score: toFiniteNumber(analysis?.confidence?.scoreConfidence, 0),
    overUnder: toFiniteNumber(analysis?.confidence?.overUnderConfidence, 0),
  }
  const sorted = Object.entries(values).sort((a, b) => b[1] - a[1])
  if ((sorted[0]?.[1] ?? 0) - (sorted[2]?.[1] ?? 0) <= 6) return 'balanced'
  return sorted[0]?.[0] ?? 'balanced'
}

function getDynamicSplit(analysis) {
  const dominant = getDominantConfidence(analysis)
  if (dominant === 'direction') {
    return { mainDirection: 70, primaryScore: 12, secondaryScore: 8, overUnder: 10 }
  }
  if (dominant === 'score') {
    return { mainDirection: 50, primaryScore: 23, secondaryScore: 17, overUnder: 10 }
  }
  if (dominant === 'overUnder') {
    return { mainDirection: 45, primaryScore: 10, secondaryScore: 10, overUnder: 35 }
  }
  return { mainDirection: 55, primaryScore: 15, secondaryScore: 10, overUnder: 20 }
}

function clampBoundaryOverUnder(amounts, totalStake, analysis) {
  if (analysis?.predictions?.overUnder !== '2.5球分界') return amounts
  const maxOverUnder = Math.floor(totalStake * 0.05)
  if (amounts.overUnder <= maxOverUnder) return amounts
  const overflow = amounts.overUnder - maxOverUnder
  return {
    ...amounts,
    overUnder: maxOverUnder,
    mainDirection: amounts.mainDirection + overflow,
  }
}

function allocateAmounts(totalStake, analysis) {
  const split = getDynamicSplit(analysis)
  const amounts = Object.fromEntries(STAKE_ITEM_KEYS_V4.map((key) => [key, 0]))
  if (totalStake <= 0) return { amounts, split }

  for (const key of STAKE_ITEM_KEYS_V4) {
    amounts[key] = Math.round((totalStake * (split[key] ?? 0)) / 100)
  }

  const withBoundary = clampBoundaryOverUnder(amounts, totalStake, analysis)

  if (totalStake >= 4 && analysis?.predictions?.overUnder !== '2.5球分界') {
    for (const key of STAKE_ITEM_KEYS_V4) {
      if (withBoundary[key] <= 0) withBoundary[key] = 1
    }
  }

  const allocated = STAKE_ITEM_KEYS_V4.reduce((sum, key) => sum + withBoundary[key], 0)
  withBoundary.mainDirection += totalStake - allocated

  if (withBoundary.mainDirection < 0) {
    let deficit = Math.abs(withBoundary.mainDirection)
    withBoundary.mainDirection = 0
    for (const key of ['overUnder', 'secondaryScore', 'primaryScore']) {
      const removable = Math.min(deficit, Math.max(0, withBoundary[key] - 1))
      withBoundary[key] -= removable
      deficit -= removable
      if (deficit <= 0) break
    }
  }

  return { amounts: withBoundary, split }
}

function getItemPick(analysis, key) {
  if (key === 'mainDirection') return analysis?.decision?.mainPick ?? '平局'
  if (key === 'primaryScore') return analysis?.predictions?.primaryScore ?? '1-1'
  if (key === 'secondaryScore') return analysis?.predictions?.secondaryScore ?? '0-0'
  if (key === 'overUnder') return analysis?.predictions?.overUnder ?? '2.5球分界'
  return '-'
}

function getConfidenceUsed(analysis, key) {
  if (key === 'mainDirection') return analysis?.confidence?.directionConfidence ?? 0
  if (key === 'primaryScore' || key === 'secondaryScore') {
    return analysis?.confidence?.scoreConfidence ?? 0
  }
  return analysis?.confidence?.overUnderConfidence ?? 0
}

function getItemReason(analysis, key, amount) {
  const confidence = getConfidenceUsed(analysis, key)
  if (key === 'mainDirection') {
    return `方向信心 ${confidence}，${analysis?.decision?.fundingTier ?? 'D'}档主仓。`
  }
  if (key === 'primaryScore') {
    return `比分信心 ${confidence}，覆盖候选比分路径。`
  }
  if (key === 'secondaryScore') {
    return `比分信心 ${confidence}，覆盖保护比分路径。`
  }
  if (analysis?.predictions?.overUnder === '2.5球分界') {
    return `大小球分界，仅保留不超过 5% 的观察金额；本项 ${amount}。`
  }
  return `大小球信心 ${confidence}，按动态比例分配。`
}

function buildFormulaExplanation(analysis, formula, totalStake) {
  const grade = analysis?.decision?.grade ?? 'D'
  const baseRateText = `${roundTo(formula.baseRate * 100, 1)}%`
  const exposureLabel = formula.exposureFactor < 1 ? '暴露压缩' : '暴露'
  const compressionNote =
    formula.exposureFactor < 1
      ? '未结算暴露较高，后续投入已压缩。'
      : ''

  return {
    grade,
    baseRateText,
    confidenceFactor: formula.confidenceFactor,
    drawdownFactor: formula.drawdownFactor,
    exposureFactor: formula.exposureFactor,
    consistencyFactor: formula.consistencyFactor,
    totalStake,
    summary: `${grade}档基础 ${baseRateText} × 信心 ${formula.confidenceFactor} × 回撤 ${formula.drawdownFactor} × ${exposureLabel} ${formula.exposureFactor} × 一致性 ${formula.consistencyFactor} = 本场投入 ${totalStake}`,
    compressionNote,
  }
}

export function buildInternalStakePlan(v4Analysis, ledger, options = {}) {
  const formula = getTotalStake(v4Analysis, ledger)
  const { amounts, split } = allocateAmounts(formula.totalStake, v4Analysis)
  const totalStake = STAKE_ITEM_KEYS_V4.reduce((sum, key) => sum + amounts[key], 0)
  const formulaExplanation = buildFormulaExplanation(v4Analysis, formula, totalStake)
  const baseItems = STAKE_ITEM_KEYS_V4.map((key) => {
    const stake = amounts[key]
    const isBoundaryOverUnder = key === 'overUnder' && getItemPick(v4Analysis, key) === '2.5球分界'
    return {
      key,
      label: STAKE_ITEM_LABELS_V4[key],
      pick: getItemPick(v4Analysis, key),
      stake,
      odds: 1,
      potentialProfit: 0,
      reason: getItemReason(v4Analysis, key, stake),
      confidenceUsed: Math.round(getConfidenceUsed(v4Analysis, key)),
      status: isBoundaryOverUnder ? 'observation' : 'pending',
    }
  })
  const items = applyOddsToStakeItemsV5(
    options.match ?? v4Analysis?.match ?? {},
    baseItems,
    options.oddsOverrides ?? {},
  )

  return {
    version: v4Analysis?.version ?? 'internal-v5',
    matchId: v4Analysis?.match?.id ?? null,
    matchName: v4Analysis?.match?.matchName ?? v4Analysis?.match?.name ?? '',
    bankroll: formula.currentBankroll,
    currentBankroll: formula.currentBankroll,
    pendingExposureBefore: formula.pendingExposure,
    effectiveBankroll: formula.effectiveBankroll,
    baseRate: formula.baseRate,
    confidenceFactor: formula.confidenceFactor,
    drawdownFactor: formula.drawdownFactor,
    exposureFactor: formula.exposureFactor,
    consistencyFactor: formula.consistencyFactor,
    totalStake,
    maxStake: Math.floor(formula.currentBankroll * 0.05),
    split,
    dominantConfidence: getDominantConfidence(v4Analysis),
    items,
    formulaExplanation,
    formula,
    hardRules: {
      everyMatchHasAmount: formula.currentBankroll <= 0 ? totalStake === 0 : totalStake > 0,
      capUnderFivePercent: totalStake <= Math.floor(formula.currentBankroll * 0.05),
      boundaryOuUnderFivePercent:
        v4Analysis?.predictions?.overUnder !== '2.5球分界' ||
        (items.find((item) => item.key === 'overUnder')?.stake ?? 0) <=
          Math.floor(totalStake * 0.05),
      uniqueScores:
        v4Analysis?.predictions?.primaryScore !== v4Analysis?.predictions?.secondaryScore,
      itemSumMatches: items.reduce((sum, item) => sum + item.stake, 0) === totalStake,
    },
  }
}
