const FALLBACK_ODDS_SNAPSHOT = {
  ok: false,
  disabled: true,
  status: 'disabled',
  provider: 'none',
  dataSource: 'disabled',
  source: 'disabled-fallback',
  error: null,
  fallbackReason: 'ODDS_API_DISABLED',
  markets: [],
}

export function createFallbackOddsSnapshot(options = {}) {
  const status = options.status ?? FALLBACK_ODDS_SNAPSHOT.status
  const source = options.source ?? FALLBACK_ODDS_SNAPSHOT.source
  const error = options.error ?? FALLBACK_ODDS_SNAPSHOT.error

  return {
    ...FALLBACK_ODDS_SNAPSHOT,
    status,
    fallbackReason: options.fallbackReason ?? FALLBACK_ODDS_SNAPSHOT.fallbackReason,
    source,
    error,
    updatedAt: options.updatedAt ?? new Date().toISOString(),
    meta: {
      status,
      error,
      source,
      message: options.message ?? 'Odds API is not enabled.',
      ...(options.meta ?? {}),
    },
  }
}

const marketStatusValues = new Set(['available', 'missing', 'stale'])
const confidenceValues = new Set(['high', 'medium', 'low'])
const favoriteSideValues = new Set(['home', 'away', 'draw', 'none', 'unknown'])
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

function normalizeString(value, fallback = '') {
  return typeof value === 'string' && value.trim() ? value : fallback
}

function deriveFavoriteSide(mainMarkets) {
  const candidates = [
    ['home', mainMarkets.homeWin],
    ['draw', mainMarkets.draw],
    ['away', mainMarkets.awayWin],
  ].filter(([, value]) => typeof value === 'number' && Number.isFinite(value))

  if (!candidates.length) return 'none'

  return candidates.reduce((best, candidate) =>
    candidate[1] < best[1] ? candidate : best,
  )[0]
}

function normalizeFavoriteSide(value, mainMarkets) {
  return favoriteSideValues.has(value) ? value : deriveFavoriteSide(mainMarkets)
}

