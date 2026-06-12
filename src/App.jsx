import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity,
  BarChart3,
  CalendarDays,
  Check,
  Clock3,
  Copy,
  Crosshair,
  Download,
  Gauge,
  Image as ImageIcon,
  Loader2,
  ShieldAlert,
  Target,
  TrendingUp,
  WalletCards,
  X,
} from 'lucide-react'
import betHistoryData from './data/betHistory.json'
import { localOdds } from './data/localOdds'
import { getManualLineupForMatch } from './data/manualLineups.js'
import { SQUAD_INSIGHTS } from './data/squadInsights'
import { TEAM_PROFILES } from './data/teamProfiles'
import teamsData from './data/teams.json'
import { requestAiAnalysis } from './services/aiAnalysisApi.js'
import { buildAiAnalysisPayload } from './services/aiAnalysisPayload.js'
import {
  copyPosterImage,
  createSharePosterPng,
  downloadSharePoster,
} from './services/sharePoster.js'
import {
  buildRecommendationShareText,
  buildShareMatchPayload,
} from './services/shareText.js'
import {
  getDisplayConfidence,
  getDisplayConfidenceTier,
} from './services/displayConfidence.js'
import { getInitialMatchSnapshot, getMatches } from './services/matchApi'
import buildBetPlan from './services/betEngine.js'
import {
  getFinishedMatchesForHistory,
  getFocusMatches,
  selectFocusMatch,
} from './services/matchFocus.js'
import {
  ONBOARDING_NOTICE_BODY,
  ONBOARDING_NOTICE_CLOSE_TEXT,
  ONBOARDING_NOTICE_TITLE,
  markOnboardingNoticeDismissed,
  shouldShowOnboardingNotice,
} from './services/onboardingNotice.js'
import {
  findHistoryRecordForMatch,
  formatSettlementHit,
  settlePredictionSnapshot,
} from './services/predictionSettlement.js'
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
const SCORE_REFERENCE_NOTICE = '比分波动较大，仅作赛前参考，临场阵容需复核。'
const LINEUP_GROUPS = ['门将', '后卫', '中场', '前锋']
const SAFE_ODDS_SUMMARY_KEY = ['remote', 'Odds'].join('')
const SAFE_TEAM_FORM_SUMMARY_KEY = ['remote', 'TeamForm'].join('')

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
  'Korea Republic': '韩国',
  'Republic of Korea': '韩国',
  Czechia: '捷克',
  'Czech Republic': '捷克',
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
    message: '本地规则已完成本场解释',
    activeStep: analysisFlowSteps.length,
  },
  scanning: {
    label: '运行中',
    message: '规则引擎正在整理盘口参考...',
    activeStep: 1,
  },
  risk: {
    label: '运行中',
    message: '规则引擎正在整理风险提示...',
    activeStep: 3,
  },
  generating: {
    label: '运行中',
    message: '本地解释正在整理展示文案...',
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
  oddsConfidence: '赔率置信度',
  lineupCertainty: '首发确定性',
  rotationRisk: '轮换风险',
  injuryDataQuality: '伤停数据质量',
}

