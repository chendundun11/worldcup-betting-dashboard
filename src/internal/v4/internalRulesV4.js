import {
  clampNumber,
  getAttackTempoV4,
  getBestOutcomeV4,
  getContextRiskV4,
  getLowestOddOutcomeV4,
  getMarketProbabilitiesV4,
  getModelProbabilitiesV4,
  getOddsV4,
  getStrengthGapV4,
  getTeamMetricV4,
  getTotalGoalsModelV4,
} from './internalSelectorsV4.js'

function makeRule(id, label, effect, weight, fired, reason) {
  return {
    id,
    label,
    effect,
    weight,
    fired: Boolean(fired),
    reason,
  }
}

export function buildInternalV4Facts(match) {
  const odds = getOddsV4(match)
  const market = getMarketProbabilitiesV4(match, odds)
  const model = getModelProbabilitiesV4(match, market)
  const totalGoals = getTotalGoalsModelV4(match, odds)
  const strengthGap = getStrengthGapV4(match)
  const absoluteStrengthGap = Math.abs(strengthGap)
  const attackTempo = getAttackTempoV4(match)
  const contextRisk = getContextRiskV4(match)
  const modelLeader = getBestOutcomeV4(model)
  const marketFavorite = getLowestOddOutcomeV4(odds)
  const sortedModelValues = Object.values(model).sort((a, b) => b - a)
  const leaderSpread = (sortedModelValues[0] ?? 0.34) - (sortedModelValues[1] ?? 0.33)
  const overUnderEdge = totalGoals.over25 - totalGoals.under25
  const homeForm = getTeamMetricV4(match, 'home', 'recentForm')
  const awayForm = getTeamMetricV4(match, 'away', 'recentForm')
  const homeAttack = getTeamMetricV4(match, 'home', 'attackRating')
  const awayAttack = getTeamMetricV4(match, 'away', 'attackRating')
  const homeDefense = getTeamMetricV4(match, 'home', 'defenseRating')
  const awayDefense = getTeamMetricV4(match, 'away', 'defenseRating')
  const moraleGap =
    getTeamMetricV4(match, 'home', 'morale') - getTeamMetricV4(match, 'away', 'morale')
  const fatiguePressure = Math.max(
    getTeamMetricV4(match, 'home', 'fatigue'),
    getTeamMetricV4(match, 'away', 'fatigue'),
  )
  const injuryPressure = Math.max(
    getTeamMetricV4(match, 'home', 'injuryRisk'),
    getTeamMetricV4(match, 'away', 'injuryRisk'),
  )
  const directionEdge =
    strengthGap +
    (model.home - model.away) * 45 +
    moraleGap * 0.12 +
    3

  return {
    odds,
    market,
    model,
    totalGoals,
    strengthGap,
    absoluteStrengthGap,
    attackTempo,
    contextRisk,
    modelLeader,
    marketFavorite,
    leaderSpread,
    overUnderEdge,
    homeForm,
    awayForm,
    homeAttack,
    awayAttack,
    homeDefense,
    awayDefense,
    moraleGap,
    fatiguePressure,
    injuryPressure,
    directionEdge,
    hasOdds: odds.hasOneXTwo,
    hasTotals: odds.hasTotals,
  }
}

export function strengthRules(facts) {
  return [
    makeRule(
      'strength-home-clear',
      '主队强势',
      'strength',
      10,
      facts.directionEdge >= 14,
      `内部方向差 ${Math.round(facts.directionEdge)}，主队优势清楚。`,
    ),
    makeRule(
      'strength-away-clear',
      '客队强势',
      'strength',
      10,
      facts.directionEdge <= -14,
      `内部方向差 ${Math.round(facts.directionEdge)}，客队优势清楚。`,
    ),
    makeRule(
      'strength-balanced',
      '双方接近',
      'draw',
      7,
      Math.abs(facts.directionEdge) < 8,
      `内部方向差 ${Math.round(facts.directionEdge)}，胜负方向需要保护。`,
    ),
    makeRule(
      'strength-unclear',
      '强弱不明',
      'data',
      5,
      !facts.hasOdds || facts.leaderSpread < 0.035,
      '方向边际偏薄，按低额计划处理。',
    ),
  ]
}

export function tempoRules(facts) {
  return [
    makeRule(
      'tempo-slow',
      '慢节奏',
      'tempoLow',
      6,
      facts.attackTempo <= 44,
      `节奏评分 ${Math.round(facts.attackTempo)}，比分空间偏窄。`,
    ),
    makeRule(
      'tempo-mid',
      '中速节奏',
      'tempoMid',
      4,
      facts.attackTempo > 44 && facts.attackTempo < 62,
      `节奏评分 ${Math.round(facts.attackTempo)}，按中速展开。`,
    ),
    makeRule(
      'tempo-fast',
      '快节奏',
      'tempoHigh',
      7,
      facts.attackTempo >= 62,
      `节奏评分 ${Math.round(facts.attackTempo)}，进球弹性提升。`,
    ),
    makeRule(
      'tempo-open-game',
      '对攻倾向',
      'openGame',
      8,
      facts.attackTempo >= 66 && facts.absoluteStrengthGap <= 18,
      '双方进攻指标同时打开，保留对攻比分。',
    ),
  ]
}

