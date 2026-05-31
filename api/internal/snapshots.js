const DISABLED_RESPONSE = {
  ok: false,
  disabled: true,
  message: 'Snapshot writing is disabled.',
}

const ACCEPTED_DRY_RUN_RESPONSE = {
  ok: true,
  dryRun: true,
  message: 'Snapshot payload accepted. Database write not implemented.',
}

const TOP_LEVEL_ALLOWED_KEYS = new Set([
  'schemaVersion',
  'createdAt',
  'matchIdentity',
  'sourceMeta',
  'publicMatchSnapshot',
  'engineSnapshot',
  'internalSnapshot',
  'dataQuality',
  'cancelRules',
])

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

function sendJson(response, statusCode, body) {
  response.status(statusCode).json(body)
}

function getHeader(request, name) {
  const headers = request.headers ?? {}

  if (typeof headers.get === 'function') {
    return headers.get(name)
  }

  const targetName = name.toLowerCase()
  const matchingEntry = Object.entries(headers).find(
    ([key]) => key.toLowerCase() === targetName,
  )
  const value = matchingEntry?.[1]

  return Array.isArray(value) ? value[0] : value
}

function isPlainObject(value) {
  return Object.prototype.toString.call(value) === '[object Object]'
}

function hasPresentField(source, key) {
  return (
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

function validateInternalSnapshot(payload, errors) {
  if (payload.internalSnapshot === undefined || payload.internalSnapshot === null) {
    return
  }

  if (!isPlainObject(payload.internalSnapshot)) {
    errors.push('internalSnapshot must be an object when present.')
    return
  }

  for (const key of Object.keys(payload.internalSnapshot)) {
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

  for (const key of Object.keys(payload)) {
    if (!TOP_LEVEL_ALLOWED_KEYS.has(key)) {
      errors.push(`Unexpected top-level field: ${key}`)
    }
  }

  if (!hasPresentField(payload, 'schemaVersion')) {
    errors.push('schemaVersion is required.')
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

  const blockedPayloadPaths = collectBlockedKeyPaths(payload, PAYLOAD_BLOCKED_KEYS)
  for (const blockedPath of blockedPayloadPaths) {
    errors.push(`payload contains blocked UI field: ${blockedPath}`)
  }

  if (isPlainObject(payload.publicMatchSnapshot)) {
    const publicBlockedPaths = collectBlockedKeyPaths(
      payload.publicMatchSnapshot,
      PUBLIC_SNAPSHOT_BLOCKED_KEYS,
      '$.publicMatchSnapshot',
    )

    for (const blockedPath of publicBlockedPaths) {
      errors.push(`publicMatchSnapshot contains blocked field: ${blockedPath}`)
    }
  }

  validateInternalSnapshot(payload, errors)

  return errors
}

async function readRequestBody(request) {
  if (request.body !== undefined) {
    return request.body
  }

  if (typeof request[Symbol.asyncIterator] !== 'function') {
    return undefined
  }

  const chunks = []

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }

  if (!chunks.length) return undefined

  return Buffer.concat(chunks).toString('utf8')
}

async function parseRequestPayload(request) {
  const body = await readRequestBody(request)

  if (body === undefined || body === null || body === '') {
    return { payload: null }
  }

  if (typeof body === 'string') {
    try {
      return { payload: JSON.parse(body) }
    } catch {
      return { payload: null, error: 'Request body must be valid JSON.' }
    }
  }

  if (Buffer.isBuffer(body) || body instanceof Uint8Array) {
    try {
      return { payload: JSON.parse(Buffer.from(body).toString('utf8')) }
    } catch {
      return { payload: null, error: 'Request body must be valid JSON.' }
    }
  }

  return { payload: body }
}

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST')
    sendJson(response, 405, {
      ok: false,
      message: 'Method not allowed.',
    })
    return
  }

  if (process.env.SNAPSHOT_WRITE_ENABLED !== 'true') {
    sendJson(response, 200, DISABLED_RESPONSE)
    return
  }

  const expectedToken = process.env.SNAPSHOT_WRITE_TOKEN
  const providedToken = getHeader(request, 'x-snapshot-write-token')

  if (!expectedToken || providedToken !== expectedToken) {
    sendJson(response, 401, {
      ok: false,
      message: 'Unauthorized.',
    })
    return
  }

  const { payload, error } = await parseRequestPayload(request)

  if (error) {
    sendJson(response, 400, {
      ok: false,
      errors: [error],
    })
    return
  }

  const errors = validateSnapshotPayload(payload)

  if (errors.length) {
    sendJson(response, 400, {
      ok: false,
      errors,
    })
    return
  }

  sendJson(response, 200, ACCEPTED_DRY_RUN_RESPONSE)
}
