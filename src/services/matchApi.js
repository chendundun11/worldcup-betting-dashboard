import {
  fetchMatches as fetchMockMatches,
  getMockMatchSnapshot,
} from './adapters/mockMatchAdapter'
import { fetchMatches as fetchFootballDataMatches } from './adapters/footballDataAdapter'

const adapters = {
  mock: fetchMockMatches,
  footballData: fetchFootballDataMatches,
}

const defaultAdapter = import.meta.env.VITE_MATCH_API_ADAPTER || 'mock'

function createEmptySnapshot(source = 'empty') {
  return {
    matchDay: '',
    updatedAt: new Date().toISOString(),
    source,
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
    return await fetchAdapter()
  } catch (error) {
    console.warn(`Match adapter "${adapterName}" failed, falling back to mock data.`, error)

    try {
      return await fetchMockMatches()
    } catch (fallbackError) {
      console.warn('Mock match fallback failed, using empty match list.', fallbackError)
      return createEmptySnapshot('empty-fallback')
    }
  }
}
