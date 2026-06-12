import { execSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'

const appPath = 'src/App.jsx'
const cssPath = 'src/App.css'
const shareTextPath = 'src/services/shareText.js'
const sharePosterPath = 'src/services/sharePoster.js'

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

const appText = readText(appPath)
const cssText = readText(cssPath)
const shareText = readText(shareTextPath)
const sharePosterText = readText(sharePosterPath)
const shareFeatureText = [appText, cssText, shareText, sharePosterText].join('\n')
const shareServiceText = [shareText, sharePosterText].join('\n')

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
  /navigator\.clipboard\?\.writeText/.test(appText) &&
    /document\.execCommand\(['"]copy['"]\)/.test(appText),
  'Text copy must use Clipboard API with textarea fallback.',
)
assert(
  /ClipboardItem/.test(sharePosterText) &&
    /当前浏览器不支持直接复制图片，请下载后分享。/.test(shareFeatureText),
  'Image copy must include ClipboardItem support detection and fallback copy.',
)
assert(
  /safeShareText/.test(shareText) &&
    /formatShareConfidence/.test(shareText) &&
    /formatShareScores/.test(shareText) &&
    /formatShareLineupStatus/.test(shareText),
  'Share text must normalize missing fields before display or copy.',
)

for (const forbiddenField of ['stake', 'bankroll', 'totalStake']) {
  assert(
    !new RegExp(`\\b${forbiddenField}\\b`, 'i').test(shareServiceText),
    `Share services must not expose ${forbiddenField}.`,
  )
}

for (const forbiddenCopy of ['稳赚', '必中', '保证命中', '内幕']) {
  assert(
    !shareFeatureText.includes(forbiddenCopy),
    `Share feature must not include forbidden copy "${forbiddenCopy}".`,
  )
}

assert(
  !/(OpenAI|GPT).*(已启用|启用|已接入)/i.test(shareFeatureText),
  'Share feature must not claim OpenAI / GPT is enabled.',
)
assert(
  !/实时天气.*(已接入|接入)/.test(shareFeatureText),
  'Share feature must not claim real-time weather is connected.',
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

const protectedStatus = gitStatusFor([
  'src/services/betEngine.js',
  'src/services/matchFocus.js',
  'src/services/displayConfidence.js',
  'src/services/onboardingNotice.js',
  'src/services/predictionSettlement.js',
  'src/services/matchIdentity.js',
  'src/data/betHistory.json',
  'src/data/manualLineups.js',
  'api',
  'vercel.json',
])
assert(!protectedStatus, `Protected files must not be modified:\n${protectedStatus}`)

const packageStatus = gitStatusFor(['package.json', 'package-lock.json'])
assert(!packageStatus, `npm dependencies must not change:\n${packageStatus}`)

console.log('Share poster checks passed.')
