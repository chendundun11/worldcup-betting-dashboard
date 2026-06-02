const FALLBACK_TEAM_FORM_SNAPSHOT = {
  ok: false,
  disabled: true,
  status: 'disabled',
  provider: 'none',
  dataSource: 'disabled',
  source: 'disabled-fallback',
  error: null,
  fallbackReason: 'TEAM_FORM_API_DISABLED',
  teams: [],
}

const statusValues = new Set(['strong', 'stable', 'mixed', 'weak', 'unknown'])
const formTrendValues = new Set(['strong', 'stable', 'weak', 'volatile', 'unknown'])
const attackDefenseTrendValues = new Set(['strong', 'normal', 'weak', 'unknown'])
const confidenceValues = new Set(['high', 'medium', 'low'])
const loadValues = new Set(['low', 'medium', 'high', 'unknown'])

export function createFallbackTeamFormSnapshot(options = {}) {
  const status = options.status ?? FALLBACK_TEAM_FORM_SNAPSHOT.status
  const source = options.source ?? FALLBACK_TEAM_FORM_SNAPSHOT.source
  const error = options.error ?? FALLBACK_TEAM_FORM_SNAPSHOT.error

  return {
    ...FALLBACK_TEAM_FORM_SNAPSHOT,
    status,
    fallbackReason:
      options.fallbackReason ?? FALLBACK_TEAM_FORM_SNAPSHOT.fallbackReason,
    source,
    error,
    updatedAt: options.updatedAt ?? new Date().toISOString(),
    meta: {
      status,
      error,
      source,
      message: options.message ?? 'Team form API is not enabled.',
      ...(options.meta ?? {}),
    },
  }
}

function normalizeNullableNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function normalizeStatus(value) {
  return statusValues.has(value) ? value : 'unknown'
}

function normalizeString(value, fallback = '') {
  return typeof value === 'string' && value.trim() ? value : fallback
}

function normalizeFormTrend(value, formStatus) {
  if (formTrendValues.has(value)) return value
  if (formStatus === 'mixed') return 'volatile'
  if (formStatusValues.has(formStatus)) return formStatus
  return 'unknown'
}

const formStatusValues = new Set(['strong', 'stable', 'weak', 'unknown'])

function normalizeAttackDefenseTrend(value) {
  return attackDefenseTrendValues.has(value) ? value : 'unknown'
}

function normalizeConfidence(value) {
  return confidenceValues.has(value) ? value : 'low'
}

function normalizeLoad(value) {
  return loadValues.has(value) ? value : 'unknown'
}

function normalizeStringList(value) {
  return Array.isArray(value)
    ? value.filter((item) => typeof item === 'string')
    : []
}

