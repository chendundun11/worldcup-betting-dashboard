import { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  Check,
  Download,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  Target,
  Trash2,
  Upload,
  WalletCards,
} from 'lucide-react'
import { autoReviewFinishedMatches } from '../internal/v4/internalAutoReviewV4.js'
import { buildInternalV4Analysis } from '../internal/v4/internalEngineV4.js'
import {
  clearLegacyInternalV4Ledger,
  clearPendingRecords,
  exportLedgerJson,
  getInternalLedgerV4,
  getLedgerSummaryForMatches,
  importLedgerJson,
  resetInternalLedgerV4,
  saveInternalLedgerV4,
  settleRecord,
  updateRecordStakePlan,
  upsertPlannedRecord,
} from '../internal/v4/internalLedgerV4.js'
import {
  PLAN_SCOPE_OPTIONS_V5,
  getPlanScopeLabelV5,
  isFormalPlanScopeV5,
  isPreviewPlanScopeV5,
  readPlanScopeV5,
  savePlanScopeV5,
  selectMatchesByPlanScopeV5,
} from '../internal/v4/internalPlanScopeV5.js'
import {
  INTERNAL_V5_ODDS_OVERRIDE_KEY,
  loadOddsOverridesV5,
  removeOddsOverrideV5,
  saveOddsOverridesV5,
  setOddsOverrideV5,
} from '../internal/v4/internalOddsOverrideV5.js'
import { refreshStakePlanOddsV5 } from '../internal/v4/internalOddsProviderV5.js'
import {
  getInternalScoreProviderV5,
  getScoreSourceLabelV5,
} from '../internal/v4/internalScoreProviderV5.js'
import { buildInternalStakePlan } from '../internal/v4/internalStakeV4.js'
import {
  INTERNAL_V4_DISCLAIMER,
  INTERNAL_V5_SUBTITLE,
  RECORD_STATUS_LABELS_V4,
  SCORE_DIMENSION_KEYS_V4,
  SCORE_DIMENSION_LABELS_V4,
} from '../internal/v4/internalTypesV4.js'
import {
  formatKickoffV4,
  getMatchIdV4,
  getMatchNameV4,
  getRecordIdV4,
  getScoreTextV4,
} from '../internal/v4/internalSelectorsV4.js'
import './InternalCommandCenterV4.css'

const FILTERS = [
  { key: 'all', label: '全部' },
  { key: 'upcoming', label: '待赛' },
  { key: 'pending', label: '待结算' },
  { key: 'settled', label: '已结算' },
  { key: 'manual', label: '手动' },
  { key: 'auto', label: '自动' },
  { key: 'high', label: '高信心' },
  { key: 'low', label: '低额' },
]

function formatAmount(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return '0'
  if (number > 0) return `+${number}`
  return String(number)
}

function formatRate(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return '0%'
  return `${Math.round(number * 1000) / 10}%`
}

function getTone(value) {
  if (Number(value) > 0) return 'positive'
  if (Number(value) < 0) return 'negative'
  return 'neutral'
}

function getStatusLabel(status) {
  return RECORD_STATUS_LABELS_V4[status] ?? '未计划'
}

function formatOverUnderDisplay(value) {
  if (value === '大2.5') return '大 2.5'
  if (value === '小2.5') return '小 2.5'
  return value ?? '-'
}

function formatPotentialProfit(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return '+0'
  return `+${Math.round(number * 100) / 100}`
}

function isSettledStatus(status) {
  return status === 'settled_auto' || status === 'settled_manual'
}

function getStakeItemStatusLabel(item, record) {
  const settledItem = (record?.itemResults ?? []).find((result) => result.key === item.key)
  if (settledItem?.result === 'win') return '赢'
  if (settledItem?.result === 'loss') return '输'
  if (settledItem?.result === 'skipped') return '跳过'
  if (item.key === 'overUnder' && item.pick === '2.5球分界') return '观察小额'
  if (item.stake <= 0) return '跳过'
  return isSettledStatus(record?.status) ? '已结算' : '待结算'
}

function getRowStatusLabel(row) {
  if (row.record?.status === 'settled_manual') return '已结算-手动'
  if (row.record?.status === 'settled_auto') return '已结算-自动'
  if (row.record?.status === 'upcoming') return '未开赛'
  if (row.scoreProvider?.status === 'not_found' && row.status === 'pending_settlement') {
    return '无可信比分'
  }
  return getStatusLabel(row.status)
}

