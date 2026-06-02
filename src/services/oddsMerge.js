function buildMatchKey(match) {
  if (typeof match?.matchKey === 'string' && match.matchKey.trim()) {
    return match.matchKey.trim()
  }

  const homeTeam = typeof match?.homeTeam === 'string' ? match.homeTeam.trim() : ''
  const awayTeam = typeof match?.awayTeam === 'string' ? match.awayTeam.trim() : ''

  if (!homeTeam || !awayTeam) return ''

  return `${homeTeam}__${awayTeam}`
}

function cloneObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? { ...value }
    : {}
}

function cloneStringList(value) {
  return Array.isArray(value)
    ? value.filter((item) => typeof item === 'string')
    : []
}

function normalizeNullableNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
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

function createStandardMarkets(market) {
  const mainMarkets = cloneObject(market.mainMarkets)
  const handicap = cloneObject(market.handicap)
  const totalGoals = cloneObject(market.totalGoals)
  const markets = cloneObject(market.markets)
  const matchWinner = cloneObject(markets.matchWinner)
  const asianHandicap = cloneObject(markets.asianHandicap)
  const overUnder = cloneObject(markets.overUnder)

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

function getMatchTeamName(match, side) {
  const value = match?.[`${side}Team`]
  return typeof value === 'string' ? value : ''
}

function createRemoteOdds(market, oddsSnapshot, match) {
  const mainMarkets = cloneObject(market.mainMarkets)

  return {
    status: normalizeString(market.status, oddsSnapshot.status ?? oddsSnapshot.provider ?? 'unknown'),
    provider: oddsSnapshot.provider ?? null,
    dataSource: oddsSnapshot.dataSource ?? null,
    updatedAt: oddsSnapshot.updatedAt ?? null,
    matchKey: normalizeString(market.matchKey, buildMatchKey(match)),
    homeTeam: normalizeString(market.homeTeam, getMatchTeamName(match, 'home')),
    awayTeam: normalizeString(market.awayTeam, getMatchTeamName(match, 'away')),
    marketStatus: market.marketStatus ?? 'missing',
    marketTone: normalizeString(market.marketTone, 'unknown'),
    favoriteSide: normalizeString(market.favoriteSide, deriveFavoriteSide(mainMarkets)),
    oddsConfidence: market.oddsConfidence ?? 'low',
    mainMarkets,
    handicap: cloneObject(market.handicap),
    totalGoals: cloneObject(market.totalGoals),
    markets: createStandardMarkets(market),
    marketMovement: cloneObject(market.marketMovement),
    valueFlags: cloneStringList(market.valueFlags),
    riskFlags: cloneStringList(market.riskFlags),
    reviewPoints: cloneStringList(market.reviewPoints),
    riskNotes: cloneStringList(market.riskNotes),
    fallbackReason: market.fallbackReason ?? oddsSnapshot.fallbackReason ?? null,
    rawAvailable: market.rawAvailable === true,
  }
}

export function mergeOddsIntoMatches(matches, oddsSnapshot) {
  if (!Array.isArray(matches)) return []

  if (
    oddsSnapshot?.disabled === true ||
    !Array.isArray(oddsSnapshot?.markets)
  ) {
    return [...matches]
  }

  const marketsByMatchKey = new Map()

  for (const market of oddsSnapshot.markets) {
    if (typeof market?.matchKey !== 'string' || !market.matchKey.trim()) continue
    marketsByMatchKey.set(market.matchKey.trim(), market)
  }

  if (!marketsByMatchKey.size) return [...matches]

  return matches.map((match) => {
    const market = marketsByMatchKey.get(buildMatchKey(match))

    if (!market) return match

    return {
      ...match,
      remoteOdds: createRemoteOdds(market, oddsSnapshot, match),
    }
  })
}

export default mergeOddsIntoMatches
