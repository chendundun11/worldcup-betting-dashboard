const TEAM_ALIAS_KEYS = new Map([
  ['south korea', 'south_korea'],
  ['korea republic', 'south_korea'],
  ['republic of korea', 'south_korea'],
  ['\u97e9\u56fd', 'south_korea'],
  ['czech republic', 'czechia'],
  ['czechia', 'czechia'],
  ['\u6377\u514b', 'czechia'],
  ['mexico', 'mexico'],
  ['\u58a8\u897f\u54e5', 'mexico'],
  ['south africa', 'south_africa'],
  ['\u5357\u975e', 'south_africa'],
])

function safeText(value) {
  return String(value ?? '').trim()
}

function keyPart(value) {
  return safeText(value).replace(/\s+/g, '_')
}

function normalizeAliasLookup(value) {
  return safeText(value)
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
}

export function normalizeTeamKeyPart(value) {
  const text = safeText(value)
  if (!text) return ''

  return TEAM_ALIAS_KEYS.get(normalizeAliasLookup(text)) ?? keyPart(text)
}

function addCandidate(candidates, value) {
  const text = safeText(value)
  if (text) candidates.push(text)
}

export function getTeamCandidateValues(match, side) {
  const candidates = []
  const team = match?.[`${side}Team`]

  if (typeof team === 'string') {
    addCandidate(candidates, team)
  } else if (team && typeof team === 'object') {
    addCandidate(candidates, team.id)
    addCandidate(candidates, team.name)
    addCandidate(candidates, team.shortName)
    addCandidate(candidates, team.displayName)
    addCandidate(candidates, team.tla)
  }

  addCandidate(candidates, match?.[`${side}TeamId`])
  addCandidate(candidates, match?.[`${side}TeamName`])
  addCandidate(candidates, match?.[`${side}TeamDisplayName`])
  addCandidate(candidates, match?.[side])

  return Array.from(new Set(candidates))
}

export function getNormalizedMatchKeys(match) {
  const keys = []

  for (const value of [match?.id, match?.matchId, match?.matchKey]) {
    const key = safeText(value)
    if (key) keys.push(key)
  }

  const homeCandidates = getTeamCandidateValues(match, 'home')
  const awayCandidates = getTeamCandidateValues(match, 'away')

  for (const homeTeam of homeCandidates) {
    for (const awayTeam of awayCandidates) {
      const rawHome = keyPart(homeTeam)
      const rawAway = keyPart(awayTeam)
      const normalizedHome = normalizeTeamKeyPart(homeTeam)
      const normalizedAway = normalizeTeamKeyPart(awayTeam)

      if (rawHome && rawAway) keys.push(`${rawHome}__${rawAway}`)
      if (normalizedHome && normalizedAway) {
        keys.push(`${normalizedHome}__${normalizedAway}`)
      }
    }
  }

  return Array.from(new Set(keys))
}
