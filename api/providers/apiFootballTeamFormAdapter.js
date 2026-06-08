const API_FOOTBALL_BASE_URL = 'https://v3.football.api-sports.io'

const TEAM_NAME_ALIASES = new Map([
  ['czechia', 'Czech Republic'],
  ['south korea', 'South Korea'],
  ['united states', 'USA'],
])

export class ApiFootballTeamFormError extends Error {
  constructor(code, options = {}) {
    super(code)
    this.name = 'ApiFootballTeamFormError'
    this.code = code
    this.status = options.status ?? null
  }
}

function normalizeString(value, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function normalizeTeamKey(value) {
  return normalizeString(value).toLowerCase()
}

function normalizeNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function getProviderTeamName(teamName) {
  const normalizedName = normalizeString(teamName)
  return TEAM_NAME_ALIASES.get(normalizeTeamKey(normalizedName)) ?? normalizedName
}

function getErrorCode(status) {
  if (status === 401) return 'TEAM_FORM_API_UNAUTHORIZED'
  if (status === 403) return 'TEAM_FORM_API_FORBIDDEN'
  if (status === 429) return 'TEAM_FORM_API_QUOTA_EXCEEDED'
  if (status >= 500) return 'TEAM_FORM_API_UPSTREAM_ERROR'
  return 'TEAM_FORM_API_REQUEST_FAILED'
}

function hasProviderErrors(errors) {
  if (Array.isArray(errors)) return errors.length > 0
  if (typeof errors === 'string') return errors.trim().length > 0
  if (!errors || typeof errors !== 'object') return false

  return Object.values(errors).some((value) => {
    if (Array.isArray(value)) return value.length > 0
    if (typeof value === 'string') return value.trim().length > 0
    return value != null
  })
}

async function requestProvider(options) {
  const {
    apiKey,
    path,
    params,
    timeoutMs,
    fetchImpl,
  } = options
  const url = new URL(`${API_FOOTBALL_BASE_URL}${path}`)

  for (const [key, value] of Object.entries(params ?? {})) {
    if (value == null || value === '') continue
    url.searchParams.set(key, String(value))
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetchImpl(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'x-apisports-key': apiKey,
      },
      signal: controller.signal,
    })

    if (!response?.ok) {
      throw new ApiFootballTeamFormError(
        getErrorCode(response?.status ?? 0),
        { status: response?.status ?? null },
      )
    }

    let payload
    try {
      payload = await response.json()
    } catch {
      throw new ApiFootballTeamFormError('TEAM_FORM_API_INVALID_RESPONSE')
    }

    if (
      !payload ||
      typeof payload !== 'object' ||
      hasProviderErrors(payload.errors)
    ) {
      throw new ApiFootballTeamFormError(
        hasProviderErrors(payload?.errors)
          ? 'TEAM_FORM_API_PROVIDER_ERROR'
          : 'TEAM_FORM_API_INVALID_RESPONSE',
      )
    }

    if (!Array.isArray(payload.response)) {
      throw new ApiFootballTeamFormError('TEAM_FORM_API_INVALID_RESPONSE')
    }

    return payload.response
  } catch (error) {
    if (error instanceof ApiFootballTeamFormError) throw error
    if (controller.signal.aborted || error?.name === 'AbortError') {
      throw new ApiFootballTeamFormError('TEAM_FORM_API_TIMEOUT')
    }
    throw new ApiFootballTeamFormError('TEAM_FORM_API_NETWORK_ERROR')
  } finally {
    clearTimeout(timeout)
  }
}

function getExactProviderTeam(items, requestedName) {
  const requestedKey = normalizeTeamKey(requestedName)

  for (const item of items) {
    const team = item?.team
    if (
      Number.isInteger(team?.id) &&
      normalizeTeamKey(team?.name) === requestedKey
    ) {
      return {
        id: team.id,
        name: normalizeString(team.name),
      }
    }
  }

  return null
}

function getFixtureResult(fixture, teamId) {
  const homeTeamId = fixture?.teams?.home?.id
  const awayTeamId = fixture?.teams?.away?.id
  const isHome = homeTeamId === teamId
  const isAway = awayTeamId === teamId
  if (!isHome && !isAway) return null

  const homeGoals = normalizeNumber(fixture?.goals?.home)
  const awayGoals = normalizeNumber(fixture?.goals?.away)
  if (homeGoals == null || awayGoals == null) return null

  const goalsFor = isHome ? homeGoals : awayGoals
  const goalsAgainst = isHome ? awayGoals : homeGoals
  const opponent = isHome
    ? normalizeString(fixture?.teams?.away?.name)
    : normalizeString(fixture?.teams?.home?.name)
  const date = normalizeString(fixture?.fixture?.date) || null

  return {
    date,
    opponent,
    venue: isHome ? 'home' : 'away',
    result:
      goalsFor > goalsAgainst
        ? 'win'
        : goalsFor < goalsAgainst
          ? 'loss'
          : 'draw',
    goalsFor,
    goalsAgainst,
  }
}

