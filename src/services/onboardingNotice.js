export const ONBOARDING_NOTICE_STORAGE_KEY =
  'worldcup-betting-dashboard:onboarding-notice-date'

export const ONBOARDING_NOTICE_TITLE = 'AI 赛前风控提示'

export const ONBOARDING_NOTICE_BODY = [
  '系统会综合盘口水位、阵容强弱、球队状态、赛程压力、历史表现与风险模型，生成本场赛前倾向和信心指数。',
  '信心指数越高，代表赛前模型倾向越集中；信心指数偏低时，不代表一定不能参考，而是说明比赛变量较多，建议降低仓位或等待临场复核。',
  '参考标准：80+：重点关注；70-79：稳健参考；60-69：轻仓娱乐；低于60：谨慎观望。',
  '请注意：足球比赛存在红牌、伤退、天气、临场轮换、盘口异动等不可控因素，本页面仅作赛前分析参考，不承诺命中结果。',
]

export const ONBOARDING_NOTICE_CLOSE_TEXT = '我知道了，查看今日重点'

function getStorage(storage) {
  if (storage) return storage
  if (typeof window === 'undefined') return null
  return window.localStorage ?? null
}

export function getNoticeDateKey(now = new Date()) {
  const date = new Date(now)

  if (Number.isNaN(date.getTime())) return ''

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const dateParts = Object.fromEntries(
    parts
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  )

  return `${dateParts.year}-${dateParts.month}-${dateParts.day}`
}

export function shouldShowOnboardingNotice(storage, now = new Date()) {
  const dateKey = getNoticeDateKey(now)

  try {
    const safeStorage = getStorage(storage)
    if (!safeStorage) return true
    return safeStorage.getItem(ONBOARDING_NOTICE_STORAGE_KEY) !== dateKey
  } catch {
    return true
  }
}

export function markOnboardingNoticeDismissed(storage, now = new Date()) {
  const dateKey = getNoticeDateKey(now)

  try {
    const safeStorage = getStorage(storage)
    if (safeStorage) safeStorage.setItem(ONBOARDING_NOTICE_STORAGE_KEY, dateKey)
  } catch {
    // localStorage can fail in private or restricted browsers; the page must keep running.
  }
}
