import { createMockTeamFormSnapshot } from '../src/data/mockTeamFormSnapshot.js'

const DISABLED_TEAM_FORM_SNAPSHOT = {
  ok: false,
  disabled: true,
  provider: 'mock',
  dataSource: 'mock',
  fallbackReason: 'TEAM_FORM_API_DISABLED',
  teams: [],
}

export function createDisabledTeamFormSnapshot(options = {}) {
  const fallbackSnapshot = createMockTeamFormSnapshot({
    updatedAt: options.updatedAt,
  })

  return {
    ...DISABLED_TEAM_FORM_SNAPSHOT,
    provider: options.provider ?? fallbackSnapshot.provider,
    dataSource: options.dataSource ?? fallbackSnapshot.dataSource,
    updatedAt: options.updatedAt ?? new Date().toISOString(),
    fallbackReason:
      options.fallbackReason ?? DISABLED_TEAM_FORM_SNAPSHOT.fallbackReason,
    teams: Array.isArray(options.teams)
      ? options.teams
      : fallbackSnapshot.teams,
    meta: {
      ...fallbackSnapshot.meta,
      message: 'Team form API is not enabled. Mock fallback structure returned.',
      ...(options.meta ?? {}),
    },
  }
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

    sendJson(response, 200, createDisabledTeamFormSnapshot(), {
      'Cache-Control': 's-maxage=60, stale-while-revalidate=300',
    })
  } catch {
    sendJson(response, 200, createDisabledTeamFormSnapshot({
      meta: {
        message: 'Team form API fallback response returned.',
      },
    }))
  }
}
