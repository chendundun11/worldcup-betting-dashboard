export const ODDS_SNAPSHOT_SCHEMA_VERSION = 'odds-snapshot-v1'

export const mockOddsSnapshot = {
  provider: 'mock',
  dataSource: 'mock',
  updatedAt: '2026-06-02T00:00:00.000Z',
  markets: [
    {
      status: 'mock',
      matchKey: 'France__Senegal',
      homeTeam: 'France',
      awayTeam: 'Senegal',
      marketStatus: 'available',
      marketTone: 'neutral',
      favoriteSide: 'home',
      oddsConfidence: 'medium',
      bookmakers: [],
      mainMarkets: {
        homeWin: 1.72,
        draw: 3.55,
        awayWin: 5.1,
      },
      handicap: {
        line: -0.75,
        home: null,
        away: null,
      },
      totalGoals: {
        line: 2.5,
        over: null,
        under: null,
      },
      markets: {
        matchWinner: {
          home: 1.72,
          draw: 3.55,
          away: 5.1,
        },
        asianHandicap: {
          line: -0.75,
          homeOdds: null,
          awayOdds: null,
        },
        overUnder: {
          line: 2.5,
          overOdds: null,
          underOdds: null,
        },
      },
      marketMovement: {
        favoriteTrend: 'stable',
        totalGoalsTrend: 'unknown',
      },
      valueFlags: [],
      riskFlags: [
        'mockOnly',
        'bookmakerDepthMissing',
        'marketMovementMissing',
        'lineupReviewRequired',
      ],
      reviewPoints: [
        '仅用于 odds fallback 结构校验，不代表真实盘口。',
        '真实赔率源接入前，只能作为风险提示和复核占位。',
      ],
      fallbackReason: null,
      riskNotes: [],
      rawAvailable: false,
    },
    {
      status: 'mock',
      matchKey: 'Portugal__Congo DR',
      homeTeam: 'Portugal',
      awayTeam: 'Congo DR',
      marketStatus: 'stale',
      marketTone: 'favorite-heated',
      favoriteSide: 'home',
      oddsConfidence: 'low',
      bookmakers: [],
      mainMarkets: {
        homeWin: 1.38,
        draw: 4.7,
        awayWin: 8.4,
      },
      handicap: {
        line: -1.5,
        home: null,
        away: null,
      },
      totalGoals: {
        line: 2.75,
        over: null,
        under: null,
      },
      markets: {
        matchWinner: {
          home: 1.38,
          draw: 4.7,
          away: 8.4,
        },
        asianHandicap: {
          line: -1.5,
          homeOdds: null,
          awayOdds: null,
        },
        overUnder: {
          line: 2.75,
          overOdds: null,
          underOdds: null,
        },
      },
      marketMovement: {
        favoriteTrend: 'shortening',
        totalGoalsTrend: 'over-heating',
      },
      valueFlags: [
        'favoritePriceThin',
      ],
      riskFlags: [
        'mockOnly',
        'staleSnapshot',
        'favoritePriceThin',
        'deepHandicapReviewRequired',
      ],
      reviewPoints: [
        '热门方向若继续下压，需要临场降级复核。',
        '缺少真实盘口变化历史，不进入正向评分。',
      ],
      fallbackReason: 'MOCK_STALE_MARKET',
      riskNotes: [],
      rawAvailable: false,
    },
    {
      status: 'mock',
      matchKey: 'South Korea__Czechia',
      homeTeam: 'South Korea',
      awayTeam: 'Czechia',
      marketStatus: 'missing',
      marketTone: 'missing',
      favoriteSide: 'none',
      oddsConfidence: 'low',
      bookmakers: [],
      mainMarkets: {
        homeWin: null,
        draw: null,
        awayWin: null,
      },
      handicap: {
        line: null,
        home: null,
        away: null,
      },
      totalGoals: {
        line: null,
        over: null,
        under: null,
      },
      markets: {
        matchWinner: {
          home: null,
          draw: null,
          away: null,
        },
        asianHandicap: {
          line: null,
          homeOdds: null,
          awayOdds: null,
        },
        overUnder: {
          line: null,
          overOdds: null,
          underOdds: null,
        },
      },
      marketMovement: {
        favoriteTrend: 'unknown',
        totalGoalsTrend: 'unknown',
      },
      valueFlags: [],
      riskFlags: [
        'mockOnly',
        'oddsUnavailable',
        'marketDepthMissing',
      ],
      reviewPoints: [
        '缺少可用赔率结构，未来接入真实源时应优先标记为观望复核。',
      ],
      fallbackReason: 'MOCK_MARKET_MISSING',
      riskNotes: [],
      rawAvailable: false,
    },
  ],
  meta: {
    schemaVersion: ODDS_SNAPSHOT_SCHEMA_VERSION,
    status: 'mock',
    error: null,
    source: 'mock-fallback',
    message: 'Mock odds snapshot for disabled fallback only.',
  },
}

function cloneMarket(market) {
  return {
    ...market,
    bookmakers: [...market.bookmakers],
    mainMarkets: { ...market.mainMarkets },
    handicap: { ...market.handicap },
    totalGoals: { ...market.totalGoals },
    markets: {
      matchWinner: { ...market.markets.matchWinner },
      asianHandicap: { ...market.markets.asianHandicap },
      overUnder: { ...market.markets.overUnder },
    },
    marketMovement: { ...market.marketMovement },
    valueFlags: [...market.valueFlags],
    riskFlags: [...market.riskFlags],
    reviewPoints: [...market.reviewPoints],
    riskNotes: [...market.riskNotes],
  }
}

export function createMockOddsSnapshot(options = {}) {
  return {
    ...mockOddsSnapshot,
    updatedAt: options.updatedAt ?? mockOddsSnapshot.updatedAt,
    markets: mockOddsSnapshot.markets.map(cloneMarket),
    meta: {
      ...mockOddsSnapshot.meta,
      ...(options.meta ?? {}),
    },
  }
}

export default mockOddsSnapshot
