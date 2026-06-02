import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'

const matchApiPath = 'src/services/matchApi.js'
const appPath = 'src/App.jsx'
const betEnginePath = 'src/services/betEngine.js'
const apiMatchesPath = 'api/matches.js'
const apiOddsPath = 'api/odds.js'
const packagePath = 'package.json'

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
  apiOddsPath,
  packagePath,
]) {
  assert(existsSync(path), `${path} must exist.`)
}

const matchApiText = readText(matchApiPath)
const appText = readText(appPath)
const betEngineText = readText(betEnginePath)
const packageText = readText(packagePath)

assert(matchApiText.includes("import { getOddsSnapshot } from './oddsApi'"), 'matchApi must import getOddsSnapshot from oddsApi.')
assert(matchApiText.includes("import { mergeOddsIntoMatches } from './oddsMerge'"), 'matchApi must import mergeOddsIntoMatches from oddsMerge.')
assert(!/fetch\s*\(/.test(matchApiText), 'matchApi must not fetch odds directly.')
assert(!/['"]\/api\/odds['"]/.test(matchApiText), 'matchApi must not reference /api/odds directly.')
assert(/async function attachRemoteOdds/.test(matchApiText), 'matchApi must isolate odds attachment in attachRemoteOdds.')
assert(/try\s*{[\s\S]*getOddsSnapshot\(\)[\s\S]*mergeOddsIntoMatches\([\s\S]*catch/.test(matchApiText), 'matchApi odds attachment must be guarded by try/catch.')
assert(/catch\s*\([^)]*\)\s*{[\s\S]*return snapshot/.test(matchApiText), 'matchApi must return the original snapshot when odds attachment fails.')
assert(matchApiText.includes('oddsMeta'), 'matchApi must expose oddsMeta when odds attachment completes.')
assert(matchApiText.includes('matches: mergedMatches'), 'matchApi must return merged matches only through the helper result.')

const attachRemoteOddsBlock = matchApiText.match(/async function attachRemoteOdds[\s\S]*?\n}\n\nexport function getInitialMatchSnapshot/)
assert(attachRemoteOddsBlock, 'matchApi must keep attachRemoteOdds near the public functions.')
assert(!/\bdataSource\s*:/.test(attachRemoteOddsBlock[0]), 'attachRemoteOdds must not overwrite snapshot.dataSource.')
assert(!/\bprovider\s*:/.test(attachRemoteOddsBlock[0]), 'attachRemoteOdds must not overwrite snapshot.provider.')

for (const field of [
  'odds',
  'localOdds',
  'recommendation',
  'scoreReference',
  'totalGoalsDirection',
]) {
  assert(!new RegExp(`\\b${field}\\s*:`).test(matchApiText), `matchApi must not assign match.${field}.`)
  assert(!new RegExp(`\\.${field}\\s*=`).test(matchApiText), `matchApi must not mutate match.${field}.`)
}

assert(!/remoteOdds/.test(appText), 'App.jsx must not read remoteOdds.')
assert(!/remoteOdds/.test(betEngineText), 'BetEngine must not read remoteOdds.')
assert(!/oddsMeta/.test(appText), 'App.jsx must not read oddsMeta.')
assert(!/oddsMeta/.test(betEngineText), 'BetEngine must not read oddsMeta.')

for (const path of [matchApiPath, appPath, betEnginePath, apiMatchesPath, packagePath]) {
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

console.log('Match odds integration checks passed.')
