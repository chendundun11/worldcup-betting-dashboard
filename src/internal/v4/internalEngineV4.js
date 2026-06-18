import {
  DIRECTION_STRENGTH_LABELS_V4,
  EXECUTION_LEVELS_V4,
  GAME_TYPES_V4,
  GRADES_V4,
  INTERNAL_V4_VERSION,
  MAIN_PICKS_V4,
  POOL_STATUS_V4,
  SCORE_DIMENSION_KEYS_V4,
  SCORE_DIMENSION_LABELS_V4,
} from './internalTypesV4.js'
import { evaluateInternalRulesV4 } from './internalRulesV4.js'
import { buildQuantScoreModel } from '../../services/quantScoreEngine.js'
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

function hasEffect(triggered, effect) {
  return triggered.some((rule) => rule.effect === effect)
}

function calculateDimensions(facts) {
  const formGap = Math.abs(facts.homeForm - facts.awayForm)
  const styleGap = Math.abs(
    facts.homeAttack - facts.awayDefense - (facts.awayAttack - facts.homeDefense),
  )
  const drawPressureRaw =
    facts.model.draw * 100 + Math.max(0, 12 - facts.absoluteStrengthGap) * 1.7
  const heatRisk =
    facts.hasOdds && facts.marketFavorite !== 'draw' && facts.odds[facts.marketFavorite] <= 1.62
      ? 24
      : 0
  const dataMissingPenalty = (facts.hasOdds ? 0 : 24) + (facts.hasTotals ? 0 : 14)
  const scoreFocus =
    60 +
    Math.abs(facts.directionEdge) * 0.9 +
    Math.abs(facts.overUnderEdge) * 130 -
    Math.min(facts.contextRisk, 80) * 0.22

  return {
    strengthGapScore: clampNumber(
      45 + facts.absoluteStrengthGap * 2.2 + facts.leaderSpread * 90,
      0,
      100,
    ),
    formScore: clampNumber(50 + formGap * 1.45, 0, 100),
    homeAwayScore: clampNumber(55 + facts.directionEdge * 0.55, 0, 100),
    lineupStabilityScore: clampNumber(
      100 - facts.injuryPressure * 0.42 - facts.fatiguePressure * 0.24,
      0,
      100,
    ),
    styleMatchupScore: clampNumber(50 + styleGap * 1.2, 0, 100),
    tempoScore: clampNumber(facts.attackTempo, 0, 100),
    drawPressureScore: clampNumber(drawPressureRaw, 0, 100),
    marketHeatScore: clampNumber(
      82 - heatRisk - Math.max(0, facts.contextRisk - 55) * 0.4,
      0,
      100,
    ),
    volatilityScore: clampNumber(
      100 - facts.contextRisk * 0.78 - facts.injuryPressure * 0.18,
      0,
      100,
    ),
    scoreConcentrationScore: clampNumber(scoreFocus, 0, 100),
    overUnderClarityScore: clampNumber(48 + Math.abs(facts.overUnderEdge) * 260, 0, 100),
    dataStabilityScore: clampNumber(88 - dataMissingPenalty - facts.contextRisk * 0.12, 0, 100),
  }
}

function getGameType(facts, dimensions, triggered) {
  if (hasEffect(triggered, 'conflict') && dimensions.dataStabilityScore < 58) {
    return '方向冲突局'
  }
  if (dimensions.dataStabilityScore < 45) return '信息不足局'
  if (dimensions.drawPressureScore >= 42 && facts.absoluteStrengthGap <= 10) {
    return '平局保护局'
  }
  if (hasEffect(triggered, 'openGame') || (facts.attackTempo >= 64 && facts.overUnderEdge >= 0.05)) {
    return '对攻大球局'
  }
  if (facts.attackTempo <= 46 || facts.overUnderEdge <= -0.08) return '低比分胶着局'
  if (hasEffect(triggered, 'volatility-high')) return '冷门波动局'
  if (facts.hasOdds && facts.marketFavorite !== 'draw' && facts.odds[facts.marketFavorite] <= 1.62) {
    return '强队过热局'
  }
  if (facts.absoluteStrengthGap >= 12 || Math.abs(facts.directionEdge) >= 16) {
    return '强队压制局'
  }
  return facts.contextRisk >= 58 ? '冷门波动局' : '平局保护局'
}

