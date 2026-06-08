const SCORE_BREAKDOWN_KEYS = [
  'valueEdge',
  'directionClarity',
  'strengthGap',
  'recentAttackDefense',
  'marketStability',
  'upsetElasticity',
  'heatPenalty',
  'infoPenalty',
]

const DATA_QUALITY_KEYS = [
  'marketMovement',
  'injuries',
  'expectedLineups',
  'teamProfile',
  'oddsUpdatedAt',
  'handicapStructured',
  'snapshotPersistence',
  'resultSettlement',
  'modelProbability',
  'oddsConfidence',
  'lineupCertainty',
  'rotationRisk',
  'injuryDataQuality',
]

const FORBIDDEN_INPUT_KEYS = new Set([
  'apikey',
  'authorization',
  'bankroll',
  'bookmaker',
  'bookmakers',
  'connectionstring',
  'databaseurl',
  'edge',
  'fixtures',
  'header',
  'headers',
  'internalanalysis',
  'markets',
  'odds',
  'openaiapikey',
  'providererror',
  'providererrors',
  'providererrorvalue',
  'raw',
  'rawresponse',
  'snapshot',
  'stake',
  'stakeplan',
  'totalstake',
])

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function normalizeKey(value) {
  return String(value ?? '')
    .replace(/[^a-z0-9]/gi, '')
    .toLowerCase()
}

function safeText(value, maxLength = 500) {
  if (typeof value !== 'string') return null
  const text = value.trim()
  return text ? text.slice(0, maxLength) : null
}

function safeNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function safeBoolean(value) {
  return value === true
}

function safeStringList(value, maxItems = 8, maxLength = 240) {
  if (!Array.isArray(value)) return []

  return value
    .map((item) => safeText(item, maxLength))
    .filter(Boolean)
    .slice(0, maxItems)
}

function safeToken(value, maxLength = 80) {
  const text = safeText(value, maxLength)
  return text && /^[A-Za-z0-9_-]+$/.test(text) ? text : null
}

function safeDiagnosticCode(value) {
  const text = safeText(value, 120)
  return text && /^[A-Z0-9_:-]+$/.test(text) ? text : null
}

function safeTokenList(value, maxItems = 10, maxLength = 120) {
  if (!Array.isArray(value)) return []

  return value
    .map((item) => safeToken(item, maxLength))
    .filter(Boolean)
    .slice(0, maxItems)
}

function getTeamName(match, side) {
  const directName = safeText(match?.[`${side}TeamName`], 80)
  if (directName) return directName

  const team = match?.[`${side}Team`]
  if (typeof team === 'string') return safeText(team, 80)
  if (!isPlainObject(team)) return null

  return safeText(team.name ?? team.shortName ?? team.id, 80)
}

function sanitizeMatch(match) {
  const source = isPlainObject(match) ? match : {}
  const homeTeam = safeText(source.homeTeam, 80)
  const awayTeam = safeText(source.awayTeam, 80)

  return {
    matchId: safeText(source.matchId, 120),
    matchName: safeText(source.matchName, 180),
    homeTeam,
    awayTeam,
    kickoff: safeText(source.kickoff, 80),
    status: safeText(source.status, 40),
    stage: safeText(source.stage, 80),
    venue: safeText(source.venue, 120),
  }
}

function buildMatchSummary(match, analysis) {
  const homeTeam = getTeamName(match, 'home')
  const awayTeam = getTeamName(match, 'away')
  const matchName =
    safeText(analysis?.matchName, 180) ??
    (homeTeam && awayTeam ? `${homeTeam} vs ${awayTeam}` : null)

  return sanitizeMatch({
    matchId: analysis?.matchId ?? match?.id ?? match?.matchId,
    matchName,
    homeTeam,
    awayTeam,
    kickoff: match?.kickoff ?? match?.kickoffTime,
    status: match?.status,
    stage: match?.stage ?? match?.group,
    venue:
      typeof match?.venue === 'string'
        ? match.venue
        : match?.venue?.name,
  })
}

function sanitizePick(pick) {
  const source = isPlainObject(pick) ? pick : {}

  return {
    action: safeText(source.action, 40),
    market: safeText(source.market, 40),
    direction: safeText(source.direction, 40),
    label: safeText(source.label, 120),
  }
}

function sanitizeScorePredictions(value) {
  if (!Array.isArray(value)) return []

  return value.slice(0, 3).map((prediction) => ({
    score: safeText(prediction?.score, 20),
    highVariance: safeBoolean(prediction?.highVariance),
    note: safeText(prediction?.note, 240),
  }))
}

function sanitizeDataQuality(dataQuality) {
  const source = isPlainObject(dataQuality) ? dataQuality : {}
  const result = {}

  for (const key of DATA_QUALITY_KEYS) {
    result[key] = safeText(source[key], 80)
  }

  result.limitations = safeStringList(source.limitations, 20, 120)
  return result
}

function sanitizeScoreBreakdown(scoreBreakdown) {
  const source = isPlainObject(scoreBreakdown) ? scoreBreakdown : {}

  return Object.fromEntries(
    SCORE_BREAKDOWN_KEYS.map((key) => {
      const item = isPlainObject(source[key]) ? source[key] : {}
      return [
        key,
        {
          score: safeNumber(item.score),
          reason: safeText(item.reason, 600),
        },
      ]
    }),
  )
}

