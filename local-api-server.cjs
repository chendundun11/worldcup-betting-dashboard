const http = require('node:http')
const fs = require('node:fs')
const path = require('node:path')

const FOOTBALL_DATA_BASE_URL = 'https://api.football-data.org/v4'
const matchesData = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'src', 'data', 'matches.json'), 'utf8'),
)

function parseEnvLine(line) {
  const trimmedLine = line.trim()
  if (!trimmedLine || trimmedLine.startsWith('#')) return null

  const normalizedLine = trimmedLine.startsWith('export ')
    ? trimmedLine.slice(7).trim()
    : trimmedLine
  const separatorIndex = normalizedLine.indexOf('=')
  if (separatorIndex === -1) return null

  const key = normalizedLine.slice(0, separatorIndex).trim().replace(/^\uFEFF/, '')
  let value = normalizedLine.slice(separatorIndex + 1).trim()

  if (!key) return null

  const quote = value[0]
  if (
    (quote === '"' || quote === "'") &&
    value.endsWith(quote)
  ) {
    value = value.slice(1, -1)
  } else {
    value = value.replace(/\s+#.*$/, '').trim()
  }

  return [key, value]
}

function loadLocalEnv() {
  const loadedKeys = new Set()
  const envFiles = ['.env', '.env.local']
  const loadedFiles = []

  for (const envFile of envFiles) {
    const envPath = path.join(process.cwd(), envFile)
    if (!fs.existsSync(envPath)) continue

    loadedFiles.push(envFile)
    const envContent = fs.readFileSync(envPath, 'utf8')
    for (const line of envContent.split(/\r?\n/)) {
      const parsedLine = parseEnvLine(line)
      if (!parsedLine) continue

      const [key, value] = parsedLine
      if (
        process.env[key] === undefined ||
        process.env[key] === '' ||
        loadedKeys.has(key)
      ) {
        process.env[key] = value
        loadedKeys.add(key)
      }
    }
  }

  return loadedFiles
}

const loadedEnvFiles = loadLocalEnv()

const PORT = Number(process.env.LOCAL_API_PORT || process.env.PORT || 3001)

function createMeta(dataSource, fallbackReason = null, provider = process.env.FOOTBALL_API_PROVIDER || 'football-data') {
  return {
    dataSource,
    fallbackReason,
    provider,
  }
}

function sendJson(response, statusCode, body, headers = {}) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    ...headers,
  })
  response.end(
    JSON.stringify({
      ...body,
      meta: createMeta(body.dataSource, body.fallbackReason, body.provider),
    }),
  )
}

function createDisabledOddsSnapshot() {
  return {
    ok: false,
    disabled: true,
    provider: 'none',
    dataSource: 'disabled',
    updatedAt: new Date().toISOString(),
    fallbackReason: 'ODDS_API_DISABLED',
    markets: [],
    meta: {
      message: 'Odds API is not enabled.',
    },
  }
}

function createDisabledTeamFormSnapshot() {
  return {
    ok: false,
    disabled: true,
    provider: 'mock',
    dataSource: 'mock',
    updatedAt: new Date().toISOString(),
    fallbackReason: 'TEAM_FORM_API_DISABLED',
    teams: [],
    meta: {
      schemaVersion: 'team-form-snapshot-v1',
      message: 'Team form API is not enabled.',
    },
  }
}

function sendRawJson(response, statusCode, body, headers = {}) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    ...headers,
  })
  response.end(JSON.stringify(body))
}

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

function normalizeMockStatus(status) {
  return ['scheduled', 'live', 'finished'].includes(status) ? status : 'scheduled'
}

function normalizeMockScore(score) {
  if (!score) return null

  return {
    home: Number(score.home) || 0,
    away: Number(score.away) || 0,
  }
}

function normalizeMockMatch(match) {
  const status = normalizeMockStatus(match.status)
  const score = normalizeMockScore(match.score)

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

function createMockMatchSnapshot(fallbackReason, extra = {}) {
  return {
    dataSource: 'mock',
    fallbackReason,
    provider: 'mock',
    matchDay: matchesData.matchDay,
    updatedAt: new Date().toISOString(),
    matches: matchesData.matches.map(normalizeMockMatch),
    ...extra,
  }
}

function sendMockMatches(response, fallbackReason, extra = {}) {
  sendJson(response, 200, createMockMatchSnapshot(fallbackReason, extra), {
    'Cache-Control': 'no-store',
  })
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
    stage: match.stage ?? match.group ?? '',
    venue: match.venue ?? '',
  }
}

