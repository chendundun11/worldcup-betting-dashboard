const DEFAULT_SCHEMA_VERSION = 'analysis-snapshot-v1'
const BLOCKED_KEYS = new Set([
  'selectedIndex',
  'sourceIndex',
  'showInternalEngine',
  'window',
  'document',
  'localStorage',
])
const BLOCKED_KEY_PATTERNS = [/token/i, /database_?url/i, /authorization/i, /apiKey/i, /secret/i, /password/i, /raw.*response/i]
const AMOUNT_KEYS = new Set(['totalStake', 'stakePlan', 'bankroll', 'stake'])
const SCORE_REFERENCE_KEYS = ['score', 'label', 'reason', 'confidence', 'type']
const MATCH_KEY_BLOCKED_PATTERNS = [
  /selectedindex/gi,
  /sourceindex/gi,
  /showinternalengine/gi,
  /internalsnapshot/gi,
  /totalstake/gi,
  /stakeplan/gi,
  /bankroll/gi,
  /amount/gi,
  /money/gi,
  /stake/gi,
]

function firstPresent(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== '')
}

function isPlainObject(value) {
  return Object.prototype.toString.call(value) === '[object Object]'
}

function pickFields(source, keys) {
  if (!source || typeof source !== 'object') return null

  const picked = Object.fromEntries(
    keys
      .filter((key) => source[key] !== undefined)
      .map((key) => [key, source[key]]),
  )

  return Object.keys(picked).length ? picked : null
}

function getTeamName(match, side) {
  const team = match?.[`${side}Team`]

  return firstPresent(
    match?.[`${side}TeamName`],
    match?.[`${side}TeamDisplayName`],
    team?.name,
    team?.shortName,
    typeof team === 'string' ? team : null,
  ) ?? null
}

function cleanMatchKeyPart(value) {
  const text = String(value ?? '').trim().toLowerCase()
  const cleanedText = MATCH_KEY_BLOCKED_PATTERNS.reduce(
    (currentText, pattern) => currentText.replace(pattern, '-'),
    text,
  )

  return cleanedText
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function buildMatchKey(match, matchIdentity) {
  const preferredMatchKey = firstPresent(match?.matchKey)
  const preferredMatchId = firstPresent(match?.id, match?.matchId)
  const parts = preferredMatchKey
    ? [preferredMatchKey]
    : preferredMatchId
      ? [preferredMatchId]
      : matchIdentity.kickoff
        ? [matchIdentity.homeTeam, matchIdentity.awayTeam, matchIdentity.kickoff]
        : [matchIdentity.homeTeam, matchIdentity.awayTeam]
  const matchKey = parts.map(cleanMatchKeyPart).filter(Boolean).join('-')

  return matchKey || 'unknown-match'
}

function getMatchIdentity(match, plan) {
  const homeTeam = getTeamName(match, 'home')
  const awayTeam = getTeamName(match, 'away')
  const kickoff = firstPresent(match?.kickoffAt, match?.kickoff, match?.kickoffTime, match?.startTime)
  const matchIdentity = {
    matchId: firstPresent(match?.id, match?.matchId, plan?.matchId),
    matchName: firstPresent(plan?.matchName, match?.matchName, `${homeTeam ?? 'Home'} vs ${awayTeam ?? 'Away'}`),
    homeTeam,
    awayTeam,
    kickoff,
  }

  return {
    matchKey: buildMatchKey(match, matchIdentity),
    ...matchIdentity,
  }
}

function cleanScoreReference(reference) {
  if (!reference) return null
  if (typeof reference === 'string' || typeof reference === 'number') {
    return { score: String(reference) }
  }
  if (!isPlainObject(reference)) return null

  return pickFields(reference, SCORE_REFERENCE_KEYS)
}

function buildScoreReference(match, plan) {
  const planScorePicks = Array.isArray(plan?.scorePicks) ? plan.scorePicks : []
  const source = planScorePicks.length
    ? planScorePicks.map((item) => ({
        score: firstPresent(item.score, item.pick),
        label: item.label,
        reason: firstPresent(item.reason, item.note),
        confidence: item.confidence,
        type: item.type,
      }))
    : match?.localOdds?.scoreReference

  return (Array.isArray(source) ? source : [source])
    .map(cleanScoreReference)
    .filter(Boolean)
}

function omitAmountFields(value) {
  if (Array.isArray(value)) return value.map(omitAmountFields)
  if (!value || typeof value !== 'object') return value

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !AMOUNT_KEYS.has(key))
      .map(([key, item]) => [key, omitAmountFields(item)]),
  )
}

