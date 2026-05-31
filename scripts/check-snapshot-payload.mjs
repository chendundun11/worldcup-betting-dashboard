import buildBetPlan from '../src/services/betEngine.js'
import { buildAnalysisSnapshotPayload } from '../src/services/snapshotPayload.js'

const CREATED_AT = '2026-06-01T00:00:00.000Z'
const AMOUNT_KEYS = ['totalStake', 'stakePlan', 'bankroll', 'stake']
const SCORE_KEYS = ['score', 'label', 'reason', 'confidence', 'type']
const UI_KEYS = ['selectedIndex', 'sourceIndex', 'showInternalEngine']

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function hasKey(value, targetKey) {
  if (!value || typeof value !== 'object') return false
  if (Array.isArray(value)) return value.some((item) => hasKey(item, targetKey))
  return Object.entries(value).some(([key, item]) => key === targetKey || hasKey(item, targetKey))
}

function team(name, strength) {
  return {
    name,
    shortName: name,
    teamStrength: strength,
    recentForm: strength - 4,
    attackRating: strength - 2,
    defenseRating: strength - 3,
  }
}

const match = {
  id: 'snapshot-sample-1',
  selectedIndex: 7,
  sourceIndex: 3,
  showInternalEngine: true,
  homeTeam: team('Snapshot Home', 78),
  awayTeam: team('Snapshot Away', 63),
  kickoffTime: '2026-06-14T12:00:00Z',
  meta: {
    dataSource: 'real',
    sourceType: 'fixture-list',
    datasetVersion: 'test-v1',
    capturedAt: CREATED_AT,
    apiToken: 'must-not-enter-payload',
    rawApiResponse: { nested: true },
  },
  localOdds: {
    homeWin: 1.72,
    draw: 3.45,
    awayWin: 5.2,
    over25: 1.86,
    under25: 1.92,
    scoreReference: ['2-1', '2-0'],
    totalGoalsDirection: '2.5球以上倾向',
    oddsConfidence: 'low',
    valueFlags: ['favoriteTooLow', 'handicapRisk'],
  },
  odds: { home: 1.72, draw: 3.45, away: 5.2, over25: 1.86, under25: 1.92 },
  model: { home: 0.63, draw: 0.23, away: 0.14, powerDiff: 14 },
  totalGoals: { model: { over25Probability: 0.58, under25Probability: 0.42 } },
}

const options = {
  createdAt: CREATED_AT,
  sourceMeta: {
    dataSource: 'real',
    sourceType: 'check-script',
    datasetVersion: 'test-v1',
    capturedAt: CREATED_AT,
    sourceIndex: 99,
    apiToken: 'must-not-enter-payload',
  },
}
const plan = buildBetPlan(match, { bankroll: 10000, maxStakePerMatch: 500 })
const planBeforeSnapshot = JSON.stringify(plan)
const pollutedPlan = {
  ...plan,
  selectedIndex: 1,
  sourceIndex: 2,
  showInternalEngine: true,
  transientHelper: () => 'must-not-enter-payload',
}

function payloadFor(localOddsPatch, planPatch = {}) {
  return buildAnalysisSnapshotPayload(
    { ...match, localOdds: { ...match.localOdds, ...localOddsPatch } },
    { ...pollutedPlan, ...planPatch },
    options,
  )
}

const payload = payloadFor({})
const payloadText = JSON.stringify(payload)
const arrayScorePayload = payloadFor(
  {
    scoreReference: [
      {
        score: '2-1',
        label: '主队小胜',
        reason: '公开比分参考',
        confidence: 'medium',
        type: 'main',
        stake: 10,
        totalStake: 20,
        stakePlan: [{ stake: 10 }],
        bankroll: 1000,
        amount: 10,
        money: 10,
        internal: true,
      },
    ],
  },
  { scorePicks: [] },
)
const objectScorePayload = payloadFor(
  {
    scoreReference: {
      score: '3-1',
      label: '对象比分参考',
      reason: '对象输入也只保留白名单',
      type: 'backup',
      stake: 30,
      totalStake: 50,
      stakePlan: [{ stake: 30 }],
      bankroll: 1000,
      amount: 30,
      money: 30,
      internal: true,
    },
  },
  { scorePicks: [] },
)
const cyclicLightDataLayer = { localOdds: { oddsConfidence: 'low' } }
cyclicLightDataLayer.self = cyclicLightDataLayer
const cyclicPayload = buildAnalysisSnapshotPayload(
  match,
  {
    ...pollutedPlan,
    internalAnalysis: { ...pollutedPlan.internalAnalysis, lightDataLayer: cyclicLightDataLayer },
  },
  options,
)

assert(payloadText && JSON.stringify(cyclicPayload), 'payload 必须可以 JSON.stringify')
assert(payload.createdAt === CREATED_AT, 'createdAt 应支持 options 注入')
assert(JSON.stringify(payload) === JSON.stringify(payloadFor({})), '同输入输出必须稳定')
assert(JSON.stringify(plan) === planBeforeSnapshot, 'payload 构建不能修改 BetEngine plan')
assert(!payloadText.includes('must-not-enter-payload'), 'payload 不允许包含 token 或函数返回内容')
for (const key of UI_KEYS) assert(!hasKey(payload, key), `payload 不允许包含 ${key}`)
for (const key of AMOUNT_KEYS) {
  assert(!hasKey(payload.publicMatchSnapshot, key), `publicMatchSnapshot 不允许包含 ${key}`)
  assert(!hasKey(arrayScorePayload.publicMatchSnapshot, key), `scoreReference 数组不允许公开 ${key}`)
  assert(!hasKey(objectScorePayload.publicMatchSnapshot, key), `scoreReference 对象不允许公开 ${key}`)
}
for (const key of ['amount', 'money', 'internal']) {
  assert(!hasKey(arrayScorePayload.publicMatchSnapshot, key), `scoreReference 数组不允许公开 ${key}`)
  assert(!hasKey(objectScorePayload.publicMatchSnapshot, key), `scoreReference 对象不允许公开 ${key}`)
}
for (const key of ['totalStake', 'stakePlan', 'bankroll']) {
  assert(hasKey(payload.internalSnapshot, key), `internalSnapshot 应包含 ${key}`)
}
assert(payload.internalSnapshot.stakePlan.some((item) => hasKey(item, 'stake')), 'stakePlan 应保留 stake')
assert(cyclicPayload.internalSnapshot.lightDataLayer.self === null, '循环引用应清洗为 null')
for (const scorePayload of [arrayScorePayload, objectScorePayload]) {
  assert(
    scorePayload.publicMatchSnapshot.scoreReference.every((item) =>
      Object.keys(item).every((key) => SCORE_KEYS.includes(key)),
    ),
    'scoreReference 必须只保留白名单字段',
  )
}

console.log(
  JSON.stringify(
    {
      topLevelKeys: Object.keys(payload),
      publicKeys: Object.keys(payload.publicMatchSnapshot),
      internalKeys: Object.keys(payload.internalSnapshot),
    },
    null,
    2,
  ),
)
console.log('Snapshot payload checks passed.')
