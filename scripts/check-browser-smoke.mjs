import { chromium } from 'playwright'

import { ONBOARDING_NOTICE_STORAGE_KEY } from '../src/services/onboardingNotice.js'

const BASE_URL = process.env.DASHBOARD_URL ?? 'http://127.0.0.1:5177/'
const VERBOSE = process.env.CHECK_BROWSER_VERBOSE === '1'

const PUBLIC_OLD_TERMS = [
  '\u4e3b\u63a8\u6bd4\u5206',
  '\u8f85\u63a8\u6bd4\u5206',
  '\u4e3b\u63a8\u65b9\u5411',
  '\u5907\u7528\u6bd4\u5206',
  '\u9996\u9009\u6bd4\u5206',
  '\u4e3b\u63a8\uff1a',
  '\u8f85\u63a8\uff1a',
]
const PUBLIC_SENSITIVE_TERMS = [
  'bankroll',
  'stake',
  'ledger',
  'profit',
  '\u5185\u90e8\u8d44\u91d1',
  '\u6a21\u62df\u8d44\u91d1',
  '\u8d26\u672c',
  '\u672c\u573a\u6295\u5165',
]
const INTERNAL_OLD_TERMS = [
  '\u4e3b\u63a8\u6bd4\u5206',
  '\u5907\u7528\u6bd4\u5206',
  '\u8f85\u63a8\u6bd4\u5206',
  '\u4e3b\u63a8\u6ce2\u80c6',
  '\u5907\u7528\u6ce2\u80c6',
]

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function hasAny(text, terms) {
  const normalized = String(text).toLowerCase()
  return terms.some((term) => normalized.includes(String(term).toLowerCase()))
}

function scoreTotal(score) {
  return String(score)
    .split('-')
    .map((part) => Number(part))
    .reduce((sum, value) => sum + (Number.isFinite(value) ? value : 0), 0)
}

function getInternalUrl() {
  const url = new URL(BASE_URL)
  url.hash = 'internal-v4'
  return url.toString()
}

const browser = await chromium.launch({ headless: true })
const results = []

