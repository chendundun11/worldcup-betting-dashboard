const ALLOWED_LINEUP_STATUSES = new Set(['predicted', 'confirmed', 'unavailable'])

const LINEUP_SIDE_KEYS = ['home', 'away']
const LINEUP_ROLE_KEYS = ['goalkeeper', 'defenders', 'midfielders', 'forwards']

export const manualLineups = {
  mexico__south_africa: {
    matchLabel: 'Mexico vs South Africa',
    lineupStatus: 'predicted',
    sourceLabel: 'Al Jazeera predicted XI',
    updatedAt: '2026-06-12T00:00:00Z',
    note: '\u9884\u8ba1\u9996\u53d1\uff0c\u6b63\u5f0f\u9996\u53d1\u9700\u4e34\u573a\u590d\u6838',
    home: {
      teamName: 'Mexico',
      formation: '4-3-3',
      goalkeeper: ['Raul Rangel'],
      defenders: [
        'Jesus Gallardo',
        'Johan Vasquez',
        'Cesar Montes',
        'Israel Reyes',
      ],
      midfielders: ['Brian Gutierrez', 'Erik Lira', 'Alvaro Fidalgo'],
      forwards: ['Julian Quinones', 'Roberto Alvarado', 'Raul Jimenez'],
    },
    away: {
      teamName: 'South Africa',
      formation: '4-3-3',
      goalkeeper: ['Ronwen Williams'],
      defenders: [
        'Khuliso Mudau',
        'Ime Okon',
        'Mbekezeli Mbokazi',
        'Aubrey Modiba',
      ],
      midfielders: ['Teboho Mokoena', 'Sphephelo Sithole', 'Thalente Mbatha'],
      forwards: ['Tshepang Moremi', 'Lyle Foster', 'Oswin Appollis'],
    },
  },
  France__Germany: {
    matchLabel: 'France vs Germany',
    lineupStatus: 'predicted',
    sourceLabel: '手动整理',
    updatedAt: '2026-06-12T00:00:00Z',
    note: '预计首发，正式首发需临场复核',
    home: {
      teamName: 'France',
      formation: '待确认',
      goalkeeper: ['待确认'],
      defenders: ['待确认'],
      midfielders: ['待确认'],
      forwards: ['待确认'],
    },
    away: {
      teamName: 'Germany',
      formation: '待确认',
      goalkeeper: ['待确认'],
      defenders: ['待确认'],
      midfielders: ['待确认'],
      forwards: ['待确认'],
    },
  },
}

function safeText(value) {
  return String(value ?? '').trim()
}

function normalizeKeyPart(value) {
  return safeText(value).replace(/\s+/g, '_')
}

function getTeamCandidate(match, side) {
  const team = match?.[`${side}Team`]

  if (typeof team === 'string') return safeText(team)
  if (team && typeof team === 'object') {
    return (
      safeText(team.id) ||
      safeText(team.name) ||
      safeText(team.shortName) ||
      safeText(team.displayName)
    )
  }

  return (
    safeText(match?.[`${side}TeamId`]) ||
    safeText(match?.[`${side}TeamName`]) ||
    safeText(match?.[side])
  )
}

function getManualLineupCandidateKeys(match) {
  const keys = []
  const matchId = safeText(match?.id) || safeText(match?.matchId)

  if (matchId) keys.push(matchId)

  const homeTeam = getTeamCandidate(match, 'home')
  const awayTeam = getTeamCandidate(match, 'away')

  if (homeTeam && awayTeam) {
    keys.push(`${normalizeKeyPart(homeTeam)}__${normalizeKeyPart(awayTeam)}`)
  }

  return keys
}

function isLineupSideValid(side) {
  return (
    side &&
    typeof side === 'object' &&
    LINEUP_ROLE_KEYS.every((roleKey) => Array.isArray(side[roleKey]))
  )
}

export function isManualLineupEntry(value) {
  return (
    value &&
    typeof value === 'object' &&
    ALLOWED_LINEUP_STATUSES.has(value.lineupStatus) &&
    LINEUP_SIDE_KEYS.every((sideKey) => isLineupSideValid(value[sideKey]))
  )
}

export function getManualLineupForMatch(match) {
  for (const key of getManualLineupCandidateKeys(match)) {
    if (!Object.prototype.hasOwnProperty.call(manualLineups, key)) continue

    const lineup = manualLineups[key]
    return isManualLineupEntry(lineup) ? lineup : null
  }

  return null
}
