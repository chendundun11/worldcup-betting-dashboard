const FALLBACK_ODDS_SNAPSHOT = {
  ok: false,
  disabled: true,
  provider: 'none',
  dataSource: 'disabled',
  fallbackReason: 'ODDS_API_DISABLED',
  markets: [],
}

export function createFallbackOddsSnapshot(options = {}) {
  return {
    ...FALLBACK_ODDS_SNAPSHOT,
    fallbackReason: options.fallbackReason ?? FALLBACK_ODDS_SNAPSHOT.fallbackReason,
    updatedAt: options.updatedAt ?? new Date().toISOString(),
    meta: {
      message: options.message ?? 'Odds API is not enabled.',
      ...(options.meta ?? {}),
    },
  }
}

function normalizeOddsSnapshot(payload) {
  if (!payload || typeof payload !== 'object') {
    return createFallbackOddsSnapshot({ fallbackReason: 'ODDS_API_INVALID_RESPONSE' })
  }

  return {
    ok: payload.ok === true,
    disabled: payload.disabled !== false,
    provider: payload.provider ?? FALLBACK_ODDS_SNAPSHOT.provider,
    dataSource: payload.dataSource ?? FALLBACK_ODDS_SNAPSHOT.dataSource,
    updatedAt: payload.updatedAt ?? new Date().toISOString(),
    fallbackReason:
      payload.fallbackReason ?? FALLBACK_ODDS_SNAPSHOT.fallbackReason,
    markets: Array.isArray(payload.markets) ? payload.markets : [],
    meta:
      payload.meta && typeof payload.meta === 'object'
        ? payload.meta
        : { message: 'Odds API is not enabled.' },
  }
}

export async function getOddsSnapshot(options = {}) {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch

  if (typeof fetchImpl !== 'function') {
    return createFallbackOddsSnapshot({ fallbackReason: 'ODDS_API_UNAVAILABLE' })
  }

  try {
    const response = await fetchImpl('/api/odds')
    const payload = await response.json().catch(() => null)

    if (!response.ok) {
      return createFallbackOddsSnapshot({
        fallbackReason: payload?.fallbackReason ?? 'ODDS_API_FAILED',
        message: 'Odds API fallback is active.',
      })
    }

    return normalizeOddsSnapshot(payload)
  } catch {
    return createFallbackOddsSnapshot({
      fallbackReason: 'ODDS_API_FAILED',
      message: 'Odds API request failed.',
    })
  }
}

export default getOddsSnapshot