function normalizeRecentResults(value) {
  return Array.isArray(value)
    ? value.map((item) => (
        item && typeof item === 'object' && !Array.isArray(item)
          ? { ...item }
          : item
      ))
    : []
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

function normalizeTeamForm(teamForm) {
  const teamData = teamForm && typeof teamForm === 'object' ? teamForm : {}
  const recentMatches =
    teamData.recentMatches && typeof teamData.recentMatches === 'object'
      ? teamData.recentMatches
      : {}
  const homeAwaySplit =
    teamData.homeAwaySplit && typeof teamData.homeAwaySplit === 'object'
      ? teamData.homeAwaySplit
      : {}
  const scheduleLoad =
    teamData.scheduleLoad && typeof teamData.scheduleLoad === 'object'
      ? teamData.scheduleLoad
      : {}
  const normalizedFormStatus = normalizeStatus(teamData.formStatus)

  return {
    status: normalizeString(teamData.status, 'mock'),
    teamName: typeof teamData.teamName === 'string' ? teamData.teamName : '',
    formStatus: normalizedFormStatus,
    formTrend: normalizeFormTrend(teamData.formTrend, normalizedFormStatus),
    confidence: normalizeConfidence(teamData.confidence),
    recentMatches: {
      sampleSize: normalizeNullableNumber(recentMatches.sampleSize),
      wins: normalizeNullableNumber(recentMatches.wins),
      draws: normalizeNullableNumber(recentMatches.draws),
      losses: normalizeNullableNumber(recentMatches.losses),
      goalsFor: normalizeNullableNumber(recentMatches.goalsFor),
      goalsAgainst: normalizeNullableNumber(recentMatches.goalsAgainst),
    },
    recentResults: normalizeRecentResults(teamData.recentResults),
    attackTrend: normalizeAttackDefenseTrend(teamData.attackTrend),
    defenseTrend: normalizeAttackDefenseTrend(teamData.defenseTrend),
    volatility: normalizeLoad(teamData.volatility),
    dataQuality: normalizeLoad(teamData.dataQuality),
    homeAwaySplit: {
      homeStatus: normalizeStatus(homeAwaySplit.homeStatus),
      awayStatus: normalizeStatus(homeAwaySplit.awayStatus),
    },
    scheduleLoad: {
      density: normalizeLoad(scheduleLoad.density),
      restDays: normalizeNullableNumber(scheduleLoad.restDays),
      travelRisk: normalizeLoad(scheduleLoad.travelRisk),
    },
    trendFlags: normalizeStringList(teamData.trendFlags),
    riskFlags: normalizeStringList(teamData.riskFlags),
    reviewPoints: normalizeStringList(teamData.reviewPoints),
    riskNotes: normalizeStringList(teamData.riskNotes),
    fallbackReason: teamData.fallbackReason ?? null,
    rawAvailable: teamData.rawAvailable === true,
  }
}

function normalizeTeamFormSnapshot(payload) {
  if (!payload || typeof payload !== 'object') {
    return createFallbackTeamFormSnapshot({
      fallbackReason: 'TEAM_FORM_API_INVALID_RESPONSE',
    })
  }

  const disabled = payload.disabled !== false
  const status = normalizeString(
    payload.status,
    disabled ? FALLBACK_TEAM_FORM_SNAPSHOT.status : 'available',
  )
  const source = normalizeString(payload.source, payload.dataSource ?? FALLBACK_TEAM_FORM_SNAPSHOT.source)
  const error =
    typeof payload.error === 'string' && payload.error.trim()
      ? payload.error
      : null

  return {
    ok: payload.ok === true,
    disabled,
    status,
    provider: payload.provider ?? FALLBACK_TEAM_FORM_SNAPSHOT.provider,
    dataSource: payload.dataSource ?? FALLBACK_TEAM_FORM_SNAPSHOT.dataSource,
    source,
    error,
    updatedAt: payload.updatedAt ?? new Date().toISOString(),
    fallbackReason:
      payload.fallbackReason ?? FALLBACK_TEAM_FORM_SNAPSHOT.fallbackReason,
    teams: Array.isArray(payload.teams)
      ? payload.teams.map(normalizeTeamForm)
      : [],
    meta: normalizeMeta(payload.meta, {
      status,
      error,
      source,
      message: 'Team form API is not enabled.',
    }),
  }
}

export async function getTeamFormSnapshot(options = {}) {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch

  if (typeof fetchImpl !== 'function') {
    return createFallbackTeamFormSnapshot({
      fallbackReason: 'TEAM_FORM_API_UNAVAILABLE',
    })
  }

  try {
    const response = await fetchImpl('/api/team-form')
    const payload = await response.json().catch(() => null)

    if (!response.ok) {
      return createFallbackTeamFormSnapshot({
        fallbackReason: payload?.fallbackReason ?? 'TEAM_FORM_API_FAILED',
        message: 'Team form API fallback is active.',
      })
    }

    return normalizeTeamFormSnapshot(payload)
  } catch {
    return createFallbackTeamFormSnapshot({
      fallbackReason: 'TEAM_FORM_API_FAILED',
      message: 'Team form API request failed.',
    })
  }
}

export default getTeamFormSnapshot
