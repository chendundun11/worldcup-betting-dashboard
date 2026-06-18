import { chromium } from 'playwright'

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

    await page.goto(BASE_URL, { waitUntil: 'networkidle' })
    const publicAudit = await page.evaluate(
      ({ oldTerms, sensitiveTerms }) => {
        const hasAny = (text, terms) =>
          terms.some((term) => text.toLowerCase().includes(term.toLowerCase()))
        const bodyText = document.body.innerText
        const tail = document.querySelector('.tail-score-radar-panel')?.getBoundingClientRect()
        const main = document.querySelector('.main-layout')?.getBoundingClientRect()

        return {
          hasFourNil: bodyText.includes('4-0'),
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

    assert(publicAudit.tailScores.includes('4-0'), `${viewport.name}: public radar must show 4-0`)
    assert(publicAudit.hasFourNil, `${viewport.name}: public page must include 4-0`)
    assert(publicAudit.tailTop < publicAudit.mainTop, `${viewport.name}: radar must stay above main`)
    assert(publicAudit.oldCopy === false, `${viewport.name}: public page has old score copy`)
    assert(publicAudit.sensitive === false, `${viewport.name}: public page has sensitive copy`)
    assert(publicAudit.overflowX === 0, `${viewport.name}: public page has horizontal overflow`)

    await page.goto(getInternalUrl(), { waitUntil: 'networkidle' })
    await page.waitForSelector('.internal-v4-detail-tabs', { timeout: 20000 })
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
