import { getDisplayConfidence } from './displayConfidence.js'

const INVALID_TEXT_VALUES = new Set(['', 'undefined', 'null', 'nan'])
const INVALID_TEXT_PATTERNS = [/undefined/i, /\bnull\b/i, /\bNaN\b/i]
const SCORE_PATTERN = /^(\d{1,2})-(\d{1,2})$/

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

function safePresentationText(value, fallback = '') {
  const text = String(value ?? '').trim()
  const normalized = text.toLowerCase()

  if (
    INVALID_TEXT_VALUES.has(normalized) ||
    INVALID_TEXT_PATTERNS.some((pattern) => pattern.test(text)) ||
    text.includes('--/--')
  ) {
    return fallback
  }

  return text || fallback
}

function toScore(value) {
  const score = Number(value)
  if (!Number.isFinite(score)) return null
  return clamp(Math.round(score), 0, 100)
}

function getStrengthLabel(displayScore) {
  if (displayScore >= 80) return '重点关注'
  if (displayScore >= 70) return '稳健参考'
  if (displayScore >= 60) return '轻仓参考'
  return '保守参考'
}

function getSignalLabel({ rawScore, displayScore, isCautious, riskTone }) {
  if (isCautious || rawScore === null || rawScore < 55 || displayScore < 60) {
    return '变量偏多'
  }
  if (riskTone === 'medium') return '变量中等'
  if (displayScore >= 78) return '信号集中'
  return '节奏待复核'
}

function getStrategyLabel(signalLabel, displayScore) {
  if (signalLabel === '信号集中' && displayScore >= 80) return '重点关注'
  if (displayScore >= 70) return '稳健参考'
  if (displayScore >= 60) return '轻仓参考'
  return '保守观察'
}

export function buildPresentationRating({
  displayScore,
  isCautious = false,
  rawScore,
  riskTone,
} = {}) {
  const rawScoreValue = toScore(rawScore)
  const fallbackDisplayScore =
    rawScoreValue === null ? null : getDisplayConfidence(rawScoreValue)
  const displayScoreValue = toScore(displayScore ?? fallbackDisplayScore)
  const cappedDisplayScore =
    displayScoreValue === null ? null : clamp(displayScoreValue, 0, 92)
  const scoreLabel = cappedDisplayScore >= 80 ? '模型强度' : '方向强度'
  const scoreMode =
    isCautious ||
    rawScoreValue === null ||
    rawScoreValue < 55 ||
    (cappedDisplayScore !== null && cappedDisplayScore < 60)
      ? 'narrative'
      : 'score'
  const signalLabel = getSignalLabel({
    rawScore: rawScoreValue,
    displayScore: cappedDisplayScore ?? 0,
    isCautious,
    riskTone,
  })
  const strategyLabel = getStrategyLabel(signalLabel, cappedDisplayScore ?? 0)
  const strengthLabel = getStrengthLabel(cappedDisplayScore ?? 0)

  return {
    rawScore: rawScoreValue,
    displayScore: cappedDisplayScore,
    displayScoreText: cappedDisplayScore === null ? '--/100' : `${cappedDisplayScore}/100`,
    scoreLabel,
    scoreMode,
    strengthLabel,
    riskLabel: signalLabel,
    strategyLabel,
    recommendLabel: scoreMode === 'score' ? strengthLabel : strategyLabel,
    summaryText:
      scoreMode === 'score'
        ? `${scoreLabel}：${cappedDisplayScore ?? '--'}/100｜等级：${strengthLabel}`
        : `赛前变量偏多，方向以${strategyLabel}处理`,
    shouldHighlightScore: scoreMode === 'score',
  }
}

function normalizeScoreList(scorePredictions) {
  if (Array.isArray(scorePredictions)) return scorePredictions
  if (scorePredictions && typeof scorePredictions === 'object') {
    return [
      scorePredictions.primary,
      scorePredictions.main,
      scorePredictions.secondary,
      scorePredictions.backup,
    ]
  }
  return [scorePredictions]
}

