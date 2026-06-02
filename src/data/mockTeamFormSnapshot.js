export const TEAM_FORM_SNAPSHOT_SCHEMA_VERSION = 'team-form-snapshot-v1'

const statusValues = new Set(['strong', 'stable', 'mixed', 'weak', 'unknown'])
const loadValues = new Set(['low', 'medium', 'high', 'unknown'])

export const mockTeamFormSnapshot = {
  provider: 'mock',
  dataSource: 'mock',
  updatedAt: '2026-06-02T00:00:00.000Z',
  teams: [
    {
      teamName: 'France',
      formStatus: 'stable',
      confidence: 'medium',
      recentMatches: {
        sampleSize: null,
        wins: null,
        draws: null,
        losses: null,
        goalsFor: null,
        goalsAgainst: null,
      },
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
      fallbackReason: null,
    },
    {
      teamName: 'Portugal',
      formStatus: 'mixed',
      confidence: 'low',
      recentMatches: {
        sampleSize: null,
        wins: null,
        draws: null,
        losses: null,
        goalsFor: null,
        goalsAgainst: null,
      },
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
      fallbackReason: 'MOCK_FORM_PARTIAL',
    },
    {
      teamName: 'Senegal',
      formStatus: 'unknown',
      confidence: 'low',
      recentMatches: {
        sampleSize: null,
        wins: null,
        draws: null,
        losses: null,
        goalsFor: null,
        goalsAgainst: null,
      },
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
      fallbackReason: 'MOCK_FORM_MISSING',
    },
  ],
  meta: {
    schemaVersion: TEAM_FORM_SNAPSHOT_SCHEMA_VERSION,
    message: 'Mock team form snapshot for disabled fallback only.',
  },
}

function normalizeStatus(value) {
  return statusValues.has(value) ? value : 'unknown'
}

function normalizeLoad(value) {
  return loadValues.has(value) ? value : 'unknown'
}

function cloneTeamForm(teamForm) {
  return {
    ...teamForm,
    formStatus: normalizeStatus(teamForm.formStatus),
    recentMatches: { ...teamForm.recentMatches },
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
