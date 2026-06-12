import { execSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'

import {
  buildRecommendationShareText,
  buildShareMatchPayload,
} from '../src/services/shareText.js'
import {
  buildPosterPresentation,
  deriveTotalGoalsText,
  parseScoreText,
} from '../src/services/posterPresentation.js'

const appPath = 'src/App.jsx'
const cssPath = 'src/App.css'
const shareTextPath = 'src/services/shareText.js'
const sharePosterPath = 'src/services/sharePoster.js'
const posterPresentationPath = 'src/services/posterPresentation.js'

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

function readText(path) {
  assert(existsSync(path), `${path} must exist.`)
  return readFileSync(path, 'utf8')
}

function gitStatusFor(paths) {
  return execSync(`git status --short -- ${paths.join(' ')}`, {
    encoding: 'utf8',
  }).trim()
}

function assertNoForbidden(text, label) {
  for (const word of FORBIDDEN_WORDS) {
    assert(!String(text).includes(word), `${label} must not include "${word}".`)
  }
}

function assertNoEllipsis(text, label) {
  assert(!/[.。]{3}|…/.test(String(text)), `${label} must not include ellipsis truncation.`)
}

function scoreOutcome(score) {
  return parseScoreText(score)?.outcome
}

function assertPosterConsistency(poster, label) {
  assert(poster.primaryScoreValue, `${label}: primary score must exist.`)
  assert(poster.secondaryScoreValue, `${label}: backup score must exist.`)
  assert(
    poster.primaryScoreValue !== poster.secondaryScoreValue,
    `${label}: primary and backup scores must not repeat.`,
  )
  assert(
    poster.totalGoalsValue ===
      deriveTotalGoalsText(poster.primaryScoreValue, poster.secondaryScoreValue),
    `${label}: total goals text must be derived from displayed scores.`,
  )
  assert(
    poster.totalGoalsShortText === `总进球：${poster.totalGoalsValue}`,
    `${label}: compact total goals text must be available.`,
  )
  assert(poster.totalGoalsShortText.length <= 12, `${label}: total goals copy must stay short.`)
  assertNoEllipsis(poster.totalGoalsShortText, `${label}: total goals copy`)

  const primaryOutcome = scoreOutcome(poster.primaryScoreValue)
  const secondaryOutcome = scoreOutcome(poster.secondaryScoreValue)
  if (poster.directionKind === 'home') {
    assert(primaryOutcome !== 'away', `${label}: home direction cannot lead with away win.`)
    assert(secondaryOutcome !== 'away', `${label}: home direction cannot back up with away win.`)
  }
  if (poster.directionKind === 'away') {
    assert(primaryOutcome !== 'home', `${label}: away direction cannot lead with home win.`)
    assert(secondaryOutcome !== 'home', `${label}: away direction cannot back up with home win.`)
  }
  if (poster.directionKind === 'draw') {
    assert(
      [primaryOutcome, secondaryOutcome].includes('draw'),
      `${label}: draw direction must include at least one draw score.`,
    )
  }
}

const appText = readText(appPath)
const cssText = readText(cssPath)
const shareText = readText(shareTextPath)
const sharePosterText = readText(sharePosterPath)
const posterPresentationText = readText(posterPresentationPath)
const shareFeatureText = [
  appText,
  cssText,
  shareText,
  sharePosterText,
  posterPresentationText,
].join('\n')
const shareOutputSource = [shareText, sharePosterText].join('\n')

for (const copy of ['一键复制文案', '生成分享海报', '下载海报', '复制图片']) {
  assert(shareFeatureText.includes(copy), `Share UI must include "${copy}".`)
}

assert(
  /POSTER_WIDTH\s*=\s*1080/.test(sharePosterText) &&
    /POSTER_HEIGHT\s*=\s*1350/.test(sharePosterText),
  'Poster size must be configured as 1080 x 1350.',
)
assert(
  /document\.createElement\(['"]canvas['"]\)/.test(sharePosterText) &&
    /getContext\(['"]2d['"]\)/.test(sharePosterText),
  'Poster generation must use native Canvas.',
)
assert(
  /createLinearGradient/.test(sharePosterText) &&
    /createRadialGradient/.test(sharePosterText) &&
    /VS/.test(sharePosterText),
  'Poster canvas must render a sports-cover background and central VS visual.',
)
assert(
  !/MATCH COVER|HOME|AWAY/.test(sharePosterText),
  'Poster canvas must remove or strongly avoid nonessential English decorations.',
)
assert(
  /drawMatchVisual/.test(sharePosterText) &&
    /drawConclusion/.test(sharePosterText) &&
    /drawScoreboard/.test(sharePosterText) &&
    /drawInsightBlock/.test(sharePosterText),
  'Poster canvas must keep match, conclusion, score, and insight sections.',
)
assert(
  /navigator\.clipboard\?\.writeText/.test(appText) &&
    /document\.execCommand\(['"]copy['"]\)/.test(appText),
  'Text copy must use Clipboard API with textarea fallback.',
)
assert(
  /ClipboardItem/.test(sharePosterText) &&
    shareFeatureText.includes('当前浏览器不支持直接复制图片，请下载后分享。'),
  'Image copy must include ClipboardItem support detection and fallback copy.',
)
assert(
  /safeShareText/.test(shareText) &&
    /formatShareScorePair/.test(shareText) &&
    /formatShareLineupStatus/.test(shareText),
  'Share text must normalize missing fields before display or copy.',
)
for (const copy of [
  'AI赛前情报',
  '逐场情报解读',
  '赛前结论',
  '主推比分',
  '备用比分',
  '总进球判断',
  '模型解读',
  '首发观察',
  '一句话',
]) {
  assert(shareFeatureText.includes(copy), `Share feature must include "${copy}".`)
}
assert(
  !shareOutputSource.includes('辅推比分') &&
    !shareOutputSource.includes('进球方向') &&
    !/比分参考：\$\{[^}]+scorePredictionsText[^}]*\}/.test(shareText),
  'Share output must use V2.2.2 primary/backup score and total-goals structure.',
)
assert(
  /buildPosterPresentation/.test(posterPresentationText) &&
    /deriveTotalGoalsText/.test(posterPresentationText) &&
    /buildScoreRecommendation/.test(posterPresentationText) &&
    /posterTitle/.test(posterPresentationText) &&
    /modelInsight/.test(posterPresentationText) &&
    /lineupInsight/.test(posterPresentationText),
  'Poster presentation must expose complete sports-cover fields.',
)
assert(
  /primaryScoreValue/.test(sharePosterText) &&
    /secondaryScoreValue/.test(sharePosterText) &&
    /totalGoalsValue/.test(sharePosterText) &&
    /drawSharePoster/.test(sharePosterText),
  'Poster canvas must draw primary score, backup score, and derived total goals.',
)
assert(
  /link\.download/.test(sharePosterText) &&
    /image\/png/.test(sharePosterText) &&
    /\.png/.test(sharePosterText),
  'Poster download must create a PNG download.',
)
assert(
  /handleCloseSharePoster/.test(appText) &&
    /setIsPosterModalOpen\(false\)/.test(appText) &&
    shareFeatureText.includes('关闭'),
  'Poster modal must include close logic.',
)
assert(
  /copyPosterImage/.test(appText) &&
    /downloadSharePoster/.test(appText) &&
    /createSharePosterPng/.test(appText),
  'App must wire poster generation, image copy, and download.',
)

const samplePoster = buildPosterPresentation({
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
assertPosterConsistency(samplePoster, 'samplePoster')
assert(samplePoster.posterTitle === 'AI赛前情报', 'Poster title must use sports-cover copy.')
assert(samplePoster.posterSubtitle === '逐场情报解读', 'Poster subtitle must use compact sports-cover copy.')
assert(samplePoster.mainConclusion.includes('主方向：'), 'Poster must expose a clear main direction.')
assert(samplePoster.primaryScoreText.includes('主推比分：'), 'Poster must expose primary score text.')
assert(samplePoster.secondaryScoreText.includes('备用比分：'), 'Poster must expose backup score text.')
assert(samplePoster.totalGoalsText.includes('总进球：'), 'Poster must expose compact total goals text.')
assert(samplePoster.totalGoalsShortText === '总进球：0-2球', '1-1 / 0-0 must use compact 0-2 goals copy.')
assert(samplePoster.modelInsightShort, 'Poster must expose modelInsightShort.')
assert(samplePoster.lineupInsightShort, 'Poster must expose lineupInsightShort.')
assert(samplePoster.oneLineSummaryShort, 'Poster must expose oneLineSummaryShort.')
assert(!JSON.stringify(samplePoster).includes('9/100'), 'Low score must not become headline copy.')
assertNoEllipsis(JSON.stringify(samplePoster), 'poster output')
assertNoForbidden(JSON.stringify(samplePoster), 'poster output')

const cautiousPoster = buildPosterPresentation({
  awayTeam: '荷兰',
  homeTeam: '英格兰',
  kickoff: '北京时间 06/18 16:00',
  lineupStatusText: '首发待确认',
  mainDirection: ['谨慎', '观望'].join(''),
  scorePredictions: ['1-1', '0-0'],
  totalGoalsDirection: '2-3球区间',
})
assertPosterConsistency(cautiousPoster, 'cautiousPoster')
assertNoForbidden(JSON.stringify(cautiousPoster), 'cautious poster output')

const sharePayload = buildShareMatchPayload({
  awayTeam: '波黑',
  homeTeam: '加拿大',
  kickoff: '北京时间 06/13 03:00',
  lineupStatus: 'predicted',
  mainDirection: '平局需防',
  rawScore: 9,
  scorePredictions: ['1-1', '0-0'],
  totalGoalsDirection: '2-3球区间',
})
const shareCopy = buildRecommendationShareText(sharePayload)
assert(shareCopy.includes('【AI赛前情报】'), 'Share copy must use the sports-cover title.')
assert(shareCopy.includes('主方向：'), 'Share copy must include main direction.')
assert(shareCopy.includes('主推比分：'), 'Share copy must include primary score.')
assert(shareCopy.includes('备用比分：'), 'Share copy must include backup score.')
assert(shareCopy.includes('总进球：'), 'Share copy must include compact total goals judgement.')
assert(shareCopy.includes('模型解读：'), 'Share copy must include model insight.')
assert(shareCopy.includes('首发观察：'), 'Share copy must include lineup insight.')
assert(shareCopy.includes('一句话：'), 'Share copy must include one-line summary.')
assertNoEllipsis(shareCopy, 'share copy')
assertNoForbidden(shareCopy, 'share copy')

for (const word of FORBIDDEN_WORDS) {
  assert(
    !shareOutputSource.includes(word),
    `Share poster/text source must not include forbidden output word "${word}".`,
  )
}

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

console.log('Share poster checks passed.')
