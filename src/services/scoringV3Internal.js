import {
  DEFAULT_V3_BANKROLL,
  buildStakePlanV3,
  getV3DecisionLevel,
} from './stakePlannerV3.js'

const VERSION = 'v3-internal-1'

const MAIN_PICK_TYPES = [
  '主队胜',
  '客队胜',
  '平局',
  '主队不败',
  '客队不败',
  '不进主推池',
]

function toNumber(value, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

function round(value, digits = 0) {
  const factor = 10 ** digits
  return Math.round(toNumber(value, 0) * factor) / factor
}

function safeText(value, fallback = '') {
  const text = String(value ?? '').trim()
  return text || fallback
}

function getTeamName(match, side) {
  const team = match?.[`${side}Team`]

  return safeText(
    match?.[`${side}TeamName`] ??
      match?.[`${side}TeamDisplayName`] ??
      team?.name ??
      team?.shortName ??
      team,
    side === 'home' ? '主队' : '客队',
  )
}

function getMatchId(match) {
  const id = safeText(match?.id ?? match?.matchId, '')
  if (id) return id

  return `${getTeamName(match, 'home')}-${getTeamName(match, 'away')}`
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function getKickoff(match) {
  return safeText(match?.kickoff ?? match?.kickoffTime ?? match?.startTime, '')
}

function getOdds(match) {
  const odds = match?.odds ?? {}
  const localOdds = match?.localOdds ?? {}

  return {
    home: toNumber(odds.home ?? odds.homeWin ?? localOdds.homeWin, 0),
    draw: toNumber(odds.draw ?? localOdds.draw, 0),
    away: toNumber(odds.away ?? odds.awayWin ?? localOdds.awayWin, 0),
    over25: toNumber(odds.over25 ?? localOdds.over25, 0),
    under25: toNumber(odds.under25 ?? localOdds.under25, 0),
  }
}

function hasCompleteWdlOdds(odds) {
  return odds.home > 1 && odds.draw > 1 && odds.away > 1
}

function normalizeProbabilities(values) {
  const entries = Object.entries(values).map(([key, value]) => [
    key,
    Math.max(toNumber(value, 0), 0),
  ])
  const sum = entries.reduce((total, [, value]) => total + value, 0)

  if (sum <= 0) {
    return { home: 0.36, draw: 0.28, away: 0.36 }
  }

  return Object.fromEntries(entries.map(([key, value]) => [key, value / sum]))
}

function getTeamMetric(match, side, key, fallback = 50) {
  const team = match?.[`${side}Team`] ?? {}
  const globalTeam = match?.[`global${side === 'home' ? 'Home' : 'Away'}Team`] ?? {}

  return clamp(toNumber(team[key] ?? globalTeam[key], fallback), 0, 100)
}

function getTeamIndex(match, side) {
  const strength = getTeamMetric(match, side, 'teamStrength')
  const recentForm = getTeamMetric(match, side, 'recentForm')
  const attack = getTeamMetric(match, side, 'attackRating')
  const defense = getTeamMetric(match, side, 'defenseRating')
  const morale = getTeamMetric(match, side, 'morale')
  const fatigue = getTeamMetric(match, side, 'fatigue')
  const injuryRisk = getTeamMetric(match, side, 'injuryRisk')

  return (
    strength * 0.34 +
    recentForm * 0.18 +
    attack * 0.18 +
    defense * 0.2 +
    morale * 0.06 -
    Math.max(fatigue - 50, 0) * 0.04 -
    Math.max(injuryRisk - 50, 0) * 0.04
  )
}

function getModelProbabilities(match, odds, teamGap) {
  const model = match?.model ?? {}

  if (
    Number.isFinite(model.home) &&
    Number.isFinite(model.draw) &&
    Number.isFinite(model.away)
  ) {
    return normalizeProbabilities({
      home: model.home,
      draw: model.draw,
      away: model.away,
    })
  }

  if (hasCompleteWdlOdds(odds)) {
    return normalizeProbabilities({
      home: 1 / odds.home,
      draw: 1 / odds.draw,
      away: 1 / odds.away,
    })
  }

  const home = clamp(0.36 + teamGap * 0.006, 0.16, 0.68)
  const away = clamp(0.34 - teamGap * 0.006, 0.16, 0.68)
  const draw = clamp(0.3 - Math.abs(teamGap) * 0.002, 0.2, 0.34)

  return normalizeProbabilities({ home, draw, away })
}

function getTotalGoalProbabilities(match, odds) {
  const totalModel = match?.totalGoals?.model ?? {}

  if (
    Number.isFinite(totalModel.over25Probability) &&
    Number.isFinite(totalModel.under25Probability)
  ) {
    return normalizeProbabilities({
      over25: totalModel.over25Probability,
      under25: totalModel.under25Probability,
    })
  }

  if (odds.over25 > 1 && odds.under25 > 1) {
    return normalizeProbabilities({
      over25: 1 / odds.over25,
      under25: 1 / odds.under25,
    })
  }

  return { over25: 0.5, under25: 0.5 }
}

function getBestOutcome(probabilities) {
  return ['home', 'draw', 'away'].reduce((best, key) =>
    probabilities[key] > probabilities[best] ? key : best,
  )
}

function getDataConfidence(match, odds) {
  let confidence = 35

  if (hasCompleteWdlOdds(odds)) confidence += 22
  if (odds.over25 > 1 && odds.under25 > 1) confidence += 10
  if (match?.model && Number.isFinite(match.model.home)) confidence += 18
  if (match?.homeTeam && match?.awayTeam) confidence += 10
  if (Array.isArray(match?.scoreLeans) && match.scoreLeans.length) confidence += 5

  return clamp(round(confidence), 0, 100)
}

function getVolatility(match, probabilities, teamGap) {
  const contextRisk = toNumber(match?.contextRisk ?? match?.risk?.score, 45)
  const closeGamePressure = clamp(70 - Math.abs(teamGap) * 3, 0, 70)
  const probabilitySpread =
    Math.max(probabilities.home, probabilities.draw, probabilities.away) -
    Math.min(probabilities.home, probabilities.draw, probabilities.away)

  return clamp(round(contextRisk * 0.55 + closeGamePressure * 0.35 + (1 - probabilitySpread) * 20), 0, 100)
}

function getFavoritePressure(odds, probabilities, bestOutcome) {
  const bestOdd = odds[bestOutcome] || 0
  const bestProbability = probabilities[bestOutcome] ?? 0
  const lowPricePressure = bestOdd > 1 ? clamp((1.72 - bestOdd) * 55, 0, 35) : 8
  const probabilityPressure = clamp((bestProbability - 0.48) * 90, 0, 35)

  return clamp(round(lowPricePressure + probabilityPressure + 20), 0, 100)
}

function getDrawPressure(probabilities, teamGap, volatility) {
  const drawProbability = probabilities.draw ?? 0
  const closeGameBoost = clamp(28 - Math.abs(teamGap) * 2, 0, 28)

  return clamp(round(drawProbability * 100 + closeGameBoost + volatility * 0.12), 0, 100)
}

function getMatchType({
  bestOutcome,
  dataConfidence,
  drawPressure,
  favoritePressure,
  probabilities,
  teamGap,
  totalProbabilities,
  volatility,
}) {
  if (dataConfidence < 45) return '信息不足局'

  if (
    (bestOutcome === 'home' && teamGap < -10) ||
    (bestOutcome === 'away' && teamGap > 10)
  ) {
    return '方向冲突局'
  }

  if (drawPressure >= 66 && Math.abs(teamGap) <= 7) return '平局保护局'
  if (volatility >= 72) return '冷门波动局'

  const bestProbability = probabilities[bestOutcome] ?? 0
  if (favoritePressure >= 68 && bestProbability >= 0.53) return '强队过热局'
  if (totalProbabilities.over25 >= 0.58) return '对攻大球局'
  if (Math.abs(teamGap) >= 13 && bestOutcome !== 'draw') return '强队稳压局'

  return '低比分胶着局'
}

function getScores({ dataConfidence, drawPressure, favoritePressure, match, probabilities, teamGap, volatility }) {
  const strengthGap = clamp(round(Math.abs(teamGap) * 3.2 + 42), 0, 100)
  const formGap = Math.abs(
    getTeamMetric(match, 'home', 'recentForm') - getTeamMetric(match, 'away', 'recentForm'),
  )
  const recentForm = clamp(round(50 + formGap * 1.6), 0, 100)
  const lineup = clamp(round(dataConfidence * 0.7 + 18), 0, 100)
  const attackDefenseGap = Math.abs(
    getTeamMetric(match, 'home', 'attackRating') -
      getTeamMetric(match, 'away', 'defenseRating'),
  )
  const matchup = clamp(round(48 + attackDefenseGap * 1.4 + Math.abs(teamGap)), 0, 100)
  const bestOutcome = getBestOutcome(probabilities)
  const marketTone = clamp(round((probabilities[bestOutcome] ?? 0) * 100 + 18), 0, 100)
  const upsetPenalty = clamp(round(volatility * 0.16 + (favoritePressure >= 70 ? 5 : 0)), 0, 22)
  const drawPenalty = clamp(round(drawPressure * 0.12), 0, 16)
  const dataPenalty = clamp(round((100 - dataConfidence) * 0.16), 0, 18)
  const internalScore = clamp(
    round(
      30 +
        strengthGap * 0.2 +
        recentForm * 0.11 +
        lineup * 0.1 +
        matchup * 0.13 +
        marketTone * 0.24 -
        upsetPenalty -
        drawPenalty -
        dataPenalty,
    ),
    0,
    100,
  )

  return {
    internalScore,
    strengthGap,
    recentForm,
    lineup,
    matchup,
    marketTone,
    upsetPenalty,
    drawPenalty,
    dataPenalty,
  }
}

function getConfidenceBand(score) {
  if (score >= 85) return 'A'
  if (score >= 78) return 'B+'
  if (score >= 70) return 'B'
  if (score >= 62) return 'C+'
  if (score >= 55) return 'C'
  return 'D'
}

function getMainPick({ bestOutcome, drawPressure, favoritePressure, internalScore, matchType, probabilities, teamGap }) {
  if (internalScore < 55 || matchType === '方向冲突局') return '不进主推池'

  if (drawPressure >= 66 && Math.abs(teamGap) <= 7) return '平局'

  if (bestOutcome === 'home') {
    if (
      internalScore >= 82 &&
      probabilities.home >= 0.56 &&
      teamGap >= 12 &&
      favoritePressure < 70
    ) {
      return '主队胜'
    }

    return '主队不败'
  }

  if (bestOutcome === 'away') {
    if (
      internalScore >= 82 &&
      probabilities.away >= 0.56 &&
      teamGap <= -12 &&
      favoritePressure < 70
    ) {
      return '客队胜'
    }

    return '客队不败'
  }

  return '平局'
}

function getPickType(mainPick) {
  if (mainPick === '主队胜' || mainPick === '客队胜' || mainPick === '平局') {
    return '胜平负'
  }
  if (mainPick === '主队不败' || mainPick === '客队不败') {
    return '不败保护'
  }
  return '内部观察'
}

function getDecisionCopy(mainPick, homeTeam, awayTeam) {
  if (mainPick === '主队胜') {
    return { attackPick: `${homeTeam}胜`, coverPick: '平局防守' }
  }
  if (mainPick === '客队胜') {
    return { attackPick: `${awayTeam}胜`, coverPick: '平局防守' }
  }
  if (mainPick === '主队不败') {
    return { attackPick: `${homeTeam}胜`, coverPick: '平局防守' }
  }
  if (mainPick === '客队不败') {
    return { attackPick: `${awayTeam}胜`, coverPick: '平局防守' }
  }
  if (mainPick === '平局') {
    return { attackPick: '平局拉锯', coverPick: '低比分防守' }
  }

  return { attackPick: '不进主推池', coverPick: '内部观察' }
}

function parseScore(score) {
  const match = safeText(score).match(/^(\d{1,2})-(\d{1,2})$/)
  if (!match) return { home: 0, away: 0, total: 0, outcome: 'draw', valid: false }

  const home = toNumber(match[1], 0)
  const away = toNumber(match[2], 0)

  return {
    home,
    away,
    total: home + away,
    outcome: home > away ? 'home' : home < away ? 'away' : 'draw',
    valid: true,
  }
}

function deriveTotalGoals(primaryScore, secondaryScore) {
  const totals = [parseScore(primaryScore).total, parseScore(secondaryScore).total]
  const minTotal = Math.min(...totals)
  const maxTotal = Math.max(...totals)

  if (maxTotal <= 2) return minTotal === 0 ? '0-2球' : '1-2球'
  if (minTotal >= 3) return '3球以上'
  return '2-3球'
}

function deriveOverUnder(primaryScore, secondaryScore) {
  const totals = [parseScore(primaryScore).total, parseScore(secondaryScore).total]

  if (totals.every((total) => total <= 2)) return '小 2.5'
  if (totals.every((total) => total >= 3)) return '大 2.5'
  return '2.5球分界'
}

function getScorePair(mainPick, totalProbabilities, matchType) {
  const wantsOver = matchType === '对攻大球局' || totalProbabilities.over25 >= 0.58
  const wantsUnder =
    ['低比分胶着局', '平局保护局', '信息不足局'].includes(matchType) ||
    totalProbabilities.under25 >= 0.56

  if (mainPick === '主队胜') {
    return wantsOver ? ['2-1', '3-1'] : ['1-0', '2-0']
  }
  if (mainPick === '客队胜') {
    return wantsOver ? ['1-2', '1-3'] : ['0-1', '0-2']
  }
  if (mainPick === '主队不败') {
    return wantsUnder ? ['1-0', '1-1'] : ['2-1', '1-1']
  }
  if (mainPick === '客队不败') {
    return wantsUnder ? ['0-1', '1-1'] : ['1-2', '1-1']
  }
  if (mainPick === '平局') {
    return wantsOver ? ['2-2', '1-1'] : ['1-1', '0-0']
  }

  return wantsOver ? ['1-2', '2-2'] : ['1-1', '0-0']
}

function buildPredictions(mainPick, totalProbabilities, matchType) {
  let [primaryScore, secondaryScore] = getScorePair(mainPick, totalProbabilities, matchType)

  if (primaryScore === secondaryScore) {
    secondaryScore = primaryScore === '1-1' ? '0-0' : '1-1'
  }

  return {
    primaryScore,
    secondaryScore,
    totalGoals: deriveTotalGoals(primaryScore, secondaryScore),
    overUnder: deriveOverUnder(primaryScore, secondaryScore),
  }
}

function scoreFitsMainPick(score, mainPick) {
  const parsed = parseScore(score)
  if (!parsed.valid) return false

  if (mainPick === '主队胜') return parsed.outcome === 'home'
  if (mainPick === '客队胜') return parsed.outcome === 'away'
  if (mainPick === '主队不败') return parsed.outcome !== 'away'
  if (mainPick === '客队不败') return parsed.outcome !== 'home'
  if (mainPick === '平局') return parsed.outcome === 'draw'
  return true
}

export function checkV3Consistency({ bankroll, decision, predictions, stakePlan }) {
  const conflictReasons = []
  const primary = parseScore(predictions?.primaryScore)
  const secondary = parseScore(predictions?.secondaryScore)
  const mainPick = decision?.mainPick ?? '不进主推池'
  const directionAligned =
    mainPick === '平局'
      ? primary.outcome === 'draw' || secondary.outcome === 'draw'
      : scoreFitsMainPick(predictions?.primaryScore, mainPick) &&
        scoreFitsMainPick(predictions?.secondaryScore, mainPick)

  if (!directionAligned) {
    conflictReasons.push('主方向与比分结果不一致')
  }

  const scoreAligned =
    primary.valid &&
    secondary.valid &&
    predictions.primaryScore !== predictions.secondaryScore
  if (!scoreAligned) {
    conflictReasons.push('两个比分缺失或重复')
  }

  const expectedTotalGoals = deriveTotalGoals(
    predictions?.primaryScore,
    predictions?.secondaryScore,
  )
  const totalGoalsAligned = predictions?.totalGoals === expectedTotalGoals
  if (!totalGoalsAligned) {
    conflictReasons.push('总进球区间与比分不一致')
  }

  const expectedOverUnder = deriveOverUnder(
    predictions?.primaryScore,
    predictions?.secondaryScore,
  )
  const overUnderAligned = predictions?.overUnder === expectedOverUnder
  if (!overUnderAligned) {
    conflictReasons.push('大小球方向与比分不一致')
  }

  let stakeAligned = true
  if (stakePlan) {
    const itemSum = (stakePlan.stakeItems ?? []).reduce(
      (sum, item) => sum + toNumber(item.stake, 0),
      0,
    )
    const cap = round(toNumber(bankroll, DEFAULT_V3_BANKROLL) * 0.05)

    stakeAligned =
      itemSum === stakePlan.totalStake &&
      stakePlan.totalStake <= cap &&
      (predictions?.overUnder !== '2.5球分界' || stakePlan.overUnderStake === 0) &&
      (mainPick !== '不进主推池' || stakePlan.totalStake === 0)

    if (!stakeAligned) {
      conflictReasons.push('资金上限或大小球分界投入不一致')
    }
  }

  return {
    directionAligned,
    scoreAligned,
    totalGoalsAligned,
    overUnderAligned,
    stakeAligned,
    hasConflict: conflictReasons.length > 0,
    conflictReasons,
  }
}

function buildExplanations({ dataConfidence, mainPick, matchType, scores }) {
  const hardReasons = [
    `比赛类型锁定为${matchType}`,
    `内部评分${scores.internalScore}，执行口径为${getV3DecisionLevel(scores.internalScore)}`,
    `主判结论固定为${mainPick}`,
  ]
  const rejectReasons = []

  if (scores.upsetPenalty >= 14) rejectReasons.push('冷门波动扣分偏高')
  if (scores.drawPenalty >= 12) rejectReasons.push('平局压力需要保护')
  if (dataConfidence < 55) rejectReasons.push('信息完整度不足，压低资金上限')
  if (mainPick === '不进主推池') rejectReasons.push('内部评分未达主推池阈值')

  return {
    hardReasons,
    rejectReasons,
    oneLineInternal: `${matchType}，${mainPick}，资金按内部模拟规则执行。`,
  }
}

export function buildV3InternalAnalysis(match, options = {}) {
  const previousLedger = options.previousLedger ?? {}
  const bankroll = Math.max(
    round(options.bankroll ?? previousLedger.currentBankroll ?? DEFAULT_V3_BANKROLL),
    0,
  )
  const homeTeam = getTeamName(match, 'home')
  const awayTeam = getTeamName(match, 'away')
  const teamGap = getTeamIndex(match, 'home') - getTeamIndex(match, 'away')
  const odds = getOdds(match)
  const probabilities = getModelProbabilities(match, odds, teamGap)
  const totalProbabilities = getTotalGoalProbabilities(match, odds)
  const bestOutcome = getBestOutcome(probabilities)
  const dataConfidence = getDataConfidence(match, odds)
  const volatility = getVolatility(match, probabilities, teamGap)
  const favoritePressure = getFavoritePressure(odds, probabilities, bestOutcome)
  const drawPressure = getDrawPressure(probabilities, teamGap, volatility)
  const matchType = getMatchType({
    bestOutcome,
    dataConfidence,
    drawPressure,
    favoritePressure,
    probabilities,
    teamGap,
    totalProbabilities,
    volatility,
  })
  const profile = {
    matchType,
    tempo:
      totalProbabilities.over25 >= 0.58
        ? '快节奏'
        : totalProbabilities.under25 >= 0.56
          ? '慢节奏'
          : '中节奏',
    volatility,
    drawPressure,
    favoritePressure,
    dataConfidence,
  }
  const scores = getScores({
    dataConfidence,
    drawPressure,
    favoritePressure,
    match,
    probabilities,
    teamGap,
    volatility,
  })
  const mainPick = getMainPick({
    bestOutcome,
    drawPressure,
    favoritePressure,
    internalScore: scores.internalScore,
    matchType,
    probabilities,
    teamGap,
  })
  const decisionCopy = getDecisionCopy(mainPick, homeTeam, awayTeam)
  const rawDecisionLevel =
    mainPick === '不进主推池' ? '不进主推池' : getV3DecisionLevel(scores.internalScore)
  const decision = {
    mainPick,
    pickType: getPickType(mainPick),
    attackPick: decisionCopy.attackPick,
    coverPick: decisionCopy.coverPick,
    confidenceBand: getConfidenceBand(scores.internalScore),
    decisionLevel: matchType === '信息不足局' && rawDecisionLevel !== '不进主推池'
      ? '内部观察'
      : rawDecisionLevel,
    executionMode:
      mainPick === '不进主推池'
        ? '不进主推池'
        : matchType === '信息不足局'
          ? '内部观察'
          : rawDecisionLevel,
  }
  const predictions = buildPredictions(mainPick, totalProbabilities, matchType)
  const draftConsistency = checkV3Consistency({
    bankroll,
    decision,
    predictions,
    stakePlan: null,
  })
  let stakePlan = buildStakePlanV3({
    bankrollBefore: bankroll,
    profile,
    scores,
    decision,
    predictions,
    consistency: draftConsistency,
  }, options)
  let consistency = checkV3Consistency({
    bankroll,
    decision,
    predictions,
    stakePlan,
  })

  if (consistency.hasConflict && stakePlan.totalStake > 0) {
    stakePlan = buildStakePlanV3({
      bankrollBefore: bankroll,
      profile,
      scores,
      decision: {
        ...decision,
        decisionLevel: decision.decisionLevel === '强推候选' ? '内部观察' : decision.decisionLevel,
      },
      predictions,
      consistency,
    }, {
      ...options,
      forceNoStake: true,
    })
    consistency = checkV3Consistency({
      bankroll,
      decision,
      predictions,
      stakePlan,
    })
  }

  return {
    version: VERSION,
    matchInfo: {
      matchId: getMatchId(match),
      matchName: `${homeTeam} vs ${awayTeam}`,
      homeTeam,
      awayTeam,
      kickoff: getKickoff(match),
    },
    profile,
    scores,
    decision,
    predictions,
    stakePlan,
    explanations: buildExplanations({
      dataConfidence,
      mainPick,
      matchType,
      scores,
    }),
    consistency,
  }
}

export { MAIN_PICK_TYPES, VERSION as V3_INTERNAL_VERSION }

export default buildV3InternalAnalysis