export function parseScoreText(score) {
  const match = safePresentationText(score, '').match(SCORE_PATTERN)
  if (!match) return null

  const home = Number(match[1])
  const away = Number(match[2])
  if (!Number.isFinite(home) || !Number.isFinite(away)) return null

  return {
    away,
    home,
    outcome: home > away ? 'home' : home < away ? 'away' : 'draw',
    text: `${home}-${away}`,
    total: home + away,
  }
}

function scoreOutcome(score) {
  return parseScoreText(score)?.outcome ?? 'draw'
}

function scoreTotal(score) {
  return parseScoreText(score)?.total ?? 2
}

function uniqueScores(scores) {
  return Array.from(new Set(scores.map((score) => safePresentationText(score, '')).filter(Boolean)))
}

function getTotalHint(scorePredictions, totalGoalsDirection) {
  const totals = normalizeScoreList(scorePredictions)
    .map((score) => {
      if (score && typeof score === 'object') {
        return parseScoreText(score.score ?? score.value ?? score.label)?.total
      }
      return parseScoreText(score)?.total
    })
    .filter((total) => Number.isFinite(total))
  const text = safePresentationText(totalGoalsDirection, '')

  if (/0-1|低比分|小比分|小\s*1\.5/.test(text)) return 'low'
  if (/小\s*2\.5|2\.5球以下|以下/.test(text)) return 'under'
  if (/3球以上|偏高|大\s*2\.5|2\.5球以上|以上/.test(text)) return 'over'
  if (totals.length && Math.max(...totals) <= 1) return 'low'
  if (totals.some((total) => total >= 3)) return 'over'
  return 'middle'
}

function getFallbackScores(directionKind, totalHint) {
  if (directionKind === 'away') {
    return totalHint === 'over' ? ['1-2', '1-1'] : ['0-1', '1-1']
  }

  if (directionKind === 'draw') {
    return totalHint === 'low' ? ['0-0', '1-1'] : ['1-1', '1-0']
  }

  if (directionKind === 'home') {
    return totalHint === 'over' ? ['2-1', '1-1'] : ['1-0', '1-1']
  }

  return totalHint === 'over' ? ['2-1', '1-1'] : ['1-1', '1-0']
}

function isScoreAllowedForDirection(score, directionKind, isPrimary = false) {
  const outcome = scoreOutcome(score)

  if (directionKind === 'home') {
    return isPrimary ? outcome !== 'away' : outcome !== 'away'
  }

  if (directionKind === 'away') {
    return isPrimary ? outcome !== 'home' : outcome !== 'home'
  }

  if (directionKind === 'draw') {
    const parsed = parseScoreText(score)
    if (!parsed) return false
    if (outcome === 'draw') return true
    return Math.abs(parsed.home - parsed.away) === 1 && parsed.total <= 3
  }

  return true
}

function ensureDistinctScores(primaryScore, secondaryScore, directionKind, totalHint) {
  if (primaryScore !== secondaryScore) return [primaryScore, secondaryScore]

  const fallbackScores = getFallbackScores(directionKind, totalHint)
  const backup = fallbackScores.find((score) => score !== primaryScore) ?? '1-0'
  return [primaryScore, backup]
}

function getRawScores(scorePredictions) {
  return uniqueScores(
    normalizeScoreList(scorePredictions).map((score) => {
      if (score && typeof score === 'object') {
        return score.score ?? score.value ?? score.label
      }
      return score
    }),
  ).filter((score) => parseScoreText(score))
}

function directionKindFromText(text, homeTeamText, awayTeamText) {
  const value = safePresentationText(text, '')

  if (
    value.includes(`${awayTeamText}不败`) ||
    value.includes(`${awayTeamText}胜`) ||
    value.includes('客队不败') ||
    value.includes('客队方向') ||
    value.includes('客胜')
  ) {
    return 'away'
  }

  if (
    value.includes(`${homeTeamText}不败`) ||
    value.includes(`${homeTeamText}胜`) ||
    value.includes('主队不败') ||
    value.includes('主队方向') ||
    value.includes('主胜')
  ) {
    return 'home'
  }

  if (/平局|拉锯/.test(value)) return 'draw'
  return 'unknown'
}

