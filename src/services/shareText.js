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
  const scores = normalizeScoreList(scorePredictions)
    .map((score) => safeShareText(score, ''))
    .filter(Boolean)

  return Array.from(new Set(scores)).slice(0, 2).join(' / ') || '比分待复核'
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
  return `系统综合盘口水位、阵容状态、球队节奏与历史表现，本场倾向为${pick}，建议结合临场复核。`
}

export function buildShareMatchPayload({
  awayFormation,
  awayTeam,
  displayConfidence,
  homeFormation,
  homeTeam,
  kickoff,
  lineupStatus,
  mainPick,
  recommendLevel,
  scorePredictions,
  statusTags,
  summary,
  totalGoalsDirection,
} = {}) {
  const matchName = getMatchName(homeTeam, awayTeam)
  const mainPickText = safeShareText(mainPick, '临场复核')
  const payload = {
    awayTeam: safeShareText(awayTeam, ''),
    displayConfidenceText: formatShareConfidence(displayConfidence),
    formationText: getFormationText(homeFormation, awayFormation),
    homeTeam: safeShareText(homeTeam, ''),
    kickoffText: safeShareText(kickoff, '赛前分析'),
    lineupStatusText: formatShareLineupStatus(lineupStatus),
    mainPickText,
    matchName,
    recommendLevelText: safeShareText(recommendLevel, '赛前参考'),
    scorePredictionsText: formatShareScores(scorePredictions),
    statusTags: getStatusTags(statusTags, lineupStatus),
    totalGoalsDirectionText: safeShareText(totalGoalsDirection, '大小球待复核'),
  }

  payload.summaryText = safeShareText(summary, getDefaultSummary(mainPickText))

  return payload
}

export function buildRecommendationShareText(payload) {
  const matchPayload =
    payload?.matchName && payload?.mainPickText
      ? payload
      : buildShareMatchPayload(payload)

  return [
    '【AI赛前分析】',
    matchPayload.matchName,
    `时间：${matchPayload.kickoffText}`,
    `本场倾向：${matchPayload.mainPickText}`,
    `信心指数：${matchPayload.displayConfidenceText}｜${matchPayload.recommendLevelText}`,
    `比分参考：${matchPayload.scorePredictionsText}`,
    `大小球方向：${matchPayload.totalGoalsDirectionText}`,
    `首发状态：${matchPayload.lineupStatusText}`,
    '',
    `简要分析：${matchPayload.summaryText}`,
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
