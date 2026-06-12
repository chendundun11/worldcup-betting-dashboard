import {
  buildPresentationRating,
  buildScoreRecommendation,
  buildShortReasonForPresentation,
  formatGoalsDirectionForPresentation,
  formatMainDirectionForPresentation,
} from './posterPresentation.js'

export const SHARE_RISK_NOTE =
  '临场首发、盘口异动、红牌伤退与比赛进程可能影响赛果，仅供赛前参考。'

const INVALID_TEXT_VALUES = new Set(['', 'undefined', 'null', 'nan'])
const INVALID_TEXT_PATTERNS = [/undefined/i, /\bnull\b/i, /\bNaN\b/i]

function isUnsafeText(value) {
  const text = String(value ?? '').trim()
  return (
    INVALID_TEXT_VALUES.has(text.toLowerCase()) ||
    INVALID_TEXT_PATTERNS.some((pattern) => pattern.test(text)) ||
    text.includes('--/--')
  )
}

export function safeShareText(value, fallback = '') {
  const text = String(value ?? '').trim()
  return isUnsafeText(text) ? fallback : text
}

function clampConfidence(value) {
  return Math.min(Math.max(value, 0), 100)
}

export function formatShareConfidence(value) {
  if (typeof value === 'string') {
    const text = safeShareText(value, '')
    if (!text) return '--/100'
    if (text.includes('/100')) return text

    const numericText = Number(text)
    return Number.isFinite(numericText)
      ? `${Math.round(clampConfidence(numericText))}/100`
      : '--/100'
  }

  const numericValue = Number(value)
  return Number.isFinite(numericValue)
    ? `${Math.round(clampConfidence(numericValue))}/100`
    : '--/100'
}

export function formatShareLineupStatus(status) {
  if (status === 'confirmed') return '官方首发'
  if (status === 'predicted') return '预计首发｜临场待确认'
  return '首发待确认'
}

function normalizeScoreList(scorePredictions) {
  if (Array.isArray(scorePredictions)) return scorePredictions
  if (scorePredictions && typeof scorePredictions === 'object') {
    return [scorePredictions.main, scorePredictions.backup]
  }
  return [scorePredictions]
}

export function formatShareScores(scorePredictions) {
  const { primaryScore, secondaryScore } = formatShareScorePair(scorePredictions)

  return `主推比分：${primaryScore}｜辅推比分：${secondaryScore}`
}

export function formatShareScorePair(scorePredictions) {
  const scorePair = buildScoreRecommendation(scorePredictions)

  return {
    primaryScore: safeShareText(scorePair.primaryScore, '待复核'),
    secondaryScore: safeShareText(scorePair.secondaryScore, '待补充'),
  }
}

function getMatchName(homeTeam, awayTeam) {
  const home = safeShareText(homeTeam, '')
  const away = safeShareText(awayTeam, '')

  if (home && away) return `${home} vs ${away}`
  return '当前重点比赛'
}

function isPlaceholderFormation(value) {
  const text = safeShareText(value, '')
  return !text || text.includes('待确认')
}

function getFormationText(homeFormation, awayFormation) {
  if (isPlaceholderFormation(homeFormation) || isPlaceholderFormation(awayFormation)) {
    return ''
  }

  return `${safeShareText(homeFormation)} vs ${safeShareText(awayFormation)}`
}

function getStatusTags(tags, lineupStatus) {
  const normalizedTags = Array.isArray(tags)
    ? tags.map((tag) => safeShareText(tag, '')).filter(Boolean)
    : []
  const lineupTag = lineupStatus === 'confirmed' ? '官方首发' : '临场复核'
  const allTags = ['当前重点', ...normalizedTags, lineupTag]

  return Array.from(new Set(allTags)).slice(0, 3)
}

function getDefaultSummary(mainPickText) {
  const pick = safeShareText(mainPickText, '临场复核')
  return `系统综合盘口、水位与阵容信息后，本场主方向更偏向${pick}，进球方向作为辅助参考。`
}

function formatRatingBlock(rating) {
  if (rating?.scoreMode === 'score') {
    return `${rating.scoreLabel || '方向强度'}：${rating.displayScoreText || '--/100'}\n等级：${rating.strengthLabel || '稳健参考'}`
  }

  return `风险等级：${rating?.riskLabel || '风险偏高'}\n策略：${rating?.strategyLabel || '谨慎观望'}`
}

export function buildShareMatchPayload({
  awayFormation,
  awayTeam,
  displayConfidence,
  defenseDirection,
  homeFormation,
  homeTeam,
  isCautious,
  kickoff,
  lineupStatus,
  mainDirection,
  mainPick,
  presentationRating,
  recommendLevel,
  rawScore,
  riskTone,
  scorePredictions,
  statusTags,
  summary,
  totalGoalsDirection,
} = {}) {
  const matchName = getMatchName(homeTeam, awayTeam)
  const mainDirectionText = safeShareText(
    mainDirection,
    formatMainDirectionForPresentation(mainPick),
  )
  const rating =
    presentationRating ??
    buildPresentationRating({
      displayScore: displayConfidence,
      isCautious,
      rawScore,
      riskTone,
    })
  const { primaryScore, secondaryScore } = formatShareScorePair(scorePredictions)
  const goalsDirectionText = formatGoalsDirectionForPresentation(totalGoalsDirection)
  const payload = {
    awayTeam: safeShareText(awayTeam, ''),
    defenseDirectionText: safeShareText(defenseDirection, ''),
    displayConfidenceText: rating.displayScoreText || formatShareConfidence(displayConfidence),
    formationText: getFormationText(homeFormation, awayFormation),
    goalsDirectionText,
    homeTeam: safeShareText(homeTeam, ''),
    kickoffText: safeShareText(kickoff, '赛前分析'),
    lineupStatusText: formatShareLineupStatus(lineupStatus),
    mainDirectionText,
    mainPickText: mainDirectionText,
    matchName,
    presentationRating: rating,
    primaryScoreText: primaryScore,
    ratingBlockText: formatRatingBlock(rating),
    recommendLevelText: safeShareText(recommendLevel, rating.recommendLabel || '赛前参考'),
    scorePredictionsText: formatShareScores(scorePredictions),
    secondaryScoreText: secondaryScore,
    statusTags: getStatusTags(statusTags, lineupStatus),
    totalGoalsDirectionText: goalsDirectionText,
  }

  payload.summaryText = buildShortReasonForPresentation({
    goalsDirection: goalsDirectionText,
    mainDirection: mainDirectionText,
    rating,
    summary: safeShareText(summary, getDefaultSummary(mainDirectionText)),
  })

  return payload
}

export function buildRecommendationShareText(payload) {
  const matchPayload =
    payload?.matchName && payload?.mainPickText
      ? payload
      : buildShareMatchPayload(payload)

  return [
    '【赛前方向卡】',
    matchPayload.matchName,
    `时间：${matchPayload.kickoffText}`,
    `主方向：${matchPayload.mainDirectionText}`,
    `主推比分：${matchPayload.primaryScoreText}`,
    `辅推比分：${matchPayload.secondaryScoreText}`,
    `进球方向：${matchPayload.goalsDirectionText}`,
    matchPayload.ratingBlockText,
    `首发状态：${matchPayload.lineupStatusText}`,
    '',
    `简要判断：${matchPayload.summaryText}`,
    '',
    `提示：${SHARE_RISK_NOTE}`,
  ].join('\n')
}

export function createShareFileSlug(value) {
  return (
    safeShareText(value, 'match-focus')
      .replace(/[\\/:*?"<>|]/g, '-')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 80) || 'match-focus'
  )
}
