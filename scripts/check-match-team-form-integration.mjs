import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'

const matchApiPath = 'src/services/matchApi.js'
const appPath = 'src/App.jsx'
const betEnginePath = 'src/services/betEngine.js'
const apiMatchesPath = 'api/matches.js'
const apiTeamFormPath = 'api/team-form.js'
const packagePath = 'package.json'
const databaseUrlToken = 'DATABASE_' + 'URL'

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function readText(path) {
  return readFileSync(path, 'utf8')
}

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim()
}

for (const path of [
  matchApiPath,
  appPath,
  betEnginePath,
  apiMatchesPath,
  apiTeamFormPath,
  packagePath,
]) {
  assert(existsSync(path), `${path} must exist.`)
}

const matchApiText = readText(matchApiPath)
const appText = readText(appPath)
const betEngineText = readText(betEnginePath)
const apiTeamFormText = readText(apiTeamFormPath)
const packageText = readText(packagePath)

assert(matchApiText.includes("import { getTeamFormSnapshot } from './teamFormApi'"), 'matchApi must import getTeamFormSnapshot from teamFormApi.')
assert(matchApiText.includes("import { mergeTeamFormIntoMatches } from './teamFormMerge'"), 'matchApi must import mergeTeamFormIntoMatches from teamFormMerge.')
assert(!/fetch\s*\(/.test(matchApiText), 'matchApi must not fetch team form directly.')
assert(!/['"]\/api\/team-form['"]/.test(matchApiText), 'matchApi must not reference /api/team-form directly.')
assert(/async function attachRemoteTeamForm/.test(matchApiText), 'matchApi must isolate team form attachment in attachRemoteTeamForm.')
assert(/attachRemoteTeamForm\(\s*await attachRemoteOdds\(/.test(matchApiText), 'matchApi must attach team form after preserving remote odds attachment.')
assert(matchApiText.includes('teamFormMeta'), 'matchApi must expose teamFormMeta when team form attachment completes.')

const attachRemoteTeamFormBlock = matchApiText.match(/async function attachRemoteTeamForm[\s\S]*?\n}\n\nfunction createOddsMeta/)
assert(attachRemoteTeamFormBlock, 'matchApi must keep attachRemoteTeamForm guarded before odds metadata helpers.')
assert(/try\s*{[\s\S]*getTeamFormSnapshot\(\)[\s\S]*mergeTeamFormIntoMatches\([\s\S]*catch/.test(attachRemoteTeamFormBlock[0]), 'team form attachment must be guarded by try/catch.')
assert(/catch\s*\([^)]*\)\s*{[\s\S]*return snapshot/.test(attachRemoteTeamFormBlock[0]), 'team form attachment must return the current snapshot on failure.')
assert(!/\bdataSource\s*:/.test(attachRemoteTeamFormBlock[0]), 'attachRemoteTeamForm must not overwrite snapshot.dataSource.')
assert(!/\bprovider\s*:/.test(attachRemoteTeamFormBlock[0]), 'attachRemoteTeamForm must not overwrite snapshot.provider.')
assert(!/\bmeta\s*:/.test(attachRemoteTeamFormBlock[0]), 'attachRemoteTeamForm must not overwrite snapshot.meta.')

for (const field of [
  'odds',
  'localOdds',
  'remoteOdds',
  'recommendation',
  'scoreReference',
  'totalGoalsDirection',
]) {
  assert(!new RegExp(`\\b${field}\\s*:`).test(attachRemoteTeamFormBlock[0]), `attachRemoteTeamForm must not assign match.${field}.`)
  assert(!new RegExp(`\\.${field}\\s*=`).test(attachRemoteTeamFormBlock[0]), `attachRemoteTeamForm must not mutate match.${field}.`)
}

assert(!/remoteTeamForm/.test(appText), 'App.jsx must not read remoteTeamForm.')
assert(!/remoteTeamForm/.test(betEngineText), 'BetEngine must not read remoteTeamForm.')
assert(!/teamFormMeta/.test(appText), 'App.jsx must not read teamFormMeta.')
assert(!/teamFormMeta/.test(betEngineText), 'BetEngine must not read teamFormMeta.')

assert(!/\bfetch\s*\(/.test(apiTeamFormText), 'Team form API endpoint must not fetch an external supplier.')
assert(!/axios|rapidapi|api-football|football-data|sportmonks|statsbomb|opta|wyscout/i.test(apiTeamFormText), 'Team form API endpoint must not mention an external supplier.')
assert(!/process\.env|import\.meta\.env|API_KEY|TOKEN|SECRET|X-Auth-Token/i.test(apiTeamFormText), 'Team form API endpoint must not read provider credentials.')
assert(!new RegExp(`${databaseUrlToken}|@neondatabase|SNAPSHOT_WRITE|internal/snapshots|analysis_snapshots`, 'i').test(apiTeamFormText), 'Team form API endpoint must not touch database or snapshot writes.')
assert(!/openai|\bgpt\b/i.test(apiTeamFormText), 'Team form API endpoint must not mention OpenAI or GPT.')

for (const path of [matchApiPath, appPath, betEnginePath, apiMatchesPath, apiTeamFormPath, packagePath]) {
  const status = git(['status', '--short', '--', path])
  assert(!status, `${path} must not be modified.`)
}

const packageJson = JSON.parse(packageText)
const dependencies = {
  ...(packageJson.dependencies ?? {}),
  ...(packageJson.devDependencies ?? {}),
}

assert(!Object.prototype.hasOwnProperty.call(dependencies, 'axios'), 'package.json must not add axios.')
assert(!Object.prototype.hasOwnProperty.call(dependencies, 'openai'), 'package.json must not add openai.')

console.log('Match team form integration checks passed.')
