import { readFileSync } from 'node:fs'

import {
  getManualLineupForMatch,
  isManualLineupEntry,
  manualLineups,
} from '../src/data/manualLineups.js'

const allowedStatuses = new Set(['predicted', 'confirmed', 'unavailable'])
const manualPath = 'src/data/manualLineups.js'
const appPath = 'src/App.jsx'
const cssPath = 'src/App.css'

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

const manualText = readFileSync(manualPath, 'utf8')
const appText = readFileSync(appPath, 'utf8')
const cssText = readFileSync(cssPath, 'utf8')

assert(
  manualLineups && typeof manualLineups === 'object' && !Array.isArray(manualLineups),
  'manualLineups must import as an object.',
)

for (const [key, lineup] of Object.entries(manualLineups)) {
  assert(key.trim(), 'manualLineups keys must not be empty.')
  assert(lineup.lineupStatus, `${key} must include lineupStatus.`)
  assert(
    allowedStatuses.has(lineup.lineupStatus),
    `${key} lineupStatus must be predicted, confirmed, or unavailable.`,
  )
  assert(isManualLineupEntry(lineup), `${key} must be a valid manual lineup entry.`)
}

assert(
  getManualLineupForMatch({
    homeTeam: { name: 'France' },
    awayTeam: { name: 'Germany' },
  }) === manualLineups.France__Germany,
  'getManualLineupForMatch must match the stable home__away key.',
)

assert(
  getManualLineupForMatch({
    homeTeam: { name: 'France B' },
    awayTeam: { name: 'Germany' },
  }) === null,
  'getManualLineupForMatch must not fuzzy match teams.',
)

assert(
  appText.includes("if (status === 'confirmed') return '官方首发'") &&
    appText.includes("return '预计首发'"),
  'App must show 官方首发 only for confirmed and predicted as 预计首发.',
)

assert(
  !/predicted[\s\S]{0,160}官方首发/.test(appText),
  'predicted must not be marked as 官方首发.',
)

for (const [label, pattern] of Object.entries({
  promiseLanguage: /稳赚|必中|保证命中/,
  misleadingAi: /GPT 已启用|OpenAI 实时分析|已启用 OpenAI/,
  apiKey: /OPENAI_API_KEY|API_FOOTBALL_KEY|THE_ODDS_API_KEY|x-rapidapi-key|x-apisports-key|api[_-]?key|sk-[A-Za-z0-9_-]{16,}/i,
  rawOrHeaders: /rawResponse|raw_response|"headers"|authorization|bearer\s+[A-Za-z0-9._-]+/i,
  realApiCall: /\bfetch\s*\(|XMLHttpRequest|axios\.|https?:\/\//i,
})) {
  assert(!pattern.test(manualText), `manualLineups must not contain ${label}.`)
}

for (const [label, pattern] of Object.entries({
  publicStakeCopy: /资金分配|总投入|公开 stake|公开金额/,
  misleadingAiCopy: /GPT 已启用|OpenAI 实时分析|已启用 OpenAI/,
  promiseCopy: /稳赚|必中|保证命中/,
})) {
  assert(
    !pattern.test(`${appText}\n${cssText}`),
    `public display files must not contain ${label}.`,
  )
}

console.log('Manual lineup checks passed.')

