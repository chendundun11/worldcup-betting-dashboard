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

mkdirSync(OUT_DIR, { recursive: true })

const targets = [
  ['public-desktop.png', { width: 1440, height: 1200 }, '/'],
  ['public-laptop.png', { width: 1024, height: 900 }, '/'],
  ['public-tablet.png', { width: 768, height: 900 }, '/'],
  ['public-mobile.png', { width: 390, height: 844 }, '/'],
  ['public-compact.png', { width: 360, height: 780 }, '/'],
  ['public-narrow.png', { width: 320, height: 740 }, '/'],
  ['codex-workbench.png', { width: 1280, height: 900 }, '/codex-workbench.html'],
]

const browser = await chromium.launch({ headless: true })

try {
  for (const [filename, viewport, pathname] of targets) {
    const page = await browser.newPage({ viewport })
    await page.goto(makeUrl(pathname), { waitUntil: 'domcontentloaded' })
    if (pathname === '/') {
      await page.waitForSelector('.public-command-hero', { timeout: 20000 })
    }
    await page.screenshot({ path: join(OUT_DIR, filename), fullPage: true })
    await page.close()
  }

  console.log(`Public V5 screenshots saved to ${OUT_DIR}`)
} finally {
  await browser.close()
}