function getMatchDay(matches) {
  return matches[0]?.kickoffTime?.slice(0, 10) ?? ''
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

async function handleMatches(request, response) {
  if (request.method !== 'GET') {
    sendJson(
      response,
      405,
      {
        dataSource: 'fallback',
        fallbackReason: 'API_FAILED',
        provider: process.env.FOOTBALL_API_PROVIDER || 'football-data',
        updatedAt: new Date().toISOString(),
        matches: [],
        error: 'Method not allowed',
      },
      { Allow: 'GET' },
    )
    return
  }

  const token = process.env.FOOTBALL_API_KEY

  if (!token) {
    sendMockMatches(response, 'API_KEY_MISSING', {
      error: 'FOOTBALL_API_KEY is not configured',
    })
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
      sendMockMatches(response, footballResponse.status === 429 ? 'API_RATE_LIMITED' : 'API_FAILED', {
        error: 'football-data.org request failed',
        statusCode: footballResponse.status,
        details,
      })
      return
    }

    const payload = await footballResponse.json()

    if (!Array.isArray(payload.matches)) {
      sendMockMatches(response, 'INVALID_RESPONSE', {
        error: 'football-data.org returned an invalid response',
      })
      return
    }

    const matches = payload.matches.map(normalizeMatch)
    const fallbackReason = matches.length ? null : 'COMPETITION_NO_DATA'

    sendJson(
      response,
      200,
      {
        dataSource: matches.length ? 'real' : 'fallback',
        fallbackReason,
        provider: process.env.FOOTBALL_API_PROVIDER || 'football-data',
        matchDay: getMatchDay(matches),
        updatedAt: new Date().toISOString(),
        matches,
      },
      { 'Cache-Control': 's-maxage=60, stale-while-revalidate=300' },
    )
  } catch (error) {
    sendMockMatches(response, 'API_FAILED', {
      error: 'Unable to fetch football-data.org matches',
      details: error instanceof Error ? error.message : String(error),
    })
  }
}

function handleOdds(request, response) {
  if (request.method !== 'GET') {
    sendRawJson(response, 405, createDisabledOddsSnapshot(), { Allow: 'GET' })
    return
  }

  sendRawJson(response, 200, createDisabledOddsSnapshot(), {
    'Cache-Control': 's-maxage=60, stale-while-revalidate=300',
  })
}

function handleTeamForm(request, response) {
  if (request.method !== 'GET') {
    sendRawJson(response, 405, createDisabledTeamFormSnapshot(), { Allow: 'GET' })
    return
  }

  sendRawJson(response, 200, createDisabledTeamFormSnapshot(), {
    'Cache-Control': 's-maxage=60, stale-while-revalidate=300',
  })
}

const server = http.createServer((request, response) => {
  const requestUrl = new URL(request.url, `http://${request.headers.host}`)

  if (requestUrl.pathname === '/api/team-form') {
    handleTeamForm(request, response)
    return
  }

  if (requestUrl.pathname === '/api/odds') {
    handleOdds(request, response)
    return
  }

  if (requestUrl.pathname === '/api/matches') {
    handleMatches(request, response)
    return
  }

  sendJson(response, 404, {
    dataSource: 'fallback',
    fallbackReason: 'API_FAILED',
    provider: process.env.FOOTBALL_API_PROVIDER || 'football-data',
    updatedAt: new Date().toISOString(),
    matches: [],
    error: 'Not found',
  })
})

server.listen(PORT, () => {
  console.log(`Local API server listening on http://localhost:${PORT}`)
  console.log(`Local env files loaded: ${loadedEnvFiles.join(', ') || 'none'}`)
  console.log(`FOOTBALL_API_KEY loaded: ${Boolean(process.env.FOOTBALL_API_KEY)}`)
})