function makeTeamDirection(teamName, fallback) {
  const team = safePresentationText(teamName, fallback)
  return `${team}不败`
}

function normalizeMainDirection({ awayTeamText, homeTeamText, mainDirection, mainPick }) {
  const text = safePresentationText(mainDirection, safePresentationText(mainPick, '平局优先'))
  const oldCautiousCopy = ['谨慎', '观望'].join('')

  if (
    text.includes(oldCautiousCopy) ||
    /等待盘口|先观察|观察为主|盘口确认|临场复核|保守观察/.test(text)
  ) {
    return {
      directionKind: 'draw',
      mainDirectionValue: '平局优先',
      supportValue: '低比分拉锯需要防范',
    }
  }

  if (/平局防范|平局需防|防范平局/.test(text)) {
    return {
      directionKind: 'home',
      mainDirectionValue: makeTeamDirection(homeTeamText, '主队'),
      supportValue: '平局需要防范',
    }
  }

  if (text.includes('方向更稳')) {
    const teamDirection = text.replace('方向更稳', '不败')
    return {
      directionKind: directionKindFromText(teamDirection, homeTeamText, awayTeamText),
      mainDirectionValue: teamDirection,
      supportValue: '小胜与平局路径都需覆盖',
    }
  }

  if (text === '主胜方向' || text === '主队不败') {
    return {
      directionKind: 'home',
      mainDirectionValue: makeTeamDirection(homeTeamText, '主队'),
      supportValue: '平局需要防范',
    }
  }

  if (text === '客胜方向' || text === '客队不败') {
    return {
      directionKind: 'away',
      mainDirectionValue: makeTeamDirection(awayTeamText, '客队'),
      supportValue: '平局需要防范',
    }
  }

  const directionKind = directionKindFromText(text, homeTeamText, awayTeamText)

  return {
    directionKind,
    mainDirectionValue: text,
    supportValue:
      directionKind === 'draw'
        ? '低比分拉锯需要防范'
        : '平局需要防范',
  }
}

export function buildScoreRecommendation(
  scorePredictions,
  { directionKind = 'unknown', totalGoalsDirection = '' } = {},
) {
  const totalHint = getTotalHint(scorePredictions, totalGoalsDirection)
  const rawScores = getRawScores(scorePredictions)
  const fallbackScores = getFallbackScores(directionKind, totalHint)
  const candidates = uniqueScores([...rawScores, ...fallbackScores])
  let primaryScore =
    candidates.find((score) => isScoreAllowedForDirection(score, directionKind, true)) ??
    fallbackScores[0]
  let secondaryScore =
    candidates.find(
      (score) =>
        score !== primaryScore &&
        isScoreAllowedForDirection(score, directionKind, false),
    ) ?? fallbackScores.find((score) => score !== primaryScore) ?? '1-1'

  if (directionKind === 'draw') {
    const hasDraw = [primaryScore, secondaryScore].some(
      (score) => scoreOutcome(score) === 'draw',
    )
    if (!hasDraw) secondaryScore = fallbackScores[0]
  }

  ;[primaryScore, secondaryScore] = ensureDistinctScores(
    primaryScore,
    secondaryScore,
    directionKind,
    totalHint,
  )

  return {
    primaryScore,
    rawScores,
    secondaryScore,
    totalHint,
  }
}

export function deriveTotalGoalsText(primaryScore, secondaryScore) {
  const totals = [scoreTotal(primaryScore), scoreTotal(secondaryScore)].sort((a, b) => a - b)
  const [lowTotal, highTotal] = totals

  if (lowTotal === 0 && highTotal === 0) return '0-1球'
  if (highTotal <= 1) return '1球附近'
  if (lowTotal === 0 && highTotal <= 2) return '0-2球'
  if (lowTotal <= 1 && highTotal === 2) return '1-2球'
  if (lowTotal === 2 && highTotal === 2) return '2球附近'
  if (lowTotal === 2 && highTotal === 3) return '2-3球'
  if (lowTotal >= 3) return '3球以上'
  if (highTotal >= 3) return '2-3球'
  return '1-2球'
}

