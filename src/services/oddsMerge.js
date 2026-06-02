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

function createRemoteOdds(market, oddsSnapshot) {
  return {
    provider: oddsSnapshot.provider ?? null,
    dataSource: oddsSnapshot.dataSource ?? null,
    updatedAt: oddsSnapshot.updatedAt ?? null,
    marketStatus: market.marketStatus ?? 'missing',
    oddsConfidence: market.oddsConfidence ?? 'low',
    mainMarkets: cloneObject(market.mainMarkets),
    handicap: cloneObject(market.handicap),
    totalGoals: cloneObject(market.totalGoals),
    marketMovement: cloneObject(market.marketMovement),
    riskFlags: Array.isArray(market.riskFlags) ? [...market.riskFlags] : [],
    reviewPoints: Array.isArray(market.reviewPoints) ? [...market.reviewPoints] : [],
    fallbackReason: market.fallbackReason ?? oddsSnapshot.fallbackReason ?? null,
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
      remoteOdds: createRemoteOdds(market, oddsSnapshot),
    }
  })
}

export default mergeOddsIntoMatches
