import { getMockMatchSnapshot } from './mockMatchAdapter'

const teamAliases = {
  france: 'france',
  'french republic': 'france',
  brazil: 'brazil',
  brasil: 'brazil',
  argentina: 'argentina',
  england: 'england',
  spain: 'spain',
  germany: 'germany',
  deutschland: 'germany',
  portugal: 'portugal',
  netherlands: 'netherlands',
  holland: 'netherlands',
  uruguay: 'uruguay',
  usa: 'usa',
  'united states': 'usa',
  'united states of america': 'usa',
  mexico: 'mexico',
  japan: 'japan',
}

function normalizeKey(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
}

function resolveTeamId(team) {
  return teamAliases[normalizeKey(team)] ?? normalizeKey(team)
}

function getResult(status, score) {
  if (status !== 'finished' || !score) return null
  if (score.home > score.away) return 'home'
  if (score.home < score.away) return 'away'
  return 'draw'
}

function createLocalMatchLookup(mockMatches) {
  return new Map(
    mockMatches.map((match) => [
      `${match.homeTeam}|${match.awayTeam}`,
      match,
    ]),
  )
}

function createFallbackError(fallbackReason) {
  const error = new Error(fallbackReason)
  error.fallbackReason = fallbackReason
  return error
}

function mergeRemoteMatch(remoteMatch, localMatch) {
  const homeTeam = resolveTeamId(remoteMatch.homeTeam)
  const awayTeam = resolveTeamId(remoteMatch.awayTeam)
  const score = remoteMatch.score
    ? {
        home: Number(remoteMatch.score.home) || 0,
        away: Number(remoteMatch.score.away) || 0,
      }
    : null

  return {
    ...localMatch,
    id: String(remoteMatch.id ?? localMatch.id),
    homeTeam,
    awayTeam,
    kickoffTime: remoteMatch.kickoffTime ?? localMatch.kickoffTime,
    status: remoteMatch.status ?? localMatch.status,
    minute: remoteMatch.minute ?? null,
    score,
    result: remoteMatch.result ?? getResult(remoteMatch.status, score),
    source: remoteMatch.source ?? 'remote',
  }
}

export async function fetchMatches() {
  const response = await fetch('/api/matches')
  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    throw createFallbackError(payload?.fallbackReason ?? 'API_FAILED')
  }

  if (!payload || !Array.isArray(payload.matches)) {
    throw createFallbackError(payload?.fallbackReason ?? 'INVALID_RESPONSE')
  }

  if (payload.fallbackReason === 'COMPETITION_NO_DATA' || !payload.matches.length) {
    throw createFallbackError(payload.fallbackReason ?? 'COMPETITION_NO_DATA')
  }

  const mockSnapshot = getMockMatchSnapshot()
  const localMatchLookup = createLocalMatchLookup(mockSnapshot.matches)
  const matches = payload.matches
    .map((remoteMatch) => {
      const homeTeam = resolveTeamId(remoteMatch.homeTeam)
      const awayTeam = resolveTeamId(remoteMatch.awayTeam)
      const localMatch = localMatchLookup.get(`${homeTeam}|${awayTeam}`)

      if (!localMatch?.odds) return null
      return mergeRemoteMatch({ ...remoteMatch, homeTeam, awayTeam }, localMatch)
    })
    .filter(Boolean)

  if (!matches.length) {
    throw createFallbackError('NO_ODDS_MATCH')
  }

  return {
    matchDay:
      matches[0]?.kickoffTime?.slice(0, 10) ??
      mockSnapshot.matchDay,
    updatedAt: payload.updatedAt ?? new Date().toISOString(),
    source: payload.source ?? 'remote',
    dataSource: 'real',
    fallbackReason: null,
    provider: payload.provider ?? payload.meta?.provider ?? 'football-data',
    meta: {
      dataSource: 'real',
      fallbackReason: null,
      provider: payload.provider ?? payload.meta?.provider ?? 'football-data',
    },
    matches,
  }
}
