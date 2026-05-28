import { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  BarChart3,
  CalendarDays,
  Check,
  Clock3,
  Copy,
  Crosshair,
  Gauge,
  ShieldAlert,
  Target,
  TrendingUp,
  WalletCards,
} from 'lucide-react'
import betHistoryData from './data/betHistory.json'
import { localOdds } from './data/localOdds'
import { SQUAD_INSIGHTS } from './data/squadInsights'
import { TEAM_PROFILES } from './data/teamProfiles'
import teamsData from './data/teams.json'
import { getInitialMatchSnapshot, getMatches } from './services/matchApi'
import buildBetPlan from './services/betEngine.js'
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
  low: { label: '稳健参考', stake: '稳健参考' },
  medium: { label: '中等参考', stake: '中等参考' },
  high: { label: '谨慎参考', stake: '谨慎参考' },
  none: { label: '观察为主', stake: '观察为主' },
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

const DEFAULT_TEAM_STATUS_PROFILE = {
  recentForm: '待观察',
  attackState: '待评估',
  defenseState: '待评估',
  fitness: '正常',
  morale: '中性',
  injuryRisk: '待确认',
}

const teamStatusFields = [
  { key: 'recentForm', label: '近期状态' },
  { key: 'attackState', label: '进攻状态' },
  { key: 'defenseState', label: '防守状态' },
  { key: 'fitness', label: '体能状态' },
  { key: 'morale', label: '士气' },
  { key: 'injuryRisk', label: '伤停风险' },
]

const DEFAULT_SQUAD_INSIGHT = {
  coreLineup: '待确认',
  benchDepth: '待评估',
  attackingOptions: '待观察',
  defensiveStability: '待评估',
  injuryNote: '暂无明确情报',
}

const squadInsightFields = [
  { key: 'coreLineup', label: '主力完整度' },
  { key: 'benchDepth', label: '替补深度' },
  { key: 'attackingOptions', label: '进攻变化' },
  { key: 'defensiveStability', label: '防线稳定' },
  { key: 'injuryNote', label: '伤停说明' },
]

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
  '赛程同步',
  '盘口参考',
  '状态评估',
  '复核提示',
  '输出参考',
]

const analysisPhaseConfig = {
  done: {
    label: '已完成分析',
    message: 'AI 已完成本场分析',
    activeStep: analysisFlowSteps.length,
  },
  scanning: {
    label: '运行中',
    message: '赛前模型正在整理盘口参考...',
    activeStep: 1,
  },
  risk: {
    label: '运行中',
    message: 'AI赛前模型正在整理参考信息...',
    activeStep: 3,
  },
  generating: {
    label: '运行中',
    message: 'AI赛前模型正在整理参考建议...',
    activeStep: 4,
  },
}

const internalMarketLabels = {
  '1X2': '胜平负方向',
  totalGoals: '大小球方向',
  score: '比分参考',
  upset: '冷门观察',
}

const internalDataQualityLabels = {
  odds: '赔率快照',
  marketMovement: '盘口变化历史',
  injuries: '伤停信息',
  expectedLineups: '预计首发',
  teamProfile: '球队资料',
  oddsUpdatedAt: '赔率更新时间',
  handicapStructured: '让球结构化',
  snapshotPersistence: '快照持久化',
  resultSettlement: '赛果结算',
  modelProbability: '模型概率',
}

const internalDataQualityStatusLabels = {
  localSnapshot: '本地快照',
  missing: '缺失',
  partial: '部分',
  estimated: '估算',
  unavailable: '不可用',
  available: '可用',
}

const internalScoreBreakdownLabels = {
  valueEdge: '赔率价值',
  directionClarity: '方向清晰度',
  strengthGap: '实力差距',
  recentAttackDefense: '近期攻防',
  marketStability: '盘口稳定度',
  upsetElasticity: '冷门弹性',
  heatPenalty: '热度扣分',
  infoPenalty: '信息缺口扣分',
}

function getInternalMarketLabel(market) {
  return internalMarketLabels[market] ?? market ?? '-'
}

function getInternalDataQualityLabel(key) {
  return internalDataQualityLabels[key] ?? key
}

function getInternalDataQualityStatus(value) {
  return internalDataQualityStatusLabels[value] ?? String(value)
}

