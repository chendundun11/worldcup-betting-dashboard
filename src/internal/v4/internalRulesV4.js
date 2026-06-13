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
  const favoriteProbability = model[modelLeader]
  const leaderEdge = favoriteProbability - Math.max(
    ...Object.entries(model)
      .filter(([key]) => key !== modelLeader)
      .map(([, value]) => value),
  )
  const overUnderEdge = totalGoals.over25 - totalGoals.under25
  const homeForm = getTeamMetricV4(match, 'home', 'recentForm')
  const awayForm = getTeamMetricV4(match, 'away', 'recentForm')
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
    favoriteProbability,
    leaderEdge,
    overUnderEdge,
    homeForm,
    awayForm,
    moraleGap,
    fatiguePressure,
    injuryPressure,
    hasOdds: odds.hasOneXTwo,
    hasTotals: odds.hasTotals,
  }
}

export function strengthRules(facts) {
  return [
    makeRule(
      'strength-home-clear',
      '主队实力差拉开',
      'strength',
      12,
      facts.strengthGap >= 12,
      `主客实力差为 ${Math.round(facts.strengthGap)}，主队具备压制基础。`,
    ),
    makeRule(
      'strength-away-clear',
      '客队实力差拉开',
      'strength',
      12,
      facts.strengthGap <= -12,
      `主客实力差为 ${Math.round(facts.strengthGap)}，客队具备压制基础。`,
    ),
    makeRule(
      'model-leader-supported',
      '模型主方向有边际',
      'direction',
      10,
      facts.favoriteProbability >= 0.46 && facts.leaderEdge >= 0.08,
      `主方向概率 ${Math.round(facts.favoriteProbability * 100)}%，领先边际 ${Math.round(
        facts.leaderEdge * 100,
      )} 个百分点。`,
    ),
    makeRule(
      'form-side-support',
      '近期状态支持强侧',
      'strength',
      5,
      Math.abs(facts.homeForm - facts.awayForm) >= 10,
      `两队近期状态差为 ${Math.round(facts.homeForm - facts.awayForm)}。`,
    ),
  ]
}

export function tempoRules(facts) {
  return [
    makeRule(
      'tempo-high',
      '进攻节奏偏高',
      'tempoHigh',
      8,
      facts.attackTempo >= 62,
      `攻防节奏评分 ${Math.round(facts.attackTempo)}，具备开放走势。`,
    ),
    makeRule(
      'tempo-low',
      '进攻节奏偏低',
      'tempoLow',
      8,
      facts.attackTempo <= 44,
      `攻防节奏评分 ${Math.round(facts.attackTempo)}，更接近谨慎节奏。`,
    ),
    makeRule(
      'fatigue-slows-tempo',
      '体能压力压低节奏',
      'tempoLow',
      4,
      facts.fatiguePressure >= 66,
      `最高体能压力 ${Math.round(facts.fatiguePressure)}，节奏需要降档。`,
    ),
  ]
}

export function drawRules(facts) {
  return [
    makeRule(
      'draw-probability-high',
      '平局概率偏高',
      'draw',
      9,
      facts.model.draw >= 0.29,
      `平局概率 ${Math.round(facts.model.draw * 100)}%，需要保护。`,
    ),
    makeRule(
      'balanced-strength',
      '实力接近',
      'draw',
      7,
      facts.absoluteStrengthGap <= 7,
      `实力差 ${Math.round(facts.absoluteStrengthGap)}，方向优势不明显。`,
    ),
    makeRule(
      'morale-balance',
      '情绪面没有明显单边',
      'draw',
      3,
      Math.abs(facts.moraleGap) <= 7,
      `士气差 ${Math.round(facts.moraleGap)}，没有明显单边倾斜。`,
    ),
  ]
}

export function goalRules(facts) {
  return [
    makeRule(
      'favorite-can-score',
      '强侧进球基础较稳',
      'score',
      7,
      facts.favoriteProbability >= 0.48 && facts.attackTempo >= 50,
      '主方向和节奏同时支持至少一球以上的比分方案。',
    ),
    makeRule(
      'clean-sheet-window',
      '强侧零封窗口',
      'score',
      5,
      facts.absoluteStrengthGap >= 16 && facts.attackTempo <= 58,
      '实力差较大且节奏未失控，保留零封比分窗口。',
    ),
    makeRule(
      'both-score-window',
      '双方进球窗口',
      'score',
      5,
      facts.attackTempo >= 60 && facts.absoluteStrengthGap <= 18,
      '节奏偏高且实力差未完全拉开，双方进球概率上升。',
    ),
  ]
}

