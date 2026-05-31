import { readFileSync } from 'node:fs'
import {
  ANALYSIS_SNAPSHOT_ROW_FIELDS,
  buildAnalysisSnapshotRow,
} from '../src/services/snapshotRowMapper.js'

const ROW_FIELDS = [
  'schema_version',
  'match_id',
  'match_key',
  'kickoff_at',
  'home_team',
  'away_team',
  'status',
  'provider',
  'data_source',
  'fallback_reason',
  'source_updated_at',
  'engine_version',
  'bet_score',
  'recommend_level',
  'public_match_snapshot',
  'engine_snapshot',
  'internal_snapshot',
  'data_quality',
  'cancel_rules',
]

const PUBLIC_AMOUNT_KEYS = [
  'totalStake',
  'stakePlan',
  'bankroll',
  'stake',
  'amount',
  'money',
  'internalSnapshot',
]

const UI_KEYS = ['selectedIndex', 'sourceIndex', 'showInternalEngine']

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function sameMembers(actual, expected) {
  return (
    actual.length === expected.length &&
    actual.every((item) => expected.includes(item)) &&
    expected.every((item) => actual.includes(item))
  )
}

function hasKey(value, targetKey) {
  if (!value || typeof value !== 'object') return false
  if (Array.isArray(value)) return value.some((item) => hasKey(item, targetKey))
  return Object.entries(value).some(([key, item]) => key === targetKey || hasKey(item, targetKey))
}

