import { chromium } from 'playwright'

const BASE_URL = process.env.DASHBOARD_URL ?? 'http://127.0.0.1:5177/'
const ITERATIONS = Math.max(1, Number(process.env.SOAK_ITERATIONS ?? 1))
const DELAY_MS = Math.max(0, Number(process.env.SOAK_DELAY_MS ?? 0))

const viewports = [
  ['desktop', { width: 1440, height: 1200 }],
  ['mobile', { width: 390, height: 844 }],
]

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function makeUrl(pathname = '/', hash = '') {
  const url = new URL(BASE_URL)
  url.pathname = pathname
  url.search = ''
  url.hash = hash
  return url.toString()
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

const routes = [
  ['public', makeUrl('/')],
  ['internal', makeUrl('/', 'internal-v4')],
  ['workbench', makeUrl('/codex-workbench.html')],
]

const browser = await chromium.launch({ headless: true })
const results = []

try {
  for (let iteration = 1; iteration <= ITERATIONS; iteration += 1) {
    if (iteration > 1 && DELAY_MS > 0) {
      console.log(
        JSON.stringify({
          checkedAt: new Date().toISOString(),
          delayMs: DELAY_MS,
          nextIteration: iteration,
          type: 'soak-wait',
        }),
      )
      await sleep(DELAY_MS)
    }

    for (const [viewportName, viewport] of viewports) {
      for (const [routeName, url] of routes) {
        const page = await browser.newPage({ viewport })
        const messages = []

        page.on('console', (message) => {
          if (['error', 'warning'].includes(message.type())) {
            messages.push(`${message.type()}: ${message.text()}`)
          }
        })
        page.on('pageerror', (error) => {
          messages.push(`pageerror: ${error.message}`)
        })

        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 })

        if (routeName === 'public') {
          await page.waitForSelector('.public-command-hero', { timeout: 20000 })
        }
        if (routeName === 'internal') {
          await page.waitForSelector('.internal-v4-detail-tabs', { timeout: 20000 })
        }

        await page.waitForTimeout(1200)

        const overflowX = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        )

        const result = {
          iteration,
          messages,
          overflowX,
          route: routeName,
          viewport: viewportName,
        }
        results.push(result)

        console.log(
          JSON.stringify({
            checkedAt: new Date().toISOString(),
            consoleMessages: messages.length,
            iteration,
            overflowX,
            route: routeName,
            type: 'soak-progress',
            viewport: viewportName,
          }),
        )

        assert(overflowX === 0, `${routeName}/${viewportName}: horizontal overflow ${overflowX}`)
        assert(
          messages.length === 0,
          `${routeName}/${viewportName}: console noise ${JSON.stringify(messages)}`,
        )

        await page.close()
      }
    }
  }

  console.log(
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        delayMs: DELAY_MS,
        iterations: ITERATIONS,
        results,
      },
      null,
      2,
    ),
  )
  console.log('Runtime soak checks passed.')
} finally {
  await browser.close()
}