function deriveResultStatus(results) {
  if (!results.length) return 'unknown'

  const wins = results.filter((result) => result.result === 'win').length
  const losses = results.filter((result) => result.result === 'loss').length
  const winRate = wins / results.length
  const lossRate = losses / results.length

  if (winRate >= 0.6) return 'strong'
  if (lossRate >= 0.6) return 'weak'
  if (wins > 0 && losses > 0) return 'mixed'
  return 'stable'
}

function deriveFormTrend(results, formStatus) {
  if (results.length < 3) return formStatus === 'mixed' ? 'volatile' : formStatus

  let changes = 0
  for (let index = 1; index < results.length; index += 1) {
    if (results[index].result !== results[index - 1].result) changes += 1
  }

  if (changes / (results.length - 1) >= 0.75) return 'volatile'
  if (formStatus === 'strong' || formStatus === 'weak') return formStatus
  return 'stable'
}

function deriveAttackTrend(results) {
  if (!results.length) return 'unknown'
  const average = results.reduce((sum, result) => sum + result.goalsFor, 0) /
    results.length

  if (average >= 1.8) return 'strong'
  if (average < 0.8) return 'weak'
  return 'normal'
}

function deriveDefenseTrend(results) {
  if (!results.length) return 'unknown'
  const average = results.reduce(
    (sum, result) => sum + result.goalsAgainst,
    0,
  ) / results.length

  if (average <= 0.8) return 'strong'
  if (average >= 1.8) return 'weak'
  return 'normal'
}

function deriveVolatility(results) {
  if (results.length < 2) return 'unknown'

  let changes = 0
  for (let index = 1; index < results.length; index += 1) {
    if (results[index].result !== results[index - 1].result) changes += 1
  }

  const changeRate = changes / (results.length - 1)
  if (changeRate >= 0.75) return 'high'
  if (changeRate <= 0.25) return 'low'
  return 'medium'
}

function getScheduleLoad(results) {
  const timestamps = results
    .map((result) => Date.parse(result.date))
    .filter(Number.isFinite)
    .sort((left, right) => right - left)

  if (timestamps.length < 2) {
    return {
      density: 'unknown',
      restDays: null,
      travelRisk: 'unknown',
    }
  }

  const oneDay = 24 * 60 * 60 * 1000
  const spanDays = Math.max(
    0,
    Math.round((timestamps[0] - timestamps[timestamps.length - 1]) / oneDay),
  )
  const restDays = Math.max(
    0,
    Math.round((timestamps[0] - timestamps[1]) / oneDay),
  )

  return {
    density: spanDays <= 14 ? 'high' : spanDays <= 28 ? 'medium' : 'low',
    restDays,
    travelRisk: 'unknown',
  }
}

function createUnmatchedTeam(teamName, fallbackReason) {
  return {
    status: 'fallback',
    teamName,
    formStatus: 'unknown',
    formTrend: 'unknown',
    confidence: 'low',
    recentMatches: {
      sampleSize: null,
      wins: null,
      draws: null,
      losses: null,
      goalsFor: null,
      goalsAgainst: null,
    },
    recentResults: [],
    attackTrend: 'unknown',
    defenseTrend: 'unknown',
    volatility: 'unknown',
    dataQuality: 'low',
    homeAwaySplit: {
      homeStatus: 'unknown',
      awayStatus: 'unknown',
    },
    scheduleLoad: {
      density: 'unknown',
      restDays: null,
      travelRisk: 'unknown',
    },
    trendFlags: [],
    riskFlags: ['remoteTeamFormUnavailable'],
    reviewPoints: ['Remote team form data requires exact team identity matching.'],
    riskNotes: [],
    fallbackReason,
    rawAvailable: false,
  }
}