export function drawRules(facts) {
  const drawPressure =
    facts.model.draw * 100 + Math.max(0, 12 - facts.absoluteStrengthGap) * 1.6

  return [
    makeRule(
      'draw-pressure-high',
      '平局高压',
      'draw',
      9,
      drawPressure >= 42,
      `平局压力指数 ${Math.round(drawPressure)}，比分必须覆盖平局。`,
    ),
    makeRule(
      'draw-pressure-mid',
      '平局中压',
      'draw',
      5,
      drawPressure >= 34 && drawPressure < 42,
      `平局压力指数 ${Math.round(drawPressure)}，保留不败路径。`,
    ),
    makeRule(
      'draw-pressure-low',
      '平局低压',
      'direction',
      4,
      drawPressure < 34,
      `平局压力指数 ${Math.round(drawPressure)}，方向可更集中。`,
    ),
  ]
}

export function goalRules(facts) {
  return [
    makeRule(
      'goal-range-low',
      '0-2球',
      'goalLow',
      7,
      facts.attackTempo <= 48 || facts.overUnderEdge <= -0.08,
      '节奏或大小球信号支持低比分区间。',
    ),
    makeRule(
      'goal-range-mid',
      '2-3球',
      'goalMid',
      6,
      facts.attackTempo > 48 && facts.attackTempo < 64,
      '节奏处于中段，优先覆盖 2-3 球。',
    ),
    makeRule(
      'goal-range-high',
      '3球以上',
      'goalHigh',
      7,
      facts.attackTempo >= 64 || facts.overUnderEdge >= 0.08,
      '节奏或大小球信号支持更高进球区间。',
    ),
  ]
}

export function overUnderRules(facts) {
  return [
    makeRule(
      'over-25-clear',
      '大 2.5',
      'over',
      8,
      facts.overUnderEdge >= 0.08,
      `大小球差值 ${Math.round(facts.overUnderEdge * 100)}，大球更清楚。`,
    ),
    makeRule(
      'under-25-clear',
      '小 2.5',
      'under',
      8,
      facts.overUnderEdge <= -0.08,
      `大小球差值 ${Math.round(facts.overUnderEdge * 100)}，小球更清楚。`,
    ),
    makeRule(
      'ou-boundary',
      '2.5球分界',
      'ouBoundary',
      10,
      Math.abs(facts.overUnderEdge) < 0.05,
      `大小球差值 ${Math.round(Math.abs(facts.overUnderEdge) * 100)}，只保留观察金额。`,
    ),
  ]
}

export function volatilityRules(facts) {
  return [
    makeRule(
      'volatility-stable',
      '稳定',
      'stable',
      5,
      facts.contextRisk < 45 && facts.injuryPressure < 50,
      '情境风险和伤停压力较低。',
    ),
    makeRule(
      'volatility-medium',
      '中等',
      'volatility',
      5,
      facts.contextRisk >= 45 && facts.contextRisk < 65,
      `情境风险 ${Math.round(facts.contextRisk)}，资金保持中性。`,
    ),
    makeRule(
      'volatility-high',
      '高波动',
      'volatility',
      9,
      facts.contextRisk >= 65 || facts.injuryPressure >= 65,
      `情境风险 ${Math.round(facts.contextRisk)}，伤停压力 ${Math.round(facts.injuryPressure)}。`,
    ),
  ]
}

export function rejectionRules(facts) {
  const directionConflict =
    facts.hasOdds &&
    facts.modelLeader !== facts.marketFavorite &&
    facts.modelLeader !== 'draw' &&
    facts.marketFavorite !== 'draw' &&
    facts.leaderSpread >= 0.08

  return [
    makeRule(
      'data-not-complete',
      '信息不足',
      'data',
      8,
      !facts.hasOdds || !facts.hasTotals,
      '基础赔率或大小球数据不完整，只能降低资金档位。',
    ),
    makeRule(
      'direction-conflict',
      '方向冲突',
      'conflict',
      10,
      directionConflict,
      '内部方向与市场低价方向不一致，进入低额计划。',
    ),
    makeRule(
      'score-conflict',
      '比分冲突',
      'conflict',
      6,
      facts.attackTempo >= 66 && facts.model.draw >= 0.3,
      '高节奏与平局压力同时存在，比分需要分散。',
    ),
    makeRule(
      'capital-risk-high',
      '资金风险过高',
      'capitalRisk',
      6,
      facts.contextRisk >= 76,
      '情境波动过高，资金公式必须降档。',
    ),
  ]
}

export function poolRules(facts) {
  const raw =
    52 +
    Math.abs(facts.directionEdge) * 1.2 +
    facts.leaderSpread * 160 -
    facts.contextRisk * 0.25

  return [
    makeRule(
      'plan-high',
      '高信心计划',
      'plan',
      7,
      raw >= 82,
      `计划分 ${Math.round(clampNumber(raw, 0, 100))}，可进入高信心资金档。`,
    ),
    makeRule(
      'plan-standard',
      '标准计划',
      'plan',
      5,
      raw >= 66 && raw < 82,
      `计划分 ${Math.round(clampNumber(raw, 0, 100))}，使用标准资金档。`,
    ),
    makeRule(
      'plan-minimum',
      '低额观察',
      'plan',
      4,
      raw < 66,
      `计划分 ${Math.round(clampNumber(raw, 0, 100))}，仍保留小金额计划。`,
    ),
  ]
}

export function evaluateInternalRulesV4(match) {
  const facts = buildInternalV4Facts(match)
  const groups = {
    strengthRules: strengthRules(facts),
    tempoRules: tempoRules(facts),
    drawRules: drawRules(facts),
    goalRules: goalRules(facts),
    overUnderRules: overUnderRules(facts),
    volatilityRules: volatilityRules(facts),
    rejectionRules: rejectionRules(facts),
    poolRules: poolRules(facts),
  }
  const allRules = Object.values(groups).flat()
  const triggered = allRules.filter((rule) => rule.fired)

  return {
    facts,
    groups,
    allRules,
    triggered,
  }
}
