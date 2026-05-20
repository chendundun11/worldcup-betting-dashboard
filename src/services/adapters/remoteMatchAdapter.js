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

function hasTeamName(team) {
  return normalizeKey(team).length > 0
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
  const homeTeamName = String(remoteMatch.homeTeam ?? '').trim()
  const awayTeamName = String(remoteMatch.awayTeam ?? '').trim()
  const homeTeam = resolveTeamId(homeTeamName)
  const awayTeam = resolveTeamId(awayTeamName)
  const score = remoteMatch.score
    ? {
        home: Number(remoteMatch.score.home) || 0,
        away: Number(remoteMatch.score.away) || 0,
      }
    : null
  const fallbackId = `${homeTeam}-${awayTeam}-${remoteMatch.kickoffTime ?? 'match'}`

  return {
    ...localMatch,
    id: String(remoteMatch.id ?? localMatch?.id ?? fallbackId),
    homeTeam,
    awayTeam,
    homeTeamName,
    awayTeamName,
    kickoffTime: remoteMatch.kickoffTime ?? localMatch?.kickoffTime,
    status: remoteMatch.status ?? localMatch?.status ?? 'scheduled',
    minute: remoteMatch.minute ?? null,
    score,
    result: remoteMatch.result ?? getResult(remoteMatch.status, score),
    source: remoteMatch.source ?? 'remote',
    odds: localMatch?.odds ?? null,
    contextRisk: localMatch?.contextRisk ?? 50,
    stage: localMatch?.stage ?? remoteMatch.stage ?? '',
    venue: localMatch?.venue ?? remoteMatch.venue ?? '',
    headline: localMatch?.headline ?? '',
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

  const mockSnapshot = getMockMatchSnapshot()
  const localMatchLookup = createLocalMatchLookup(mockSnapshot.matches)
  const matches = payload.matches
    .filter((remoteMatch) =>
      hasTeamName(remoteMatch.homeTeam) && hasTeamName(remoteMatch.awayTeam),
    )
    .map((remoteMatch) => {
      const homeTeam = resolveTeamId(remoteMatch.homeTeam)
      const awayTeam = resolveTeamId(remoteMatch.awayTeam)
      const localMatch = localMatchLookup.get(`${homeTeam}|${awayTeam}`)

      return mergeRemoteMatch(remoteMatch, localMatch)
    })

  return {
    matchDay:
      matches[0]?.kickoffTime?.slice(0, 10) ??
      payload.matchDay ??
      '',
    updatedAt: payload.updatedAt ?? new Date().toISOString(),
    source: payload.source ?? 'remote',
    dataSource: 'real',
    fallbackReason: payload.fallbackReason ?? null,
    provider: payload.provider ?? payload.meta?.provider ?? 'football-data',
    meta: {
      dataSource: 'real',
      fallbackReason: payload.fallbackReason ?? null,
      provider: payload.provider ?? payload.meta?.provider ?? 'football-data',
    },
    matches,
  }
}
