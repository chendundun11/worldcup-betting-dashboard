const DAY_MS = 24 * 60 * 60 * 1000

function safeDateMs(value) {
  const time = new Date(value).getTime()
  return Number.isFinite(time) ? time : Number.POSITIVE_INFINITY
}

function toNowMs(now) {
  const time = new Date(now).getTime()
  return Number.isFinite(time) ? time : Date.now()
}

function isFinishedMatch(match) {
  return match?.status === 'finished'
}

function isLiveMatch(match) {
  return match?.status === 'live'
}

function hasOfficialLineup(match) {
  return (
    match?.manualLineup?.lineupStatus === 'confirmed' ||
    match?.lineup?.lineupStatus === 'confirmed' ||
    match?.lineupStatus === 'confirmed'
  )
}

function getDisplayConfidence(match) {
  const confidence = Number(match?.displayConfidence)
  return Number.isFinite(confidence) ? confidence : 0
}

function hasLocalData(match) {
  return Boolean(match?.localOdds || match?.odds || match?.manualLineup)
}

function getTeamStrength(match) {
  const homeStrength = Number(match?.homeTeam?.teamStrength)
  const awayStrength = Number(match?.awayTeam?.teamStrength)
  const values = [homeStrength, awayStrength].filter(Number.isFinite)
  if (!values.length) return 0
  return Math.max(...values)
}

function getFutureDelta(match, nowMs) {
  return safeDateMs(match?.kickoff ?? match?.kickoffTime) - nowMs
}

function compareByKickoff(current, next) {
  const currentKickoff = safeDateMs(current.match?.kickoff ?? current.match?.kickoffTime)
  const nextKickoff = safeDateMs(next.match?.kickoff ?? next.match?.kickoffTime)
  if (currentKickoff !== nextKickoff) return currentKickoff - nextKickoff
  return current.index - next.index
}

function compareByFocusScore(nowMs) {
  return (current, next) => {
    const currentMatch = current.match
    const nextMatch = next.match
    const currentDelta = getFutureDelta(currentMatch, nowMs)
    const nextDelta = getFutureDelta(nextMatch, nowMs)
    const currentWithin48h = currentDelta >= 0 && currentDelta <= 2 * DAY_MS
    const nextWithin48h = nextDelta >= 0 && nextDelta <= 2 * DAY_MS
    const currentScore =
      (isLiveMatch(currentMatch) ? 800 : 0) +
      (hasOfficialLineup(currentMatch) ? 220 : 0) +
      (currentWithin48h ? 140 : 0) +
      getDisplayConfidence(currentMatch) * 2 +
      (hasLocalData(currentMatch) ? 28 : 0) +
      getTeamStrength(currentMatch) * 0.2 -
      Math.max(currentDelta, 0) / DAY_MS
    const nextScore =
      (isLiveMatch(nextMatch) ? 800 : 0) +
      (hasOfficialLineup(nextMatch) ? 220 : 0) +
      (nextWithin48h ? 140 : 0) +
      getDisplayConfidence(nextMatch) * 2 +
      (hasLocalData(nextMatch) ? 28 : 0) +
      getTeamStrength(nextMatch) * 0.2 -
      Math.max(nextDelta, 0) / DAY_MS

    if (currentScore !== nextScore) return nextScore - currentScore
    return compareByKickoff(current, next)
  }
}

function normalizeMatches(matches) {
  return Array.isArray(matches)
    ? matches.map((match, index) => ({
        match,
        index: Number.isInteger(match?.sourceIndex) ? match.sourceIndex : index,
      }))
    : []
}

function normalizeHistoryRecords(betHistory) {
  if (Array.isArray(betHistory)) return betHistory
  if (Array.isArray(betHistory?.records)) return betHistory.records
  return []
}

export function selectFocusMatch(matches = [], betHistory = [], now = new Date()) {
  const nowMs = toNowMs(now)
  const entries = normalizeMatches(matches)
  const unfinishedEntries = entries.filter(({ match }) => !isFinishedMatch(match))
  const liveMatch = unfinishedEntries
    .filter(({ match }) => isLiveMatch(match))
    .sort(compareByKickoff)[0]

  if (liveMatch) return { ...liveMatch, reason: 'live' }

  const officialLineupMatch = unfinishedEntries
    .filter(({ match }) => hasOfficialLineup(match))
    .sort(compareByFocusScore(nowMs))[0]

  if (officialLineupMatch) return { ...officialLineupMatch, reason: 'official-lineup' }

  const futureMatches = unfinishedEntries
    .filter(({ match }) => getFutureDelta(match, nowMs) >= 0)
    .sort(compareByKickoff)

  if (futureMatches[0]) return { ...futureMatches[0], reason: 'next-upcoming' }

  const highScoreWithin24h = unfinishedEntries
    .filter(({ match }) => {
      const delta = getFutureDelta(match, nowMs)
      return delta >= 0 && delta <= DAY_MS
    })
    .sort(compareByFocusScore(nowMs))[0]

  if (highScoreWithin24h) return { ...highScoreWithin24h, reason: 'high-score-24h' }

  const nextUnfinished = unfinishedEntries.sort(compareByKickoff)[0]
  if (nextUnfinished) return { ...nextUnfinished, reason: 'next-unfinished' }

  const recentFinished = entries
    .filter(({ match }) => isFinishedMatch(match))
    .sort((current, next) => compareByKickoff(next, current))[0]

  if (recentFinished) return { ...recentFinished, reason: 'recent-history' }

  const historyRecords = normalizeHistoryRecords(betHistory)
  const recentHistoryRecord = historyRecords
    .filter((record) => record?.status === 'finished' || record?.finalResult)
    .sort(
      (current, next) =>
        safeDateMs(next.finalResult?.settledAt ?? next.kickoff ?? next.updatedAt) -
        safeDateMs(current.finalResult?.settledAt ?? current.kickoff ?? current.updatedAt),
    )[0]

  return recentHistoryRecord
    ? { match: null, index: 0, historyRecord: recentHistoryRecord, reason: 'history-record' }
    : null
}

export function getFocusMatches(matches = [], betHistory = [], now = new Date(), limit = 3) {
  const nowMs = toNowMs(now)
  const entries = normalizeMatches(matches)
  const unfinishedEntries = entries.filter(({ match }) => !isFinishedMatch(match))
  const futureEntries = unfinishedEntries.filter(({ match }) => getFutureDelta(match, nowMs) >= 0)
  const within48h = futureEntries.filter(
    ({ match }) => getFutureDelta(match, nowMs) <= 2 * DAY_MS,
  )
  const primaryPool = within48h.length ? within48h : futureEntries
  const pool = primaryPool.length ? primaryPool : unfinishedEntries

  return pool
    .sort(compareByFocusScore(nowMs))
    .slice(0, Math.max(0, limit))
}

export function getFinishedMatchesForHistory(matches = []) {
  return normalizeMatches(matches)
    .filter(({ match }) => isFinishedMatch(match))
    .sort((current, next) => compareByKickoff(next, current))
}
