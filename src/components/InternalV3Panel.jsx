import { useMemo, useState } from 'react'
import { buildV3InternalAnalysis } from '../services/scoringV3Internal.js'
import {
  getLedger,
  getLedgerSummary,
  resetLedger,
} from '../services/internalLedgerV3.js'
import { settleV3Match } from '../services/settlementV3.js'

const styles = {
  panel: {
    background: '#0f172a',
    border: '1px solid rgba(148, 163, 184, 0.36)',
    borderRadius: 8,
    color: '#e2e8f0',
    margin: '24px auto',
    maxWidth: 1180,
    padding: 20,
    width: 'calc(100% - 32px)',
  },
  header: {
    alignItems: 'flex-start',
    display: 'flex',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    lineHeight: 1.25,
    margin: 0,
  },
  muted: {
    color: '#94a3b8',
    fontSize: 13,
    margin: 0,
  },
  grid: {
    display: 'grid',
    gap: 12,
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  },
  section: {
    background: 'rgba(15, 23, 42, 0.72)',
    border: '1px solid rgba(148, 163, 184, 0.24)',
    borderRadius: 8,
    padding: 14,
  },
  sectionTitle: {
    color: '#f8fafc',
    fontSize: 15,
    margin: '0 0 10px',
  },
  row: {
    display: 'flex',
    gap: 10,
    justifyContent: 'space-between',
    margin: '7px 0',
  },
  label: {
    color: '#94a3b8',
    fontSize: 13,
  },
  value: {
    color: '#f8fafc',
    fontSize: 13,
    fontWeight: 700,
    textAlign: 'right',
  },
  itemList: {
    display: 'grid',
    gap: 8,
  },
  item: {
    borderTop: '1px solid rgba(148, 163, 184, 0.18)',
    paddingTop: 8,
  },
  input: {
    background: '#020617',
    border: '1px solid rgba(148, 163, 184, 0.5)',
    borderRadius: 6,
    color: '#e2e8f0',
    fontSize: 14,
    padding: '8px 10px',
    width: 80,
  },
  button: {
    background: '#38bdf8',
    border: 0,
    borderRadius: 6,
    color: '#082f49',
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: 800,
    padding: '9px 12px',
  },
  secondaryButton: {
    background: 'transparent',
    border: '1px solid rgba(148, 163, 184, 0.5)',
    borderRadius: 6,
    color: '#e2e8f0',
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: 700,
    padding: '8px 12px',
  },
  table: {
    display: 'grid',
    gap: 6,
  },
  record: {
    borderTop: '1px solid rgba(148, 163, 184, 0.18)',
    display: 'grid',
    gap: 6,
    gridTemplateColumns: '1.4fr 0.6fr 0.6fr 0.8fr',
    paddingTop: 8,
  },
}

function formatAmount(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return '0'
  return number > 0 ? `+${number}` : String(number)
}

function resultLabel(result) {
  if (result === 'win') return '赢'
  if (result === 'loss') return '输'
  return '跳过'
}

function StatusRow({ label, value }) {
  return (
    <p style={styles.row}>
      <span style={styles.label}>{label}</span>
      <strong style={styles.value}>{value}</strong>
    </p>
  )
}

function getMatchStateKey(match) {
  return match ? `${match.id ?? ''}:${match.uiKey ?? ''}` : 'none'
}

function createMatchFormState(matchKey) {
  return {
    matchKey,
    homeScore: '',
    awayScore: '',
    settlement: null,
    notice: '',
  }
}

