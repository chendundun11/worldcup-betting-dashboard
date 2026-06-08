const FALLBACK_REASON = 'OPENAI_REQUEST_FAILED'

function safeText(value, fallback) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

export function createLocalAiAnalysisFallback(payload, reason = FALLBACK_REASON) {
  const publicSummary = safeText(
    payload?.publicSummary,
    '\u672c\u5730\u89c4\u5219\u5206\u6790\u6682\u65f6\u53ef\u7528\u3002',
  )
  const cancelRules = Array.isArray(payload?.cancelRules)
    ? payload.cancelRules.filter((item) => typeof item === 'string').slice(0, 5)
    : []

  return {
    ok: false,
    source: 'local-fallback',
    analysis: {
      headline: '\u672c\u5730\u89c4\u5219\u5206\u6790',
      shortSummary: publicSummary,
      confidenceExplanation:
        '\u5f53\u524d\u89e3\u91ca\u6765\u81ea BetEngine \u7684\u672c\u5730\u8bc4\u5206\u4e0e\u6570\u636e\u8d28\u91cf\u89c4\u5219\u3002',
      riskWarnings: cancelRules,
      reviewChecklist: cancelRules,
      userFacingReason: publicSummary,
      disclaimer:
        '\u672c\u5206\u6790\u4ec5\u7528\u4e8e\u8d5b\u524d\u4fe1\u606f\u89e3\u91ca\u548c\u98ce\u9669\u590d\u6838\uff0c\u4e0d\u6784\u6210\u6536\u76ca\u6216\u7ed3\u679c\u627f\u8bfa\u3002',
      modelFallbackReason: reason,
    },
  }
}

function isAnalysisResponse(value) {
  return Boolean(
    value &&
      typeof value === 'object' &&
      ['openai', 'local-fallback'].includes(value.source) &&
      value.analysis &&
      typeof value.analysis === 'object',
  )
}

export async function requestAiAnalysis(payload, options = {}) {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch

  if (typeof fetchImpl !== 'function') {
    return createLocalAiAnalysisFallback(payload)
  }

  try {
    const response = await fetchImpl('/api/ai-analysis', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })
    const result = await response.json().catch(() => null)

    if (!response.ok || !isAnalysisResponse(result)) {
      return createLocalAiAnalysisFallback(payload)
    }

    return result
  } catch {
    return createLocalAiAnalysisFallback(payload)
  }
}

export default requestAiAnalysis
