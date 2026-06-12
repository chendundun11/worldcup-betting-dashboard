import { readFileSync } from 'node:fs'

import {
  getFinishedMatchesForHistory,
  getFocusMatches,
  selectFocusMatch,
} from '../src/services/matchFocus.js'

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

const matches = [
  {
    id: 'finished',
    sourceIndex: 0,
    status: 'finished',
    kickoff: '2026-06-12T09:00:00+08:00',
    displayConfidence: 92,
  },
  {
    id: 'next',
    sourceIndex: 1,
    status: 'scheduled',
    kickoff: '2026-06-12T13:00:00+08:00',
    displayConfidence: 72,
  },
  {
    id: 'official',
    sourceIndex: 2,
    status: 'scheduled',
    kickoff: '2026-06-12T14:00:00+08:00',
    displayConfidence: 70,
    manualLineup: { lineupStatus: 'confirmed' },
  },
  {
    id: 'later',
    sourceIndex: 3,
    status: 'scheduled',
    kickoff: '2026-06-13T15:00:00+08:00',
    displayConfidence: 86,
  },
]

const withLive = [
  ...matches,
  {
    id: 'live',
    sourceIndex: 4,
    status: 'live',
    kickoff: '2026-06-12T12:00:00+08:00',
    displayConfidence: 65,
  },
]

assert(
  selectFocusMatch(matches, [], '2026-06-12T12:00:00+08:00').match.id !== 'finished',
  'Finished matches must not be the default focus while unfinished matches exist.',
)
assert(
  selectFocusMatch(withLive, [], '2026-06-12T12:00:00+08:00').match.id === 'live',
  'Live match must be selected before other matches.',
)
assert(
  selectFocusMatch(
    matches.filter((match) => match.id !== 'official'),
    [],
    '2026-06-12T12:00:00+08:00',
  ).match.id === 'next',
  'When there is no live or official lineup match, the next upcoming match must be selected.',
)
assert(
  getFocusMatches(withLive, [], '2026-06-12T12:00:00+08:00').length <= 3,
  'Focus match list must contain at most 3 matches.',
)
assert(
  getFinishedMatchesForHistory(withLive).some(({ match }) => match.id === 'finished'),
  'Finished matches must be available for history display.',
)

const focusText = readFileSync('src/services/matchFocus.js', 'utf8')
const appText = readFileSync('src/App.jsx', 'utf8')
assert(appText.includes('查看全部赛程'), 'Collapsed full schedule copy must exist.')
assert(appText.includes('收起全部赛程'), 'Collapse full schedule copy must exist.')

for (const [label, pattern] of Object.entries({
  apiCall: /\bfetch\s*\(|XMLHttpRequest|axios\.|https?:\/\//i,
  envRead: /process\.env|import\.meta\.env|OPENAI_API_KEY|API_FOOTBALL_KEY|THE_ODDS_API_KEY/i,
  betEngineRead: /betEngine/i,
})) {
  assert(!pattern.test(focusText), `matchFocus must not contain ${label}.`)
}

console.log('Match focus checks passed.')
