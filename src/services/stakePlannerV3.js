export const DEFAULT_V3_BANKROLL = 10000
export const V3_MAX_SINGLE_MATCH_RATIO = 0.05

export const DEFAULT_V3_ODDS = {
  main: 1.7,
  overUnder: 1.85,
  primaryScore: 7.5,
  secondaryScore: 8.5,
}

const ZERO_SPLIT = {
  main: 0,
  primaryScore: 0,
  secondaryScore: 0,
  overUnder: 0,
}

const MATCH_TYPE_SPLITS = {
  强队稳压局: {
    main: 0.65,
    primaryScore: 0.13,
    secondaryScore: 0.09,
    overUnder: 0.13,
  },
  强队过热局: {
    main: 0.5,
    primaryScore: 0.15,
    secondaryScore: 0.15,
    overUnder: 0.2,
  },
  低比分胶着局: {
    main: 0.5,
    primaryScore: 0.16,
    secondaryScore: 0.14,
    overUnder: 0.2,
  },
  平局保护局: {
    main: 0.5,
    primaryScore: 0.2,
    secondaryScore: 0.2,
    overUnder: 0.1,
  },
  冷门波动局: {
    main: 0.45,
    primaryScore: 0.15,
    secondaryScore: 0.15,
    overUnder: 0.25,
  },
  对攻大球局: {
    main: 0.4,
    primaryScore: 0.16,
    secondaryScore: 0.14,
    overUnder: 0.3,
  },
  信息不足局: {
    main: 1,
    primaryScore: 0,
    secondaryScore: 0,
    overUnder: 0,
  },
  方向冲突局: ZERO_SPLIT,
}

