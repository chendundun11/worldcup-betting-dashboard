import buildBetPlan, { getRemoteOddsSignal } from '../src/services/betEngine.js'
import { localOdds } from '../src/data/localOdds.js'
import { TEAM_PROFILES } from '../src/data/teamProfiles.js'
import { SQUAD_INSIGHTS } from '../src/data/squadInsights.js'

const BANKROLL = 10000
const MAX_STAKE_PER_MATCH = 500
const recommendLevelRank = {
  观望: 0,
  轻仓试探: 1,
  标准参考: 2,
  强参考: 3,
  极强参考: 4,
}
const forbiddenPublicWords = [
  '必' + '中',
  '稳' + '赢',
  '稳' + '胆',
  '重' + '仓',
  '风险' + '等级',
]

function team(name, strength = 60, form = 60, attack = 60, defense = 60) {
  return {
    name,
    shortName: name,
    teamStrength: strength,
    recentForm: form,
    attackRating: attack,
    defenseRating: defense,
  }
}

function oddsFromLocal(key) {
  return oddsFromEntry(localOdds[key])
}

function oddsFromEntry(odds) {
  if (!odds) return null

  return {
    home: odds.homeWin,
    draw: odds.draw,
    away: odds.awayWin,
    over25: odds.over25,
    under25: odds.under25,
  }
}

function basicLocalOdds(key) {
  const odds = localOdds[key]
  if (!odds) return null
  const keys = [
    'homeWin',
    'draw',
    'awayWin',
    'over25',
    'under25',
    'handicap',
    'note',
    'scoreReference',
    'totalGoalsDirection',
  ]

  return Object.fromEntries(keys.map((key) => [key, odds[key]]))
}

function match(id, key, homeTeam, awayTeam, model, totalModel, extra = {}) {
  return {
    id,
    homeTeam,
    awayTeam,
    kickoffTime: '2026-06-01T12:00:00Z',
    localOdds: localOdds[key] ?? null,
    odds: oddsFromLocal(key),
    model,
    totalGoals: { model: totalModel },
    ...extra,
  }
}

const samples = [
  {
    name: '强队低赔过热场',
    target: 'lowOdds',
    match: match(
      'sample-low-odds',
      'Portugal__Congo DR',
      team('Portugal', 82, 76, 78, 74),
      team('Congo DR', 55, 56, 57, 52),
      { home: 0.75, draw: 0.16, away: 0.09, powerDiff: 18 },
      { over25Probability: 0.62, under25Probability: 0.38 },
    ),
  },
  {
    name: '标准优势场',
    target: 'standard',
    match: match(
      'sample-standard',
      'France__Senegal',
      team('France', 78, 74, 75, 73),
      team('Senegal', 64, 63, 65, 64),
      { home: 0.64, draw: 0.22, away: 0.14, powerDiff: 12 },
      { over25Probability: 0.57, under25Probability: 0.43 },
    ),
  },
  {
    name: '实力接近场',
    target: 'close',
    match: match(
      'sample-close',
      'South Korea__Czechia',
      team('South Korea', 64, 63, 64, 61),
      team('Czechia', 62, 62, 60, 64),
      { home: 0.39, draw: 0.31, away: 0.3, powerDiff: 2 },
      { over25Probability: 0.46, under25Probability: 0.54 },
    ),
  },
  {
    name: '缺少 odds 场',
    target: 'noOdds',
    match: {
      id: 'sample-no-odds',
      homeTeam: team('No Odds Home', 62, 61, 60, 60),
      awayTeam: team('No Odds Away', 60, 60, 60, 60),
      kickoffTime: '2026-06-01T12:00:00Z',
      model: { home: 0.42, draw: 0.29, away: 0.29, powerDiff: 2 },
      totalGoals: { model: { over25Probability: 0.5, under25Probability: 0.5 } },
    },
  },
  {
    name: '冷门观察场',
    target: 'upset',
    match: match(
      'sample-upset',
      'Iraq__Norway',
      team('Iraq', 57, 62, 58, 59),
      team('Norway', 75, 66, 72, 63),
      { home: 0.18, draw: 0.24, away: 0.58, powerDiff: -8 },
      { over25Probability: 0.55, under25Probability: 0.45 },
    ),
  },
]

