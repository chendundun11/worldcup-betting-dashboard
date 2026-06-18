import {
  buildPosterPresentation,
  buildScoreRecommendation,
  deriveOverUnderText,
  formatMainDirectionForPresentation,
} from './posterPresentation.js'

export const SHARE_FOOTER_NOTE =
  '仅供娱乐参考，不构成投注建议。'

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

export function formatShareScores(scorePredictions) {
  const { primaryScore, secondaryScore } = formatShareScorePair(scorePredictions)

  return `候选比分：${primaryScore}｜备选比分：${secondaryScore}`
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
  return `系统综合盘口、水位与阵容信息后，本场主方向更偏向${pick}，总进球判断作为辅助参考。`
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
  const lineupStatusText = formatShareLineupStatus(lineupStatus)
  const mainDirectionText = safeShareText(
    mainDirection,
    formatMainDirectionForPresentation(mainPick, {
      awayTeamText: awayTeam,
      homeTeamText: homeTeam,
    }),
  )
  const posterPresentation = buildPosterPresentation({
    awayFormation,
    awayTeam,
    displayConfidence,
    homeFormation,
    homeTeam,
    isCautious,
    kickoff,
    lineupStatusText,
    mainDirection: mainDirectionText,
    mainPick,
    presentationRating,
    rawScore,
    riskTone,
    scorePredictions,
    statusTags,
    summary: safeShareText(summary, getDefaultSummary(mainDirectionText)),
    totalGoalsDirection,
  })
  const payload = {
    awayTeam: safeShareText(awayTeam, ''),
    defenseDirectionText: safeShareText(defenseDirection, ''),
    displayConfidenceText:
      presentationRating?.displayScoreText || formatShareConfidence(displayConfidence),
    formationText: posterPresentation.rawPrediction?.formationText ?? getFormationText(homeFormation, awayFormation),
    goalsDirectionText: posterPresentation.totalGoalsValue,
    homeTeam: safeShareText(homeTeam, ''),
    kickoffText: posterPresentation.matchTimeText,
    lineupStatusText,
    mainDirectionText: posterPresentation.mainDirectionValue,
    mainPickText: posterPresentation.mainDirectionValue,
    matchName,
    overUnderText: posterPresentation.overUnderText,
    overUnderValue: posterPresentation.overUnderValue,
    posterPresentation,
    presentationRating,
    primaryScoreText: posterPresentation.primaryScoreValue,
    recommendLevelText: safeShareText(recommendLevel, '赛前参考'),
    scorePredictionsText: formatShareScores(scorePredictions),
    secondaryScoreText: posterPresentation.secondaryScoreValue,
    statusTags: getStatusTags(statusTags, lineupStatus),
    totalGoalsDirectionText: posterPresentation.totalGoalsValue,
    totalGoalsText: posterPresentation.totalGoalsShortText,
  }

  payload.summaryText = posterPresentation.oneLineSummary

  return payload
}

export function buildRecommendationShareText(payload) {
  const matchPayload =
    payload?.matchName && payload?.mainPickText
      ? payload
      : buildShareMatchPayload(payload)

  const poster = matchPayload.posterPresentation ?? buildPosterPresentation(matchPayload)
  const overUnderText = safeShareText(
    poster.overUnderText,
    deriveOverUnderText(poster.primaryScoreValue, poster.secondaryScoreValue),
  )
  const footerNote = safeShareText(poster.footerNote, SHARE_FOOTER_NOTE)

  return [
    '【AI赛前情报】',
    matchPayload.matchName,
    `时间：${poster.matchTimeText}`,
    '',
    '赛前结论：',
    poster.mainConclusion,
    poster.supportConclusion,
    '',
    '比分倾向：',
    poster.primaryScoreText,
    poster.secondaryScoreText,
    poster.totalGoalsShortText,
    overUnderText,
    '',
    '模型解读：',
    poster.modelInsightShort,
    '',
    '首发观察：',
    poster.lineupInsightShort,
    '',
    '一句话：',
    poster.oneLineSummaryShort,
    '',
    '提示：',
    footerNote,
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
