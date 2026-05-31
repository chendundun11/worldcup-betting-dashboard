export const ANALYSIS_SNAPSHOT_ROW_FIELDS = [
  'schema_version',
  'match_id',
  'match_key',
  'kickoff_at',
  'home_team',
  'away_team',
  'status',
  'provider',
  'data_source',
  'fallback_reason',
  'source_updated_at',
  'engine_version',
  'bet_score',
  'recommend_level',
  'public_match_snapshot',
  'engine_snapshot',
  'internal_snapshot',
  'data_quality',
  'cancel_rules',
]

const PUBLIC_SNAPSHOT_BLOCKED_KEYS = new Set([
  'totalStake',
  'stakePlan',
  'bankroll',
  'stake',
  'amount',
  'money',
  'internalSnapshot',
])

const PAYLOAD_BLOCKED_KEYS = new Set([
  'selectedIndex',
  'sourceIndex',
  'showInternalEngine',
])

const INTERNAL_SNAPSHOT_ALLOWED_KEYS = new Set([
  'totalStake',
  'stakePlan',
  'bankroll',
  'lightDataLayer',
])

function isPlainObject(value) {
  return Object.prototype.toString.call(value) === '[object Object]'
}

function firstPresent(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== '')
}

function hasPresentField(source, key) {
  return (
    isPlainObject(source) &&
    Object.prototype.hasOwnProperty.call(source, key) &&
    source[key] !== undefined &&
    source[key] !== null &&
    source[key] !== ''
  )
}

function canStringify(value) {
  try {
    JSON.stringify(value)
    return true
  } catch {
    return false
  }
}

function cloneJson(value) {
  if (value === undefined) return null
  return JSON.parse(JSON.stringify(value))
}

function normalizeNumber(value) {
  if (value === undefined || value === null || value === '') return null
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : null
}

function collectBlockedKeyPaths(value, blockedKeys, path = '$', seen = new WeakSet()) {
  if (!value || typeof value !== 'object') return []
  if (seen.has(value)) return []

  seen.add(value)

  const entries = Array.isArray(value)
    ? value.map((item, index) => [index, item])
    : Object.entries(value)
  const matches = []

  for (const [key, item] of entries) {
    const keyText = String(key)
    const nextPath = Array.isArray(value) ? `${path}[${keyText}]` : `${path}.${keyText}`

    if (!Array.isArray(value) && blockedKeys.has(keyText)) {
      matches.push(nextPath)
    }

    matches.push(...collectBlockedKeyPaths(item, blockedKeys, nextPath, seen))
  }

  seen.delete(value)
  return matches
}

function getObject(value) {
  return isPlainObject(value) ? value : {}
}

function validateInternalSnapshot(internalSnapshot, errors) {
  if (internalSnapshot === undefined || internalSnapshot === null) return

  if (!isPlainObject(internalSnapshot)) {
    errors.push('internalSnapshot must be an object when present.')
    return
  }

  for (const key of Object.keys(internalSnapshot)) {
    if (!INTERNAL_SNAPSHOT_ALLOWED_KEYS.has(key)) {
      errors.push(`internalSnapshot contains unsupported field: ${key}`)
    }
  }
}

function validateSnapshotPayload(payload) {
  const errors = []

  if (!isPlainObject(payload)) {
    return ['payload must be an object.']
  }

  if (!canStringify(payload)) {
    errors.push('payload must be JSON.stringify compatible.')
  }

  if (!isPlainObject(payload.matchIdentity)) {
    errors.push('matchIdentity is required and must be an object.')
  } else if (!hasPresentField(payload.matchIdentity, 'matchKey')) {
    errors.push('matchIdentity.matchKey is required.')
  }

  if (!isPlainObject(payload.publicMatchSnapshot)) {
    errors.push('publicMatchSnapshot is required and must be an object.')
  }

  if (!isPlainObject(payload.engineSnapshot)) {
    errors.push('engineSnapshot is required and must be an object.')
  }

  for (const blockedPath of collectBlockedKeyPaths(payload, PAYLOAD_BLOCKED_KEYS)) {
    errors.push(`payload contains blocked UI field: ${blockedPath}`)
  }

  if (isPlainObject(payload.publicMatchSnapshot)) {
    for (const blockedPath of collectBlockedKeyPaths(
      payload.publicMatchSnapshot,
      PUBLIC_SNAPSHOT_BLOCKED_KEYS,
      '$.publicMatchSnapshot',
    )) {
      errors.push(`publicMatchSnapshot contains blocked field: ${blockedPath}`)
    }
  }

  validateInternalSnapshot(payload.internalSnapshot, errors)

  return errors
}

export function buildAnalysisSnapshotRow(payload, options = {}) {
  const errors = validateSnapshotPayload(payload)

  if (errors.length) {
    return { ok: false, errors }
  }

  const matchIdentity = getObject(payload.matchIdentity)
  const sourceMeta = getObject(payload.sourceMeta)
  const publicMatchSnapshot = getObject(payload.publicMatchSnapshot)
  const engineSnapshot = getObject(payload.engineSnapshot)
  const row = {
    schema_version: payload.schemaVersion,
    match_id: firstPresent(matchIdentity.matchId) ?? null,
    match_key: matchIdentity.matchKey,
    kickoff_at:
      firstPresent(
        matchIdentity.kickoffAt,
        publicMatchSnapshot.kickoffAt,
        matchIdentity.kickoff,
        publicMatchSnapshot.kickoff,
      ) ?? null,
    home_team:
      firstPresent(matchIdentity.homeTeam, publicMatchSnapshot.homeTeam) ?? null,
    away_team:
      firstPresent(matchIdentity.awayTeam, publicMatchSnapshot.awayTeam) ?? null,
    status:
      firstPresent(
        matchIdentity.status,
        publicMatchSnapshot.status,
        publicMatchSnapshot.matchStatus,
      ) ?? null,
    provider: firstPresent(sourceMeta.provider) ?? null,
    data_source: firstPresent(sourceMeta.dataSource) ?? null,
    fallback_reason: firstPresent(sourceMeta.fallbackReason) ?? null,
    source_updated_at:
      firstPresent(sourceMeta.sourceUpdatedAt, sourceMeta.updatedAt, sourceMeta.capturedAt) ??
      null,
    engine_version:
      firstPresent(engineSnapshot.engineVersion, options.engineVersion) ?? null,
    bet_score: normalizeNumber(engineSnapshot.betScore),
    recommend_level: firstPresent(engineSnapshot.recommendLevel) ?? null,
    public_match_snapshot: cloneJson(publicMatchSnapshot),
    engine_snapshot: cloneJson(engineSnapshot),
    internal_snapshot:
      payload.internalSnapshot === undefined || payload.internalSnapshot === null
        ? null
        : cloneJson(payload.internalSnapshot),
    data_quality:
      payload.dataQuality === undefined || payload.dataQuality === null
        ? null
        : cloneJson(payload.dataQuality),
    cancel_rules:
      payload.cancelRules === undefined || payload.cancelRules === null
        ? null
        : cloneJson(payload.cancelRules),
  }

  if (!canStringify(row)) {
    return {
      ok: false,
      errors: ['row must be JSON.stringify compatible.'],
    }
  }

  return { ok: true, row }
}

export default buildAnalysisSnapshotRow
