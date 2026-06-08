import process from 'node:process'

import { createMockTeamFormSnapshot } from '../src/data/mockTeamFormSnapshot.js'
import { fetchApiFootballTeamFormSnapshot } from './providers/apiFootballTeamFormAdapter.js'

const SAFE_PROVIDER_STAGES = new Set([
  'teams_search',
  'fixtures_recent',
  'parse_json',
  'provider_errors',
  'timeout',
  'network',
  'unknown',
])

const SAFE_ERROR_CODES = new Set([
  'API_FOOTBALL_KEY_MISSING',
  'API_FOOTBALL_AUTH_ERROR',
  'API_FOOTBALL_FORBIDDEN',
  'API_FOOTBALL_RATE_LIMIT',
  'API_FOOTBALL_UPSTREAM_ERROR',
  'API_FOOTBALL_INVALID_JSON',
  'API_FOOTBALL_PROVIDER_ERRORS',
  'API_FOOTBALL_TIMEOUT',
  'API_FOOTBALL_NETWORK_ERROR',
  'API_FOOTBALL_TEAM_UNMATCHED',
  'API_FOOTBALL_DATA_UNAVAILABLE',
])

const PROVIDER_ERROR_KEY_PATTERN = /^[A-Za-z0-9_-]{1,40}$/
const MAX_PROVIDER_ERROR_KEYS = 10

const DISABLED_TEAM_FORM_SNAPSHOT = {
  ok: false,
  disabled: true,
  status: 'disabled',
  provider: 'mock',
  dataSource: 'mock',
  source: 'mock-fallback',
  error: null,
  fallbackReason: 'TEAM_FORM_API_DISABLED',
  teams: [],
  rawAvailable: false,
}

export function createDisabledTeamFormSnapshot(options = {}) {
  const fallbackSnapshot = createMockTeamFormSnapshot({
    updatedAt: options.updatedAt,
  })
  const status = options.status ?? DISABLED_TEAM_FORM_SNAPSHOT.status
  const source = options.source ?? DISABLED_TEAM_FORM_SNAPSHOT.source
  const error = options.error ?? DISABLED_TEAM_FORM_SNAPSHOT.error

  return {
    ...DISABLED_TEAM_FORM_SNAPSHOT,
    status,
    provider: options.provider ?? fallbackSnapshot.provider,
    dataSource: options.dataSource ?? fallbackSnapshot.dataSource,
    source,
    error,
    updatedAt: options.updatedAt ?? new Date().toISOString(),
    fallbackReason:
      options.fallbackReason ?? DISABLED_TEAM_FORM_SNAPSHOT.fallbackReason,
    teams: Array.isArray(options.teams)
      ? options.teams
      : fallbackSnapshot.teams,
    meta: {
      ...fallbackSnapshot.meta,
      status,
      error,
      source,
      message: 'Team form API is not enabled. Mock fallback structure returned.',
      ...(options.meta ?? {}),
    },
  }
}

function sanitizeProviderErrorKeys(keys) {
  if (!Array.isArray(keys)) return []

  const safeKeys = []
  for (const key of keys) {
    if (
      typeof key !== 'string' ||
      !PROVIDER_ERROR_KEY_PATTERN.test(key) ||
      safeKeys.includes(key)
    ) {
      continue
    }

    safeKeys.push(key)
    if (safeKeys.length === MAX_PROVIDER_ERROR_KEYS) break
  }

  return safeKeys
}

function createProviderFallback(error) {
  const fallbackReason = error?.code ?? 'TEAM_FORM_API_FAILED'
  const errorCode = SAFE_ERROR_CODES.has(error?.errorCode)
    ? error.errorCode
    : 'API_FOOTBALL_UPSTREAM_ERROR'
  const providerStage = SAFE_PROVIDER_STAGES.has(error?.providerStage)
    ? error.providerStage
    : 'unknown'
  const errorUpstreamStatus = error?.upstreamStatus ?? error?.status
  const upstreamStatus =
    Number.isInteger(errorUpstreamStatus) &&
    errorUpstreamStatus >= 100 &&
    errorUpstreamStatus <= 599
      ? errorUpstreamStatus
      : null
  const providerErrorMeta =
    errorCode === 'API_FOOTBALL_PROVIDER_ERRORS'
      ? {
          providerErrorKeys: sanitizeProviderErrorKeys(
            error?.providerErrorKeys,
          ),
        }
      : {}
  const fallbackSnapshot = createMockTeamFormSnapshot()
  const teams = fallbackSnapshot.teams.map((team) => ({
    ...team,
    status: 'fallback',
    formStatus: 'unknown',
    formTrend: 'unknown',
    confidence: 'low',
    dataQuality: 'low',
    fallbackReason,
    rawAvailable: false,
  }))

  return createDisabledTeamFormSnapshot({
    status: 'fallback',
    provider: 'api-football',
    dataSource: 'mock',
    source: 'api-football',
    error: fallbackReason,
    fallbackReason,
    teams,
    meta: {
      status: 'fallback',
      error: fallbackReason,
      source: 'api-football',
      message: 'API-Football request failed. Mock fallback structure returned.',
      errorCode,
      providerStage,
      upstreamStatus,
      ...providerErrorMeta,
    },
  })
}

function isApiFootballEnabled() {
  return (
    process.env.TEAM_FORM_API_ENABLED === 'true' &&
    process.env.TEAM_FORM_PROVIDER === 'api-football'
  )
}

function getConfiguredTeamNames() {
  return createMockTeamFormSnapshot().teams
    .map((team) => team.teamName)
    .filter((teamName) => typeof teamName === 'string' && teamName.trim())
}

function sendJson(response, statusCode, body, headers = {}) {
  for (const [key, value] of Object.entries(headers)) {
    response.setHeader(key, value)
  }

  response.status(statusCode).json(body)
}

export default async function handler(request, response) {
  try {
    if (request.method !== 'GET') {
      sendJson(response, 405, createDisabledTeamFormSnapshot(), { Allow: 'GET' })
      return
    }

    if (!isApiFootballEnabled()) {
      sendJson(response, 200, createDisabledTeamFormSnapshot(), {
        'Cache-Control': 's-maxage=60, stale-while-revalidate=300',
      })
      return
    }

    const apiKey = process.env.API_FOOTBALL_KEY
    if (!apiKey) {
      sendJson(
        response,
        200,
        createProviderFallback({
          code: 'TEAM_FORM_API_KEY_MISSING',
          errorCode: 'API_FOOTBALL_KEY_MISSING',
          providerStage: 'unknown',
        }),
        {
          'Cache-Control': 's-maxage=60, stale-while-revalidate=300',
        },
      )
      return
    }

    const snapshot = await fetchApiFootballTeamFormSnapshot({
      apiKey,
      teamNames: getConfiguredTeamNames(),
    })
    sendJson(response, 200, snapshot, {
      'Cache-Control': 's-maxage=60, stale-while-revalidate=300',
    })
  } catch (error) {
    sendJson(response, 200, createProviderFallback(error), {
      'Cache-Control': 's-maxage=60, stale-while-revalidate=300',
    })
  }
}