export function formatGoalsDirectionForPresentation(value) {
  const text = safePresentationText(value, '')
  if (!text) return '1-2球'
  if (/0-1|低比分/.test(text)) return '0-1球'
  if (/小比分|2\.5球以下|小2\.5/.test(text)) return '1-2球'
  if (text.includes('2.5球以上') || text.includes('大2.5')) return '3球以上'
  if (text.includes('2-3')) return '2-3球'
  return text
}

export function formatMainDirectionForPresentation(value, teams = {}) {
  return normalizeMainDirection({
    awayTeamText: teams.awayTeamText,
    homeTeamText: teams.homeTeamText,
    mainDirection: value,
    mainPick: value,
  }).mainDirectionValue
}

function getStatusText(statusTags = []) {
  const tags = Array.isArray(statusTags)
    ? statusTags.map((tag) => safePresentationText(tag, '')).filter(Boolean)
    : []
  const preferred =
    tags.find((tag) => tag.includes('当前重点')) ??
    tags.find((tag) => tag.includes('即将')) ??
    tags.find((tag) => tag.includes('进行中')) ??
    tags[0]

  return safePresentationText(preferred, '当前重点')
}

function getLineupInsight(lineupStatusText, formationText) {
  const status = safePresentationText(lineupStatusText, '首发待确认')
  const formation = safePresentationText(formationText, '')

  if (status.includes('官方')) {
    return formation
      ? `官方首发已经明确，阵型${formation}会影响中场站位与边路推进，临场重点看两队前场衔接效率。`
      : '官方首发已经明确，重点观察中前场站位、边路推进速度和替补轮换节奏对比赛走势的影响。'
  }

  return '官方首发公布前，重点观察中前场轮换、边路速度点和防线组合，临场名单会改变比赛节奏。'
}

function getLineupInsightShort(lineupStatusText, formationText) {
  const status = safePresentationText(lineupStatusText, '首发待确认')
  const formation = safePresentationText(formationText, '')

  if (status.includes('官方')) {
    return formation
      ? `官方首发已明确，阵型${formation}会影响中场站位和边路推进。`
      : '官方首发已明确，重点看中前场衔接、边路推进效率和换人节奏。'
  }

  return '官方首发公布前，重点看中前场轮换和边路速度点，名单会影响方向强度。'
}

function getGoalsStyle(totalGoalsValue) {
  if (/0-1|0-2|1球|1-2|2球/.test(totalGoalsValue)) return '低比分拉锯'
  if (totalGoalsValue.includes('3球以上')) return '进球数偏高'
  return '中等进球拉锯'
}

function getModelInsight({
  mainDirectionValue,
  totalGoalsValue,
  homeTeamText,
  supportValue,
}) {
  return `${homeTeamText}整体稳定性更值得信任，比赛节奏偏向${getGoalsStyle(totalGoalsValue)}。本场优先看${mainDirectionValue}，${supportValue}。`
}

function getOneLineSummary(primaryScore, secondaryScore, totalGoalsValue) {
  return `本场更像${getGoalsStyle(totalGoalsValue)}，比分优先${primaryScore}，备用${secondaryScore}，临场再复核。`
}

