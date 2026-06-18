import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const appSource = readFileSync('src/App.jsx', 'utf8')
const componentSource = readFileSync('src/components/InternalCommandCenterV4.jsx', 'utf8')
const cssSource = readFileSync('src/components/InternalCommandCenterV4.css', 'utf8')
const engineSource = readFileSync('src/internal/v4/internalEngineV4.js', 'utf8')
const typeSource = readFileSync('src/internal/v4/internalTypesV4.js', 'utf8')
const ledgerSource = readFileSync('src/internal/v4/internalLedgerV4.js', 'utf8')
const planScopeSource = readFileSync('src/internal/v4/internalPlanScopeV5.js', 'utf8')
const scoreProviderSource = readFileSync('src/internal/v4/internalScoreProviderV5.js', 'utf8')
const oddsProviderSource = readFileSync('src/internal/v4/internalOddsProviderV5.js', 'utf8')
const oddsOverrideSource = readFileSync('src/internal/v4/internalOddsOverrideV5.js', 'utf8')
const combinedInternalSource = `${componentSource}\n${cssSource}\n${engineSource}\n${typeSource}\n${ledgerSource}\n${planScopeSource}\n${scoreProviderSource}\n${oddsProviderSource}\n${oddsOverrideSource}`

assert.match(appSource, /InternalCommandCenterV4/)
assert.match(appSource, /function isInternalV4RouteActive\(\)/)
assert.match(appSource, /window\.location\.hash\s*===\s*['"]#internal-v4['"]/)
assert.match(appSource, /params\.get\(['"]internal['"]\)\s*===\s*['"]v4['"]/)
assert.match(appSource, /if \(isInternalV4Route && !isCaptureMode\) \{/)
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
  '计划投入',
  '范围比赛数',
  '待结算',
  '已结算',
  '最大回撤',
  '计划范围',
  '未来24小时',
  '北京时间今天',
  '全赛程预览',
  '未来24小时计划生成中...',
  '正在读取比赛数据',
  '正在生成未来24小时计划',
  '正在读取账本',
  '正在同步赔率覆盖',
  '计划生成完成',
  '当前比赛 V5 内部判断',
  '四大信心指数',
  '12 维评分',
  '数据中性',
  '规则解释链条',
  '模拟资金分配',
  '主方向',
  '候选波胆',
  '保护波胆',
  '大小球',
  '赔率来源',
  '潜在盈利',
  '编辑赔率',
  '保存赔率',
  '恢复默认',
  '未找到可信比分，等待手动录入',
  '金额公式',
  '公式说明',
  '一致性检查',
  '复盘输入',
  '结算本场',
  '重新结算本场',
  '结算来源',
  '最近复盘记录',
  'ledger JSON',
  '导出 JSON',
  '确认重置 V5 账本？这会清空资金记录、复盘记录和赔率覆盖。',
  'worldcup_internal_v5_ledger',
  'worldcup_internal_v5_odds_overrides',
  'internal-v5-export',
  'scoreStrategyNotice',
  'reset',
]) {
  assert.ok(combinedInternalSource.includes(text), `internal UI must include: ${text}`)
}

for (const text of [
  '模型主方向概率',
  '剔除',
  '不进主推池',
  '主推波胆',
  '备用波胆',
  '稳赚',
  '必中',
  '保证命中',
  '内幕',
]) {
  assert.equal(combinedInternalSource.includes(text), false, `internal source must not include: ${text}`)
}

for (const text of ['未来24小时 · 0 场', '未来24小时·0场']) {
  assert.equal(combinedInternalSource.includes(text), false, `loading must not show misleading zero copy: ${text}`)
}

for (const text of ['总进球：2-3球分界', '2-3球分界', '0-2球分界']) {
  assert.equal(combinedInternalSource.includes(text), false, `total goals copy must not include: ${text}`)
}

assert.match(typeSource, /INTERNAL_V4_VERSION\s*=\s*['"]internal-v5['"]/)
assert.match(typeSource, /INTERNAL_V4_LEDGER_VERSION\s*=\s*['"]internal-v5-ledger['"]/)
assert.match(typeSource, /INTERNAL_V4_LEDGER_KEY\s*=\s*['"]worldcup_internal_v5_ledger['"]/)
assert.match(typeSource, /LEGACY_INTERNAL_V4_LEDGER_KEY\s*=\s*['"]worldcup_internal_v4_ledger['"]/)
assert.match(ledgerSource, /currentBankroll\s*=\s*roundTo\(initialBankroll \+ settledProfit/)
assert.match(ledgerSource, /pendingExposure\s*=\s*roundTo\(/)
assert.match(ledgerSource, /availableBankroll\s*=\s*roundTo\(currentBankroll - pendingExposure/)
assert.match(componentSource, /onClick=\{\(\) => activatePlanScope\(item\.key\)\}/)
assert.doesNotMatch(componentSource, /onClick=\{\(\) => refreshPlansForScope\(item\.key\)\}/)
assert.match(componentSource, /isPlanInitializing/)
assert.match(componentSource, /startupSyncComplete/)
assert.match(componentSource, /window\.confirm\(RESET_CONFIRM_MESSAGE\)/)
assert.match(componentSource, /clearOddsOverridesV5\(\)/)
assert.match(componentSource, /exportLedgerJson\(ledger,\s*\{/)
assert.match(componentSource, /envelope:\s*true/)
assert.match(ledgerSource, /version:\s*['"]internal-v5-export['"]/)
assert.match(ledgerSource, /oddsOverrides:/)
assert.match(ledgerSource, /parseInternalV5ImportJson/)
assert.match(ledgerSource, /getPlanningLedgerBaselineForScope/)
assert.match(oddsOverrideSource, /clearOddsOverridesV5/)
assert.match(engineSource, /getScoreStrategyNotice/)

const changedFiles = execFileSync('git', ['diff', '--name-only'], {
  encoding: 'utf8',
})
  .split(/\r?\n/)
  .filter(Boolean)
const untrackedFiles = execFileSync('git', ['ls-files', '--others', '--exclude-standard'], {
  encoding: 'utf8',
})
  .split(/\r?\n/)
  .filter(Boolean)
const checkedFiles = Array.from(new Set([...changedFiles, ...untrackedFiles]))

const allowedExact = new Set([
  'src/App.jsx',
  'src/App.css',
  'src/components/InternalCommandCenterV4.jsx',
  'src/components/InternalCommandCenterV4.css',
  'scripts/check-internal-v4-engine.mjs',
  'scripts/check-internal-v4-stake.mjs',
  'scripts/check-internal-v4-settlement.mjs',
  'scripts/check-internal-v4-ui-guard.mjs',
  'eslint.config.js',
])

function isAllowedChangedFile(file) {
  return (
    allowedExact.has(file) ||
    file.startsWith('src/internal/v4/') ||
    /^scripts\/check-internal-v5-.*\.mjs$/.test(file)
  )
}

for (const file of checkedFiles) {
  assert.equal(isAllowedChangedFile(file), true, `unexpected changed file: ${file}`)
  assert.equal(file.startsWith('src/data/'), false, `data file changed: ${file}`)
  assert.equal(file.startsWith('api/'), false, `api file changed: ${file}`)
  assert.equal(file.startsWith('src/services/'), false, `public service changed: ${file}`)
  assert.equal(file === 'package.json' || file === 'package-lock.json', false, `dependency file changed: ${file}`)
  assert.equal(file === 'vercel.json', false, `deployment config changed: ${file}`)
  assert.equal(file.startsWith('.env'), false, `env file changed: ${file}`)
}

console.log('check-internal-v4-ui-guard: ok')
