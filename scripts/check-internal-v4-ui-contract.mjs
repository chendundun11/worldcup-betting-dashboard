import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const componentSource = readFileSync('src/components/InternalCommandCenterV4.jsx', 'utf8')
const cssSource = readFileSync('src/components/InternalCommandCenterV4.css', 'utf8')
const engineSource = readFileSync('src/internal/v4/internalEngineV4.js', 'utf8')
const stakeSource = readFileSync('src/internal/v4/internalStakeV4.js', 'utf8')

for (const tab of ['execute', 'analysis', 'audit', 'ledger']) {
  assert.match(
    componentSource,
    new RegExp(`key:\\s*['"]${tab}['"]`),
    `Internal detail tab ${tab} must exist.`,
  )
  assert.match(
    componentSource,
    new RegExp(`detailTab\\s*===\\s*['"]${tab}['"]`),
    `Internal detail tab ${tab} must gate its own panel.`,
  )
}

for (const label of ['执行台', '分析链', '审计', '账本']) {
  assert.ok(componentSource.includes(label), `Internal tab label must include ${label}.`)
}

assert.match(componentSource, /className=["']internal-v4-metrics-drawer["']>/)
assert.match(componentSource, /className=["']internal-v4-scan-drawer["']>/)
assert.match(componentSource, /className=["']internal-v4-danger-zone["']>/)
assert.doesNotMatch(
  componentSource,
  /<details[^>]+className=["']internal-v4-(?:metrics|scan|danger)[^"']*["'][^>]*\sopen(?:\s|=|>)/,
  'Internal drawers must be closed by default.',
)
assert.match(
  cssSource,
  /\.internal-v4-metrics-drawer:not\(\[open\]\)\s+\.internal-v4-funds/,
  'Closed metrics drawer must hide funds grid.',
)
assert.match(
  cssSource,
  /\.internal-v4-danger-zone:not\(\[open\]\)\s+\.internal-v4-danger-actions/,
  'Closed danger drawer must hide actions.',
)
assert.match(
  cssSource,
  /\.internal-v4-scan-drawer:not\(\[open\]\)\s+\.internal-v4-scan/,
  'Closed scan drawer must hide scan details.',
)

assert.match(componentSource, /aria-label=["']量化比分分布["']/)
assert.match(componentSource, /internal-v4-score-candidate-grid/)
assert.match(componentSource, /scoreModel\?\.distribution/)
assert.match(engineSource, /buildQuantScoreModel/)
assert.match(engineSource, /predictions\s*=\s*\{[\s\S]*scoreModel:/)
assert.doesNotMatch(
  `${componentSource}\n${engineSource}\n${stakeSource}`,
  /主推比分|备用比分|辅推比分/,
  'Internal V4 must use candidate/protection score wording.',
)

const executePanelMatch = componentSource.match(
  /detailTab\s*===\s*['"]execute['"][\s\S]*?detailTab\s*===\s*['"]analysis['"]/,
)
assert.ok(executePanelMatch, 'Execute and analysis panels must both exist.')
assert.doesNotMatch(
  executePanelMatch[0],
  /量化比分分布|12 维评分|规则解释链条|触发规则/,
  'Execute tab must stay focused and not include deep analysis sections.',
)

console.log('check-internal-v4-ui-contract: ok')
