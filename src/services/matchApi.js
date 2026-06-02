import {
  fetchMatches as fetchMockMatches,
  getMockMatchSnapshot,
} from './adapters/mockMatchAdapter'
import { fetchMatches as fetchRemoteMatches } from './adapters/remoteMatchAdapter'
import { fetchMatches as fetchFootballDataMatches } from './adapters/footballDataAdapter'
import { getOddsSnapshot } from './oddsApi'
import { mergeOddsIntoMatches } from './oddsMerge'

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

function createOddsMeta(oddsSnapshot) {
  return {
    provider: oddsSnapshot?.provider ?? null,
    dataSource: oddsSnapshot?.dataSource ?? null,
    updatedAt: oddsSnapshot?.updatedAt ?? null,
    fallbackReason: oddsSnapshot?.fallbackReason ?? null,
    disabled: oddsSnapshot?.disabled === true,
  }
}

async function attachRemoteOdds(snapshot) {
  try {
    const oddsSnapshot = await getOddsSnapshot()
    const mergedMatches = Array.isArray(snapshot.matches)
      ? mergeOddsIntoMatches(snapshot.matches, oddsSnapshot)
      : snapshot.matches

    return {
      ...snapshot,
      matches: mergedMatches,
      oddsMeta: createOddsMeta(oddsSnapshot),
    }
  } catch (error) {
    console.warn('Odds snapshot merge failed, using match snapshot without remote odds.', error)
    return snapshot
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
    return attachRemoteOdds({
      ...snapshot,
      meta: snapshot.meta ?? {
        dataSource: snapshot.dataSource ?? 'real',
        fallbackReason: snapshot.fallbackReason ?? null,
        provider: snapshot.provider ?? adapterName,
      },
    })
  } catch (error) {
    console.warn(`Match adapter "${adapterName}" failed.`, error)

    try {
      const fallbackReason = error?.fallbackReason ?? 'API_FAILED'

      if (!mockFallbackReasons.has(fallbackReason)) {
        console.warn(
          `Fallback reason "${fallbackReason}" does not use mock match data.`,
        )
        return attachRemoteOdds(createEmptySnapshot('empty-fallback', fallbackReason))
      }

      console.warn(`Using mock match fallback for reason "${fallbackReason}".`)
      const mockSnapshot = await fetchMockMatches()

      return attachRemoteOdds({
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
      })
    } catch (fallbackError) {
      console.warn('Mock match fallback failed, using empty match list.', fallbackError)
      return attachRemoteOdds(createEmptySnapshot('empty-fallback'))
    }
  }
}
