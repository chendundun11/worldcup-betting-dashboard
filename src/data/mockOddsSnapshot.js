export const ODDS_SNAPSHOT_SCHEMA_VERSION = 'odds-snapshot-v1'

export const mockOddsSnapshot = {
  provider: 'mock',
  dataSource: 'mock',
  updatedAt: '2026-06-02T00:00:00.000Z',
  markets: [
    {
      matchKey: 'France__Senegal',
      homeTeam: 'France',
      awayTeam: 'Senegal',
      marketStatus: 'available',
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
      marketMovement: {
        favoriteTrend: 'stable',
        totalGoalsTrend: 'unknown',
      },
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
    },
    {
      matchKey: 'Portugal__Congo DR',
      homeTeam: 'Portugal',
      awayTeam: 'Congo DR',
      marketStatus: 'stale',
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
      marketMovement: {
        favoriteTrend: 'shortening',
        totalGoalsTrend: 'over-heating',
      },
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
    },
    {
      matchKey: 'South Korea__Czechia',
      homeTeam: 'South Korea',
      awayTeam: 'Czechia',
      marketStatus: 'missing',
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
      marketMovement: {
        favoriteTrend: 'unknown',
        totalGoalsTrend: 'unknown',
      },
      riskFlags: [
        'mockOnly',
        'oddsUnavailable',
        'marketDepthMissing',
      ],
      reviewPoints: [
        '缺少可用赔率结构，未来接入真实源时应优先标记为观望复核。',
      ],
      fallbackReason: 'MOCK_MARKET_MISSING',
    },
  ],
  meta: {
    schemaVersion: ODDS_SNAPSHOT_SCHEMA_VERSION,
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
    marketMovement: { ...market.marketMovement },
    riskFlags: [...market.riskFlags],
    reviewPoints: [...market.reviewPoints],
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
