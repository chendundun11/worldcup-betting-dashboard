import { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  BarChart3,
  CalendarDays,
  Clock3,
  Crosshair,
  Gauge,
  ShieldAlert,
  Target,
  TrendingUp,
  WalletCards,
} from 'lucide-react'
import betHistoryData from './data/betHistory.json'
import teamsData from './data/teams.json'
import { getInitialMatchSnapshot, getMatches } from './services/matchApi'
import {
  applyFinishedMatchAdjustments,
  applyFinishedMatchAdjustmentsBefore,
} from './utils/teamRevaluation'
import './App.css'

const outcomes = ['home', 'draw', 'away']

const outcomeLabels = {
  home: '主胜',
  draw: '平局',
  away: '客胜',
  noBet: '不下注',
}

const totalGoalsLabels = {
  over25: '大2.5',
  under25: '小2.5',
  noBet: '不下注',
}

const DEFAULT_TOTAL_GOALS_ODDS = {
  over25: 1.9,
  under25: 1.9,
}

const riskProfiles = {
  low: { label: '低风险', stake: '中等参考' },
  medium: { label: '中风险', stake: '中等参考' },
  high: { label: '高风险', stake: '轻度参考' },
  none: { label: '观望', stake: '参与建议：观望' },
}

const NO_ODDS_REASON =
  '暂无赔率，当前为赛前基础面初判，等待盘口确认后更新推荐强度。'
const NO_ODDS_RECOMMENDATION_LABEL = '赛前初判，等待盘口确认'
const SCORE_REFERENCE_NOTICE = '比分波动较大，适合小额娱乐参考。'

const neutralTeamProfile = {
  confederation: '',
  teamStrength: 50,
  recentForm: 50,
  attackRating: 50,
  defenseRating: 50,
  starPlayerForm: 50,
  injuryRisk: 50,
  fatigue: 50,
  morale: 50,
}

const teamNameMap = {
  Mexico: '墨西哥',
  'South Africa': '南非',
  'South Korea': '韩国',
  Czechia: '捷克',
  Canada: '加拿大',
  'Bosnia-Herzegovina': '波黑',
  'United States': '美国',
  Paraguay: '巴拉圭',
  Qatar: '卡塔尔',
  Switzerland: '瑞士',
  Brazil: '巴西',
  Morocco: '摩洛哥',
  Haiti: '海地',
  Scotland: '苏格兰',
  Australia: '澳大利亚',
  Turkey: '土耳其',
  Germany: '德国',
  Curaçao: '库拉索',
  Netherlands: '荷兰',
  Japan: '日本',
  'Ivory Coast': '科特迪瓦',
  Ecuador: '厄瓜多尔',
  Sweden: '瑞典',
  Tunisia: '突尼斯',
  Spain: '西班牙',
  'Cape Verde Islands': '佛得角',
  Belgium: '比利时',
  Egypt: '埃及',
  'Saudi Arabia': '沙特阿拉伯',
  Uruguay: '乌拉圭',
  Iran: '伊朗',
  'New Zealand': '新西兰',
  France: '法国',
  Senegal: '塞内加尔',
  Iraq: '伊拉克',
  Norway: '挪威',
  Argentina: '阿根廷',
  Algeria: '阿尔及利亚',
  Austria: '奥地利',
  Jordan: '约旦',
  Portugal: '葡萄牙',
  'Congo DR': '刚果民主共和国',
  England: '英格兰',
  Croatia: '克罗地亚',
  Ghana: '加纳',
  Panama: '巴拿马',
  Uzbekistan: '乌兹别克斯坦',
  Colombia: '哥伦比亚',
}

const statusConfig = {
  scheduled: { label: '未开赛', tone: 'scheduled' },
  live: { label: '进行中', tone: 'live' },
  finished: { label: '已结束', tone: 'finished' },
}

const analysisFlowSteps = [
  '数据采集',
  '赔率扫描',
  '状态评估',
  '风险判断',
  '输出建议',
]

const analysisPhaseConfig = {
  done: {
    label: '已完成分析',
    message: 'AI 已完成本场分析',
    activeStep: analysisFlowSteps.length,
  },
  scanning: {
    label: '运行中',
    message: 'AI 正在扫描赔率...',
    activeStep: 1,
  },
  risk: {
    label: '运行中',
    message: 'AI 正在评估风险...',
    activeStep: 3,
  },
  generating: {
    label: '运行中',
    message: 'AI 正在生成建议...',
    activeStep: 4,
  },
}

const teamMetrics = [
  { key: 'teamStrength', label: '球队实力', positive: true },
  { key: 'recentForm', label: '近期状态', positive: true },
  { key: 'attackRating', label: '进攻评分', positive: true },
  { key: 'defenseRating', label: '防守评分', positive: true },
  { key: 'starPlayerForm', label: '核心球员状态', positive: true },
  { key: 'injuryRisk', label: '伤病风险', positive: false },
  { key: 'fatigue', label: '疲劳值', positive: false },
  { key: 'morale', label: '士气', positive: true },
]

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

function cloneTeams(teams) {
  return teams.map((team) => ({ ...team }))
}

function cloneMatches(matches) {
  return matches.map((match) => ({
    ...match,
    kickoff: match.kickoff ?? match.kickoffTime,
    kickoffTime: match.kickoffTime ?? match.kickoff,
    homeTeamId: match.homeTeamId ?? match.homeTeam,
    awayTeamId: match.awayTeamId ?? match.awayTeam,
    homeTeam: match.homeTeam ?? match.homeTeamId,
    awayTeam: match.awayTeam ?? match.awayTeamId,
    odds: match.odds ? { ...DEFAULT_TOTAL_GOALS_ODDS, ...match.odds } : null,
    score: match.score ? { ...match.score } : null,
    contextRisk: match.contextRisk ?? 50,
  }))
}

function cloneRecords(records) {
  return records.map((record) => ({ ...record }))
}

function getNumberValue(value, fallback = 0) {
  const parsedValue = Number(value)
  return Number.isFinite(parsedValue) ? parsedValue : fallback
}

function getOddsValue(value) {
  return Math.max(getNumberValue(value, 1.01), 1.01)
}

function hasWdlOdds(odds) {
  return Boolean(
    odds &&
      getNumberValue(odds.home) > 0 &&
      getNumberValue(odds.draw) > 0 &&
      getNumberValue(odds.away) > 0,
  )
}

function getTeamDisplaySeed(match, side) {
  return String(
    match[`${side}TeamName`] ??
      match[`${side}TeamDisplayName`] ??
      match[`${side}Team`] ??
      match[`${side}TeamId`] ??
      '',
  ).trim()
}

function hasVisibleTeams(match) {
  return Boolean(getTeamDisplaySeed(match, 'home') && getTeamDisplaySeed(match, 'away'))
}

