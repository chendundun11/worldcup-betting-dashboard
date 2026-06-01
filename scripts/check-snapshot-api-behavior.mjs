import handler, { createSnapshotHandler } from '../api/internal/snapshots.js'

const ORIGINAL_ENV = {
  DATABASE_URL: process.env.DATABASE_URL,
  SNAPSHOT_WRITE_ENABLED: process.env.SNAPSHOT_WRITE_ENABLED,
  SNAPSHOT_WRITE_TOKEN: process.env.SNAPSHOT_WRITE_TOKEN,
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function restoreEnvValue(key, value) {
  if (value === undefined) {
    delete process.env[key]
    return
  }

  process.env[key] = value
}

function restoreEnv() {
  restoreEnvValue('DATABASE_URL', ORIGINAL_ENV.DATABASE_URL)
  restoreEnvValue('SNAPSHOT_WRITE_ENABLED', ORIGINAL_ENV.SNAPSHOT_WRITE_ENABLED)
  restoreEnvValue('SNAPSHOT_WRITE_TOKEN', ORIGINAL_ENV.SNAPSHOT_WRITE_TOKEN)
}

function setSnapshotEnv({ databaseUrl, enabled, token }) {
  if (databaseUrl === undefined) {
    delete process.env.DATABASE_URL
  } else {
    process.env.DATABASE_URL = databaseUrl
  }

  if (enabled === undefined) {
    delete process.env.SNAPSHOT_WRITE_ENABLED
  } else {
    process.env.SNAPSHOT_WRITE_ENABLED = enabled
  }

  if (token === undefined) {
    delete process.env.SNAPSHOT_WRITE_TOKEN
  } else {
    process.env.SNAPSHOT_WRITE_TOKEN = token
  }
}

function createResponse() {
  return {
    statusCode: null,
    headers: {},
    body: null,
    setHeader(name, value) {
      this.headers[String(name).toLowerCase()] = value
      return this
    },
    status(statusCode) {
      this.statusCode = statusCode
      return this
    },
    json(body) {
      this.body = body
      return this
    },
  }
}

async function callHandler({
  activeHandler = handler,
  databaseUrl,
  method = 'POST',
  headers = {},
  body,
  enabled = 'true',
  token = 'expected-token',
} = {}) {
  setSnapshotEnv({ databaseUrl, enabled, token })

  const response = createResponse()
  await activeHandler({ method, headers, body }, response)

  return response
}

function createValidPayload() {
  return {
    schemaVersion: '1',
    matchIdentity: {
      matchKey: 'team-a-vs-team-b',
    },
    publicMatchSnapshot: {
      homeTeam: 'Team A',
      awayTeam: 'Team B',
    },
    engineSnapshot: {
      betScore: 60,
      recommendLevel: 'observe',
    },
    internalSnapshot: {
      totalStake: 10,
      stakePlan: [],
      bankroll: 100,
      lightDataLayer: {},
    },
    dataQuality: {},
    cancelRules: [],
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

async function runTest(name, test) {
  await test()
  console.log(`ok - ${name}`)
}

try {
  await runTest('rejects non-POST requests', async () => {
    const response = await callHandler({
      method: 'GET',
      enabled: undefined,
      token: undefined,
    })

    assert(response.statusCode === 405, 'GET must return 405.')
  })

  await runTest('returns disabled response without token or payload checks', async () => {
    let writeCount = 0
    const mockHandler = createSnapshotHandler({
      writeSnapshotRow: async () => {
        writeCount += 1
        throw new Error('disabled branch must not write')
      },
    })
    const response = await callHandler({
      activeHandler: mockHandler,
      enabled: 'false',
      token: undefined,
      body: null,
    })

    assert(response.statusCode === 200, 'Disabled API must return 200.')
    assert(response.body?.ok === false, 'Disabled response must set ok false.')
    assert(response.body?.disabled === true, 'Disabled response must set disabled true.')
    assert(writeCount === 0, 'Disabled API must not write to the database.')
  })

  await runTest('rejects enabled requests with a missing token', async () => {
    let writeCount = 0
    const mockHandler = createSnapshotHandler({
      writeSnapshotRow: async () => {
        writeCount += 1
      },
    })
    const response = await callHandler({
      activeHandler: mockHandler,
      enabled: 'true',
      token: 'expected-token',
      headers: {},
      body: createValidPayload(),
    })

    assert(response.statusCode === 401, 'Missing token must return 401.')
    assert(writeCount === 0, 'Missing token must not write to the database.')
  })

  await runTest('rejects enabled requests with a wrong token', async () => {
    let writeCount = 0
    const mockHandler = createSnapshotHandler({
      writeSnapshotRow: async () => {
        writeCount += 1
      },
    })
    const response = await callHandler({
      activeHandler: mockHandler,
      enabled: 'true',
      token: 'expected-token',
      headers: { 'x-snapshot-write-token': 'wrong-token' },
      body: createValidPayload(),
    })

    assert(response.statusCode === 401, 'Wrong token must return 401.')
    assert(writeCount === 0, 'Wrong token must not write to the database.')
  })

  await runTest('rejects payloads with missing required fields', async () => {
    let writeCount = 0
    const mockHandler = createSnapshotHandler({
      writeSnapshotRow: async () => {
        writeCount += 1
      },
    })
    const response = await callHandler({
      activeHandler: mockHandler,
      headers: { 'x-snapshot-write-token': 'expected-token' },
      body: { schemaVersion: '1' },
    })

    assert(response.statusCode === 400, 'Missing fields must return 400.')
    assert(Array.isArray(response.body?.errors), 'Missing fields response must include errors.')
    assert(writeCount === 0, 'Invalid payload must not write to the database.')
  })

  await runTest('rejects public snapshot amount fields', async () => {
    let writeCount = 0
    const mockHandler = createSnapshotHandler({
      writeSnapshotRow: async () => {
        writeCount += 1
      },
    })
    const payload = clone(createValidPayload())
    payload.publicMatchSnapshot.totalStake = 10
    payload.publicMatchSnapshot.stakePlan = []
    payload.publicMatchSnapshot.bankroll = 100
    payload.publicMatchSnapshot.stake = 5

    const response = await callHandler({
      activeHandler: mockHandler,
      headers: { 'x-snapshot-write-token': 'expected-token' },
      body: payload,
    })

    assert(response.statusCode === 400, 'Public amount fields must return 400.')
    assert(Array.isArray(response.body?.errors), 'Public amount response must include errors.')
    assert(writeCount === 0, 'Public amount fields must not write to the database.')
  })

  await runTest('rejects UI-only fields anywhere in payload', async () => {
    let writeCount = 0
    const mockHandler = createSnapshotHandler({
      writeSnapshotRow: async () => {
        writeCount += 1
      },
    })
    const payload = clone(createValidPayload())
    payload.selectedIndex = 0
    payload.publicMatchSnapshot.sourceIndex = 1
    payload.engineSnapshot.showInternalEngine = true

    const response = await callHandler({
      activeHandler: mockHandler,
      headers: { 'x-snapshot-write-token': 'expected-token' },
      body: payload,
    })

    assert(response.statusCode === 400, 'UI-only fields must return 400.')
    assert(Array.isArray(response.body?.errors), 'UI-only field response must include errors.')
    assert(writeCount === 0, 'UI-only fields must not write to the database.')
  })

  await runTest('returns DATABASE_URL_MISSING before connecting without DATABASE_URL', async () => {
    const response = await callHandler({
      headers: { 'x-snapshot-write-token': 'expected-token' },
      body: createValidPayload(),
    })

    assert(response.statusCode === 500, 'Missing DATABASE_URL must return 500.')
    assert(response.body?.ok === false, 'Missing DATABASE_URL must set ok false.')
    assert(response.body?.written === false, 'Missing DATABASE_URL must not be written.')
    assert(response.body?.error === 'DATABASE_URL_MISSING', 'Missing DATABASE_URL must return a stable error code.')
  })

  await runTest('writes a valid payload through a mock database writer', async () => {
    let writeCount = 0
    let writtenRow = null
    const mockHandler = createSnapshotHandler({
      writeSnapshotRow: async (row) => {
        writeCount += 1
        writtenRow = row
        return { ok: true, id: 'snapshot-row-1' }
      },
    })
    const response = await callHandler({
      activeHandler: mockHandler,
      databaseUrl: 'postgres://mock-url',
      headers: { 'x-snapshot-write-token': 'expected-token' },
      body: createValidPayload(),
    })

    assert(response.statusCode === 200, 'Mock write success must return 200.')
    assert(response.body?.ok === true, 'Mock write success must set ok true.')
    assert(response.body?.written === true, 'Mock write success must set written true.')
    assert(response.body?.id === 'snapshot-row-1', 'Mock write success must return the inserted id.')
    assert(response.body?.message === 'Snapshot written.', 'Mock write success must return the write message.')
    assert(writeCount === 1, 'Valid payload must call the database writer once.')
    assert(writtenRow?.match_key === 'team-a-vs-team-b', 'Writer must receive a mapped row.')
  })

  await runTest('returns DATABASE_WRITE_FAILED when the mock writer fails', async () => {
    const mockHandler = createSnapshotHandler({
      writeSnapshotRow: async () => {
        throw new Error('mock database failure')
      },
    })
    const response = await callHandler({
      activeHandler: mockHandler,
      databaseUrl: 'postgres://mock-url',
      headers: { 'x-snapshot-write-token': 'expected-token' },
      body: createValidPayload(),
    })

    assert(response.statusCode === 500, 'Mock write failure must return 500.')
    assert(response.body?.ok === false, 'Mock write failure must set ok false.')
    assert(response.body?.written === false, 'Mock write failure must set written false.')
    assert(response.body?.error === 'DATABASE_WRITE_FAILED', 'Mock write failure must return a stable error code.')
    assert(response.body?.message === 'Snapshot write failed.', 'Mock write failure must return a safe message.')
  })

  console.log('Snapshot API behavior checks passed.')
} finally {
  restoreEnv()
}