const boundarySamples = {
  smallBankroll: {
    name: '小本金测试',
    plan: null,
    bankroll: 500,
    maxStakePerMatch: MAX_STAKE_PER_MATCH,
    match: samples.find((sample) => sample.target === 'standard').match,
  },
  largeBankroll: {
    name: '大本金测试',
    plan: null,
    bankroll: 100000,
    maxStakePerMatch: MAX_STAKE_PER_MATCH,
    match: samples.find((sample) => sample.target === 'standard').match,
  },
  missingModel: {
    name: '缺 model 但有 odds 测试',
    plan: null,
    bankroll: BANKROLL,
    maxStakePerMatch: MAX_STAKE_PER_MATCH,
    match: {
      id: 'sample-missing-model',
      homeTeam: team('Missing Model Home', 70, 68, 69, 66),
      awayTeam: team('Missing Model Away', 58, 57, 58, 57),
      kickoffTime: '2026-06-01T12:00:00Z',
      localOdds: localOdds['France__Senegal'],
      odds: oddsFromLocal('France__Senegal'),
      totalGoals: { model: { over25Probability: 0.55, under25Probability: 0.45 } },
    },
  },
  extreme: {
    name: '极强样例探测',
    plan: null,
    bankroll: BANKROLL,
    maxStakePerMatch: MAX_STAKE_PER_MATCH,
    match: match(
      'sample-extreme',
      'Brazil__Morocco',
      team('Extreme Favorite', 92, 92, 92, 90),
      team('Extreme Opponent', 52, 52, 52, 50),
      { home: 0.86, draw: 0.1, away: 0.04, powerDiff: 24 },
      { over25Probability: 0.66, under25Probability: 0.34 },
      {
        oddsHistory: [{ at: 'open' }, { at: 'current' }],
        oddsUpdatedAt: '2026-06-01T08:00:00Z',
        handicapLine: -0.75,
        snapshotId: 'sample-extreme-snapshot',
        settlement: { status: 'unsettled' },
      },
    ),
  },
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

function getScoreStakeTotal(plan) {
  return plan.stakePlan
    .filter((item) => item.market === 'score')
    .reduce((sum, item) => sum + item.stake, 0)
}

function hasForbiddenPublicText(plan) {
  return forbiddenPublicWords.some((word) => plan.publicSummary.includes(word))
}

function assertPublicSummary(plan, name) {
  assert(!hasForbiddenPublicText(plan), `${name}: publicSummary 含禁用词`)
  assert(!plan.publicSummary.includes('U'), `${name}: publicSummary 含 U`)
  assert(!/金额|下注金额/.test(plan.publicSummary), `${name}: publicSummary 含金额表达`)
}

function assertScorePicks(plan, name) {
  for (const pick of plan.scorePicks) {
    assert(pick.highVariance === true, `${name}: scorePicks 必须标记 highVariance`)
  }

  if (plan.totalStake > 0) {
    assert(
      getScoreStakeTotal(plan) <= plan.totalStake * 0.15,
      `${name}: 比分 stake 超过总投入 15%`,
    )
  }
}

function assertPositiveScorePartsDoNotGrow(baselinePlan, nextPlan, name) {
  const positiveScorePartKeys = [
    'valueEdge',
    'directionClarity',
    'strengthGap',
    'recentAttackDefense',
    'marketStability',
    'upsetElasticity',
  ]

  for (const key of positiveScorePartKeys) {
    assert(
      nextPlan.internalAnalysis.scoreParts[key] <= baselinePlan.internalAnalysis.scoreParts[key],
      `${name}: 新增字段不得抬高 ${key}`,
    )
  }
}

function assertRiskPlanDoesNotGrow(baselinePlan, nextPlan, name) {
  assert(nextPlan.betScore < baselinePlan.betScore, `${name}: betScore 必须低于完整数据版本`)
  assert(nextPlan.totalStake <= baselinePlan.totalStake, `${name}: totalStake 不能高于完整数据版本`)
  assert(nextPlan.upsetPick.stake === 0, `${name}: upsetPick.stake 必须继续为 0`)
  assertPositiveScorePartsDoNotGrow(baselinePlan, nextPlan, name)

  if (nextPlan.betScore < 55) {
    assert(nextPlan.totalStake === 0, `${name}: 低分 totalStake 必须为 0`)
    assert(nextPlan.mainPick.action === 'observe', `${name}: 低分 mainPick 必须观望`)
  }
}

function getScorePrediction(plan) {
  return plan.scorePicks.map(({ score, highVariance, note }) => ({
    score,
    highVariance,
    note,
  }))
}

function assertRemoteOddsDoesNotPromote(baselinePlan, nextPlan, name) {
  assert(nextPlan.betScore <= baselinePlan.betScore, `${name}: remoteOdds 不得提高 betScore`)
  assert(
    recommendLevelRank[nextPlan.recommendLevel] <= recommendLevelRank[baselinePlan.recommendLevel],
    `${name}: remoteOdds 不得提高 recommendLevel`,
  )
  assert(nextPlan.totalStake <= baselinePlan.totalStake, `${name}: remoteOdds 不得提高 totalStake`)
  assert(
    JSON.stringify(nextPlan.mainPick) === JSON.stringify(baselinePlan.mainPick),
    `${name}: remoteOdds 不得改变 mainPick`,
  )
  assert(
    JSON.stringify(nextPlan.secondaryPick) === JSON.stringify(baselinePlan.secondaryPick),
    `${name}: remoteOdds 不得改变 secondaryPick`,
  )
  assert(
    JSON.stringify(getScorePrediction(nextPlan)) ===
      JSON.stringify(getScorePrediction(baselinePlan)),
    `${name}: remoteOdds 不得改变比分预测`,
  )
  assertPositiveScorePartsDoNotGrow(baselinePlan, nextPlan, name)
}

function compact(plan) {
  return {
    matchName: plan.matchName,
    betScore: plan.betScore,
    recommendLevel: plan.recommendLevel,
    mainPickAction: plan.mainPick.action,
    secondaryPickAction: plan.secondaryPick.action,
    totalStake: plan.totalStake,
    stakePlan: plan.stakePlan,
    upsetPick: plan.upsetPick,
    heatWarningLevel: plan.heatWarning.level,
    dataQuality: plan.dataQuality,
    scoreBreakdown: plan.scoreBreakdown,
    publicSummary: plan.publicSummary,
  }
}

const plans = samples.map((sample) => ({
  ...sample,
  plan: buildBetPlan(sample.match, {
    bankroll: BANKROLL,
    maxStakePerMatch: MAX_STAKE_PER_MATCH,
  }),
}))

for (const { name, target, plan } of plans) {
  assert(plan.totalStake <= MAX_STAKE_PER_MATCH, `${name}: totalStake 超过封顶`)
  assert(plan.upsetPick.stake === 0, `${name}: V1 冷门 stake 必须为 0`)
  assertPublicSummary(plan, name)
  assertScorePicks(plan, name)
  assert(plan.scoreBreakdown?.valueEdge?.reason, `${name}: 缺少 valueEdge 解释`)
  assert(plan.scoreBreakdown?.heatPenalty?.reason, `${name}: 缺少 heatPenalty 解释`)

  if (plan.betScore < 55) {
    assert(plan.totalStake === 0, `${name}: 低分 totalStake 必须为 0`)
    assert(
      plan.secondaryPick.action === 'none',
      `${name}: 低分 secondaryPick.action 必须为 none`,
    )
  }

  if (target === 'noOdds') {
    assert(plan.totalStake === 0, `${name}: 缺 odds 必须 totalStake 为 0`)
  }

  if (target === 'lowOdds') {
    assert(plan.betScore < 55, `${name}: 强队低赔过热场不得高于 55`)
  }

  if (target === 'standard') {
    assert(
      plan.betScore >= 60 && plan.betScore <= 74,
      `${name}: 标准优势场新增保守扣分后目标应在 60-74，当前 ${plan.betScore}`,
    )
  }
}

for (const sample of Object.values(boundarySamples)) {
  sample.plan = buildBetPlan(sample.match, {
    bankroll: sample.bankroll,
    maxStakePerMatch: sample.maxStakePerMatch,
  })
  assert(sample.plan.totalStake <= sample.maxStakePerMatch, `${sample.name}: 超过单场封顶`)
  assert(sample.plan.totalStake <= sample.bankroll * 0.05, `${sample.name}: 超过本金 5%`)
  assert(sample.plan.upsetPick.stake === 0, `${sample.name}: 冷门 stake 必须为 0`)
  assertPublicSummary(sample.plan, sample.name)
  assertScorePicks(sample.plan, sample.name)
}

const missingModelPlan = boundarySamples.missingModel.plan
assert(
  ['estimated', 'missing'].includes(missingModelPlan.dataQuality.modelProbability),
  '缺 model 但有 odds 测试: modelProbability 必须标记 estimated 或 missing',
)
assert(
  missingModelPlan.internalAnalysis.ruleNotes.some((note) =>
    note.includes('静态赔率价值估算'),
  ),
  '缺 model 但有 odds 测试: valueEdge 必须有静态估算提示',
)
assert(
  !missingModelPlan.scoreBreakdown.valueEdge.reason.includes('真实概率一定'),
  '缺 model 但有 odds 测试: valueEdge 不能描述成精确真实概率',
)

const lightDataModel = { home: 0.64, draw: 0.22, away: 0.14, powerDiff: 12 }
const lightDataTotalModel = { over25Probability: 0.57, under25Probability: 0.43 }
const lightDataBaseOdds = basicLocalOdds('France__Senegal')
const buildLightDataPlan = (id, localOddsEntry, homeTeam, awayTeam) =>
  buildBetPlan(
    match(
      id,
      'France__Senegal',
      homeTeam,
      awayTeam,
      lightDataModel,
      lightDataTotalModel,
      { localOdds: localOddsEntry, odds: oddsFromEntry(localOddsEntry) },
    ),
    {
      bankroll: BANKROLL,
      maxStakePerMatch: MAX_STAKE_PER_MATCH,
    },
  )

const syntheticStableProfile = {
  tier: 'synthetic',
  styleTags: ['stableBlock'],
  attackScore: 72,
  defenseScore: 70,
  volatilityScore: 40,
  bigMatchStability: 74,
  upsetRisk: 35,
  profileNote: '测试用稳定球队画像。',
}
const syntheticStableSquad = {
  lineupCertainty: 'high',
  rotationRisk: 'low',
  keyDependency: 'medium',
  benchImpact: 70,
  injuryDataQuality: 'available',
  lineupReviewPoints: ['测试首发完整度'],
  squadNote: '测试用稳定阵容资料。',
}

function registerSyntheticTeam(name, profileOverrides = {}, squadOverrides = {}) {
  TEAM_PROFILES[name] = {
    ...syntheticStableProfile,
    ...profileOverrides,
  }
  SQUAD_INSIGHTS[name] = {
    ...syntheticStableSquad,
    ...squadOverrides,
  }
}

function removeSyntheticTeam(name) {
  delete TEAM_PROFILES[name]
  delete SQUAD_INSIGHTS[name]
}

function buildSyntheticRiskPlan(id, options = {}) {
  const homeName = `${id} Home`
  const awayName = `${id} Away`
  const {
    registerHome = true,
    registerAway = true,
    homeProfile = {},
    awayProfile = {},
    homeSquad = {},
    awaySquad = {},
    localOddsOverrides = {},
  } = options

  if (registerHome) registerSyntheticTeam(homeName, homeProfile, homeSquad)
  else removeSyntheticTeam(homeName)
  if (registerAway) registerSyntheticTeam(awayName, awayProfile, awaySquad)
  else removeSyntheticTeam(awayName)

  const localOddsEntry = {
    ...lightDataBaseOdds,
    ...localOddsOverrides,
  }

  return buildLightDataPlan(
    id,
    localOddsEntry,
    team(homeName, 78, 74, 75, 73),
    team(awayName, 64, 63, 65, 64),
  )
}

const completeLightDataPlan = buildSyntheticRiskPlan('sample-risk-complete')
const missingLightDataPlan = buildSyntheticRiskPlan('sample-risk-missing', {
  registerHome: false,
  registerAway: false,
})
const highVolatilityPlan = buildSyntheticRiskPlan('sample-risk-volatility', {
  homeProfile: { volatilityScore: 72 },
})
const highUpsetRiskPlan = buildSyntheticRiskPlan('sample-risk-upset', {
  homeProfile: { upsetRisk: 70 },
})
const lowLineupCertaintyPlan = buildSyntheticRiskPlan('sample-risk-lineup', {
  homeSquad: { lineupCertainty: 'low' },
})
const highRotationRiskPlan = buildSyntheticRiskPlan('sample-risk-rotation', {
  homeSquad: { rotationRisk: 'high' },
})
const missingInjuryDataPlan = buildSyntheticRiskPlan('sample-risk-injury', {
  homeSquad: { injuryDataQuality: 'missing' },
})
const combinedLightDataRiskPlan = buildSyntheticRiskPlan('sample-risk-combined', {
  homeProfile: { volatilityScore: 72, upsetRisk: 70 },
  homeSquad: {
    lineupCertainty: 'low',
    rotationRisk: 'high',
    injuryDataQuality: 'missing',
  },
  localOddsOverrides: {
    oddsConfidence: 'low',
    valueFlags: ['favoriteTooLow', 'scoreVolatile', 'upsetWatch'],
    reviewPoints: ['测试盘口复核'],
    riskNotes: ['测试热门过热'],
  },
})

assertRiskPlanDoesNotGrow(completeLightDataPlan, missingLightDataPlan, '缺 teamProfiles/squadInsights 测试')
assertRiskPlanDoesNotGrow(completeLightDataPlan, highVolatilityPlan, 'volatilityScore 高测试')
assertRiskPlanDoesNotGrow(completeLightDataPlan, highUpsetRiskPlan, 'upsetRisk 高测试')
assertRiskPlanDoesNotGrow(completeLightDataPlan, lowLineupCertaintyPlan, 'lineupCertainty low 测试')
assertRiskPlanDoesNotGrow(completeLightDataPlan, highRotationRiskPlan, 'rotationRisk high 测试')
assertRiskPlanDoesNotGrow(completeLightDataPlan, missingInjuryDataPlan, 'injuryDataQuality missing 测试')
assertRiskPlanDoesNotGrow(completeLightDataPlan, combinedLightDataRiskPlan, '数据层组合风险测试')
assert(
  combinedLightDataRiskPlan.internalAnalysis.lightDataAdjustments.totalPenalty <= 0,
  '数据层组合风险测试: lightDataAdjustments 必须只体现扣分',
)
assert(
  completeLightDataPlan.totalStake <= MAX_STAKE_PER_MATCH &&
    combinedLightDataRiskPlan.totalStake <= MAX_STAKE_PER_MATCH,
  '数据层逐字段测试: totalStake 必须继续受封顶保护',
)

const lightDataBaselinePlan = buildLightDataPlan(
  'sample-light-data-baseline',
  lightDataBaseOdds,
  team('Baseline Home', 78, 74, 75, 73),
  team('Baseline Away', 64, 63, 65, 64),
)
const lightDataRiskPlan = buildLightDataPlan(
  'sample-light-data-risk',
  {
    ...lightDataBaseOdds,
    oddsConfidence: 'low',
    valueFlags: ['favoriteTooLow', 'overPriceThin', 'handicapRisk', 'scoreVolatile'],
    reviewPoints: ['首发是否轮换', '盘口是否退让'],
    riskNotes: ['强队低赔过热', '比分波动大'],
    confidenceNote: '本地赔率快照置信度较低，临场需复核。',
  },
  team('France', 78, 74, 75, 73),
  team('Senegal', 64, 63, 65, 64),
)
const lightDataText = [
  lightDataRiskPlan.cancelRules.join('\n'),
  Object.values(lightDataRiskPlan.scoreBreakdown)
    .map((item) => item.reason)
    .join('\n'),
].join('\n')
const lightDataInternalText = JSON.stringify(lightDataRiskPlan.internalAnalysis)

assert(lightDataRiskPlan.betScore <= lightDataBaselinePlan.betScore, '新增风险字段测试: betScore 不能高于 baseline')
assert(lightDataRiskPlan.totalStake <= lightDataBaselinePlan.totalStake, '新增风险字段测试: totalStake 不能高于 baseline')
assert(lightDataRiskPlan.upsetPick.stake === 0, '新增风险字段测试: upsetPick.stake 必须继续为 0')
assertPositiveScorePartsDoNotGrow(lightDataBaselinePlan, lightDataRiskPlan, '新增风险字段测试')
for (const [text, label] of [
  ['首发是否轮换', 'reviewPoints'],
  ['强队低赔过热', 'riskNotes'],
  ['核心前锋是否首发', 'lineupReviewPoints'],
  ['热门方向赔率偏低', 'valueFlags 中文解释'],
]) {
  assert(lightDataText.includes(text), `新增风险字段测试: ${label} 必须进入 cancelRules 或 reason`)
}
for (const rawFlag of ['favoriteTooLow', 'scoreVolatile', 'upsetRisk']) {
  assert(!lightDataText.includes(rawFlag), `新增风险字段测试: ${rawFlag} 不应直接暴露给用户解释`)
}
assert(
  lightDataRiskPlan.internalAnalysis.lightDataLayer?.localOdds?.valueFlags?.includes('favoriteTooLow'),
  '新增风险字段测试: internalAnalysis 必须包含轻量数据层摘要',
)
assert(
  !/(totalStake|stakePlan|bankroll)/.test(lightDataInternalText),
  '新增风险字段测试: internalAnalysis 不应包含公开金额字段',
)

const remoteOddsBaseMatch = samples.find((sample) => sample.target === 'standard').match
const remoteOddsBaselinePlan = buildBetPlan(remoteOddsBaseMatch, {
  bankroll: BANKROLL,
  maxStakePerMatch: MAX_STAKE_PER_MATCH,
})
const missingRemoteOddsPlan = buildBetPlan(
  { ...remoteOddsBaseMatch, remoteOdds: undefined },
  {
    bankroll: BANKROLL,
    maxStakePerMatch: MAX_STAKE_PER_MATCH,
  },
)

assert(
  JSON.stringify(missingRemoteOddsPlan) === JSON.stringify(remoteOddsBaselinePlan),
  '缺失 remoteOdds 时，BetEngine 输出必须与当前基线一致',
)

const safeRemoteOdds = {
  status: 'available',
  provider: 'the-odds-api',
  dataSource: 'remote',
  updatedAt: '2026-06-07T00:00:00.000Z',
  marketStatus: 'available',
  marketTone: 'neutral',
  oddsConfidence: 'high',
  valueFlags: [],
  riskFlags: [],
  reviewPoints: [],
  riskNotes: [],
  fallbackReason: null,
  rawAvailable: true,
  bookmakers: [{ sentinel: 'BOOKMAKER_SENTINEL' }],
  mainMarkets: { sentinel: 'MAIN_MARKETS_SENTINEL' },
  markets: { sentinel: 'MARKETS_SENTINEL' },
  handicap: { sentinel: 'HANDICAP_SENTINEL' },
  totalGoals: { sentinel: 'TOTAL_GOALS_SENTINEL' },
  favoriteSide: 'away',
  rawResponse: { sentinel: 'RAW_RESPONSE_SENTINEL' },
}

function buildRemoteOddsPlan(name, overrides = {}) {
  const plan = buildBetPlan(
    {
      ...remoteOddsBaseMatch,
      remoteOdds: {
        ...safeRemoteOdds,
        ...overrides,
      },
    },
    {
      bankroll: BANKROLL,
      maxStakePerMatch: MAX_STAKE_PER_MATCH,
    },
  )

  assertRemoteOddsDoesNotPromote(remoteOddsBaselinePlan, plan, name)
  return plan
}

const safeRemoteOddsPlan = buildRemoteOddsPlan('真实 remoteOdds 安全基线')
const conflictRemoteOddsPlan = buildRemoteOddsPlan('odds_conflict 风险', {
  marketTone: 'odds-conflict',
  valueFlags: ['odds_conflict'],
})
const favoriteHeatRemoteOddsPlan = buildRemoteOddsPlan('favorite_too_hot 风险', {
  marketTone: 'favorite-heated',
  valueFlags: ['favorite_too_hot'],
})
const overHeatRemoteOddsPlan = buildRemoteOddsPlan('over_line_hot 风险', {
  valueFlags: ['over_line_hot'],
})
const unavailableRemoteOddsPlan = buildRemoteOddsPlan('远端赔率不可用风险', {
  rawAvailable: false,
  marketStatus: 'missing',
  oddsConfidence: 'low',
  fallbackReason: 'ODDS_API_FAILED',
})

assert(
  safeRemoteOddsPlan.betScore === remoteOddsBaselinePlan.betScore,
  'rawAvailable true / oddsConfidence high / provider the-odds-api 不得提高 betScore',
)
for (const [name, plan] of [
  ['odds_conflict', conflictRemoteOddsPlan],
  ['favorite_too_hot', favoriteHeatRemoteOddsPlan],
  ['over_line_hot', overHeatRemoteOddsPlan],
  ['remote unavailable', unavailableRemoteOddsPlan],
]) {
  assert(
    plan.betScore <= remoteOddsBaselinePlan.betScore,
    `${name}: remoteOdds 风险只能降低或保持 betScore`,
  )
}
assert(
  conflictRemoteOddsPlan.betScore < remoteOddsBaselinePlan.betScore,
  'odds_conflict 必须触发信息扣分',
)
assert(
  favoriteHeatRemoteOddsPlan.betScore < remoteOddsBaselinePlan.betScore,
  'favorite_too_hot 必须触发过热扣分',
)
assert(
  overHeatRemoteOddsPlan.betScore < remoteOddsBaselinePlan.betScore,
  'over_line_hot 必须触发过热扣分',
)

const remoteSignal = getRemoteOddsSignal({
  remoteOdds: {
    ...safeRemoteOdds,
    unknownField: { nested: true },
  },
})
assert(remoteSignal.hasRemoteOdds === true, 'getRemoteOddsSignal 必须识别 remoteOdds')
assert(remoteSignal.rawAvailable === true, 'getRemoteOddsSignal 必须保留 rawAvailable')
assert(remoteSignal.riskPenalty === 0, '安全 remoteOdds 不得产生正向或隐藏风险分')
assert(remoteSignal.infoPenalty === 0, '高置信真实 remoteOdds 不得产生正向信息分')

const remoteInternalText = JSON.stringify(unavailableRemoteOddsPlan.internalAnalysis)
for (const forbiddenValue of [
  'BOOKMAKER_SENTINEL',
  'MAIN_MARKETS_SENTINEL',
  'MARKETS_SENTINEL',
  'HANDICAP_SENTINEL',
  'TOTAL_GOALS_SENTINEL',
  'RAW_RESPONSE_SENTINEL',
]) {
  assert(
    !remoteInternalText.includes(forbiddenValue),
    `remoteOdds 轻量摘要不得包含 ${forbiddenValue}`,
  )
}
assert(
  !Object.prototype.hasOwnProperty.call(
    unavailableRemoteOddsPlan.internalAnalysis.remoteOddsSignal,
    'bookmakers',
  ),
  'internalAnalysis.remoteOddsSignal 不得包含 bookmakers',
)
assert(
  unavailableRemoteOddsPlan.dataQuality.remoteOdds?.rawAvailable === false,
  'dataQuality 必须记录 remoteOdds.rawAvailable',
)
assert(
  unavailableRemoteOddsPlan.cancelRules.some((rule) => rule.includes('真实赔率不可用')),
  '远端赔率不可用时必须加入取消或观望规则',
)
assert(
  conflictRemoteOddsPlan.scoreBreakdown.infoPenalty.reason.includes('赔率来源存在冲突'),
  'odds_conflict 必须进入中文风险解释',
)
assert(
  favoriteHeatRemoteOddsPlan.scoreBreakdown.heatPenalty.reason.includes('热门方向定价偏热'),
  'favorite_too_hot 必须进入中文风险解释',
)

if (boundarySamples.extreme.plan.betScore >= 85) {
  assert(
    boundarySamples.extreme.plan.totalStake <= MAX_STAKE_PER_MATCH,
    '极强样例探测: totalStake 仍需不超过封顶',
  )
} else {
  console.log('V1 极强分很少见，当前极强样例探测未达到 85。')
}

console.log(JSON.stringify(Object.fromEntries(plans.map(({ name, plan }) => [name, compact(plan)])), null, 2))
console.log(JSON.stringify(Object.fromEntries(Object.values(boundarySamples).map(({ name, plan }) => [name, compact(plan)])), null, 2))
console.log('BetEngine V1 是静态规则验收，不代表真实盈利能力。')
console.log('BetEngine V1 checks passed.')
