import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import buildBetPlan from '../src/services/betEngine.js'

function scoreTotal(score) {
  return String(score)
    .split('-')
    .map((part) => Number(part))
    .reduce((sum, value) => sum + value, 0)
}

function enrichMatch(match, teamMap) {
  return {
    ...match,
    homeTeam: teamMap.get(match.homeTeamId),
    awayTeam: teamMap.get(match.awayTeamId),
  }
}

const appText = readFileSync('src/App.jsx', 'utf8')
const appCss = readFileSync('src/App.css', 'utf8')
const matchData = JSON.parse(readFileSync('src/data/matches.json', 'utf8'))
const teamData = JSON.parse(readFileSync('src/data/teams.json', 'utf8'))
const teamMap = new Map(teamData.teams.map((team) => [team.id, team]))
const forbiddenPublicCopy = /主推比分|辅推比分|主推\s*\/\s*辅推|备用比分/
const sensitivePublicModelFields =
  /stake|bankroll|profit|ledger|pendingExposure|settledProfit|内部资金|模拟资金|本场投入|账本/i

assert(appText.includes('quant-score-public-panel'), 'Public page must render quant score panel.')
assert(appText.includes('公开方向保持谨慎'), 'Cautious public copy must explain score candidates.')
assert(!forbiddenPublicCopy.test(appText), 'Public copy must use candidate score wording.')
assert(appCss.includes('.quant-score-public-panel'), 'Quant public panel styles must exist.')
assert(
  /\.main-layout\s*{[^}]*display:\s*flex;[^}]*flex-direction:\s*column;/s.test(appCss),
  'Mobile main layout must allow focus content to appear before the schedule.',
)

const allPublicScores = []

for (const match of matchData.matches.map((item) => enrichMatch(item, teamMap))) {
  const plan = buildBetPlan(match, { bankroll: 0, maxStakePerMatch: 0 })
  const publicModel = plan.publicScoreModel

  assert.equal(publicModel?.version, 'quant-score-v1', `${plan.matchName} must expose quant score model.`)
  assert.equal(
    publicModel.candidates.length >= 4,
    true,
    `${plan.matchName} must expose at least four public score candidates.`,
  )
  assert.equal(
    plan.scorePicks[0]?.score,
    publicModel.primaryScore,
    `${plan.matchName} score pick must match public model primary score.`,
  )
  assert.equal(
    plan.scorePicks[1]?.score,
    publicModel.secondaryScore,
    `${plan.matchName} score pick must match public model secondary score.`,
  )
  assert.equal(
    sensitivePublicModelFields.test(JSON.stringify(publicModel)),
    false,
    `${plan.matchName} public score model must not expose internal money or ledger fields.`,
  )
  for (const candidate of publicModel.candidates) {
    assert.equal(
      Number.isFinite(candidate.total),
      true,
      `${plan.matchName} public score candidate ${candidate.score} must include total goals.`,
    )
    assert.match(
      candidate.outcome,
      /^(home|draw|away)$/,
      `${plan.matchName} public score candidate ${candidate.score} must include outcome.`,
    )
  }

  allPublicScores.push(...publicModel.candidates.map((candidate) => candidate.score))
}

assert.equal(new Set(allPublicScores).size >= 7, true, 'Public candidate scores must stay diverse.')
assert.equal(
  allPublicScores.some((score) => scoreTotal(score) >= 3),
  true,
  'Public candidates must include higher-goal paths when the model supports them.',
)

console.log('check-public-quant-ui: ok')
