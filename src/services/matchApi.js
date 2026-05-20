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

const defaultAdapter = import.meta.env.VITE_MATCH_API_ADAPTER || 'remote'

function createEmptySnapshot(source = 'empty') {
  const meta = {
    dataSource: 'fallback',
    fallbackReason: 'INVALID_RESPONSE',
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
    console.warn(`Match adapter "${adapterName}" failed, falling back to mock data.`, error)

    try {
      const fallbackReason = error?.fallbackReason ?? 'API_FAILED'
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