function createPayload() {
  return {
    schemaVersion: 'analysis-snapshot-v1',
    matchIdentity: {
      matchId: 'match-1',
      matchKey: 'team-a-vs-team-b',
      homeTeam: 'Team A',
      awayTeam: 'Team B',
      kickoffAt: '2026-06-14T12:00:00.000Z',
    },
    sourceMeta: {
      provider: 'football-data',
      dataSource: 'real',
      fallbackReason: null,
      sourceUpdatedAt: '2026-06-01T00:00:00.000Z',
    },
    publicMatchSnapshot: {
      homeTeam: 'Team A Public',
      awayTeam: 'Team B Public',
      kickoffAt: '2026-06-14T12:00:00.000Z',
      matchStatus: 'scheduled',
      publicSummary: 'Dry run public summary.',
    },
    engineSnapshot: {
      engineVersion: 'bet-engine-v1',
      betScore: 60,
      recommendLevel: 'observe',
    },
    internalSnapshot: {
      totalStake: 10,
      stakePlan: [],
      bankroll: 100,
      lightDataLayer: {},
    },
    dataQuality: {},
    cancelRules: [],
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function assertStaticSafety() {
  const mapperText = readFileSync('src/services/snapshotRowMapper.js', 'utf8')

  assert(!mapperText.includes('process.env'), 'mapper must not read process.env.')
  assert(!mapperText.includes('DATABASE_URL'), 'mapper must not read DATABASE_URL.')
  assert(!/\bfetch\b/.test(mapperText), 'mapper must not use fetch.')
  assert(!/axios/i.test(mapperText), 'mapper must not use axios.')
  assert(!/@neondatabase\/serverless|from\s+['"]pg['"]|require\(['"]pg['"]\)/.test(mapperText), 'mapper must not import database clients.')
  assert(!/insert\s+into/i.test(mapperText), 'mapper must not contain insert SQL.')
  assert(!/openai|\bgpt\b/i.test(mapperText), 'mapper must not mention GPT or OpenAI.')
  assert(!/raw_payload/.test(mapperText), 'mapper must not create raw_payload fields.')
}

const payload = createPayload()
const originalPayloadText = JSON.stringify(payload)
const result = buildAnalysisSnapshotRow(payload, { engineVersion: 'fallback-engine-version' })

assert(result.ok === true, 'valid payload must build a row.')
assert(result.row, 'valid payload must return row.')
assert(sameMembers(Object.keys(result.row), ROW_FIELDS), 'row fields must strictly match migration fields.')
assert(sameMembers(ANALYSIS_SNAPSHOT_ROW_FIELDS, ROW_FIELDS), 'exported row fields must match migration fields.')
assert(!hasKey(result.row, 'id'), 'row must not include id.')
assert(!hasKey(result.row, 'created_at'), 'row must not include created_at.')
assert(!hasKey(result.row, 'raw_payload'), 'row must not include raw_payload.')
assert(result.row.match_key === 'team-a-vs-team-b', 'match_key must map from matchIdentity.matchKey.')
assert(result.row.match_id === 'match-1', 'match_id must map from matchIdentity.matchId.')
assert(result.row.home_team === 'Team A', 'home_team must prefer matchIdentity.homeTeam.')
assert(result.row.away_team === 'Team B', 'away_team must prefer matchIdentity.awayTeam.')
assert(result.row.kickoff_at === '2026-06-14T12:00:00.000Z', 'kickoff_at must map from kickoffAt.')
assert(result.row.provider === 'football-data', 'provider must map from sourceMeta.')
assert(result.row.data_source === 'real', 'data_source must map from sourceMeta.')
assert(result.row.source_updated_at === '2026-06-01T00:00:00.000Z', 'source_updated_at must map from sourceMeta.')
assert(result.row.engine_version === 'bet-engine-v1', 'engine_version must prefer engineSnapshot.engineVersion.')
assert(result.row.bet_score === 60, 'bet_score must map from engineSnapshot.betScore.')
assert(result.row.recommend_level === 'observe', 'recommend_level must map from engineSnapshot.recommendLevel.')
for (const key of PUBLIC_AMOUNT_KEYS) {
  assert(!hasKey(result.row.public_match_snapshot, key), `public_match_snapshot must not contain ${key}.`)
}
assert(result.row.internal_snapshot.totalStake === 10, 'internal_snapshot must keep totalStake.')
assert(Array.isArray(result.row.internal_snapshot.stakePlan), 'internal_snapshot must keep stakePlan.')
assert(result.row.internal_snapshot.bankroll === 100, 'internal_snapshot must keep bankroll.')
assert(result.row.internal_snapshot.lightDataLayer, 'internal_snapshot must keep lightDataLayer.')
for (const key of UI_KEYS) {
  assert(!hasKey(result.row, key), `row must not contain ${key}.`)
}
assert(JSON.stringify(result.row), 'row must be JSON.stringify compatible.')
assert(JSON.stringify(payload) === originalPayloadText, 'mapper must not modify the original payload.')

const missingMatchKeyPayload = createPayload()
delete missingMatchKeyPayload.matchIdentity.matchKey
const missingMatchKeyResult = buildAnalysisSnapshotRow(missingMatchKeyPayload)
assert(missingMatchKeyResult.ok === false, 'missing matchKey must fail.')
assert(Array.isArray(missingMatchKeyResult.errors), 'missing matchKey must return errors.')

const publicAmountPayload = createPayload()
publicAmountPayload.publicMatchSnapshot.totalStake = 10
const publicAmountResult = buildAnalysisSnapshotRow(publicAmountPayload)
assert(publicAmountResult.ok === false, 'public amount fields must fail.')
assert(Array.isArray(publicAmountResult.errors), 'public amount failure must return errors.')

const uiPollutedPayload = createPayload()
uiPollutedPayload.selectedIndex = 1
uiPollutedPayload.engineSnapshot.sourceIndex = 2
uiPollutedPayload.internalSnapshot.lightDataLayer.showInternalEngine = true
const uiPollutedResult = buildAnalysisSnapshotRow(uiPollutedPayload)
assert(uiPollutedResult.ok === false, 'UI-only fields must fail.')
assert(Array.isArray(uiPollutedResult.errors), 'UI-only field failure must return errors.')

const fallbackEnginePayload = createPayload()
delete fallbackEnginePayload.engineSnapshot.engineVersion
const fallbackEngineResult = buildAnalysisSnapshotRow(fallbackEnginePayload, {
  engineVersion: 'options-engine-v1',
})
assert(fallbackEngineResult.ok === true, 'options engineVersion should be accepted.')
assert(fallbackEngineResult.row.engine_version === 'options-engine-v1', 'engine_version may map from options.')

const clonedPayload = createPayload()
const clonedResult = buildAnalysisSnapshotRow(clonedPayload)
assert(clonedResult.row.public_match_snapshot !== clonedPayload.publicMatchSnapshot, 'public snapshot must be cloned.')
assert(clonedResult.row.engine_snapshot !== clonedPayload.engineSnapshot, 'engine snapshot must be cloned.')
assert(clonedResult.row.internal_snapshot !== clonedPayload.internalSnapshot, 'internal snapshot must be cloned.')

assertStaticSafety()

console.log('Snapshot row mapper checks passed.')
