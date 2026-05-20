const FOOTBALL_DATA_BASE_URL = 'https://api.football-data.org/v4'

function normalizeStatus(status) {
  if (status === 'FINISHED' || status === 'AWARDED') return 'finished'
  if (status === 'IN_PLAY' || status === 'PAUSED' || status === 'LIVE') {
    return 'live'
  }
  return 'scheduled'
}

function getScore(match) {
  const score =
    match.score?.fullTime ??
    match.score?.regularTime ??
    match.score?.extraTime ??
    match.score?.penalties

  if (score?.home == null || score?.away == null) return null

  return {
    home: Number(score.home),
    away: Number(score.away),
  }
}

function getResult(status, score, winner) {
  if (status !== 'finished') return null
  if (winner === 'HOME_TEAM') return 'home'
  if (winner === 'AWAY_TEAM') return 'away'
  if (winner === 'DRAW') return 'draw'
  if (!score) return null
  if (score.home > score.away) return 'home'
  if (score.home < score.away) return 'away'
  return 'draw'
}

function normalizeTeam(team) {
  return team?.name ?? team?.shortName ?? team?.tla ?? String(team?.id ?? '')
}

function normalizeMatch(match) {
  const status = normalizeStatus(match.status)
  const score = getScore(match)

  return {
    id: String(match.id),
    homeTeam: normalizeTeam(match.homeTeam),
    awayTeam: normalizeTeam(match.awayTeam),
    kickoffTime: match.utcDate,
    status,
    minute: null,
    score,
    result: getResult(status, score, match.score?.winner),
    source: 'football-data',
  }
}

function buildFootballDataUrl() {
  const competitionCode = process.env.FOOTBALL_COMPETITION_CODE || 'WC'
  const url = new URL(
    `${FOOTBALL_DATA_BASE_URL}/competitions/${competitionCode}/matches`,
  )

  if (process.env.FOOTBALL_SEASON) {
    url.searchParams.set('season', process.env.FOOTBALL_SEASON)
  }

  if (process.env.FOOTBALL_DATE_FROM) {
    url.searchParams.set('dateFrom', process.env.FOOTBALL_DATE_FROM)
  }

  if (process.env.FOOTBALL_DATE_TO) {
    url.searchParams.set('dateTo', process.env.FOOTBALL_DATE_TO)
  }

  return url
}

export default async function handler(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET')
    response.status(405).json({ error: 'Method not allowed' })
    return
  }

  const token = process.env.FOOTBALL_API_KEY

  if (!token) {
    response.status(500).json({ error: 'FOOTBALL_API_KEY is not configured' })
    return
  }

  try {
    const footballResponse = await fetch(buildFootballDataUrl(), {
      headers: {
        'X-Auth-Token': token,
      },
    })

    if (!footballResponse.ok) {
      const details = await footballResponse.text()
      response.status(footballResponse.status).json({
        error: 'football-data.org request failed',
        details,
      })
      return
    }

    const payload = await footballResponse.json()
    const matches = Array.isArray(payload.matches)
      ? payload.matches.map(normalizeMatch)
      : []

    response.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300')
    response.status(200).json({
      provider: process.env.FOOTBALL_API_PROVIDER || 'football-data',
      source: 'football-data',
      updatedAt: new Date().toISOString(),
      matches,
    })
  } catch (error) {
    response.status(500).json({
      error: 'Unable to fetch football-data.org matches',
      details: error instanceof Error ? error.message : String(error),
    })
  }
}
