import matchesData from '../../data/matches.json'

const validStatuses = new Set(['scheduled', 'live', 'finished'])

function normalizeStatus(status) {
  return validStatuses.has(status) ? status : 'scheduled'
}

function normalizeScore(score) {
  if (!score) return null

  return {
    home: Number(score.home) || 0,
    away: Number(score.away) || 0,
  }
}

function getResult(status, score) {
  if (status !== 'finished' || !score) return null
  if (score.home > score.away) return 'home'
  if (score.home < score.away) return 'away'
  return 'draw'
}

function normalizeMatch(match) {
  const status = normalizeStatus(match.status)
  const score = normalizeScore(match.score)

  return {
    id: match.id,
    homeTeam: match.homeTeamId,
    awayTeam: match.awayTeamId,
    kickoffTime: match.kickoff,
    status,
    minute: status === 'live' ? match.minute ?? null : null,
    score,
    result: getResult(status, score),
    source: 'mock',
    odds: match.odds,
    contextRisk: match.contextRisk ?? 50,
    stage: match.stage ?? '',
    venue: match.venue ?? '',
    headline: match.headline ?? '',
  }
}

export function getMockMatchSnapshot() {
  return {
    matchDay: matchesData.matchDay,
    updatedAt: matchesData.updatedAt,
    source: 'mock',
    matches: matchesData.matches.map(normalizeMatch),
  }
}

export async function fetchMatches() {
  return getMockMatchSnapshot()
}