function createNormalizedTeam(teamName, providerTeam, fixtures) {
  const results = fixtures
    .map((fixture) => getFixtureResult(fixture, providerTeam.id))
    .filter(Boolean)
    .sort((left, right) => Date.parse(right.date) - Date.parse(left.date))
  const wins = results.filter((result) => result.result === 'win').length
  const draws = results.filter((result) => result.result === 'draw').length
  const losses = results.filter((result) => result.result === 'loss').length
  const goalsFor = results.reduce((sum, result) => sum + result.goalsFor, 0)
  const goalsAgainst = results.reduce(
    (sum, result) => sum + result.goalsAgainst,
    0,
  )

  if (!results.length) {
    return createUnmatchedTeam(teamName, 'TEAM_FORM_DATA_UNAVAILABLE')
  }

  const formStatus = deriveResultStatus(results)
  const volatility = deriveVolatility(results)
  const scheduleLoad = getScheduleLoad(results)
  const riskFlags = []
  if (results.length < 3) riskFlags.push('recentMatchSampleSmall')
  if (volatility === 'high') riskFlags.push('recentResultsVolatile')
  if (scheduleLoad.density === 'high') riskFlags.push('scheduleDensityHigh')

  return {
    status: 'available',
    teamName,
    formStatus,
    formTrend: deriveFormTrend(results, formStatus),
    confidence: results.length >= 5 ? 'high' : results.length >= 3 ? 'medium' : 'low',
    recentMatches: {
      sampleSize: results.length,
      wins,
      draws,
      losses,
      goalsFor,
      goalsAgainst,
    },
    recentResults: results,
    attackTrend: deriveAttackTrend(results),
    defenseTrend: deriveDefenseTrend(results),
    volatility,
    dataQuality: results.length >= 5 ? 'high' : results.length >= 3 ? 'medium' : 'low',
    homeAwaySplit: {
      homeStatus: deriveResultStatus(
        results.filter((result) => result.venue === 'home'),
      ),
      awayStatus: deriveResultStatus(
        results.filter((result) => result.venue === 'away'),
      ),
    },
    scheduleLoad,
    trendFlags: ['remoteRecentMatchesAvailable'],
    riskFlags,
    reviewPoints: [
      'Recent results are normalized from the configured provider for review only.',
    ],
    riskNotes: [],
    fallbackReason: null,
    rawAvailable: true,
  }
}

async function fetchTeamForm(options) {
  const {
    apiKey,
    teamName,
    recentLimit,
    timeoutMs,
    fetchImpl,
  } = options
  const providerTeamName = getProviderTeamName(teamName)
  const teamItems = await requestProvider({
    apiKey,
    path: '/teams',
    params: { search: providerTeamName },
    timeoutMs,
    fetchImpl,
  })
  const providerTeam = getExactProviderTeam(teamItems, providerTeamName)

  if (!providerTeam) {
    return createUnmatchedTeam(teamName, 'TEAM_FORM_TEAM_UNMATCHED')
  }

  const fixtureItems = await requestProvider({
    apiKey,
    path: '/fixtures',
    params: {
      team: providerTeam.id,
      last: recentLimit,
    },
    timeoutMs,
    fetchImpl,
  })

  return createNormalizedTeam(teamName, providerTeam, fixtureItems)
}

export async function fetchApiFootballTeamFormSnapshot(options = {}) {
  const {
    apiKey,
    teamNames = [],
    recentLimit = 5,
    timeoutMs = 5000,
    fetchImpl = globalThis.fetch,
  } = options

  if (!normalizeString(apiKey)) {
    throw new ApiFootballTeamFormError('TEAM_FORM_API_KEY_MISSING')
  }
  if (typeof fetchImpl !== 'function') {
    throw new ApiFootballTeamFormError('TEAM_FORM_API_UNAVAILABLE')
  }

  const normalizedTeamNames = [
    ...new Set(
      teamNames
        .map((teamName) => normalizeString(teamName))
        .filter(Boolean),
    ),
  ]

  if (!normalizedTeamNames.length) {
    throw new ApiFootballTeamFormError('TEAM_FORM_TEAMS_MISSING')
  }

  const teams = []
  for (const teamName of normalizedTeamNames) {
    teams.push(await fetchTeamForm({
      apiKey,
      teamName,
      recentLimit,
      timeoutMs,
      fetchImpl,
    }))
  }

  if (!teams.some((team) => team.rawAvailable === true)) {
    const fallbackReason = teams.every(
      (team) => team.fallbackReason === 'TEAM_FORM_TEAM_UNMATCHED',
    )
      ? 'TEAM_FORM_TEAM_UNMATCHED'
      : 'TEAM_FORM_DATA_UNAVAILABLE'
    throw new ApiFootballTeamFormError(fallbackReason)
  }

  return {
    ok: true,
    disabled: false,
    status: 'available',
    provider: 'api-football',
    dataSource: 'remote',
    source: 'api-football',
    error: null,
    updatedAt: new Date().toISOString(),
    fallbackReason: null,
    teams,
    rawAvailable: true,
    meta: {
      schemaVersion: 'team-form-snapshot-v1',
      status: 'available',
      error: null,
      source: 'api-football',
      message: 'API-Football team form snapshot normalized successfully.',
      requestedTeams: normalizedTeamNames.length,
      availableTeams: teams.filter((team) => team.rawAvailable === true).length,
      unmatchedTeams: teams.filter(
        (team) => team.fallbackReason === 'TEAM_FORM_TEAM_UNMATCHED',
      ).length,
    },
  }
}

export default fetchApiFootballTeamFormSnapshot
