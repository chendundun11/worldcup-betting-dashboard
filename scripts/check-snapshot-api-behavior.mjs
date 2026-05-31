import handler from '../api/internal/snapshots.js'

const ORIGINAL_ENV = {
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
  restoreEnvValue('SNAPSHOT_WRITE_ENABLED', ORIGINAL_ENV.SNAPSHOT_WRITE_ENABLED)
  restoreEnvValue('SNAPSHOT_WRITE_TOKEN', ORIGINAL_ENV.SNAPSHOT_WRITE_TOKEN)
}

function setSnapshotEnv({ enabled, token }) {
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
  method = 'POST',
  headers = {},
  body,
  enabled = 'true',
  token = 'expected-token',
} = {}) {
  setSnapshotEnv({ enabled, token })

  const response = createResponse()
  await handler({ method, headers, body }, response)

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
    const response = await callHandler({
      enabled: 'false',
      token: undefined,
      body: null,
    })

    assert(response.statusCode === 200, 'Disabled API must return 200.')
    assert(response.body?.ok === false, 'Disabled response must set ok false.')
    assert(response.body?.disabled === true, 'Disabled response must set disabled true.')
  })

  await runTest('rejects enabled requests with a missing token', async () => {
    const response = await callHandler({
      enabled: 'true',
      token: 'expected-token',
      headers: {},
      body: createValidPayload(),
    })

    assert(response.statusCode === 401, 'Missing token must return 401.')
  })

  await runTest('rejects enabled requests with a wrong token', async () => {
    const response = await callHandler({
      enabled: 'true',
      token: 'expected-token',
      headers: { 'x-snapshot-write-token': 'wrong-token' },
      body: createValidPayload(),
    })

    assert(response.statusCode === 401, 'Wrong token must return 401.')
  })

  await runTest('rejects payloads with missing required fields', async () => {
    const response = await callHandler({
      headers: { 'x-snapshot-write-token': 'expected-token' },
      body: { schemaVersion: '1' },
    })

    assert(response.statusCode === 400, 'Missing fields must return 400.')
    assert(Array.isArray(response.body?.errors), 'Missing fields response must include errors.')
  })

  await runTest('rejects public snapshot amount fields', async () => {
    const payload = clone(createValidPayload())
    payload.publicMatchSnapshot.totalStake = 10
    payload.publicMatchSnapshot.stakePlan = []
    payload.publicMatchSnapshot.bankroll = 100
    payload.publicMatchSnapshot.stake = 5

    const response = await callHandler({
      headers: { 'x-snapshot-write-token': 'expected-token' },
      body: payload,
    })

    assert(response.statusCode === 400, 'Public amount fields must return 400.')
    assert(Array.isArray(response.body?.errors), 'Public amount response must include errors.')
  })

  await runTest('rejects UI-only fields anywhere in payload', async () => {
    const payload = clone(createValidPayload())
    payload.selectedIndex = 0
    payload.publicMatchSnapshot.sourceIndex = 1
    payload.engineSnapshot.showInternalEngine = true

    const response = await callHandler({
      headers: { 'x-snapshot-write-token': 'expected-token' },
      body: payload,
    })

    assert(response.statusCode === 400, 'UI-only fields must return 400.')
    assert(Array.isArray(response.body?.errors), 'UI-only field response must include errors.')
  })

  await runTest('accepts a valid payload as dry-run only', async () => {
    const response = await callHandler({
      headers: { 'x-snapshot-write-token': 'expected-token' },
      body: createValidPayload(),
    })

    assert(response.statusCode === 200, 'Valid payload must return 200.')
    assert(response.body?.ok === true, 'Valid payload must set ok true.')
    assert(response.body?.dryRun === true, 'Valid payload must set dryRun true.')
    assert(
      /Database write not implemented|dry-run/i.test(String(response.body?.message ?? '')),
      'Valid payload response must state that database writing is not implemented.',
    )
  })

  console.log('Snapshot API behavior checks passed.')
} finally {
  restoreEnv()
}
