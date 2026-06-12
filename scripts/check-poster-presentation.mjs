import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

import {
  buildPresentationRating,
  buildScoreRecommendation,
  formatGoalsDirectionForPresentation,
  formatMainDirectionForPresentation,
} from '../src/services/posterPresentation.js'

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function gitStatusFor(paths) {
  return execSync(`git status --short -- ${paths.join(' ')}`, {
    encoding: 'utf8',
  }).trim()
}

const rawHolder = { rawScore: 9 }
const lowRating = buildPresentationRating({
  rawScore: rawHolder.rawScore,
  riskTone: 'high',
})
const highRating = buildPresentationRating({
  rawScore: 88,
  riskTone: 'low',
})
const cappedRating = buildPresentationRating({
  rawScore: 100,
  riskTone: 'low',
})
const scorePair = buildScoreRecommendation(['1-1', '0-0'])
const singleScorePair = buildScoreRecommendation(['2-1'])

assert(rawHolder.rawScore === 9, 'rawScore input must not be modified.')
assert(lowRating.rawScore === 9, 'Presentation rating must preserve rawScore.')
assert(lowRating.scoreMode === 'risk', 'Low score match must be allowed to use risk mode.')
assert(
  lowRating.shouldHighlightScore === false,
  'Low score match must not highlight an extreme low score.',
)
assert(highRating.scoreMode === 'score', 'High score match must support score mode.')
assert(cappedRating.displayScore <= 92, 'Presentation score cap must not exceed 92.')
assert(!/胜率|命中率/.test(JSON.stringify(highRating)), 'Rating copy must not be written as a rate.')
assert(scorePair.primaryScore === '1-1', 'Primary score must use the first score.')
assert(scorePair.secondaryScore === '0-0', 'Secondary score must use the second score.')
assert(singleScorePair.secondaryScore === '待补充', 'Missing secondary score must be guarded.')
assert(
  formatMainDirectionForPresentation('平局防范更重要') === '平局需防',
  'Main direction copy must be decisive.',
)
assert(
  formatGoalsDirectionForPresentation('2.5球以下倾向') === '小 2.5方向',
  'Goals direction copy must be natural.',
)

const publicText = [
  readFileSync('src/services/posterPresentation.js', 'utf8'),
  readFileSync('src/services/shareText.js', 'utf8'),
  readFileSync('src/services/sharePoster.js', 'utf8'),
].join('\n')

assert(!/胜率|稳赢概率|必中概率/.test(publicText), 'Presentation layer must not claim a win rate.')
assert(!/稳赚|必中|保证命中|内幕/.test(publicText), 'Forbidden promise copy must not appear.')
assert(!/(OpenAI|GPT).*(已启用|启用|已接入)/i.test(publicText), 'Presentation layer must not claim OpenAI / GPT is enabled.')
assert(!/实时天气.*(已接入|接入)/.test(publicText), 'Presentation layer must not claim real-time weather is connected.')

const protectedStatus = gitStatusFor([
  'src/services/betEngine.js',
  'api',
])
assert(!protectedStatus, `BetEngine and API must not be modified:\n${protectedStatus}`)

console.log('Poster presentation checks passed.')
