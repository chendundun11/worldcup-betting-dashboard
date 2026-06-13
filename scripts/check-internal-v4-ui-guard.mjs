import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const appSource = readFileSync('src/App.jsx', 'utf8')
const componentSource = readFileSync('src/components/InternalCommandCenterV4.jsx', 'utf8')
const typeSource = readFileSync('src/internal/v4/internalTypesV4.js', 'utf8')
const internalSource = `${componentSource}\n${typeSource}`

assert.match(appSource, /InternalCommandCenterV4/)
assert.match(appSource, /#internal-v4/)
assert.match(appSource, /params\.get\('internal'\)\s*===\s*'v4'/)
assert.doesNotMatch(appSource, /InternalV3Panel/)
assert.doesNotMatch(appSource, /href=["']#internal-v4["']/)
assert.doesNotMatch(appSource, /V4 内部指挥台/)
assert.doesNotMatch(appSource, /内部资金池/)
assert.doesNotMatch(appSource, /模拟资金分配/)

for (const text of [
  'V4 内部指挥台',
  '内部资金池',
  '当前比赛 V4 内部判断',
  '模拟资金分配',
  '主方向投入',
  '主推比分投入',
  '备用比分投入',
  '大小球投入',
  '一致性检查',
  '实际比分输入框',
  '结算本场',
  '最近复盘记录',
  'reset',
]) {
  assert.match(internalSource, new RegExp(text))
}

const forbiddenDiffFiles = [
  'src/services/betEngine.js',
  'src/services/sharePoster.js',
  'src/services/shareText.js',
  'src/services/posterPresentation.js',
  'src/services/displayConfidence.js',
  'src/services/matchApi.js',
  'src/services/matchFocus.js',
  'src/services/aiAnalysisApi.js',
  'src/services/aiAnalysisPayload.js',
  'api/internal/snapshots.js',
  'vercel.json',
  'package.json',
  'package-lock.json',
]

const changedFiles = execFileSync('git', ['diff', '--name-only'], {
  encoding: 'utf8',
})
  .split(/\r?\n/)
  .filter(Boolean)

for (const file of changedFiles) {
  assert.equal(
    forbiddenDiffFiles.includes(file) || file.startsWith('src/data/') || file.startsWith('api/'),
    false,
    `forbidden file changed: ${file}`,
  )
}

console.log('check-internal-v4-ui-guard: ok')
