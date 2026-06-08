import process from 'node:process'

import {
  hasForbiddenAiAnalysisInput,
  isValidAiAnalysisPayload,
  sanitizeAiAnalysisPayload,
} from '../src/services/aiAnalysisPayload.js'

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses'
const DEFAULT_MODEL = 'gpt-5-mini'
const REQUEST_TIMEOUT_MS = 8_000
const OUTPUT_FIELDS = [
  'headline',
  'shortSummary',
  'confidenceExplanation',
  'riskWarnings',
  'reviewChecklist',
  'userFacingReason',
  'disclaimer',
]
const FORBIDDEN_OUTPUT_FIELDS = new Set([
  'mainPick',
  'secondaryPick',
  'scorePredictions',
  'totalGoalsDirection',
  'betScore',
  'recommendLevel',
  'stake',
  'stakePlan',
  'totalStake',
  'bankroll',
])
const PROMISE_PATTERN =
  /\u7a33\u8d5a|\u5fc5\u4e2d|\u7a33\u8d62|\u4fdd\u8bc1\u547d\u4e2d/

const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: OUTPUT_FIELDS,
  properties: {
    headline: { type: 'string' },
    shortSummary: { type: 'string' },
    confidenceExplanation: { type: 'string' },
    riskWarnings: {
      type: 'array',
      items: { type: 'string' },
    },
    reviewChecklist: {
      type: 'array',
      items: { type: 'string' },
    },
    userFacingReason: { type: 'string' },
    disclaimer: { type: 'string' },
  },
}

const SYSTEM_INSTRUCTIONS = [
  '\u4f60\u662f\u8db3\u7403\u8d5b\u524d\u5206\u6790\u7684\u4e2d\u6587\u89e3\u91ca\u5c42\uff0c\u53ea\u8f93\u51fa JSON\u3002',
  '\u4f60\u53ea\u80fd\u89e3\u91ca BetEngine \u5df2\u7ecf\u7ed9\u51fa\u7684\u7ed3\u679c\uff0c\u4e0d\u662f\u6700\u7ec8\u51b3\u7b56\u6e90\u3002',
  '\u7981\u6b62\u6539\u53d8\u63a8\u8350\u65b9\u5411\u3001\u6bd4\u5206\u3001\u5927\u5c0f\u7403\u3001betScore\u3001recommendLevel \u6216\u4efb\u4f55\u91d1\u989d\u3002',
  '\u7981\u6b62\u8f93\u51fa mainPick\u3001secondaryPick\u3001scorePredictions\u3001totalGoalsDirection\u3001betScore\u3001recommendLevel\u3001stakePlan \u7b49\u51b3\u7b56\u5b57\u6bb5\u3002',
  '\u7981\u6b62\u4f7f\u7528\u7a33\u8d5a\u3001\u5fc5\u4e2d\u3001\u7a33\u8d62\u3001\u4fdd\u8bc1\u547d\u4e2d\u7b49\u627f\u8bfa\u8bed\u3002',
  '\u7528\u76f4\u767d\u3001\u7b80\u6d01\u7684\u4e2d\u6587\u5411\u65b0\u624b\u89e3\u91ca\u4fe1\u5fc3\u6765\u6e90\u3001\u98ce\u9669\u548c\u8d5b\u524d\u590d\u6838\u70b9\u3002',
].join('\n')

function safeText(value, fallback, maxLength = 1600) {
  if (typeof value !== 'string') return fallback
  const text = value.trim()
  return text ? text.slice(0, maxLength) : fallback
}

function safeStringList(value, fallback = []) {
  if (!Array.isArray(value)) return fallback
  return value
    .filter((item) => typeof item === 'string' && item.trim())
    .map((item) => item.trim().slice(0, 360))
    .slice(0, 8)
}

