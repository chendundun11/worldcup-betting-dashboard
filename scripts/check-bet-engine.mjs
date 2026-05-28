import buildBetPlan from '../src/services/betEngine.js'
import { localOdds } from '../src/data/localOdds.js'

const BANKROLL = 10000
const MAX_STAKE_PER_MATCH = 500
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
  const odds = localOdds[key]
  if (!odds) return null

  return {
    home: odds.homeWin,
    draw: odds.draw,
    away: odds.awayWin,
    over25: odds.over25,
    under25: odds.under25,
  }
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
      plan.betScore >= 65 && plan.betScore <= 74,
      `${name}: 标准优势场目标应在 65-74，当前 ${plan.betScore}`,
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
