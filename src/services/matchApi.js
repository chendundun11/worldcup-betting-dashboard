import {
  fetchMatches as fetchMockMatches,
  getMockMatchSnapshot,
} from './adapters/mockMatchAdapter'
import { fetchMatches as fetchRemoteMatches } from './adapters/remoteMatchAdapter'
import { fetchMatches as fetchFootballDataMatches } from './adapters/footballDataAdapter'

const adapters = {
  mock: fetchMockMatches,
  remote: fetchRemoteMatches,
  footballData: fetchFootballDataMatches,
}

const defaultAdapter = 'remote'
const mockFallbackReasons = new Set([
  'API_KEY_MISSING',
  'API_FAILED',
  'INVALID_RESPONSE',
  'COMPETITION_NO_DATA',
])

function createEmptySnapshot(source = 'empty', fallbackReason = 'INVALID_RESPONSE') {
  const meta = {
    dataSource: 'fallback',
    fallbackReason,
    provider: source,
  }

  return {
    matchDay: '',
    updatedAt: new Date().toISOString(),
    source,
    dataSource: meta.dataSource,
    fallbackReason: meta.fallbackReason,
    provider: meta.provider,
    meta,
    matches: [],
  }
}

export function getInitialMatchSnapshot() {
  try {
    return getMockMatchSnapshot()
  } catch (error) {
    console.warn('Mock match snapshot failed, using empty match list.', error)
    return createEmptySnapshot('empty-fallback')
  }
}

export async function getMatches(options = {}) {
  const adapterName = options.adapter || defaultAdapter
  const fetchAdapter = adapters[adapterName] || fetchMockMatches

  try {
    const snapshot = await fetchAdapter()
    return {
      ...snapshot,
      meta: snapshot.meta ?? {
        dataSource: snapshot.dataSource ?? 'real',
        fallbackReason: snapshot.fallbackReason ?? null,
        provider: snapshot.provider ?? adapterName,
      },
    }
  } catch (error) {
    console.warn(`Match adapter "${adapterName}" failed.`, error)

    try {
      const fallbackReason = error?.fallbackReason ?? 'API_FAILED'

      if (!mockFallbackReasons.has(fallbackReason)) {
        console.warn(
          `Fallback reason "${fallbackReason}" does not use mock match data.`,
        )
        return createEmptySnapshot('empty-fallback', fallbackReason)
      }

      console.warn(`Using mock match fallback for reason "${fallbackReason}".`)
      const mockSnapshot = await fetchMockMatches()

      return {
        ...mockSnapshot,
        source: 'mock',
        dataSource: 'fallback',
        fallbackReason,
        provider: 'mock',
        meta: {
          dataSource: 'fallback',
          fallbackReason,
          provider: 'mock',
        },
      }
    } catch (fallbackError) {
      console.warn('Mock match fallback failed, using empty match list.', fallbackError)
      return createEmptySnapshot('empty-fallback')
    }
  }
}