function isBlockedKey(key) {
  return BLOCKED_KEYS.has(key) || BLOCKED_KEY_PATTERNS.some((pattern) => pattern.test(key))
}

function sanitizeValue(value, seen = new WeakSet()) {
  if (value === undefined || value === null) return null
  if (typeof value === 'function' || typeof value === 'symbol') return undefined
  if (typeof value === 'bigint') return String(value)
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value !== 'object') return value
  if (value instanceof Date) return value.toISOString()
  if (!Array.isArray(value) && !isPlainObject(value)) return null
  if (seen.has(value)) return null

  seen.add(value)
  const sanitized = Array.isArray(value)
    ? value.map((item) => sanitizeValue(item, seen)).filter((item) => item !== undefined)
    : Object.fromEntries(
        Object.entries(value)
          .filter(([key]) => !isBlockedKey(key))
          .map(([key, item]) => [key, sanitizeValue(item, seen)])
          .filter(([, item]) => item !== undefined),
      )
  seen.delete(value)

  return sanitized
}

export function buildAnalysisSnapshotPayload(match, internalBetPlan, options = {}) {
  const matchIdentity = getMatchIdentity(match, internalBetPlan)
  const sourceMeta = options.sourceMeta ?? {}
  const matchMeta = match?.meta ?? {}
  const payload = {
    schemaVersion: firstPresent(options.schemaVersion, DEFAULT_SCHEMA_VERSION),
    createdAt: firstPresent(options.createdAt, match?.snapshotCreatedAt, match?.updatedAt, matchMeta.capturedAt) ?? null,
    matchIdentity,
    sourceMeta: {
      dataSource: firstPresent(sourceMeta.dataSource, matchMeta.dataSource, match?.dataSource),
      sourceType: firstPresent(sourceMeta.sourceType, matchMeta.sourceType),
      datasetVersion: firstPresent(sourceMeta.datasetVersion, matchMeta.datasetVersion),
      capturedAt: firstPresent(sourceMeta.capturedAt, matchMeta.capturedAt),
    },
    publicMatchSnapshot: {
      homeTeam: matchIdentity.homeTeam,
      awayTeam: matchIdentity.awayTeam,
      kickoff: matchIdentity.kickoff,
      matchStatus: firstPresent(match?.status, match?.matchStatus),
      primaryDirection: pickFields(internalBetPlan?.mainPick, ['action', 'market', 'pick', 'direction', 'label', 'reason']),
      secondaryDirection: pickFields(internalBetPlan?.secondaryPick, ['action', 'market', 'pick', 'direction', 'label', 'reason']),
      upsetObservation: pickFields(internalBetPlan?.upsetPick, ['action', 'market', 'pick', 'direction', 'label', 'reason']),
      scoreReference: buildScoreReference(match, internalBetPlan),
      totalGoalsDirection: firstPresent(
        match?.localOdds?.totalGoalsDirection,
        internalBetPlan?.secondaryPick?.market === 'totalGoals' ? internalBetPlan.secondaryPick.label : null,
      ),
      publicSummary: internalBetPlan?.publicSummary,
    },
    engineSnapshot: omitAmountFields({
      betScore: internalBetPlan?.betScore,
      recommendLevel: internalBetPlan?.recommendLevel,
      mainPick: internalBetPlan?.mainPick,
      secondaryPick: internalBetPlan?.secondaryPick,
      upsetPick: internalBetPlan?.upsetPick,
      heatWarning: internalBetPlan?.heatWarning,
      scoreBreakdown: internalBetPlan?.scoreBreakdown,
    }),
    internalSnapshot: {
      totalStake: internalBetPlan?.totalStake,
      stakePlan: internalBetPlan?.stakePlan,
      bankroll: internalBetPlan?.bankroll,
      lightDataLayer: internalBetPlan?.internalAnalysis?.lightDataLayer,
    },
    dataQuality: internalBetPlan?.dataQuality,
    cancelRules: internalBetPlan?.cancelRules,
  }

  return sanitizeValue(payload)
}

export default buildAnalysisSnapshotPayload
