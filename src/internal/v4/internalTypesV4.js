export const INTERNAL_V4_VERSION = 'internal-v5'
export const INTERNAL_V5_VERSION = INTERNAL_V4_VERSION

export const INTERNAL_V4_LEDGER_VERSION = 'internal-v5-ledger'
export const INTERNAL_V5_LEDGER_VERSION = INTERNAL_V4_LEDGER_VERSION

export const INTERNAL_V4_LEDGER_KEY = 'worldcup_internal_v5_ledger'
export const INTERNAL_V5_LEDGER_KEY = INTERNAL_V4_LEDGER_KEY
export const LEGACY_INTERNAL_V4_LEDGER_KEY = 'worldcup_internal_v4_ledger'

export const INTERNAL_V4_INITIAL_BANKROLL = 10000
export const INTERNAL_V5_INITIAL_BANKROLL = INTERNAL_V4_INITIAL_BANKROLL

export const INTERNAL_V4_DISCLAIMER =
  '内部模拟系统，仅供模型校准与娱乐参考，不构成投注建议。'

export const INTERNAL_V5_SUBTITLE =
  '每场模拟资金计划 · 严格复盘门禁 · 仅供内部校准'

export const GAME_TYPES_V4 = [
  '强队压制局',
  '强队过热局',
  '低比分胶着局',
  '平局保护局',
  '冷门波动局',
  '对攻大球局',
  '信息不足局',
  '方向冲突局',
]

export const GAME_TYPES_V5 = GAME_TYPES_V4

export const EXECUTION_LEVELS_V4 = [
  '强信心计划',
  '中高信心计划',
  '标准计划',
  '低额观察',
  '最低观察',
]

export const POOL_STATUS_V4 = [
  '高信心',
  '中高信心',
  '标准观察',
  '低额观察',
  '最低观察',
]

export const GRADES_V4 = ['A', 'B+', 'B', 'C', 'D+', 'D']
export const GRADES_V5 = GRADES_V4

export const MAIN_PICKS_V4 = ['主队胜', '客队胜', '平局', '主队不败', '客队不败']

export const OVER_UNDER_PICKS_V4 = ['大2.5', '小2.5', '2.5球分界']

export const DIRECTION_STRENGTH_LABELS_V4 = [
  '强',
  '中强',
  '中等',
  '偏弱',
  '最低观察',
]

export const RECORD_STATUS_V4 = {
  upcoming: 'upcoming',
  liveOrUnknown: 'live_or_unknown',
  pendingSettlement: 'pending_settlement',
  settledAuto: 'settled_auto',
  settledManual: 'settled_manual',
}

export const RECORD_STATUS_LABELS_V4 = {
  upcoming: '待赛',
  live_or_unknown: '进行中/状态不明',
  pending_settlement: '待结算',
  settled_auto: '自动结算',
  settled_manual: '手动结算',
}

export const STAKE_ITEM_KEYS_V4 = [
  'mainDirection',
  'primaryScore',
  'secondaryScore',
  'overUnder',
]

export const STAKE_ITEM_LABELS_V4 = {
  mainDirection: '主方向',
  primaryScore: '主推波胆',
  secondaryScore: '备用波胆',
  overUnder: '大小球',
}

export const DEFAULT_INTERNAL_ODDS_V4 = {
  mainDirection: 1.7,
  overUnder: 1.85,
  primaryScore: 7.5,
  secondaryScore: 8.5,
}

export const GRADE_BASE_RATES_V4 = {
  A: 0.045,
  'B+': 0.035,
  B: 0.025,
  C: 0.012,
  'D+': 0.007,
  D: 0.003,
}

export const SCORE_DIMENSION_KEYS_V4 = [
  'strengthGapScore',
  'formScore',
  'homeAwayScore',
  'lineupStabilityScore',
  'styleMatchupScore',
  'tempoScore',
  'drawPressureScore',
  'marketHeatScore',
  'volatilityScore',
  'scoreConcentrationScore',
  'overUnderClarityScore',
  'dataStabilityScore',
]

export const SCORE_DIMENSION_LABELS_V4 = {
  strengthGapScore: '实力差距',
  formScore: '近期状态',
  homeAwayScore: '主客修正',
  lineupStabilityScore: '阵容稳定',
  styleMatchupScore: '打法克制',
  tempoScore: '比赛节奏',
  drawPressureScore: '平局压力',
  marketHeatScore: '冷热过热',
  volatilityScore: '波动风险',
  scoreConcentrationScore: '比分集中',
  overUnderClarityScore: '大小球清晰',
  dataStabilityScore: '数据稳定',
}

export const TRUSTED_SCORE_SOURCES_V4 = ['actual', 'result', 'fullTime', 'final']

export function isAllowedV4Value(value, allowedValues) {
  return allowedValues.includes(value)
}

export function assertInternalV4AnalysisShape(analysis) {
  if (!analysis || analysis.version !== INTERNAL_V4_VERSION) return false

  const dimensions = analysis.score?.dimensions ?? {}
  const confidences = analysis.confidence ?? {}

  return (
    isAllowedV4Value(analysis.classification?.gameType, GAME_TYPES_V4) &&
    isAllowedV4Value(analysis.decision?.executionLevel, EXECUTION_LEVELS_V4) &&
    isAllowedV4Value(analysis.decision?.poolStatus, POOL_STATUS_V4) &&
    isAllowedV4Value(analysis.decision?.grade, GRADES_V4) &&
    isAllowedV4Value(analysis.decision?.mainPick, MAIN_PICKS_V4) &&
    SCORE_DIMENSION_KEYS_V4.every((key) => Number.isFinite(dimensions[key])) &&
    [
      'directionConfidence',
      'scoreConfidence',
      'overUnderConfidence',
      'dataConfidence',
      'internalConfidence',
    ].every((key) => Number.isFinite(confidences[key]))
  )
}
