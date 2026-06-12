import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

import {
  buildPosterPresentation,
  buildPresentationRating,
  buildScoreRecommendation,
  deriveTotalGoalsText,
  parseScoreText,
} from '../src/services/posterPresentation.js'
import {
  buildRecommendationShareText,
  buildShareMatchPayload,
} from '../src/services/shareText.js'

const FORBIDDEN_WORDS = [
  '风险等级',
  '风险偏高',
  '策略建议',
  '谨慎观望',
  '风险指数',
  'riskLabel',
  '后台',
  '内部下注',
  '胜率',
  '稳赚',
  '必中',
  '保证命中',
  '内幕',
  'stake',
  'bankroll',
  'totalStake',
  'OpenAI',
  'GPT',
  '实时天气',
]

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function gitStatusFor(paths) {
  return execSync(`git status --short -- ${paths.join(' ')}`, {
    encoding: 'utf8',
  }).trim()
}

function chineseLength(text) {
  return Array.from(String(text ?? '')).filter((char) => /[\u4e00-\u9fff]/.test(char)).length
}

function assertNoForbidden(text, label) {
  for (const word of FORBIDDEN_WORDS) {
    assert(!String(text).includes(word), `${label} must not include forbidden word "${word}".`)
  }
}

function assertNoEllipsis(text, label) {
  assert(!/[.。]{3}|…/.test(String(text)), `${label} must not include ellipsis truncation.`)
}

function outcome(score) {
  return parseScoreText(score)?.outcome
}

function total(score) {
  return parseScoreText(score)?.total
}

function assertScoresDistinct(poster) {
  assert(
    poster.primaryScoreValue !== poster.secondaryScoreValue,
    'Primary and backup scores must not repeat.',
  )
}

function assertGoalsConsistent(poster) {
  const expected = deriveTotalGoalsText(poster.primaryScoreValue, poster.secondaryScoreValue)
  assert(
    poster.totalGoalsValue === expected,
    `Total goals text must be derived from scores. Expected "${expected}", got "${poster.totalGoalsValue}".`,
  )
  assert(
    poster.totalGoalsShortText === `总进球：${expected}`,
    `Total goals short text must use compact copy. Expected "总进球：${expected}", got "${poster.totalGoalsShortText}".`,
  )
  assert(poster.totalGoalsShortText.length <= 12, 'Total goals short text must stay compact.')
  assertNoEllipsis(poster.totalGoalsShortText, 'totalGoalsShortText')
  const totals = [total(poster.primaryScoreValue), total(poster.secondaryScoreValue)]
  assert(
    !(totals.every((value) => value <= 1) && poster.totalGoalsValue.includes('2-3')),
    'Low-score combinations must not show a 2-3 goals range.',
  )
}

function assertDirectionConsistent(poster) {
  const primaryOutcome = outcome(poster.primaryScoreValue)
  const secondaryOutcome = outcome(poster.secondaryScoreValue)

  if (poster.directionKind === 'home') {
    assert(primaryOutcome !== 'away', 'Home-side direction must not use an away-win primary score.')
    assert(secondaryOutcome !== 'away', 'Home-side direction must not use an away-win backup score.')
  }

  if (poster.directionKind === 'away') {
    assert(primaryOutcome !== 'home', 'Away-side direction must not use a home-win primary score.')
    assert(secondaryOutcome !== 'home', 'Away-side direction must not use a home-win backup score.')
  }

  if (poster.directionKind === 'draw') {
    assert(
      [primaryOutcome, secondaryOutcome].includes('draw'),
      'Draw direction must include at least one draw score.',
    )
  }
}

function assertPosterFields(poster, label) {
  for (const field of [
    'posterTitle',
    'posterSubtitle',
    'posterKicker',
    'matchTimeText',
    'statusText',
    'homeTeamText',
    'awayTeamText',
    'mainConclusion',
    'supportConclusion',
    'primaryScoreText',
    'secondaryScoreText',
    'totalGoalsText',
    'modelInsight',
    'lineupInsight',
    'lineupInsightShort',
    'modelInsightShort',
    'oneLineSummary',
    'oneLineSummaryShort',
    'footerNote',
    'totalGoalsShortText',
  ]) {
    assert(poster[field], `${label}: ${field} must not be empty.`)
  }

  assert(chineseLength(poster.modelInsightShort) >= 35, `${label}: modelInsightShort must be at least 35 Chinese chars.`)
  assert(chineseLength(poster.modelInsightShort) <= 55, `${label}: modelInsightShort must be at most 55 Chinese chars.`)
  assert(chineseLength(poster.lineupInsightShort) >= 25, `${label}: lineupInsightShort must be at least 25 Chinese chars.`)
  assert(chineseLength(poster.lineupInsightShort) <= 45, `${label}: lineupInsightShort must be at most 45 Chinese chars.`)
  assert(chineseLength(poster.oneLineSummaryShort) >= 20, `${label}: oneLineSummaryShort must be at least 20 Chinese chars.`)
  assert(chineseLength(poster.oneLineSummaryShort) <= 35, `${label}: oneLineSummaryShort must be at most 35 Chinese chars.`)
  assertNoEllipsis(JSON.stringify(poster), label)
  assertNoForbidden(JSON.stringify(poster), label)
  assertScoresDistinct(poster)
  assertGoalsConsistent(poster)
  assertDirectionConsistent(poster)
}

