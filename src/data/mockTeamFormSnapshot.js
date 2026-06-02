export const TEAM_FORM_SNAPSHOT_SCHEMA_VERSION = 'team-form-snapshot-v1'

const statusValues = new Set(['strong', 'stable', 'mixed', 'weak', 'unknown'])
const formTrendValues = new Set(['strong', 'stable', 'weak', 'volatile', 'unknown'])
const attackDefenseTrendValues = new Set(['strong', 'normal', 'weak', 'unknown'])
const loadValues = new Set(['low', 'medium', 'high', 'unknown'])

export const mockTeamFormSnapshot = {
  provider: 'mock',
  dataSource: 'mock',
  updatedAt: '2026-06-02T00:00:00.000Z',
  teams: [
    {
      status: 'mock',
      teamName: 'France',
      formStatus: 'stable',
      formTrend: 'stable',
      confidence: 'medium',
      recentMatches: {
        sampleSize: null,
        wins: null,
        draws: null,
        losses: null,
        goalsFor: null,
        goalsAgainst: null,
      },
      recentResults: [],
      attackTrend: 'normal',
      defenseTrend: 'normal',
      volatility: 'medium',
      dataQuality: 'low',
      homeAwaySplit: {
        homeStatus: 'stable',
        awayStatus: 'mixed',
      },
      scheduleLoad: {
        density: 'medium',
        restDays: null,
        travelRisk: 'low',
      },
      trendFlags: [
        'formStructureMockOnly',
        'attackRhythmReview',
      ],
      riskFlags: [
        'realRecentMatchesMissing',
        'scheduleDensityReviewRequired',
      ],
      reviewPoints: [
        'Mock team form only; do not treat as a real recent-match source.',
        'Use future real source data for risk review before scoring changes.',
      ],
      riskNotes: [],
      fallbackReason: null,
      rawAvailable: false,
    },
    {
      status: 'mock',
      teamName: 'Portugal',
      formStatus: 'mixed',
      formTrend: 'volatile',
      confidence: 'low',
      recentMatches: {
        sampleSize: null,
        wins: null,
        draws: null,
        losses: null,
        goalsFor: null,
        goalsAgainst: null,
      },
      recentResults: [],
      attackTrend: 'unknown',
      defenseTrend: 'unknown',
      volatility: 'high',
      dataQuality: 'low',
      homeAwaySplit: {
        homeStatus: 'stable',
        awayStatus: 'unknown',
      },
      scheduleLoad: {
        density: 'high',
        restDays: null,
        travelRisk: 'medium',
      },
      trendFlags: [
        'rotationPatternReview',
        'travelLoadReview',
      ],
      riskFlags: [
        'mockOnly',
        'restDaysMissing',
        'awaySplitMissing',
      ],
      reviewPoints: [
        'Future provider data should confirm rest days before any risk use.',
      ],
      riskNotes: [],
      fallbackReason: 'MOCK_FORM_PARTIAL',
      rawAvailable: false,
    },
    {
      status: 'mock',
      teamName: 'Senegal',
      formStatus: 'unknown',
      formTrend: 'unknown',
      confidence: 'low',
      recentMatches: {
        sampleSize: null,
        wins: null,
        draws: null,
        losses: null,
        goalsFor: null,
        goalsAgainst: null,
      },
      recentResults: [],
      attackTrend: 'unknown',
      defenseTrend: 'unknown',
      volatility: 'unknown',
      dataQuality: 'low',
      homeAwaySplit: {
        homeStatus: 'unknown',
        awayStatus: 'unknown',
      },
      scheduleLoad: {
        density: 'unknown',
        restDays: null,
        travelRisk: 'unknown',
      },
      trendFlags: [
        'formTrendUnknown',
      ],
      riskFlags: [
        'realFormUnavailable',
        'homeAwaySplitUnavailable',
        'scheduleLoadUnavailable',
      ],
      reviewPoints: [
        'Missing team form data should stay a review signal only.',
      ],
      riskNotes: [],
      fallbackReason: 'MOCK_FORM_MISSING',
      rawAvailable: false,
    },
  ],
  meta: {
    schemaVersion: TEAM_FORM_SNAPSHOT_SCHEMA_VERSION,
    status: 'mock',
    error: null,
    source: 'mock-fallback',
    message: 'Mock team form snapshot for disabled fallback only.',
  },
}

function normalizeStatus(value) {
  return statusValues.has(value) ? value : 'unknown'
}

function normalizeFormTrend(value) {
  return formTrendValues.has(value) ? value : 'unknown'
}

function normalizeAttackDefenseTrend(value) {
  return attackDefenseTrendValues.has(value) ? value : 'unknown'
}

function normalizeLoad(value) {
  return loadValues.has(value) ? value : 'unknown'
}

function cloneTeamForm(teamForm) {
  return {
    ...teamForm,
    formStatus: normalizeStatus(teamForm.formStatus),
    formTrend: normalizeFormTrend(teamForm.formTrend),
    recentMatches: { ...teamForm.recentMatches },
    recentResults: [...teamForm.recentResults],
    attackTrend: normalizeAttackDefenseTrend(teamForm.attackTrend),
    defenseTrend: normalizeAttackDefenseTrend(teamForm.defenseTrend),
    volatility: normalizeLoad(teamForm.volatility),
    dataQuality: normalizeLoad(teamForm.dataQuality),
    homeAwaySplit: {
      homeStatus: normalizeStatus(teamForm.homeAwaySplit.homeStatus),
      awayStatus: normalizeStatus(teamForm.homeAwaySplit.awayStatus),
    },
    scheduleLoad: {
      density: normalizeLoad(teamForm.scheduleLoad.density),
      restDays: teamForm.scheduleLoad.restDays,
      travelRisk: normalizeLoad(teamForm.scheduleLoad.travelRisk),
    },
    trendFlags: [...teamForm.trendFlags],
    riskFlags: [...teamForm.riskFlags],
    reviewPoints: [...teamForm.reviewPoints],
    riskNotes: [...teamForm.riskNotes],
  }
}

export function createMockTeamFormSnapshot(options = {}) {
  return {
    ...mockTeamFormSnapshot,
    updatedAt: options.updatedAt ?? mockTeamFormSnapshot.updatedAt,
    teams: mockTeamFormSnapshot.teams.map(cloneTeamForm),
    meta: {
      ...mockTeamFormSnapshot.meta,
      ...(options.meta ?? {}),
    },
  }
}

export default mockTeamFormSnapshot
