import { mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { chromium } from 'playwright'

const BASE_URL = process.env.DASHBOARD_URL ?? 'http://127.0.0.1:5177/'
const OUT_DIR = resolve(process.env.VISUAL_AUDIT_DIR ?? '.codex/visual-audits/public-v5')

function makeUrl(pathname = '/') {
  const url = new URL(BASE_URL)
  url.pathname = pathname
  url.search = ''
  url.hash = ''
  return url.toString()
}

function makeInternalUrl() {
  const url = new URL(BASE_URL)
  url.pathname = '/'
  url.search = ''
  url.hash = 'internal-v4'
  return url.toString()
}

mkdirSync(OUT_DIR, { recursive: true })

const targets = [
  ['public-desktop.png', { width: 1440, height: 1200 }, makeUrl('/')],
  ['public-laptop.png', { width: 1024, height: 900 }, makeUrl('/')],
  ['public-tablet.png', { width: 768, height: 900 }, makeUrl('/')],
  ['public-mobile.png', { width: 390, height: 844 }, makeUrl('/')],
  ['public-compact.png', { width: 360, height: 780 }, makeUrl('/')],
  ['public-narrow.png', { width: 320, height: 740 }, makeUrl('/')],
  ['internal-desktop.png', { width: 1440, height: 1200 }, makeInternalUrl()],
  ['internal-mobile.png', { width: 390, height: 844 }, makeInternalUrl()],
  ['internal-narrow.png', { width: 320, height: 740 }, makeInternalUrl()],
  ['codex-workbench.png', { width: 1280, height: 900 }, makeUrl('/codex-workbench.html')],
]

const browser = await chromium.launch({ headless: true })

try {
  for (const [filename, viewport, url] of targets) {
    const page = await browser.newPage({ viewport })
    await page.goto(url, { waitUntil: 'domcontentloaded' })
    if (filename.startsWith('public-')) {
      await page.waitForSelector('.public-command-hero', { timeout: 20000 })
    }
    if (filename.startsWith('internal-')) {
      await page.waitForSelector('.internal-v4-detail-tabs', { timeout: 20000 })
      await page.waitForTimeout(600)
    }
    await page.screenshot({ path: join(OUT_DIR, filename), fullPage: true })
    await page.close()
  }

  console.log(`Public V5 screenshots saved to ${OUT_DIR}`)
} finally {
  await browser.close()
}
