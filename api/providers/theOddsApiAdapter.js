const THE_ODDS_API_BASE_URL = 'https://api.the-odds-api.com/v4'

export class TheOddsApiError extends Error {
  constructor(code, options = {}) {
    super(code)
    this.name = 'TheOddsApiError'
    this.code = code
    this.status = options.status ?? null
    this.usage = options.usage ?? null
  }
}

function normalizeString(value, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function normalizeNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function normalizeOutcomeName(value) {
  return normalizeString(value).toLowerCase()
}

function getHeader(response, name) {
  const value = response?.headers?.get?.(name)
  return value == null || value === '' ? null : String(value)
}

function getUsage(response) {
  return {
    remaining: getHeader(response, 'x-requests-remaining'),
    used: getHeader(response, 'x-requests-used'),
    last: getHeader(response, 'x-requests-last'),
  }
}

function getErrorCode(status) {
  if (status === 401) return 'ODDS_API_UNAUTHORIZED'
  if (status === 403) return 'ODDS_API_FORBIDDEN'
  if (status === 429) return 'ODDS_API_QUOTA_EXCEEDED'
  if (status >= 500) return 'ODDS_API_UPSTREAM_ERROR'
  return 'ODDS_API_REQUEST_FAILED'
}

function findMarket(event, marketKey) {
  for (const bookmaker of event.bookmakers ?? []) {
    const market = bookmaker.markets?.find((item) => item?.key === marketKey)
    if (market && Array.isArray(market.outcomes)) {
      return { bookmaker, market }
    }
  }

  return null
}

function findOutcome(outcomes, name) {
  const normalizedName = normalizeOutcomeName(name)
  return outcomes.find(
    (outcome) => normalizeOutcomeName(outcome?.name) === normalizedName,
  )
}

function normalizeMatchWinner(event, selection) {
  const outcomes = selection?.market?.outcomes ?? []
  const home = findOutcome(outcomes, event.home_team)
  const away = findOutcome(outcomes, event.away_team)
  const draw = findOutcome(outcomes, 'Draw')

  return {
    home: normalizeNumber(home?.price),
    draw: normalizeNumber(draw?.price),
    away: normalizeNumber(away?.price),
  }
}

function normalizeAsianHandicap(event, selection) {
  const outcomes = selection?.market?.outcomes ?? []
  const home = findOutcome(outcomes, event.home_team)
  const away = findOutcome(outcomes, event.away_team)
  const homeLine = normalizeNumber(home?.point)
  const awayLine = normalizeNumber(away?.point)

  return {
    line: homeLine ?? (awayLine == null ? null : -awayLine),
    homeOdds: normalizeNumber(home?.price),
    awayOdds: normalizeNumber(away?.price),
  }
}

function normalizeOverUnder(selection) {
  const outcomes = selection?.market?.outcomes ?? []
  const over = findOutcome(outcomes, 'Over')
  const under = findOutcome(outcomes, 'Under')

  return {
    line: normalizeNumber(over?.point) ?? normalizeNumber(under?.point),
    overOdds: normalizeNumber(over?.price),
    underOdds: normalizeNumber(under?.price),
  }
}

function deriveFavoriteSide(matchWinner) {
  const candidates = [
    ['home', matchWinner.home],
    ['draw', matchWinner.draw],
    ['away', matchWinner.away],
  ].filter(([, price]) => price != null)

  if (!candidates.length) return 'none'

  return candidates.reduce((best, candidate) =>
    candidate[1] < best[1] ? candidate : best,
  )[0]
}

function getH2hPriceRanges(event) {
  const prices = {
    home: [],
    draw: [],
    away: [],
  }

  for (const bookmaker of event.bookmakers ?? []) {
    const market = bookmaker.markets?.find((item) => item?.key === 'h2h')
    if (!Array.isArray(market?.outcomes)) continue

    const normalized = normalizeMatchWinner(event, { market })
    for (const key of Object.keys(prices)) {
      if (normalized[key] != null) prices[key].push(normalized[key])
    }
  }

  return Object.values(prices).map((values) => {
    if (values.length < 2) return 0
    return Math.max(...values) - Math.min(...values)
  })
}

function deriveValueFlags(event, matchWinner, overUnder) {
  const flags = []
  const favoritePrice = Math.min(
    ...Object.values(matchWinner).filter((value) => value != null),
    Number.POSITIVE_INFINITY,
  )

  if (favoritePrice <= 1.4) flags.push('favorite_too_hot')
  if (getH2hPriceRanges(event).some((range) => range >= 0.4)) {
    flags.push('odds_conflict')
  }
  if (
    (overUnder.line != null && overUnder.line >= 3.5) ||
    (overUnder.overOdds != null && overUnder.overOdds <= 1.7)
  ) {
    flags.push('over_line_hot')
  }

  return flags
}

function deriveRiskNotes(valueFlags) {
  const messages = {
    favorite_too_hot: '热门方向赔率偏低，需要复核市场热度。',
    odds_conflict: '不同来源赔率差异较大，需要复核盘口一致性。',
    over_line_hot: '大球方向定价偏热，需要复核进球线。',
  }

  return valueFlags.map((flag) => messages[flag]).filter(Boolean)
}

function deriveMarketTone(matchWinner, valueFlags) {
  if (valueFlags.includes('odds_conflict')) return 'odds-conflict'

  const favoritePrice = Math.min(
    ...Object.values(matchWinner).filter((value) => value != null),
    Number.POSITIVE_INFINITY,
  )

  if (!Number.isFinite(favoritePrice)) return 'missing'
  if (favoritePrice <= 1.45) return 'favorite-heated'
  if (favoritePrice <= 1.8) return 'favorite-lean'
  return 'neutral'
}

function deriveOddsConfidence(event, markets) {
  const bookmakerCount = (event.bookmakers ?? []).filter((bookmaker) =>
    Array.isArray(bookmaker?.markets),
  ).length
  const completeMarketCount = Object.values(markets).filter((market) =>
    Object.values(market).some((value) => value != null),
  ).length

  if (bookmakerCount >= 5 && completeMarketCount === 3) return 'high'
  if (bookmakerCount >= 2 && completeMarketCount >= 2) return 'medium'
  return 'low'
}

function getLatestUpdate(event) {
  const timestamps = (event.bookmakers ?? [])
    .map((bookmaker) => Date.parse(bookmaker?.last_update))
    .filter(Number.isFinite)

  if (!timestamps.length) return null
  return new Date(Math.max(...timestamps)).toISOString()
}

function normalizeBookmakers(event) {
  return (event.bookmakers ?? []).map((bookmaker) => ({
    key: normalizeString(bookmaker?.key),
    title: normalizeString(bookmaker?.title),
    lastUpdate: normalizeString(bookmaker?.last_update) || null,
    markets: Array.isArray(bookmaker?.markets)
      ? bookmaker.markets
          .map((market) => normalizeString(market?.key))
          .filter(Boolean)
      : [],
  }))
}

function normalizeEvent(event) {
  const homeTeam = normalizeString(event?.home_team)
  const awayTeam = normalizeString(event?.away_team)
  if (!homeTeam || !awayTeam) return null

  const matchWinner = normalizeMatchWinner(event, findMarket(event, 'h2h'))
  const asianHandicap = normalizeAsianHandicap(
    event,
    findMarket(event, 'spreads'),
  )
  const overUnder = normalizeOverUnder(findMarket(event, 'totals'))
  const markets = {
    matchWinner,
    asianHandicap,
    overUnder,
  }
  const valueFlags = deriveValueFlags(event, matchWinner, overUnder)
  const hasMarketData = Object.values(markets).some((market) =>
    Object.values(market).some((value) => value != null),
  )

  return {
    status: 'available',
    matchKey: `${homeTeam}__${awayTeam}`,
    homeTeam,
    awayTeam,
    sourceKickoffAt: normalizeString(event?.commence_time) || null,
    sourceUpdatedAt: getLatestUpdate(event),
    marketStatus: hasMarketData ? 'available' : 'missing',
    marketTone: deriveMarketTone(matchWinner, valueFlags),
    favoriteSide: deriveFavoriteSide(matchWinner),
    oddsConfidence: deriveOddsConfidence(event, markets),
    bookmakers: normalizeBookmakers(event),
    mainMarkets: {
      homeWin: matchWinner.home,
      draw: matchWinner.draw,
      awayWin: matchWinner.away,
    },
    handicap: {
      line: asianHandicap.line,
      home: asianHandicap.homeOdds,
      away: asianHandicap.awayOdds,
    },
    totalGoals: {
      line: overUnder.line,
      over: overUnder.overOdds,
      under: overUnder.underOdds,
    },
    markets,
    marketMovement: {
      favoriteTrend: 'unknown',
      totalGoalsTrend: 'unknown',
    },
    valueFlags,
    riskFlags: ['marketMovementMissing', ...valueFlags],
    reviewPoints: ['供应商赔率仅挂载到 remoteOdds，不进入推荐引擎。'],
    riskNotes: deriveRiskNotes(valueFlags),
    fallbackReason: null,
    rawAvailable: true,
  }
}

function getSnapshotUpdatedAt(markets) {
  const timestamps = markets
    .map((market) => Date.parse(market.sourceUpdatedAt))
    .filter(Number.isFinite)

  return timestamps.length
    ? new Date(Math.max(...timestamps)).toISOString()
    : new Date().toISOString()
}

export async function fetchTheOddsApiSnapshot(options = {}) {
  const {
    apiKey,
    sportKey = 'soccer',
    regions = 'us,uk,eu',
    markets = 'h2h,spreads,totals',
    oddsFormat = 'decimal',
    dateFormat = 'iso',
    timeoutMs = 5000,
    fetchImpl = globalThis.fetch,
  } = options

  if (!normalizeString(apiKey)) {
    throw new TheOddsApiError('ODDS_API_KEY_MISSING')
  }
  if (typeof fetchImpl !== 'function') {
    throw new TheOddsApiError('ODDS_API_UNAVAILABLE')
  }

  const url = new URL(
    `${THE_ODDS_API_BASE_URL}/sports/${encodeURIComponent(sportKey)}/odds`,
  )
  url.searchParams.set('apiKey', apiKey)
  url.searchParams.set('regions', regions)
  url.searchParams.set('markets', markets)
  url.searchParams.set('oddsFormat', oddsFormat)
  url.searchParams.set('dateFormat', dateFormat)

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetchImpl(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
      signal: controller.signal,
    })
    const usage = getUsage(response)

    if (!response.ok) {
      throw new TheOddsApiError(getErrorCode(response.status), {
        status: response.status,
        usage,
      })
    }

    let payload
    try {
      payload = await response.json()
    } catch {
      throw new TheOddsApiError('ODDS_API_INVALID_RESPONSE', { usage })
    }

    if (!Array.isArray(payload)) {
      throw new TheOddsApiError('ODDS_API_INVALID_RESPONSE', { usage })
    }

    const normalizedMarkets = payload.map(normalizeEvent).filter(Boolean)
    const updatedAt = getSnapshotUpdatedAt(normalizedMarkets)

    return {
      ok: true,
      disabled: false,
      status: 'available',
      provider: 'the-odds-api',
      dataSource: 'remote',
      source: 'the-odds-api',
      error: null,
      updatedAt,
      fallbackReason: null,
      markets: normalizedMarkets,
      meta: {
        status: 'available',
        error: null,
        source: 'the-odds-api',
        message: 'The Odds API snapshot normalized successfully.',
        usage,
      },
    }
  } catch (error) {
    if (error instanceof TheOddsApiError) throw error
    if (controller.signal.aborted || error?.name === 'AbortError') {
      throw new TheOddsApiError('ODDS_API_TIMEOUT')
    }
    throw new TheOddsApiError('ODDS_API_NETWORK_ERROR')
  } finally {
    clearTimeout(timeout)
  }
}

export default fetchTheOddsApiSnapshot