function getGameTypeModifier(gameType) {
  return (
    {
      强队压制局: 88,
      对攻大球局: 82,
      低比分胶着局: 76,
      平局保护局: 74,
      强队过热局: 66,
      冷门波动局: 64,
      信息不足局: 55,
      方向冲突局: 52,
    }[gameType] ?? 60
  )
}

function buildConfidence(dimensions, gameType) {
  const directionConfidence = clampNumber(
    dimensions.strengthGapScore * 0.38 +
      dimensions.formScore * 0.18 +
      dimensions.homeAwayScore * 0.16 +
      dimensions.marketHeatScore * 0.14 +
      dimensions.volatilityScore * 0.14,
    0,
    100,
  )
  const scoreConfidence = clampNumber(
    dimensions.scoreConcentrationScore * 0.34 +
      dimensions.lineupStabilityScore * 0.18 +
      dimensions.styleMatchupScore * 0.18 +
      (100 - Math.abs(dimensions.tempoScore - 55)) * 0.14 +
      dimensions.dataStabilityScore * 0.16,
    0,
    100,
  )
  const overUnderConfidence = clampNumber(
    dimensions.overUnderClarityScore * 0.55 +
      (100 - Math.abs(dimensions.tempoScore - 58)) * 0.2 +
      dimensions.dataStabilityScore * 0.25,
    0,
    100,
  )
  const dataConfidence = clampNumber(dimensions.dataStabilityScore, 0, 100)
  const gameTypeModifier = getGameTypeModifier(gameType)
  const internalConfidence = clampNumber(
    directionConfidence * 0.35 +
      scoreConfidence * 0.2 +
      overUnderConfidence * 0.2 +
      dataConfidence * 0.15 +
      gameTypeModifier * 0.1,
    0,
    100,
  )

  return {
    directionConfidence: Math.round(directionConfidence),
    scoreConfidence: Math.round(scoreConfidence),
    overUnderConfidence: Math.round(overUnderConfidence),
    dataConfidence: Math.round(dataConfidence),
    gameTypeModifier: Math.round(gameTypeModifier),
    internalConfidence: Math.round(internalConfidence),
  }
}

function getGrade(internalConfidence) {
  if (internalConfidence >= 90) return 'A'
  if (internalConfidence >= 82) return 'B+'
  if (internalConfidence >= 74) return 'B'
  if (internalConfidence >= 66) return 'C'
  if (internalConfidence >= 58) return 'D+'
  return 'D'
}

function getExecutionLevel(grade) {
  if (grade === 'A') return '强信心计划'
  if (grade === 'B+') return '中高信心计划'
  if (grade === 'B') return '标准计划'
  if (grade === 'C' || grade === 'D+') return '低额观察'
  return '最低观察'
}

function getPoolStatus(grade) {
  if (grade === 'A') return '高信心'
  if (grade === 'B+') return '中高信心'
  if (grade === 'B') return '标准观察'
  if (grade === 'C' || grade === 'D+') return '低额观察'
  return '最低观察'
}

function getDirectionStrengthLabel(directionConfidence) {
  if (directionConfidence >= 86) return '强'
  if (directionConfidence >= 76) return '中强'
  if (directionConfidence >= 66) return '中等'
  if (directionConfidence >= 56) return '偏弱'
  return '最低观察'
}

function getMainPick(facts, dimensions, gameType) {
  if (gameType === '平局保护局' && dimensions.drawPressureScore >= 52) return '平局'
  if (Math.abs(facts.directionEdge) < 5 && dimensions.drawPressureScore >= 38) return '平局'
  const outcome = facts.directionEdge >= 0 ? 'home' : 'away'
  return mapOutcomeToMainPickV4(outcome, Math.abs(facts.directionEdge))
}

