import { DEFAULT_INTERNAL_ODDS_V4 } from './internalTypesV4.js'
import {
  getMatchIdV4,
  roundTo,
  toFiniteNumber,
} from './internalSelectorsV4.js'
import { normalizeOddsOverridesV5 } from './internalOddsOverrideV5.js'

export const ODDS_SOURCE_LABELS_V5 = {
  manual: '手动覆盖',
  local_odds: '本地盘口',
  remote_odds: '远程盘口',
  default_estimate: '默认估算',
}

function nowIso() {
  return new Date().toISOString()
}

function getMatchKey(match) {
  return getMatchIdV4(match)
}

function getManualOverride(match, itemKey, overrides = {}) {
  const normalized = normalizeOddsOverridesV5(overrides)
  return normalized?.[getMatchKey(match)]?.[itemKey] ?? null
}

function getOddsValue(source, key) {
  const number = toFiniteNumber(source?.[key], NaN)
  return Number.isFinite(number) && number > 1 ? number : null
}

function getLocalOdds(match, item) {
  const local = match?.localOdds ?? match?.odds ?? null
  if (!local) return null

  if (item.key === 'mainDirection') {
    if (item.pick === '主队胜') return getOddsValue(local, 'home') ?? getOddsValue(local, 'homeWin')
    if (item.pick === '客队胜') return getOddsValue(local, 'away') ?? getOddsValue(local, 'awayWin')
    if (item.pick === '平局') return getOddsValue(local, 'draw')
  }

  if (item.key === 'overUnder') {
    if (item.pick === '大2.5') return getOddsValue(local, 'over25')
    if (item.pick === '小2.5') return getOddsValue(local, 'under25')
  }

  if (item.key === 'primaryScore') {
    return getOddsValue(local?.scores, item.pick) ?? getOddsValue(local?.scoreOdds, item.pick)
  }

  if (item.key === 'secondaryScore') {
    return getOddsValue(local?.scores, item.pick) ?? getOddsValue(local?.scoreOdds, item.pick)
  }

  return null
}

function getRemoteOdds(match, item) {
  const remote = match?.remoteOdds ?? null
  if (!remote) return null

  if (item.key === 'mainDirection') {
    if (item.pick === '主队胜') return getOddsValue(remote, 'home') ?? getOddsValue(remote, 'homeWin')
    if (item.pick === '客队胜') return getOddsValue(remote, 'away') ?? getOddsValue(remote, 'awayWin')
    if (item.pick === '平局') return getOddsValue(remote, 'draw')
  }

  if (item.key === 'overUnder') {
    if (item.pick === '大2.5') return getOddsValue(remote, 'over25')
    if (item.pick === '小2.5') return getOddsValue(remote, 'under25')
  }

  if (item.key === 'primaryScore' || item.key === 'secondaryScore') {
    return getOddsValue(remote?.scores, item.pick) ?? getOddsValue(remote?.scoreOdds, item.pick)
  }

  return null
}

function getDefaultOdds(itemKey) {
  return DEFAULT_INTERNAL_ODDS_V4[itemKey] ?? 1.7
}

function makeOddsItem(item, odds, source, reason, isManual = false) {
  return {
    key: item.key,
    market: item.key,
    pick: item.pick,
    odds: roundTo(odds, 2),
    source,
    sourceLabel: ODDS_SOURCE_LABELS_V5[source] ?? ODDS_SOURCE_LABELS_V5.default_estimate,
    isManual,
    updatedAt: nowIso(),
    reason,
  }
}

export function resolveInternalOddsItemV5(match, item, overrides = {}) {
  const manual = getManualOverride(match, item.key, overrides)
  if (manual) {
    return makeOddsItem(item, manual.odds, 'manual', '该玩法使用本场手动赔率覆盖。', true)
  }

  const remoteOdds = getRemoteOdds(match, item)
  if (remoteOdds) {
    return makeOddsItem(item, remoteOdds, 'remote_odds', '来自远程结构化赔率源。')
  }

  const localOdds = getLocalOdds(match, item)
  if (localOdds) {
    return makeOddsItem(item, localOdds, 'local_odds', '来自项目本地盘口快照。')
  }

  return makeOddsItem(
    item,
    getDefaultOdds(item.key),
    'default_estimate',
    '没有可用盘口，使用内部默认估算，不代表真实盘口。',
  )
}

export function buildInternalOddsItemsV5(match, items = [], overrides = {}) {
  return items.map((item) => resolveInternalOddsItemV5(match, item, overrides))
}

export function applyOddsToStakeItemsV5(match, items = [], overrides = {}) {
  const oddsItems = buildInternalOddsItemsV5(match, items, overrides)
  const oddsByKey = new Map(oddsItems.map((item) => [item.key, item]))

  return items.map((item) => {
    const oddsItem = oddsByKey.get(item.key)
    const odds = toFiniteNumber(oddsItem?.odds, item.odds)
    const stake = toFiniteNumber(item.stake, 0)
    const isBoundaryOverUnder = item.key === 'overUnder' && item.pick === '2.5球分界'

    return {
      ...item,
      odds,
      oddsSource: oddsItem?.source ?? 'default_estimate',
      oddsSourceLabel: oddsItem?.sourceLabel ?? ODDS_SOURCE_LABELS_V5.default_estimate,
      oddsReason: oddsItem?.reason ?? '没有可用盘口，使用内部默认估算，不代表真实盘口。',
      isManualOdds: oddsItem?.isManual ?? false,
      oddsUpdatedAt: oddsItem?.updatedAt ?? nowIso(),
      potentialProfit: roundTo(stake > 0 ? stake * (odds - 1) : 0, 2),
      status: item.status ?? (isBoundaryOverUnder ? 'observation' : 'pending'),
    }
  })
}

export function refreshStakePlanOddsV5(stakePlan, match, overrides = {}) {
  const items = applyOddsToStakeItemsV5(match, stakePlan?.items ?? [], overrides)
  return {
    ...stakePlan,
    items,
    oddsSourceSummary: Array.from(new Set(items.map((item) => item.oddsSourceLabel))).join(' / '),
  }
}