export function createLocalAnalysis(payload, modelFallbackReason) {
  const publicSummary = safeText(
    payload?.publicSummary,
    '\u672c\u5730\u89c4\u5219\u5206\u6790\u6682\u65f6\u53ef\u7528\u3002',
  )
  const cancelRules = safeStringList(payload?.cancelRules)
  const limitations = safeStringList(payload?.dataQuality?.limitations)

  return {
    ok: false,
    source: 'local-fallback',
    analysis: {
      headline: '\u672c\u5730\u89c4\u5219\u5206\u6790',
      shortSummary: publicSummary,
      confidenceExplanation:
        '\u5f53\u524d\u89e3\u91ca\u7531 BetEngine \u7684\u8bc4\u5206\u3001\u6570\u636e\u8d28\u91cf\u548c\u98ce\u9669\u89c4\u5219\u751f\u6210\u3002',
      riskWarnings: cancelRules.length ? cancelRules : limitations.slice(0, 5),
      reviewChecklist: cancelRules.length
        ? cancelRules
        : [
            '\u8d5b\u524d\u590d\u6838\u9635\u5bb9\u3001\u76d8\u53e3\u53d8\u5316\u548c\u6570\u636e\u5b8c\u6574\u6027\u3002',
          ],
      userFacingReason: publicSummary,
      disclaimer:
        '\u672c\u5206\u6790\u4ec5\u7528\u4e8e\u8d5b\u524d\u4fe1\u606f\u89e3\u91ca\u548c\u98ce\u9669\u590d\u6838\uff0c\u4e0d\u6784\u6210\u6536\u76ca\u6216\u7ed3\u679c\u627f\u8bfa\u3002',
      modelFallbackReason,
    },
  }
}

function hasForbiddenOutputField(value) {
  if (Array.isArray(value)) return value.some(hasForbiddenOutputField)
  if (!value || typeof value !== 'object') return false

  return Object.entries(value).some(
    ([key, nestedValue]) =>
      FORBIDDEN_OUTPUT_FIELDS.has(key) ||
      hasForbiddenOutputField(nestedValue),
  )
}

function containsPromiseLanguage(value) {
  const text = JSON.stringify(value)
  return PROMISE_PATTERN.test(text)
}

export function normalizeModelAnalysis(value) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    hasForbiddenOutputField(value) ||
    containsPromiseLanguage(value)
  ) {
    return null
  }

  const keys = Object.keys(value)
  if (
    keys.length !== OUTPUT_FIELDS.length ||
    keys.some((key) => !OUTPUT_FIELDS.includes(key))
  ) {
    return null
  }

  const normalized = {
    headline: safeText(value.headline, null, 160),
    shortSummary: safeText(value.shortSummary, null, 1000),
    confidenceExplanation: safeText(
      value.confidenceExplanation,
      null,
      1000,
    ),
    riskWarnings: safeStringList(value.riskWarnings),
    reviewChecklist: safeStringList(value.reviewChecklist),
    userFacingReason: safeText(value.userFacingReason, null, 1000),
    disclaimer: safeText(value.disclaimer, null, 600),
  }

  if (
    !normalized.headline ||
    !normalized.shortSummary ||
    !normalized.confidenceExplanation ||
    !normalized.userFacingReason ||
    !normalized.disclaimer
  ) {
    return null
  }

  return {
    ...normalized,
    modelFallbackReason: null,
  }
}

function extractResponseText(responsePayload) {
  if (typeof responsePayload?.output_text === 'string') {
    return responsePayload.output_text
  }

  for (const outputItem of responsePayload?.output ?? []) {
    for (const contentItem of outputItem?.content ?? []) {
      if (
        contentItem?.type === 'output_text' &&
        typeof contentItem.text === 'string'
      ) {
        return contentItem.text
      }
    }
  }

  return null
}