export function buildShortReasonForPresentation({
  goalsDirection,
  mainDirection,
  summary,
} = {}) {
  const cleanSummary = safePresentationText(summary, '')
  const direction = safePresentationText(mainDirection, '平局优先')
  const goals = safePresentationText(goalsDirection, '2球附近')
  const oldWaitCopy = ['等待盘口确认', '｜', '先观察'].join('')
  const oldCautiousCopy = ['谨慎', '观望'].join('')
  const oldRiskCopy = ['风险', '偏高'].join('')
  const oldSummaryPattern = new RegExp(
    `${oldWaitCopy}|${oldCautiousCopy}|${oldRiskCopy}`,
  )

  if (cleanSummary && !oldSummaryPattern.test(cleanSummary)) {
    return cleanSummary
      .replace(new RegExp(oldCautiousCopy, 'g'), '保守观察')
      .replace(new RegExp(oldRiskCopy, 'g'), '变量偏多')
  }

  return `本场更接近中低比分拉锯，${direction}是优先判断线，进球区间围绕${goals}展开。`
}

export function buildPosterPresentation({
  awayFormation,
  awayTeam,
  displayConfidence,
  homeFormation,
  homeTeam,
  isCautious,
  kickoff,
  lineupStatusText,
  mainDirection,
  mainPick,
  presentationRating,
  rawScore,
  riskTone,
  scorePredictions,
  statusTags,
  summary,
  totalGoalsDirection,
} = {}) {
  const homeTeamText = safePresentationText(homeTeam, '主队')
  const awayTeamText = safePresentationText(awayTeam, '客队')
  const matchTimeText = safePresentationText(kickoff, '赛前时间待确认')
  const direction = normalizeMainDirection({
    awayTeamText,
    homeTeamText,
    mainDirection,
    mainPick,
  })
  const scorePair = buildScoreRecommendation(scorePredictions, {
    directionKind: direction.directionKind,
    totalGoalsDirection,
  })
  const totalGoalsValue = deriveTotalGoalsText(
    scorePair.primaryScore,
    scorePair.secondaryScore,
  )
  const rating =
    presentationRating ??
    buildPresentationRating({
      displayScore: displayConfidence,
      isCautious,
      rawScore,
      riskTone,
    })
  const formationText =
    safePresentationText(awayFormation, '') && safePresentationText(homeFormation, '')
      ? `${safePresentationText(homeFormation)} vs ${safePresentationText(awayFormation)}`
      : ''
  const lineupInsight = getLineupInsight(lineupStatusText, formationText)
  const modelInsight = getModelInsight({
    mainDirectionValue: direction.mainDirectionValue,
    totalGoalsValue,
    homeTeamText,
    supportValue: direction.supportValue,
  })
  const lineupInsightShort = getLineupInsightShort(lineupStatusText, formationText)
  const oneLineSummary = getOneLineSummary(
    scorePair.primaryScore,
    scorePair.secondaryScore,
    totalGoalsValue,
  )
  const totalGoalsShortText = `总进球：${totalGoalsValue}`

  return {
    awayTeamText,
    directionKind: direction.directionKind,
    footerNote: '赛前方向参考，临场阵容与比赛进程需结合复核。',
    homeTeamText,
    lineupInsight,
    lineupInsightShort,
    mainConclusion: `主方向：${direction.mainDirectionValue}`,
    mainDirectionValue: direction.mainDirectionValue,
    matchTimeText,
    modelInsight,
    modelInsightShort: modelInsight,
    oneLineSummary,
    oneLineSummaryShort: oneLineSummary,
    posterKicker: '结合球队状态、首发预期、比赛节奏与市场变化的赛前综合判断',
    posterSubtitle: '逐场情报解读',
    posterTitle: 'AI赛前情报',
    primaryScoreText: `主推比分：${scorePair.primaryScore}`,
    primaryScoreValue: scorePair.primaryScore,
    rawPrediction: {
      scorePredictions,
      totalGoalsDirection,
      summary,
    },
    rawScore: rating.rawScore,
    secondaryScoreText: `备用比分：${scorePair.secondaryScore}`,
    secondaryScoreValue: scorePair.secondaryScore,
    statusText: getStatusText(statusTags),
    supportConclusion: `补充判断：${direction.supportValue}`,
    supportConclusionValue: direction.supportValue,
    totalGoalsShortText,
    totalGoalsText: totalGoalsShortText,
    totalGoalsValue,
  }
}
