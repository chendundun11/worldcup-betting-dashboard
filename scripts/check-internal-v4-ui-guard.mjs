import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const appSource = readFileSync('src/App.jsx', 'utf8')
const componentSource = readFileSync('src/components/InternalCommandCenterV4.jsx', 'utf8')
const cssSource = readFileSync('src/components/InternalCommandCenterV4.css', 'utf8')
const typeSource = readFileSync('src/internal/v4/internalTypesV4.js', 'utf8')
const ledgerSource = readFileSync('src/internal/v4/internalLedgerV4.js', 'utf8')
const combinedInternalSource = `${componentSource}\n${cssSource}\n${typeSource}\n${ledgerSource}`

assert.match(appSource, /InternalCommandCenterV4/)
assert.match(appSource, /function isInternalV4RouteActive\(\)/)
assert.match(appSource, /window\.location\.hash\s*===\s*['"]#internal-v4['"]/)
assert.match(appSource, /params\.get\(['"]internal['"]\)\s*===\s*['"]v4['"]/)
assert.match(appSource, /if \(isInternalV4Route\) \{/)
assert.doesNotMatch(appSource, /href=["']#internal-v4["']/)
assert.doesNotMatch(appSource, /InternalV3Panel/)

for (const text of [
  'V5 内部资金引擎',
  '每场模拟资金计划 · 严格复盘门禁 · 仅供内部校准',
  '初始资金',
  '当前资金',
  '可用资金',
  '已结算总盈亏',
  '未结算暴露',
  '今日/全部计划投入',
  '已结算比赛',
  '待结算比赛',
  '待赛比赛',
  '最大回撤',
  '当前比赛 V5 内部判断',
  '四大信心指数',
  '12 维评分',
  '模拟资金分配',
  '主方向投入',
  '主推比分投入',
  '备用比分投入',
  '大小球投入',
  '公式说明',
  '一致性检查',
  '复盘输入',
  '手动结算本场',
  '结算来源',
  '最近复盘记录',
  'ledger JSON',
  'worldcup_internal_v5_ledger',
  'reset',
]) {
  assert.ok(combinedInternalSource.includes(text), `internal UI must include: ${text}`)
}

for (const text of ['模型主方向概率', '剔除', '不进主推池', '稳赚', '必中', '保证命中', '内幕']) {
  assert.equal(combinedInternalSource.includes(text), false, `internal source must not include: ${text}`)
}

assert.match(typeSource, /INTERNAL_V4_VERSION\s*=\s*['"]internal-v5['"]/)
assert.match(typeSource, /INTERNAL_V4_LEDGER_VERSION\s*=\s*['"]internal-v5-ledger['"]/)
assert.match(typeSource, /INTERNAL_V4_LEDGER_KEY\s*=\s*['"]worldcup_internal_v5_ledger['"]/)
assert.match(typeSource, /LEGACY_INTERNAL_V4_LEDGER_KEY\s*=\s*['"]worldcup_internal_v4_ledger['"]/)
assert.match(ledgerSource, /currentBankroll\s*=\s*roundTo\(initialBankroll \+ settledProfit/)
assert.match(ledgerSource, /pendingExposure\s*=\s*roundTo\(/)
assert.match(ledgerSource, /availableBankroll\s*=\s*roundTo\(currentBankroll - pendingExposure/)

const changedFiles = execFileSync('git', ['diff', '--name-only'], {
  encoding: 'utf8',
})
  .split(/\r?\n/)
  .filter(Boolean)

const allowedExact = new Set([
  'src/App.jsx',
  'src/components/InternalCommandCenterV4.jsx',
  'src/components/InternalCommandCenterV4.css',
  'scripts/check-internal-v4-engine.mjs',
  'scripts/check-internal-v4-stake.mjs',
  'scripts/check-internal-v4-settlement.mjs',
  'scripts/check-internal-v4-ui-guard.mjs',
])

function isAllowedChangedFile(file) {
  return (
    allowedExact.has(file) ||
    file.startsWith('src/internal/v4/') ||
    /^scripts\/check-internal-v5-.*\.mjs$/.test(file)
  )
}

for (const file of changedFiles) {
  assert.equal(isAllowedChangedFile(file), true, `unexpected changed file: ${file}`)
  assert.equal(file.startsWith('src/data/'), false, `data file changed: ${file}`)
  assert.equal(file.startsWith('api/'), false, `api file changed: ${file}`)
  assert.equal(file.startsWith('src/services/'), false, `public service changed: ${file}`)
  assert.equal(file === 'package.json' || file === 'package-lock.json', false, `dependency file changed: ${file}`)
  assert.equal(file === 'vercel.json', false, `deployment config changed: ${file}`)
  assert.equal(file.startsWith('.env'), false, `env file changed: ${file}`)
}

console.log('check-internal-v4-ui-guard: ok')
