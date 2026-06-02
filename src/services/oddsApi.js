const FALLBACK_ODDS_SNAPSHOT = {
  ok: false,
  disabled: true,
  provider: 'none',
  dataSource: 'disabled',
  fallbackReason: 'ODDS_API_DISABLED',
  markets: [],
}

export function createFallbackOddsSnapshot(options = {}) {
  return {
    ...FALLBACK_ODDS_SNAPSHOT,
    fallbackReason: options.fallbackReason ?? FALLBACK_ODDS_SNAPSHOT.fallbackReason,
    updatedAt: options.updatedAt ?? new Date().toISOString(),
    meta: {
      message: options.message ?? 'Odds API is not enabled.',
      ...(options.meta ?? {}),
    },
  }
}

const marketStatusValues = new Set(['available', 'missing', 'stale'])
const confidenceValues = new Set(['high', 'medium', 'low'])
const favoriteTrendValues = new Set([
  'stable',
  'shortening',
  'drifting',
  'unknown',
])
const totalGoalsTrendValues = new Set([
  'stable',
  'over-heating',
  'under-support',
  'unknown',
])

function normalizeNullableNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function normalizeStringList(value) {
  return Array.isArray(value)
    ? value.filter((item) => typeof item === 'string')
    : []
}

function normalizeOddsMarket(market) {
  const marketData = market && typeof market === 'object' ? market : {}
  const mainMarkets =
    marketData.mainMarkets && typeof marketData.mainMarkets === 'object'
      ? marketData.mainMarkets
      : {}
  const handicap =
    marketData.handicap && typeof marketData.handicap === 'object'
      ? marketData.handicap
      : {}
  const totalGoals =
    marketData.totalGoals && typeof marketData.totalGoals === 'object'
      ? marketData.totalGoals
      : {}
  const marketMovement =
    marketData.marketMovement && typeof marketData.marketMovement === 'object'
      ? marketData.marketMovement
      : {}

  return {
    matchKey: typeof marketData.matchKey === 'string' ? marketData.matchKey : '',
    homeTeam: typeof marketData.homeTeam === 'string' ? marketData.homeTeam : '',
    awayTeam: typeof marketData.awayTeam === 'string' ? marketData.awayTeam : '',
    marketStatus: marketStatusValues.has(marketData.marketStatus)
      ? marketData.marketStatus
      : 'missing',
    oddsConfidence: confidenceValues.has(marketData.oddsConfidence)
      ? marketData.oddsConfidence
      : 'low',
    bookmakers: Array.isArray(marketData.bookmakers) ? marketData.bookmakers : [],
    mainMarkets: {
      homeWin: normalizeNullableNumber(mainMarkets.homeWin),
      draw: normalizeNullableNumber(mainMarkets.draw),
      awayWin: normalizeNullableNumber(mainMarkets.awayWin),
    },
    handicap: {
      line: normalizeNullableNumber(handicap.line),
      home: normalizeNullableNumber(handicap.home),
      away: normalizeNullableNumber(handicap.away),
    },
    totalGoals: {
      line: normalizeNullableNumber(totalGoals.line),
      over: normalizeNullableNumber(totalGoals.over),
      under: normalizeNullableNumber(totalGoals.under),
    },
    marketMovement: {
      favoriteTrend: favoriteTrendValues.has(marketMovement.favoriteTrend)
        ? marketMovement.favoriteTrend
        : 'unknown',
      totalGoalsTrend: totalGoalsTrendValues.has(marketMovement.totalGoalsTrend)
        ? marketMovement.totalGoalsTrend
        : 'unknown',
    },
    riskFlags: normalizeStringList(marketData.riskFlags),
    reviewPoints: normalizeStringList(marketData.reviewPoints),
    fallbackReason: marketData.fallbackReason ?? null,
  }
}

function normalizeOddsSnapshot(payload) {
  if (!payload || typeof payload !== 'object') {
    return createFallbackOddsSnapshot({ fallbackReason: 'ODDS_API_INVALID_RESPONSE' })
  }

  return {
    ok: payload.ok === true,
    disabled: payload.disabled !== false,
    provider: payload.provider ?? FALLBACK_ODDS_SNAPSHOT.provider,
    dataSource: payload.dataSource ?? FALLBACK_ODDS_SNAPSHOT.dataSource,
    updatedAt: payload.updatedAt ?? new Date().toISOString(),
    fallbackReason:
      payload.fallbackReason ?? FALLBACK_ODDS_SNAPSHOT.fallbackReason,
    markets: Array.isArray(payload.markets)
      ? payload.markets.map(normalizeOddsMarket)
      : [],
    meta:
      payload.meta && typeof payload.meta === 'object'
        ? payload.meta
        : { message: 'Odds API is not enabled.' },
  }
}

export async function getOddsSnapshot(options = {}) {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch

  if (typeof fetchImpl !== 'function') {
    return createFallbackOddsSnapshot({ fallbackReason: 'ODDS_API_UNAVAILABLE' })
  }

  try {
    const response = await fetchImpl('/api/odds')
    const payload = await response.json().catch(() => null)

    if (!response.ok) {
      return createFallbackOddsSnapshot({
        fallbackReason: payload?.fallbackReason ?? 'ODDS_API_FAILED',
        message: 'Odds API fallback is active.',
      })
    }

    return normalizeOddsSnapshot(payload)
  } catch {
    return createFallbackOddsSnapshot({
      fallbackReason: 'ODDS_API_FAILED',
      message: 'Odds API request failed.',
    })
  }
}

export default getOddsSnapshot
