import process from 'node:process'

import { createMockOddsSnapshot } from '../src/data/mockOddsSnapshot.js'
import { fetchTheOddsApiSnapshot } from './providers/theOddsApiAdapter.js'

const DISABLED_ODDS_SNAPSHOT = {
  ok: false,
  disabled: true,
  status: 'disabled',
  provider: 'mock',
  dataSource: 'mock',
  source: 'mock-fallback',
  error: null,
  fallbackReason: 'ODDS_API_DISABLED',
  markets: [],
}

export function createDisabledOddsSnapshot(options = {}) {
  const fallbackSnapshot = createMockOddsSnapshot({
    updatedAt: options.updatedAt,
  })
  const status = options.status ?? DISABLED_ODDS_SNAPSHOT.status
  const source = options.source ?? DISABLED_ODDS_SNAPSHOT.source
  const error = options.error ?? DISABLED_ODDS_SNAPSHOT.error

  return {
    ...DISABLED_ODDS_SNAPSHOT,
    status,
    provider: options.provider ?? fallbackSnapshot.provider,
    dataSource: options.dataSource ?? fallbackSnapshot.dataSource,
    source,
    error,
    updatedAt: options.updatedAt ?? new Date().toISOString(),
    fallbackReason:
      options.fallbackReason ?? DISABLED_ODDS_SNAPSHOT.fallbackReason,
    markets: Array.isArray(options.markets)
      ? options.markets
      : fallbackSnapshot.markets,
    meta: {
      ...fallbackSnapshot.meta,
      status,
      error,
      source,
      message: 'Odds API is not enabled. Mock fallback structure returned.',
      ...(options.meta ?? {}),
    },
  }
}

function createProviderFallback(error) {
  const fallbackReason = error?.code ?? 'ODDS_API_FAILED'

  return createDisabledOddsSnapshot({
    status: 'fallback',
    provider: 'the-odds-api',
    dataSource: 'mock',
    source: 'the-odds-api',
    error: fallbackReason,
    fallbackReason,
    meta: {
      status: 'fallback',
      error: fallbackReason,
      source: 'the-odds-api',
      message: 'The Odds API request failed. Mock fallback structure returned.',
      upstreamStatus: error?.status ?? null,
      usage: error?.usage ?? null,
    },
  })
}

function isTheOddsApiEnabled() {
  return (
    process.env.ODDS_API_ENABLED === 'true' &&
    process.env.ODDS_PROVIDER === 'the-odds-api'
  )
}

function includeMockFallbackMarkets(snapshot) {
  const fallbackSnapshot = createMockOddsSnapshot()
  const marketsByMatchKey = new Map(
    fallbackSnapshot.markets.map((market) => [market.matchKey, market]),
  )

  for (const market of snapshot.markets ?? []) {
    if (typeof market?.matchKey !== 'string' || !market.matchKey) continue
    marketsByMatchKey.set(market.matchKey, market)
  }

  return {
    ...snapshot,
    markets: [...marketsByMatchKey.values()],
    meta: {
      ...snapshot.meta,
      mockFallbackMarkets: [...marketsByMatchKey.values()].filter(
        (market) => market.rawAvailable !== true,
      ).length,
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

    if (!isTheOddsApiEnabled()) {
      sendJson(response, 200, createDisabledOddsSnapshot(), {
        'Cache-Control': 's-maxage=60, stale-while-revalidate=300',
      })
      return
    }

    const apiKey = process.env.THE_ODDS_API_KEY
    if (!apiKey) {
      sendJson(
        response,
        200,
        createProviderFallback({ code: 'ODDS_API_KEY_MISSING' }),
        {
          'Cache-Control': 's-maxage=60, stale-while-revalidate=300',
        },
      )
      return
    }

    const snapshot = await fetchTheOddsApiSnapshot({ apiKey })
    sendJson(response, 200, includeMockFallbackMarkets(snapshot), {
      'Cache-Control': 's-maxage=60, stale-while-revalidate=300',
    })
  } catch (error) {
    sendJson(response, 200, createProviderFallback(error), {
      'Cache-Control': 's-maxage=60, stale-while-revalidate=300',
    })
  }
}
