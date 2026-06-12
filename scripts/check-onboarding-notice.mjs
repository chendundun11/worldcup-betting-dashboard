import { readFileSync } from 'node:fs'

import {
  ONBOARDING_NOTICE_BODY,
  ONBOARDING_NOTICE_CLOSE_TEXT,
  ONBOARDING_NOTICE_STORAGE_KEY,
  ONBOARDING_NOTICE_TITLE,
  markOnboardingNoticeDismissed,
  shouldShowOnboardingNotice,
} from '../src/services/onboardingNotice.js'

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function createStorage() {
  const map = new Map()
  return {
    getItem(key) {
      return map.get(key) ?? null
    },
    setItem(key, value) {
      map.set(key, value)
    },
  }
}

const storage = createStorage()
const now = '2026-06-12T12:00:00+08:00'
assert(ONBOARDING_NOTICE_TITLE === 'AI 赛前风控提示', 'Onboarding title must exist.')
assert(
  ONBOARDING_NOTICE_BODY.join('\n').includes('低于60') &&
    ONBOARDING_NOTICE_BODY.join('\n').includes('谨慎观望'),
  'Low confidence guidance must exist.',
)
assert(
  ONBOARDING_NOTICE_CLOSE_TEXT === '我知道了，查看今日重点',
  'Close button copy must exist.',
)
assert(
  ONBOARDING_NOTICE_STORAGE_KEY.includes('onboarding-notice-date'),
  'localStorage key must exist.',
)
assert(shouldShowOnboardingNotice(storage, now), 'Notice must show before dismiss.')
markOnboardingNoticeDismissed(storage, now)
assert(!shouldShowOnboardingNotice(storage, now), 'Notice must close for the same day.')

const throwingStorage = {
  getItem() {
    throw new Error('blocked')
  },
  setItem() {
    throw new Error('blocked')
  },
}
assert(
  shouldShowOnboardingNotice(throwingStorage, now) === true,
  'Blocked localStorage must not crash shouldShow.',
)
markOnboardingNoticeDismissed(throwingStorage, now)

const publicText = [
  readFileSync('src/App.jsx', 'utf8'),
  readFileSync('src/App.css', 'utf8'),
  readFileSync('src/services/onboardingNotice.js', 'utf8'),
].join('\n')

assert(publicText.includes(ONBOARDING_NOTICE_TITLE), 'App must include onboarding title.')
assert(publicText.includes(ONBOARDING_NOTICE_CLOSE_TEXT), 'App must include close button.')
assert(publicText.includes('setShowOnboardingNotice(false)'), 'Onboarding must be closable.')

for (const [label, pattern] of Object.entries({
  weatherClaim: /已接入实时天气|实时天气已接入/,
  openAiClaim: /已启用 OpenAI|GPT 大模型已启用|OpenAI 实时分析/,
  forbiddenCopy: /稳赚|必中|保证命中|内幕/,
})) {
  assert(!pattern.test(publicText), `Onboarding must not contain ${label}.`)
}

console.log('Onboarding notice checks passed.')
