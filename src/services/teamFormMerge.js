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

function createRemoteTeamSide(teamForm) {
  return {
    teamName: teamForm.teamName ?? '',
    formStatus: teamForm.formStatus ?? 'unknown',
    confidence: teamForm.confidence ?? 'low',
    recentMatches: cloneObject(teamForm.recentMatches),
    homeAwaySplit: cloneObject(teamForm.homeAwaySplit),
    scheduleLoad: cloneObject(teamForm.scheduleLoad),
    trendFlags: cloneStringList(teamForm.trendFlags),
    riskFlags: cloneStringList(teamForm.riskFlags),
    reviewPoints: cloneStringList(teamForm.reviewPoints),
    fallbackReason: teamForm.fallbackReason ?? null,
  }
}

function createRemoteTeamForm(homeForm, awayForm, teamFormSnapshot) {
  return {
    provider: teamFormSnapshot.provider ?? null,
    dataSource: teamFormSnapshot.dataSource ?? null,
    updatedAt: teamFormSnapshot.updatedAt ?? null,
    home: homeForm ? createRemoteTeamSide(homeForm) : null,
    away: awayForm ? createRemoteTeamSide(awayForm) : null,
    fallbackReason:
      homeForm?.fallbackReason ??
      awayForm?.fallbackReason ??
      teamFormSnapshot.fallbackReason ??
      null,
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
      remoteTeamForm: createRemoteTeamForm(homeForm, awayForm, teamFormSnapshot),
    }
  })
}

export default mergeTeamFormIntoMatches
