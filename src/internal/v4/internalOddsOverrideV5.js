import { toFiniteNumber } from './internalSelectorsV4.js'

export const INTERNAL_V5_ODDS_OVERRIDE_KEY = 'worldcup_internal_v5_odds_overrides'

function hasStorage() {
  return typeof window !== 'undefined' && Boolean(window.localStorage)
}

function nowIso() {
  return new Date().toISOString()
}

export function normalizeOddsOverridesV5(raw = {}) {
  const entries = Object.entries(raw ?? {})
  const normalized = {}

  for (const [matchKey, value] of entries) {
    const itemEntries = Object.entries(value ?? {})
    const items = {}
    for (const [itemKey, item] of itemEntries) {
      const odds = toFiniteNumber(item?.odds, NaN)
      if (!Number.isFinite(odds) || odds <= 1) continue
      items[itemKey] = {
        odds,
        source: 'manual',
        isManual: true,
        updatedAt: item?.updatedAt ?? nowIso(),
      }
    }
    if (Object.keys(items).length) normalized[matchKey] = items
  }

  return normalized
}

export function loadOddsOverridesV5() {
  if (!hasStorage()) return {}
  try {
    const raw = window.localStorage.getItem(INTERNAL_V5_ODDS_OVERRIDE_KEY)
    return raw ? normalizeOddsOverridesV5(JSON.parse(raw)) : {}
  } catch {
    return {}
  }
}

export function saveOddsOverridesV5(overrides) {
  const normalized = normalizeOddsOverridesV5(overrides)
  if (hasStorage()) {
    window.localStorage.setItem(INTERNAL_V5_ODDS_OVERRIDE_KEY, JSON.stringify(normalized))
  }
  return normalized
}

export function setOddsOverrideV5(overrides, matchKey, itemKey, odds) {
  const normalizedOdds = toFiniteNumber(odds, NaN)
  if (!matchKey || !itemKey || !Number.isFinite(normalizedOdds) || normalizedOdds <= 1) {
    return normalizeOddsOverridesV5(overrides)
  }

  return normalizeOddsOverridesV5({
    ...overrides,
    [matchKey]: {
      ...(overrides?.[matchKey] ?? {}),
      [itemKey]: {
        odds: normalizedOdds,
        source: 'manual',
        isManual: true,
        updatedAt: nowIso(),
      },
    },
  })
}

export function removeOddsOverrideV5(overrides, matchKey, itemKey) {
  const normalized = normalizeOddsOverridesV5(overrides)
  if (!normalized[matchKey]) return normalized
  const nextItems = { ...normalized[matchKey] }
  delete nextItems[itemKey]
  if (!Object.keys(nextItems).length) {
    const next = { ...normalized }
    delete next[matchKey]
    return next
  }
  return {
    ...normalized,
    [matchKey]: nextItems,
  }
}
