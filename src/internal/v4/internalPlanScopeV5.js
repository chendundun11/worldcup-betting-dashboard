import {
  getKickoffTimeV4,
  getMatchIdV4,
} from './internalSelectorsV4.js'

export const INTERNAL_V5_PLAN_SCOPE_KEY = 'worldcup_internal_v5_plan_scope'

export const PLAN_SCOPE_V5 = {
  future24h: 'future_24h',
  todayBeijing: 'today_beijing',
  allPreview: 'all_preview',
  settledOnly: 'settled_only',
}

export const DEFAULT_PLAN_SCOPE_V5 = PLAN_SCOPE_V5.future24h

export const PLAN_SCOPE_OPTIONS_V5 = [
  {
    key: PLAN_SCOPE_V5.future24h,
    label: '未来24小时',
    actionLabel: '生成/刷新未来24小时计划',
    description: '只把未来 24 小时内比赛计入资金暴露',
  },
  {
    key: PLAN_SCOPE_V5.todayBeijing,
    label: '北京时间今天',
    actionLabel: '生成北京时间今天计划',
    description: '只把北京时间当天比赛计入资金暴露',
  },
  {
    key: PLAN_SCOPE_V5.allPreview,
    label: '全赛程预览',
    actionLabel: '全赛程预览',
    description: '只预览判断，不计入资金暴露',
  },
  {
    key: PLAN_SCOPE_V5.settledOnly,
    label: '只看已结算',
    actionLabel: '只看已结算',
    description: '只查看已经进入 ledger 的复盘记录',
  },
]

function hasStorage() {
  return typeof window !== 'undefined' && Boolean(window.localStorage)
}

function normalizePlanScope(planScope) {
  return Object.values(PLAN_SCOPE_V5).includes(planScope)
    ? planScope
    : DEFAULT_PLAN_SCOPE_V5
}

function getDate(value) {
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export function getBeijingDateKeyV5(value) {
  const date = getDate(value)
  if (!date) return ''

  const parts = new Intl.DateTimeFormat('en-CA', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
  }).formatToParts(date)
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

export function getPlanScopeLabelV5(planScope) {
  return (
    PLAN_SCOPE_OPTIONS_V5.find((item) => item.key === planScope)?.label ??
    PLAN_SCOPE_OPTIONS_V5[0].label
  )
}

export function isPreviewPlanScopeV5(planScope) {
  return planScope === PLAN_SCOPE_V5.allPreview
}

export function isFormalPlanScopeV5(planScope) {
  return planScope === PLAN_SCOPE_V5.future24h || planScope === PLAN_SCOPE_V5.todayBeijing
}

export function readPlanScopeV5() {
  if (!hasStorage()) return DEFAULT_PLAN_SCOPE_V5
  return normalizePlanScope(window.localStorage.getItem(INTERNAL_V5_PLAN_SCOPE_KEY))
}

export function savePlanScopeV5(planScope) {
  const normalized = normalizePlanScope(planScope)
  if (hasStorage()) window.localStorage.setItem(INTERNAL_V5_PLAN_SCOPE_KEY, normalized)
  return normalized
}

export function isMatchInFuture24hV5(match, now = new Date()) {
  const kickoffTime = getKickoffTimeV4(match)
  if (kickoffTime === null) return false
  const nowTime = now.getTime()
  return kickoffTime >= nowTime && kickoffTime <= nowTime + 24 * 60 * 60 * 1000
}

export function isMatchTodayBeijingV5(match, now = new Date()) {
  const kickoffTime = getKickoffTimeV4(match)
  if (kickoffTime === null) return false
  return getBeijingDateKeyV5(kickoffTime) === getBeijingDateKeyV5(now)
}

function isSettledRecord(record) {
  return record?.status === 'settled_auto' || record?.status === 'settled_manual'
}

export function selectMatchesByPlanScopeV5(matches = [], planScope = DEFAULT_PLAN_SCOPE_V5, options = {}) {
  const normalizedScope = normalizePlanScope(planScope)
  const now = options.now ?? new Date()
  const ledgerRecords = Array.isArray(options.ledger?.records) ? options.ledger.records : []
  const settledMatchKeys = new Set(
    ledgerRecords
      .filter(isSettledRecord)
      .map((record) => String(record.matchId ?? '').replace(/^v5-/, '')),
  )

  if (normalizedScope === PLAN_SCOPE_V5.allPreview) return matches.slice()
  if (normalizedScope === PLAN_SCOPE_V5.settledOnly) {
    return matches.filter((match) => settledMatchKeys.has(getMatchIdV4(match)))
  }
  if (normalizedScope === PLAN_SCOPE_V5.todayBeijing) {
    return matches.filter((match) => isMatchTodayBeijingV5(match, now))
  }
  return matches.filter((match) => isMatchInFuture24hV5(match, now))
}

export function describePlanScopeV5(planScope, matches = [], options = {}) {
  const scopedMatches = selectMatchesByPlanScopeV5(matches, planScope, options)
  return {
    planScope: normalizePlanScope(planScope),
    label: getPlanScopeLabelV5(planScope),
    matchCount: scopedMatches.length,
    isPreview: isPreviewPlanScopeV5(planScope),
    isFormal: isFormalPlanScopeV5(planScope),
  }
}
