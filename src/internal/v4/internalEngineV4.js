import {
  GAME_TYPES_V4,
  GRADES_V4,
  INTERNAL_V4_VERSION,
  MAIN_PICKS_V4,
  OVER_UNDER_PICKS_V4,
  POOL_STATUS_V4,
} from './internalTypesV4.js'
import { evaluateInternalRulesV4 } from './internalRulesV4.js'
import {
  clampNumber,
  getMatchNameV4,
  getRecordIdV4,
  getScoreOutcomeV4,
  getScoreTotalGoalsV4,
  mapOutcomeToMainPickV4,
  normalizeMatchForV4,
  roundTo,
} from './internalSelectorsV4.js'

function effectWeight(triggered, effect) {
  return triggered
    .filter((rule) => rule.effect === effect)
    .reduce((sum, rule) => sum + rule.weight, 0)
}

function hasEffect(triggered, effect) {
  return triggered.some((rule) => rule.effect === effect)
}

function getGrade(score, hardRejected) {
  if (hardRejected) return 'D'
  if (score >= 82) return 'A'
  if (score >= 72) return 'B+'
  if (score >= 62) return 'B'
  if (score >= 48) return 'C'
  return 'D'
}

function getExecutionLevel(grade) {
  if (grade === 'A') return '强推候选'
  if (grade === 'B+') return '稳健候选'
  if (grade === 'B') return '保守候选'
  if (grade === 'C') return '内部观察'
  return '不进主推池'
}

function getPoolStatus(grade, triggered) {
  if (grade === 'D' || hasEffect(triggered, 'poolReject') || hasEffect(triggered, 'hardConflict')) {
    return '剔除'
  }
  if (grade === 'A' || grade === 'B+') return '主推池'
  if (grade === 'B') return '候选池'
  return '观察池'
}

function getGameType(facts, triggered) {
  if (hasEffect(triggered, 'hardConflict')) return '方向冲突局'
  if (hasEffect(triggered, 'infoReject') || (!facts.hasOdds && facts.leaderEdge < 0.08)) {
    return '信息不足局'
  }
  if (hasEffect(triggered, 'volatility') && facts.marketFavorite !== 'draw') {
    if (facts.odds[facts.marketFavorite] <= 1.62) return '强队过热局'
    if (facts.contextRisk >= 65) return '冷门波动局'
  }
  if (hasEffect(triggered, 'over') && facts.attackTempo >= 58) return '对攻大球局'
  if (hasEffect(triggered, 'draw') && facts.absoluteStrengthGap <= 9) return '平局保护局'
  if (hasEffect(triggered, 'tempoLow') || hasEffect(triggered, 'under')) return '低比分胶着局'
  if (facts.favoriteProbability >= 0.48 && facts.absoluteStrengthGap >= 10) {
    return '强队压制局'
  }
  if (facts.contextRisk >= 58) return '冷门波动局'
  return '平局保护局'
}

function getMainPick(facts, gameType, grade) {
  if (grade === 'D' || gameType === '方向冲突局') return '不进主推池'
  if (gameType === '信息不足局' && facts.leaderEdge < 0.06) return '不进主推池'
  if (gameType === '平局保护局' && facts.model.draw >= 0.29) return '平局'

  if (facts.modelLeader === 'home') {
    return facts.model.home >= 0.48 && facts.leaderEdge >= 0.07 ? '主队胜' : '主队不败'
  }

  if (facts.modelLeader === 'away') {
    return facts.model.away >= 0.48 && facts.leaderEdge >= 0.07 ? '客队胜' : '客队不败'
  }

  return '平局'
}

function getOverUnderPick(facts, gameType) {
  if (Math.abs(facts.overUnderEdge) < 0.04) return '2.5分界'
  if (facts.overUnderEdge > 0) return '大2.5'
  if (facts.overUnderEdge < 0) return '小2.5'
  if (gameType === '对攻大球局') return '大2.5'
  return '小2.5'
}

function uniqueScorePair(primary, secondary) {
  if (primary !== secondary) return { primary, secondary }
  const [home, away] = primary.split('-').map((part) => Number(part))
  if (home === away) return { primary, secondary: `${home + 1}-${away + 1}` }
  if (home > away) return { primary, secondary: `${home}-${Math.max(0, away + 1)}` }
  return { primary, secondary: `${Math.max(0, home + 1)}-${away}` }
}

