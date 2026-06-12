import { readFileSync } from 'node:fs'

import {
  getDisplayConfidence,
  getDisplayConfidenceTier,
} from '../src/services/displayConfidence.js'

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

const rawScore = 62
const rawHolder = { rawScore }
const displayConfidence = getDisplayConfidence(rawHolder.rawScore)

assert(rawHolder.rawScore === rawScore, 'rawScore must not be modified.')
assert(
  [0, 49, 50, 54, 55, 59, 60, 64, 65, 69, 70, 74, 75, 82, 100].every(
    (score) => getDisplayConfidence(score) <= 92,
  ),
  'displayConfidence must not exceed 92.',
)
assert(
  [60, 61, 62, 63, 64].every((score) => {
    const value = getDisplayConfidence(score)
    return value >= 70 && value <= 74
  }),
  'rawScore 60-64 must display in 70-74 range.',
)
assert(
  [65, 66, 67, 68, 69].every((score) => {
    const value = getDisplayConfidence(score)
    return value >= 75 && value <= 80
  }),
  'rawScore 65-69 must display in 75-80 range.',
)
assert(
  getDisplayConfidenceTier(82).label === '重点关注' &&
    getDisplayConfidenceTier(74).label === '稳健参考' &&
    getDisplayConfidenceTier(66).label === '轻仓娱乐' &&
    getDisplayConfidenceTier(58).label === '谨慎观望',
  'displayConfidence tiers must match the V2 labels.',
)

const publicText = [
  readFileSync('src/App.jsx', 'utf8'),
  readFileSync('src/App.css', 'utf8'),
  readFileSync('src/services/displayConfidence.js', 'utf8'),
].join('\n')

assert(!/胜率|稳赢概率|必中概率/.test(publicText), 'displayConfidence must not be shown as a win rate.')
assert(!/必中|稳赚|保证命中/.test(publicText), 'Forbidden promise copy must not appear.')

console.log('Display confidence checks passed.')