function toNumber(value, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

function roundStake(value) {
  return Math.max(0, Math.round(toNumber(value, 0)))
}

function getScorePolicy(internalScore) {
  if (internalScore >= 85) {
    return { decisionLevel: '强推候选', ratio: 0.05 }
  }
  if (internalScore >= 78) {
    return { decisionLevel: '稳健候选', ratio: 0.035 }
  }
  if (internalScore >= 70) {
    return { decisionLevel: '保守候选', ratio: 0.025 }
  }
  if (internalScore >= 62) {
    return { decisionLevel: '内部观察', ratio: 0.015 }
  }
  if (internalScore >= 55) {
    return { decisionLevel: '内部观察', ratio: 0.008 }
  }
  return { decisionLevel: '不进主推池', ratio: 0 }
}

export function getV3DecisionLevel(internalScore) {
  return getScorePolicy(toNumber(internalScore, 0)).decisionLevel
}

function getSplit(matchType, overUnder) {
  const baseSplit = MATCH_TYPE_SPLITS[matchType] ?? MATCH_TYPE_SPLITS.低比分胶着局

  if (overUnder !== '2.5球分界') {
    return baseSplit
  }

  return {
    ...baseSplit,
    overUnder: 0,
  }
}

function normalizeSplit(split) {
  const sum = Object.values(split).reduce((total, value) => total + toNumber(value, 0), 0)

  if (sum <= 0) return ZERO_SPLIT

  return Object.fromEntries(
    Object.entries(split).map(([key, value]) => [key, toNumber(value, 0) / sum]),
  )
}

function reduceOverflow(stakes, overflow) {
  let remainingOverflow = overflow
  const order = ['overUnder', 'secondaryScore', 'primaryScore', 'main']

  for (const key of order) {
    if (remainingOverflow <= 0) break

    const reduction = Math.min(stakes[key], remainingOverflow)
    stakes[key] -= reduction
    remainingOverflow -= reduction
  }

  return stakes
}

function allocateStake(totalStake, split) {
  if (totalStake <= 0) {
    return { ...ZERO_SPLIT }
  }

  const normalizedSplit = normalizeSplit(split)
  const stakes = {
    primaryScore: roundStake(totalStake * normalizedSplit.primaryScore),
    secondaryScore: roundStake(totalStake * normalizedSplit.secondaryScore),
    overUnder: roundStake(totalStake * normalizedSplit.overUnder),
  }
  stakes.main = totalStake - stakes.primaryScore - stakes.secondaryScore - stakes.overUnder

  if (stakes.main < 0) {
    const overflow = Math.abs(stakes.main)
    stakes.main = 0
    reduceOverflow(stakes, overflow)
  }

  const currentTotal = stakes.main + stakes.primaryScore + stakes.secondaryScore + stakes.overUnder
  stakes.main += totalStake - currentTotal

  return {
    main: roundStake(stakes.main),
    primaryScore: roundStake(stakes.primaryScore),
    secondaryScore: roundStake(stakes.secondaryScore),
    overUnder: roundStake(stakes.overUnder),
  }
}

function buildStakeItem({
  key,
  label,
  pick,
  reason,
  settlementType,
  stake,
  odds,
}) {
  return {
    key,
    label,
    pick,
    stake: roundStake(stake),
    odds: toNumber(odds, 0),
    reason,
    settlementType,
  }
}

export function buildStakePlanV3(v3Draft = {}, options = {}) {
  const bankroll = Math.max(
    roundStake(options.bankroll ?? v3Draft.bankrollBefore ?? DEFAULT_V3_BANKROLL),
    0,
  )
  const odds = {
    ...DEFAULT_V3_ODDS,
    ...(options.oddsOverride ?? {}),
  }
  const internalScore = clamp(toNumber(v3Draft.scores?.internalScore, 0), 0, 100)
  const profile = v3Draft.profile ?? {}
  const decision = v3Draft.decision ?? {}
  const predictions = v3Draft.predictions ?? {}
  const consistency = v3Draft.consistency ?? {}
  const scorePolicy = getScorePolicy(internalScore)
  const maxSingleMatchStake = roundStake(bankroll * V3_MAX_SINGLE_MATCH_RATIO)
  let totalStake = roundStake(bankroll * scorePolicy.ratio)

  totalStake = Math.min(totalStake, maxSingleMatchStake)

  if (
    options.forceNoStake ||
    decision.mainPick === '不进主推池' ||
    scorePolicy.decisionLevel === '不进主推池' ||
    profile.matchType === '方向冲突局'
  ) {
    totalStake = 0
  }

  if (profile.matchType === '信息不足局') {
    totalStake = Math.min(totalStake, roundStake(bankroll * 0.008))
  }

  if (consistency.hasConflict) {
    totalStake = 0
  }

  const split = totalStake > 0 ? getSplit(profile.matchType, predictions.overUnder) : ZERO_SPLIT
  const allocated = allocateStake(totalStake, split)

  if (predictions.overUnder === '2.5球分界') {
    allocated.overUnder = 0
    const allocatedTotal =
      allocated.main +
      allocated.primaryScore +
      allocated.secondaryScore +
      allocated.overUnder
    allocated.main += totalStake - allocatedTotal
  }

  const stakeItems = [
    buildStakeItem({
      key: 'main',
      label: '主方向',
      pick: decision.mainPick ?? '不进主推池',
      stake: allocated.main,
      odds: odds.main,
      reason:
        totalStake > 0
          ? `${profile.matchType ?? '内部判断'}优先覆盖主方向`
          : '未进入本场主推资金池',
      settlementType: 'mainDirection',
    }),
    buildStakeItem({
      key: 'primaryScore',
      label: '主推比分',
      pick: predictions.primaryScore ?? '',
      stake: allocated.primaryScore,
      odds: odds.primaryScore,
      reason: totalStake > 0 ? '主推比分小额验证' : '本场不投入比分项',
      settlementType: 'exactScore',
    }),
    buildStakeItem({
      key: 'secondaryScore',
      label: '备用比分',
      pick: predictions.secondaryScore ?? '',
      stake: allocated.secondaryScore,
      odds: odds.secondaryScore,
      reason: totalStake > 0 ? '备用比分覆盖相邻路径' : '本场不投入比分项',
      settlementType: 'exactScore',
    }),
    buildStakeItem({
      key: 'overUnder',
      label: '大小球',
      pick: predictions.overUnder ?? '2.5球分界',
      stake: allocated.overUnder,
      odds: odds.overUnder,
      reason:
        predictions.overUnder === '2.5球分界'
          ? '分界判断，不单独投入'
          : totalStake > 0
            ? '进球方向与比分区间一致'
            : '本场不投入大小球项',
      settlementType: 'overUnder',
    }),
  ]

  const finalTotalStake = stakeItems.reduce((sum, item) => sum + item.stake, 0)

  return {
    bankrollBefore: bankroll,
    totalStake: finalTotalStake,
    maxSingleMatchStake,
    mainStake: allocated.main,
    primaryScoreStake: allocated.primaryScore,
    secondaryScoreStake: allocated.secondaryScore,
    overUnderStake: allocated.overUnder,
    stakeItems,
  }
}

export default buildStakePlanV3