function buildRow(match, record, ledger, oddsOverrides = {}) {
  const analysis =
    record?.analysisSnapshot ??
    buildInternalV4Analysis(match, { bankroll: ledger?.currentBankroll })
  const rawStakePlan =
    record?.stakePlanSnapshot ??
    buildInternalStakePlan(analysis, ledger, {
      match,
      oddsOverrides,
    })
  const stakePlan = refreshStakePlanOddsV5(rawStakePlan, match, oddsOverrides)
  const scoreProvider = getInternalScoreProviderV5(match)

  return {
    match,
    record,
    recordId: getRecordIdV4(match),
    matchName: getMatchNameV4(match),
    analysis,
    stakePlan,
    scoreProvider,
    status: record?.status ?? 'unplanned',
  }
}

function filterRow(row, filter) {
  if (filter === 'all') return true
  if (filter === 'upcoming') return row.status === 'upcoming'
  if (filter === 'pending') {
    return row.status === 'pending_settlement' || row.status === 'live_or_unknown'
  }
  if (filter === 'settled') return isSettledStatus(row.status)
  if (filter === 'manual') return row.status === 'settled_manual'
  if (filter === 'auto') return row.status === 'settled_auto'
  if (filter === 'high') return ['A', 'B+'].includes(row.analysis.decision.grade)
  if (filter === 'low') return ['C', 'D+', 'D'].includes(row.analysis.decision.grade)
  return true
}