function sanitizeRemoteOdds(remoteOdds) {
  const source = isPlainObject(remoteOdds) ? remoteOdds : {}

  return {
    provider: safeText(source.provider, 80),
    dataSource: safeText(source.dataSource, 80),
    status: safeText(source.status, 40),
    rawAvailable: safeBoolean(source.rawAvailable),
    marketTone: safeText(source.marketTone, 80),
    riskFlags: safeTokenList(source.riskFlags, 12, 120),
    fallbackReason: safeDiagnosticCode(source.fallbackReason),
  }
}

function sanitizeComparison(comparison) {
  const source = isPlainObject(comparison) ? comparison : {}

  return {
    formEdge: safeText(source.formEdge, 40),
    attackEdge: safeText(source.attackEdge, 40),
    defenseEdge: safeText(source.defenseEdge, 40),
    volatilityRisk: safeText(source.volatilityRisk, 40),
  }
}

function sanitizeTeamFormMeta(meta) {
  const source = isPlainObject(meta) ? meta : {}

  return {
    error: safeDiagnosticCode(source.error),
    errorCode: safeDiagnosticCode(source.errorCode),
    providerStage: safeToken(source.providerStage, 80),
    providerErrorKeys: safeTokenList(source.providerErrorKeys, 10, 40),
  }
}

function sanitizeRemoteTeamForm(remoteTeamForm) {
  const source = isPlainObject(remoteTeamForm) ? remoteTeamForm : {}

  return {
    provider: safeText(source.provider, 80),
    dataSource: safeText(source.dataSource, 80),
    status: safeText(source.status, 40),
    rawAvailable: safeBoolean(source.rawAvailable),
    fallbackReason: safeDiagnosticCode(source.fallbackReason),
    comparison: sanitizeComparison(source.comparison),
    riskPenalty: safeNumber(source.riskPenalty),
    infoPenalty: safeNumber(source.infoPenalty),
    meta: sanitizeTeamFormMeta(source.meta),
  }
}

export function sanitizeAiAnalysisPayload(payload) {
  const source = isPlainObject(payload) ? payload : {}

  return {
    schemaVersion: safeText(source.schemaVersion, 40),
    match: sanitizeMatch(source.match),
    publicSummary: safeText(source.publicSummary, 1600),
    betScore: safeNumber(source.betScore),
    recommendLevel: safeText(source.recommendLevel, 80),
    mainPick: sanitizePick(source.mainPick),
    secondaryPick: sanitizePick(source.secondaryPick),
    scorePredictions: sanitizeScorePredictions(source.scorePredictions),
    totalGoalsDirection: safeText(source.totalGoalsDirection, 40),
    dataQuality: sanitizeDataQuality(source.dataQuality),
    cancelRules: safeStringList(source.cancelRules, 10, 360),
    scoreBreakdown: sanitizeScoreBreakdown(source.scoreBreakdown),
    remoteOdds: sanitizeRemoteOdds(source.remoteOdds),
    remoteTeamForm: sanitizeRemoteTeamForm(source.remoteTeamForm),
  }
}

export function hasForbiddenAiAnalysisInput(value, path = []) {
  if (Array.isArray(value)) {
    return value.some((item, index) =>
      hasForbiddenAiAnalysisInput(item, [...path, String(index)]),
    )
  }
  if (!isPlainObject(value)) return false

  return Object.entries(value).some(([key, nestedValue]) => {
    const normalizedKey = normalizeKey(key)
    const nextPath = [...path, key]

    if (FORBIDDEN_INPUT_KEYS.has(normalizedKey)) {
      return true
    }

    return hasForbiddenAiAnalysisInput(nestedValue, nextPath)
  })
}

export function isValidAiAnalysisPayload(payload) {
  return Boolean(
    isPlainObject(payload) &&
      payload.schemaVersion === 'ai-analysis-input-v1' &&
      isPlainObject(payload.match) &&
      safeText(payload.match.matchId, 120) &&
      safeText(payload.match.matchName, 180) &&
      safeText(payload.publicSummary, 1600) &&
      safeNumber(payload.betScore) !== null &&
      safeText(payload.recommendLevel, 80),
  )
}

export function buildAiAnalysisPayload({ match, analysis } = {}) {
  const plan = isPlainObject(analysis) ? analysis : {}
  const internal = isPlainObject(plan.internalAnalysis)
    ? plan.internalAnalysis
    : {}
  const remoteOdds =
    internal.remoteOddsSignal ?? plan.dataQuality?.remoteOdds
  const remoteTeamForm =
    internal.remoteTeamFormSignal ?? plan.dataQuality?.remoteTeamForm

  return sanitizeAiAnalysisPayload({
    schemaVersion: 'ai-analysis-input-v1',
    match: buildMatchSummary(match, plan),
    publicSummary: plan.publicSummary,
    betScore: plan.betScore,
    recommendLevel: plan.recommendLevel,
    mainPick: plan.mainPick,
    secondaryPick: plan.secondaryPick,
    scorePredictions: plan.scorePicks,
    totalGoalsDirection:
      plan.secondaryPick?.market === 'totalGoals'
        ? plan.secondaryPick.direction
        : 'none',
    dataQuality: plan.dataQuality,
    cancelRules: plan.cancelRules,
    scoreBreakdown: plan.scoreBreakdown,
    remoteOdds,
    remoteTeamForm,
  })
}

export default buildAiAnalysisPayload
