const FALLBACK_TEAM_FORM_SNAPSHOT = {
  ok: false,
  disabled: true,
  provider: 'none',
  dataSource: 'disabled',
  fallbackReason: 'TEAM_FORM_API_DISABLED',
  teams: [],
}

const statusValues = new Set(['strong', 'stable', 'mixed', 'weak', 'unknown'])
const confidenceValues = new Set(['high', 'medium', 'low'])
const loadValues = new Set(['low', 'medium', 'high', 'unknown'])

export function createFallbackTeamFormSnapshot(options = {}) {
  return {
    ...FALLBACK_TEAM_FORM_SNAPSHOT,
    fallbackReason:
      options.fallbackReason ?? FALLBACK_TEAM_FORM_SNAPSHOT.fallbackReason,
    updatedAt: options.updatedAt ?? new Date().toISOString(),
    meta: {
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

  return {
    teamName: typeof teamData.teamName === 'string' ? teamData.teamName : '',
    formStatus: normalizeStatus(teamData.formStatus),
    confidence: normalizeConfidence(teamData.confidence),
    recentMatches: {
      sampleSize: normalizeNullableNumber(recentMatches.sampleSize),
      wins: normalizeNullableNumber(recentMatches.wins),
      draws: normalizeNullableNumber(recentMatches.draws),
      losses: normalizeNullableNumber(recentMatches.losses),
      goalsFor: normalizeNullableNumber(recentMatches.goalsFor),
      goalsAgainst: normalizeNullableNumber(recentMatches.goalsAgainst),
    },
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
    fallbackReason: teamData.fallbackReason ?? null,
  }
}

function normalizeTeamFormSnapshot(payload) {
  if (!payload || typeof payload !== 'object') {
    return createFallbackTeamFormSnapshot({
      fallbackReason: 'TEAM_FORM_API_INVALID_RESPONSE',
    })
  }

  return {
    ok: payload.ok === true,
    disabled: payload.disabled !== false,
    provider: payload.provider ?? FALLBACK_TEAM_FORM_SNAPSHOT.provider,
    dataSource: payload.dataSource ?? FALLBACK_TEAM_FORM_SNAPSHOT.dataSource,
    updatedAt: payload.updatedAt ?? new Date().toISOString(),
    fallbackReason:
      payload.fallbackReason ?? FALLBACK_TEAM_FORM_SNAPSHOT.fallbackReason,
    teams: Array.isArray(payload.teams)
      ? payload.teams.map(normalizeTeamForm)
      : [],
    meta:
      payload.meta && typeof payload.meta === 'object'
        ? payload.meta
        : { message: 'Team form API is not enabled.' },
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