function getScorePair(mainPick, gameType, overUnderPick) {
  if (gameType === '方向冲突局' || mainPick === '不进主推池') {
    return { primaryScore: '0-0', secondaryScore: '1-1' }
  }

  if (mainPick === '平局') {
    if (overUnderPick === '大2.5' || gameType === '对攻大球局') {
      return { primaryScore: '2-2', secondaryScore: '1-1' }
    }
    return { primaryScore: '1-1', secondaryScore: '0-0' }
  }

  const homeSide = mainPick === '主队胜' || mainPick === '主队不败'
  const awaySide = mainPick === '客队胜' || mainPick === '客队不败'
  const openGame = overUnderPick === '大2.5' || gameType === '对攻大球局'
  const lowGame = gameType === '低比分胶着局' || overUnderPick === '小2.5'

  if (homeSide) {
    if (openGame) return { primaryScore: '2-1', secondaryScore: '3-1' }
    if (lowGame) return { primaryScore: '1-0', secondaryScore: '1-1' }
    return { primaryScore: '2-0', secondaryScore: '2-1' }
  }

  if (awaySide) {
    if (openGame) return { primaryScore: '1-2', secondaryScore: '1-3' }
    if (lowGame) return { primaryScore: '0-1', secondaryScore: '1-1' }
    return { primaryScore: '0-2', secondaryScore: '1-2' }
  }

  return { primaryScore: '1-1', secondaryScore: '0-0' }
}

function scoreMatchesMainPick(scoreText, mainPick) {
  const outcome = getScoreOutcomeV4(scoreText)
  if (mainPick === '主队胜') return outcome === 'home'
  if (mainPick === '客队胜') return outcome === 'away'
  if (mainPick === '平局') return outcome === 'draw'
  if (mainPick === '主队不败') return outcome === 'home' || outcome === 'draw'
  if (mainPick === '客队不败') return outcome === 'away' || outcome === 'draw'
  return false
}

function scoreMatchesOverUnder(scoreText, overUnderPick) {
  const total = getScoreTotalGoalsV4(scoreText)
  if (overUnderPick === '大2.5') return total > 2.5
  if (overUnderPick === '小2.5') return total < 2.5
  return true
}

function buildConsistency(mainPick, predictions, triggered) {
  const directionAligned = scoreMatchesMainPick(predictions.primaryScore, mainPick)
  const backupDirectionAligned = scoreMatchesMainPick(predictions.secondaryScore, mainPick)
  const overUnderAligned = scoreMatchesOverUnder(
    predictions.primaryScore,
    predictions.overUnder,
  )
  const hardConflict = hasEffect(triggered, 'hardConflict') || !directionAligned
  const checks = [
    {
      id: 'direction-primary-score',
      label: '主方向与主推比分一致',
      passed: directionAligned,
    },
    {
      id: 'direction-secondary-score',
      label: '主方向与备用比分一致',
      passed: backupDirectionAligned,
    },
    {
      id: 'ou-primary-score',
      label: '大小球与主推比分一致',
      passed: overUnderAligned,
    },
    {
      id: 'hard-conflict',
      label: '未触发方向强冲突',
      passed: !hasEffect(triggered, 'hardConflict'),
    },
  ]

  return {
    directionAligned,
    backupDirectionAligned,
    overUnderAligned,
    hardConflict,
    hasConflict: checks.some((check) => !check.passed),
    checks,
    conflictReasons: checks.filter((check) => !check.passed).map((check) => check.label),
  }
}

