const OUTCOMES = ['home', 'draw', 'away']

const MAIN_PICK_OUTCOME = {
  主队胜: 'home',
  主队不败: 'home',
  客队胜: 'away',
  客队不败: 'away',
  平局: 'draw',
}

const SCORE_NOTE = '量化比分候选：由期望进球、方向强弱、大小球信号和风险约束共同生成。'

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

function round(value, digits = 2) {
  const factor = 10 ** digits
  return Math.round(Number(value || 0) * factor) / factor
}

function toNumber(value, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function getTeamMetric(match, side, key, fallback = 50) {
  const team = match?.[`${side}Team`]
  return clamp(toNumber(team?.[key] ?? match?.[`${side}${key}`], fallback), 0, 100)
}

function getOdds(match) {
  const embedded = match?.odds ?? {}
  const local = match?.localOdds ?? {}
  const home = toNumber(embedded.home ?? local.homeWin ?? local.home, 0)
  const draw = toNumber(embedded.draw ?? local.draw, 0)
  const away = toNumber(embedded.away ?? local.awayWin ?? local.away, 0)
  const over25 = toNumber(embedded.over25 ?? local.over25, 0)
  const under25 = toNumber(embedded.under25 ?? local.under25, 0)

  return {
    home,
    draw,
    away,
    over25,
    under25,
    hasOneXTwo: home > 1 && draw > 1 && away > 1,
    hasTotals: over25 > 1 && under25 > 1,
  }
}

function probabilitiesFromOdds(odds, keys) {
  const raw = Object.fromEntries(keys.map((key) => [key, odds[key] > 1 ? 1 / odds[key] : 0]))
  const sum = keys.reduce((total, key) => total + raw[key], 0)
  if (!sum) {
    const even = 1 / keys.length
    return Object.fromEntries(keys.map((key) => [key, even]))
  }
  return Object.fromEntries(keys.map((key) => [key, raw[key] / sum]))
}

function getModelProbabilities(match, market) {
  const model = match?.model ?? {}
  if (
    Number.isFinite(model.home) &&
    Number.isFinite(model.draw) &&
    Number.isFinite(model.away)
  ) {
    return {
      home: clamp(model.home, 0.01, 0.98),
      draw: clamp(model.draw, 0.01, 0.98),
      away: clamp(model.away, 0.01, 0.98),
    }
  }
  return { ...market }
}

function getTotalGoalsModel(match, odds) {
  const totalModel = match?.totalGoals?.model
  if (
    Number.isFinite(totalModel?.over25Probability) &&
    Number.isFinite(totalModel?.under25Probability)
  ) {
    return {
      over25: clamp(totalModel.over25Probability, 0.05, 0.95),
      under25: clamp(totalModel.under25Probability, 0.05, 0.95),
    }
  }
  if (odds.hasTotals) return probabilitiesFromOdds(odds, ['over25', 'under25'])
  return { over25: 0.5, under25: 0.5 }
}

function getStrengthGap(match) {
  return getTeamMetric(match, 'home', 'teamStrength') - getTeamMetric(match, 'away', 'teamStrength')
}

function getAttackTempo(match) {
  const homeAttack = getTeamMetric(match, 'home', 'attackRating')
  const awayAttack = getTeamMetric(match, 'away', 'attackRating')
  const homeDefense = getTeamMetric(match, 'home', 'defenseRating')
  const awayDefense = getTeamMetric(match, 'away', 'defenseRating')
  return clamp((homeAttack + awayAttack + (200 - homeDefense - awayDefense)) / 4, 0, 100)
}

function getStyleMismatch(match) {
  const homeAttack = getTeamMetric(match, 'home', 'attackRating')
  const awayAttack = getTeamMetric(match, 'away', 'attackRating')
  const homeDefense = getTeamMetric(match, 'home', 'defenseRating')
  const awayDefense = getTeamMetric(match, 'away', 'defenseRating')
  const homeChance = homeAttack - awayDefense
  const awayChance = awayAttack - homeDefense
  return { homeChance, awayChance, absolute: Math.max(Math.abs(homeChance), Math.abs(awayChance)) }
}

function normalizePreferredOutcome(value) {
  if (OUTCOMES.includes(value)) return value
  if (value === 'none') return 'draw'
  return MAIN_PICK_OUTCOME[value] ?? 'draw'
}

function getOutcomeFromScore(home, away) {
  if (home > away) return 'home'
  if (away > home) return 'away'
  return 'draw'
}

function factorial(value) {
  let result = 1
  for (let index = 2; index <= value; index += 1) result *= index
  return result
}

function poisson(lambda, goals) {
  const safeLambda = clamp(lambda, 0.08, 6)
  return (Math.exp(-safeLambda) * safeLambda ** goals) / factorial(goals)
}

function parseScoreText(value) {
  const match = String(value ?? '').trim().match(/^(\d+)-(\d+)$/)
  if (!match) return null
  const home = Number(match[1])
  const away = Number(match[2])
  if (!Number.isInteger(home) || !Number.isInteger(away) || home < 0 || away < 0) return null
  return { home, away, score: `${home}-${away}`, total: home + away, outcome: getOutcomeFromScore(home, away) }
}

function getSourceScores(match, options) {
  const explicit = Array.isArray(options.sourceScores) ? options.sourceScores : []
  const localScores = String(match?.localOdds?.scoreReference ?? '')
    .split('/')
    .map((item) => item.trim())
  const leanScores = Array.isArray(match?.scoreLeans)
    ? match.scoreLeans.map((item) => item?.score)
    : []

  return new Set(
    [...explicit, ...localScores, ...leanScores]
      .map(parseScoreText)
      .filter(Boolean)
      .map((score) => score.score),
  )
}

function getExpectedGoals(match, options, odds, model, totalModel) {
  const facts = options.facts ?? {}
  const strengthGap = toNumber(facts.strengthGap, getStrengthGap(match))
  const directionEdge = toNumber(
    facts.directionEdge,
    strengthGap + (model.home - model.away) * 42 + 3,
  )
  const attackTempo = toNumber(facts.attackTempo, getAttackTempo(match))
  const contextRisk = clamp(toNumber(facts.contextRisk, match?.contextRisk ?? match?.risk?.score ?? 45), 0, 100)
  const overUnderEdge = toNumber(facts.overUnderEdge, totalModel.over25 - totalModel.under25)
  const styleMismatch = getStyleMismatch(match)
  const drawPressure =
    model.draw * 100 + Math.max(0, 12 - Math.abs(strengthGap)) * 1.45 + Math.max(0, contextRisk - 55) * 0.08
  const marketFavorite = odds.hasOneXTwo
    ? OUTCOMES.reduce((best, key) => (odds[key] < odds[best] ? key : best), 'home')
    : normalizePreferredOutcome(options.preferredOutcome ?? options.mainPick)
  const marketHeat = odds.hasOneXTwo && marketFavorite !== 'draw' && odds[marketFavorite] <= 1.48 ? 0.18 : 0
  let expectedTotal =
    2.35 +
    (totalModel.over25 - 0.5) * 1.95 +
    (attackTempo - 50) * 0.021 +
    Math.max(0, styleMismatch.absolute - 18) * 0.012 +
    Math.max(0, contextRisk - 54) * 0.006 -
    marketHeat

  if (options.gameType === '低比分胶着局') expectedTotal = Math.min(expectedTotal, 2.05)
  if (options.gameType === '对攻大球局') expectedTotal = Math.max(expectedTotal, 3.18)
  if (options.gameType === '强队压制局' && Math.abs(directionEdge) >= 20 && attackTempo >= 58) {
    expectedTotal = Math.max(expectedTotal, 3.25)
  }
  if (options.gameType === '信息不足局') expectedTotal = expectedTotal * 0.88 + 0.22

  expectedTotal = clamp(expectedTotal, 0.85, 5.35)

  const preferredOutcome = normalizePreferredOutcome(options.preferredOutcome ?? options.mainPick)
  const drawClamp =
    preferredOutcome === 'draw' || options.gameType === '平局保护局'
      ? clamp(drawPressure / 100, 0.36, 0.68)
      : 0
  let homeShare =
    0.5 +
    directionEdge * 0.008 +
    (model.home - model.away) * 0.22 +
    (styleMismatch.homeChance - styleMismatch.awayChance) * 0.003
  if (drawClamp) homeShare = homeShare * (1 - drawClamp * 0.42) + 0.5 * drawClamp * 0.42
  homeShare = clamp(homeShare, 0.16, 0.84)

  return {
    attackTempo: round(attackTempo, 1),
    contextRisk: round(contextRisk, 1),
    directionEdge: round(directionEdge, 2),
    drawPressure: round(drawPressure, 1),
    expectedTotal: round(expectedTotal, 2),
    homeXg: round(clamp(expectedTotal * homeShare, 0.08, 5.1), 2),
    awayXg: round(clamp(expectedTotal * (1 - homeShare), 0.08, 5.1), 2),
    overUnderEdge: round(overUnderEdge, 3),
    preferredOutcome,
  }
}

function isScoreAllowed(candidate, options, isPrimary) {
  const mainPick = options.mainPick
  const gameType = options.gameType
  const outcome = candidate.outcome
  const total = candidate.total

  if (gameType === '低比分胶着局' && total > 2) return false
  if (mainPick === '主队胜') return isPrimary ? outcome === 'home' : outcome !== 'away'
  if (mainPick === '客队胜') return isPrimary ? outcome === 'away' : outcome !== 'home'
  if (mainPick === '平局') return outcome === 'draw' && total <= (gameType === '对攻大球局' ? 4 : 3)
  if (mainPick === '主队不败') {
    if (gameType === '平局保护局') return outcome !== 'away'
    return isPrimary ? outcome === 'home' : outcome !== 'away'
  }
  if (mainPick === '客队不败') {
    if (gameType === '平局保护局') return outcome !== 'home'
    return isPrimary ? outcome === 'away' : outcome !== 'home'
  }

  const preferred = normalizePreferredOutcome(options.preferredOutcome)
  if (preferred === 'home') return isPrimary ? outcome === 'home' : outcome !== 'away'
  if (preferred === 'away') return isPrimary ? outcome === 'away' : outcome !== 'home'
  if (preferred === 'draw') return isPrimary ? outcome === 'draw' : true
  return true
}

function scoreCandidate(candidate, context) {
  const { expected, options, sourceScores } = context
  const xgProbability = poisson(expected.homeXg, candidate.home) * poisson(expected.awayXg, candidate.away)
  const expectedTotalGap = Math.abs(candidate.total - expected.expectedTotal)
  const expectedSpreadGap = Math.abs(candidate.home - candidate.away - (expected.homeXg - expected.awayXg))
  const isPreferred = candidate.outcome === expected.preferredOutcome
  const isDrawProtection = options.gameType === '平局保护局' && candidate.outcome === 'draw'
  const highGoalBonus =
    options.gameType === '对攻大球局' && candidate.total >= 3
      ? 10
      : options.gameType === '强队压制局' && candidate.total >= 3 && candidate.outcome !== 'draw'
        ? 7
        : 0
  const lowGoalBonus = options.gameType === '低比分胶着局' && candidate.total <= 2 ? 12 : 0
  const sourceBonus = sourceScores.has(candidate.score) ? 4 : 0
  const upsetBonus =
    options.gameType === '冷门波动局' && candidate.outcome !== expected.preferredOutcome
      ? 5
      : 0

  return (
    xgProbability * 900 +
    (isPreferred ? 16 : 0) +
    (isDrawProtection ? 12 : 0) +
    highGoalBonus +
    lowGoalBonus +
    sourceBonus +
    upsetBonus -
    expectedTotalGap * 5.8 -
    expectedSpreadGap * 3.2 -
    Math.max(0, candidate.total - 5) * 9
  )
}

function buildCandidates(expected, options, sourceScores) {
  const maxGoal = expected.expectedTotal >= 4.15 ? 6 : 5
  const candidates = []

  for (let home = 0; home <= maxGoal; home += 1) {
    for (let away = 0; away <= maxGoal; away += 1) {
      const total = home + away
      if (total > 7) continue
      const outcome = getOutcomeFromScore(home, away)
      const score = `${home}-${away}`
      const candidate = { home, away, total, outcome, score }
      const rating = scoreCandidate(candidate, { expected, options, sourceScores })
      candidates.push({
        ...candidate,
        rating: round(rating, 2),
        sourceBoost: sourceScores.has(score),
      })
    }
  }

  return candidates.sort((a, b) => b.rating - a.rating)
}

function pickScores(candidates, options, expected) {
  const primary =
    candidates.find((candidate) => isScoreAllowed(candidate, options, true)) ??
    candidates[0] ??
    { score: '1-1', home: 1, away: 1, total: 2, outcome: 'draw', rating: 0, sourceBoost: false }
  const needsHigherGoalCover =
    options.gameType === '对攻大球局' ||
    options.gameType === '强队压制局' ||
    (options.gameType === '强队过热局' && expected.overUnderEdge >= -0.02) ||
    (Math.abs(expected.directionEdge) >= 15 &&
      expected.expectedTotal >= 2.35 &&
      expected.overUnderEdge >= -0.02)
  const needsExtremeGoalCover =
    expected.preferredOutcome !== 'draw' &&
    Math.abs(expected.directionEdge) >= 34 &&
    expected.expectedTotal >= 2.3 &&
    expected.overUnderEdge >= -0.04
  const coverMinTotal = needsExtremeGoalCover ? 4 : Math.max(3, primary.total + 1)
  const higherGoalCover = needsHigherGoalCover
    ? candidates.find(
        (candidate) =>
          candidate.score !== primary.score &&
          candidate.total >= coverMinTotal &&
          isScoreAllowed(candidate, options, false),
      )
    : null
  let secondary =
    higherGoalCover ??
    candidates.find(
      (candidate) =>
        candidate.score !== primary.score && isScoreAllowed(candidate, options, false),
    ) ??
    candidates.find((candidate) => candidate.score !== primary.score) ??
    { score: primary.score === '1-1' ? '0-0' : '1-1', home: 1, away: 1, total: 2, outcome: 'draw', rating: 0, sourceBoost: false }

  if (options.gameType === '平局保护局' && primary.outcome !== 'draw' && secondary.outcome !== 'draw') {
    secondary =
      candidates.find(
        (candidate) =>
          candidate.score !== primary.score &&
          candidate.outcome === 'draw' &&
          candidate.total <= 4,
      ) ?? secondary
  }

  return { primary, secondary }
}

function getOverUnder(primary, secondary) {
  const totals = [primary.total, secondary.total]
  if (totals.every((total) => total >= 3)) return '大2.5'
  if (totals.every((total) => total <= 2)) return '小2.5'
  return '2.5球分界'
}

function getTotalGoalsText(primary, secondary, expected) {
  const totals = [primary.total, secondary.total].sort((a, b) => a - b)
  if (totals[1] <= 1) return '0-1球'
  if (totals[1] <= 2) return '0-2球'
  if (totals[0] >= 4 || expected.expectedTotal >= 4.2) return '4球以上'
  if (totals[0] >= 3) return '3球以上'
  return '2-3球'
}

function getRiskNotes(expected, candidates, options) {
  const notes = []
  if (expected.contextRisk >= 66) notes.push('情境风险偏高，比分候选需要保留波动保护。')
  if (expected.drawPressure >= 42) notes.push('平局压力较高，至少保留一个拉锯比分。')
  if (Math.abs(expected.overUnderEdge) < 0.05) notes.push('大小球接近分界，进球方向不宜重仓。')
  if (options.gameType === '强队过热局') notes.push('热门过热，强队大胜候选只作保护路径。')
  if (!notes.length && candidates[0]) notes.push('候选分布稳定，优先采用最高评分比分。')
  return notes.slice(0, 3)
}

export function buildQuantScoreModel(match, options = {}) {
  const odds = getOdds(match)
  const market = odds.hasOneXTwo
    ? probabilitiesFromOdds(odds, OUTCOMES)
    : { home: 0.34, draw: 0.32, away: 0.34 }
  const model = getModelProbabilities(match, market)
  const totalModel = getTotalGoalsModel(match, odds)
  const sourceScores = getSourceScores(match, options)
  const normalizedOptions = {
    facts: options.facts,
    gameType: options.gameType ?? '',
    mainPick: options.mainPick ?? '',
    preferredOutcome: normalizePreferredOutcome(options.preferredOutcome ?? options.mainPick),
  }
  const expected = getExpectedGoals(match, normalizedOptions, odds, model, totalModel)
  const candidates = buildCandidates(expected, normalizedOptions, sourceScores)
  const { primary, secondary } = pickScores(candidates, normalizedOptions, expected)
  const overUnder = getOverUnder(primary, secondary)
  const totalGoalsText = getTotalGoalsText(primary, secondary, expected)

  return {
    version: 'quant-score-v1',
    primaryScore: primary.score,
    secondaryScore: secondary.score,
    totalGoalsText,
    overUnder,
    expectedGoals: expected,
    distribution: candidates.slice(0, 8).map((candidate, index) => ({
      rank: index + 1,
      score: candidate.score,
      total: candidate.total,
      outcome: candidate.outcome,
      rating: candidate.rating,
      sourceBoost: candidate.sourceBoost,
    })),
    riskNotes: getRiskNotes(expected, candidates, normalizedOptions),
    note: SCORE_NOTE,
  }
}

export function buildQuantScorePicks(match, options = {}) {
  const model = buildQuantScoreModel(match, options)
  return {
    model,
    picks: [
      {
        score: model.primaryScore,
        highVariance: true,
        modelRank: 1,
        note: SCORE_NOTE,
      },
      {
        score: model.secondaryScore,
        highVariance: true,
        modelRank: 2,
        note: SCORE_NOTE,
      },
    ],
  }
}
