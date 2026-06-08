import { readFileSync } from 'node:fs'

import handler from '../api/ai-analysis.js'
import {
  buildAiAnalysisPayload,
  hasForbiddenAiAnalysisInput,
  isValidAiAnalysisPayload,
} from '../src/services/aiAnalysisPayload.js'

const apiPath = 'api/ai-analysis.js'
const apiServicePath = 'src/services/aiAnalysisApi.js'
const payloadPath = 'src/services/aiAnalysisPayload.js'
const appPath = 'src/App.jsx'
const packagePath = 'package.json'
const viteKeyToken = 'VITE_OPENAI_' + 'API_KEY'

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function createResponse() {
  return {
    statusCode: null,
    headers: {},
    body: null,
    setHeader(key, value) {
      this.headers[key] = value
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

async function callHandler({ method = 'POST', body } = {}) {
  const response = createResponse()
  await handler({ method, body }, response)
  return response
}

function assertFallback(response, reason, label) {
  assert(response.statusCode === 200, `${label} must return HTTP 200.`)
  assert(response.body?.ok === false, `${label} must return ok=false.`)
  assert(
    response.body?.source === 'local-fallback',
    `${label} must use local-fallback.`,
  )
  assert(
    response.body?.analysis?.modelFallbackReason === reason,
    `${label} must use ${reason}.`,
  )
  assertAnalysisShape(response.body.analysis, `${label} analysis`)
}

function assertAnalysisShape(analysis, label) {
  for (const field of [
    'headline',
    'shortSummary',
    'confidenceExplanation',
    'riskWarnings',
    'reviewChecklist',
    'userFacingReason',
    'disclaimer',
    'modelFallbackReason',
  ]) {
    assert(
      Object.prototype.hasOwnProperty.call(analysis ?? {}, field),
      `${label} must include ${field}.`,
    )
  }

  assert(Array.isArray(analysis.riskWarnings), `${label} riskWarnings must be an array.`)
  assert(Array.isArray(analysis.reviewChecklist), `${label} reviewChecklist must be an array.`)
}

function collectKeys(value, result = []) {
  if (Array.isArray(value)) {
    for (const item of value) collectKeys(item, result)
    return result
  }
  if (!value || typeof value !== 'object') return result

  for (const [key, nestedValue] of Object.entries(value)) {
    result.push(key)
    collectKeys(nestedValue, result)
  }
  return result
}

function createMockFetch(output) {
  return async () => ({
    ok: true,
    async json() {
      return output
    },
  })
}

const match = {
  id: 'ai-analysis-check',
  homeTeam: { name: 'France' },
  awayTeam: { name: 'Senegal' },
  kickoff: '2026-06-10T12:00:00.000Z',
  status: 'scheduled',
  stage: 'Group A',
  venue: { name: 'Test Stadium' },
  raw: { fixtures: ['must-not-leak'] },
  headers: { authorization: 'must-not-leak' },
  bookmakers: [{ name: 'must-not-leak' }],
  markets: { full: true },
}

const analysis = {
  matchId: 'ai-analysis-check',
  matchName: 'France vs Senegal',
  bankroll: 10000,
  betScore: 68,
  recommendLevel: 'standard',
  mainPick: {
    action: 'bet',
    market: '1X2',
    direction: 'home',
    label: 'Home',
    odds: 1.72,
    edge: 0.08,
  },
  secondaryPick: {
    action: 'bet',
    market: 'totalGoals',
    direction: 'under25',
    label: 'Under 2.5',
    odds: 1.9,
    edge: 0.03,
  },
  scorePicks: [
    {
      score: '2-1',
      highVariance: true,
      note: 'Score is only a reference.',
      stake: 20,
    },
  ],
  totalStake: 100,
  stakePlan: [{ stake: 100 }],
  publicSummary: 'Local BetEngine summary.',
  cancelRules: ['Review lineups before kickoff.'],
  dataQuality: {
    odds: 'localSnapshot',
    marketMovement: 'missing',
    injuries: 'partial',
    expectedLineups: 'missing',
    limitations: ['expectedLineupsMissing'],
  },
  scoreBreakdown: {
    valueEdge: { score: 12, reason: 'Static value estimate.' },
    directionClarity: { score: 10, reason: 'Direction is clear.' },
  },
  internalAnalysis: {
    rawResponse: { hidden: true },
    snapshot: { hidden: true },
    remoteOddsSignal: {
      provider: 'the-odds-api',
      dataSource: 'remote',
      status: 'available',
      rawAvailable: true,
      marketTone: 'stable',
      riskFlags: ['review'],
      fallbackReason: null,
      bookmakers: ['must-not-leak'],
      markets: { hidden: true },
    },
    remoteTeamFormSignal: {
      provider: 'api-football',
      dataSource: 'mock',
      status: 'fallback',
      rawAvailable: false,
      fallbackReason: 'TEAM_FORM_API_PROVIDER_ERROR',
      comparison: {
        formEdge: 'unknown',
        attackEdge: 'unknown',
        defenseEdge: 'unknown',
        volatilityRisk: 'unknown',
      },
      riskPenalty: 0,
      infoPenalty: 3,
      meta: {
        error: 'TEAM_FORM_API_PROVIDER_ERROR',
        errorCode: 'API_FOOTBALL_PROVIDER_ERRORS',
        providerStage: 'provider_errors',
        providerErrorKeys: ['plan'],
        providerErrors: {
          plan: 'must-not-leak-provider-error-value',
        },
      },
    },
  },
  apiKey: 'must-not-leak-api-key',
  headers: { authorization: 'must-not-leak' },
}

const payload = buildAiAnalysisPayload({ match, analysis })
assert(isValidAiAnalysisPayload(payload), 'AI analysis payload must be valid.')
assert(
  !hasForbiddenAiAnalysisInput(payload),
  'AI analysis payload must not contain forbidden input fields.',
)

const payloadKeys = collectKeys(payload)
for (const forbiddenKey of [
  'stake',
  'stakePlan',
  'totalStake',
  'bankroll',
  'bookmakers',
  'markets',
  'odds',
  'raw',
  'rawResponse',
  'headers',
  'apiKey',
  'providerErrors',
  'fixtures',
  'internalAnalysis',
  'snapshot',
  'edge',
]) {
  assert(
    !payloadKeys.includes(forbiddenKey),
    `AI analysis payload must remove ${forbiddenKey}.`,
  )
}
assert(
  !JSON.stringify(payload).includes('must-not-leak'),
  'AI analysis payload must remove sensitive source values.',
)
assert(
  payload.mainPick.direction === analysis.mainPick.direction,
  'Payload builder must preserve the local main pick direction.',
)
assert(
  payload.scorePredictions[0].score === analysis.scorePicks[0].score,
  'Payload builder must preserve the local score reference.',
)
assert(
  payload.totalGoalsDirection === analysis.secondaryPick.direction,
  'Payload builder must preserve the local total goals direction.',
)

delete process.env.AI_ANALYSIS_ENABLED
delete process.env.OPENAI_API_KEY

const disabledResponse = await callHandler({ body: payload })
assertFallback(
  disabledResponse,
  'AI_ANALYSIS_DISABLED',
  'Disabled AI endpoint',
)

process.env.AI_ANALYSIS_ENABLED = 'true'
delete process.env.OPENAI_API_KEY
const missingKeyResponse = await callHandler({ body: payload })
assertFallback(
  missingKeyResponse,
  'OPENAI_API_KEY_MISSING',
  'Missing key endpoint',
)

const methodResponse = await callHandler({ method: 'GET' })
assert(methodResponse.statusCode === 405, 'Non-POST requests must return 405.')
assert(methodResponse.headers.Allow === 'POST', '405 response must allow POST.')

const invalidResponse = await callHandler({ body: { publicSummary: 'invalid' } })
assert(invalidResponse.statusCode === 400, 'Invalid input must return 400.')
assert(
  invalidResponse.body?.analysis?.modelFallbackReason === 'INVALID_INPUT',
  'Invalid input must use INVALID_INPUT.',
)

const forbiddenInputResponse = await callHandler({
  body: { ...payload, stakePlan: [{ stake: 100 }] },
})
assert(forbiddenInputResponse.statusCode === 400, 'Forbidden input must return 400.')

const originalFetch = globalThis.fetch
process.env.OPENAI_API_KEY = 'check-only-placeholder'

try {
  globalThis.fetch = async () => {
    throw new Error('mock request failure')
  }
  const requestFailureResponse = await callHandler({ body: payload })
  assertFallback(
    requestFailureResponse,
    'OPENAI_REQUEST_FAILED',
    'Request failure endpoint',
  )

  globalThis.fetch = async () => {
    const error = new Error('mock timeout')
    error.name = 'AbortError'
    throw error
  }
  const timeoutResponse = await callHandler({ body: payload })
  assertFallback(timeoutResponse, 'OPENAI_TIMEOUT', 'Timeout endpoint')

  globalThis.fetch = createMockFetch({ output_text: '{not-json' })
  const invalidJsonResponse = await callHandler({ body: payload })
  assertFallback(
    invalidJsonResponse,
    'OPENAI_INVALID_JSON',
    'Invalid JSON endpoint',
  )

  globalThis.fetch = createMockFetch({
    output_text: JSON.stringify({
      headline: 'Unsafe result',
      shortSummary: 'Unsafe result',
      confidenceExplanation: 'Unsafe result',
      riskWarnings: [],
      reviewChecklist: [],
      userFacingReason: 'Unsafe result',
      disclaimer: 'Unsafe result',
      mainPick: { direction: 'away' },
      scorePredictions: [{ score: '0-3' }],
      betScore: 99,
      recommendLevel: 'higher',
      stakePlan: [{ stake: 1000 }],
    }),
  })
  const unsafeResponse = await callHandler({ body: payload })
  assertFallback(
    unsafeResponse,
    'OPENAI_UNSAFE_OUTPUT',
    'Unsafe output endpoint',
  )

  globalThis.fetch = createMockFetch({
    output_text: JSON.stringify({
      headline: 'Match review',
      shortSummary: 'Local direction explained.',
      confidenceExplanation: 'Confidence follows the local score.',
      riskWarnings: ['Review missing lineup information.'],
      reviewChecklist: ['Check the confirmed lineup.'],
      userFacingReason: 'The model only explains the local result.',
      disclaimer: 'For pre-match information review only.',
    }),
  })
  const successResponse = await callHandler({ body: payload })
  assert(successResponse.statusCode === 200, 'Safe model output must return 200.')
  assert(successResponse.body?.ok === true, 'Safe model output must return ok=true.')
  assert(
    successResponse.body?.source === 'openai',
    'Safe model output must use source=openai.',
  )
  assert(
    successResponse.body?.analysis?.modelFallbackReason === null,
    'Successful model output must set modelFallbackReason on the server.',
  )
  assertAnalysisShape(successResponse.body.analysis, 'Successful analysis')
} finally {
  globalThis.fetch = originalFetch
  delete process.env.OPENAI_API_KEY
  delete process.env.AI_ANALYSIS_ENABLED
}

const apiText = readFileSync(apiPath, 'utf8')
const apiServiceText = readFileSync(apiServicePath, 'utf8')
const payloadText = readFileSync(payloadPath, 'utf8')
const appText = readFileSync(appPath, 'utf8')
const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'))
const dependencies = {
  ...(packageJson.dependencies ?? {}),
  ...(packageJson.devDependencies ?? {}),
}

assert(
  apiText.includes("process.env.AI_ANALYSIS_ENABLED !== 'true'"),
  'AI analysis endpoint must be explicitly enabled.',
)
assert(
  !apiServiceText.includes('process.env') &&
    !apiServiceText.includes('import.meta.env'),
  'Frontend AI service must not read environment variables.',
)
assert(
  !payloadText.includes(viteKeyToken) &&
    !apiServiceText.includes(viteKeyToken) &&
    !appText.includes(viteKeyToken),
  `${viteKeyToken} must not exist in frontend source.`,
)
assert(
  !Object.prototype.hasOwnProperty.call(dependencies, 'openai'),
  'AI analysis must not require the openai dependency.',
)
assert(
  appText.includes('buildAiAnalysisPayload') &&
    appText.includes('requestAiAnalysis'),
  'App.jsx must use the safe AI payload and client helper.',
)
assert(
  !/setShowInternalEngine\s*\(\s*true\s*\)/.test(appText),
  'AI analysis must not open the internal engine panel.',
)

console.log('AI analysis checks passed.')
