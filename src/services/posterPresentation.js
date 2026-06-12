import { getDisplayConfidence } from './displayConfidence.js'

const INVALID_TEXT_VALUES = new Set(['', 'undefined', 'null', 'nan'])
const INVALID_TEXT_PATTERNS = [/undefined/i, /\bnull\b/i, /\bNaN\b/i]

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
  return '谨慎观望'
}

function getRiskLabel({ rawScore, displayScore, riskTone, isCautious }) {
  if (isCautious || riskTone === 'high') return '风险偏高'
  if (rawScore !== null && rawScore < 50) return '风险偏高'
  if (displayScore !== null && displayScore < 64) return '风险偏高'
  if (riskTone === 'medium') return '风险中等'
  if (displayScore !== null && displayScore >= 78) return '风险较低'
  return '风险中等'
}

function getStrategyLabel(riskLabel, displayScore) {
  if (riskLabel === '风险偏高') return '谨慎观望'
  if (riskLabel === '风险较低' && displayScore >= 80) return '重点关注'
  if (displayScore >= 70) return '稳健参考'
  return '轻仓参考'
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
  const shouldUseRiskMode =
    isCautious ||
    rawScoreValue === null ||
    rawScoreValue < 55 ||
    (cappedDisplayScore !== null && cappedDisplayScore < 60)
  const riskLabel = getRiskLabel({
    rawScore: rawScoreValue,
    displayScore: cappedDisplayScore,
    riskTone,
    isCautious,
  })
  const strategyLabel = getStrategyLabel(riskLabel, cappedDisplayScore ?? 0)
  const strengthLabel = getStrengthLabel(cappedDisplayScore ?? 0)
  const scoreLabel = cappedDisplayScore >= 80 ? '模型强度' : '方向强度'

  if (shouldUseRiskMode) {
    return {
      rawScore: rawScoreValue,
      displayScore: cappedDisplayScore,
      displayScoreText: cappedDisplayScore === null ? '--/100' : `${cappedDisplayScore}/100`,
      scoreLabel,
      scoreMode: 'risk',
      strengthLabel,
      riskLabel,
      strategyLabel,
      recommendLabel: strategyLabel,
      summaryText: `风险等级：${riskLabel}｜策略：${strategyLabel}`,
      shouldHighlightScore: false,
    }
  }

  return {
    rawScore: rawScoreValue,
    displayScore: cappedDisplayScore,
    displayScoreText: cappedDisplayScore === null ? '--/100' : `${cappedDisplayScore}/100`,
    scoreLabel,
    scoreMode: 'score',
    strengthLabel,
    riskLabel,
    strategyLabel,
    recommendLabel: strengthLabel,
    summaryText: `${scoreLabel}：${cappedDisplayScore ?? '--'}/100｜等级：${strengthLabel}`,
    shouldHighlightScore: true,
  }
}

function normalizeScoreList(scorePredictions) {
  if (Array.isArray(scorePredictions)) return scorePredictions
  if (scorePredictions && typeof scorePredictions === 'object') {
    return [scorePredictions.primary, scorePredictions.main, scorePredictions.secondary, scorePredictions.backup]
  }
  return [scorePredictions]
}

export function buildScoreRecommendation(scorePredictions) {
  const scores = normalizeScoreList(scorePredictions)
    .map((score) => {
      if (score && typeof score === 'object') {
        return safePresentationText(score.score ?? score.value ?? score.label, '')
      }
      return safePresentationText(score, '')
    })
    .filter(Boolean)
  const uniqueScores = Array.from(new Set(scores))

  return {
    primaryScore: uniqueScores[0] || '待复核',
    secondaryScore: uniqueScores[1] || '待补充',
  }
}

export function formatGoalsDirectionForPresentation(value) {
  const text = safePresentationText(value, '')
  if (!text) return '待复核'
  if (text.includes('待复核') || text.includes('待确认')) return '待复核'
  if (text.includes('2.5球以上') || text.includes('大2.5')) return '大 2.5方向'
  if (text.includes('2.5球以下') || text.includes('小2.5')) return '小 2.5方向'
  if (text.includes('2-3')) return '2-3球区间'
  return text.replace('大小球方向', '进球方向')
}

export function formatMainDirectionForPresentation(value) {
  const text = safePresentationText(value, '临场复核')

  if (/等待盘口|先观察|观察为主|盘口确认|临场复核/.test(text)) return '谨慎观望'
  if (/平局防范|平局需防|防范平局/.test(text)) return '平局需防'
  if (text.includes('方向更稳')) return text.replace('方向更稳', '不败')
  if (text === '主胜方向') return '主队不败'
  if (text === '客胜方向') return '客队不败'
  if (text === '平局防范') return '平局需防'

  return text
}

export function buildShortReasonForPresentation({
  goalsDirection,
  mainDirection,
  rating,
  summary,
} = {}) {
  const cleanSummary = safePresentationText(summary, '')
  const direction = safePresentationText(mainDirection, '临场复核')
  const goals = safePresentationText(goalsDirection, '进球方向待复核')

  if (cleanSummary && !/等待盘口确认｜先观察/.test(cleanSummary)) {
    return cleanSummary
  }

  if (direction === '谨慎观望' || rating?.scoreMode === 'risk') {
    return `本场公开信号偏谨慎，主方向以${direction}处理，${goals}需要结合临场首发和盘口复核。`
  }

  return `系统综合盘口、水位与阵容信息后，本场主方向更偏向${direction}，${goals}可作为辅助参考。`
}