export function overUnderRules(facts) {
  return [
    makeRule(
      'over-25-support',
      '大2.5有模型支持',
      'over',
      8,
      facts.totalGoals.over25 >= 0.54 && facts.overUnderEdge >= 0.08,
      `大2.5概率 ${Math.round(facts.totalGoals.over25 * 100)}%。`,
    ),
    makeRule(
      'under-25-support',
      '小2.5有模型支持',
      'under',
      8,
      facts.totalGoals.under25 >= 0.54 && facts.overUnderEdge <= -0.08,
      `小2.5概率 ${Math.round(facts.totalGoals.under25 * 100)}%。`,
    ),
    makeRule(
      'ou-boundary',
      '大小球处于2.5分界',
      'ouBoundary',
      10,
      Math.abs(facts.overUnderEdge) < 0.04,
      `大小球概率差 ${Math.round(Math.abs(facts.overUnderEdge) * 100)} 个百分点，暂停大小球投入。`,
    ),
  ]
}

export function volatilityRules(facts) {
  return [
    makeRule(
      'context-risk-high',
      '赛事情境波动偏高',
      'volatility',
      10,
      facts.contextRisk >= 65,
      `情境风险 ${Math.round(facts.contextRisk)}，需要降级。`,
    ),
    makeRule(
      'favorite-heat',
      '强侧价格偏热',
      'volatility',
      7,
      facts.hasOdds &&
        facts.marketFavorite !== 'draw' &&
        facts.odds[facts.marketFavorite] <= 1.62 &&
        facts.favoriteProbability < 0.56,
      `市场低价方向为 ${facts.marketFavorite}，模型支持不足以无条件放大。`,
    ),
    makeRule(
      'injury-pressure',
      '伤停压力偏高',
      'volatility',
      6,
      facts.injuryPressure >= 62,
      `最高伤停压力 ${Math.round(facts.injuryPressure)}，保留临场复核。`,
    ),
  ]
}

export function rejectionRules(facts) {
  const modelMarketConflict =
    facts.hasOdds &&
    facts.modelLeader !== facts.marketFavorite &&
    facts.modelLeader !== 'draw' &&
    facts.marketFavorite !== 'draw' &&
    Math.abs(facts.model[facts.modelLeader] - facts.model[facts.marketFavorite]) >= 0.08

  return [
    makeRule(
      'missing-core-odds',
      '缺少胜平负核心赔率',
      'infoReject',
      12,
      !facts.hasOdds,
      '没有完整胜平负赔率，内部模型只能保守处理。',
    ),
    makeRule(
      'missing-total-odds',
      '缺少大小球赔率',
      'info',
      5,
      !facts.hasTotals,
      '没有完整大小球赔率，大小球投入降权。',
    ),
    makeRule(
      'model-market-hard-conflict',
      '模型方向与市场强冲突',
      'hardConflict',
      14,
      modelMarketConflict,
      `模型方向 ${facts.modelLeader} 与市场低价方向 ${facts.marketFavorite} 存在明显冲突。`,
    ),
    makeRule(
      'leader-edge-too-thin',
      '主方向优势过薄',
      'info',
      6,
      facts.leaderEdge < 0.035,
      `主方向领先边际仅 ${Math.round(facts.leaderEdge * 100)} 个百分点。`,
    ),
  ]
}

export function poolRules(facts) {
  const positiveBase = clampNumber(
    facts.favoriteProbability * 100 +
      facts.leaderEdge * 120 +
      Math.min(facts.absoluteStrengthGap, 24) -
      facts.contextRisk * 0.18,
    0,
    100,
  )

  return [
    makeRule(
      'pool-main-candidate',
      '主推池候选分达标',
      'pool',
      8,
      positiveBase >= 72 && facts.leaderEdge >= 0.08,
      `候选分 ${Math.round(positiveBase)}，达到主推观察线。`,
    ),
    makeRule(
      'pool-candidate',
      '候选池分达标',
      'pool',
      5,
      positiveBase >= 62,
      `候选分 ${Math.round(positiveBase)}，达到候选观察线。`,
    ),
    makeRule(
      'pool-excluded',
      '剔除条件触发',
      'poolReject',
      12,
      positiveBase < 46 || facts.contextRisk >= 82,
      `候选分 ${Math.round(positiveBase)}，或情境风险过高。`,
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
