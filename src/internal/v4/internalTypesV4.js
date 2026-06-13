export const INTERNAL_V4_VERSION = 'internal-v4'

export const INTERNAL_V4_LEDGER_KEY = 'worldcup_internal_v4_ledger'

export const INTERNAL_V4_INITIAL_BANKROLL = 10000

export const INTERNAL_V4_DISCLAIMER =
  '内部模拟系统，仅供模型校准与娱乐参考，不构成投注建议。'

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

export const EXECUTION_LEVELS_V4 = [
  '强推候选',
  '稳健候选',
  '保守候选',
  '内部观察',
  '不进主推池',
]

export const POOL_STATUS_V4 = ['主推池', '候选池', '观察池', '剔除']

export const GRADES_V4 = ['A', 'B+', 'B', 'C', 'D']

export const MAIN_PICKS_V4 = [
  '主队胜',
  '客队胜',
  '平局',
  '主队不败',
  '客队不败',
  '不进主推池',
]

export const OVER_UNDER_PICKS_V4 = ['大2.5', '小2.5', '2.5分界']

export const STAKE_ITEM_KEYS_V4 = [
  'mainDirection',
  'primaryScore',
  'secondaryScore',
  'overUnder',
]

export const STAKE_ITEM_LABELS_V4 = {
  mainDirection: '主方向投入',
  primaryScore: '主推比分投入',
  secondaryScore: '备用比分投入',
  overUnder: '大小球投入',
}

export const DEFAULT_INTERNAL_ODDS_V4 = {
  mainDirection: 1.7,
  overUnder: 1.85,
  primaryScore: 7.5,
  secondaryScore: 8.5,
}

export const GRADE_STAKE_CAPS_V4 = {
  A: 0.05,
  'B+': 0.035,
  B: 0.025,
  C: 0.012,
  D: 0,
}

export const GAME_TYPE_STAKE_SPLITS_V4 = {
  强队压制局: {
    mainDirection: 65,
    primaryScore: 13,
    secondaryScore: 9,
    overUnder: 13,
  },
  低比分胶着局: {
    mainDirection: 50,
    primaryScore: 16,
    secondaryScore: 14,
    overUnder: 20,
  },
  对攻大球局: {
    mainDirection: 40,
    primaryScore: 16,
    secondaryScore: 14,
    overUnder: 30,
  },
  平局保护局: {
    mainDirection: 50,
    primaryScore: 20,
    secondaryScore: 20,
    overUnder: 10,
  },
  强队过热局: {
    mainDirection: 45,
    primaryScore: 15,
    secondaryScore: 15,
    overUnder: 25,
  },
  冷门波动局: {
    mainDirection: 45,
    primaryScore: 15,
    secondaryScore: 15,
    overUnder: 25,
  },
  信息不足局: {
    mainDirection: 100,
    primaryScore: 0,
    secondaryScore: 0,
    overUnder: 0,
  },
  方向冲突局: {
    mainDirection: 0,
    primaryScore: 0,
    secondaryScore: 0,
    overUnder: 0,
  },
}

export const RECORD_STATUS_V4 = {
  planned: 'planned',
  pending: 'pending',
  settled: 'settled',
  skipped: 'skipped',
}

export function isAllowedV4Value(value, allowedValues) {
  return allowedValues.includes(value)
}

export function assertInternalV4AnalysisShape(analysis) {
  if (!analysis || analysis.version !== INTERNAL_V4_VERSION) return false
  return (
    isAllowedV4Value(analysis.classification?.gameType, GAME_TYPES_V4) &&
    isAllowedV4Value(analysis.decision?.executionLevel, EXECUTION_LEVELS_V4) &&
    isAllowedV4Value(analysis.decision?.poolStatus, POOL_STATUS_V4) &&
    isAllowedV4Value(analysis.decision?.grade, GRADES_V4) &&
    isAllowedV4Value(analysis.decision?.mainPick, MAIN_PICKS_V4)
  )
}