function getScorePair(match, mainPick, gameType, facts) {
  const scoreModel = buildQuantScoreModel(match, {
    facts,
    gameType,
    mainPick,
  })

  return {
    primaryScore: scoreModel.primaryScore,
    secondaryScore: scoreModel.secondaryScore,
    scoreModel,
  }
}

function getOverUnderFromScores(primaryScore, secondaryScore) {
  const primaryTotal = getScoreTotalGoalsV4(primaryScore)
  const secondaryTotal = getScoreTotalGoalsV4(secondaryScore)
  if (primaryTotal >= 3 && secondaryTotal >= 3) return '大2.5'
  if (primaryTotal <= 2 && secondaryTotal <= 2) return '小2.5'
  return '2.5球分界'
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

function isDrawScore(scoreText) {
  return getScoreOutcomeV4(scoreText) === 'draw'
}

function getScoreStrategyNotice(gameType, mainPick, predictions) {
  const primaryOutcome = getScoreOutcomeV4(predictions.primaryScore)
  if (mainPick === '主队不败' && primaryOutcome === 'draw' && gameType === '平局保护局') {
    return '平局保护主推，方向为主队不败。'
  }
  if (mainPick === '客队不败' && primaryOutcome === 'draw' && gameType === '平局保护局') {
    return '平局保护主推，方向为客队不败。'
  }
  if (!scoreMatchesMainPick(predictions.primaryScore, mainPick)) {
    return `主方向与波胆存在保护差异：主方向看 ${mainPick}，波胆用于防 ${predictions.primaryScore}。`
  }
  return ''
}

function buildConsistency(gameType, mainPick, predictions) {
  const primaryDirectionAligned = scoreMatchesMainPick(predictions.primaryScore, mainPick)
  const secondaryDirectionAligned = scoreMatchesMainPick(predictions.secondaryScore, mainPick)
  const hasDrawForProtection =
    gameType !== '平局保护局' ||
    isDrawScore(predictions.primaryScore) ||
    isDrawScore(predictions.secondaryScore)
  const lowScoreGuard =
    gameType !== '低比分胶着局' ||
    (getScoreTotalGoalsV4(predictions.primaryScore) <= 2 &&
      getScoreTotalGoalsV4(predictions.secondaryScore) <= 2)
  const overUnderAligned =
    predictions.overUnder === getOverUnderFromScores(
      predictions.primaryScore,
      predictions.secondaryScore,
    )
  const checks = [
    {
      id: 'primary-direction',
      label: '候选比分与主方向一致',
      passed: primaryDirectionAligned,
    },
    {
      id: 'secondary-direction',
      label: '保护比分覆盖主方向或保护路径',
      passed: secondaryDirectionAligned || gameType === '平局保护局' || gameType === '信息不足局',
    },
    {
      id: 'draw-protection-score',
      label: '平局保护局至少一个平局比分',
      passed: hasDrawForProtection,
    },
    {
      id: 'low-score-guard',
      label: '低比分局不输出高比分',
      passed: lowScoreGuard,
    },
    {
      id: 'over-under-score-link',
      label: '比分与大小球一致',
      passed: overUnderAligned,
    },
  ]
  const failedCount = checks.filter((check) => !check.passed).length
  const severity =
    failedCount === 0 ? 'none' : failedCount === 1 ? 'light' : failedCount === 2 ? 'medium' : 'severe'

  return {
    directionScoreAligned: primaryDirectionAligned,
    totalGoalsAligned: lowScoreGuard,
    overUnderAligned,
    stakeAligned: true,
    hasHardConflict: severity === 'severe',
    severity,
    consistencyFactor:
      severity === 'none' ? 1 : severity === 'light' ? 0.75 : severity === 'medium' ? 0.5 : 0.3,
    checks,
    conflictReasons: checks.filter((check) => !check.passed).map((check) => check.label),
    scoreStrategyNotice: getScoreStrategyNotice(gameType, mainPick, predictions),
  }
}

function buildDimensionAudit(roundedDimensions) {
  const items = Object.fromEntries(
    SCORE_DIMENSION_KEYS_V4.map((key) => {
      const value = roundedDimensions[key]
      return [
        key,
        {
          value,
          label: SCORE_DIMENSION_LABELS_V4[key],
          state: value === 50 ? '数据中性' : '参与判断',
        },
      ]
    }),
  )
  const neutralDimensionCount = SCORE_DIMENSION_KEYS_V4.filter(
    (key) => roundedDimensions[key] === 50,
  ).length

  return {
    items,
    neutralDimensionCount,
    nonDefaultDimensionCount: SCORE_DIMENSION_KEYS_V4.length - neutralDimensionCount,
  }
}

function buildExplanationChain(facts, gameType, mainPick, predictions, confidence, grade) {
  const directionSide = facts.directionEdge >= 0 ? '主队侧' : '客队侧'
  const expectedGoals = predictions.scoreModel?.expectedGoals
  const overUnderReason =
    predictions.overUnder === '2.5球分界'
      ? '大小球差值接近中线，只保留观察金额。'
      : predictions.overUnder === '大2.5'
        ? '两个比分路径均落在 3 球以上。'
        : '两个比分路径均落在 0-2 球区间。'

  return [
    {
      key: 'direction',
      label: '方向判断',
      text: `${directionSide}内部方向差 ${roundTo(facts.directionEdge, 1)}，主方向为 ${mainPick}，方向强度来自实力、状态和市场热度综合。`,
    },
    {
      key: 'score',
      label: '比分判断',
      text: `${gameType} 输出 ${predictions.primaryScore} / ${predictions.secondaryScore}，期望进球 ${expectedGoals?.homeXg ?? '-'}-${expectedGoals?.awayXg ?? '-'}，候选分布覆盖保护路径。`,
    },
    {
      key: 'totalGoals',
      label: '总进球判断',
      text: `总进球区间为 ${predictions.totalGoalsText}，节奏评分 ${Math.round(facts.attackTempo)} 与比分总进球共同决定。`,
    },
    {
      key: 'overUnder',
      label: '大小球判断',
      text: `大小球为 ${predictions.overUnder}。${overUnderReason}`,
    },
    {
      key: 'funding',
      label: '资金判断',
      text: `${grade}档来自内部总信心 ${confidence.internalConfidence}，后续由信心、回撤、暴露和一致性系数压缩或放大。`,
    },
  ]
}

export function buildInternalV4Analysis(match, context = {}) {
  const evaluated = evaluateInternalRulesV4(match)
  const { facts, groups, allRules, triggered } = evaluated
  const dimensions = calculateDimensions(facts)
  const gameType = getGameType(facts, dimensions, triggered)
  const confidence = buildConfidence(dimensions, gameType)
  const grade = getGrade(confidence.internalConfidence)
  const executionLevel = getExecutionLevel(grade)
  const poolStatus = getPoolStatus(grade)
  const directionStrength = getDirectionStrengthLabel(confidence.directionConfidence)
  const mainPick = getMainPick(facts, dimensions, gameType)
  const scorePair = getScorePair(match, mainPick, gameType, facts)
  const overUnder = getOverUnderFromScores(scorePair.primaryScore, scorePair.secondaryScore)
  const predictions = {
    primaryScore: scorePair.primaryScore,
    secondaryScore: scorePair.secondaryScore,
    totalGoalsText: scorePair.scoreModel.totalGoalsText,
    overUnderText: overUnder,
    overUnderValue: 2.5,
    overUnder,
    scoreModel: scorePair.scoreModel,
  }
  const consistency = buildConsistency(gameType, mainPick, predictions)
  const normalizedMatch = normalizeMatchForV4(match)
  const roundedDimensions = Object.fromEntries(
    SCORE_DIMENSION_KEYS_V4.map((key) => [key, Math.round(dimensions[key])]),
  )
  const dimensionAudit = buildDimensionAudit(roundedDimensions)
  const explanations = buildExplanationChain(
    facts,
    gameType,
    mainPick,
    predictions,
    confidence,
    grade,
  )

  return {
    version: INTERNAL_V4_VERSION,
    id: getRecordIdV4(match),
    match: {
      ...normalizedMatch,
      recordId: getRecordIdV4(match),
      matchName: getMatchNameV4(match),
    },
    classification: {
      gameType: GAME_TYPES_V4.includes(gameType) ? gameType : '信息不足局',
      strengthSide: facts.directionEdge >= 0 ? '主队' : '客队',
      tempo:
        dimensions.tempoScore >= 62
          ? '快节奏'
          : dimensions.tempoScore <= 44
            ? '慢节奏'
            : '中速节奏',
      goalProfile: predictions.totalGoalsText,
      drawPressure:
        dimensions.drawPressureScore >= 42
          ? '高'
          : dimensions.drawPressureScore >= 34
            ? '中'
            : '低',
      volatility:
        dimensions.volatilityScore >= 70
          ? '稳定'
          : dimensions.volatilityScore >= 50
            ? '中等'
            : '高波动',
      confidenceShape: directionStrength,
    },
    rules: {
      groups,
      all: allRules,
      triggered,
      triggeredRules: triggered,
      blockedRules: allRules.filter((rule) => !rule.fired),
      ruleScoreMap: Object.fromEntries(triggered.map((rule) => [rule.id, rule.weight])),
    },
    score: {
      dimensions: roundedDimensions,
      dimensionLabels: SCORE_DIMENSION_LABELS_V4,
      dimensionAudit,
      finalScore: confidence.internalConfidence,
      grade,
    },
    confidence,
    decision: {
      mainPick: MAIN_PICKS_V4.includes(mainPick) ? mainPick : '平局',
      attackPick: predictions.totalGoalsText,
      coverPick:
        gameType === '平局保护局' || gameType === '信息不足局'
          ? '平局保护'
          : '相邻比分保护',
      executionLevel: EXECUTION_LEVELS_V4.includes(executionLevel)
        ? executionLevel
        : '最低观察',
      poolStatus: POOL_STATUS_V4.includes(poolStatus) ? poolStatus : '最低观察',
      isMainPoolCandidate: grade === 'A' || grade === 'B+',
      grade: GRADES_V4.includes(grade) ? grade : 'D',
      fundingTier: grade,
      directionStrength: DIRECTION_STRENGTH_LABELS_V4.includes(directionStrength)
        ? directionStrength
        : '最低观察',
    },
    predictions: {
      ...predictions,
      totalGoals: getScoreTotalGoalsV4(predictions.primaryScore),
      primaryScoreTotal: getScoreTotalGoalsV4(predictions.primaryScore),
      secondaryScoreTotal: getScoreTotalGoalsV4(predictions.secondaryScore),
    },
    staking: {
      bankrollReference: context.bankroll ?? null,
      stakeEngineRequired: true,
      fundingTier: grade,
    },
    consistency,
    explanations,
    reasons: {
      headline: `${gameType} · ${directionStrength} · ${grade}档`,
      hardReasons: triggered
        .filter((rule) => ['strength', 'direction', 'plan'].includes(rule.effect))
        .map((rule) => rule.reason),
      cautionReasons: triggered
        .filter((rule) => ['volatility', 'data', 'capitalRisk'].includes(rule.effect))
        .map((rule) => rule.reason),
      rejectReasons: [],
    },
    facts: {
      strengthGap: Math.round(facts.strengthGap),
      attackTempo: Math.round(facts.attackTempo),
      directionEdge: roundTo(facts.directionEdge, 2),
      overUnderEdge: roundTo(facts.overUnderEdge, 4),
      oddsSource: facts.odds.source,
    },
  }
}