function getDisplayTeamName(teamName) {
  const name = String(teamName ?? '').trim()
  return teamNameMap[name] ?? name
}

function createTeamProfile(teamId, displayName, localTeam) {
  const mappedDisplayName = getDisplayTeamName(displayName)
  const name = mappedDisplayName || localTeam?.name || teamId

  return {
    ...neutralTeamProfile,
    ...localTeam,
    id: teamId,
    name,
    shortName: mappedDisplayName || localTeam?.shortName || name,
  }
}

function buildTeamsForMatches(localTeams, matches) {
  const localTeamMap = new Map(localTeams.map((team) => [team.id, team]))
  const teamMap = new Map(localTeams.map((team) => [team.id, team]))

  matches.forEach((match) => {
    for (const side of ['home', 'away']) {
      const teamId = match[`${side}TeamId`]
      if (!teamId) continue

      const displayName = String(match[`${side}TeamName`] ?? '').trim()
      if (!displayName && teamMap.has(teamId)) continue

      teamMap.set(
        teamId,
        createTeamProfile(teamId, displayName, localTeamMap.get(teamId)),
      )
    }
  })

  return Array.from(teamMap.values())
}

function formatRiskLabel(risk) {
  if (risk?.level === '待观察') return '待观察'
  return `${risk?.level ?? '中'}风险`
}

function formatPercent(value, digits = 1) {
  return `${(value * 100).toFixed(digits)}%`
}

function formatPointDiff(value) {
  const sign = value >= 0 ? '+' : ''
  return `${sign}${(value * 100).toFixed(1)}pp`
}