function getInternalScoreBreakdownLabel(key) {
  return internalScoreBreakdownLabels[key] ?? key
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

function getRawTeamName(match, side) {
  return String(
    match[`${side}TeamName`] ??
      match[`${side}TeamDisplayName`] ??
      match[`${side}Team`] ??
      match[`${side}TeamId`] ??
      '',
  ).trim()
}

function getTeamStatusProfile(match, side) {
  const rawTeamName = getRawTeamName(match, side)

  return {
    ...DEFAULT_TEAM_STATUS_PROFILE,
    ...(TEAM_PROFILES[rawTeamName] ?? {}),
  }
}

function getSquadInsight(match, side) {
  const rawTeamName = getRawTeamName(match, side)

  return {
    ...DEFAULT_SQUAD_INSIGHT,
    ...(SQUAD_INSIGHTS[rawTeamName] ?? {}),
  }
}

function getInjuryRiskTone(value) {
  if (value === '高') return 'high'
  if (value === '中') return 'medium'
  return 'normal'
}

function TeamStatusCard({ sideLabel, teamName, profile }) {
  return (
    <article className="team-status-card">
      <div className="team-status-card-header">
        <span>{sideLabel}</span>
        <h3>{teamName}</h3>
      </div>
      <div className="team-status-list">
        {teamStatusFields.map((field) => {
          const value = profile[field.key] ?? DEFAULT_TEAM_STATUS_PROFILE[field.key]
          const isInjuryRisk = field.key === 'injuryRisk'

          return (
            <p className="team-status-row" key={field.key}>
              <span>{field.label}</span>
              <strong
                className={
                  isInjuryRisk
                    ? `injury-risk-tag ${getInjuryRiskTone(value)}`
                    : undefined
                }
              >
                {value}
              </strong>
            </p>
          )
        })}
      </div>
    </article>
  )
}

function SquadInsightCard({ sideLabel, teamName, insight }) {
  return (
    <article className="team-status-card squad-insight-card">
      <div className="team-status-card-header">
        <span>{sideLabel}</span>
        <h3>{teamName}</h3>
      </div>
      <div className="team-status-list">
        {squadInsightFields.map((field) => (
          <p className="team-status-row" key={field.key}>
            <span>{field.label}</span>
            <strong>{insight[field.key] ?? DEFAULT_SQUAD_INSIGHT[field.key]}</strong>
          </p>
        ))}
      </div>
    </article>
  )
}

function getLocalOddsKey(match) {
  const homeTeamName = getRawTeamName(match, 'home')
  const awayTeamName = getRawTeamName(match, 'away')

  if (!homeTeamName || !awayTeamName) return ''
  return `${homeTeamName}__${awayTeamName}`
}

function hasUsableMatchId(value) {
  const id = String(value ?? '').trim()
  return Boolean(id && id !== 'undefined' && id !== 'null')
}

function createFallbackMatchId(match, index) {
  const homeTeamName = getRawTeamName(match, 'home') || 'home'
  const awayTeamName = getRawTeamName(match, 'away') || 'away'
  const kickoff = String(match.kickoffTime ?? match.kickoff ?? 'kickoff')
  const stableSeed = `${homeTeamName}-${awayTeamName}-${kickoff}-${index}`

  return stableSeed
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function createStableMatchId(match, index, usedIds = new Set()) {
  const preferredId = hasUsableMatchId(match.id)
    ? String(match.id).trim()
    : createFallbackMatchId(match, index)
  const baseId = preferredId || `match-${index + 1}`
  let stableId = baseId
  let suffix = 2

  while (usedIds.has(stableId)) {
    stableId = `${baseId}-${suffix}`
    suffix += 1
  }

  usedIds.add(stableId)
  return stableId
}

function createMatchUiKey(match, index, usedUiKeys = new Set()) {
  const homeTeamName = getRawTeamName(match, 'home') || 'home'
  const awayTeamName = getRawTeamName(match, 'away') || 'away'
  const kickoff = String(match.kickoffTime ?? match.kickoff ?? '').trim()
  const kickoffPart = kickoff || index
  const baseUiKey = `${homeTeamName}__${awayTeamName}__${kickoffPart}`
  let uiKey = baseUiKey
  let suffix = 2

  while (usedUiKeys.has(uiKey)) {
    uiKey = `${baseUiKey}__${suffix}`
    suffix += 1
  }

  usedUiKeys.add(uiKey)
  return String(uiKey)
}

function normalizeLocalOdds(localOddsEntry) {
  if (!localOddsEntry) return null

  return {
    home: localOddsEntry.homeWin,
    draw: localOddsEntry.draw,
    away: localOddsEntry.awayWin,
    over25: localOddsEntry.over25,
    under25: localOddsEntry.under25,
  }
}

function cloneMatches(matches) {
  const usedIds = new Set()
  const usedUiKeys = new Set()

  return matches.map((match, index) => {
    const localOddsKey = getLocalOddsKey(match)
    const matchedLocalOdds = localOdds[localOddsKey] ?? null
    const normalizedLocalOdds = normalizeLocalOdds(matchedLocalOdds)
    const existingOdds = match.odds
      ? { ...DEFAULT_TOTAL_GOALS_ODDS, ...match.odds }
      : null

    return {
      ...match,
      uiKey: createMatchUiKey(match, index, usedUiKeys),
      id: createStableMatchId(match, index, usedIds),
      kickoff: match.kickoff ?? match.kickoffTime,
      kickoffTime: match.kickoffTime ?? match.kickoff,
      homeTeamId: match.homeTeamId ?? match.homeTeam,
      awayTeamId: match.awayTeamId ?? match.awayTeam,
      homeTeam: match.homeTeam ?? match.homeTeamId,
      awayTeam: match.awayTeam ?? match.awayTeamId,
      localOdds: matchedLocalOdds,
      localOddsKey: matchedLocalOdds ? localOddsKey : null,
      oddsSource: matchedLocalOdds ? 'local' : existingOdds ? 'embedded' : null,
      odds: normalizedLocalOdds
        ? { ...DEFAULT_TOTAL_GOALS_ODDS, ...normalizedLocalOdds }
        : existingOdds,
      score: match.score ? { ...match.score } : null,
      contextRisk: match.contextRisk ?? 50,
    }
  })
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

function hasLocalOdds(match) {
  return Boolean(match.localOdds)
}

function formatOddsValue(value) {
  return getNumberValue(value).toFixed(2)
}

function getMarketStatus(match) {
  return hasLocalOdds(match) ? '已有本地赔率' : '等待盘口确认'
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
  return riskProfiles[risk?.tone]?.label ?? riskProfiles.none.label
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

function getBeijingDateGroupInfo(value) {
  const kickoffDate = new Date(value)

  if (Number.isNaN(kickoffDate.getTime())) {
    return {
      dateKey: 'unknown-date',
      label: '时间待定',
    }
  }

  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  }).formatToParts(kickoffDate)
  const dateParts = Object.fromEntries(
    parts
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  )

  return {
    dateKey: `${dateParts.year}-${dateParts.month}-${dateParts.day}`,
    label: `${dateParts.month}/${dateParts.day} ${dateParts.weekday}`,
  }
}

function groupMatchesByBeijingDate(matches) {
  const groupMap = new Map()

  matches.forEach((match, index) => {
    const dateGroup = getBeijingDateGroupInfo(match.kickoff)

    if (!groupMap.has(dateGroup.dateKey)) {
      groupMap.set(dateGroup.dateKey, {
        ...dateGroup,
        matches: [],
      })
    }

    groupMap.get(dateGroup.dateKey).matches.push({ match, index })
  })

  return Array.from(groupMap.values())
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
    text = `${getOutcomeDirectionLabel(recommendation.direction)}更顺，控制参与强度。`
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
      ? `${getOutcomeDirectionLabel(recommendation.direction)}｜${wdlProfile.label}`
      : totalGoalsRecommendation.direction !== 'noBet'
        ? `${totalGoalsRecommendation.label}｜${totalGoalsRecommendation.profile.label}`
        : '观望为主'
  const secondary =
    totalGoalsRecommendation.direction !== 'noBet' &&
    recommendation.direction !== 'noBet'
      ? `${totalGoalsRecommendation.label}可作次选｜${totalGoalsRecommendation.profile.label}`
      : `${conservativeAdvice.text}｜${conservativeAdvice.profile.label}`
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

function getLocalOddsSnapshot(match) {
  if (!hasLocalOdds(match)) return null

  const homeWin = getNumberValue(match.localOdds.homeWin)
  const draw = getNumberValue(match.localOdds.draw)
  const awayWin = getNumberValue(match.localOdds.awayWin)

  if (!homeWin || !draw || !awayWin) return null

  const favoriteDirection = homeWin <= awayWin ? 'home' : 'away'
  const favoriteOdd = favoriteDirection === 'home' ? homeWin : awayWin
  const opponentOdd = favoriteDirection === 'home' ? awayWin : homeWin
  const range = Math.max(homeWin, draw, awayWin) - Math.min(homeWin, draw, awayWin)

  return {
    homeWin,
    draw,
    awayWin,
    favoriteDirection,
    favoriteOdd,
    opponentOdd,
    range,
  }
}

function getMatchType(match) {
  const oddsSnapshot = getLocalOddsSnapshot(match)

  if (!oddsSnapshot) {
    return {
      id: 'caution',
      label: '谨慎观察局',
      tone: 'none',
      favoriteDirection: null,
    }
  }

  const { favoriteDirection, favoriteOdd, opponentOdd, draw, range } = oddsSnapshot

  if (favoriteOdd <= 1.8 && opponentOdd - favoriteOdd >= 1.2) {
    return {
      id: 'strongFavorite',
      label: '强队优势局',
      tone: 'low',
      favoriteDirection,
    }
  }

  if (favoriteOdd >= 1.9 && range <= 1.3) {
    return {
      id: 'balanced',
      label: '实力接近局',
      tone: 'medium',
      favoriteDirection,
    }
  }

  if (favoriteOdd <= 2.15 && opponentOdd <= 4.4 && draw <= 3.6) {
    return {
      id: 'upsetWatch',
      label: '防冷观察局',
      tone: 'high',
      favoriteDirection,
    }
  }

  return {
    id: 'caution',
    label: '谨慎观察局',
    tone: 'none',
    favoriteDirection,
  }
}

function getOutcomeDirectionLabel(direction) {
  if (direction === 'home') return '主胜方向'
  if (direction === 'away') return '客胜方向'
  if (direction === 'draw') return '平局防范'
  return '等待盘口确认'
}

function getPrimaryDirectionDisplay(match) {
  const matchType = getMatchType(match)

  if (!hasWdlOdds(match.odds) || matchType.id === 'caution') {
    return '等待盘口确认'
  }

  if (matchType.id === 'balanced') return '平局防范'

  if (matchType.favoriteDirection) {
    return getOutcomeDirectionLabel(matchType.favoriteDirection)
  }

  return getOutcomeDirectionLabel(match.recommendation.direction)
}

function getRecommendationStrength(match) {
  if (!hasWdlOdds(match.odds)) return '观察为主'

  const matchType = getMatchType(match)

  if (matchType.id === 'caution') return '观察为主'
  if (matchType.id === 'balanced' || matchType.id === 'upsetWatch') {
    return '谨慎参考'
  }
  if (
    matchType.id === 'strongFavorite' &&
    match.recommendation.direction !== 'noBet'
  ) {
    const oddsSnapshot = getLocalOddsSnapshot(match)
    return oddsSnapshot?.favoriteOdd <= 1.7 ? '稳健参考' : '中等参考'
  }
  if (match.totalGoals.recommendation.direction !== 'noBet') return '中等参考'

  return '观察为主'
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

function getLocalOddsWdlDirection(localOddsEntry) {
  const homeWin = getNumberValue(localOddsEntry.homeWin)
  const draw = getNumberValue(localOddsEntry.draw)
  const awayWin = getNumberValue(localOddsEntry.awayWin)
  const teamsAreClose = Math.abs(homeWin - awayWin) <= 0.35
  const drawIsLow = draw <= Math.min(homeWin, awayWin) + 1.15

  if (teamsAreClose || drawIsLow) return '平局防范'
  if (homeWin < awayWin) return '主队不败'
  if (awayWin < homeWin) return '客队不败'
  return '平局防范'
}

function getWdlDirection(match) {
  const matchType = getMatchType(match)

  if (matchType.id === 'strongFavorite') {
    return getOutcomeDirectionLabel(matchType.favoriteDirection)
  }

  if (matchType.id === 'balanced') return '平局防范'

  if (matchType.id === 'upsetWatch') {
    return `${getOutcomeDirectionLabel(matchType.favoriteDirection)}，但防平`
  }

  if (matchType.id === 'caution') return '等待盘口确认'

  if (hasWdlOdds(match.odds) && match.recommendation.direction !== 'noBet') {
    if (match.recommendation.direction === 'home') return '主胜方向'
    if (match.recommendation.direction === 'away') return '客胜方向'
    return '平局防范'
  }

  return getWdlDirectionByStrength(match)
}

function getTotalGoalsDirection(match) {
  const matchType = getMatchType(match)

  if (matchType.id === 'strongFavorite') {
    return match.localOdds?.over25 < match.localOdds?.under25
      ? '2.5球以上倾向'
      : '2-3球区间'
  }

  if (matchType.id === 'balanced') return '2-3球区间'

  if (matchType.id === 'upsetWatch') {
    if (match.localOdds?.under25 <= match.localOdds?.over25) {
      return '2.5球以下倾向'
    }
    return '2-3球区间'
  }

  if (matchType.id === 'caution') return '2-3球区间'

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

function getTotalGoalsLean(match) {
  if (hasLocalOdds(match)) {
    if (match.localOdds.over25 < match.localOdds.under25) return 'over'
    if (match.localOdds.under25 < match.localOdds.over25) return 'under'
  }

  const direction = getTotalGoalsDirection(match)

  if (direction.includes('以上')) return 'over'
  if (direction.includes('以下')) return 'under'
  return 'range'
}

function getFavoriteDirection(match, matchType, oddsSnapshot) {
  if (matchType.favoriteDirection) return matchType.favoriteDirection
  if (oddsSnapshot?.favoriteDirection) return oddsSnapshot.favoriteDirection
  if (match.recommendation.direction === 'away') return 'away'
  return 'home'
}

function isStrongAttackState(value) {
  return value === '强' || value === '较强'
}

function isWeakDefenseState(value) {
  return value === '弱' || value === '偏弱'
}

function isStrongDefenseState(value) {
  return value === '强' || value === '较强'
}

function hasHighInjuryRisk(match) {
  return (
    getTeamStatusProfile(match, 'home').injuryRisk === '高' ||
    getTeamStatusProfile(match, 'away').injuryRisk === '高'
  )
}

function bothTeamsDefendWell(match) {
  return (
    isStrongDefenseState(getTeamStatusProfile(match, 'home').defenseState) &&
    isStrongDefenseState(getTeamStatusProfile(match, 'away').defenseState)
  )
}

function getDefensiveScorePair(favoriteDirection) {
  if (favoriteDirection === 'away') return { main: '0-1', backup: '1-1' }
  return { main: '1-0', backup: '1-1' }
}

function raiseHomeScore(score) {
  const scoreLiftMap = {
    '1-0': '2-0',
    '1-1': '2-1',
    '2-0': '3-0',
    '2-1': '3-1',
  }

  return scoreLiftMap[score] ?? score
}

function raiseAwayScore(score) {
  const scoreLiftMap = {
    '0-1': '0-2',
    '1-1': '1-2',
    '0-2': '0-3',
    '1-2': '1-3',
  }

  return scoreLiftMap[score] ?? score
}

function applyTeamStatusScoreTilt(match, pair, favoriteDirection) {
  if (hasHighInjuryRisk(match)) return pair

  const homeProfile = getTeamStatusProfile(match, 'home')
  const awayProfile = getTeamStatusProfile(match, 'away')

  if (bothTeamsDefendWell(match)) {
    return getDefensiveScorePair(favoriteDirection)
  }

  if (
    favoriteDirection === 'home' &&
    isStrongAttackState(homeProfile.attackState) &&
    isWeakDefenseState(awayProfile.defenseState)
  ) {
    return {
      main: raiseHomeScore(pair.main),
      backup: raiseHomeScore(pair.backup),
    }
  }

  if (
    favoriteDirection === 'away' &&
    isStrongAttackState(awayProfile.attackState) &&
    isWeakDefenseState(homeProfile.defenseState)
  ) {
    return {
      main: raiseAwayScore(pair.main),
      backup: raiseAwayScore(pair.backup),
    }
  }

  return pair
}

function getScoreReferencePair(match) {
  const matchType = getMatchType(match)
  const oddsSnapshot = getLocalOddsSnapshot(match)
  const totalGoalsLean = getTotalGoalsLean(match)
  const favoriteDirection = getFavoriteDirection(match, matchType, oddsSnapshot)

  if (matchType.id === 'caution' || !hasLocalOdds(match)) {
    return { main: '1-1', backup: '1-0' }
  }

  if (matchType.id === 'balanced') {
    if (totalGoalsLean === 'over') return { main: '2-2', backup: '2-1' }
    if (totalGoalsLean === 'under') return { main: '1-1', backup: '0-0' }
    return { main: '1-1', backup: '2-1' }
  }

  if (matchType.id === 'upsetWatch') {
    if (oddsSnapshot?.draw <= 3.4) return { main: '1-1', backup: '0-0' }
    if (favoriteDirection === 'away') return { main: '1-1', backup: '1-2' }
    if (totalGoalsLean === 'under') return { main: '1-1', backup: '0-1' }
    return { main: '1-1', backup: '2-1' }
  }

  let scorePair = { main: '1-1', backup: '1-0' }

  if (oddsSnapshot?.favoriteOdd <= 1.65) {
    if (favoriteDirection === 'away') {
      if (totalGoalsLean === 'over') scorePair = { main: '0-2', backup: '1-3' }
      else if (totalGoalsLean === 'under') scorePair = { main: '0-1', backup: '0-2' }
      else scorePair = { main: '0-2', backup: '1-2' }
    } else if (totalGoalsLean === 'over') {
      scorePair = { main: '2-0', backup: '3-1' }
    } else if (totalGoalsLean === 'under') {
      scorePair = { main: '1-0', backup: '2-0' }
    } else {
      scorePair = { main: '2-0', backup: '2-1' }
    }
  } else if (oddsSnapshot?.favoriteOdd <= 2.05) {
    scorePair =
      favoriteDirection === 'away'
        ? { main: '1-2', backup: '0-1' }
        : { main: '2-1', backup: '1-0' }
  }

  return applyTeamStatusScoreTilt(match, scorePair, favoriteDirection)
}

function hasScoutedTeam(match) {
  return Boolean(match.homeTeam.confederation || match.awayTeam.confederation)
}

function shouldShowUpsetScore(match) {
  return getMatchType(match).id === 'upsetWatch'
}

function isSkipPrimary(match) {
  return !hasWdlOdds(match.odds) || getMatchType(match).id === 'caution'
}

function getPrimaryDisplay(match) {
  const direction = getPrimaryDirectionDisplay(match)
  const strength = getRecommendationStrength(match)

  return `${direction}｜${strength}`
}

function getCompactDirectionDisplay(match) {
  return getPrimaryDirectionDisplay(match).replace('等待盘口确认', '等待盘口')
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

function getFeaturedMatchScore(match, index) {
  const strength = getRecommendationStrength(match)
  const matchType = getMatchType(match)
  const strengthWeight = {
    稳健参考: 34,
    中等参考: 28,
    谨慎参考: 16,
    观察为主: 0,
  }[strength] ?? 0
  const typeWeight = {
    strongFavorite: 22,
    balanced: 14,
    upsetWatch: 12,
    caution: 0,
  }[matchType.id] ?? 0

  return (
    (hasLocalOdds(match) ? 120 : 0) +
    (strength !== '观察为主' ? 36 : 0) +
    getAiConfidence(match) * 1.2 +
    strengthWeight +
    typeWeight -
    index * 0.25
  )
}

function getFeaturedMatches(matches) {
  if (!matches.length) return []

  const featuredItems = matches.map((match, index) => ({
      match,
      sourceIndex: index,
      score: getFeaturedMatchScore(match, index),
    }))
    .sort((current, next) => next.score - current.score)

  const featuredMatches = featuredItems.slice(0, 3)
  const firstLocalOddsMatch = featuredItems.find((item) =>
    hasLocalOdds(item.match),
  )

  if (
    firstLocalOddsMatch &&
    !featuredMatches.some(
      (item) => item.sourceIndex === firstLocalOddsMatch.sourceIndex,
    )
  ) {
    return [firstLocalOddsMatch, ...featuredMatches.slice(0, 2)]
  }

  return featuredMatches
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
    hint = match.risk.tone === 'low' ? '可中等参考，不追高。' : '不建议追热放大波动。'
  } else if (match.totalGoals.recommendation.direction !== 'noBet') {
    hint = `${match.totalGoals.recommendation.label}比胜平负更清晰。`
  } else {
    hint = '热度与建议不完全一致，控制参与强度。'
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
    return `${getPrimaryDirectionDisplay(match)}更清晰，${getRecommendationStrength(match)}。`
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
    notes.push('波动偏大，少碰或放弃。')
  } else {
    notes.push('信号明确，也要控制参与强度。')
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
  if (meta?.dataSource === 'real') return '真实API'
  return '本地模拟'
}

function buildSpotlightCopyText(match, scoreReference) {
  const primaryDisplay = getPrimaryDisplay(match)
  const recommendationStrength = getRecommendationStrength(match)
  const directionText = primaryDisplay.includes(recommendationStrength)
    ? primaryDisplay
    : `${primaryDisplay}｜${recommendationStrength}`

  return [
    '赛前AI重点参考',
    `${match.homeTeam.name} vs ${match.awayTeam.name}`,
    `方向：${directionText}`,
    `信心指数：${getAiConfidence(match)}%`,
    `比分参考：${scoreReference.main} / ${scoreReference.backup}`,
    `大小球：${getTotalGoalsDirection(match)}`,
    '阶段：赛前初盘，赛前24小时建议复核',
    '仅供赛前初盘参考，临场阵容、盘口变化和市场热度需复核。',
  ].join('\n')
}

async function copyTextToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // Continue to textarea fallback below.
    }
  }

  const textarea = document.createElement('textarea')
  let copiedByEvent = false
  const handleCopy = (event) => {
    event.clipboardData?.setData('text/plain', text)
    event.preventDefault()
    copiedByEvent = true
  }

  textarea.value = text
  textarea.style.position = 'fixed'
  textarea.style.left = '0'
  textarea.style.top = '0'
  textarea.style.width = '1px'
  textarea.style.height = '1px'
  textarea.style.opacity = '0'
  textarea.style.pointerEvents = 'none'
  document.body.appendChild(textarea)
  textarea.focus()
  textarea.select()
  textarea.setSelectionRange(0, text.length)
  document.addEventListener('copy', handleCopy)

  try {
    return document.execCommand('copy') || copiedByEvent
  } catch {
    return false
  } finally {
    document.removeEventListener('copy', handleCopy)
    document.body.removeChild(textarea)
  }
}

function App() {
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [analysisPhase, setAnalysisPhase] = useState('done')
  const [lastAnalyzedAt, setLastAnalyzedAt] = useState(() => new Date())
  const [matchDataset, setMatchDataset] = useState(() => getInitialMatchSnapshot())
  const [spotlightCopyStatus, setSpotlightCopyStatus] = useState('idle')
  const [expandedDateKeys, setExpandedDateKeys] = useState({})
  const [showInternalEngine, setShowInternalEngine] = useState(false)

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

  const normalizedMatches = dashboard.matches
  const groupedMatches = useMemo(
    () => groupMatchesByBeijingDate(normalizedMatches),
    [normalizedMatches],
  )

  useEffect(() => {
    if (!normalizedMatches.length) return

    setSelectedIndex((prevIndex) => {
      if (prevIndex >= 0 && prevIndex < normalizedMatches.length) {
        return prevIndex
      }

      return 0
    })
  }, [normalizedMatches.length])

  const safeSelectedIndex =
    selectedIndex >= 0 && selectedIndex < normalizedMatches.length
      ? selectedIndex
      : 0
  const activeMatch =
    normalizedMatches[safeSelectedIndex] ||
    null
  const internalBetPlan = useMemo(
    () =>
      activeMatch
        ? buildBetPlan(activeMatch, {
            bankroll: 10000,
            maxStakePerMatch: 500,
            engineMode: 'internal',
          })
        : null,
    [activeMatch],
  )
  const selectedDateKey = activeMatch
    ? getBeijingDateGroupInfo(activeMatch.kickoff).dateKey
    : ''

  if (!activeMatch) {
    return (
      <main className="rookie-dashboard">
        <section className="hero-card">
          <div className="hero-copy">
            <div className="eyebrow">
              <Activity size={16} />
              PRE-MATCH AI
            </div>
            <h1>暂无比赛数据</h1>
            <p>暂无可展示的比赛数据，等待赛程更新。</p>
          </div>
        </section>
        <footer className="risk-footer">
          <span>
            本工具仅用于数据分析和娱乐参考，不构成投资或投注建议。请遵守当地法律法规，理性参与，控制风险。
          </span>
        </footer>
      </main>
    )
  }

  const isAnalyzing = analysisPhase !== 'done'
  const selectedConfidence = getAiConfidence(activeMatch)
  const selectedSignalStrength = getSignalStrength(selectedConfidence)
  const marketSentiment = buildMarketSentiment(activeMatch)
  const analysisTimeline = buildAnalysisTimeline(lastAnalyzedAt)
  const homeTeamStatus = getTeamStatusProfile(activeMatch, 'home')
  const awayTeamStatus = getTeamStatusProfile(activeMatch, 'away')
  const homeSquadInsight = getSquadInsight(activeMatch, 'home')
  const awaySquadInsight = getSquadInsight(activeMatch, 'away')
  const activeMatchType = getMatchType(activeMatch)
  const featuredMatches = getFeaturedMatches(normalizedMatches)
  const spotlightMatch = featuredMatches[0]?.match ?? normalizedMatches[0]
  const spotlightScoreReference = spotlightMatch
    ? getScoreReferencePair(spotlightMatch)
    : null
  const spotlightCopyText =
    spotlightMatch && spotlightScoreReference
      ? buildSpotlightCopyText(spotlightMatch, spotlightScoreReference)
      : ''
  const analyzedMatchCount = normalizedMatches.length
  const featuredMatchCount = featuredMatches.length
  const highConfidenceMatchCount = normalizedMatches.filter(
    (match) => getAiConfidence(match) >= 80,
  ).length
  const pendingMarketCount = normalizedMatches.filter(
    (match) => !hasLocalOdds(match) || !hasWdlOdds(match.odds),
  ).length

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

  async function handleCopySpotlightText() {
    if (!spotlightCopyText) return

    const didCopy = await copyTextToClipboard(spotlightCopyText)
    setSpotlightCopyStatus(didCopy ? 'copied' : 'failed')
    window.setTimeout(() => setSpotlightCopyStatus('idle'), 1_800)
  }

  function handleToggleDateGroup(dateKey, isExpanded) {
    setExpandedDateKeys((currentDateKeys) => ({
      ...currentDateKeys,
      [dateKey]: !isExpanded,
    }))
  }

  return (
    <main className="rookie-dashboard">
      <section className="hero-card">
        <div className="hero-copy">
          <div className="eyebrow">
            <Activity size={16} />
            PRE-MATCH AI
          </div>
          <h1>世界杯赛前AI分析</h1>
          <p>赛前初盘参考，重点看方向、比分和进球倾向，临场阵容需复核。</p>
          <div className="hero-status-row" aria-live="polite">
            <span className={`ai-status-pill ${isAnalyzing ? 'running' : 'done'}`}>
              <i />
              模型状态：{analysisPhaseConfig[analysisPhase].label}
            </span>
            <span>最近更新时间：{formatUpdateTime(lastAnalyzedAt)}</span>
            <span>数据源：{formatDataSource(matchDataset.meta)}</span>
          </div>
        </div>
        <div className="hero-pick hero-system-status">
          <span>系统状态</span>
          <strong>赛前初盘｜临场需复核</strong>
          <p>真实API同步 · 已分析 {analyzedMatchCount} 场</p>
          <div className="hero-system-tags" aria-label="系统状态摘要">
            <b>赛前数据扫描</b>
            <b>盘口参考逐步补充</b>
          </div>
        </div>
      </section>

      {spotlightMatch && spotlightScoreReference ? (
        <section className="daily-ai-spotlight" aria-label="赛前AI重点参考卡">
          <div className="daily-ai-copy">
            <span>赛前AI重点参考</span>
            <h2>
              {spotlightMatch.homeTeam.name} vs {spotlightMatch.awayTeam.name}
            </h2>
            <p>{formatKickoff(spotlightMatch.kickoff)}</p>
          </div>

          <div className="daily-ai-summary" aria-label="重点推荐摘要">
            <div className="daily-ai-primary-grid">
              <p className="daily-ai-direction">
                <span>AI方向</span>
                <strong>{getPrimaryDisplay(spotlightMatch)}</strong>
              </p>
              <p className="daily-ai-score-highlight">
                <span>比分参考</span>
                <strong>
                  {spotlightScoreReference.main} / {spotlightScoreReference.backup}
                </strong>
              </p>
            </div>
            <div className="daily-ai-facts">
              <p>
                <span>信心指数</span>
                <strong>{getAiConfidence(spotlightMatch)}%</strong>
              </p>
              <p>
                <span>大小球方向</span>
                <strong>{getTotalGoalsDirection(spotlightMatch)}</strong>
              </p>
              <p className="daily-ai-secondary-fact">
                <span>推荐强度</span>
                <strong>{getRecommendationStrength(spotlightMatch)}</strong>
              </p>
              <p className="daily-ai-secondary-fact">
                <span>分析阶段</span>
                <strong>赛前初盘</strong>
              </p>
              <p className="daily-ai-secondary-fact">
                <span>复核提醒</span>
                <strong>赛前24小时建议重新更新</strong>
              </p>
            </div>
            <small>
              当前为赛前初盘参考，临场阵容、盘口变化和市场热度可能影响最终方向。
            </small>
            <button
              className={
                spotlightCopyStatus === 'copied'
                  ? 'daily-ai-copy-button copied'
                  : 'daily-ai-copy-button'
              }
              onClick={handleCopySpotlightText}
              type="button"
            >
              {spotlightCopyStatus === 'copied' ? (
                <Check size={16} />
              ) : (
                <Copy size={16} />
              )}
              {spotlightCopyStatus === 'copied'
                ? '已复制'
                : spotlightCopyStatus === 'failed'
                  ? '复制失败'
                  : '复制推荐文案'}
            </button>
          </div>
        </section>
      ) : null}

      <section className="overview-grid" aria-label="赛前状态概览">
        <article className="metric-card">
          <CalendarDays className="metric-icon blue" />
          <span>已分析</span>
          <strong>{analyzedMatchCount} 场</strong>
        </article>
        <article className="metric-card">
          <Clock3 className="metric-icon gold" />
          <span>重点</span>
          <strong>{featuredMatchCount} 场</strong>
        </article>
        <article className="metric-card">
          <Target className="metric-icon green" />
          <span>高信心</span>
          <strong>{highConfidenceMatchCount} 场</strong>
        </article>
        <article className="metric-card">
          <WalletCards className="metric-icon red" />
          <span>待补盘口</span>
          <strong>{pendingMarketCount} 场</strong>
        </article>
      </section>

      <section className="featured-matches-panel" aria-label="更多重点场次">
        <div className="section-title featured-title">
          <span>重点筛选</span>
          <h2>更多重点场次</h2>
          <p>系统优先筛选有盘口、有方向、有参考价值的比赛。</p>
        </div>

        {featuredMatches.length ? (
          <div className="featured-match-grid">
            {featuredMatches.map(({ match, sourceIndex }) => {
              const matchType = getMatchType(match)
              const scoreReference = getScoreReferencePair(match)

              return (
                <button
                  className={
                    safeSelectedIndex === sourceIndex
                      ? 'featured-match-card active'
                      : 'featured-match-card'
                  }
                  key={`${match.uiKey}-${sourceIndex}`}
                  onClick={() => setSelectedIndex(sourceIndex)}
                  type="button"
                >
                  <div className="featured-card-head">
                    <span>{matchType.label}</span>
                    <strong>
                      {match.homeTeam.name} vs {match.awayTeam.name}
                    </strong>
                    <small>{formatKickoff(match.kickoff)}</small>
                  </div>

                  <div className="featured-card-main">
                    <p className="featured-card-direction">
                      <span>AI方向</span>
                      <strong>{getPrimaryDirectionDisplay(match)}</strong>
                    </p>
                    <p>
                      <span>信心</span>
                      <strong>{getAiConfidence(match)}%</strong>
                    </p>
                    <p>
                      <span>比分</span>
                      <strong>{scoreReference.main} / {scoreReference.backup}</strong>
                    </p>
                    <p className="featured-card-muted">
                      <span>进球倾向</span>
                      <strong>{getTotalGoalsDirection(match)}</strong>
                    </p>
                    <p className="featured-card-muted">
                      <span>强度</span>
                      <strong>{getRecommendationStrength(match)}</strong>
                    </p>
                  </div>
                </button>
              )
            })}
          </div>
        ) : (
          <p className="featured-empty">暂无重点场次，等待赛程与盘口更新。</p>
        )}
      </section>

      <section className="main-layout">
        <aside className="match-list-panel">
          <div className="section-title">
            <span>全部赛程</span>
            <h2>分日期赛程</h2>
          </div>

          <div className="simple-match-list">
            {groupedMatches.map((dateGroup, groupIndex) => {
              const isDefaultExpanded =
                groupIndex === 0 && expandedDateKeys[dateGroup.dateKey] === undefined
              const isExpanded =
                dateGroup.dateKey === selectedDateKey ||
                expandedDateKeys[dateGroup.dateKey] === true ||
                isDefaultExpanded

              return (
                <section className="match-date-group" key={dateGroup.dateKey}>
                  <button
                    aria-controls={`match-date-list-${dateGroup.dateKey}`}
                    aria-expanded={isExpanded}
                    className="match-date-toggle"
                    onClick={() => handleToggleDateGroup(dateGroup.dateKey, isExpanded)}
                    type="button"
                  >
                    <span>
                      <strong>{dateGroup.label}</strong>
                      <small>{dateGroup.matches.length}场</small>
                    </span>
                    <i className={isExpanded ? 'date-toggle-arrow open' : 'date-toggle-arrow'}>
                      ▾
                    </i>
                  </button>

                  {isExpanded ? (
                    <div
                      className="match-date-list"
                      id={`match-date-list-${dateGroup.dateKey}`}
                    >
                      {dateGroup.matches.map(({ match, index }) => {
                        const matchType = getMatchType(match)
                        const scoreReference = getScoreReferencePair(match)

                        return (
                          <button
                            className={
                              safeSelectedIndex === index
                                ? 'simple-match-card active'
                                : 'simple-match-card'
                            }
                            key={match.uiKey}
                            onClick={() => setSelectedIndex(index)}
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
                            <span className="match-card-time">{formatKickoff(match.kickoff)}</span>
                            <div className="match-card-signal">
                              <strong>{getCompactDirectionDisplay(match)}</strong>
                              <span>{getAiConfidence(match)}%</span>
                              <em>{getRecommendationStrength(match)}</em>
                            </div>
                            <div className="match-card-detail">
                              <span>
                                比分：<strong>{scoreReference.main} / {scoreReference.backup}</strong>
                              </span>
                              <span>
                                大小球：<strong>{getTotalGoalsDirection(match)}</strong>
                              </span>
                            </div>
                            <div className="match-card-tags">
                              <em className={`match-type-pill ${matchType.tone}`}>
                                {matchType.label}
                              </em>
                              <b>{getScoreText(match)}</b>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  ) : null}
                </section>
              )
            })}
          </div>
        </aside>

        <section className="focus-column">
          <section className="core-card quick-conclusion-card" aria-label="核心结论卡">
            <div className="quick-card-top">
              <span>比赛名称</span>
              <h2>
                {activeMatch.homeTeam.name} vs {activeMatch.awayTeam.name}
              </h2>
              <p className="quick-kickoff-time">
                {formatKickoff(activeMatch.kickoff)}
              </p>
            </div>

            <div className="analysis-stage-strip" aria-label="分析阶段与复核提醒">
              <div className="analysis-stage-items">
                <p>
                  <span>分析阶段</span>
                  <strong>赛前初盘</strong>
                </p>
                <p>
                  <span>复核提醒</span>
                  <strong>赛前24小时建议重新更新</strong>
                </p>
              </div>
              <small>
                当前为赛前初盘参考，临场阵容、盘口变化和市场热度可能影响最终方向。
              </small>
            </div>

            <div className="quick-recommendation">
              <span>主推方向</span>
              <strong className={isSkipPrimary(activeMatch) ? 'skip-primary' : ''}>
                {getPrimaryDisplay(activeMatch)}
              </strong>
            </div>

            <div className="quick-meta-grid">
              <article>
                <span>比赛类型</span>
                <em className={`risk-tag ${activeMatchType.tone}`}>
                  {activeMatchType.label}
                </em>
              </article>
              <article>
                <span>推荐强度</span>
                <strong>{getRecommendationStrength(activeMatch)}</strong>
              </article>
              <article>
                <span>信心指数</span>
                <strong>{selectedConfidence}%</strong>
                <small>信号强度：{selectedSignalStrength}</small>
              </article>
            </div>

            <div className="quick-judgement-block">
              <span>一句话判断</span>
              <p className="quick-judgement">{buildJudgementLine(activeMatch)}</p>
            </div>

            <div className="analysis-action-row">
              <div className="analysis-state-copy">
                <p className={isAnalyzing ? 'analysis-state running' : 'analysis-state'}>
                  {analysisPhaseConfig[analysisPhase].message}
                </p>
                <small>
                  当前为赛前初盘参考。后续可接入 GPT 深度分析，临场仍需复核阵容与盘口变化。
                </small>
              </div>
              <button
                className="reanalyze-button"
                disabled={isAnalyzing}
                onClick={handleReanalyze}
                type="button"
              >
                <Activity size={16} />
                {isAnalyzing ? '整理中' : '刷新本场赛前参考'}
              </button>
            </div>
          </section>

          <section className="ai-flow-panel" aria-label="AI赛前分析步骤">
            <div className="section-title compact-title">
              <span>AI赛前分析步骤</span>
              <h2>赛前模型已整理本场参考</h2>
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

          <section className="team-status-panel" aria-label="球队状态">
            <div className="section-title compact-title">
              <span>赛前情报</span>
              <h2>球队状态</h2>
            </div>
            <div className="team-status-grid">
              <TeamStatusCard
                profile={homeTeamStatus}
                sideLabel="主队"
                teamName={activeMatch.homeTeam.name}
              />
              <TeamStatusCard
                profile={awayTeamStatus}
                sideLabel="客队"
                teamName={activeMatch.awayTeam.name}
              />
            </div>
          </section>

          <section className="team-status-panel squad-insight-panel" aria-label="阵容情报">
            <div className="section-title compact-title">
              <span>赛前情报</span>
              <h2>阵容情报</h2>
            </div>
            <div className="team-status-grid">
              <SquadInsightCard
                insight={homeSquadInsight}
                sideLabel="主队"
                teamName={activeMatch.homeTeam.name}
              />
              <SquadInsightCard
                insight={awaySquadInsight}
                sideLabel="客队"
                teamName={activeMatch.awayTeam.name}
              />
            </div>
          </section>

          <section className="play-reference-panel" aria-label="玩法参考">
            <div className="section-title compact-title">
              <span>赛前结论</span>
              <h2>AI玩法参考</h2>
            </div>

            <div className="play-grid">
              <article className="play-card odds-card">
                <BarChart3 size={20} />
                <span>盘口参考</span>
                <strong>{getMarketStatus(activeMatch)}</strong>
                {hasLocalOdds(activeMatch) ? (
                  <>
                    <div className="odds-reference-grid">
                      <p>
                        <span>主胜</span>
                        <strong>{formatOddsValue(activeMatch.localOdds.homeWin)}</strong>
                      </p>
                      <p>
                        <span>平</span>
                        <strong>{formatOddsValue(activeMatch.localOdds.draw)}</strong>
                      </p>
                      <p>
                        <span>客胜</span>
                        <strong>{formatOddsValue(activeMatch.localOdds.awayWin)}</strong>
                      </p>
                      <p>
                        <span>大2.5</span>
                        <strong>{formatOddsValue(activeMatch.localOdds.over25)}</strong>
                      </p>
                      <p>
                        <span>小2.5</span>
                        <strong>{formatOddsValue(activeMatch.localOdds.under25)}</strong>
                      </p>
                      <p>
                        <span>让球参考</span>
                        <strong>{activeMatch.localOdds.handicap}</strong>
                      </p>
                    </div>
                    <small className="odds-reference-note">
                      {activeMatch.localOdds.note}
                    </small>
                  </>
                ) : (
                  <p>{NO_ODDS_REASON}</p>
                )}
              </article>

              <article className="play-card">
                <Crosshair size={20} />
                <span>胜平负方向</span>
                <strong>{getWdlDirection(activeMatch)}</strong>
                <p>
                  {hasWdlOdds(activeMatch.odds)
                    ? '结合基础面与盘口价值。'
                    : '基于球队强弱分的赛前初判。'}
                </p>
                <em className={`risk-tag ${activeMatchType.tone}`}>
                  {getRecommendationStrength(activeMatch)}
                </em>
              </article>

              <article className="play-card">
                <Gauge size={20} />
                <span>大小球方向</span>
                <strong>{getTotalGoalsDirection(activeMatch)}</strong>
                <p>
                  {hasWdlOdds(activeMatch.odds)
                    ? '结合进攻、防守和总进球盘口。'
                    : '暂无赔率时使用基础面区间参考。'}
                </p>
                <em className={`risk-tag ${activeMatchType.tone}`}>
                  {getRecommendationStrength(activeMatch)}
                </em>
              </article>

              <article className="play-card score-card">
                <Target size={20} />
                <span>比分参考</span>
                <div className="score-reference-list">
                  <p>
                    <span>主比分</span>
                    <strong>{getScoreReferencePair(activeMatch).main}</strong>
                  </p>
                  <p>
                    <span>备选比分</span>
                    <strong>{getScoreReferencePair(activeMatch).backup}</strong>
                  </p>
                  {shouldShowUpsetScore(activeMatch) && (
                    <p>
                      <span>冷门观察</span>
                      <strong>1-1 小防</strong>
                    </p>
                  )}
                </div>
                <small className="score-reference-note">{SCORE_REFERENCE_NOTICE}</small>
              </article>

              <article className="play-card steady-card">
                <TrendingUp size={20} />
                <span>稳健玩法</span>
                <strong>{activeMatch.conservativeAdvice.text}</strong>
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
                    <span>市场参考</span>
                    <span>模型参考</span>
                    <span>参考差异</span>
                  </div>
                  {outcomes.map((outcome) => (
                    <div className="detail-row" key={outcome}>
                      <strong>{outcomeLabels[outcome]}</strong>
                      <span>{formatPercent(activeMatch.market.probabilities[outcome])}</span>
                      <span>{formatPercent(activeMatch.model[outcome])}</span>
                      <b>{formatPointDiff(activeMatch.valueDiffs[outcome])}</b>
                    </div>
                  ))}
                </div>
              </section>

              <section className="detail-block">
                <h3>大小球详细数据</h3>
                <div className="detail-table total-table">
                  <div className="detail-row detail-head">
                    <span>方向</span>
                    <span>市场参考</span>
                    <span>模型参考</span>
                    <span>参考差异</span>
                  </div>
                  <div className="detail-row">
                    <strong>大2.5</strong>
                    <span>{formatPercent(activeMatch.totalGoals.market.probabilities.over25)}</span>
                    <span>{formatPercent(activeMatch.totalGoals.model.over25Probability)}</span>
                    <b>{formatPointDiff(activeMatch.totalGoals.recommendation.valueDiffs.over25)}</b>
                  </div>
                  <div className="detail-row">
                    <strong>小2.5</strong>
                    <span>{formatPercent(activeMatch.totalGoals.market.probabilities.under25)}</span>
                    <span>{formatPercent(activeMatch.totalGoals.model.under25Probability)}</span>
                    <b>{formatPointDiff(activeMatch.totalGoals.recommendation.valueDiffs.under25)}</b>
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
                          {activeMatch.homeTeam[metric.key]} /{' '}
                          {activeMatch.awayTeam[metric.key]}
                        </b>
                      </div>
                      <div className="dual-bars">
                        <i
                          className={metric.positive ? 'home-bar' : 'home-bar warning'}
                          style={{ width: `${activeMatch.homeTeam[metric.key]}%` }}
                        />
                        <i
                          className={metric.positive ? 'away-bar' : 'away-bar warning'}
                          style={{ width: `${activeMatch.awayTeam[metric.key]}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="detail-block">
                <h3>近期状态变化参考</h3>
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

          <div className="internal-engine-toggle-row">
            <button
              className="internal-engine-toggle"
              type="button"
              onClick={() => setShowInternalEngine((isVisible) => !isVisible)}
            >
              {showInternalEngine ? '隐藏内部引擎' : '显示内部引擎'}
            </button>
          </div>

          {showInternalEngine && internalBetPlan ? (
            <section className="internal-engine-panel" aria-label="内部下注引擎 V1">
              <div className="internal-engine-head">
                <div>
                  <span>内部工具</span>
                  <h3>内部下注引擎 V1</h3>
                </div>
                <p>静态赛前规则验收，不代表真实盈利能力。</p>
              </div>

              <div className="internal-engine-summary">
                <p>
                  <span>综合评分</span>
                  <strong>{internalBetPlan.betScore}</strong>
                </p>
                <p>
                  <span>参考级别</span>
                  <strong>{internalBetPlan.recommendLevel}</strong>
                </p>
                <p>
                  <span>主方向</span>
                  <strong>{internalBetPlan.mainPick?.label ?? '-'}</strong>
                </p>
                <p>
                  <span>副方向</span>
                  <strong>{internalBetPlan.secondaryPick?.label ?? '-'}</strong>
                </p>
              </div>

              <div className="internal-engine-block">
                <h4>资金分配</h4>
                <div className="internal-total-stake">
                  <span>总投入</span>
                  <strong>{internalBetPlan.totalStake} U</strong>
                </div>
                {internalBetPlan.stakePlan.length ? (
                  <div className="internal-stake-list">
                    {internalBetPlan.stakePlan.map((item) => (
                      <p key={`${item.market}-${item.pick}-${item.label}`}>
                        <span>{getInternalMarketLabel(item.market)}</span>
                        <strong>{item.label}</strong>
                        <b>{item.stake} U</b>
                      </p>
                    ))}
                  </div>
                ) : (
                  <small>当前为观望或数据不足，暂无资金分配。</small>
                )}
              </div>

              <div className="internal-engine-block">
                <h4>热度提示</h4>
                <p className="internal-engine-note">
                  {internalBetPlan.heatWarning?.message ?? '-'}
                </p>
              </div>

              <div className="internal-engine-block">
                <h4>数据完整度</h4>
                <div className="internal-quality-grid">
                  {Object.entries(internalBetPlan.dataQuality ?? {})
                    .filter(([, value]) => !Array.isArray(value))
                    .map(([key, value]) => (
                      <p key={key} className={`quality-${value}`}>
                        <span>{getInternalDataQualityLabel(key)}</span>
                        <strong>{getInternalDataQualityStatus(value)}</strong>
                      </p>
                    ))}
                </div>
                {internalBetPlan.dataQuality?.limitations?.length ? (
                  <p className="internal-limitations">
                    限制项：{internalBetPlan.dataQuality.limitations.length} 项待补
                  </p>
                ) : null}
              </div>

              <div className="internal-engine-block">
                <h4>取消条件</h4>
                <ul className="internal-rule-list">
                  {internalBetPlan.cancelRules.map((rule) => (
                    <li key={rule}>{rule}</li>
                  ))}
                </ul>
              </div>

              <div className="internal-engine-block">
                <h4>评分拆解</h4>
                <div className="internal-breakdown-list">
                  {Object.entries(internalBetPlan.scoreBreakdown ?? {}).map(
                    ([key, item]) => (
                      <article key={key}>
                        <div>
                          <span>{getInternalScoreBreakdownLabel(key)}</span>
                          <strong>{item.score}</strong>
                        </div>
                        <p>{item.reason}</p>
                      </article>
                    ),
                  )}
                </div>
              </div>

              <div className="internal-engine-block">
                <h4>公开摘要预览</h4>
                <p className="internal-engine-note">{internalBetPlan.publicSummary}</p>
              </div>
            </section>
          ) : null}
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
      </footer>
    </main>
  )
}

export default App
