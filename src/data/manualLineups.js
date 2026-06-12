import { getNormalizedMatchKeys } from '../services/matchIdentity.js'

const ALLOWED_LINEUP_STATUSES = new Set(['predicted', 'confirmed', 'unavailable'])

const LINEUP_SIDE_KEYS = ['home', 'away']
const LINEUP_ROLE_KEYS = ['goalkeeper', 'defenders', 'midfielders', 'forwards']

export const manualLineups = {
  south_korea__czechia: {
    matchLabel: 'South Korea vs Czechia',
    lineupStatus: 'confirmed',
    sourceLabel: 'Reuters / Guardian confirmed XI',
    updatedAt: '2026-06-12T00:00:00Z',
    note: '\u5b98\u65b9\u9996\u53d1\uff0c\u6b63\u5f0f\u9996\u53d1\u4ecd\u9700\u4ee5\u8d5b\u4e8b\u4e34\u573a\u4fe1\u606f\u4e3a\u51c6',
    home: {
      teamName: 'South Korea',
      formation: '3-4-3',
      goalkeeper: ['Kim Seung-gyu'],
      defenders: ['Lee Gi-hyuk', 'Kim Min-jae', 'Lee Han-beom'],
      midfielders: [
        'Seol Young-woo',
        'Hwang In-beom',
        'Paik Seung-ho',
        'Lee Tae-seok',
      ],
      forwards: ['Lee Kang-in', 'Lee Jae-sung', 'Son Heung-min'],
    },
    away: {
      teamName: 'Czechia',
      formation: '3-4-3',
      goalkeeper: ['Matej Kovar'],
      defenders: ['Stepan Chaloupek', 'Robin Hranac', 'Ladislav Krejci'],
      midfielders: [
        'Vladimir Coufal',
        'Tomas Soucek',
        'Alexandr Sojka',
        'Jaroslav Zeleny',
      ],
      forwards: ['Lukas Provod', 'Pavel Sulc', 'Patrik Schick'],
    },
  },
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
  for (const key of getNormalizedMatchKeys(match)) {
    if (!Object.prototype.hasOwnProperty.call(manualLineups, key)) continue

    const lineup = manualLineups[key]
    return isManualLineupEntry(lineup) ? lineup : null
  }

  return null
}