function formatUnits(value) {
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toFixed(2)}`
}

function formatKickoff(value) {
  const kickoffDate = new Date(value)

  if (Number.isNaN(kickoffDate.getTime())) return '北京时间 --/-- --:--'

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(kickoffDate)
  const dateParts = Object.fromEntries(
    parts
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  )

  return `北京时间 ${dateParts.month}/${dateParts.day} ${dateParts.hour}:${dateParts.minute}`
}

function formatClock(value) {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    hour: '2-digit',
    minute: '2-digit',
  }).format(value)
}

function formatUpdateTime(value) {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(value)
}

function calculateTeamPower(team, isHome) {
  const positiveScore =
    team.teamStrength * 0.24 +
    team.recentForm * 0.14 +
    team.attackRating * 0.16 +
    team.defenseRating * 0.14 +
    team.starPlayerForm * 0.14 +
    team.morale * 0.1
  const pressurePenalty = team.injuryRisk * 0.05 + team.fatigue * 0.03

  return positiveScore - pressurePenalty + (isHome ? 2.5 : 0)
}

function calculateModelProbabilities(homeTeam, awayTeam) {
  const homePower = calculateTeamPower(homeTeam, true)
  const awayPower = calculateTeamPower(awayTeam, false)
  const powerDiff = homePower - awayPower
  const tightness = Math.max(0, 1 - Math.min(Math.abs(powerDiff), 18) / 18)
  const fatigueDrawBoost = ((homeTeam.fatigue + awayTeam.fatigue) / 2 / 100) * 0.03
  const attackPressure =
    (homeTeam.attackRating +
      awayTeam.attackRating -
      homeTeam.defenseRating -
      awayTeam.defenseRating) /
    200
  const draw = clamp(
    0.18 + tightness * 0.1 + fatigueDrawBoost - Math.max(attackPressure, 0) * 0.04,
    0.17,
    0.31,
  )
  const homeRaw = Math.exp(powerDiff / 17)
  const awayRaw = Math.exp(-powerDiff / 17)
  const winPool = 1 - draw
  const home = winPool * (homeRaw / (homeRaw + awayRaw))
  const away = winPool - home

  return { home, draw, away, homePower, awayPower, powerDiff }
}

function calculateMarketProbabilities(odds) {
  const raw = {
    home: 1 / odds.home,
    draw: 1 / odds.draw,
    away: 1 / odds.away,
  }
  const overround = raw.home + raw.draw + raw.away

  return {
    probabilities: {
      home: raw.home / overround,
      draw: raw.draw / overround,
      away: raw.away / overround,
    },
    raw,
    overround,
  }
}

function calculateTotalGoalsMarket(odds) {
  const over25Odds = getOddsValue(odds.over25)
  const under25Odds = getOddsValue(odds.under25)
  const raw = {
    over25: 1 / over25Odds,
    under25: 1 / under25Odds,
  }
  const overround = raw.over25 + raw.under25

  return {
    probabilities: {
      over25: raw.over25 / overround,
      under25: raw.under25 / overround,
    },
    raw,
    overround,
    odds: { over25: over25Odds, under25: under25Odds },
  }
}

function calculateTotalGoalsModel(homeTeam, awayTeam) {
  const attackAverage = (homeTeam.attackRating + awayTeam.attackRating) / 2
  const defenseAverage = (homeTeam.defenseRating + awayTeam.defenseRating) / 2
  const formAverage = (homeTeam.recentForm + awayTeam.recentForm) / 2
  const fatigueAverage = (homeTeam.fatigue + awayTeam.fatigue) / 2
  const attackVsDefense = clamp(50 + attackAverage - defenseAverage, 0, 100)
  const totalGoalLean = clamp(
    attackVsDefense * 0.38 +
      attackAverage * 0.22 +
      formAverage * 0.22 +
      fatigueAverage * 0.18,
    0,
    100,
  )
  const over25Probability = clamp(0.5 + (totalGoalLean - 55) * 0.006, 0.3, 0.72)

  return {
    totalGoalLean,
    over25Probability,
    under25Probability: 1 - over25Probability,
  }
}

function getRecommendationProfile(direction, riskTone) {
  if (direction === 'noBet') return riskProfiles.none
  return riskProfiles[riskTone] ?? riskProfiles.medium
}

function getTotalGoalsRecommendation(totalGoalsModel, totalGoalsMarket) {
  const valueDiffs = {
    over25:
      totalGoalsModel.over25Probability - totalGoalsMarket.probabilities.over25,
    under25:
      totalGoalsModel.under25Probability - totalGoalsMarket.probabilities.under25,
  }
  const bestDirection =
    valueDiffs.over25 >= valueDiffs.under25 ? 'over25' : 'under25'
  const bestValue = valueDiffs[bestDirection]

  if (bestValue < 0.05) {
    return {
      direction: 'noBet',
      label: totalGoalsLabels.noBet,
      value: bestValue,
      valueDiffs,
      riskTone: 'none',
      profile: riskProfiles.none,
    }
  }

  const riskTone =
    bestValue >= 0.08 && totalGoalsModel.totalGoalLean >= 50
      ? 'low'
      : bestValue >= 0.06
        ? 'medium'
        : 'high'

  return {
    direction: bestDirection,
    label: totalGoalsLabels[bestDirection],
    value: bestValue,
    valueDiffs,
    riskTone,
    profile: getRecommendationProfile(bestDirection, riskTone),
  }
}

function getRecommendation(valueDiffs) {
  const bestOutcome = outcomes.reduce((best, outcome) =>
    valueDiffs[outcome] > valueDiffs[best] ? outcome : best,
  )
  const bestValue = valueDiffs[bestOutcome]

  if (bestValue >= 0.05) {
    return {
      direction: bestOutcome,
      label: outcomeLabels[bestOutcome],
      value: bestValue,
    }
  }

  return {
    direction: 'noBet',
    label: outcomeLabels.noBet,
    value: bestValue,
  }
}

function calculateRisk(match, homeTeam, awayTeam, model, recommendation) {
  const teamGap = Math.abs(model.homePower - model.awayPower)
  const averageInjury = (homeTeam.injuryRisk + awayTeam.injuryRisk) / 2
  const averageFatigue = (homeTeam.fatigue + awayTeam.fatigue) / 2
  const stability =
    (homeTeam.recentForm + awayTeam.recentForm + homeTeam.morale + awayTeam.morale) / 4
  const instability = 100 - stability
  let score = 18 + match.contextRisk * 0.2

  if (teamGap < 4) score += 24
  else if (teamGap < 8) score += 12
  else if (teamGap > 14) score -= 10

  if (averageInjury > 36) score += 16
  else if (averageInjury > 30) score += 9

  if (instability > 24) score += 13
  else if (instability > 18) score += 7

  if (averageFatigue > 42) score += 10
  if (recommendation.value < 0.05) score += 12
  if (teamGap >= 12 && recommendation.value >= 0.07 && averageInjury < 30) score -= 14

  if (score >= 60) {
    return {
      level: '高',
      tone: 'high',
      score,
      note: '两队差距接近，伤病或赛程状态波动叠加，建议降低参与强度。',
    }
  }

  if (score >= 38) {
    return {
      level: '中',
      tone: 'medium',
      score,
      note: '存在可参考信号，但强弱差、伤病或临场状态仍需跟踪。',
    }
  }

  return {
    level: '低',
    tone: 'low',
    score,
    note: '强弱差较清晰，当前判断更稳定。',
  }
}

function getPrimaryOutcome(model) {
  return outcomes.reduce((best, outcome) =>
    model[outcome] > model[best] ? outcome : best,
  )
}

function getUniqueScores(scores) {
  return scores.filter((score, index) => scores.indexOf(score) === index)
}

function generateScoreLeans(homeTeam, awayTeam, model, totalGoalsModel, risk) {
  const primaryOutcome = getPrimaryOutcome(model)
  const homeAttackEdge = homeTeam.attackRating - awayTeam.defenseRating
  const awayAttackEdge = awayTeam.attackRating - homeTeam.defenseRating
  const overLean = totalGoalsModel.over25Probability >= 0.54
  const underLean = totalGoalsModel.under25Probability >= 0.54
  let scorePool = []

  if (primaryOutcome === 'draw') {
    scorePool = overLean ? ['1-1', '2-2', '0-0'] : ['1-1', '0-0', '2-2']
  } else if (primaryOutcome === 'home') {
    if (overLean) {
      scorePool = homeAttackEdge >= 6 ? ['3-1', '2-1', '2-0'] : ['2-1', '2-0', '1-1']
    } else if (underLean) {
      scorePool = ['1-0', '2-0', '1-1']
    } else {
      scorePool = ['2-1', '1-0', '1-1']
    }
  } else if (overLean) {
    scorePool = awayAttackEdge >= 6 ? ['1-3', '1-2', '0-2'] : ['1-2', '0-2', '1-1']
  } else if (underLean) {
    scorePool = ['0-1', '0-2', '1-1']
  } else {
    scorePool = ['1-2', '0-1', '1-1']
  }

  return getUniqueScores(scorePool).slice(0, 3).map((score, index) => {
    const riskTone =
      index === 0 && risk.tone !== 'high' && model[primaryOutcome] >= 0.45
        ? 'medium'
        : 'high'

    return {
      score,
      tendency: index === 0 ? '主倾向' : index === 1 ? '次倾向' : '冷门倾向',
      riskTone,
      profile: riskProfiles[riskTone],
    }
  })
}

function buildConservativeAdvice(
  homeTeam,
  awayTeam,
  model,
  valueDiffs,
  recommendation,
  totalGoalsRecommendation,
  risk,
) {
  const favoriteDirection = model.home >= model.away ? 'home' : 'away'
  const underdogDirection = favoriteDirection === 'home' ? 'away' : 'home'
  const favoriteTeam = favoriteDirection === 'home' ? homeTeam : awayTeam
  const underdogTeam = underdogDirection === 'home' ? homeTeam : awayTeam
  const favoriteValue = valueDiffs[favoriteDirection]
  const underdogValue = valueDiffs[underdogDirection]
  const powerGap = Math.abs(model.powerDiff)
  let text = '空间一般，先等阵容和临场价格。'
  let riskTone = 'none'

  if (underdogValue >= 0.05 && model[underdogDirection] < 0.38) {
    text = `${underdogTeam.name}有冷门空间，优先受让/不败。`
    riskTone = 'high'
  } else if (powerGap >= 8 && favoriteValue < 0.05) {
    text = `${favoriteTeam.name}优势清楚，主胜低就看不败/小球。`
    riskTone = 'medium'
  } else if (recommendation.direction !== 'noBet' && risk.tone === 'low') {
    text = `${recommendation.label}更顺，轻仓更稳。`
    riskTone = 'low'
  } else if (totalGoalsRecommendation.direction !== 'noBet') {
    text = `胜平负不清晰，先看${totalGoalsRecommendation.label}。`
    riskTone = totalGoalsRecommendation.riskTone
  }

  return {
    text,
    riskTone,
    profile: getRecommendationProfile(riskTone === 'none' ? 'noBet' : 'play', riskTone),
  }
}

function buildMultiMarketSummary(
  recommendation,
  wdlProfile,
  totalGoalsRecommendation,
  scoreLeans,
  conservativeAdvice,
  risk,
) {
  const primary =
    recommendation.direction !== 'noBet'
      ? `${recommendation.label}（${wdlProfile.label}）`
      : totalGoalsRecommendation.direction !== 'noBet'
        ? `${totalGoalsRecommendation.label}（${totalGoalsRecommendation.profile.label}）`
        : '观望为主'
  const secondary =
    totalGoalsRecommendation.direction !== 'noBet' &&
    recommendation.direction !== 'noBet'
      ? `${totalGoalsRecommendation.label}可作次选（${totalGoalsRecommendation.profile.label}）`
      : `${conservativeAdvice.text}（${conservativeAdvice.profile.label}）`
  const scoreEntertainment = `${scoreLeans
    .map((scoreLean) => scoreLean.score)
    .join(' / ')}，${SCORE_REFERENCE_NOTICE}`
  const warning = `${formatRiskLabel(risk)}；只做参考，不保证盈利；娱乐比分波动高。`

  return { primary, secondary, scoreEntertainment, warning }
}

function createUnavailableMarket() {
  return {
    probabilities: {
      home: 0,
      draw: 0,
      away: 0,
      over25: 0,
      under25: 0,
    },
    raw: {
      home: 0,
      draw: 0,
      away: 0,
      over25: 0,
      under25: 0,
    },
    overround: 0,
    unavailableReason: NO_ODDS_REASON,
  }
}

function createNoOddsAnalysis(homeTeam, awayTeam) {
  const model = calculateModelProbabilities(homeTeam, awayTeam)
  const totalGoalsModel = calculateTotalGoalsModel(homeTeam, awayTeam)
  const recommendation = {
    direction: 'noBet',
    label: NO_ODDS_RECOMMENDATION_LABEL,
    value: 0,
  }
  const totalGoalsRecommendation = {
    direction: 'noBet',
    label: NO_ODDS_RECOMMENDATION_LABEL,
    value: 0,
    valueDiffs: { over25: 0, under25: 0 },
    riskTone: 'none',
    profile: riskProfiles.none,
  }
  const risk = {
    level: '待观察',
    tone: 'none',
    score: 0,
    note: NO_ODDS_REASON,
  }
  const conservativeAdvice = {
    text: '等待盘口确认后更新',
    riskTone: 'none',
    profile: riskProfiles.none,
  }

  return {
    market: createUnavailableMarket(),
    model,
    recommendation,
    risk,
    scoreLeans: [
      { score: '1-0', tendency: '赛前参考', riskTone: 'none', profile: riskProfiles.none },
      { score: '1-1', tendency: '赛前参考', riskTone: 'none', profile: riskProfiles.none },
      { score: '2-1', tendency: '赛前参考', riskTone: 'none', profile: riskProfiles.none },
    ],
    conservativeAdvice,
    multiMarketSummary: {
      primary: NO_ODDS_RECOMMENDATION_LABEL,
      secondary: NO_ODDS_REASON,
      scoreEntertainment: `1-0 / 1-1 / 2-1，${SCORE_REFERENCE_NOTICE}`,
      warning: `待观察；${NO_ODDS_REASON}。`,
    },
    totalGoals: {
      market: createUnavailableMarket(),
      model: totalGoalsModel,
      recommendation: totalGoalsRecommendation,
    },
    valueDiffs: { home: 0, draw: 0, away: 0 },
    wdlProfile: riskProfiles.none,
  }
}

function getFinishedOutcome(match) {
  if (match.status !== 'finished' || !match.score) return null
  if (match.score.home > match.score.away) return 'home'
  if (match.score.home < match.score.away) return 'away'
  return 'draw'
}

function settleRecord(match, record) {
  if (!record || match.status !== 'finished') return null

  if (record.preMatchRecommendation === 'noBet') {
    return {
      hit: null,
      profitUnits: 0,
      stakeUnits: 0,
      actualOutcome: getFinishedOutcome(match),
    }
  }

  const actualOutcome = getFinishedOutcome(match)
  const hit = record.preMatchRecommendation === actualOutcome
  const odds = match.odds[record.preMatchRecommendation]
  const profitUnits = hit
    ? record.stakeUnits * (odds - 1)
    : -record.stakeUnits

  return { hit, profitUnits, stakeUnits: record.stakeUnits, actualOutcome }
}

function getScoreText(match) {
  if (!match.score) return 'vs'
  return `${match.score.home} - ${match.score.away}`
}

function getRecommendationStrength(match) {
  if (!hasWdlOdds(match.odds)) return '轻度参考 / 等待盘口确认'
  if (match.recommendation.direction !== 'noBet') return '中等参考'
  if (match.totalGoals.recommendation.direction !== 'noBet') {
    return '中等参考'
  }
  return '轻度参考 / 观望为主'
}

function getStrengthGap(match) {
  return match.homeTeam.teamStrength - match.awayTeam.teamStrength
}

function getPowerDiff(match) {
  return match.model?.powerDiff ?? getStrengthGap(match)
}

function getWdlDirectionByStrength(match) {
  const strengthGap = getStrengthGap(match)
  const powerDiff = getPowerDiff(match)

  if (strengthGap >= 4 || powerDiff >= 3) return '主队不败'
  if (strengthGap <= -4 || powerDiff <= -3) return '客队不败'
  return '平局防范'
}

function getWdlDirection(match) {
  if (hasWdlOdds(match.odds) && match.recommendation.direction !== 'noBet') {
    if (match.recommendation.direction === 'home') return '主胜方向'
    if (match.recommendation.direction === 'away') return '客胜方向'
    return '平局防范'
  }

  return getWdlDirectionByStrength(match)
}

function getTotalGoalsDirection(match) {
  if (hasWdlOdds(match.odds) && match.totalGoals.recommendation.direction !== 'noBet') {
    return match.totalGoals.recommendation.direction === 'over25'
      ? '2.5球以上倾向'
      : '2.5球以下倾向'
  }

  const strengthGap = match.homeTeam.teamStrength - match.awayTeam.teamStrength
  const powerDiff = getPowerDiff(match)
  const gap = Math.max(Math.abs(strengthGap), Math.abs(powerDiff))

  if (gap >= 8) return '2.5球以上倾向'
  if (gap <= 3) return '2.5球以下倾向'
  return '2-3球区间'
}

function getScoreReferencePair(match) {
  if (!hasWdlOdds(match.odds)) {
    return { main: '1-1', backup: '2-1' }
  }

  const scores = getUniqueScores(match.scoreLeans.map((scoreLean) => scoreLean.score))

  return {
    main: scores[0] ?? '1-1',
    backup: scores[1] ?? '2-1',
  }
}

function hasScoutedTeam(match) {
  return Boolean(match.homeTeam.confederation || match.awayTeam.confederation)
}

function shouldShowUpsetScore(match) {
  if (!hasScoutedTeam(match)) return false

  const strengthGap = Math.abs(getStrengthGap(match))
  const powerGap = Math.abs(getPowerDiff(match))
  const awayCounterEdge = match.awayTeam.attackRating - match.homeTeam.defenseRating
  const awayWinModel = match.model?.away ?? 0

  return strengthGap <= 3 || powerGap <= 3 || awayCounterEdge >= 3 || awayWinModel >= 0.34
}

function isSkipPrimary(match) {
  return !hasWdlOdds(match.odds) || match.multiMarketSummary.primary.includes('不下注')
}

function getPrimaryDisplay(match) {
  if (!hasWdlOdds(match.odds)) return NO_ODDS_RECOMMENDATION_LABEL
  return isSkipPrimary(match) ? '跳过本场' : match.multiMarketSummary.primary
}

function getAiConfidence(match) {
  if (!hasWdlOdds(match.odds)) return 58

  const strongestSignal = Math.max(
    match.recommendation.value,
    match.totalGoals.recommendation.value,
    0,
  )
  const riskAdjustment = { low: 8, medium: 2, high: -7 }[match.risk.tone] ?? 0
  const baseConfidence = isSkipPrimary(match) ? 65 : 70

  return Math.round(
    clamp(baseConfidence + strongestSignal * 120 + riskAdjustment, 58, 84),
  )
}

function getSignalStrength(confidence) {
  if (confidence >= 80) return '强'
  if (confidence >= 70) return '中'
  return '弱'
}

function getFlowStepStatus(index, analysisPhase) {
  const activeStep = analysisPhaseConfig[analysisPhase].activeStep
  if (analysisPhase === 'done') return 'done'
  if (index < activeStep) return 'done'
  if (index === activeStep) return 'active'
  return 'pending'
}

function buildMarketSentiment(match) {
  if (!hasWdlOdds(match.odds)) {
    return {
      heat: '暂无赔率',
      hint: NO_ODDS_REASON,
    }
  }

  const hotDirection = outcomes.reduce((best, outcome) =>
    match.odds[outcome] < match.odds[best] ? outcome : best,
  )
  const heatLabels = {
    home: '主胜偏热',
    draw: '平局关注升温',
    away: '客胜偏热',
  }
  let hint = '热度可参考，但不要追高。'

  if (isSkipPrimary(match)) {
    hint = '盘口价值不足，等待更好机会。'
  } else if (hotDirection === match.recommendation.direction) {
    hint = match.risk.tone === 'low' ? '可轻仓跟随，不追高。' : '不建议追热扩大风险。'
  } else if (match.totalGoals.recommendation.direction !== 'noBet') {
    hint = `${match.totalGoals.recommendation.label}比胜平负更清晰。`
  } else {
    hint = '热度与建议不完全一致，控仓。'
  }

  return {
    heat: heatLabels[hotDirection],
    hint,
  }
}

function buildAnalysisTimeline(lastAnalyzedAt) {
  const baseTime = lastAnalyzedAt.getTime()

  return [
    { time: formatClock(new Date(baseTime - 60_000)), text: '数据同步' },
    { time: formatClock(new Date(baseTime - 25_000)), text: 'AI完成分析' },
    { time: formatClock(lastAnalyzedAt), text: '输出当前建议' },
  ]
}

function buildJudgementLine(match) {
  if (!hasWdlOdds(match.odds)) return NO_ODDS_REASON

  if (
    match.recommendation.direction === 'noBet' &&
    match.totalGoals.recommendation.direction === 'noBet'
  ) {
    return '盘口价值不足，等待更好机会。'
  }

  if (match.recommendation.direction !== 'noBet') {
    return `${match.recommendation.label}更清晰，按${formatRiskLabel(match.risk)}轻仓。`
  }

  return `${match.totalGoals.recommendation.label}更清晰，胜平负先观望。`
}

function buildBeginnerNotes(match) {
  if (!hasWdlOdds(match.odds)) {
    return [
      `胜平负方向：${getWdlDirection(match)}。`,
      `大小球方向：${getTotalGoalsDirection(match)}。`,
      '主比分：1-1；备选比分：2-1。',
      NO_ODDS_REASON,
    ]
  }

  const notes = []
  const strengthGap = match.homeTeam.teamStrength - match.awayTeam.teamStrength
  const homeAttackEdge = match.homeTeam.attackRating - match.awayTeam.defenseRating
  const awayAttackEdge = match.awayTeam.attackRating - match.homeTeam.defenseRating

  if (strengthGap >= 4) {
    notes.push('主队整体实力更强。')
  } else if (strengthGap <= -4) {
    notes.push('客队整体实力更强。')
  } else {
    notes.push('两队实力接近。')
  }

  if (match.recommendation.direction === 'noBet') {
    notes.push('胜平负不适合硬追。')
  } else if (match.recommendation.direction === 'home') {
    notes.push('当前主胜仍有空间。')
  } else if (match.recommendation.direction === 'away') {
    notes.push('当前客胜有冷门空间。')
  } else {
    notes.push('平局方向值得留意。')
  }

  if (match.totalGoals.recommendation.direction === 'noBet') {
    notes.push('大小球暂时不清晰。')
  } else {
    notes.push(`${match.totalGoals.recommendation.label}可重点观察。`)
  }

  if (match.recommendation.direction === 'home' && homeAttackEdge >= 4) {
    notes.push('客队防守抗压一般。')
  } else if (match.recommendation.direction === 'away' && awayAttackEdge >= 4) {
    notes.push('主队防守抗压一般。')
  } else if (match.risk.tone === 'high') {
    notes.push('风险偏高，少碰或放弃。')
  } else {
    notes.push('信号明确，也要控仓。')
  }

  return notes.slice(0, 4)
}

function getReviewText(match) {
  if (!match.settlement) return '等待赛后复盘。'
  if (match.settlement.hit) return '方向命中，按计划结算。'
  if (match.settlement.hit === false) return '方向未中，下次更谨慎。'
  return '赛前观望，不强行出手。'
}

function formatDataSource(meta) {
  if (meta?.dataSource === 'real') return 'real'
  if (meta?.dataSource === 'fallback') return 'fallback'
  return 'mock'
}

function formatFallbackReason(meta) {
  return meta?.fallbackReason || '无'
}

function App() {
  const [selectedMatchId, setSelectedMatchId] = useState('m-004')
  const [analysisPhase, setAnalysisPhase] = useState('done')
  const [lastAnalyzedAt, setLastAnalyzedAt] = useState(() => new Date())
  const [matchDataset, setMatchDataset] = useState(() => getInitialMatchSnapshot())

  useEffect(() => {
    let isMounted = true

    getMatches().then((nextMatchDataset) => {
      if (isMounted) setMatchDataset(nextMatchDataset)
    })

    return () => {
      isMounted = false
    }
  }, [])

  const dashboard = useMemo(() => {
    const baseMatches = cloneMatches(matchDataset.matches).filter(hasVisibleTeams)
    const baseTeams = cloneTeams(buildTeamsForMatches(teamsData.teams, baseMatches))
    const baseRecords = cloneRecords(betHistoryData.records)
    const currentMatchDay =
      matchDataset.matchDay || baseMatches[0]?.kickoff?.slice(0, 10) || ''
    const { adjustedTeams, adjustmentRows } = applyFinishedMatchAdjustments(
      baseTeams,
      baseMatches,
    )
    const globalTeamMap = new Map(adjustedTeams.map((team) => [team.id, team]))
    const historyMap = new Map(baseRecords.map((record) => [record.matchId, record]))

    const enrichedMatches = baseMatches.map((match) => {
      const { adjustedTeams: matchAdjustedTeams } =
        applyFinishedMatchAdjustmentsBefore(baseTeams, baseMatches, match.kickoff)
      const matchTeamMap = new Map(
        matchAdjustedTeams.map((team) => [team.id, team]),
      )
      const homeTeam = matchTeamMap.get(match.homeTeamId)
      const awayTeam = matchTeamMap.get(match.awayTeamId)
      if (!homeTeam || !awayTeam) {
        return null
      }

      if (!hasWdlOdds(match.odds)) {
        const noOddsAnalysis = createNoOddsAnalysis(homeTeam, awayTeam)
        const history = historyMap.get(match.id)
        const settlement = settleRecord(match, history)

        return {
          ...match,
          odds: null,
          globalHomeTeam: globalTeamMap.get(match.homeTeamId),
          globalAwayTeam: globalTeamMap.get(match.awayTeamId),
          homeTeam,
          awayTeam,
          history,
          settlement,
          beginnerNotes: null,
          hasOdds: false,
          ...noOddsAnalysis,
        }
      }

      const model = calculateModelProbabilities(homeTeam, awayTeam)
      const market = calculateMarketProbabilities(match.odds)
      const valueDiffs = {
        home: model.home - market.probabilities.home,
        draw: model.draw - market.probabilities.draw,
        away: model.away - market.probabilities.away,
      }
      const recommendation = getRecommendation(valueDiffs)
      const risk = calculateRisk(match, homeTeam, awayTeam, model, recommendation)
      const wdlProfile = getRecommendationProfile(recommendation.direction, risk.tone)
      const totalGoalsModel = calculateTotalGoalsModel(homeTeam, awayTeam)
      const totalGoalsMarket = calculateTotalGoalsMarket(match.odds)
      const totalGoalsRecommendation = getTotalGoalsRecommendation(
        totalGoalsModel,
        totalGoalsMarket,
      )
      const scoreLeans = generateScoreLeans(
        homeTeam,
        awayTeam,
        model,
        totalGoalsModel,
        risk,
      )
      const conservativeAdvice = buildConservativeAdvice(
        homeTeam,
        awayTeam,
        model,
        valueDiffs,
        recommendation,
        totalGoalsRecommendation,
        risk,
      )
      const multiMarketSummary = buildMultiMarketSummary(
        recommendation,
        wdlProfile,
        totalGoalsRecommendation,
        scoreLeans,
        conservativeAdvice,
        risk,
      )
      const history = historyMap.get(match.id)
      const settlement = settleRecord(match, history)

      return {
        ...match,
        globalHomeTeam: globalTeamMap.get(match.homeTeamId),
        globalAwayTeam: globalTeamMap.get(match.awayTeamId),
        homeTeam,
        awayTeam,
        history,
        market,
        model,
        recommendation,
        risk,
        settlement,
        scoreLeans,
        conservativeAdvice,
        multiMarketSummary,
        beginnerNotes: null,
        totalGoals: {
          market: totalGoalsMarket,
          model: totalGoalsModel,
          recommendation: totalGoalsRecommendation,
        },
        hasOdds: true,
        valueDiffs,
        wdlProfile,
      }
    }).filter(Boolean)

    const matchesWithNotes = enrichedMatches.map((match) => ({
      ...match,
      beginnerNotes: buildBeginnerNotes(match),
    }))
    const todayMatches = matchesWithNotes.filter((match) =>
      currentMatchDay ? match.kickoff.startsWith(currentMatchDay) : true,
    )
    const finishedMatches = todayMatches.filter((match) => match.status === 'finished')
    const settledBets = matchesWithNotes.filter(
      (match) =>
        match.settlement &&
        match.history?.preMatchRecommendation !== 'noBet' &&
        match.settlement.stakeUnits > 0,
    )
    const hitCount = settledBets.filter((match) => match.settlement.hit).length
    const totalStake = settledBets.reduce(
      (sum, match) => sum + match.settlement.stakeUnits,
      0,
    )
    const totalProfit = settledBets.reduce(
      (sum, match) => sum + match.settlement.profitUnits,
      0,
    )

    return {
      matches: matchesWithNotes.sort(
        (a, b) => new Date(a.kickoff) - new Date(b.kickoff),
      ),
      metrics: {
        todayMatchCount: todayMatches.length,
        finishedMatchCount: finishedMatches.length,
        hitRate: settledBets.length ? hitCount / settledBets.length : 0,
        hitCount,
        settledCount: settledBets.length,
        roi: totalStake ? totalProfit / totalStake : 0,
        totalProfit,
      },
      adjustmentRows,
      reviewMatches: matchesWithNotes.filter((match) => match.status === 'finished'),
    }
  }, [matchDataset])

  const selectedMatch =
    dashboard.matches.find((match) => match.id === selectedMatchId) ??
    dashboard.matches[0]

  if (!selectedMatch) {
    return (
      <main className="rookie-dashboard">
        <section className="hero-card">
          <div className="hero-copy">
            <div className="eyebrow">
              <Activity size={16} />
              AI LIVE ENGINE
            </div>
            <h1>AI比赛分析引擎</h1>
            <p>比赛数据暂时不可用，系统正在使用安全回退。</p>
          </div>
        </section>
        <footer className="risk-footer">
          <span>
            本工具仅用于数据分析和娱乐参考，不构成投资或投注建议。请遵守当地法律法规，理性参与，控制风险。
          </span>
          <small>
            数据源：{formatDataSource(matchDataset.meta)} · fallback 原因：
            {formatFallbackReason(matchDataset.meta)}
          </small>
        </footer>
      </main>
    )
  }

  const isAnalyzing = analysisPhase !== 'done'
  const selectedConfidence = getAiConfidence(selectedMatch)
  const selectedSignalStrength = getSignalStrength(selectedConfidence)
  const marketSentiment = buildMarketSentiment(selectedMatch)
  const analysisTimeline = buildAnalysisTimeline(lastAnalyzedAt)

  function handleReanalyze() {
    if (isAnalyzing) return

    setAnalysisPhase('scanning')
    window.setTimeout(() => setAnalysisPhase('risk'), 650)
    window.setTimeout(() => setAnalysisPhase('generating'), 1_150)
    window.setTimeout(() => {
      setAnalysisPhase('done')
      setLastAnalyzedAt(new Date())
    }, 1_650)
  }

  return (
    <main className="rookie-dashboard">
      <section className="hero-card">
        <div className="hero-copy">
          <div className="eyebrow">
            <Activity size={16} />
            AI LIVE ENGINE
          </div>
          <h1>AI比赛分析引擎</h1>
          <p>实时赔率扫描 · 风险评估 · 推荐强度</p>
          <div className="hero-status-row" aria-live="polite">
            <span className={`ai-status-pill ${isAnalyzing ? 'running' : 'done'}`}>
              <i />
              模型状态：{analysisPhaseConfig[analysisPhase].label}
            </span>
            <span>最近更新时间：{formatUpdateTime(lastAnalyzedAt)}</span>
          </div>
        </div>
        <div className="hero-pick">
          <span>AI当前建议</span>
          <strong className={isSkipPrimary(selectedMatch) ? 'skip-primary' : ''}>
            {getPrimaryDisplay(selectedMatch)}
          </strong>
          <p>{selectedMatch.homeTeam.name} vs {selectedMatch.awayTeam.name}</p>
        </div>
      </section>

      <section className="overview-grid" aria-label="顶部总览">
        <article className="metric-card">
          <CalendarDays className="metric-icon blue" />
          <span>今日比赛数</span>
          <strong>{dashboard.metrics.todayMatchCount}</strong>
          <p>已纳入系统分析</p>
        </article>
        <article className="metric-card">
          <Clock3 className="metric-icon gold" />
          <span>已结束比赛数</span>
          <strong>{dashboard.metrics.finishedMatchCount}</strong>
          <p>用于赛后复盘</p>
        </article>
        <article className="metric-card">
          <Target className="metric-icon green" />
          <span>当前命中率</span>
          <strong>{formatPercent(dashboard.metrics.hitRate)}</strong>
          <p>
            {dashboard.metrics.hitCount}/{dashboard.metrics.settledCount} 已结算
          </p>
        </article>
        <article className="metric-card">
          <WalletCards className="metric-icon red" />
          <span>当前回报</span>
          <strong>{formatPercent(dashboard.metrics.roi)}</strong>
          <p>累计盈亏 {formatUnits(dashboard.metrics.totalProfit)}</p>
        </article>
      </section>

      <section className="main-layout">
        <aside className="match-list-panel">
          <div className="section-title">
            <span>比赛列表</span>
            <h2>选择一场查看结论</h2>
          </div>

          <div className="simple-match-list">
            {dashboard.matches.map((match) => (
              <button
                className={
                  selectedMatch.id === match.id
                    ? 'simple-match-card active'
                    : 'simple-match-card'
                }
                key={match.id}
                onClick={() => setSelectedMatchId(match.id)}
                type="button"
              >
                <div className="match-card-top">
                  <strong>
                    {match.homeTeam.shortName} vs {match.awayTeam.shortName}
                  </strong>
                  <span className={`status-pill ${statusConfig[match.status].tone}`}>
                    {statusConfig[match.status].label}
                  </span>
                </div>
                <div className="match-card-mid">
                  <span>{formatKickoff(match.kickoff)}</span>
                  <b>{getScoreText(match)}</b>
                </div>
                <div className="match-card-bottom">
                  <span className={isSkipPrimary(match) ? 'skip-text' : ''}>
                    {getPrimaryDisplay(match)}
                  </span>
                  <em className={`risk-tag ${match.risk.tone}`}>
                    {formatRiskLabel(match.risk)}
                  </em>
                </div>
              </button>
            ))}
          </div>
        </aside>

        <section className="focus-column">
          <section className="core-card quick-conclusion-card" aria-label="核心结论卡">
            <div className="quick-card-top">
              <span>比赛名称</span>
              <h2>
                {selectedMatch.homeTeam.name} vs {selectedMatch.awayTeam.name}
              </h2>
              <p className="quick-kickoff-time">
                {formatKickoff(selectedMatch.kickoff)}
              </p>
            </div>

            <div className="quick-recommendation">
              <span>主推方向</span>
              <strong className={isSkipPrimary(selectedMatch) ? 'skip-primary' : ''}>
                {getPrimaryDisplay(selectedMatch)}
              </strong>
            </div>

            <div className="quick-meta-grid">
              <article>
                <span>风险等级</span>
                <em className={`risk-tag ${selectedMatch.risk.tone}`}>
                  {formatRiskLabel(selectedMatch.risk)}
                </em>
              </article>
              <article>
                <span>推荐强度</span>
                <strong>{getRecommendationStrength(selectedMatch)}</strong>
              </article>
              <article>
                <span>信心指数</span>
                <strong>{selectedConfidence}%</strong>
                <small>信号强度：{selectedSignalStrength}</small>
              </article>
            </div>

            <div className="quick-judgement-block">
              <span>一句话判断</span>
              <p className="quick-judgement">{buildJudgementLine(selectedMatch)}</p>
            </div>

            <div className="analysis-action-row">
              <p className={isAnalyzing ? 'analysis-state running' : 'analysis-state'}>
                {analysisPhaseConfig[analysisPhase].message}
              </p>
              <button
                className="reanalyze-button"
                disabled={isAnalyzing}
                onClick={handleReanalyze}
                type="button"
              >
                <Activity size={16} />
                {isAnalyzing ? '分析中' : '重新分析本场'}
              </button>
            </div>
          </section>

          <section className="ai-flow-panel" aria-label="AI 分析流程">
            <div className="section-title compact-title">
              <span>AI分析流程</span>
              <h2>系统已完成本场扫描</h2>
            </div>
            <div className="ai-flow-steps">
              {analysisFlowSteps.map((step, index) => (
                <div
                  className={`ai-flow-step ${getFlowStepStatus(index, analysisPhase)}`}
                  key={step}
                >
                  <i>{index + 1}</i>
                  <span>{step}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="ai-insight-grid">
            <article className="market-sentiment-card">
              <div className="section-title compact-title">
                <span>市场热度 / 情绪提示</span>
                <h2>{marketSentiment.heat}</h2>
              </div>
              <p>AI提示：{marketSentiment.hint}</p>
            </article>

            <article className="analysis-log-card">
              <div className="section-title compact-title">
                <span>最近一次分析更新</span>
                <h2>{formatClock(lastAnalyzedAt)}</h2>
              </div>
              <div className="analysis-timeline">
                {analysisTimeline.map((item) => (
                  <div className="timeline-item" key={`${item.time}-${item.text}`}>
                    <span>{item.time}</span>
                    <strong>{item.text}</strong>
                  </div>
                ))}
              </div>
            </article>
          </section>

          <section className="play-reference-panel" aria-label="玩法参考">
            <div className="section-title compact-title">
              <span>赛前结论</span>
              <h2>AI玩法参考</h2>
            </div>

            <div className="play-grid">
              <article className="play-card">
                <Crosshair size={20} />
                <span>胜平负方向</span>
                <strong>{getWdlDirection(selectedMatch)}</strong>
                <p>
                  {hasWdlOdds(selectedMatch.odds)
                    ? '结合基础面与盘口价值。'
                    : '基于球队强弱分的赛前初判。'}
                </p>
                <em className={`risk-tag ${selectedMatch.recommendation.direction === 'noBet' ? 'none' : selectedMatch.risk.tone}`}>
                  {hasWdlOdds(selectedMatch.odds)
                    ? selectedMatch.wdlProfile.label
                    : '参与建议：观望'}
                </em>
              </article>

              <article className="play-card">
                <Gauge size={20} />
                <span>大小球方向</span>
                <strong>{getTotalGoalsDirection(selectedMatch)}</strong>
                <p>
                  {hasWdlOdds(selectedMatch.odds)
                    ? '结合进攻、防守和总进球盘口。'
                    : '暂无赔率时使用基础面区间参考。'}
                </p>
                <em className={`risk-tag ${selectedMatch.totalGoals.recommendation.riskTone}`}>
                  {hasWdlOdds(selectedMatch.odds)
                    ? selectedMatch.totalGoals.recommendation.profile.label
                    : '参与建议：观望'}
                </em>
              </article>

              <article className="play-card score-card">
                <Target size={20} />
                <span>比分参考</span>
                <div className="score-reference-list">
                  <p>
                    <span>主比分</span>
                    <strong>{getScoreReferencePair(selectedMatch).main}</strong>
                  </p>
                  <p>
                    <span>备选比分</span>
                    <strong>{getScoreReferencePair(selectedMatch).backup}</strong>
                  </p>
                  {shouldShowUpsetScore(selectedMatch) && (
                    <p>
                      <span>小冷门</span>
                      <strong>0-1</strong>
                    </p>
                  )}
                </div>
                <small className="score-reference-note">{SCORE_REFERENCE_NOTICE}</small>
              </article>

              <article className="play-card steady-card">
                <TrendingUp size={20} />
                <span>稳健玩法</span>
                <strong>{selectedMatch.conservativeAdvice.text}</strong>
              </article>
            </div>
          </section>

          <details className="detail-panel">
            <summary>
              <BarChart3 size={18} />
              展开详细数据
            </summary>

            <div className="detail-content">
              <section className="detail-block">
                <h3>胜平负详细数据</h3>
                <div className="detail-table three-way-table">
                  <div className="detail-row detail-head">
                    <span>方向</span>
                    <span>市场概率</span>
                    <span>系统判断</span>
                    <span>价值差</span>
                  </div>
                  {outcomes.map((outcome) => (
                    <div className="detail-row" key={outcome}>
                      <strong>{outcomeLabels[outcome]}</strong>
                      <span>{formatPercent(selectedMatch.market.probabilities[outcome])}</span>
                      <span>{formatPercent(selectedMatch.model[outcome])}</span>
                      <b>{formatPointDiff(selectedMatch.valueDiffs[outcome])}</b>
                    </div>
                  ))}
                </div>
              </section>

              <section className="detail-block">
                <h3>大小球详细数据</h3>
                <div className="detail-table total-table">
                  <div className="detail-row detail-head">
                    <span>方向</span>
                    <span>市场概率</span>
                    <span>系统判断</span>
                    <span>价值差</span>
                  </div>
                  <div className="detail-row">
                    <strong>大2.5</strong>
                    <span>{formatPercent(selectedMatch.totalGoals.market.probabilities.over25)}</span>
                    <span>{formatPercent(selectedMatch.totalGoals.model.over25Probability)}</span>
                    <b>{formatPointDiff(selectedMatch.totalGoals.recommendation.valueDiffs.over25)}</b>
                  </div>
                  <div className="detail-row">
                    <strong>小2.5</strong>
                    <span>{formatPercent(selectedMatch.totalGoals.market.probabilities.under25)}</span>
                    <span>{formatPercent(selectedMatch.totalGoals.model.under25Probability)}</span>
                    <b>{formatPointDiff(selectedMatch.totalGoals.recommendation.valueDiffs.under25)}</b>
                  </div>
                </div>
              </section>

              <section className="detail-block">
                <h3>球队状态对比</h3>
                <div className="team-compare-list">
                  {teamMetrics.map((metric) => (
                    <div className="compare-row" key={metric.key}>
                      <div className="compare-label">
                        <span>{metric.label}</span>
                        <b>
                          {selectedMatch.homeTeam[metric.key]} /{' '}
                          {selectedMatch.awayTeam[metric.key]}
                        </b>
                      </div>
                      <div className="dual-bars">
                        <i
                          className={metric.positive ? 'home-bar' : 'home-bar warning'}
                          style={{ width: `${selectedMatch.homeTeam[metric.key]}%` }}
                        />
                        <i
                          className={metric.positive ? 'away-bar' : 'away-bar warning'}
                          style={{ width: `${selectedMatch.awayTeam[metric.key]}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="detail-block">
                <h3>赛后状态变化</h3>
                <div className="revaluation-table">
                  <div className="revaluation-row revaluation-head">
                    <span>球队</span>
                    <span>近期状态</span>
                    <span>士气</span>
                    <span>疲劳</span>
                    <span>简要原因</span>
                  </div>
                  {dashboard.adjustmentRows.map((team) => (
                    <div className="revaluation-row" key={team.id}>
                      <strong>{team.name}</strong>
                      <span>
                        {team.original.recentForm} → {team.adjusted.recentForm}
                      </span>
                      <span>
                        {team.original.morale} → {team.adjusted.morale}
                      </span>
                      <span>
                        {team.original.fatigue} → {team.adjusted.fatigue}
                      </span>
                      <span>{team.reason}</span>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </details>
        </section>
      </section>

      <section className="review-panel">
        <div className="section-title">
          <span>赛后复盘</span>
          <h2>已结束比赛结算</h2>
        </div>

        <div className="review-table">
          <div className="review-row review-head">
            <span>比赛</span>
            <span>赛前方向</span>
            <span>赛果</span>
            <span>是否命中</span>
            <span>盈亏参考</span>
            <span>复盘一句话</span>
          </div>

          {dashboard.reviewMatches.map((match) => (
            <div className="review-row" key={match.id}>
              <span>
                {match.homeTeam.shortName} vs {match.awayTeam.shortName}
              </span>
              <span>{outcomeLabels[match.history?.preMatchRecommendation ?? 'noBet']}</span>
              <span>{getScoreText(match)}</span>
              <span
                className={
                  match.settlement?.hit
                    ? 'hit-state hit'
                    : match.settlement?.hit === false
                      ? 'hit-state miss'
                      : 'hit-state muted'
                }
              >
                {match.settlement?.hit
                  ? '命中'
                  : match.settlement?.hit === false
                    ? '未命中'
                    : '未下注'}
              </span>
              <span>{formatUnits(match.settlement?.profitUnits ?? 0)}</span>
              <span>{getReviewText(match)}</span>
            </div>
          ))}
        </div>
      </section>

      <footer className="risk-footer">
        <span>
          本工具仅用于数据分析和娱乐参考，不构成投资或投注建议。请遵守当地法律法规，理性参与，控制风险。
        </span>
        <small>
          数据源：{formatDataSource(matchDataset.meta)} · fallback 原因：
          {formatFallbackReason(matchDataset.meta)}
        </small>
      </footer>
    </main>
  )
}

export default App
