import process from 'node:process'

import { createMockTeamFormSnapshot } from '../src/data/mockTeamFormSnapshot.js'
import { fetchApiFootballTeamFormSnapshot } from './providers/apiFootballTeamFormAdapter.js'

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

function createProviderFallback(error) {
  const fallbackReason = error?.code ?? 'TEAM_FORM_API_FAILED'
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
      upstreamStatus: error?.status ?? null,
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
        createProviderFallback({ code: 'TEAM_FORM_API_KEY_MISSING' }),
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