function Metric({ label, tone = 'neutral', value }) {
  return (
    <p className={`internal-v4-metric ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </p>
  )
}

function InternalCommandCenterV4({ activeMatch = null, matches = [] }) {
  const [ledger, setLedger] = useState(() => getInternalLedgerV4())
  const [planScope, setPlanScope] = useState(() => readPlanScopeV5())
  const [oddsOverrides, setOddsOverrides] = useState(() => loadOddsOverridesV5())
  const [filter, setFilter] = useState('all')
  const [selectedRecordId, setSelectedRecordId] = useState(
    () => (activeMatch ? getRecordIdV4(activeMatch) : null),
  )
  const [scanResult, setScanResult] = useState(null)
  const [notice, setNotice] = useState('')
  const [homeScore, setHomeScore] = useState('')
  const [awayScore, setAwayScore] = useState('')
  const [jsonBuffer, setJsonBuffer] = useState('')
  const [editingOddsKey, setEditingOddsKey] = useState(null)
  const [oddsDrafts, setOddsDrafts] = useState({})

  useEffect(() => {
    if (!matches.length) return
    const baseLedger = getInternalLedgerV4()
    const scopedMatches = selectMatchesByPlanScopeV5(matches, planScope, {
      ledger: baseLedger,
    })

    if (!isFormalPlanScopeV5(planScope)) {
      setLedger(baseLedger)
      setScanResult({
        scanned: scopedMatches.length,
        planned: 0,
        updated: 0,
        settled: 0,
        foundScores: 0,
        skipped: scopedMatches.length,
        pending: 0,
        upcoming: 0,
        blockedFuture: 0,
        blockedUntrustedScore: 0,
        results: [],
        previewOnly: isPreviewPlanScopeV5(planScope),
      })
      setSelectedRecordId((current) =>
        scopedMatches.some((match) => getRecordIdV4(match) === current)
          ? current
          : scopedMatches[0]
            ? getRecordIdV4(scopedMatches[0])
            : null,
      )
      setNotice(`${getPlanScopeLabelV5(planScope)}：预览模式不计入资金暴露。`)
      return
    }

    const result = autoReviewFinishedMatches(scopedMatches, baseLedger, {
      planScope,
      oddsOverrides,
    })
    const savedLedger = saveInternalLedgerV4(result.ledger)
    setLedger(savedLedger)
    setScanResult(result)
    setSelectedRecordId((current) =>
      scopedMatches.some((match) => getRecordIdV4(match) === current)
        ? current
        : scopedMatches[0]
          ? getRecordIdV4(scopedMatches[0])
          : null,
    )
    setNotice(
      `${getPlanScopeLabelV5(planScope)}自动扫描完成：扫描 ${result.scanned}，计划 ${result.planned + result.updated}，找到真实比分 ${result.foundScores}，自动结算 ${result.settled}，跳过 ${result.skipped}。`,
    )
  }, [matches, oddsOverrides, planScope])

  const scopedMatches = useMemo(
    () =>
      selectMatchesByPlanScopeV5(matches, planScope, {
        ledger,
      }),
    [ledger, matches, planScope],
  )
  const summaryPlanScope = isFormalPlanScopeV5(planScope) ? planScope : null
  const summary = useMemo(
    () =>
      getLedgerSummaryForMatches(ledger, scopedMatches, {
        emptyMatchesMeansEmpty: true,
        ignoreRecords: isPreviewPlanScopeV5(planScope),
        includePendingExposure: isFormalPlanScopeV5(planScope),
        planScope: summaryPlanScope,
        useGlobalBankroll: true,
        useGlobalLastRecords: true,
      }),
    [ledger, planScope, scopedMatches, summaryPlanScope],
  )
  const recordsById = useMemo(
    () => new Map((ledger.records ?? []).map((record) => [record.id, record])),
    [ledger.records],
  )
  const rows = useMemo(
    () =>
      scopedMatches.map((match) =>
        buildRow(match, recordsById.get(getRecordIdV4(match)), summary, oddsOverrides),
      ),
    [summary, scopedMatches, recordsById, oddsOverrides],
  )
  const filteredRows = useMemo(
    () => rows.filter((row) => filterRow(row, filter)),
    [filter, rows],
  )
  const selectedRow =
    rows.find((row) => row.recordId === selectedRecordId) ?? filteredRows[0] ?? rows[0] ?? null
  const selectedRecord = selectedRow?.record ?? null
  const selectedAnalysis = selectedRow?.analysis ?? null
  const selectedStakePlan = selectedRow?.stakePlan ?? null
  const triggeredRules = selectedAnalysis?.rules?.triggered ?? []
  function persistLedger(nextLedger, nextNotice) {
    const saved = saveInternalLedgerV4(nextLedger)
    setLedger(saved)
    if (nextNotice) setNotice(nextNotice)
    return saved
  }

  function activatePlanScope(nextPlanScope) {
    const savedScope = savePlanScopeV5(nextPlanScope)
    setPlanScope(savedScope)
    setFilter('all')
    setHomeScore('')
    setAwayScore('')
    setEditingOddsKey(null)
    return savedScope
  }

  function refreshPlansForScope(nextPlanScope) {
    const savedScope = activatePlanScope(nextPlanScope)
    if (!isFormalPlanScopeV5(savedScope)) {
      setNotice(`${getPlanScopeLabelV5(savedScope)}：仅预览，不生成正式计划，不计入资金暴露。`)
      return
    }

    let workingLedger = ledger
    const planMatches = selectMatchesByPlanScopeV5(matches, savedScope, {
      ledger: workingLedger,
    })
    const counts = { planned: 0, updated: 0, kept: 0 }

    for (const match of planMatches) {
      const scopedLedger = getLedgerSummaryForMatches(workingLedger, planMatches, {
        emptyMatchesMeansEmpty: true,
        planScope: savedScope,
        useGlobalBankroll: true,
      })
      const analysis = buildInternalV4Analysis(match, {
        bankroll: scopedLedger.currentBankroll,
      })
      const stakePlan = buildInternalStakePlan(analysis, scopedLedger, {
        match,
        oddsOverrides,
      })
      const result = upsertPlannedRecord(workingLedger, match, analysis, stakePlan, {
        planScope: savedScope,
      })
      workingLedger = result.ledger
      if (result.action === 'planned') counts.planned += 1
      if (result.action === 'updated') counts.updated += 1
      if (result.action === 'kept-settled') counts.kept += 1
    }

    persistLedger(
      workingLedger,
      `${getPlanScopeLabelV5(savedScope)}计划已刷新：范围比赛 ${planMatches.length}，新增 ${counts.planned}，更新 ${counts.updated}，保留已结算 ${counts.kept}。`,
    )
  }

  function handleAutoScan() {
    const result = autoReviewFinishedMatches(scopedMatches, ledger, {
      createPlans: isFormalPlanScopeV5(planScope),
      oddsOverrides,
      planScope,
    })
    const saved = persistLedger(
      result.ledger,
      `扫描赛果并复盘：扫描 ${result.scanned}，找到真实比分 ${result.foundScores}，自动结算 ${result.settled}，跳过 ${result.skipped}。`,
    )
    setScanResult({ ...result, ledger: saved })
  }

  function handleRefreshPlans() {
    refreshPlansForScope(planScope)
  }

  function ensureSelectedRecord() {
    if (!selectedRow) return { ledger, recordId: null }
    if (selectedRow.record) {
      const nextLedger = updateRecordStakePlan(ledger, selectedRow.recordId, selectedStakePlan)
      return { ledger: nextLedger, recordId: selectedRow.recordId }
    }

    const analysis = buildInternalV4Analysis(selectedRow.match, {
      bankroll: summary.currentBankroll,
    })
    const stakePlan = buildInternalStakePlan(analysis, summary, {
      match: selectedRow.match,
      oddsOverrides,
    })
    const result = upsertPlannedRecord(ledger, selectedRow.match, analysis, stakePlan, {
      planScope,
    })
    return { ledger: result.ledger, recordId: selectedRow.recordId }
  }

  function handleManualSettle() {
    if (!selectedRow) return
    const home = Number(homeScore)
    const away = Number(awayScore)

    if (!Number.isInteger(home) || !Number.isInteger(away) || home < 0 || away < 0) {
      setNotice('请在实际比分输入框填入有效比分。')
      return
    }

    const prepared = ensureSelectedRecord()
    const result = settleRecord(prepared.ledger, prepared.recordId, { home, away }, {
      allowResettle: isSettledStatus(selectedRecord?.status),
      settlementSource: 'manual',
      actualScoreSource: 'manual',
    })
    persistLedger(
      result.ledger,
      result.duplicate
        ? '本场已经结算过，ledger 未重复写入。'
        : `${result.resettled ? '重新结算完成' : '手动结算完成'}：盈亏 ${formatAmount(result.settlement?.profit ?? 0)}，当前资金 ${result.ledger.currentBankroll}。`,
    )
  }

  function persistOddsOverrides(nextOverrides, nextNotice) {
    const saved = saveOddsOverridesV5(nextOverrides)
    setOddsOverrides(saved)
    if (nextNotice) setNotice(nextNotice)
    return saved
  }

  function handleEditOdds(item) {
    setEditingOddsKey(item.key)
    setOddsDrafts((current) => ({
      ...current,
      [item.key]: String(item.odds),
    }))
  }

  function handleSaveOdds(item) {
    if (!selectedRow) return
    const nextOdds = Number(oddsDrafts[item.key])
    if (!Number.isFinite(nextOdds) || nextOdds <= 1) {
      setNotice('赔率必须大于 1。')
      return
    }
    const matchKey = getMatchIdV4(selectedRow.match)
    const nextOverrides = setOddsOverrideV5(oddsOverrides, matchKey, item.key, nextOdds)
    persistOddsOverrides(nextOverrides, `${item.label}赔率已保存为手动覆盖：${nextOdds}。`)
    setEditingOddsKey(null)
  }

  function handleRestoreOdds(item) {
    if (!selectedRow) return
    const matchKey = getMatchIdV4(selectedRow.match)
    const nextOverrides = removeOddsOverrideV5(oddsOverrides, matchKey, item.key)
    persistOddsOverrides(nextOverrides, `${item.label}赔率已恢复为来源层默认。`)
    setEditingOddsKey(null)
  }

  function handleClearPending() {
    persistLedger(clearPendingRecords(ledger), '未结算计划已清理，已结算记录保留。')
  }

  function handleReset() {
    const nextLedger = resetInternalLedgerV4()
    setLedger(nextLedger)
    setScanResult(null)
    setHomeScore('')
    setAwayScore('')
    setNotice('reset 完成：V5 ledger 已回到初始资金 10000。')
  }

  function handleClearLegacy() {
    clearLegacyInternalV4Ledger()
    setNotice('旧 V4 ledger 已清空，V5 ledger 未受影响。')
  }

  function handleExport() {
    const json = exportLedgerJson(ledger)
    setJsonBuffer(json)
    setNotice('导出 JSON 已生成。')

    if (typeof window !== 'undefined') {
      const blob = new Blob([json], { type: 'application/json' })
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `internal-v5-ledger-${Date.now()}.json`
      link.click()
      window.URL.revokeObjectURL(url)
    }
  }

  function handleImport() {
    try {
      const imported = importLedgerJson(jsonBuffer)
      setLedger(imported)
      setNotice('导入 JSON 成功，V5 ledger 已更新。')
    } catch (error) {
      setNotice(`导入失败：${error.message}`)
    }
  }

  if (!matches.length) {
    return (
      <main className="internal-v4-shell">
        <section className="internal-v4-empty">
          <h1>V5 内部资金引擎</h1>
          <p>{INTERNAL_V4_DISCLAIMER}</p>
          <strong>当前没有可读取的比赛数据。</strong>
        </section>
      </main>
    )
  }

  return (
    <main className="internal-v4-shell">
      <header className="internal-v4-topbar">
        <div>
          <span className="internal-v4-eyebrow">Internal V5 Staking Engine</span>
          <h1>V5 内部资金引擎</h1>
          <p>{INTERNAL_V5_SUBTITLE}</p>
          <p>{INTERNAL_V4_DISCLAIMER}</p>
        </div>

        <div className="internal-v4-scope-bar" aria-label="计划范围">
          <span>计划范围</span>
          {PLAN_SCOPE_OPTIONS_V5.map((item) => (
            <button
              className={planScope === item.key ? 'active' : ''}
              key={item.key}
              onClick={() => refreshPlansForScope(item.key)}
              type="button"
            >
              {item.label}
            </button>
          ))}
          <small>{getPlanScopeLabelV5(planScope)} · {scopedMatches.length} 场</small>
        </div>

        <div className="internal-v4-actions" aria-label="V5 内部操作">
          <button onClick={handleAutoScan} type="button">
            <Activity size={16} />
            扫描赛果并复盘
          </button>
          <button onClick={handleRefreshPlans} type="button">
            <RefreshCw size={16} />
            刷新当前范围计划
          </button>
          <button onClick={handleExport} type="button">
            <Download size={16} />
            导出 JSON
          </button>
          <button onClick={handleImport} type="button">
            <Upload size={16} />
            导入 JSON
          </button>
          <button onClick={handleClearPending} type="button">
            <Trash2 size={16} />
            清空未结算
          </button>
          <button onClick={handleClearLegacy} type="button">
            <Trash2 size={16} />
            清空旧 V4
          </button>
          <button className="danger" onClick={handleReset} type="button">
            <RotateCcw size={16} />
            reset
          </button>
        </div>
      </header>

      <section className="internal-v4-funds" aria-label="V5 顶部资金统计">
        <Metric label="初始资金" value={summary.initialBankroll} />
        <Metric label="当前资金" value={summary.currentBankroll} />
        <Metric label="可用资金" tone={getTone(summary.availableBankroll)} value={summary.availableBankroll} />
        <Metric label="已结算总盈亏" tone={getTone(summary.settledProfit)} value={formatAmount(summary.settledProfit)} />
        <Metric label="当前计划范围未结算暴露" value={summary.pendingExposure} />
        <Metric label="当前计划范围计划投入" value={summary.totalPlannedStake} />
        <Metric label="当前计划范围比赛数" value={summary.totalMatches} />
        <Metric label="当前计划范围待结算" value={summary.pendingCount} />
        <Metric label="当前计划范围已结算" value={summary.settledCount} />
        <Metric label="最大回撤" value={summary.maxDrawdown} />
      </section>

      <section className="internal-v4-review-stats" aria-label="复盘统计">
        <Metric label="已结算胜场" value={summary.winCount} />
        <Metric label="已结算负场" value={summary.lossCount} />
        <Metric label="手动结算" value={summary.manualSettledCount} />
        <Metric label="自动结算" value={summary.autoSettledCount} />
      </section>

      <section className="internal-v4-workspace">
        <aside className="internal-v4-sidebar" aria-label="V5 比赛列表">
          <div className="internal-v4-panel-head">
            <div>
              <span>Match Queue</span>
              <h2>比赛列表</h2>
            </div>
            <strong>{filteredRows.length}/{rows.length}</strong>
          </div>

          <div className="internal-v4-filter" aria-label="筛选">
            {FILTERS.map((item) => (
              <button
                className={filter === item.key ? 'active' : ''}
                key={item.key}
                onClick={() => setFilter(item.key)}
                type="button"
              >
                {item.label}
              </button>
            ))}
          </div>

          {scanResult ? (
            <div className="internal-v4-scan">
              <strong>自动复盘扫描结果</strong>
              <span>扫描比赛 {scanResult.scanned ?? 0}</span>
              <span>找到真实比分 {scanResult.foundScores ?? 0}</span>
              <span>生成/更新计划 {(scanResult.planned ?? 0) + (scanResult.updated ?? 0)}</span>
              <span>自动结算 {scanResult.settled}</span>
              <span>待结算 {scanResult.pending}</span>
              <span>待赛 {scanResult.upcoming}</span>
              <span>跳过 {scanResult.skipped ?? 0}</span>
              <span>无可信比分 {scanResult.blockedUntrustedScore}</span>
            </div>
          ) : null}

          <div className="internal-v4-match-list">
            {filteredRows.length ? filteredRows.map((row) => (
              <button
                className={row.recordId === selectedRow?.recordId ? 'active' : ''}
                key={row.recordId}
                onClick={() => {
                  setSelectedRecordId(row.recordId)
                  setHomeScore('')
                  setAwayScore('')
                }}
                type="button"
              >
                <span>{formatKickoffV4(row.match?.kickoff)}</span>
                <strong>{row.matchName}</strong>
                <small>
                  {getRowStatusLabel(row)} · {row.analysis.decision.grade}档 · 投入 {row.stakePlan.totalStake}
                </small>
                <small>
                  {row.analysis.decision.mainPick} · {row.analysis.decision.directionStrength}
                  {isPreviewPlanScopeV5(planScope) ? ' · 预览不计暴露' : ''}
                </small>
              </button>
            )) : (
              <p className="internal-v4-empty-line">
                当前计划范围没有比赛。可切换到全赛程预览查看 V5 判断。
              </p>
            )}
          </div>
        </aside>

        <section className="internal-v4-detail" aria-label="V5 当前比赛详情">
          <div className="internal-v4-detail-head">
            <div>
              <span>{selectedRow ? formatKickoffV4(selectedRow.match?.kickoff) : '-'}</span>
              <h2>{selectedRow?.matchName ?? '未选择比赛'}</h2>
              <p>
                {selectedAnalysis?.classification?.gameType ?? '-'} ·{' '}
                {selectedAnalysis?.decision?.grade ?? '-'}档 ·{' '}
                {selectedRow ? getRowStatusLabel(selectedRow) : '-'}
                {isPreviewPlanScopeV5(planScope) ? ' · 预览，不计入资金暴露' : ''}
              </p>
            </div>
            <strong className={`internal-v4-record-state ${selectedRecord?.status ?? 'unplanned'}`}>
              本场投入 {selectedStakePlan?.totalStake ?? 0}
            </strong>
          </div>

          <section className="internal-v4-section" aria-label="当前比赛 V5 内部判断">
            <div className="internal-v4-section-title">
              <Target size={18} />
              <h3>当前比赛 V5 内部判断</h3>
            </div>
            <div className="internal-v4-judgement-grid">
              <Metric label="主方向" value={selectedAnalysis?.decision?.mainPick ?? '-'} />
              <Metric label="方向强度" value={selectedAnalysis?.decision?.directionStrength ?? '-'} />
              <Metric label="资金档位" value={selectedAnalysis?.decision?.grade ?? '-'} />
              <Metric label="比赛类型" value={selectedAnalysis?.classification?.gameType ?? '-'} />
              <Metric label="主推比分" value={selectedAnalysis?.predictions?.primaryScore ?? '-'} />
              <Metric label="备用比分" value={selectedAnalysis?.predictions?.secondaryScore ?? '-'} />
              <Metric label="总进球" value={selectedAnalysis?.predictions?.totalGoalsText ?? '-'} />
              <Metric
                label="大小球"
                value={formatOverUnderDisplay(selectedAnalysis?.predictions?.overUnder)}
              />
            </div>
          </section>

          <section className="internal-v4-section" aria-label="四大信心指数">
            <div className="internal-v4-section-title">
              <Check size={18} />
              <h3>四大信心指数</h3>
            </div>
            <div className="internal-v4-confidence-grid">
              <Metric label="内部总信心" value={selectedAnalysis?.confidence?.internalConfidence ?? '-'} />
              <Metric label="方向信心" value={selectedAnalysis?.confidence?.directionConfidence ?? '-'} />
              <Metric label="比分信心" value={selectedAnalysis?.confidence?.scoreConfidence ?? '-'} />
              <Metric label="大小球信心" value={selectedAnalysis?.confidence?.overUnderConfidence ?? '-'} />
              <Metric label="数据稳定" value={selectedAnalysis?.confidence?.dataConfidence ?? '-'} />
              <Metric label="类型修正" value={selectedAnalysis?.confidence?.gameTypeModifier ?? '-'} />
            </div>
          </section>

          <section className="internal-v4-section" aria-label="12 维评分">
            <div className="internal-v4-section-title">
              <Activity size={18} />
              <h3>12 维评分</h3>
            </div>
            <div className="internal-v4-dimension-grid">
              {SCORE_DIMENSION_KEYS_V4.map((key) => (
                <p key={key}>
                  <span>{SCORE_DIMENSION_LABELS_V4[key]}</span>
                  <strong>{selectedAnalysis?.score?.dimensions?.[key] ?? '-'}</strong>
                  <small>
                    {selectedAnalysis?.score?.dimensionAudit?.items?.[key]?.state ?? '待评估'}
                  </small>
                </p>
              ))}
            </div>
          </section>

          <section className="internal-v4-section" aria-label="规则解释链条">
            <div className="internal-v4-section-title">
              <ShieldAlert size={18} />
              <h3>规则解释链条</h3>
              <span>方向 / 比分 / 总进球 / 大小球 / 资金</span>
            </div>
            <div className="internal-v4-explanation-list">
              {(selectedAnalysis?.explanations ?? []).map((item) => (
                <p key={item.key}>
                  <strong>{item.label}</strong>
                  <span>{item.text}</span>
                </p>
              ))}
            </div>
          </section>

          <section className="internal-v4-section" aria-label="触发规则">
            <div className="internal-v4-section-title">
              <ShieldAlert size={18} />
              <h3>触发规则</h3>
            </div>
            <div className="internal-v4-rule-list">
              {triggeredRules.length ? (
                triggeredRules.slice(0, 10).map((rule) => (
                  <p key={rule.id}>
                    <strong>{rule.label}</strong>
                    <span>{rule.reason}</span>
                  </p>
                ))
              ) : (
                <p>
                  <strong>基础计划</strong>
                  <span>当前按默认低额观察公式生成。</span>
                </p>
              )}
            </div>
          </section>

          <section className="internal-v4-section" aria-label="模拟资金分配">
            <div className="internal-v4-section-title">
              <WalletCards size={18} />
              <h3>模拟资金分配 · 四项投注明细</h3>
              <span>本场总投入 {selectedStakePlan?.totalStake ?? 0}</span>
            </div>
            <div className="internal-v4-stake-grid">
              {(selectedStakePlan?.items ?? []).map((item) => (
                <article className="internal-v4-stake-item" key={item.key}>
                  <span>{item.label}</span>
                  <strong>{item.stake}</strong>
                  <p>
                    {item.key === 'primaryScore' || item.key === 'secondaryScore' ? '比分' : '玩法'}：
                    {formatOverUnderDisplay(item.pick)}
                  </p>
                  <dl>
                    <div>
                      <dt>投入</dt>
                      <dd>{item.stake}</dd>
                    </div>
                    <div>
                      <dt>赔率</dt>
                      <dd>{item.odds}</dd>
                    </div>
                    <div>
                      <dt>赔率来源</dt>
                      <dd>{item.oddsSourceLabel ?? '默认估算'}</dd>
                    </div>
                    <div>
                      <dt>潜在盈利</dt>
                      <dd>{formatPotentialProfit(item.potentialProfit)}</dd>
                    </div>
                    <div>
                      <dt>信心</dt>
                      <dd>{item.confidenceUsed}</dd>
                    </div>
                    <div>
                      <dt>状态</dt>
                      <dd>{getStakeItemStatusLabel(item, selectedRecord)}</dd>
                    </div>
                  </dl>
                  {editingOddsKey === item.key ? (
                    <div className="internal-v4-odds-edit">
                      <input
                        aria-label={`${item.label}赔率`}
                        min="1.01"
                        onChange={(event) =>
                          setOddsDrafts((current) => ({
                            ...current,
                            [item.key]: event.target.value,
                          }))
                        }
                        step="0.01"
                        type="number"
                        value={oddsDrafts[item.key] ?? String(item.odds)}
                      />
                      <button onClick={() => handleSaveOdds(item)} type="button">
                        保存赔率
                      </button>
                    </div>
                  ) : (
                    <div className="internal-v4-odds-actions">
                      <button onClick={() => handleEditOdds(item)} type="button">
                        编辑赔率
                      </button>
                      <button onClick={() => handleRestoreOdds(item)} type="button">
                        恢复默认
                      </button>
                    </div>
                  )}
                  <em>{item.reason}</em>
                  <small>{item.oddsReason}</small>
                </article>
              ))}
            </div>
            {selectedStakePlan?.items?.some(
              (item) => item.key === 'overUnder' && item.pick === '2.5球分界',
            ) ? (
              <p className="internal-v4-boundary-note">
                大小球为 2.5球分界：分界判断，仅保留极小观察额，金额不超过本场总投入 5%。
              </p>
            ) : null}
          </section>

          <section className="internal-v4-section" aria-label="资金公式说明">
            <div className="internal-v4-section-title">
              <Check size={18} />
              <h3>公式说明</h3>
            </div>
            <div className="internal-v4-formula-grid">
              <Metric label="有效资金" value={selectedStakePlan?.effectiveBankroll ?? '-'} />
              <Metric label="基础比例" value={formatRate(selectedStakePlan?.baseRate)} />
              <Metric label="信心因子" value={selectedStakePlan?.confidenceFactor ?? '-'} />
              <Metric label="回撤因子" value={selectedStakePlan?.drawdownFactor ?? '-'} />
              <Metric label="暴露因子" value={selectedStakePlan?.exposureFactor ?? '-'} />
              <Metric label="一致性因子" value={selectedStakePlan?.consistencyFactor ?? '-'} />
            </div>
            <div className="internal-v4-formula-explain">
              <strong>金额公式</strong>
              <span>{selectedStakePlan?.formulaExplanation?.summary ?? '-'}</span>
              {selectedStakePlan?.formulaExplanation?.compressionNote ? (
                <em>{selectedStakePlan.formulaExplanation.compressionNote}</em>
              ) : null}
            </div>
          </section>

          <section className="internal-v4-section" aria-label="一致性检查">
            <div className="internal-v4-section-title">
              <Check size={18} />
              <h3>一致性检查</h3>
              <span>冲突级别 {selectedAnalysis?.consistency?.severity ?? '-'}</span>
            </div>
            <div className="internal-v4-check-list">
              {(selectedAnalysis?.consistency?.checks ?? []).map((check) => (
                <p className={check.passed ? 'passed' : 'failed'} key={check.id}>
                  <span>{check.passed ? '通过' : '冲突'}</span>
                  <strong>{check.label}</strong>
                </p>
              ))}
            </div>
          </section>

          <section className="internal-v4-section" aria-label="复盘结算">
            <div className="internal-v4-section-title">
              <Activity size={18} />
              <h3>复盘输入</h3>
              {selectedRow?.scoreProvider?.status === 'found' ? (
                <span>
                  自动比分 有 · {selectedRow.scoreProvider.homeScore}-{selectedRow.scoreProvider.awayScore} · 来源 {getScoreSourceLabelV5(selectedRow.scoreProvider.source)}
                </span>
              ) : (
                <span>自动比分 无 · {selectedRow?.scoreProvider?.reason ?? '未找到可信比分，等待手动录入。'}</span>
              )}
            </div>
            <div className="internal-v4-score-provider">
              <Metric
                label="比分来源"
                value={getScoreSourceLabelV5(selectedRow?.scoreProvider?.source ?? 'none')}
              />
              <Metric
                label="最近扫描时间"
                value={
                  selectedRow?.scoreProvider?.checkedAt
                    ? new Date(selectedRow.scoreProvider.checkedAt).toLocaleString('zh-CN')
                    : '-'
                }
              />
              <Metric
                label="手动录入提示"
                value={
                  selectedRow?.scoreProvider?.status === 'found'
                    ? '已有可信比分'
                    : '未找到可信比分，等待手动录入'
                }
              />
            </div>
            <div className="internal-v4-settle-form">
              <label>
                主队
                <input
                  min="0"
                  onChange={(event) => setHomeScore(event.target.value)}
                  type="number"
                  value={homeScore}
                />
              </label>
              <label>
                客队
                <input
                  min="0"
                  onChange={(event) => setAwayScore(event.target.value)}
                  type="number"
                  value={awayScore}
                />
              </label>
              <button onClick={handleManualSettle} type="button">
                {isSettledStatus(selectedRecord?.status) ? '重新结算本场' : '结算本场'}
              </button>
            </div>

            {isSettledStatus(selectedRecord?.status) ? (
              <div className="internal-v4-settlement-result">
                <Metric label="本场投入" value={selectedRecord.totalStake} />
                <Metric
                  label="本场盈亏"
                  tone={getTone(selectedRecord.profit)}
                  value={formatAmount(selectedRecord.profit)}
                />
                <Metric label="赛后资金" value={selectedRecord.bankrollAfter} />
                <Metric label="实际比分" value={getScoreTextV4(selectedRecord.actualScore)} />
                <Metric label="结算来源" value={selectedRecord.settlementSource ?? '-'} />
              </div>
            ) : null}
          </section>

          <section className="internal-v4-section" aria-label="ledger JSON">
            <div className="internal-v4-section-title">
              <Download size={18} />
              <h3>ledger JSON</h3>
              <span>V5 key: worldcup_internal_v5_ledger · odds: {INTERNAL_V5_ODDS_OVERRIDE_KEY}</span>
            </div>
            <textarea
              aria-label="ledger JSON 导入导出"
              onChange={(event) => setJsonBuffer(event.target.value)}
              placeholder="导出后会显示 JSON，也可以粘贴 JSON 后导入。"
              value={jsonBuffer}
            />
          </section>
        </section>
      </section>

      <section className="internal-v4-recent" aria-label="最近复盘记录">
        <div className="internal-v4-panel-head">
          <div>
            <span>Ledger Review</span>
            <h2>最近复盘记录</h2>
          </div>
          <strong>最多 20 条</strong>
        </div>

        <div className="internal-v4-recent-grid">
          {summary.lastRecords.length ? (
            summary.lastRecords.map((record) => (
              <article key={record.id}>
                <span>{record.settledAt ? new Date(record.settledAt).toLocaleString('zh-CN') : '-'}</span>
                <strong>{record.matchName}</strong>
                <p>
                  比分 {getScoreTextV4(record.actualScore)} · 投入 {record.totalStake} · 盈亏{' '}
                  <b className={getTone(record.profit)}>{formatAmount(record.profit)}</b>
                </p>
                <small>
                  资金 {record.bankrollAfter} · 来源 {record.settlementSource} · 比分源{' '}
                  {record.actualScoreSource}
                </small>
              </article>
            ))
          ) : (
            <p className="internal-v4-empty-line">暂无最近复盘记录。</p>
          )}
        </div>
      </section>

      <footer className="internal-v4-footer">
        <span>{notice}</span>
        <small>
          报告：当前资金 {summary.currentBankroll}，当前范围未结算暴露 {summary.pendingExposure}，
          当前范围已结算 {summary.settledCount}。
        </small>
      </footer>
    </main>
  )
}

export default InternalCommandCenterV4
