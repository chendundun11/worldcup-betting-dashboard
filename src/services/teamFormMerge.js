function normalizeTeamKey(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
}

function getTeamName(match, side) {
  const directName = match?.[`${side}TeamName`]
  if (typeof directName === 'string' && directName.trim()) return directName

  const team = match?.[`${side}Team`]
  if (typeof team === 'string' && team.trim()) return team

  if (team && typeof team === 'object') {
    return team.name ?? team.shortName ?? team.id ?? ''
  }

  return ''
}

function cloneObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? { ...value }
    : {}
}

function cloneStringList(value) {
  return Array.isArray(value)
    ? value.filter((item) => typeof item === 'string')
    : []
}

function cloneList(value) {
  return Array.isArray(value)
    ? value.map((item) => (
        item && typeof item === 'object' && !Array.isArray(item)
          ? { ...item }
          : item
      ))
    : []
}

function normalizeString(value, fallback = '') {
  return typeof value === 'string' && value.trim() ? value : fallback
}

function deriveFormTrend(teamForm) {
  if (typeof teamForm?.formTrend === 'string' && teamForm.formTrend.trim()) {
    return teamForm.formTrend
  }

  if (teamForm?.formStatus === 'mixed') return 'volatile'
  return normalizeString(teamForm?.formStatus, 'unknown')
}

function buildMatchKey(match) {
  if (typeof match?.matchKey === 'string' && match.matchKey.trim()) {
    return match.matchKey.trim()
  }

  const homeTeam = getTeamName(match, 'home').trim()
  const awayTeam = getTeamName(match, 'away').trim()

  if (!homeTeam || !awayTeam) return ''

  return `${homeTeam}__${awayTeam}`
}

function createRemoteTeamSide(teamForm) {
  return {
    status: normalizeString(teamForm.status, 'mock'),
    teamName: teamForm.teamName ?? '',
    formTrend: deriveFormTrend(teamForm),
    recentResults: cloneList(teamForm.recentResults),
    attackTrend: normalizeString(teamForm.attackTrend, 'unknown'),
    defenseTrend: normalizeString(teamForm.defenseTrend, 'unknown'),
    volatility: normalizeString(teamForm.volatility, 'unknown'),
    dataQuality: normalizeString(teamForm.dataQuality, 'unknown'),
    formStatus: teamForm.formStatus ?? 'unknown',
    confidence: teamForm.confidence ?? 'low',
    recentMatches: cloneObject(teamForm.recentMatches),
    homeAwaySplit: cloneObject(teamForm.homeAwaySplit),
    scheduleLoad: cloneObject(teamForm.scheduleLoad),
    trendFlags: cloneStringList(teamForm.trendFlags),
    riskFlags: cloneStringList(teamForm.riskFlags),
    reviewPoints: cloneStringList(teamForm.reviewPoints),
    riskNotes: cloneStringList(teamForm.riskNotes),
    fallbackReason: teamForm.fallbackReason ?? null,
  }
}

function createComparison() {
  return {
    formEdge: 'unknown',
    attackEdge: 'unknown',
    defenseEdge: 'unknown',
    volatilityRisk: 'unknown',
  }
}

function createRemoteTeamForm(homeForm, awayForm, teamFormSnapshot, match) {
  return {
    status: normalizeString(teamFormSnapshot.status, teamFormSnapshot.provider ?? 'unknown'),
    provider: teamFormSnapshot.provider ?? null,
    dataSource: teamFormSnapshot.dataSource ?? null,
    updatedAt: teamFormSnapshot.updatedAt ?? null,
    matchKey: buildMatchKey(match),
    home: homeForm ? createRemoteTeamSide(homeForm) : null,
    away: awayForm ? createRemoteTeamSide(awayForm) : null,
    comparison: createComparison(),
    fallbackReason:
      homeForm?.fallbackReason ??
      awayForm?.fallbackReason ??
      teamFormSnapshot.fallbackReason ??
      null,
    rawAvailable:
      homeForm?.rawAvailable === true ||
      awayForm?.rawAvailable === true ||
      teamFormSnapshot.rawAvailable === true,
  }
}

export function mergeTeamFormIntoMatches(matches, teamFormSnapshot) {
  if (!Array.isArray(matches)) return []

  if (
    teamFormSnapshot?.disabled === true ||
    !Array.isArray(teamFormSnapshot?.teams)
  ) {
    return [...matches]
  }

  const teamsByName = new Map()

  for (const teamForm of teamFormSnapshot.teams) {
    const teamKey = normalizeTeamKey(teamForm?.teamName)
    if (!teamKey) continue
    teamsByName.set(teamKey, teamForm)
  }

  if (!teamsByName.size) return [...matches]

  return matches.map((match) => {
    const homeForm = teamsByName.get(normalizeTeamKey(getTeamName(match, 'home')))
    const awayForm = teamsByName.get(normalizeTeamKey(getTeamName(match, 'away')))

    if (!homeForm && !awayForm) return match

    return {
      ...match,
      remoteTeamForm: createRemoteTeamForm(homeForm, awayForm, teamFormSnapshot, match),
    }
  })
}

export default mergeTeamFormIntoMatches
