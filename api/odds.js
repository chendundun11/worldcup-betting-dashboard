const DISABLED_ODDS_SNAPSHOT = {
  ok: false,
  disabled: true,
  provider: 'none',
  dataSource: 'disabled',
  fallbackReason: 'ODDS_API_DISABLED',
  markets: [],
}

export function createDisabledOddsSnapshot(options = {}) {
  return {
    ...DISABLED_ODDS_SNAPSHOT,
    updatedAt: options.updatedAt ?? new Date().toISOString(),
    meta: {
      message: 'Odds API is not enabled.',
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