const internalDataQualityStatusLabels = {
  localSnapshot: '本地快照',
  missing: '缺失',
  partial: '部分',
  estimated: '估算',
  unavailable: '不可用',
  available: '可用',
  high: '高',
  medium: '中',
  low: '低',
  unknown: '待确认',
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

const internalRiskFlagLabels = {
  favoriteTooLow: '热门价格偏低',
  overPriceThin: '大球价格支撑不足',
  handicapRisk: '让球方向存在风险',
  scoreVolatile: '比分波动较高',
  upsetRisk: '冷门扰动风险',
  underHasSupport: '小球方向有一定支撑',
  drawHasProtection: '平局保护明显',
}

const internalLimitationLabels = {
  missingOneXTwoOdds: '缺少胜平负赔率',
  missingModelProbability: '缺少模型概率',
  missingTotalGoalsModel: '缺少大小球模型概率',
  missingTotalGoalsOdds: '缺少大小球赔率',
  missingMarketMovementHistory: '缺少盘口变化历史',
  realInjuriesMissing: '真实伤停缺失',
  expectedLineupsMissing: '预计首发缺失',
  marketMovementHistoryMissing: '盘口变化历史缺失',
  oddsUpdatedAtMissing: '赔率更新时间缺失',
  handicapStructuredMissing: '让球结构未结构化',
  snapshotPersistenceMissing: '快照未持久化',
  resultSettlementMissing: '赛果未结算',
  oddsConfidenceLow: '赔率置信度偏低',
  injuryDataQualityMissing: '伤停数据质量缺失',
  injuryDataQualityPartial: '伤停数据仅部分可用',
  lineupCertaintyLow: '首发确定性偏低',
  rotationRiskReviewRequired: '轮换情况需复核',
  teamVolatilityHigh: '球队波动偏高',
  teamUpsetRiskReview: '冷门扰动需观察',
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

function getInternalRiskFlagLabel(flag) {
  return internalRiskFlagLabels[flag] ?? flag
}

function formatInternalRiskText(text) {
  return Object.entries(internalRiskFlagLabels).reduce(
    (currentText, [key, label]) => currentText.split(key).join(label),
    String(text ?? ''),
  )
}

function getInternalLimitationLabel(limitation) {
  if (String(limitation).startsWith('valueFlag:')) {
    const flag = String(limitation).replace('valueFlag:', '')
    return `盘口风险：${getInternalRiskFlagLabel(flag)}`
  }

  return internalLimitationLabels[limitation] ?? formatInternalRiskText(limitation)
}

function getInternalLimitationSummaries(limitations = []) {
  const summaries = Array.from(
    new Set(limitations.map((limitation) => getInternalLimitationLabel(limitation))),
  )
  const visibleSummaries = summaries.slice(0, 5)
  const hiddenCount = Math.max(summaries.length - visibleSummaries.length, 0)

  return hiddenCount
    ? [...visibleSummaries, `另有 ${hiddenCount} 项数据限制待补。`]
    : visibleSummaries
}

function getInternalLayerStatusSummary(teams, key) {
  const values = Array.from(
    new Set(
      teams
        .map((team) => team?.[key])
        .filter(Boolean)
        .map((value) => getInternalDataQualityStatus(value)),
    ),
  )

  return values.length ? values.join(' / ') : '-'
}

function getInternalLightDataLayerSummary(plan) {
  const lightDataLayer = plan?.internalAnalysis?.lightDataLayer
  if (!lightDataLayer) return []

  const teams = Object.values(lightDataLayer.teams ?? {})
  const valueFlags = lightDataLayer.localOdds?.valueFlags ?? []
  const maxUpsetRisk = Math.max(
    0,
    ...teams.map((team) => Number(team?.upsetRisk)).filter(Number.isFinite),
  )

  return [
    {
      label: '赔率置信度',
      value: getInternalDataQualityStatus(
        lightDataLayer.localOdds?.oddsConfidence ?? 'missing',
      ),
    },
    {
      label: '阵容确定性',
      value: getInternalLayerStatusSummary(teams, 'lineupCertainty'),
    },
    {
      label: '轮换风险',
      value: getInternalLayerStatusSummary(teams, 'rotationRisk'),
    },
    {
      label: '伤停数据质量',
      value: getInternalLayerStatusSummary(teams, 'injuryDataQuality'),
    },
    {
      label: '盘口风险标签',
      value: valueFlags.length
        ? valueFlags.map((flag) => getInternalRiskFlagLabel(flag)).join(' / ')
        : '暂无明显盘口风险标签',
    },
    {
      label: '冷门扰动提示',
      value: maxUpsetRisk >= 55 ? '存在冷门扰动，仅观察' : '暂无明显冷门扰动',
    },
  ]
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

function LineupPlaceholderCard({ sideLabel, teamName }) {
  return (
    <article className="lineup-team-card">
      <div className="lineup-team-head">
        <span>{sideLabel}</span>
        <div>
          <strong>{teamName}</strong>
          <small>阵型待确认</small>
        </div>
      </div>

      <div className="lineup-role-grid">
        {LINEUP_GROUPS.map((group) => (
          <p key={`${teamName}-${group}`}>
            <span>{group}</span>
            <strong>待确认</strong>
            <small>临场复核</small>
          </p>
        ))}
      </div>
    </article>
  )
}

const lineupRoleLabels = {
  goalkeeper: '门将',
  defenders: '后卫',
  midfielders: '中场',
  forwards: '前锋',
}

function getLineupStatusLabel(status) {
  if (status === 'confirmed') return '官方首发'
  if (status === 'unavailable') return '暂未公布'
  return '预计首发'
}

function getLineupStatusTone(status) {
  if (status === 'confirmed') return 'low'
  if (status === 'unavailable') return 'none'
  return 'medium'
}

function formatLineupUpdatedAt(value) {
  const date = value ? new Date(value) : null
  if (!date || Number.isNaN(date.getTime())) return '更新时间待确认'
  return `${formatUpdateTime(date)} 更新`
}

function getLineupPlayers(players) {
  const validPlayers = Array.isArray(players)
    ? players.map((player) => String(player ?? '').trim()).filter(Boolean)
    : []

  return validPlayers.length ? validPlayers : ['待确认']
}

function ManualLineupTeamCard({ sideLabel, lineup }) {
  const displayTeamName = getDisplayTeamName(lineup.teamName)

  return (
    <article className="lineup-team-card manual-lineup-team-card">
      <div className="lineup-team-head">
        <span>{sideLabel}</span>
        <div>
          <strong>{displayTeamName}</strong>
          <small>阵型：{lineup.formation || '待确认'}</small>
        </div>
      </div>

      <div className="lineup-role-grid manual-lineup-role-grid">
        {Object.entries(lineupRoleLabels).map(([roleKey, roleLabel]) => (
          <p key={`${displayTeamName}-${roleKey}`}>
            <span>{roleLabel}</span>
            <strong className="lineup-player-tags">
              {getLineupPlayers(lineup[roleKey]).map((player) => (
                <small key={`${roleKey}-${player}`}>{player}</small>
              ))}
            </strong>
          </p>
        ))}
      </div>
    </article>
  )
}

function ManualLineupBlock({ lineup, match, compact = false }) {
  if (!lineup) {
    return (
      <>
        <div className="section-title compact-title">
          <span>预计首发 / 临场待确认</span>
          <h2>预计首发：待确认</h2>
          <p>正式首发需临场复核，本页不把占位当作正式名单。</p>
        </div>
        {compact ? (
          <div className="mobile-lineup-list">
            <p>
              <span>主队</span>
              <strong>{match.homeTeam.name}</strong>
              <small>阵型待确认｜首发待确认</small>
            </p>
            <p>
              <span>客队</span>
              <strong>{match.awayTeam.name}</strong>
              <small>阵型待确认｜首发待确认</small>
            </p>
          </div>
        ) : (
          <div className="lineup-placeholder-grid">
            <LineupPlaceholderCard sideLabel="主队" teamName={match.homeTeam.name} />
            <LineupPlaceholderCard sideLabel="客队" teamName={match.awayTeam.name} />
          </div>
        )}
      </>
    )
  }

  const statusLabel = getLineupStatusLabel(lineup.lineupStatus)

  return (
    <>
      <div className="section-title compact-title">
        <span>手动阵容</span>
        <h2>{statusLabel}</h2>
        <p>
          {lineup.sourceLabel || '手动整理'} · {formatLineupUpdatedAt(lineup.updatedAt)}
        </p>
        <p>{lineup.note || '正式首发需临场复核'}</p>
      </div>
      <div className="manual-lineup-meta">
        <em className={`risk-tag ${getLineupStatusTone(lineup.lineupStatus)}`}>
          {statusLabel}
        </em>
        <span>正式首发需临场复核</span>
      </div>
      <div className="lineup-placeholder-grid">
        <ManualLineupTeamCard sideLabel="主队" lineup={lineup.home} />
        <ManualLineupTeamCard sideLabel="客队" lineup={lineup.away} />
      </div>
    </>
  )
}

function getHistorySnapshotScores(snapshot) {
  if (Array.isArray(snapshot?.scorePredictions)) return snapshot.scorePredictions
  if (Array.isArray(snapshot?.scores)) return snapshot.scores
  return []
}

function getHistorySnapshotPick(snapshot) {
  if (!snapshot) return '暂无赛前快照'
  if (typeof snapshot.mainPick === 'string') return snapshot.mainPick
  return snapshot.mainPick?.label ?? snapshot.mainPick?.direction ?? '暂无赛前快照'
}

function getHistoryTotalGoalsLabel(snapshot) {
  if (!snapshot) return '暂无大小球快照'
  if (snapshot.totalGoalsLabel) return snapshot.totalGoalsLabel
  if (snapshot.totalGoalsDirection === 'over25') return '大 2.5'
  if (snapshot.totalGoalsDirection === 'under25') return '小 2.5'
  return snapshot.totalGoalsDirection ?? '暂无大小球快照'
}

function formatHistorySnapshot(snapshot) {
  if (!snapshot) return '暂无赛前快照'

  const scores = getHistorySnapshotScores(snapshot)
    .map((score) => (typeof score === 'string' ? score : score?.score))
    .filter(Boolean)
  const totalGoals = getHistoryTotalGoalsLabel(snapshot)

  return `${getHistorySnapshotPick(snapshot)} + ${totalGoals}${
    scores.length ? `｜比分 ${scores.join(' / ')}` : ''
  }`
}

function formatHistoryTotalGoalsResult(settlement, snapshot) {
  if (settlement.totalGoalsHit === true) return '命中'

  const totalGoalsLabel = getHistoryTotalGoalsLabel(snapshot)
  if (settlement.totalGoalsHit === false) {
    return `未中，${totalGoalsLabel} 未打出`
  }

  return formatSettlementHit(settlement.totalGoalsHit)
}

function HistoryResultCard({ match }) {
  const record = match.historyRecord
  const finalResult = match.historicalResult

  if (!record || !finalResult) return null

  const settlement =
    match.historicalSettlement ??
    settlePredictionSnapshot(record.predictionSnapshot, finalResult)
  const finalScore =
    settlement.finalScore ?? finalResult.finalScore ?? `${finalResult.homeGoals}-${finalResult.awayGoals}`
  const homeName = getDisplayTeamName(finalResult.homeTeam ?? match.homeTeam.name)
  const awayName = getDisplayTeamName(finalResult.awayTeam ?? match.awayTeam.name)
  const scoreLabel =
    settlement.scoreHit && settlement.matchedScore
      ? `命中 ${settlement.matchedScore}`
      : formatSettlementHit(settlement.scoreHit)
  const missingSnapshot =
    settlement.settlementStatus === 'missing_prediction_snapshot'

  return (
    <section className="history-result-panel" aria-label="历史记录与赛后命中">
      <div className="section-title compact-title">
        <span>历史记录</span>
        <h2>赛后命中记录</h2>
        <p>只用赛前快照做结算，不用赛果反向改推荐。</p>
      </div>

      <div className="history-result-score">
        <span>实际赛果</span>
        <strong>
          {homeName} {finalScore} {awayName}
        </strong>
        <small>{finalResult.resultSourceLabel || '本地赛果记录'}</small>
      </div>

      <div className="history-snapshot-row">
        <span>赛前推荐</span>
        <strong>{formatHistorySnapshot(record.predictionSnapshot)}</strong>
      </div>

      <div className="history-hit-grid">
        <p>
          <span>主方向</span>
          <strong>{formatSettlementHit(settlement.mainPickHit)}</strong>
        </p>
        <p>
          <span>大小球</span>
          <strong>{formatHistoryTotalGoalsResult(settlement, record.predictionSnapshot)}</strong>
        </p>
        <p>
          <span>比分</span>
          <strong>{scoreLabel}</strong>
        </p>
      </div>

      {missingSnapshot ? (
        <p className="history-result-note">
          暂无可信赛前预测快照，本场只展示赛果，不补填命中结果。
        </p>
      ) : null}
    </section>
  )
}

function getHistoryEntryDateMs(item) {
  const value =
    item?.finalResult?.settledAt ??
    item?.record?.finalResult?.settledAt ??
    item?.match?.kickoff ??
    item?.record?.kickoff ??
    item?.record?.updatedAt
  const time = new Date(value).getTime()
  return Number.isFinite(time) ? time : 0
}

function buildHistoryEntryFromRecord(record) {
  if (!record?.finalResult) return null

  const finalResult = record.finalResult
  const settlement =
    record.settlement?.settlementStatus === 'settled'
      ? record.settlement
      : settlePredictionSnapshot(record.predictionSnapshot, finalResult)

  return {
    id: record.id ?? record.matchKey ?? record.matchLabel,
    record,
    predictionSnapshot: record.predictionSnapshot ?? null,
    finalResult,
    settlement,
  }
}

function buildHistoryEntryFromMatch(match) {
  if (match?.status !== 'finished' || !match.score) return null

  const finalResult = {
    homeTeam: match.homeTeam.name,
    awayTeam: match.awayTeam.name,
    finalScore: `${match.score.home}-${match.score.away}`,
    homeGoals: match.score.home,
    awayGoals: match.score.away,
    resultSourceLabel: '本地赛程赛果',
    settledAt: match.kickoff,
  }
  const predictionSnapshot = match.historyRecord?.predictionSnapshot ?? null
  const settlement = predictionSnapshot
    ? settlePredictionSnapshot(predictionSnapshot, finalResult)
    : {
        mainPickHit: null,
        totalGoalsHit: null,
        scoreHit: null,
        matchedScore: null,
        finalScore: finalResult.finalScore,
        settlementStatus: 'missing_prediction_snapshot',
      }

  return {
    id: `match-history-${match.uiKey}`,
    match,
    record: match.historyRecord ?? null,
    predictionSnapshot,
    finalResult,
    settlement,
  }
}

function isSameHistoryMatch(current, next) {
  const currentResult = current.finalResult
  const nextResult = next.finalResult

  return (
    String(currentResult?.homeTeam ?? '').toLowerCase() ===
      String(nextResult?.homeTeam ?? '').toLowerCase() &&
    String(currentResult?.awayTeam ?? '').toLowerCase() ===
      String(nextResult?.awayTeam ?? '').toLowerCase() &&
    String(currentResult?.finalScore ?? '') === String(nextResult?.finalScore ?? '')
  )
}

function getRecentHistoryEntries(records, finishedMatchEntries, limit = 5) {
  const recordEntries = records.map(buildHistoryEntryFromRecord).filter(Boolean)
  const matchEntries = finishedMatchEntries
    .map(({ match }) => buildHistoryEntryFromMatch(match))
    .filter(Boolean)
  const entries = []

  for (const entry of [...recordEntries, ...matchEntries]) {
    if (!entries.some((currentEntry) => isSameHistoryMatch(currentEntry, entry))) {
      entries.push(entry)
    }
  }

  const sortedEntries = entries.sort(
    (current, next) => getHistoryEntryDateMs(next) - getHistoryEntryDateMs(current),
  )
  const visibleEntries = sortedEntries.slice(0, limit)
  const mexicoEntry = sortedEntries.find(
    (entry) =>
      String(entry.finalResult?.homeTeam).toLowerCase() === 'mexico' &&
      String(entry.finalResult?.awayTeam).toLowerCase() === 'south africa',
  )

  if (
    mexicoEntry &&
    !visibleEntries.some((entry) => isSameHistoryMatch(entry, mexicoEntry))
  ) {
    visibleEntries.splice(Math.max(visibleEntries.length - 1, 0), 1, mexicoEntry)
  }

  return visibleEntries
}

function getHistoryScoreLabel(settlement) {
  if (settlement.scoreHit && settlement.matchedScore) {
    return `命中 ${settlement.matchedScore}`
  }

  return formatSettlementHit(settlement.scoreHit)
}

function getCompactHistoryEntries(entries, limit = 3) {
  const visibleEntries = entries.slice(0, limit)
  const mexicoEntry = entries.find(
    (entry) =>
      String(entry.finalResult?.homeTeam).toLowerCase() === 'mexico' &&
      String(entry.finalResult?.awayTeam).toLowerCase() === 'south africa',
  )

  if (
    mexicoEntry &&
    !visibleEntries.some((entry) => isSameHistoryMatch(entry, mexicoEntry))
  ) {
    visibleEntries.splice(Math.max(visibleEntries.length - 1, 0), 1, mexicoEntry)
  }

  return visibleEntries
}

function RecentHistoryPanel({ entries }) {
  if (!entries.length) return null

  const visibleEntries = getCompactHistoryEntries(entries)

  return (
    <section className="history-result-panel recent-history-panel" aria-label="历史战绩">
      <div className="section-title compact-title">
        <span>历史战绩</span>
        <h2>最近 {visibleEntries.length} 场基础结算</h2>
        <p>只读取本地历史记录和赛前快照。</p>
      </div>

      <div className="recent-history-list">
        {visibleEntries.map((entry) => {
          const { finalResult, predictionSnapshot, settlement } = entry
          const homeName = getDisplayTeamName(finalResult.homeTeam)
          const awayName = getDisplayTeamName(finalResult.awayTeam)
          const isMissingSnapshot =
            settlement.settlementStatus === 'missing_prediction_snapshot'

          return (
            <article className="recent-history-card" key={entry.id}>
              <div className="history-result-score">
                <span>实际赛果</span>
                <strong>
                  {homeName} {finalResult.finalScore} {awayName}
                </strong>
                <small>{finalResult.resultSourceLabel || '本地历史记录'}</small>
              </div>

              {isMissingSnapshot ? (
                <p className="history-result-note">缺少赛前快照，暂不统计命中。</p>
              ) : (
                <>
                  <div className="history-snapshot-row">
                    <span>赛前推荐</span>
                    <strong>{formatHistorySnapshot(predictionSnapshot)}</strong>
                  </div>
                  <div className="history-hit-grid">
                    <p>
                      <span>主方向</span>
                      <strong>{formatSettlementHit(settlement.mainPickHit)}</strong>
                    </p>
                    <p>
                      <span>比分</span>
                      <strong>{getHistoryScoreLabel(settlement)}</strong>
                    </p>
                    <p>
                      <span>大小球</span>
                      <strong>
                        {formatHistoryTotalGoalsResult(settlement, predictionSnapshot)}
                      </strong>
                    </p>
                  </div>
                </>
              )}
            </article>
          )
        })}
      </div>
    </section>
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
  const warning = `${formatRiskLabel(risk)}；只做参考，结果波动高。`

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
  if (!Object.prototype.hasOwnProperty.call(record, 'preMatchRecommendation')) {
    return null
  }

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

function parseScoreValue(score) {
  const match = String(score ?? '').trim().match(/^(\d+)-(\d+)$/)
  if (!match) return null

  const home = Number(match[1])
  const away = Number(match[2])
  if (!Number.isFinite(home) || !Number.isFinite(away)) return null

  return {
    home,
    away,
    total: home + away,
  }
}

function getScoreOutcome(score) {
  const parsedScore = parseScoreValue(score)
  if (!parsedScore) return 'draw'
  if (parsedScore.home > parsedScore.away) return 'home'
  if (parsedScore.home < parsedScore.away) return 'away'
  return 'draw'
}

function getPublicPrimaryOutcome(match) {
  const primaryDirection = getPrimaryDirectionDisplay(match)

  if (primaryDirection.includes('主胜')) return 'home'
  if (primaryDirection.includes('客胜')) return 'away'
  if (primaryDirection.includes('平局') || primaryDirection.includes('等待')) return 'draw'

  const recommendationDirection = match.recommendation?.direction
  return outcomes.includes(recommendationDirection) ? recommendationDirection : 'draw'
}

function getScoreTotalBand(score) {
  const parsedScore = parseScoreValue(score)
  if (!parsedScore) return 'range'
  if (parsedScore.total >= 3) return 'over'
  if (parsedScore.total <= 1) return 'under'
  return 'range'
}

function getFallbackDisplayScorePair(match, primaryOutcome, totalBand) {
  const matchType = getMatchType(match)
  const isStrongFavorite = matchType.id === 'strongFavorite'

  if (primaryOutcome === 'draw') {
    if (totalBand === 'over') return { main: '2-2', backup: '1-1' }
    if (totalBand === 'under') return { main: '0-0', backup: '1-1' }
    return { main: '1-1', backup: '0-0' }
  }

  if (primaryOutcome === 'away') {
    if (totalBand === 'over') {
      return isStrongFavorite
        ? { main: '0-3', backup: '1-3' }
        : { main: '1-2', backup: '0-2' }
    }
    if (totalBand === 'under') return { main: '0-1', backup: '0-2' }
    return { main: '0-2', backup: '1-2' }
  }

  if (totalBand === 'over') {
    return isStrongFavorite
      ? { main: '3-0', backup: '3-1' }
      : { main: '2-1', backup: '3-1' }
  }
  if (totalBand === 'under') return { main: '1-0', backup: '2-0' }
  return { main: '2-0', backup: '2-1' }
}

function shouldCorrectDisplayScore(score, primaryOutcome, isMainScore = false) {
  const outcome = getScoreOutcome(score)

  if (primaryOutcome === 'home') {
    return isMainScore ? outcome !== 'home' : outcome === 'away'
  }

  if (primaryOutcome === 'away') {
    return isMainScore ? outcome !== 'away' : outcome === 'home'
  }

  return outcome !== 'draw'
}

function alignScoreReferenceWithPrimary(match, scoreReference) {
  const primaryOutcome = getPublicPrimaryOutcome(match)
  const totalBand = getScoreTotalBand(scoreReference.main)
  const shouldUseFallback =
    shouldCorrectDisplayScore(scoreReference.main, primaryOutcome, true) ||
    shouldCorrectDisplayScore(scoreReference.backup, primaryOutcome)

  if (!shouldUseFallback) return scoreReference

  return getFallbackDisplayScorePair(match, primaryOutcome, totalBand)
}

function getDisplayTotalGoalsDirection(scoreReference) {
  const totalBand = getScoreTotalBand(scoreReference.main)
  if (totalBand === 'over') return '2.5球以上倾向'
  if (totalBand === 'under') return '2.5球以下倾向'
  return '2-3球区间'
}

function getPublicMatchDisplay(match) {
  const scoreReference = alignScoreReferenceWithPrimary(
    match,
    getScoreReferencePair(match),
  )

  return {
    scoreReference,
    totalGoalsDirection: getDisplayTotalGoalsDirection(scoreReference),
  }
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
  return getBeginnerPrimaryDisplay(match)
}

function getCompactDirectionDisplay(match) {
  return getBeginnerPrimaryDisplay(match).replace('等待盘口确认', '等待盘口')
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

function getPlanBetScore(plan) {
  const score = Number(plan?.betScore)
  if (!Number.isFinite(score)) return null
  return Math.round(clamp(score, 0, 100))
}

function getDisplayConfidenceScore(match, plan) {
  const rawScore = getPlanBetScore(plan) ?? getAiConfidence(match)
  return getDisplayConfidence(rawScore)
}

function formatConfidenceScore(score) {
  return `${Math.round(clamp(Number(score) || 0, 0, 100))}/100`
}

function getConfidenceTier(score) {
  return getDisplayConfidenceTier(score)
}

function getPublicRiskLevel(match, confidenceScore) {
  if (isSkipPrimary(match) || confidenceScore < 55) {
    return { label: '谨慎', tone: 'high' }
  }
  if (match.risk?.tone === 'high') return { label: '偏高', tone: 'high' }
  if (match.risk?.tone === 'medium') return { label: '中等', tone: 'medium' }
  return { label: '中等', tone: 'low' }
}

function getBeginnerPrimaryDisplay(match) {
  if (!hasWdlOdds(match.odds) || isSkipPrimary(match)) {
    return '等待盘口确认｜先观察'
  }

  const matchType = getMatchType(match)
  const direction =
    matchType.favoriteDirection && matchType.id === 'strongFavorite'
      ? matchType.favoriteDirection
      : match.recommendation.direction

  if (matchType.id === 'balanced' || direction === 'draw') {
    return '平局防范更重要'
  }
  if (direction === 'home') return `${match.homeTeam.name}方向更稳`
  if (direction === 'away') return `${match.awayTeam.name}方向更稳`

  return getPrimaryDirectionDisplay(match)
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
    { time: formatClock(new Date(baseTime - 25_000)), text: '本地解释完成' },
    { time: formatClock(lastAnalyzedAt), text: '输出当前建议' },
  ]
}

function getMatchStageText(match) {
  return [
    match.stage,
    match.group,
    statusConfig[match.status]?.label,
  ].filter(Boolean).join(' / ') || '赛前阶段'
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
    return `${getBeginnerPrimaryDisplay(match)}，临场阵容和盘口变化需复核。`
  }

  return `${match.totalGoals.recommendation.label}更清晰，胜平负先观望。`
}

function buildPrimaryReason(match) {
  if (!hasWdlOdds(match.odds)) return NO_ODDS_REASON
  if (isSkipPrimary(match)) return '主方向证据不够硬，先把阵容和盘口复核清楚。'
  return buildJudgementLine(match)
}

function buildTotalGoalsReason(match) {
  if (!hasWdlOdds(match.odds)) {
    return '暂无完整赔率时，只能用球队强弱和进攻防守区间做参考。'
  }

  if (match.totalGoals.recommendation.direction === 'noBet') {
    return '进球数方向不够清晰，赛前先谨慎观察。'
  }

  return '结合进攻、防守和总进球盘口，作为胜平负之外的辅助判断。'
}

function getTotalGoalsStrength(match) {
  if (!hasWdlOdds(match.odds)) return '谨慎观察'
  if (match.totalGoals.recommendation.direction === 'noBet') return '不够清晰'
  return getConfidenceTier(getDisplayConfidenceScore(match, null)).label
}

function getSafePlanQualityField(plan, key) {
  const dataQuality = plan?.dataQuality
  const value =
    dataQuality && typeof dataQuality === 'object' && !Array.isArray(dataQuality)
      ? dataQuality[key]
      : null
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null
}

function getTeamFormStatusText(plan) {
  const teamForm = getSafePlanQualityField(plan, SAFE_TEAM_FORM_SUMMARY_KEY)
  const providerErrorKeys = Array.isArray(teamForm?.meta?.providerErrorKeys)
    ? teamForm.meta.providerErrorKeys
    : []

  if (
    providerErrorKeys.some((key) => String(key).toLowerCase() === 'plan') ||
    teamForm?.fallbackReason ||
    teamForm?.dataSource === 'mock' ||
    teamForm?.rawAvailable === false
  ) {
    return '球队近期状态源受套餐限制，当前使用 fallback 风险提示。'
  }

  if (teamForm?.rawAvailable) return '球队近期状态源已接入，仅作风险提示。'
  return '球队近期状态待补充。'
}

function getOddsStatusText(match, plan) {
  const oddsSummary = getSafePlanQualityField(plan, SAFE_ODDS_SUMMARY_KEY)

  if (oddsSummary?.rawAvailable) return '赔率：真实源已接入'
  if (
    oddsSummary?.fallbackReason ||
    oddsSummary?.marketStatus === 'missing' ||
    oddsSummary?.rawAvailable === false
  ) {
    return '赔率：安全摘要 / fallback 参考'
  }

  if (hasLocalOdds(match)) return '赔率：本地/fallback 参考'
  return '赔率：等待盘口确认'
}

function buildRiskReminders(match, marketSentiment, publicDisplay, plan) {
  return [
    {
      title: '盘口热度',
      text:
        match.risk.tone === 'low'
          ? '热门方向暂未出现明显过热，但临场水位变化仍要复核。'
          : `${marketSentiment.heat}，如果临场继续升温，需要降低信心或观望。`,
    },
    {
      title: '阵容未确认',
      text: '正式首发通常要到开赛前才更可靠，当前不把阵容占位当成确定信息。',
    },
    {
      title: '球队状态',
      text: getTeamFormStatusText(plan),
    },
    {
      title: '数据质量',
      text:
        !hasWdlOdds(match.odds)
          ? NO_ODDS_REASON
          : `当前比分 ${publicDisplay.scoreReference.main} / ${publicDisplay.scoreReference.backup} 和大小球方向都需要临场复核。`,
    },
  ]
}

function buildReviewChecklist(match) {
  return [
    '开赛前 60 分钟复核正式首发和关键轮换。',
    '开赛前 30 分钟复核盘口和水位是否反向变化。',
    `${marketLabelForChecklist(match)}是否继续过热，过热则降低信心。`,
    '如果阵容或盘口异常，降低信心或直接观望。',
  ]
}

function clampMobileText(text, maxLength = 34) {
  const value = String(text ?? '').trim()
  if (value.length <= maxLength) return value
  return `${value.slice(0, maxLength)}...`
}

function buildCompactRiskItems(riskReminders, reviewChecklist) {
  const reminderItems = riskReminders.slice(0, 2).map((item) => ({
    title: item.title,
    text: clampMobileText(item.text, 40),
  }))
  const checklistItems = reviewChecklist.slice(0, 2).map((item) => ({
    title: '临场复核',
    text: clampMobileText(item, 40),
  }))

  return [...reminderItems, ...checklistItems].slice(0, 4)
}

function marketLabelForChecklist(match) {
  if (match.recommendation.direction === 'home') return '主胜方向'
  if (match.recommendation.direction === 'away') return '客胜方向'
  if (match.recommendation.direction === 'draw') return '平局方向'
  return '热门方向'
}

function getPublicDataStatusItems(
  match,
  analysisPhase,
  aiAnalysis,
  lastAnalyzedAt,
  plan,
) {
  return [
    {
      label: '赔率',
      value: getOddsStatusText(match, plan),
    },
    {
      label: '球队状态',
      value: getTeamFormStatusText(plan),
    },
    {
      label: '阵容',
      value: '预计首发待确认，当前只保留展示占位。',
    },
    {
      label: '智能解释',
      value: aiAnalysis?.source === 'openai' ? '外部解释已返回' : '本地规则 / local-fallback',
    },
    {
      label: '页面状态',
      value: analysisPhase === 'done' ? '当前展示已整理' : '正在整理本地解释',
    },
    {
      label: '更新时间',
      value: formatUpdateTime(lastAnalyzedAt),
    },
  ]
}

function getCompactDataStatusItems(statusItems) {
  return statusItems
    .filter((item) => ['赔率', '球队状态', '智能解释'].includes(item.label))
    .map((item) => {
      if (item.label === '赔率') {
        if (item.value.includes('真实')) return { label: '赔率', value: '真实源' }
        if (item.value.includes('等待')) return { label: '赔率', value: '待确认' }
        return { label: '赔率', value: 'fallback' }
      }

      if (item.label === '球队状态') {
        if (item.value.includes('已接入')) return { label: '球队状态', value: '已接入' }
        if (item.value.includes('fallback') || item.value.includes('套餐')) {
          return { label: '球队状态', value: 'fallback' }
        }
        return { label: '球队状态', value: '待补充' }
      }

      return { label: '解释', value: '本地规则' }
    })
}

function buildBeginnerNotes(match) {
  if (!hasWdlOdds(match.odds)) {
    const publicDisplay = getPublicMatchDisplay(match)

    return [
      `胜平负方向：${getWdlDirection(match)}。`,
      `大小球方向：${publicDisplay.totalGoalsDirection}。`,
      `主比分：${publicDisplay.scoreReference.main}；备选比分：${publicDisplay.scoreReference.backup}。`,
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

function buildSpotlightCopyText(match, publicDisplay, confidenceScore) {
  const { scoreReference, totalGoalsDirection } = publicDisplay
  const primaryDisplay = getPrimaryDisplay(match)

  return [
    '赛前重点参考',
    `${match.homeTeam.name} vs ${match.awayTeam.name}`,
    `本场倾向：${primaryDisplay}`,
    `信心指数：${formatConfidenceScore(confidenceScore)}`,
    `比分参考：${scoreReference.main} / ${scoreReference.backup}`,
    `大小球：${totalGoalsDirection}`,
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
  const [showAllSchedule, setShowAllSchedule] = useState(false)
  const [showOnboardingNotice, setShowOnboardingNotice] = useState(false)
  const [hasUserSelectedMatch, setHasUserSelectedMatch] = useState(false)
  const [showLineupDetails, setShowLineupDetails] = useState(false)
  const [shareCopyStatus, setShareCopyStatus] = useState('idle')
  const [shareNotice, setShareNotice] = useState(null)
  const [isPosterModalOpen, setIsPosterModalOpen] = useState(false)
  const [posterPreview, setPosterPreview] = useState(null)
  const [posterStatus, setPosterStatus] = useState('idle')
  const [posterCopyStatus, setPosterCopyStatus] = useState('idle')
  const [aiAnalysis, setAiAnalysis] = useState(null)
  const focusSectionRef = useRef(null)
  const shareNoticeTimerRef = useRef(null)

  useEffect(() => {
    let isMounted = true

    getMatches().then((nextMatchDataset) => {
      if (isMounted) setMatchDataset(nextMatchDataset)
    })

    return () => {
      isMounted = false
    }
  }, [])

  useEffect(
    () => () => {
      if (shareNoticeTimerRef.current) {
        window.clearTimeout(shareNoticeTimerRef.current)
      }
    },
    [],
  )

  useEffect(() => {
    setShowOnboardingNotice(shouldShowOnboardingNotice())
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
        const history = findHistoryRecordForMatch(baseRecords, match) ?? historyMap.get(match.id)
        const settlement = settleRecord(match, history)
        const historicalResult = history?.finalResult ?? null
        const historicalSettlement = historicalResult
          ? settlePredictionSnapshot(history.predictionSnapshot, historicalResult)
          : null

        return {
          ...match,
          odds: null,
          globalHomeTeam: globalTeamMap.get(match.homeTeamId),
          globalAwayTeam: globalTeamMap.get(match.awayTeamId),
          homeTeam,
          awayTeam,
          history,
          historyRecord: history,
          historicalResult,
          historicalSettlement,
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
      const history = findHistoryRecordForMatch(baseRecords, match) ?? historyMap.get(match.id)
      const settlement = settleRecord(match, history)
      const historicalResult = history?.finalResult ?? null
      const historicalSettlement = historicalResult
        ? settlePredictionSnapshot(history.predictionSnapshot, historicalResult)
        : null

      return {
        ...match,
        globalHomeTeam: globalTeamMap.get(match.homeTeamId),
        globalAwayTeam: globalTeamMap.get(match.awayTeamId),
        homeTeam,
        awayTeam,
        history,
        historyRecord: history,
        historicalResult,
        historicalSettlement,
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

    return {
      matches: matchesWithNotes.sort(
        (a, b) => new Date(a.kickoff) - new Date(b.kickoff),
      ),
      metrics: {
        todayMatchCount: todayMatches.length,
        finishedMatchCount: finishedMatches.length,
      },
      adjustmentRows,
      reviewMatches: matchesWithNotes.filter((match) => match.status === 'finished'),
      recentHistoryEntries: getRecentHistoryEntries(
        baseRecords,
        getFinishedMatchesForHistory(matchesWithNotes),
      ),
    }
  }, [matchDataset])

  const normalizedMatches = dashboard.matches
  const groupedMatches = useMemo(
    () => groupMatchesByBeijingDate(normalizedMatches),
    [normalizedMatches],
  )
  const confidenceScoreByMatchKey = useMemo(() => {
    const scoreMap = new Map()

    normalizedMatches.forEach((match) => {
      const plan = buildBetPlan(match, {
        bankroll: 0,
        maxStakePerMatch: 0,
      })
      scoreMap.set(match.uiKey, getDisplayConfidenceScore(match, plan))
    })

    return scoreMap
  }, [normalizedMatches])

  function getConfidenceForMatch(match) {
    return (
      confidenceScoreByMatchKey.get(match.uiKey) ??
      getDisplayConfidenceScore(match, null)
    )
  }

  const focusSourceMatches = useMemo(
    () =>
      normalizedMatches.map((match, sourceIndex) => ({
        ...match,
        sourceIndex,
        manualLineup: getManualLineupForMatch(match),
        displayConfidence:
          confidenceScoreByMatchKey.get(match.uiKey) ??
          getDisplayConfidenceScore(match, null),
      })),
    [confidenceScoreByMatchKey, normalizedMatches],
  )
  const focusSelection = useMemo(
    () => selectFocusMatch(focusSourceMatches, betHistoryData.records, new Date()),
    [focusSourceMatches],
  )
  const featuredMatches = useMemo(
    () => getFocusMatches(focusSourceMatches, betHistoryData.records, new Date(), 3),
    [focusSourceMatches],
  )

  useEffect(() => {
    if (!normalizedMatches.length) return

    setSelectedIndex((prevIndex) => {
      if (!hasUserSelectedMatch && Number.isInteger(focusSelection?.index)) {
        return focusSelection.index
      }

      if (prevIndex >= 0 && prevIndex < normalizedMatches.length) {
        return prevIndex
      }

      return Number.isInteger(focusSelection?.index) ? focusSelection.index : 0
    })
  }, [focusSelection?.index, hasUserSelectedMatch, normalizedMatches.length])

  const safeSelectedIndex =
    selectedIndex >= 0 && selectedIndex < normalizedMatches.length
      ? selectedIndex
      : 0
  const activeMatch =
    normalizedMatches[safeSelectedIndex] ||
    null
  const publicDataStatusPlan = useMemo(
    () =>
      activeMatch
        ? buildBetPlan(activeMatch, {
            bankroll: 0,
            maxStakePerMatch: 0,
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
              PRE-MATCH GUIDE
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
  const selectedConfidence = getConfidenceForMatch(activeMatch)
  const selectedConfidenceTier = getConfidenceTier(selectedConfidence)
  const selectedRiskLevel = getPublicRiskLevel(activeMatch, selectedConfidence)
  const activeManualLineup = getManualLineupForMatch(activeMatch)
  const activeLineupStatusLabel =
    activeManualLineup?.lineupStatus === 'confirmed'
      ? '官方首发'
      : '预计首发｜临场待确认'
  const activeFocusStageTags = [
    '当前重点',
    activeMatch.status === 'scheduled'
      ? '即将开始'
      : statusConfig[activeMatch.status]?.label || '赛前阶段',
    activeManualLineup?.lineupStatus === 'confirmed' ? '官方首发已出' : '临场复核',
  ]
  const lineupSummaryItems = activeManualLineup
    ? [
        {
          side: '主队',
          teamName: getDisplayTeamName(activeManualLineup.home.teamName),
          status: `${activeManualLineup.home.formation || '阵型待确认'}｜${activeLineupStatusLabel}`,
        },
        {
          side: '客队',
          teamName: getDisplayTeamName(activeManualLineup.away.teamName),
          status: `${activeManualLineup.away.formation || '阵型待确认'}｜${activeLineupStatusLabel}`,
        },
      ]
    : [
        {
          side: '主队',
          teamName: activeMatch.homeTeam.name,
          status: '阵型待确认｜临场待确认',
        },
        {
          side: '客队',
          teamName: activeMatch.awayTeam.name,
          status: '阵型待确认｜临场待确认',
        },
      ]
  const marketSentiment = buildMarketSentiment(activeMatch)
  const analysisTimeline = buildAnalysisTimeline(lastAnalyzedAt)
  const homeTeamStatus = getTeamStatusProfile(activeMatch, 'home')
  const awayTeamStatus = getTeamStatusProfile(activeMatch, 'away')
  const homeSquadInsight = getSquadInsight(activeMatch, 'home')
  const awaySquadInsight = getSquadInsight(activeMatch, 'away')
  const activeMatchType = getMatchType(activeMatch)
  const activePublicDisplay = getPublicMatchDisplay(activeMatch)
  const publicRiskReminders = buildRiskReminders(
    activeMatch,
    marketSentiment,
    activePublicDisplay,
    publicDataStatusPlan,
  )
  const reviewChecklist = buildReviewChecklist(activeMatch)
  const compactRiskItems = buildCompactRiskItems(publicRiskReminders, reviewChecklist)
  const publicDataStatusItems = getPublicDataStatusItems(
    activeMatch,
    analysisPhase,
    aiAnalysis,
    lastAnalyzedAt,
    publicDataStatusPlan,
  )
  const compactDataStatusItems = getCompactDataStatusItems(publicDataStatusItems)
  const spotlightMatch = activeMatch
  const spotlightPublicDisplay = spotlightMatch
    ? getPublicMatchDisplay(spotlightMatch)
    : null
  const spotlightCopyText =
    spotlightMatch && spotlightPublicDisplay
      ? buildSpotlightCopyText(
          spotlightMatch,
          spotlightPublicDisplay,
          getConfidenceForMatch(spotlightMatch),
        )
      : ''
  const shareMatchPayload = buildShareMatchPayload({
    awayFormation: activeManualLineup?.away?.formation,
    awayTeam: activeMatch.awayTeam.name,
    displayConfidence: selectedConfidence,
    homeFormation: activeManualLineup?.home?.formation,
    homeTeam: activeMatch.homeTeam.name,
    kickoff: formatKickoff(activeMatch.kickoff),
    lineupStatus: activeManualLineup?.lineupStatus,
    mainPick: getPrimaryDisplay(activeMatch),
    recommendLevel: selectedConfidenceTier.label,
    scorePredictions: activePublicDisplay.scoreReference,
    statusTags: activeFocusStageTags,
    summary: buildJudgementLine(activeMatch),
    totalGoalsDirection: activePublicDisplay.totalGoalsDirection,
  })
  const recommendationShareText = buildRecommendationShareText(shareMatchPayload)
  const analyzedMatchCount = normalizedMatches.length
  const featuredMatchCount = featuredMatches.length
  const highConfidenceMatchCount = normalizedMatches.filter(
    (match) => getConfidenceForMatch(match) >= 85,
  ).length
  const pendingMarketCount = normalizedMatches.filter(
    (match) => !hasLocalOdds(match) || !hasWdlOdds(match.odds),
  ).length

  function handleReanalyze() {
    if (isAnalyzing) return

    const aiPayload = buildAiAnalysisPayload({
      match: activeMatch,
      analysis: buildBetPlan(activeMatch, {
        bankroll: 10000,
        maxStakePerMatch: 500,
        engineMode: 'internal',
      }),
    })

    setAnalysisPhase('scanning')
    window.setTimeout(() => setAnalysisPhase('risk'), 650)
    window.setTimeout(() => {
      setAnalysisPhase('generating')
      void requestAiAnalysis(aiPayload).then(setAiAnalysis)
    }, 1_150)
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

  function showShareNotice(message, tone = 'success') {
    setShareNotice({ message, tone })

    if (shareNoticeTimerRef.current) {
      window.clearTimeout(shareNoticeTimerRef.current)
    }

    shareNoticeTimerRef.current = window.setTimeout(() => {
      setShareNotice(null)
      shareNoticeTimerRef.current = null
    }, 2_200)
  }

  async function handleCopyRecommendationText() {
    setShareCopyStatus('copying')

    try {
      const didCopy = await copyTextToClipboard(recommendationShareText)
      setShareCopyStatus(didCopy ? 'copied' : 'failed')
      showShareNotice(
        didCopy ? '已复制推荐文案' : '复制失败，请手动复制',
        didCopy ? 'success' : 'error',
      )
    } catch {
      setShareCopyStatus('failed')
      showShareNotice('复制失败，请手动复制', 'error')
    }

    window.setTimeout(() => setShareCopyStatus('idle'), 1_800)
  }

  async function handleCreateSharePoster() {
    setIsPosterModalOpen(true)
    setPosterStatus('generating')
    setPosterCopyStatus('idle')

    try {
      const poster = await createSharePosterPng(shareMatchPayload)
      setPosterPreview(poster)
      setPosterStatus('ready')
    } catch {
      setPosterStatus('failed')
      showShareNotice('海报生成失败，请稍后重试', 'error')
    }
  }

  function handleDownloadPoster() {
    if (!posterPreview) return

    try {
      downloadSharePoster(posterPreview, shareMatchPayload)
      showShareNotice('海报 PNG 已开始下载')
    } catch {
      showShareNotice('下载失败，请重新生成海报', 'error')
    }
  }

  async function handleCopyPosterImage() {
    if (!posterPreview) return

    setPosterCopyStatus('copying')
    const result = await copyPosterImage(posterPreview)
    setPosterCopyStatus(
      result.ok ? 'copied' : result.reason === 'unsupported' ? 'unsupported' : 'failed',
    )
    showShareNotice(result.message, result.ok ? 'success' : 'error')
  }

  function handleCloseSharePoster() {
    setIsPosterModalOpen(false)
    setPosterCopyStatus('idle')
  }

  function handleToggleDateGroup(dateKey, isExpanded) {
    setExpandedDateKeys((currentDateKeys) => ({
      ...currentDateKeys,
      [dateKey]: !isExpanded,
    }))
  }

  function handleSelectMatch(index) {
    setHasUserSelectedMatch(true)
    setSelectedIndex(index)
    setShowLineupDetails(false)
    setIsPosterModalOpen(false)
    setPosterPreview(null)
    setPosterStatus('idle')
    setPosterCopyStatus('idle')
  }

  function handleCloseOnboardingNotice() {
    markOnboardingNoticeDismissed()
    setShowOnboardingNotice(false)

    window.requestAnimationFrame(() => {
      focusSectionRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      })
    })
  }

  return (
    <main className="rookie-dashboard">
      {showOnboardingNotice ? (
        <div className="onboarding-overlay" role="presentation">
          <section
            aria-labelledby="onboarding-notice-title"
            aria-modal="true"
            className="onboarding-dialog"
            role="dialog"
          >
            <div className="onboarding-dialog-head">
              <ShieldAlert size={22} />
              <h2 id="onboarding-notice-title">{ONBOARDING_NOTICE_TITLE}</h2>
            </div>
            <div className="onboarding-dialog-body">
              {ONBOARDING_NOTICE_BODY.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
            <button
              className="onboarding-close-button"
              onClick={handleCloseOnboardingNotice}
              type="button"
            >
              {ONBOARDING_NOTICE_CLOSE_TEXT}
            </button>
          </section>
        </div>
      ) : null}

      <section className="hero-card">
        <div className="hero-copy">
          <div className="eyebrow">
            <Activity size={16} />
            AI 赛前分析
          </div>
          <h1>当前重点</h1>
          <p>数据源状态 / 临场需复核</p>
          <p>{activeMatch.homeTeam.name} vs {activeMatch.awayTeam.name}</p>
          <p className="hero-plain-note">
            基于盘口、球队状态与风险规则生成，临场阵容和盘口变化需要复核。
          </p>
        </div>
        <div className="hero-pick hero-match-summary">
          <span>先看结论</span>
          <strong>{getPrimaryDisplay(activeMatch)}</strong>
          <p>
            比分 {activePublicDisplay.scoreReference.main} /{' '}
            {activePublicDisplay.scoreReference.backup} ·{' '}
            {activePublicDisplay.totalGoalsDirection}
          </p>
          <div className="hero-system-tags" aria-label="系统状态摘要">
            <b>信心指数 {formatConfidenceScore(selectedConfidence)}</b>
            <b>风险等级 {selectedRiskLevel.label}</b>
          </div>
        </div>
        <div className="mobile-match-rail" aria-label="手机端快速选择比赛">
          <span>重点关注</span>
          <div className="mobile-match-scroll">
            {featuredMatches.map(({ match, index }) => {
              const publicDisplay = getPublicMatchDisplay(match)
              const isActive = safeSelectedIndex === index

              return (
                <button
                  className={isActive ? 'mobile-match-chip active' : 'mobile-match-chip'}
                  key={`mobile-${match.uiKey}`}
                  onClick={() => handleSelectMatch(index)}
                  type="button"
                >
                  <strong>
                    {match.homeTeam.shortName} vs {match.awayTeam.shortName}
                  </strong>
                  <small>{formatKickoff(match.kickoff)}</small>
                  <em>{getCompactDirectionDisplay(match)}</em>
                  <b>{publicDisplay.scoreReference.main}</b>
                </button>
              )
            })}
          </div>
        </div>
      </section>

      {spotlightMatch && spotlightPublicDisplay ? (
        <section className="daily-ai-spotlight" aria-label="赛前重点参考卡">
          <div className="daily-ai-copy">
            <span>赛前重点参考</span>
            <h2>
              {spotlightMatch.homeTeam.name} vs {spotlightMatch.awayTeam.name}
            </h2>
            <p>{formatKickoff(spotlightMatch.kickoff)}</p>
          </div>

          <div className="daily-ai-summary" aria-label="重点推荐摘要">
            <div className="daily-ai-primary-grid">
              <p className="daily-ai-direction">
                <span>本场倾向</span>
                <strong>{getPrimaryDisplay(spotlightMatch)}</strong>
              </p>
              <p className="daily-ai-score-highlight">
                <span>比分参考</span>
                <strong>
                  {spotlightPublicDisplay.scoreReference.main} /{' '}
                  {spotlightPublicDisplay.scoreReference.backup}
                </strong>
              </p>
            </div>
            <div className="daily-ai-facts">
              <p>
                <span>信心指数</span>
                <strong>{formatConfidenceScore(getConfidenceForMatch(spotlightMatch))}</strong>
              </p>
              <p>
                <span>大小球方向</span>
                <strong>{spotlightPublicDisplay.totalGoalsDirection}</strong>
              </p>
              <p className="daily-ai-secondary-fact">
                <span>风险等级</span>
                <strong>
                  {getPublicRiskLevel(
                    spotlightMatch,
                    getConfidenceForMatch(spotlightMatch),
                  ).label}
                </strong>
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
          <span>重点赛程</span>
          <h2>重点关注 3 场</h2>
          <p>优先展示当前、官方首发和近期即将开赛的比赛。</p>
        </div>

        {featuredMatches.length ? (
          <div className="featured-match-grid">
            {featuredMatches.map(({ match, index }) => {
              const matchType = getMatchType(match)
              const publicDisplay = getPublicMatchDisplay(match)
              const scoreReference = publicDisplay.scoreReference
              const confidenceScore = getConfidenceForMatch(match)

              return (
                <button
                  className={
                    safeSelectedIndex === index
                      ? 'featured-match-card active'
                      : 'featured-match-card'
                  }
                  key={`${match.uiKey}-${index}`}
                  onClick={() => handleSelectMatch(index)}
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
                      <span>本场倾向</span>
                      <strong>{getPrimaryDisplay(match)}</strong>
                    </p>
                    <p>
                      <span>信心指数</span>
                      <strong>{formatConfidenceScore(confidenceScore)}</strong>
                    </p>
                    <p>
                      <span>比分</span>
                      <strong>{scoreReference.main} / {scoreReference.backup}</strong>
                    </p>
                    <p className="featured-card-muted">
                      <span>进球倾向</span>
                      <strong>{publicDisplay.totalGoalsDirection}</strong>
                    </p>
                    <p className="featured-card-muted">
                      <span>风险等级</span>
                      <strong>{getPublicRiskLevel(match, confidenceScore).label}</strong>
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
          <div className="section-title schedule-title-row">
            <div>
              <span>全部赛程</span>
              <h2>默认折叠</h2>
            </div>
            <button
              className="schedule-toggle-button"
              onClick={() => setShowAllSchedule((isVisible) => !isVisible)}
              type="button"
            >
              {showAllSchedule ? '收起全部赛程' : '查看全部赛程'}
            </button>
          </div>

          {showAllSchedule ? (
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
                        const publicDisplay = getPublicMatchDisplay(match)
                        const scoreReference = publicDisplay.scoreReference
                        const confidenceScore = getConfidenceForMatch(match)

                        return (
                          <button
                            className={
                              safeSelectedIndex === index
                                ? 'simple-match-card active'
                                : 'simple-match-card'
                            }
                            key={match.uiKey}
                            onClick={() => handleSelectMatch(index)}
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
                              <span>{formatConfidenceScore(confidenceScore)}</span>
                              <em>{getPublicRiskLevel(match, confidenceScore).label}</em>
                            </div>
                            <div className="match-card-detail">
                              <span>
                                比分：<strong>{scoreReference.main} / {scoreReference.backup}</strong>
                              </span>
                              <span>
                                大小球：<strong>{publicDisplay.totalGoalsDirection}</strong>
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
          ) : (
            <p className="schedule-collapsed-note">
              已收起长赛程，只保留当前重点和上方 3 场重点关注。
            </p>
          )}
        </aside>

        <section className="focus-column">
          <section
            className="core-card quick-conclusion-card priority-card"
            aria-label="主推荐卡"
            ref={focusSectionRef}
          >
            <div className="quick-card-top">
              <span>当前比赛</span>
              <h2>
                {activeMatch.homeTeam.name} vs {activeMatch.awayTeam.name}
              </h2>
              <p className="quick-kickoff-time">
                {formatKickoff(activeMatch.kickoff)}
              </p>
              <div className="focus-stage-tags" aria-label="当前阶段标签">
                {activeFocusStageTags.map((tag) => (
                  <em key={tag}>{tag}</em>
                ))}
              </div>
            </div>

            <div className="quick-recommendation">
              <span>本场倾向</span>
              <strong className={isSkipPrimary(activeMatch) ? 'skip-primary' : ''}>
                {getPrimaryDisplay(activeMatch)}
              </strong>
              <p>{buildPrimaryReason(activeMatch)}</p>
            </div>

            <div className="confidence-summary-grid" aria-label="信心指数与推荐等级">
              <p className="confidence-main-stat">
                <span>信心指数</span>
                <strong>{formatConfidenceScore(selectedConfidence)}</strong>
                <small>临场需复核</small>
              </p>
              <p>
                <span>推荐等级</span>
                <strong>{selectedConfidenceTier.label}</strong>
                <small>临场阵容和盘口需复核</small>
              </p>
            </div>

            <div className="public-risk-tags" aria-label="核心结论标签">
              <em className={`risk-tag ${selectedConfidenceTier.tone}`}>
                {selectedConfidenceTier.label}
              </em>
              <em className={`risk-tag ${selectedRiskLevel.tone}`}>
                风险等级：{selectedRiskLevel.label}
              </em>
              <em className="risk-tag medium">临场复核</em>
              {isSkipPrimary(activeMatch) ? (
                <em className="risk-tag high">谨慎参考</em>
              ) : null}
            </div>

            <button
              className={
                spotlightCopyStatus === 'copied'
                  ? 'mobile-copy-button copied'
                  : 'mobile-copy-button'
              }
              onClick={handleCopySpotlightText}
              type="button"
            >
              {spotlightCopyStatus === 'copied' ? (
                <Check size={15} />
              ) : (
                <Copy size={15} />
              )}
              {spotlightCopyStatus === 'copied'
                ? '已复制'
                : spotlightCopyStatus === 'failed'
                  ? '复制失败'
                  : '复制本场结论'}
            </button>

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
                  当前为赛前初盘参考，临场仍需复核阵容与盘口变化。
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

          <section className="core-picks-panel" aria-label="核心推荐">
            <article className="core-pick-card core-pick-card-primary">
              <span>本场倾向</span>
              <strong className={isSkipPrimary(activeMatch) ? 'skip-primary' : ''}>
                {getPrimaryDisplay(activeMatch)}
              </strong>
            </article>
            <article className="core-pick-card">
              <span>比分参考</span>
              <strong>
                {activePublicDisplay.scoreReference.main} /{' '}
                {activePublicDisplay.scoreReference.backup}
              </strong>
            </article>
            <article className="core-pick-card">
              <span>大小球方向</span>
              <strong>{activePublicDisplay.totalGoalsDirection}</strong>
              <small>{getTotalGoalsStrength(activeMatch)}</small>
            </article>
          </section>

          <section className="share-actions-panel" aria-label="分享当前重点比赛">
            <button
              className={
                shareCopyStatus === 'copied'
                  ? 'share-action-button copied'
                  : 'share-action-button'
              }
              disabled={shareCopyStatus === 'copying'}
              onClick={handleCopyRecommendationText}
              type="button"
            >
              {shareCopyStatus === 'copied' ? (
                <Check size={18} />
              ) : shareCopyStatus === 'copying' ? (
                <Loader2 className="share-spinner" size={18} />
              ) : (
                <Copy size={18} />
              )}
              <span>一键复制文案</span>
              <small>
                {shareCopyStatus === 'copied'
                  ? '已复制推荐文案'
                  : shareCopyStatus === 'failed'
                    ? '复制失败，请手动复制'
                    : '复制当前比赛文字推荐'}
              </small>
            </button>

            <button
              className="share-action-button share-action-button-primary"
              disabled={posterStatus === 'generating'}
              onClick={handleCreateSharePoster}
              type="button"
            >
              {posterStatus === 'generating' ? (
                <Loader2 className="share-spinner" size={18} />
              ) : (
                <ImageIcon size={18} />
              )}
              <span>生成分享海报</span>
              <small>
                {posterStatus === 'generating' ? '正在生成 4:5 PNG' : '预览、下载或复制图片'}
              </small>
            </button>
          </section>

          {shareNotice ? (
            <p className={`share-toast ${shareNotice.tone}`} role="status">
              {shareNotice.message}
            </p>
          ) : null}

          <section className="compact-risk-line-panel" aria-label="一句话风险提示">
            临场首发、盘口异动、红牌伤退与比赛进程可能影响赛果，仅供赛前参考。
          </section>

          <section className="mobile-focus-list-panel" aria-label="重点关注 3 场">
            <div className="section-title compact-title">
              <span>重点关注</span>
              <h2>3 场</h2>
            </div>
            {featuredMatches.length ? (
              <div className="mobile-focus-list">
                {featuredMatches.map(({ match, index }) => {
                  const matchType = getMatchType(match)
                  const confidenceScore = getConfidenceForMatch(match)

                  return (
                    <button
                      className={
                        safeSelectedIndex === index
                          ? 'mobile-focus-item active'
                          : 'mobile-focus-item'
                      }
                      key={`focus-${match.uiKey}`}
                      onClick={() => handleSelectMatch(index)}
                      type="button"
                    >
                      <span>{matchType.label}</span>
                      <strong>
                        {match.homeTeam.shortName} vs {match.awayTeam.shortName}
                      </strong>
                      <small>{formatKickoff(match.kickoff)}</small>
                      <b>{formatConfidenceScore(confidenceScore)}</b>
                    </button>
                  )
                })}
              </div>
            ) : (
              <p className="featured-empty">暂无重点场次。</p>
            )}
          </section>

          <section className="ai-flow-panel" aria-label="规则引擎赛前整理步骤">
            <div className="section-title compact-title">
              <span>规则引擎步骤</span>
              <h2>本地规则已整理本场参考</h2>
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
              <p>风险提示：{marketSentiment.hint}</p>
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

          <section className="play-reference-panel v1-priority-panel" aria-label="比分参考与大小球">
            <div className="section-title compact-title">
              <span>比分参考</span>
              <h2>比分 + 大小球</h2>
            </div>

            <div className="play-grid v1-play-grid">
              <article className="play-card score-card priority-score-card">
                <Target size={20} />
                <span>比分参考</span>
                <div className="score-reference-list">
                  <p>
                    <span>主比分</span>
                    <strong>{activePublicDisplay.scoreReference.main}</strong>
                  </p>
                  <p>
                    <span>备选比分</span>
                    <strong>{activePublicDisplay.scoreReference.backup}</strong>
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

              <article className="play-card total-goals-card">
                <Gauge size={20} />
                <span>大小球判断</span>
                <strong>{activePublicDisplay.totalGoalsDirection}</strong>
                <p>{buildTotalGoalsReason(activeMatch)}</p>
                <em className={`risk-tag ${activeMatchType.tone}`}>
                  {getTotalGoalsStrength(activeMatch)}
                </em>
              </article>

              <article className="play-card public-risk-card">
                <ShieldAlert size={20} />
                <span>赛前风险提醒</span>
                <div className="public-risk-list">
                  {publicRiskReminders.map((item) => (
                    <p key={item.title}>
                      <strong>{item.title}</strong>
                      <span>{item.text}</span>
                    </p>
                  ))}
                </div>
              </article>
            </div>
          </section>

          <section className="lineup-placeholder-panel" aria-label="预计首发与临场待确认">
            <ManualLineupBlock lineup={activeManualLineup} match={activeMatch} />
          </section>

          <section className="public-data-status-panel" aria-label="数据状态">
            <div className="section-title compact-title">
              <span>数据状态</span>
              <h2>来源与 fallback 说明</h2>
            </div>
            <div className="public-status-grid">
              {publicDataStatusItems.map((item) => (
                <p key={item.label}>
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </p>
              ))}
            </div>
          </section>

          <section className="pregame-checklist-panel" aria-label="赛前复核清单">
            <div className="section-title compact-title">
              <span>赛前风险</span>
              <h2>开赛前重点看</h2>
            </div>
            <ol className="pregame-checklist compact-risk-checklist">
              {compactRiskItems.map((item) => (
                <li key={`${item.title}-${item.text}`}>
                  <strong>{item.title}</strong>
                  <span>{item.text}</span>
                </li>
              ))}
            </ol>
          </section>

          <section className="mobile-lineup-data-panel" aria-label="阵容与数据状态">
            <div className="section-title compact-title lineup-summary-head">
              <div>
                <span>首发阵容</span>
                <h2>{activeLineupStatusLabel}</h2>
                <p>详细名单默认收起，临场以官方信息复核。</p>
              </div>
              <button
                aria-expanded={showLineupDetails}
                className="section-toggle-button"
                onClick={() => setShowLineupDetails((isVisible) => !isVisible)}
                type="button"
              >
                {showLineupDetails ? '收起首发阵容' : '查看首发阵容'}
              </button>
            </div>

            <div className="lineup-summary-strip">
              {lineupSummaryItems.map((item) => (
                <p key={`${item.side}-${item.teamName}`}>
                  <span>{item.side}</span>
                  <strong>{item.teamName}</strong>
                  <small>{item.status}</small>
                </p>
              ))}
            </div>

            {showLineupDetails ? (
              <ManualLineupBlock
                compact
                lineup={activeManualLineup}
                match={activeMatch}
              />
            ) : null}

            <div className="mobile-data-pills" aria-label="简短数据状态">
              {compactDataStatusItems.map((item) => (
                <p key={`${item.label}-${item.value}`}>
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </p>
              ))}
            </div>
          </section>

          <RecentHistoryPanel entries={dashboard.recentHistoryEntries} />

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
            <span>赛后表现参考</span>
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
              <span>赛后仅作方向复核</span>
              <span>{getReviewText(match)}</span>
            </div>
          ))}
        </div>
      </section>

      {isPosterModalOpen ? (
        <div
          className="share-poster-overlay"
          onMouseDown={handleCloseSharePoster}
          role="presentation"
        >
          <section
            aria-label="分享海报预览"
            aria-modal="true"
            className="share-poster-dialog"
            onMouseDown={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="share-poster-head">
              <div>
                <span>分享海报预览</span>
                <h2>{shareMatchPayload.matchName}</h2>
                <p>{posterPreview ? `${posterPreview.width} x ${posterPreview.height} PNG` : '1080 x 1350 PNG'}</p>
              </div>
              <button
                aria-label="关闭分享海报"
                className="share-poster-close"
                onClick={handleCloseSharePoster}
                type="button"
              >
                <X size={20} />
              </button>
            </div>

            <div className="share-poster-preview">
              {posterStatus === 'generating' ? (
                <div className="share-poster-loading">
                  <Loader2 className="share-spinner" size={24} />
                  <strong>正在生成分享海报</strong>
                  <span>浏览器内 Canvas 输出 PNG</span>
                </div>
              ) : posterPreview ? (
                <img
                  alt={`${shareMatchPayload.matchName} 分享海报`}
                  src={posterPreview.dataUrl}
                />
              ) : (
                <div className="share-poster-loading failed">
                  <ShieldAlert size={24} />
                  <strong>海报生成失败</strong>
                  <span>请关闭后重新生成</span>
                </div>
              )}
            </div>

            {posterCopyStatus === 'unsupported' ? (
              <p className="poster-copy-fallback">
                当前浏览器不支持直接复制图片，请下载后分享。
              </p>
            ) : null}

            <div className="share-poster-actions">
              <button
                disabled={!posterPreview}
                onClick={handleDownloadPoster}
                type="button"
              >
                <Download size={17} />
                下载海报
              </button>
              <button
                disabled={!posterPreview || posterCopyStatus === 'copying'}
                onClick={handleCopyPosterImage}
                type="button"
              >
                {posterCopyStatus === 'copied' ? (
                  <Check size={17} />
                ) : posterCopyStatus === 'copying' ? (
                  <Loader2 className="share-spinner" size={17} />
                ) : (
                  <Copy size={17} />
                )}
                {posterCopyStatus === 'copied' ? '已复制图片' : '复制图片'}
              </button>
              <button onClick={handleCloseSharePoster} type="button">
                <X size={17} />
                关闭
              </button>
            </div>
          </section>
        </div>
      ) : null}

      <footer className="risk-footer">
        <span>
          本工具仅用于数据分析和娱乐参考，不构成投资或投注建议。请遵守当地法律法规，理性参与，控制风险。
        </span>
      </footer>
    </main>
  )
}

export default App