const lowRating = buildPresentationRating({ rawScore: 9, riskTone: 'high' })
assert(lowRating.rawScore === 9, 'rawScore input must be preserved.')
assert(lowRating.shouldHighlightScore === false, 'Low score must not highlight an extreme score.')
assert(!JSON.stringify(lowRating).includes('9/100'), 'Low score must not render 9/100 as headline text.')

const highRating = buildPresentationRating({ rawScore: 88, riskTone: 'low' })
assert(highRating.scoreMode === 'score', 'High score match must support score mode.')
assert(highRating.displayScore <= 92, 'Presentation score cap must not exceed 92.')

assert(
  buildScoreRecommendation(['0-0', '0-0'], { directionKind: 'draw' }).primaryScore !==
    buildScoreRecommendation(['0-0', '0-0'], { directionKind: 'draw' }).secondaryScore,
  'Duplicate raw scores must be separated in presentation.',
)

const lowPoster = buildPosterPresentation({
  awayTeam: '波黑',
  displayConfidence: 9,
  homeTeam: '加拿大',
  isCautious: true,
  kickoff: '北京时间 06/13 03:00',
  lineupStatusText: '首发待确认',
  mainDirection: '平局需防',
  rawScore: 9,
  scorePredictions: ['1-1', '0-0'],
  statusTags: ['当前重点', '即将开始', '临场复核'],
  totalGoalsDirection: '2-3球区间',
})
assertPosterFields(lowPoster, 'lowPoster')
assert(lowPoster.mainConclusion.includes('加拿大不败'), 'Weak draw copy must become a clearer main direction.')
assert(!lowPoster.totalGoalsText.includes('2-3球区间'), '1-1 / 0-0 must not display 2-3 goals.')

const oldCautiousPoster = buildPosterPresentation({
  awayTeam: '荷兰',
  homeTeam: '英格兰',
  kickoff: '北京时间 06/18 16:00',
  lineupStatusText: '首发待确认',
  mainDirection: ['谨慎', '观望'].join(''),
  scorePredictions: ['1-1', '0-0'],
  totalGoalsDirection: '2-3球区间',
})
assertPosterFields(oldCautiousPoster, 'oldCautiousPoster')
assert(
  oldCautiousPoster.mainConclusion.includes('平局优先'),
  'Old cautious main copy must become a clearer poster direction.',
)

const homeConflictPoster = buildPosterPresentation({
  awayTeam: '客队',
  homeTeam: '主队',
  kickoff: '北京时间 06/13 18:00',
  lineupStatusText: '官方首发',
  mainDirection: '主队不败',
  scorePredictions: ['0-2', '1-2'],
  statusTags: ['当前重点'],
  totalGoalsDirection: '3球以上',
})
assertPosterFields(homeConflictPoster, 'homeConflictPoster')

const awayConflictPoster = buildPosterPresentation({
  awayTeam: '客队',
  homeTeam: '主队',
  kickoff: '北京时间 06/13 20:00',
  lineupStatusText: '官方首发',
  mainDirection: '客队不败',
  scorePredictions: ['2-0', '2-1'],
  statusTags: ['当前重点'],
  totalGoalsDirection: '2-3球区间',
})
assertPosterFields(awayConflictPoster, 'awayConflictPoster')

const fallbackPoster = buildPosterPresentation()
assertPosterFields(fallbackPoster, 'fallbackPoster')

const sharePayload = buildShareMatchPayload({
  awayTeam: '波黑',
  homeTeam: '加拿大',
  kickoff: '北京时间 06/13 03:00',
  lineupStatus: 'predicted',
  mainDirection: '平局需防',
  scorePredictions: ['1-1', '0-0'],
  totalGoalsDirection: '2-3球区间',
})
const shareText = buildRecommendationShareText(sharePayload)
assert(shareText.includes('【AI赛前情报】'), 'Share text must use the sports-cover title.')
assert(shareText.includes('主推比分：'), 'Share text must include primary score.')
assert(shareText.includes('备用比分：'), 'Share text must include backup score.')
assert(shareText.includes('总进球：'), 'Share text must include compact total goals judgement.')
assert(shareText.includes('一句话：'), 'Share text must include a short one-line summary.')
assertNoEllipsis(shareText, 'shareText')
assertNoForbidden(shareText, 'shareText')

const serviceText = [
  readFileSync('src/services/sharePoster.js', 'utf8'),
  readFileSync('src/services/shareText.js', 'utf8'),
].join('\n')
assert(!serviceText.includes('辅推比分'), 'Poster and share text must use backup score copy.')
assert(!serviceText.includes('风险等级'), 'Poster and share text must not show report-style risk labels.')

const protectedStatus = gitStatusFor([
  'src/services/betEngine.js',
  'src/services/matchApi.js',
  'src/services/matchFocus.js',
  'src/services/displayConfidence.js',
  'src/services/aiAnalysisApi.js',
  'src/services/aiAnalysisPayload.js',
  'src/data',
  'api',
  'vercel.json',
  'package.json',
  'package-lock.json',
])
assert(!protectedStatus, `Protected files must not be modified:\n${protectedStatus}`)

console.log('Poster presentation checks passed.')