try {
  for (const viewport of [
    { name: 'desktop', width: 1440, height: 1200 },
    { name: 'mobile', width: 390, height: 844 },
  ]) {
    const page = await browser.newPage({ viewport })

    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.public-command-hero', { timeout: 20000 })
    const publicAudit = await page.evaluate(
      ({ oldTerms, sensitiveTerms }) => {
        const hasAny = (text, terms) =>
          terms.some((term) => text.toLowerCase().includes(term.toLowerCase()))
        const bodyText = document.body.innerText
        const tail = document.querySelector('.tail-score-radar-panel')?.getBoundingClientRect()
        const main = document.querySelector('.main-layout')?.getBoundingClientRect()

        return {
          hasFourNil: bodyText.includes('4-0'),
          hasOnboardingBanner: Boolean(document.querySelector('.onboarding-banner')),
          hasOnboardingOverlay: Boolean(document.querySelector('.onboarding-overlay')),
          mainTop: main ? Math.round(main.top + window.scrollY) : null,
          oldCopy: hasAny(bodyText, oldTerms),
          overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          sensitive: hasAny(bodyText, sensitiveTerms),
          tailScores: [...document.querySelectorAll('.tail-score-radar-card')].map((card) =>
            card.getAttribute('data-score'),
          ),
          tailTop: tail ? Math.round(tail.top + window.scrollY) : null,
        }
      },
      {
        oldTerms: PUBLIC_OLD_TERMS,
        sensitiveTerms: PUBLIC_SENSITIVE_TERMS,
      },
    )

    assert(publicAudit.tailScores.length >= 3, `${viewport.name}: public radar must show enough cards`)
    assert(
      publicAudit.tailScores.every((score) => scoreTotal(score) >= 4),
      `${viewport.name}: public radar must only show 4+ goal scores`,
    )
    assert(
      new Set(publicAudit.tailScores).size >= 3,
      `${viewport.name}: public radar must show diverse high-goal scores`,
    )
    assert(publicAudit.hasOnboardingBanner, `${viewport.name}: onboarding banner must render`)
    assert(!publicAudit.hasOnboardingOverlay, `${viewport.name}: onboarding must not be a full overlay`)
    assert(publicAudit.tailTop < publicAudit.mainTop, `${viewport.name}: radar must stay above main`)
    assert(publicAudit.oldCopy === false, `${viewport.name}: public page has old score copy`)
    assert(publicAudit.sensitive === false, `${viewport.name}: public page has sensitive copy`)
    assert(publicAudit.overflowX === 0, `${viewport.name}: public page has horizontal overflow`)

    await page.locator('.onboarding-close-button').click()
    await page.waitForFunction(() => !document.querySelector('.onboarding-banner'))
    const dismissedNotice = await page.evaluate((storageKey) =>
      localStorage.getItem(storageKey),
    ONBOARDING_NOTICE_STORAGE_KEY,
    )
    assert(dismissedNotice, `${viewport.name}: onboarding dismissal must persist`)

    if (viewport.name === 'mobile') {
      const secondMobileMatch = page.locator('.mobile-match-chip').nth(1)
      const mobileMatchName = await secondMobileMatch.locator('strong').innerText()
      await secondMobileMatch.click()
      await page.waitForFunction(
        (matchName) =>
          document.querySelector('.quick-conclusion-card h2')?.innerText.includes(matchName),
        mobileMatchName,
      )
    }

    const firstRadarCard = page.locator('.tail-score-radar-card').first()
    const radarMatchName = await firstRadarCard.locator('p').innerText()
    await firstRadarCard.click()
    await page.waitForFunction(
      (matchName) =>
        document.querySelector('.quick-conclusion-card h2')?.innerText.includes(matchName),
      radarMatchName,
    )

    await page.goto(getInternalUrl(), { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.internal-v4-detail-tabs', { timeout: 20000 })
    await page.waitForTimeout(800)
    const internalScopeAudit = await page.evaluate(() => {
      const bodyText = document.body.innerText
      return {
        hasEmptyScopeMessage: bodyText.includes('当前计划范围没有比赛'),
        hasPreviewData: bodyText.includes('全赛程预览 ·') || bodyText.includes('全赛程预览\n8 场'),
      }
    })
    assert(
      !internalScopeAudit.hasEmptyScopeMessage || !internalScopeAudit.hasPreviewData,
      `${viewport.name}: internal default scope should not stay empty when preview data exists`,
    )
    const hasInternalStakeLabels = await page.evaluate(() => {
      const bodyText = document.body.innerText
      return bodyText.includes('候选波胆') && bodyText.includes('保护波胆')
    })
    if (!hasInternalStakeLabels) {
      const allScheduleButton = page.locator('button').filter({ hasText: '全赛程预览' }).first()
      if (await allScheduleButton.count()) {
        await allScheduleButton.click()
        await page
          .waitForFunction(() => {
            const bodyText = document.body.innerText
            return bodyText.includes('候选波胆') && bodyText.includes('保护波胆')
          }, null, { timeout: 5000 })
          .catch(() => {})
      }
    }
    const internalAudit = await page.evaluate((oldTerms) => {
      const hasAny = (text, terms) =>
        terms.some((term) => text.toLowerCase().includes(term.toLowerCase()))
      const bodyText = document.body.innerText

      return {
        hasCandidateLabels:
          bodyText.includes('\u5019\u9009\u6ce2\u80c6') &&
          bodyText.includes('\u4fdd\u62a4\u6ce2\u80c6'),
        oldCopy: hasAny(bodyText, oldTerms),
        overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        tabs: [...document.querySelectorAll('.internal-v4-detail-tabs button')].map((button) =>
          button.innerText.trim(),
        ),
      }
    }, INTERNAL_OLD_TERMS)

    for (const tab of [
      '\u6267\u884c\u53f0',
      '\u5206\u6790\u94fe',
      '\u5ba1\u8ba1',
      '\u8d26\u672c',
    ]) {
      assert(internalAudit.tabs.includes(tab), `${viewport.name}: internal tab missing ${tab}`)
      await page.locator('.internal-v4-detail-tabs button').filter({ hasText: tab }).click()
      const activeTab = await page.locator('.internal-v4-detail-tabs button.active').innerText()
      assert(activeTab === tab, `${viewport.name}: internal tab ${tab} must become active`)
    }
    assert(internalAudit.oldCopy === false, `${viewport.name}: internal page has old score copy`)
    assert(internalAudit.hasCandidateLabels, `${viewport.name}: internal stake labels missing`)
    assert(internalAudit.overflowX === 0, `${viewport.name}: internal page has horizontal overflow`)

    results.push({ viewport: viewport.name, publicAudit, internalAudit })
    await page.close()
  }

  if (VERBOSE) console.log(JSON.stringify(results, null, 2))
  console.log('Browser smoke checks passed.')
} finally {
  await browser.close()
}