function InternalV3Panel({ activeMatch, matches = [] }) {
  const [ledger, setLedger] = useState(() => getLedger())
  const activeMatchKey = getMatchStateKey(activeMatch)
  const [matchFormState, setMatchFormState] = useState(() =>
    createMatchFormState(activeMatchKey),
  )
  const currentMatchFormState =
    matchFormState.matchKey === activeMatchKey
      ? matchFormState
      : createMatchFormState(activeMatchKey)
  const { homeScore, awayScore, settlement, notice } = currentMatchFormState

  function updateMatchFormState(patch) {
    setMatchFormState((current) => ({
      ...(current.matchKey === activeMatchKey ? current : createMatchFormState(activeMatchKey)),
      ...patch,
      matchKey: activeMatchKey,
    }))
  }

  const summary = useMemo(() => getLedgerSummary(ledger), [ledger])
  const analysis = useMemo(
    () =>
      activeMatch
        ? buildV3InternalAnalysis(activeMatch, {
            bankroll: summary.currentBankroll,
            previousLedger: ledger,
          })
        : null,
    [activeMatch, ledger, summary.currentBankroll],
  )

  if (!import.meta.env.DEV || !analysis) return null

  function handleSettle() {
    if (homeScore === '' || awayScore === '') {
      updateMatchFormState({ notice: '请先输入实际比分。' })
      return
    }

    const result = settleV3Match(
      analysis,
      {
        home: Number(homeScore),
        away: Number(awayScore),
      },
      ledger,
    )

    setLedger(result.ledger)
    updateMatchFormState({
      settlement: result,
      notice: '本场已结算并写入本地记录。',
    })
  }

  function handleReset() {
    const nextLedger = resetLedger()
    setLedger(nextLedger)
    updateMatchFormState({
      settlement: null,
      notice: '内部资金池已重置。',
    })
  }

  const consistencyRows = [
    ['方向/比分', analysis.consistency.directionAligned],
    ['总进球', analysis.consistency.totalGoalsAligned],
    ['大小球', analysis.consistency.overUnderAligned],
    ['资金上限', analysis.consistency.stakeAligned],
  ]

  return (
    <section aria-label="V3 内部面板" style={styles.panel}>
      <div style={styles.header}>
        <div>
          <h2 style={styles.title}>V3 内部面板</h2>
          <p style={styles.muted}>内部模拟，不对外展示。当前载入 {matches.length} 场。</p>
        </div>
        <button onClick={handleReset} style={styles.secondaryButton} type="button">
          重置内部资金池
        </button>
      </div>

      <div style={styles.grid}>
        <article style={styles.section}>
          <h3 style={styles.sectionTitle}>内部资金池</h3>
          <StatusRow label="初始资金" value={summary.initialBankroll} />
          <StatusRow label="当前资金" value={summary.currentBankroll} />
          <StatusRow label="累计盈亏" value={formatAmount(summary.totalProfit)} />
          <StatusRow label="已复盘" value={`${summary.settledCount} 场`} />
        </article>

        <article style={styles.section}>
          <h3 style={styles.sectionTitle}>当前比赛内部判断</h3>
          <StatusRow label="比赛" value={analysis.matchInfo.matchName} />
          <StatusRow label="内部主判" value={analysis.decision.mainPick} />
          <StatusRow label="进攻方向" value={analysis.decision.attackPick} />
          <StatusRow label="防守方向" value={analysis.decision.coverPick} />
          <StatusRow label="比赛类型" value={analysis.profile.matchType} />
          <StatusRow label="内部强度" value={analysis.decision.confidenceBand} />
          <StatusRow label="执行态度" value={analysis.decision.executionMode} />
        </article>

        <article style={styles.section}>
          <h3 style={styles.sectionTitle}>模拟资金分配</h3>
          <StatusRow label="本场总投入" value={analysis.stakePlan.totalStake} />
          <div style={styles.itemList}>
            {analysis.stakePlan.stakeItems.map((item) => (
              <div key={item.key} style={styles.item}>
                <StatusRow label={item.label} value={item.stake} />
                <StatusRow label="玩法" value={item.pick} />
                <StatusRow label="赔率" value={item.odds.toFixed(2)} />
                <StatusRow label="原因" value={item.reason} />
              </div>
            ))}
          </div>
        </article>

        <article style={styles.section}>
          <h3 style={styles.sectionTitle}>预测与一致性检查</h3>
          <StatusRow label="主推比分" value={analysis.predictions.primaryScore} />
          <StatusRow label="备用比分" value={analysis.predictions.secondaryScore} />
          <StatusRow label="总进球" value={analysis.predictions.totalGoals} />
          <StatusRow label="大小球" value={analysis.predictions.overUnder} />
          {consistencyRows.map(([label, passed]) => (
            <StatusRow key={label} label={label} value={passed ? '通过' : '冲突'} />
          ))}
          {analysis.consistency.hasConflict ? (
            <p style={styles.muted}>{analysis.consistency.conflictReasons.join('；')}</p>
          ) : null}
        </article>

        <article style={styles.section}>
          <h3 style={styles.sectionTitle}>简陋复盘</h3>
          <div style={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <label style={styles.label}>
              主队进球{' '}
              <input
                min="0"
                onChange={(event) => updateMatchFormState({ homeScore: event.target.value })}
                style={styles.input}
                type="number"
                value={homeScore}
              />
            </label>
            <label style={styles.label}>
              客队进球{' '}
              <input
                min="0"
                onChange={(event) => updateMatchFormState({ awayScore: event.target.value })}
                style={styles.input}
                type="number"
                value={awayScore}
              />
            </label>
            <button onClick={handleSettle} style={styles.button} type="button">
              结算本场
            </button>
          </div>
          {notice ? <p style={styles.muted}>{notice}</p> : null}
          {settlement ? (
            <div style={styles.item}>
              <StatusRow label="本场投入" value={settlement.totalStake} />
              <StatusRow label="本场盈亏" value={formatAmount(settlement.profit)} />
              <StatusRow label="资金池余额" value={settlement.bankrollAfter} />
              {settlement.itemResults.map((item) => (
                <StatusRow
                  key={item.key}
                  label={item.label}
                  value={resultLabel(item.result)}
                />
              ))}
            </div>
          ) : null}
        </article>

        <article style={styles.section}>
          <h3 style={styles.sectionTitle}>最近复盘</h3>
          <div style={styles.table}>
            {summary.lastRecords.length ? (
              summary.lastRecords.map((record) => (
                <div key={record.id} style={styles.record}>
                  <span style={styles.label}>{record.matchName}</span>
                  <strong style={styles.value}>{record.actualScore}</strong>
                  <strong style={styles.value}>{formatAmount(record.profit)}</strong>
                  <strong style={styles.value}>{record.bankrollAfter}</strong>
                </div>
              ))
            ) : (
              <p style={styles.muted}>暂无复盘记录。</p>
            )}
          </div>
        </article>
      </div>
    </section>
  )
}

export default InternalV3Panel
