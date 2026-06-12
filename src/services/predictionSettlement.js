import { getNormalizedMatchKeys } from './matchIdentity.js'

const MISSING_SNAPSHOT_STATUS = 'missing_prediction_snapshot'

function safeText(value) {
  return String(value ?? '').trim()
}

function getFinalGoals(finalResult = {}) {
  if (
    Number.isFinite(Number(finalResult.homeGoals)) &&
    Number.isFinite(Number(finalResult.awayGoals))
  ) {
    return {
      homeGoals: Number(finalResult.homeGoals),
      awayGoals: Number(finalResult.awayGoals),
    }
  }

  const scoreText = safeText(finalResult.finalScore)
  const scoreMatch = scoreText.match(/^(\d+)\s*[-:]\s*(\d+)$/)
  if (!scoreMatch) return null

  return {
    homeGoals: Number(scoreMatch[1]),
    awayGoals: Number(scoreMatch[2]),
  }
}

function getOutcomeFromGoals(goals) {
  if (!goals) return null
  if (goals.homeGoals > goals.awayGoals) return 'home'
  if (goals.homeGoals < goals.awayGoals) return 'away'
  return 'draw'
}

function normalizeOutcome(value, finalResult = {}) {
  const text = safeText(value).toLowerCase()
  const homeName = safeText(finalResult.homeTeam).toLowerCase()
  const awayName = safeText(finalResult.awayTeam).toLowerCase()

  if (!text) return null
  if (['home', 'homewin', 'home_win', '1', '\u4e3b\u80dc'].includes(text)) {
    return 'home'
  }
  if (['away', 'awaywin', 'away_win', '2', '\u5ba2\u80dc'].includes(text)) {
    return 'away'
  }
  if (['draw', 'x', 'tie', '\u5e73\u5c40'].includes(text)) return 'draw'
  if (homeName && text === homeName) return 'home'
  if (awayName && text === awayName) return 'away'
  if (
    homeName &&
    text.includes(homeName) &&
    (text.includes('win') || text.includes('\u4e3b\u80dc'))
  ) {
    return 'home'
  }
  if (
    awayName &&
    text.includes(awayName) &&
    (text.includes('win') || text.includes('\u5ba2\u80dc'))
  ) {
    return 'away'
  }

  return null
}

function normalizeTotalGoals(value) {
  const text = safeText(value).toLowerCase().replace(/\s+/g, '')

  if (!text) return null
  if (
    ['over25', 'over2.5', 'over_25', '\u59272.5', '\u5927\u4e8e2.5'].includes(text)
  ) {
    return 'over25'
  }
  if (
    ['under25', 'under2.5', 'under_25', '\u5c0f2.5', '\u5c0f\u4e8e2.5'].includes(text)
  ) {
    return 'under25'
  }

  return null
}

function normalizeScore(value) {
  if (typeof value === 'string') {
    const scoreMatch = value.match(/(\d+)\s*[-:]\s*(\d+)/)
    return scoreMatch ? `${Number(scoreMatch[1])}-${Number(scoreMatch[2])}` : null
  }

  if (value && typeof value === 'object') {
    if (typeof value.score === 'string') return normalizeScore(value.score)
    if (
      Number.isFinite(Number(value.homeGoals)) &&
      Number.isFinite(Number(value.awayGoals))
    ) {
      return `${Number(value.homeGoals)}-${Number(value.awayGoals)}`
    }
  }

  return null
}

function getSnapshotMainPick(snapshot) {
  if (typeof snapshot?.mainPick === 'string') return snapshot.mainPick
  return snapshot?.mainPick?.direction ?? snapshot?.mainPick?.pick ?? snapshot?.mainPick?.label
}

function getSnapshotScores(snapshot) {
  if (Array.isArray(snapshot?.scorePredictions)) return snapshot.scorePredictions
  if (Array.isArray(snapshot?.scores)) return snapshot.scores
  return []
}

export function settlePredictionSnapshot(predictionSnapshot, finalResult) {
  const goals = getFinalGoals(finalResult)
  const finalScore = goals ? `${goals.homeGoals}-${goals.awayGoals}` : null

  if (!predictionSnapshot) {
    return {
      mainPickHit: null,
      totalGoalsHit: null,
      scoreHit: null,
      matchedScore: null,
      finalScore,
      settlementStatus: MISSING_SNAPSHOT_STATUS,
      note: '\u7f3a\u5c11\u8d5b\u524d\u5feb\u7167\uff0c\u4e0d\u505a\u547d\u4e2d\u8865\u586b',
    }
  }

  if (!goals) {
    return {
      mainPickHit: null,
      totalGoalsHit: null,
      scoreHit: null,
      matchedScore: null,
      finalScore: null,
      settlementStatus: 'missing_final_score',
      note: '\u7f3a\u5c11\u7ec8\u573a\u6bd4\u5206\uff0c\u6682\u4e0d\u7ed3\u7b97',
    }
  }

  const actualOutcome = getOutcomeFromGoals(goals)
  const mainPick = normalizeOutcome(getSnapshotMainPick(predictionSnapshot), finalResult)
  const totalGoalsDirection = normalizeTotalGoals(predictionSnapshot.totalGoalsDirection)
  const totalGoals = goals.homeGoals + goals.awayGoals
  const scorePredictions = getSnapshotScores(predictionSnapshot)
    .map(normalizeScore)
    .filter(Boolean)
  const matchedScore = scorePredictions.includes(finalScore) ? finalScore : null

  return {
    mainPickHit: mainPick ? mainPick === actualOutcome : null,
    totalGoalsHit:
      totalGoalsDirection === 'over25'
        ? totalGoals > 2.5
        : totalGoalsDirection === 'under25'
          ? totalGoals < 2.5
          : null,
    scoreHit: scorePredictions.length ? Boolean(matchedScore) : null,
    matchedScore,
    finalScore,
    settlementStatus: 'settled',
  }
}

export function findHistoryRecordForMatch(records = [], match) {
  const matchKeys = new Set(getNormalizedMatchKeys(match))

  return (
    records.find((record) =>
      getNormalizedMatchKeys({
        id: record.matchId,
        matchId: record.matchId,
        matchKey: record.matchKey,
        homeTeam: record.homeTeam,
        awayTeam: record.awayTeam,
        homeTeamName: record.homeTeam,
        awayTeamName: record.awayTeam,
      }).some((key) => matchKeys.has(key)),
    ) ?? null
  )
}

export function formatSettlementHit(value) {
  if (value === true) return '\u547d\u4e2d'
  if (value === false) return '\u672a\u547d\u4e2d'
  return '\u6682\u65e0\u8d5b\u524d\u5feb\u7167'
}