function normalizeStandardMarkets(markets, mainMarkets, handicap, totalGoals) {
  const standardMarkets =
    markets && typeof markets === 'object' && !Array.isArray(markets)
      ? markets
      : {}
  const matchWinner =
    standardMarkets.matchWinner && typeof standardMarkets.matchWinner === 'object'
      ? standardMarkets.matchWinner
      : {}
  const asianHandicap =
    standardMarkets.asianHandicap && typeof standardMarkets.asianHandicap === 'object'
      ? standardMarkets.asianHandicap
      : {}
  const overUnder =
    standardMarkets.overUnder && typeof standardMarkets.overUnder === 'object'
      ? standardMarkets.overUnder
      : {}

  return {
    matchWinner: {
      home: normalizeNullableNumber(matchWinner.home ?? mainMarkets.homeWin),
      draw: normalizeNullableNumber(matchWinner.draw ?? mainMarkets.draw),
      away: normalizeNullableNumber(matchWinner.away ?? mainMarkets.awayWin),
    },
    asianHandicap: {
      line: normalizeNullableNumber(asianHandicap.line ?? handicap.line),
      homeOdds: normalizeNullableNumber(asianHandicap.homeOdds ?? handicap.home),
      awayOdds: normalizeNullableNumber(asianHandicap.awayOdds ?? handicap.away),
    },
    overUnder: {
      line: normalizeNullableNumber(overUnder.line ?? totalGoals.line),
      overOdds: normalizeNullableNumber(overUnder.overOdds ?? totalGoals.over),
      underOdds: normalizeNullableNumber(overUnder.underOdds ?? totalGoals.under),
    },
  }
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
  const normalizedMainMarkets = {
    homeWin: normalizeNullableNumber(mainMarkets.homeWin),
    draw: normalizeNullableNumber(mainMarkets.draw),
    awayWin: normalizeNullableNumber(mainMarkets.awayWin),
  }
  const normalizedHandicap = {
    line: normalizeNullableNumber(handicap.line),
    home: normalizeNullableNumber(handicap.home),
    away: normalizeNullableNumber(handicap.away),
  }
  const normalizedTotalGoals = {
    line: normalizeNullableNumber(totalGoals.line),
    over: normalizeNullableNumber(totalGoals.over),
    under: normalizeNullableNumber(totalGoals.under),
  }

  return {
    status: normalizeString(marketData.status, 'mock'),
    matchKey: typeof marketData.matchKey === 'string' ? marketData.matchKey : '',
    homeTeam: typeof marketData.homeTeam === 'string' ? marketData.homeTeam : '',
    awayTeam: typeof marketData.awayTeam === 'string' ? marketData.awayTeam : '',
    marketStatus: marketStatusValues.has(marketData.marketStatus)
      ? marketData.marketStatus
      : 'missing',
    marketTone: normalizeString(marketData.marketTone, 'unknown'),
    favoriteSide: normalizeFavoriteSide(marketData.favoriteSide, normalizedMainMarkets),
    oddsConfidence: confidenceValues.has(marketData.oddsConfidence)
      ? marketData.oddsConfidence
      : 'low',
    bookmakers: Array.isArray(marketData.bookmakers) ? marketData.bookmakers : [],
    mainMarkets: normalizedMainMarkets,
    handicap: normalizedHandicap,
    totalGoals: normalizedTotalGoals,
    markets: normalizeStandardMarkets(
      marketData.markets,
      normalizedMainMarkets,
      normalizedHandicap,
      normalizedTotalGoals,
    ),
    marketMovement: {
      favoriteTrend: favoriteTrendValues.has(marketMovement.favoriteTrend)
        ? marketMovement.favoriteTrend
        : 'unknown',
      totalGoalsTrend: totalGoalsTrendValues.has(marketMovement.totalGoalsTrend)
        ? marketMovement.totalGoalsTrend
        : 'unknown',
    },
    valueFlags: normalizeStringList(marketData.valueFlags),
    riskFlags: normalizeStringList(marketData.riskFlags),
    reviewPoints: normalizeStringList(marketData.reviewPoints),
    riskNotes: normalizeStringList(marketData.riskNotes),
    fallbackReason: marketData.fallbackReason ?? null,
    rawAvailable: marketData.rawAvailable === true,
  }
}

function normalizeMeta(meta, defaults) {
  const metaData = meta && typeof meta === 'object' ? meta : {}
  const error =
    typeof metaData.error === 'string' && metaData.error.trim()
      ? metaData.error
      : defaults.error

  return {
    ...metaData,
    status: normalizeString(metaData.status, defaults.status),
    error,
    source: normalizeString(metaData.source, defaults.source),
    message: normalizeString(metaData.message, defaults.message),
  }
}

function normalizeOddsSnapshot(payload) {
  if (!payload || typeof payload !== 'object') {
    return createFallbackOddsSnapshot({ fallbackReason: 'ODDS_API_INVALID_RESPONSE' })
  }

  const disabled = payload.disabled !== false
  const status = normalizeString(
    payload.status,
    disabled ? FALLBACK_ODDS_SNAPSHOT.status : 'available',
  )
  const source = normalizeString(payload.source, payload.dataSource ?? FALLBACK_ODDS_SNAPSHOT.source)
  const error =
    typeof payload.error === 'string' && payload.error.trim()
      ? payload.error
      : null

  return {
    ok: payload.ok === true,
    disabled,
    status,
    provider: payload.provider ?? FALLBACK_ODDS_SNAPSHOT.provider,
    dataSource: payload.dataSource ?? FALLBACK_ODDS_SNAPSHOT.dataSource,
    source,
    error,
    updatedAt: payload.updatedAt ?? new Date().toISOString(),
    fallbackReason:
      payload.fallbackReason ?? FALLBACK_ODDS_SNAPSHOT.fallbackReason,
    markets: Array.isArray(payload.markets)
      ? payload.markets.map(normalizeOddsMarket)
      : [],
    meta: normalizeMeta(payload.meta, {
      status,
      error,
      source,
      message: 'Odds API is not enabled.',
    }),
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
