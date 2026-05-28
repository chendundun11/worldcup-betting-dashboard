const ENGINE_VERSION = 'bet-engine-v1-static-prematch'
const DEFAULT_BANKROLL = 10000
const DEFAULT_MAX_STAKE_PER_MATCH = 500
const MAX_BANKROLL_RATIO = 0.05
const OUTCOMES = ['home', 'draw', 'away']

const outcomeLabels = {
  home: '主胜方向',
  draw: '平局方向',
  away: '客胜方向',
  none: '观望',
}

const totalGoalLabels = {
  over25: '2.5球以上倾向',
  under25: '2.5球以下倾向',
  none: '观望',
}

const recommendLevels = [
  { min: 85, label: '极强参考', stakeMin: 350, stakeMax: 500 },
  { min: 75, label: '强参考', stakeMin: 200, stakeMax: 350 },
  { min: 65, label: '标准参考', stakeMin: 100, stakeMax: 200 },
  { min: 55, label: '轻仓试探', stakeMin: 50, stakeMax: 100 },
  { min: 0, label: '观望', stakeMin: 0, stakeMax: 0 },
]

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

function round(value, digits = 2) {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function toNumber(value, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function isPositiveOdd(value) {
  return toNumber(value) > 1
}

function getTeamName(match, side) {
  const team = match?.[`${side}Team`]
  return String(
    match?.[`${side}TeamName`] ??
      match?.[`${side}TeamDisplayName`] ??
      team?.name ??
      team?.shortName ??
      team ??
      '',
  ).trim()
}

function getMatchName(match) {
  const home = getTeamName(match, 'home') || 'Home'
  const away = getTeamName(match, 'away') || 'Away'
  return `${home} vs ${away}`
}

function getMatchId(match) {
  const id = String(match?.id ?? match?.matchId ?? '').trim()
  if (id) return id

  const kickoff = String(match?.kickoffTime ?? match?.kickoff ?? 'kickoff').trim()
  return `${getMatchName(match)} ${kickoff}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function getOdds(match) {
  const embedded = match?.odds ?? null
  const local = match?.localOdds ?? null
  const odds = {
    home: toNumber(embedded?.home ?? local?.homeWin),
    draw: toNumber(embedded?.draw ?? local?.draw),
    away: toNumber(embedded?.away ?? local?.awayWin),
    over25: toNumber(embedded?.over25 ?? local?.over25),
    under25: toNumber(embedded?.under25 ?? local?.under25),
  }
  const hasOneXTwo = OUTCOMES.every((key) => isPositiveOdd(odds[key]))
  const hasTotals = isPositiveOdd(odds.over25) && isPositiveOdd(odds.under25)

  return {
    ...odds,
    hasOneXTwo,
    hasTotals,
    source: local ? 'localSnapshot' : embedded ? 'embedded' : 'missing',
  }
}

function getMarketProbabilities(odds, keys) {
  const raw = Object.fromEntries(keys.map((key) => [key, 1 / odds[key]]))
  const overround = keys.reduce((sum, key) => sum + raw[key], 0)

  if (!overround) {
    return {
      probabilities: Object.fromEntries(keys.map((key) => [key, 0])),
      overround: 0,
    }
  }

  return {
    probabilities: Object.fromEntries(
      keys.map((key) => [key, raw[key] / overround]),
    ),
    overround,
  }
}

function getFavoriteOutcome(odds) {
  return OUTCOMES.reduce((best, key) =>
    odds[key] > 0 && odds[key] < odds[best] ? key : best,
  )
}

function buildFallbackModel(marketProbabilities, direction) {
  const model = { ...marketProbabilities }
  const selectedDirection = OUTCOMES.includes(direction) ? direction : null

  if (!selectedDirection) return model

  model[selectedDirection] = clamp(model[selectedDirection] + 0.035, 0, 0.86)
  const others = OUTCOMES.filter((key) => key !== selectedDirection)
  for (const key of others) {
    model[key] = clamp(model[key] - 0.0175, 0.04, 0.86)
  }

  const total = OUTCOMES.reduce((sum, key) => sum + model[key], 0)
  return Object.fromEntries(OUTCOMES.map((key) => [key, model[key] / total]))
}

function getModelProbabilities(match, marketProbabilities, favoriteOutcome) {
  if (
    Number.isFinite(match?.model?.home) &&
    Number.isFinite(match?.model?.draw) &&
    Number.isFinite(match?.model?.away)
  ) {
    return {
      probabilities: {
        home: match.model.home,
        draw: match.model.draw,
        away: match.model.away,
      },
      source: 'matchModel',
      limitation: null,
    }
  }

  const direction =
    match?.recommendation?.direction && match.recommendation.direction !== 'noBet'
      ? match.recommendation.direction
      : favoriteOutcome

  return {
    probabilities: buildFallbackModel(marketProbabilities, direction),
    source: 'oddsFallback',
    limitation: 'missingModelProbability',
  }
}

function getTotalGoalsModel(match, marketProbabilities) {
  if (
    Number.isFinite(match?.totalGoals?.model?.over25Probability) &&
    Number.isFinite(match?.totalGoals?.model?.under25Probability)
  ) {
    return {
      probabilities: {
        over25: match.totalGoals.model.over25Probability,
        under25: match.totalGoals.model.under25Probability,
      },
      source: 'matchModel',
      limitation: null,
    }
  }

  return {
    probabilities: { ...marketProbabilities },
    source: 'oddsFallback',
    limitation: 'missingTotalGoalsModel',
  }
}

function getBestEdge(edges, keys) {
  return keys.reduce((best, key) => (edges[key] > edges[best] ? key : best))
}

export function calculateValueEdge(match) {
  const odds = getOdds(match)
  const limitations = []

  if (!odds.hasOneXTwo) {
    limitations.push('missingOneXTwoOdds')
    return {
      status: 'limited',
      oddsSource: odds.source,
      marketProbabilities: { home: 0, draw: 0, away: 0 },
      modelProbabilities: { home: 0, draw: 0, away: 0 },
      edges: { home: 0, draw: 0, away: 0 },
      bestOutcome: 'none',
      bestEdge: 0,
      totalGoals: {
        marketProbabilities: { over25: 0, under25: 0 },
        modelProbabilities: { over25: 0, under25: 0 },
        edges: { over25: 0, under25: 0 },
        bestDirection: 'none',
        bestEdge: 0,
      },
      limitations,
    }
  }

  const oneXTwoMarket = getMarketProbabilities(odds, OUTCOMES)
  const favoriteOutcome = getFavoriteOutcome(odds)
  const oneXTwoModel = getModelProbabilities(
    match,
    oneXTwoMarket.probabilities,
    favoriteOutcome,
  )

  if (oneXTwoModel.limitation) limitations.push(oneXTwoModel.limitation)

  const edges = Object.fromEntries(
    OUTCOMES.map((key) => [
      key,
      oneXTwoModel.probabilities[key] - oneXTwoMarket.probabilities[key],
    ]),
  )
  const bestOutcome = getBestEdge(edges, OUTCOMES)

  let totalGoals = {
    marketProbabilities: { over25: 0, under25: 0 },
    modelProbabilities: { over25: 0, under25: 0 },
    edges: { over25: 0, under25: 0 },
    bestDirection: 'none',
    bestEdge: 0,
  }

  if (odds.hasTotals) {
    const totalMarket = getMarketProbabilities(odds, ['over25', 'under25'])
    const totalModel = getTotalGoalsModel(match, totalMarket.probabilities)
    if (totalModel.limitation) limitations.push(totalModel.limitation)
    const totalEdges = {
      over25:
        totalModel.probabilities.over25 - totalMarket.probabilities.over25,
      under25:
        totalModel.probabilities.under25 - totalMarket.probabilities.under25,
    }
    const bestDirection = getBestEdge(totalEdges, ['over25', 'under25'])

    totalGoals = {
      marketProbabilities: totalMarket.probabilities,
      modelProbabilities: totalModel.probabilities,
      edges: totalEdges,
      bestDirection,
      bestEdge: totalEdges[bestDirection],
    }
  } else {
    limitations.push('missingTotalGoalsOdds')
  }

  return {
    status: limitations.length ? 'limited' : 'ok',
    oddsSource: odds.source,
    marketProbabilities: oneXTwoMarket.probabilities,
    modelProbabilities: oneXTwoModel.probabilities,
    edges,
    bestOutcome,
    bestEdge: edges[bestOutcome],
    totalGoals,
    limitations,
  }
}

function getPowerDiff(match) {
  if (Number.isFinite(match?.model?.powerDiff)) return match.model.powerDiff
  const homeStrength = toNumber(match?.homeTeam?.teamStrength, 50)
  const awayStrength = toNumber(match?.awayTeam?.teamStrength, 50)
  return homeStrength - awayStrength
}

function getRecentAttackDefenseScore(match) {
  const home = match?.homeTeam ?? {}
  const away = match?.awayTeam ?? {}
  const fields = [
    home.recentForm,
    away.recentForm,
    home.attackRating,
    away.attackRating,
    home.defenseRating,
    away.defenseRating,
  ].map((value) => toNumber(value, NaN))

  if (fields.some((value) => !Number.isFinite(value))) return 6

  const average = fields.reduce((sum, value) => sum + value, 0) / fields.length
  return clamp(Math.round((average - 42) / 3.2), 0, 15)
}

function getDirectionClarityScore(odds, valueEdge) {
  if (!odds.hasOneXTwo) return 0

  const favorite = getFavoriteOutcome(odds)
  const favoriteOdd = odds[favorite]
  const sortedOdds = OUTCOMES.map((key) => odds[key]).sort((a, b) => a - b)
  const gap = sortedOdds[1] - sortedOdds[0]
  const edgeBoost = Math.max(valueEdge.bestEdge, 0) * 100
  const favoriteScore =
    favoriteOdd <= 1.45 ? 14 : favoriteOdd <= 1.7 ? 12 : favoriteOdd <= 2.05 ? 9 : 5
  const gapScore = gap >= 1.4 ? 5 : gap >= 0.8 ? 3 : gap >= 0.35 ? 1 : 0

  return clamp(Math.round(favoriteScore + gapScore + edgeBoost * 0.25), 0, 20)
}

function getValueEdgeScore(valueEdge) {
  return clamp(Math.round(Math.max(valueEdge.bestEdge, 0) * 260), 0, 25)
}

function getStrengthGapScore(match) {
  const gap = Math.abs(getPowerDiff(match))
  if (gap >= 14) return 15
  if (gap >= 10) return 12
  if (gap >= 7) return 9
  if (gap >= 4) return 6
  return 3
}

function getMarketStabilityScore(match, odds, valueEdge) {
  if (!odds.hasOneXTwo) return 0
  const staticScore = valueEdge.bestEdge >= 0.06 ? 7 : valueEdge.bestEdge >= 0.03 ? 5 : 3
  return match?.oddsHistory?.length ? clamp(staticScore + 2, 0, 10) : staticScore
}

function getUpsetElasticityScore(odds, valueEdge) {
  if (!odds.hasOneXTwo) return 0

  const favorite = getFavoriteOutcome(odds)
  const underdogs = OUTCOMES.filter((key) => key !== favorite)
  const bestUnderdog = underdogs.reduce((best, key) =>
    valueEdge.edges[key] > valueEdge.edges[best] ? key : best,
  )
  const underdogOdd = odds[bestUnderdog]

  if (underdogOdd >= 3.2 && underdogOdd <= 8 && valueEdge.edges[bestUnderdog] >= 0.035) {
    return 5
  }

  if (underdogOdd >= 2.8 && valueEdge.edges[bestUnderdog] >= 0.02) return 3
  return 0
}

function getHeatPenalty(odds, valueEdge) {
  if (!odds.hasOneXTwo) return 0

  const favorite = getFavoriteOutcome(odds)
  const favoriteOdd = odds[favorite]
  let penalty = 0

  if (favoriteOdd < 1.35) penalty -= 10
  if (favoriteOdd < 1.55 && valueEdge.edges[favorite] < 0.02) penalty -= 6
  if (favorite === valueEdge.bestOutcome && valueEdge.bestEdge < 0.015) penalty -= 4

  return clamp(penalty, -20, 0)
}

function getInfoPenalty(match, odds, valueEdge) {
  let penalty = 0

  if (!odds.hasOneXTwo) penalty -= 8
  if (!odds.hasTotals) penalty -= 3
  if (!match?.homeTeam || !match?.awayTeam) penalty -= 4
  if (valueEdge.limitations.length) penalty -= Math.min(4, valueEdge.limitations.length * 2)
  if (!match?.oddsHistory?.length) penalty -= 2

  return clamp(penalty, -15, 0)
}

export function calculateBetScore(match) {
  const odds = getOdds(match)
  const valueEdge = calculateValueEdge(match)
  const scoreParts = {
    valueEdge: getValueEdgeScore(valueEdge),
    directionClarity: getDirectionClarityScore(odds, valueEdge),
    strengthGap: getStrengthGapScore(match),
    recentAttackDefense: getRecentAttackDefenseScore(match),
    marketStability: getMarketStabilityScore(match, odds, valueEdge),
    upsetElasticity: getUpsetElasticityScore(odds, valueEdge),
    heatPenalty: getHeatPenalty(odds, valueEdge),
    infoPenalty: getInfoPenalty(match, odds, valueEdge),
  }

  const rawScore = Object.values(scoreParts).reduce((sum, value) => sum + value, 0)
  const betScore = clamp(Math.round(rawScore), 0, 100)

  return {
    betScore,
    scoreParts,
    valueEdge,
  }
}

function buildScoreBreakdown(match, scoreResult) {
  const odds = getOdds(match)
  const valueEdge = scoreResult.valueEdge
  const favorite = odds.hasOneXTwo ? getFavoriteOutcome(odds) : 'none'
  const powerDiff = round(getPowerDiff(match), 1)
  const oddsSourceText =
    valueEdge.oddsSource === 'localSnapshot'
      ? '本地赔率快照'
      : valueEdge.oddsSource === 'embedded'
        ? '内置赔率快照'
        : '缺少赔率'

  return {
    valueEdge: {
      score: scoreResult.scoreParts.valueEdge,
      reason:
        valueEdge.bestOutcome === 'none'
          ? '缺少可用胜平负赔率，无法形成静态赔率价值判断。'
          : `${outcomeLabels[valueEdge.bestOutcome]}静态价值为正，来源为${oddsSourceText}，仅作赛前估算。`,
    },
    directionClarity: {
      score: scoreResult.scoreParts.directionClarity,
      reason:
        favorite === 'none'
          ? '缺少赔率结构，方向清晰度归零。'
          : `热门方向为${outcomeLabels[favorite]}，按单点赔率差距评估方向清晰度。`,
    },
    strengthGap: {
      score: scoreResult.scoreParts.strengthGap,
      reason: `内部模型强弱差为 ${powerDiff}，用于辅助判断方向稳定性。`,
    },
    recentAttackDefense: {
      score: scoreResult.scoreParts.recentAttackDefense,
      reason: '基于球队近期状态、进攻评分和防守评分的内部估算，缺少真实近况源时需降权理解。',
    },
    marketStability: {
      score: scoreResult.scoreParts.marketStability,
      reason: match?.oddsHistory?.length
        ? '存在部分盘口历史，可辅助判断静态价值是否稳定。'
        : '缺少盘口变化历史，仅按静态价值给基础分。',
    },
    upsetElasticity: {
      score: scoreResult.scoreParts.upsetElasticity,
      reason:
        scoreResult.scoreParts.upsetElasticity > 0
          ? '存在静态赔率弹性，但 V1 只作为冷门路径观察。'
          : '未发现足够明确的静态冷门弹性。',
    },
    heatPenalty: {
      score: scoreResult.scoreParts.heatPenalty,
      reason:
        scoreResult.scoreParts.heatPenalty < 0
          ? '热门方向赔率偏低或价值不足，V1 按静态过热信号降权。'
          : '未触发静态过热扣分。',
    },
    infoPenalty: {
      score: scoreResult.scoreParts.infoPenalty,
      reason:
        scoreResult.scoreParts.infoPenalty < 0
          ? '盘口变化、真实伤停、预计首发或模型来源存在缺口，按信息不足降权。'
          : '当前输入未触发明显信息缺口扣分。',
    },
  }
}

function getRecommendLevel(score) {
  return recommendLevels.find((level) => score >= level.min) ?? recommendLevels.at(-1)
}

function interpolateStake(score, level) {
  if (level.stakeMax === 0) return 0
  const upper = level.min === 85 ? 100 : level.min + 9
  const ratio = clamp((score - level.min) / Math.max(upper - level.min, 1), 0, 1)
  return Math.round(level.stakeMin + (level.stakeMax - level.stakeMin) * ratio)
}

function getCap(bankroll, maxStakePerMatch) {
  return Math.max(0, Math.min(maxStakePerMatch, bankroll * MAX_BANKROLL_RATIO))
}

export function buildStakePlan(score, bankroll, picks, scoreParts = {}) {
  const level = getRecommendLevel(score)
  const safeBankroll = Math.max(toNumber(bankroll, DEFAULT_BANKROLL), 0)
  const maxStakePerMatch = toNumber(
    scoreParts.maxStakePerMatch,
    DEFAULT_MAX_STAKE_PER_MATCH,
  )
  const cap = getCap(safeBankroll, maxStakePerMatch)
  const targetStake = score < 55 ? 0 : Math.min(interpolateStake(score, level), cap)

  if (!targetStake || !picks?.mainPick || picks.mainPick.action === 'observe') {
    return {
      totalStake: 0,
      stakePlan: [],
      scorePicks: (picks?.scorePicks ?? []).map((pick) => ({ ...pick, stake: 0 })),
    }
  }

  const scoreStakeTotal = Math.min(
    Math.round(targetStake * 0.12),
    Math.round(targetStake * 0.15),
  )
  const secondaryStake =
    picks.secondaryPick && picks.secondaryPick.action !== 'none'
      ? Math.round(targetStake * 0.18)
      : 0
  const mainStake = Math.max(targetStake - secondaryStake - scoreStakeTotal, 0)
  const stakePlan = [
    {
      market: picks.mainPick.market,
      pick: picks.mainPick.direction,
      label: picks.mainPick.label,
      stake: mainStake,
    },
  ]

  if (secondaryStake > 0) {
    stakePlan.push({
      market: picks.secondaryPick.market,
      pick: picks.secondaryPick.direction,
      label: picks.secondaryPick.label,
      stake: secondaryStake,
    })
  }

  const rawScorePicks = picks.scorePicks ?? []
  const perScoreStake = rawScorePicks.length
    ? Math.floor(scoreStakeTotal / rawScorePicks.length)
    : 0
  const scorePicks = rawScorePicks.map((pick) => ({
    ...pick,
    stake: perScoreStake,
  }))

  for (const pick of scorePicks) {
    if (pick.stake > 0) {
      stakePlan.push({
        market: 'score',
        pick: pick.score,
        label: '比分参考',
        stake: pick.stake,
      })
    }
  }

  const totalStake = Math.min(
    stakePlan.reduce((sum, item) => sum + item.stake, 0),
    cap,
  )

  return {
    totalStake,
    stakePlan,
    scorePicks,
  }
}

export function buildHeatWarning(match, scoreParts) {
  const odds = getOdds(match)
  const valueEdge = scoreParts?.valueEdge ?? calculateValueEdge(match)

  if (!odds.hasOneXTwo) {
    return {
      level: 'high',
      message: '缺少胜平负赔率，内部引擎保持观望。',
      limitations: ['missingOneXTwoOdds'],
    }
  }

  const favorite = getFavoriteOutcome(odds)
  const favoriteOdd = odds[favorite]
  const limitations = ['missingMarketMovementHistory']

  if (favoriteOdd < 1.35) {
    return {
      level: 'high',
      message: '热门方向赔率过低，静态模型降权处理。',
      favorite,
      favoriteOdd,
      limitations,
    }
  }

  if (favoriteOdd < 1.55 && valueEdge.edges[favorite] < 0.02) {
    return {
      level: 'medium',
      message: '热门方向明显偏低，但赔率价值不足。',
      favorite,
      favoriteOdd,
      limitations,
    }
  }

  return {
    level: 'low',
    message: 'V1 仅基于静态赔率快照，不能判断动态盘口变化。',
    favorite,
    favoriteOdd,
    limitations,
  }
}

export function buildUpsetPick(match, scoreParts) {
  const odds = getOdds(match)
  const valueEdge = scoreParts?.valueEdge ?? calculateValueEdge(match)

  if (!odds.hasOneXTwo) {
    return {
      action: 'none',
      stake: 0,
      label: '无冷门建议',
      reason: '缺少胜平负赔率。',
    }
  }

  const favorite = getFavoriteOutcome(odds)
  const candidates = OUTCOMES.filter((key) => key !== favorite)
  const bestCandidate = candidates.reduce((best, key) =>
    valueEdge.edges[key] > valueEdge.edges[best] ? key : best,
  )
  const candidateOdd = odds[bestCandidate]
  const hasStaticValue =
    candidateOdd >= 3.2 &&
    candidateOdd <= 8 &&
    valueEdge.edges[bestCandidate] >= 0.035

  if (!hasStaticValue) {
    return {
      action: 'none',
      stake: 0,
      label: '无冷门建议',
      reason: '静态赔率没有给出明确冷门价值。',
    }
  }

  return {
    action: 'watch',
    stake: 0,
    market: '1X2',
    direction: bestCandidate,
    label: '冷门路径观察',
    reason: `${outcomeLabels[bestCandidate]}仅作冷门路径观察，不纳入 V1 下注金额；当前缺少盘口变化、伤停、首发数据。`,
  }
}

export function buildCancelRules(match, scoreParts) {
  const rules = [
    '临场阵容明显不利时取消或降级。',
    '盘口反向变化且无法解释时取消。',
    '信息不足时取消或观望。',
    '赔率价值被吃掉时不下注。',
    '比分玩法遇到阵容不确定时取消。',
  ]

  if (scoreParts?.betScore < 55) {
    rules.unshift('评分低于 55，保持观望。')
  }

  if (!getOdds(match).hasOneXTwo) {
    rules.unshift('缺少胜平负赔率，保持观望。')
  }

  return rules
}

function buildMainPick(match, scoreResult) {
  const valueEdge = scoreResult.valueEdge

  if (scoreResult.betScore < 55 || valueEdge.bestOutcome === 'none') {
    return {
      action: 'observe',
      market: 'none',
      direction: 'none',
      label: outcomeLabels.none,
      odds: null,
      edge: round(valueEdge.bestEdge),
    }
  }

  const odds = getOdds(match)
  const direction = valueEdge.bestOutcome

  return {
    action: 'bet',
    market: '1X2',
    direction,
    label: outcomeLabels[direction],
    odds: odds[direction] || null,
    edge: round(valueEdge.bestEdge),
  }
}

function buildSecondaryPick(match, scoreResult) {
  const odds = getOdds(match)
  const totalGoals = scoreResult.valueEdge.totalGoals

  if (
    scoreResult.betScore < 55 ||
    !odds.hasTotals ||
    totalGoals.bestDirection === 'none' ||
    totalGoals.bestEdge < 0.025
  ) {
    return {
      action: 'none',
      market: 'none',
      direction: 'none',
      label: totalGoalLabels.none,
      odds: null,
      edge: round(totalGoals.bestEdge),
    }
  }

  return {
    action: 'bet',
    market: 'totalGoals',
    direction: totalGoals.bestDirection,
    label: totalGoalLabels[totalGoals.bestDirection],
    odds: odds[totalGoals.bestDirection] || null,
    edge: round(totalGoals.bestEdge),
  }
}

function parseScoreReference(value) {
  return String(value ?? '')
    .split('/')
    .map((score) => score.trim())
    .filter(Boolean)
}

function buildScorePicks(match, mainPick) {
  const explicitScores = parseScoreReference(match?.localOdds?.scoreReference)
  const scoreLeans = Array.isArray(match?.scoreLeans)
    ? match.scoreLeans.map((item) => item.score).filter(Boolean)
    : []
  const scores = [...new Set([...explicitScores, ...scoreLeans])].slice(0, 2)

  if (scores.length) {
    return scores.map((score) => ({
      score,
      stake: 0,
      highVariance: true,
      note: '比分仅作为小额弹性参考。',
    }))
  }

  if (mainPick.direction === 'away') {
    return [
      { score: '0-1', stake: 0, highVariance: true, note: '比分仅作为小额弹性参考。' },
      { score: '1-2', stake: 0, highVariance: true, note: '比分仅作为小额弹性参考。' },
    ]
  }

  if (mainPick.direction === 'home') {
    return [
      { score: '1-0', stake: 0, highVariance: true, note: '比分仅作为小额弹性参考。' },
      { score: '2-1', stake: 0, highVariance: true, note: '比分仅作为小额弹性参考。' },
    ]
  }

  return [{ score: '1-1', stake: 0, highVariance: true, note: '比分仅作为小额弹性参考。' }]
}

function getModelProbabilityQuality(match, valueEdge) {
  if (valueEdge.limitations.includes('missingOneXTwoOdds')) return 'missing'
  if (valueEdge.limitations.includes('missingModelProbability')) return 'estimated'
  if (
    Number.isFinite(match?.model?.home) &&
    Number.isFinite(match?.model?.draw) &&
    Number.isFinite(match?.model?.away)
  ) {
    return 'estimated'
  }
  return 'missing'
}

function getDataQuality(match, valueEdge) {
  const odds = getOdds(match)
  const limitations = [
    ...valueEdge.limitations,
    'realInjuriesMissing',
    'expectedLineupsMissing',
  ]

  if (!match?.oddsHistory?.length) limitations.push('marketMovementHistoryMissing')
  if (!match?.oddsUpdatedAt) limitations.push('oddsUpdatedAtMissing')
  if (!Number.isFinite(match?.handicapLine)) limitations.push('handicapStructuredMissing')
  if (!match?.snapshotId) limitations.push('snapshotPersistenceMissing')
  if (!match?.settlement) limitations.push('resultSettlementMissing')

  return {
    odds: odds.source,
    marketMovement: match?.oddsHistory?.length ? 'partial' : 'missing',
    injuries: 'missing',
    expectedLineups: 'missing',
    teamProfile: match?.homeTeam && match?.awayTeam ? 'partial' : 'missing',
    oddsUpdatedAt: match?.oddsUpdatedAt ? 'partial' : 'missing',
    handicapStructured: Number.isFinite(match?.handicapLine) ? 'partial' : 'missing',
    snapshotPersistence: match?.snapshotId ? 'partial' : 'missing',
    resultSettlement: match?.settlement ? 'partial' : 'missing',
    modelProbability: getModelProbabilityQuality(match, valueEdge),
    limitations,
  }
}

export function buildPublicSummary(plan) {
  const mainLabel = plan?.mainPick?.label ?? outcomeLabels.none
  const secondaryLabel =
    plan?.secondaryPick?.action === 'bet' ? `，${plan.secondaryPick.label}` : ''
  const scoreText = plan?.scorePicks?.length
    ? `，比分参考 ${plan.scorePicks.map((pick) => pick.score).join(' / ')}`
    : ''

  if (!plan || plan.betScore < 55) {
    return `${plan?.matchName ?? '本场'}赛前参考以观望为主，临场复核阵容、盘口变化和市场热度。`
  }

  return `${plan.matchName}赛前参考：${mainLabel}${secondaryLabel}${scoreText}。临场复核阵容、盘口变化和市场热度。`
}

export function buildBetPlan(match, options = {}) {
  const bankroll = Math.max(toNumber(options.bankroll, DEFAULT_BANKROLL), 0)
  const maxStakePerMatch = Math.max(
    toNumber(options.maxStakePerMatch, DEFAULT_MAX_STAKE_PER_MATCH),
    0,
  )
  const scoreResult = calculateBetScore(match)
  const recommendLevel = getRecommendLevel(scoreResult.betScore).label
  const mainPick = buildMainPick(match, scoreResult)
  const secondaryPick = buildSecondaryPick(match, scoreResult)
  const scorePicks = buildScorePicks(match, mainPick)
  const stakeResult = buildStakePlan(
    scoreResult.betScore,
    bankroll,
    { mainPick, secondaryPick, scorePicks },
    { ...scoreResult.scoreParts, maxStakePerMatch },
  )
  const heatWarning = buildHeatWarning(match, scoreResult)
  const upsetPick = buildUpsetPick(match, scoreResult)
  const cancelRules = buildCancelRules(match, {
    ...scoreResult.scoreParts,
    betScore: scoreResult.betScore,
  })
  const dataQuality = getDataQuality(match, scoreResult.valueEdge)
  const scoreBreakdown = buildScoreBreakdown(match, scoreResult)
  const plan = {
    engineVersion: ENGINE_VERSION,
    matchId: getMatchId(match),
    matchName: getMatchName(match),
    bankroll,
    betScore: scoreResult.betScore,
    recommendLevel,
    mainPick,
    secondaryPick,
    scorePicks: stakeResult.scorePicks,
    upsetPick,
    totalStake: stakeResult.totalStake,
    stakePlan: stakeResult.stakePlan,
    valueEdge: {
      bestOutcome: scoreResult.valueEdge.bestOutcome,
      bestEdge: round(scoreResult.valueEdge.bestEdge, 4),
      edges: Object.fromEntries(
        Object.entries(scoreResult.valueEdge.edges).map(([key, value]) => [
          key,
          round(value, 4),
        ]),
      ),
      totalGoals: {
        bestDirection: scoreResult.valueEdge.totalGoals.bestDirection,
        bestEdge: round(scoreResult.valueEdge.totalGoals.bestEdge, 4),
        edges: Object.fromEntries(
          Object.entries(scoreResult.valueEdge.totalGoals.edges).map(
            ([key, value]) => [key, round(value, 4)],
          ),
        ),
      },
    },
    heatWarning,
    cancelRules,
    scoreBreakdown,
    internalAnalysis: {
      scoreParts: scoreResult.scoreParts,
      scoreBreakdown,
      valueEdgeSource: scoreResult.valueEdge.status,
      ruleNotes: [
        'GPT 后续只负责解释，不改变方向、评分、金额。',
        'V1 为静态赛前规则引擎，盘口变化历史缺失时自动降权。',
        'valueEdge 为静态赔率价值估算，不代表真实胜率，也不构成收益承诺。',
      ],
    },
    publicSummary: '',
    dataQuality,
  }

  return {
    ...plan,
    publicSummary: buildPublicSummary(plan),
  }
}

export default buildBetPlan
