import {
  TRUSTED_SCORE_SOURCES_V4,
} from './internalTypesV4.js'
import {
  compactText,
  getKickoffTimeV4,
  getScoreTextV4,
  isFinishedStatusV4,
} from './internalSelectorsV4.js'

export const SCORE_PROVIDER_SOURCE_LABELS_V5 = {
  project_actual: '项目数据',
  remote_official: '远程官方',
  manual: '手动',
  none: '无',
}

const TRUSTED_PROJECT_SCORE_SOURCES_V5 = new Set([
  'actual',
  'result',
  'fullTime',
  'final',
  'project_actual',
  ...TRUSTED_SCORE_SOURCES_V4,
])

function nowIso() {
  return new Date().toISOString()
}

function normalizeScore(score) {
  const home = Number(score?.home)
  const away = Number(score?.away)
  if (!Number.isInteger(home) || !Number.isInteger(away) || home < 0 || away < 0) {
    return null
  }
  return { home, away }
}

function makeResult(overrides = {}) {
  return {
    status: 'not_found',
    source: 'none',
    homeScore: null,
    awayScore: null,
    finished: false,
    confidence: 0,
    reason: '未找到可信比分，等待手动录入。',
    checkedAt: nowIso(),
    ...overrides,
  }
}

function trustedProjectCandidate(match) {
  const directCandidates = [
    { score: match?.actualScore, source: 'actual' },
    { score: match?.fullTime, source: 'fullTime' },
    { score: match?.result, source: 'result' },
    { score: match?.final, source: 'final' },
    { score: match?.finalScore, source: 'final' },
  ]

  for (const candidate of directCandidates) {
    const score = normalizeScore(candidate.score)
    if (score) return { score, rawSource: candidate.source }
  }

  const scoreSource = compactText(match?.scoreSource)
  const explicitScore = normalizeScore(match?.score)
  if (explicitScore && scoreSource && TRUSTED_PROJECT_SCORE_SOURCES_V5.has(scoreSource)) {
    return { score: explicitScore, rawSource: scoreSource }
  }

  return null
}

export function getScoreSourceLabelV5(source) {
  return SCORE_PROVIDER_SOURCE_LABELS_V5[source] ?? SCORE_PROVIDER_SOURCE_LABELS_V5.none
}

export function getInternalScoreProviderV5(match, options = {}) {
  const now = options.now ?? new Date()
  const checkedAt = options.checkedAt ?? nowIso()
  const kickoffTime = getKickoffTimeV4(match)

  if (kickoffTime !== null && kickoffTime > now.getTime()) {
    return makeResult({
      reason: '比赛尚未开赛，自动复盘阻断。',
      checkedAt,
    })
  }

  if (!isFinishedStatusV4(match)) {
    return makeResult({
      reason: '比赛未确认完赛，等待可信赛果。',
      checkedAt,
    })
  }

  const projectCandidate = trustedProjectCandidate(match)
  if (projectCandidate) {
    return makeResult({
      status: 'found',
      source: 'project_actual',
      homeScore: projectCandidate.score.home,
      awayScore: projectCandidate.score.away,
      finished: true,
      confidence: 1,
      reason: `项目数据提供可信完赛比分 ${getScoreTextV4(projectCandidate.score)}（${projectCandidate.rawSource}）。`,
      checkedAt,
    })
  }

  return makeResult({
    status: 'not_found',
    source: 'none',
    finished: true,
    reason: '未找到可信比分，等待手动录入。',
    checkedAt,
  })
}

export function isUsableScoreProviderResultV5(result, match, now = new Date()) {
  const kickoffTime = getKickoffTimeV4(match)
  const hasValidScore =
    Number.isInteger(Number(result?.homeScore)) &&
    Number.isInteger(Number(result?.awayScore)) &&
    Number(result.homeScore) >= 0 &&
    Number(result.awayScore) >= 0

  return (
    result?.status === 'found' &&
    result?.finished === true &&
    hasValidScore &&
    (kickoffTime === null || kickoffTime <= now.getTime()) &&
    ['project_actual', 'remote_official', 'manual'].includes(result.source)
  )
}

export function scoreProviderResultToActualScoreV5(result) {
  return {
    home: Number(result?.homeScore),
    away: Number(result?.awayScore),
  }
}