async function requestOpenAi(payload, apiKey) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const response = await fetch(OPENAI_RESPONSES_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || DEFAULT_MODEL,
        instructions: SYSTEM_INSTRUCTIONS,
        input: JSON.stringify(payload),
        max_output_tokens: 900,
        store: false,
        text: {
          format: {
            type: 'json_schema',
            name: 'ai_analysis',
            strict: true,
            schema: OUTPUT_SCHEMA,
          },
        },
      }),
      signal: controller.signal,
    })

    if (!response.ok) {
      const error = new Error('OpenAI request failed.')
      error.code = 'OPENAI_REQUEST_FAILED'
      throw error
    }

    let responsePayload
    try {
      responsePayload = await response.json()
    } catch {
      const error = new Error('OpenAI response JSON was invalid.')
      error.code = 'OPENAI_INVALID_JSON'
      throw error
    }
    const responseText = extractResponseText(responsePayload)
    if (!responseText) {
      const error = new Error('OpenAI response did not include JSON text.')
      error.code = 'OPENAI_INVALID_JSON'
      throw error
    }

    let modelOutput
    try {
      modelOutput = JSON.parse(responseText)
    } catch {
      const error = new Error('OpenAI response JSON was invalid.')
      error.code = 'OPENAI_INVALID_JSON'
      throw error
    }

    const analysis = normalizeModelAnalysis(modelOutput)
    if (!analysis) {
      const error = new Error('OpenAI response contained unsafe fields.')
      error.code = 'OPENAI_UNSAFE_OUTPUT'
      throw error
    }

    return {
      ok: true,
      source: 'openai',
      analysis,
    }
  } catch (error) {
    if (error?.name === 'AbortError') {
      error.code = 'OPENAI_TIMEOUT'
    }
    throw error
  } finally {
    clearTimeout(timeoutId)
  }
}

function parseRequestBody(request) {
  if (typeof request.body === 'string') {
    try {
      return JSON.parse(request.body)
    } catch {
      return null
    }
  }

  return request.body
}

function sendJson(response, statusCode, body, headers = {}) {
  for (const [key, value] of Object.entries(headers)) {
    response.setHeader(key, value)
  }
  response.status(statusCode).json(body)
}

export default async function handler(request, response) {
  const noStoreHeaders = { 'Cache-Control': 'no-store' }

  if (request.method !== 'POST') {
    sendJson(
      response,
      405,
      createLocalAnalysis(null, 'INVALID_INPUT'),
      { ...noStoreHeaders, Allow: 'POST' },
    )
    return
  }

  const requestBody = parseRequestBody(request)
  if (
    !requestBody ||
    hasForbiddenAiAnalysisInput(requestBody)
  ) {
    sendJson(
      response,
      400,
      createLocalAnalysis(null, 'INVALID_INPUT'),
      noStoreHeaders,
    )
    return
  }

  const payload = sanitizeAiAnalysisPayload(requestBody)
  if (!isValidAiAnalysisPayload(payload)) {
    sendJson(
      response,
      400,
      createLocalAnalysis(payload, 'INVALID_INPUT'),
      noStoreHeaders,
    )
    return
  }

  if (process.env.AI_ANALYSIS_ENABLED !== 'true') {
    sendJson(
      response,
      200,
      createLocalAnalysis(payload, 'AI_ANALYSIS_DISABLED'),
      noStoreHeaders,
    )
    return
  }

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    sendJson(
      response,
      200,
      createLocalAnalysis(payload, 'OPENAI_API_KEY_MISSING'),
      noStoreHeaders,
    )
    return
  }

  try {
    const result = await requestOpenAi(payload, apiKey)
    sendJson(response, 200, result, noStoreHeaders)
  } catch (error) {
    const fallbackReason = [
      'OPENAI_REQUEST_FAILED',
      'OPENAI_TIMEOUT',
      'OPENAI_INVALID_JSON',
      'OPENAI_UNSAFE_OUTPUT',
    ].includes(error?.code)
      ? error.code
      : 'OPENAI_REQUEST_FAILED'

    sendJson(
      response,
      200,
      createLocalAnalysis(payload, fallbackReason),
      noStoreHeaders,
    )
  }
}
