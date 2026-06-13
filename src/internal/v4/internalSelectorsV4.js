import {
  RECORD_STATUS_V4,
  TRUSTED_SCORE_SOURCES_V4,
} from './internalTypesV4.js'

export function toFiniteNumber(value, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

export function clampNumber(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

export function roundTo(value, digits = 2) {
  const factor = 10 ** digits
  return Math.round(toFiniteNumber(value) * factor) / factor
}

export function compactText(value) {
  const text = String(value ?? '').trim()
  return text || null
}

function slugify(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/gi, '-')
    .replace(/^-+|-+$/g, '')
}

export function getTeamNameV4(match, side) {
  const team = match?.[`${side}Team`]
  return (
    compactText(team?.name) ??
    compactText(team?.displayName) ??
    compactText(team?.shortName) ??
    compactText(match?.[`${side}TeamName`]) ??
    compactText(match?.[`${side}TeamDisplayName`]) ??
    compactText(match?.[`${side}TeamId`]) ??
    (side === 'home' ? '主队' : '客队')
  )
}

export function getTeamShortNameV4(match, side) {
  const team = match?.[`${side}Team`]
  return (
    compactText(team?.shortName) ??
    compactText(team?.name) ??
    compactText(match?.[`${side}TeamShortName`]) ??
    getTeamNameV4(match, side)
  )
}

export function getKickoffV4(match) {
  return (
    compactText(match?.kickoff) ??
    compactText(match?.utcDate) ??
    compactText(match?.matchTime) ??
    ''
  )
}

export function getKickoffTimeV4(match) {
  const kickoff = getKickoffV4(match)
  const time = kickoff ? new Date(kickoff).getTime() : NaN
  return Number.isFinite(time) ? time : null
}

export function isFutureKickoffV4(match, now = new Date()) {
  const kickoffTime = getKickoffTimeV4(match)
  return kickoffTime !== null && kickoffTime > now.getTime()
}

export function getMatchIdV4(match) {
  const explicitId =
    compactText(match?.id) ??
    compactText(match?.matchId) ??
    compactText(match?.uiKey)
  if (explicitId) return explicitId

  const fallback = [
    getTeamNameV4(match, 'home'),
    getTeamNameV4(match, 'away'),
    getKickoffV4(match),
  ]
    .map(slugify)
    .filter(Boolean)
    .join('-')

  return fallback || `match-${Date.now()}`
}

export function getRecordIdV4(matchOrId) {
  const matchId =
    typeof matchOrId === 'string' ? matchOrId : getMatchIdV4(matchOrId)
  return `v5-${matchId}`
}

export function getMatchNameV4(match) {
  return `${getTeamShortNameV4(match, 'home')} vs ${getTeamShortNameV4(match, 'away')}`
}

export function getStatusV4(match) {
  return compactText(match?.status)?.toLowerCase() ?? 'scheduled'
}

export function isFinishedStatusV4(match) {
  const rawStatus = compactText(match?.status)
  const status = rawStatus?.toLowerCase()
  return (
    status === 'finished' ||
    status === 'ft' ||
    rawStatus === 'FINISHED' ||
    rawStatus === 'FT' ||
    rawStatus === '已完赛'
  )
}

function normalizeScoreCandidate(score, source) {
  const home = Number(score?.home)
  const away = Number(score?.away)
  if (!Number.isInteger(home) || !Number.isInteger(away) || home < 0 || away < 0) {
    return null
  }
  return { home, away, source }
}

export function getTrustedActualScoreV4(match, now = new Date()) {
  if (!isFinishedStatusV4(match)) {
    return {
      score: null,
      trusted: false,
      reason: 'status-not-finished',
      source: null,
    }
  }

  if (isFutureKickoffV4(match, now)) {
    return {
      score: null,
      trusted: false,
      reason: 'future-kickoff',
      source: null,
    }
  }

  const candidates = [
    normalizeScoreCandidate(match?.actualScore, 'actual'),
    normalizeScoreCandidate(match?.result, 'result'),
    normalizeScoreCandidate(match?.fullTime, 'fullTime'),
    normalizeScoreCandidate(match?.final, 'final'),
    normalizeScoreCandidate(match?.finalScore, 'final'),
  ].filter(Boolean)

  const explicitSource = compactText(match?.scoreSource)
  const explicitScore = normalizeScoreCandidate(match?.score, explicitSource)
  if (
    explicitScore &&
    explicitSource &&
    TRUSTED_SCORE_SOURCES_V4.includes(explicitSource)
  ) {
    candidates.push(explicitScore)
  }

  const score = candidates.find((candidate) =>
    TRUSTED_SCORE_SOURCES_V4.includes(candidate.source),
  )

  if (!score) {
    return {
      score: null,
      trusted: false,
      reason: 'missing-trusted-final-score',
      source: explicitSource ?? null,
    }
  }

  return {
    score: { home: score.home, away: score.away },
    trusted: true,
    reason: 'trusted-final-score',
    source: score.source,
  }
}

export function getActualScoreFromMatchV4(match) {
  return getTrustedActualScoreV4(match).score
}

export function getScoreTextV4(score) {
  if (!score) return '-'
  return `${toFiniteNumber(score.home, 0)}-${toFiniteNumber(score.away, 0)}`
}

export function getOddsV4(match) {
  const embedded = match?.odds ?? {}
  const local = match?.localOdds ?? {}
  const odds = {
    home: toFiniteNumber(embedded.home ?? local.homeWin ?? local.home),
    draw: toFiniteNumber(embedded.draw ?? local.draw),
    away: toFiniteNumber(embedded.away ?? local.awayWin ?? local.away),
    over25: toFiniteNumber(embedded.over25 ?? local.over25),
    under25: toFiniteNumber(embedded.under25 ?? local.under25),
  }

  return {
    ...odds,
    hasOneXTwo: odds.home > 1 && odds.draw > 1 && odds.away > 1,
    hasTotals: odds.over25 > 1 && odds.under25 > 1,
    source: match?.localOdds ? 'localSnapshot' : match?.odds ? 'embedded' : 'missing',
  }
}

function probabilitiesFromOdds(odds, keys) {
  const raw = Object.fromEntries(
    keys.map((key) => [key, odds[key] > 1 ? 1 / odds[key] : 0]),
  )
  const sum = keys.reduce((total, key) => total + raw[key], 0)
  if (!sum) {
    const equal = 1 / keys.length
    return Object.fromEntries(keys.map((key) => [key, equal]))
  }

  return Object.fromEntries(keys.map((key) => [key, raw[key] / sum]))
}

export function getMarketProbabilitiesV4(match, odds = getOddsV4(match)) {
  const explicit = match?.market?.probabilities
  if (
    explicit &&
    Number.isFinite(explicit.home) &&
    Number.isFinite(explicit.draw) &&
    Number.isFinite(explicit.away)
  ) {
    return {
      home: explicit.home,
      draw: explicit.draw,
      away: explicit.away,
    }
  }

  return probabilitiesFromOdds(odds, ['home', 'draw', 'away'])
}

export function getModelProbabilitiesV4(match, market = getMarketProbabilitiesV4(match)) {
  const explicit = match?.model
  if (
    explicit &&
    Number.isFinite(explicit.home) &&
    Number.isFinite(explicit.draw) &&
    Number.isFinite(explicit.away)
  ) {
    return {
      home: explicit.home,
      draw: explicit.draw,
      away: explicit.away,
    }
  }

  return { ...market }
}

export function getTotalGoalsModelV4(match, odds = getOddsV4(match)) {
  const explicit = match?.totalGoals?.model
  if (
    explicit &&
    Number.isFinite(explicit.over25Probability) &&
    Number.isFinite(explicit.under25Probability)
  ) {
    return {
      over25: explicit.over25Probability,
      under25: explicit.under25Probability,
    }
  }

  if (odds.hasTotals) {
    return probabilitiesFromOdds(odds, ['over25', 'under25'])
  }

  return {
    over25: 0.5,
    under25: 0.5,
  }
}

export function getTeamMetricV4(match, side, key, fallback = 50) {
  const team = match?.[`${side}Team`]
  return clampNumber(
    toFiniteNumber(team?.[key] ?? match?.[`${side}${key}`], fallback),
    0,
    100,
  )
}

export function getStrengthGapV4(match) {
  return (
    getTeamMetricV4(match, 'home', 'teamStrength') -
    getTeamMetricV4(match, 'away', 'teamStrength')
  )
}

export function getAttackTempoV4(match) {
  const homeAttack = getTeamMetricV4(match, 'home', 'attackRating')
  const awayAttack = getTeamMetricV4(match, 'away', 'attackRating')
  const homeDefense = getTeamMetricV4(match, 'home', 'defenseRating')
  const awayDefense = getTeamMetricV4(match, 'away', 'defenseRating')
  return clampNumber(
    (homeAttack + awayAttack + (200 - homeDefense - awayDefense)) / 4,
    0,
    100,
  )
}

export function getContextRiskV4(match) {
  return clampNumber(toFiniteNumber(match?.contextRisk ?? match?.risk?.score, 45), 0, 100)
}

export function getBestOutcomeV4(values) {
  return ['home', 'draw', 'away'].reduce((best, key) =>
    values[key] > values[best] ? key : best,
  )
}

export function getLowestOddOutcomeV4(odds) {
  const available = ['home', 'draw', 'away'].filter((key) => odds[key] > 1)
  if (!available.length) return 'draw'
  return available.reduce((best, key) => (odds[key] < odds[best] ? key : best))
}

export function mapOutcomeToMainPickV4(outcome, edgeScore = 0) {
  if (outcome === 'home') return edgeScore >= 14 ? '主队胜' : '主队不败'
  if (outcome === 'away') return edgeScore >= 14 ? '客队胜' : '客队不败'
  return '平局'
}

export function getScoreOutcomeV4(scoreText) {
  const [homeRaw, awayRaw] = String(scoreText ?? '')
    .split('-')
    .map((part) => Number(part))
  if (!Number.isFinite(homeRaw) || !Number.isFinite(awayRaw)) return null
  if (homeRaw > awayRaw) return 'home'
  if (awayRaw > homeRaw) return 'away'
  return 'draw'
}

export function getScoreTotalGoalsV4(scoreText) {
  const [homeRaw, awayRaw] = String(scoreText ?? '')
    .split('-')
    .map((part) => Number(part))
  if (!Number.isFinite(homeRaw) || !Number.isFinite(awayRaw)) return 0
  return homeRaw + awayRaw
}

export function formatKickoffV4(value) {
  const date = value ? new Date(value) : null
  if (!date || Number.isNaN(date.getTime())) return '时间待定'
  return date.toLocaleString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    month: '2-digit',
    day: '2-digit',
  })
}

export function getRecordLifecycleStatusV4(match, record = null, now = new Date()) {
  if (record?.status === RECORD_STATUS_V4.settledAuto) return RECORD_STATUS_V4.settledAuto
  if (record?.status === RECORD_STATUS_V4.settledManual) return RECORD_STATUS_V4.settledManual
  if (isFutureKickoffV4(match, now)) return RECORD_STATUS_V4.upcoming
  if (isFinishedStatusV4(match)) return RECORD_STATUS_V4.pendingSettlement
  const status = getStatusV4(match)
  if (status === 'live' || status === 'in_play' || status === 'playing') {
    return RECORD_STATUS_V4.liveOrUnknown
  }
  return RECORD_STATUS_V4.liveOrUnknown
}

export function normalizeMatchForV4(match) {
  return {
    id: getMatchIdV4(match),
    name: getMatchNameV4(match),
    matchName: getMatchNameV4(match),
    homeTeam: getTeamNameV4(match, 'home'),
    awayTeam: getTeamNameV4(match, 'away'),
    kickoff: getKickoffV4(match),
    status: getStatusV4(match),
  }
}
