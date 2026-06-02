import { createMockOddsSnapshot } from '../src/data/mockOddsSnapshot.js'

const DISABLED_ODDS_SNAPSHOT = {
  ok: false,
  disabled: true,
  provider: 'mock',
  dataSource: 'mock',
  fallbackReason: 'ODDS_API_DISABLED',
  markets: [],
}

export function createDisabledOddsSnapshot(options = {}) {
  const fallbackSnapshot = createMockOddsSnapshot({
    updatedAt: options.updatedAt,
  })

  return {
    ...DISABLED_ODDS_SNAPSHOT,
    provider: options.provider ?? fallbackSnapshot.provider,
    dataSource: options.dataSource ?? fallbackSnapshot.dataSource,
    updatedAt: options.updatedAt ?? new Date().toISOString(),
    fallbackReason:
      options.fallbackReason ?? DISABLED_ODDS_SNAPSHOT.fallbackReason,
    markets: Array.isArray(options.markets)
      ? options.markets
      : fallbackSnapshot.markets,
    meta: {
      ...fallbackSnapshot.meta,
      message: 'Odds API is not enabled. Mock fallback structure returned.',
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
      sendJson(response, 405, createDisabledOddsSnapshot(), { Allow: 'GET' })
      return
    }

    sendJson(response, 200, createDisabledOddsSnapshot(), {
      'Cache-Control': 's-maxage=60, stale-while-revalidate=300',
    })
  } catch {
    sendJson(response, 200, createDisabledOddsSnapshot({
      meta: {
        message: 'Odds API fallback response returned.',
      },
    }))
  }
}