export function buildInternalV4Analysis(match, context = {}) {
  const evaluated = evaluateInternalRulesV4(match)
  const { facts, groups, allRules, triggered } = evaluated
  const strengthScore = effectWeight(triggered, 'strength') + effectWeight(triggered, 'direction')
  const tempoScore = effectWeight(triggered, 'tempoHigh') - effectWeight(triggered, 'tempoLow') * 0.5
  const drawScore = effectWeight(triggered, 'draw')
  const goalScore = effectWeight(triggered, 'score')
  const overUnderScore = effectWeight(triggered, 'over') - effectWeight(triggered, 'under')
  const volatilityPenalty = effectWeight(triggered, 'volatility')
  const infoPenalty = effectWeight(triggered, 'info') + effectWeight(triggered, 'infoReject')
  const poolBoost = effectWeight(triggered, 'pool') - effectWeight(triggered, 'poolReject')
  const baseScore =
    50 +
    facts.favoriteProbability * 32 +
    facts.leaderEdge * 120 +
    Math.min(facts.absoluteStrengthGap, 24) * 0.75 -
    facts.contextRisk * 0.2
  const totalScore = clampNumber(
    baseScore +
      strengthScore +
      tempoScore * 0.35 +
      drawScore * 0.2 +
      goalScore * 0.2 +
      Math.max(overUnderScore, 0) * 0.2 +
      poolBoost -
      volatilityPenalty -
      infoPenalty,
    0,
    100,
  )
  const gameType = getGameType(facts, triggered)
  const hardRejected =
    gameType === '方向冲突局' ||
    hasEffect(triggered, 'poolReject') ||
    (hasEffect(triggered, 'infoReject') && facts.leaderEdge < 0.04)
  const grade = getGrade(totalScore, hardRejected)
  const executionLevel = getExecutionLevel(grade)
  const poolStatus = getPoolStatus(grade, triggered)
  const mainPick = getMainPick(facts, gameType, grade)
  const overUnder = getOverUnderPick(facts, gameType)
  const scorePair = getScorePair(mainPick, gameType, overUnder)
  const uniqueScores = uniqueScorePair(scorePair.primaryScore, scorePair.secondaryScore)
  const predictions = {
    primaryScore: uniqueScores.primary,
    secondaryScore: uniqueScores.secondary,
    totalGoals: getScoreTotalGoalsV4(uniqueScores.primary),
    overUnder,
  }
  const consistency = buildConsistency(mainPick, predictions, triggered)
  const normalizedMatch = normalizeMatchForV4(match)
  const allowedFallbacks = {
    gameType: GAME_TYPES_V4.includes(gameType) ? gameType : '信息不足局',
    grade: GRADES_V4.includes(grade) ? grade : 'D',
    mainPick: MAIN_PICKS_V4.includes(mainPick) ? mainPick : '不进主推池',
    poolStatus: POOL_STATUS_V4.includes(poolStatus) ? poolStatus : '观察池',
    overUnder: OVER_UNDER_PICKS_V4.includes(overUnder) ? overUnder : '2.5分界',
  }

  return {
    version: INTERNAL_V4_VERSION,
    id: getRecordIdV4(match),
    match: {
      ...normalizedMatch,
      recordId: getRecordIdV4(match),
      matchName: getMatchNameV4(match),
    },
    classification: {
      gameType: allowedFallbacks.gameType,
      modelLeader: facts.modelLeader,
      marketFavorite: facts.marketFavorite,
      contextRisk: Math.round(facts.contextRisk),
    },
    rules: {
      groups,
      all: allRules,
      triggered,
    },
    score: {
      total: Math.round(totalScore),
      base: roundTo(baseScore, 2),
      strength: roundTo(strengthScore, 2),
      tempo: roundTo(tempoScore, 2),
      draw: roundTo(drawScore, 2),
      goals: roundTo(goalScore, 2),
      overUnder: roundTo(overUnderScore, 2),
      volatilityPenalty,
      infoPenalty,
      poolBoost,
    },
    decision: {
      mainPick: allowedFallbacks.mainPick,
      executionLevel,
      poolStatus: allowedFallbacks.poolStatus,
      grade: allowedFallbacks.grade,
    },
    predictions: {
      ...predictions,
      overUnder: allowedFallbacks.overUnder,
    },
    staking: {
      recommendedCapPercent:
        allowedFallbacks.grade === 'A'
          ? 5
          : allowedFallbacks.grade === 'B+'
            ? 3.5
            : allowedFallbacks.grade === 'B'
              ? 2.5
              : allowedFallbacks.grade === 'C'
                ? 1.2
                : 0,
      bankrollReference: context.bankroll ?? null,
      stakeEngineRequired: true,
    },
    consistency,
    reasons: triggered.slice(0, 8).map((rule) => rule.reason),
    facts: {
      market: facts.market,
      model: facts.model,
      totalGoals: facts.totalGoals,
      strengthGap: Math.round(facts.strengthGap),
      attackTempo: Math.round(facts.attackTempo),
      leaderEdge: roundTo(facts.leaderEdge, 4),
      overUnderEdge: roundTo(facts.overUnderEdge, 4),
      oddsSource: facts.odds.source,
    },
  }
}
