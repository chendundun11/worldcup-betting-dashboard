import { chromium } from 'playwright'

const BASE_URL = process.env.DASHBOARD_URL ?? 'http://127.0.0.1:5177/'

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

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

const browser = await chromium.launch({ headless: true })

try {
  for (const viewport of [
    { name: 'desktop', width: 1440, height: 1200 },
    { name: 'laptop', width: 1024, height: 900 },
    { name: 'tablet', width: 768, height: 900 },
    { name: 'mobile', width: 390, height: 844, expectMobileRail: true },
    { name: 'compact', width: 360, height: 780, expectMobileRail: true },
    { name: 'narrow', width: 320, height: 740, expectMobileRail: true },
  ]) {
    const page = await browser.newPage({ viewport })
    await page.goto(makeUrl('/'), { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.public-command-hero', { timeout: 20000 })

    const audit = await page.evaluate(() => {
      const hero = document.querySelector('.public-command-hero')
      const heroImage = document.querySelector('.hero-visual-board img')
      const onboarding = document.querySelector('.onboarding-banner')
      const tail = document.querySelector('.tail-score-radar-panel')
      const main = document.querySelector('.main-layout')
      const heroStyle = hero ? getComputedStyle(hero) : null
      const onboardingStyle = onboarding ? getComputedStyle(onboarding) : null
      const tailStyle = tail ? getComputedStyle(tail) : null
      const mobileRail = document.querySelector('.mobile-match-rail')
      const mobileRailStyle = mobileRail ? getComputedStyle(mobileRail) : null
      const heroRect = hero?.getBoundingClientRect()
      const tailRect = tail?.getBoundingClientRect()
      const mainRect = main?.getBoundingClientRect()
      const overflowSelectors = [
        '.public-command-hero .hero-copy h1',
        '.hero-command-metrics p',
        '.tail-score-radar-card',
        '.quant-score-public-card',
        '.mobile-match-chip',
        '.share-action-button',
        '.schedule-toggle-button',
        '.onboarding-close-button',
      ]
      const layoutIssues = overflowSelectors.flatMap((selector) =>
        [...document.querySelectorAll(selector)]
          .filter((element) => element.getClientRects().length > 0)
          .filter((element) => element.scrollWidth - element.clientWidth > 2)
          .map((element) => ({
            selector,
            clientWidth: element.clientWidth,
            scrollWidth: element.scrollWidth,
            text: String(element.innerText ?? '').slice(0, 80),
          })),
      )

      return {
        commandMetrics: document.querySelectorAll('.hero-command-metrics p').length,
        hasHero: Boolean(hero),
        hasHeroImage: Boolean(heroImage),
        heroBorderRadius: heroStyle?.borderRadius ?? '',
        heroHeight: heroRect?.height ?? 0,
        heroImageLoaded: Boolean(heroImage?.complete && heroImage?.naturalWidth > 0),
        layoutIssues,
        mainTop: mainRect ? Math.round(mainRect.top + window.scrollY) : null,
        mobileRailDisplay: mobileRailStyle?.display ?? '',
        mobileRailItems: document.querySelectorAll('.mobile-match-chip').length,
        onboardingPosition: onboardingStyle?.position ?? '',
        onboardingTop: onboarding
          ? Math.round(onboarding.getBoundingClientRect().top + window.scrollY)
          : null,
        overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        tailBorderRadius: tailStyle?.borderRadius ?? '',
        tailCards: document.querySelectorAll('.tail-score-radar-card').length,
        tailTop: tailRect ? Math.round(tailRect.top + window.scrollY) : null,
      }
    })

    assert(audit.hasHero, `${viewport.name}: V5 command hero must render`)
    assert(audit.hasHeroImage, `${viewport.name}: hero visual asset must be mounted`)
    assert(audit.heroImageLoaded, `${viewport.name}: hero visual asset must load`)
    assert(audit.commandMetrics >= 3, `${viewport.name}: hero command metrics missing`)
    assert(audit.heroHeight >= 220, `${viewport.name}: hero is too shallow for a command surface`)
    assert(audit.tailCards >= 3, `${viewport.name}: high-goal signal board must show cards`)
    assert(audit.tailTop < audit.mainTop, `${viewport.name}: high-goal signal board must stay before main content`)
    assert(audit.onboardingPosition !== 'fixed', `${viewport.name}: onboarding notice must not cover content`)
    assert(audit.overflowX === 0, `${viewport.name}: page must not have horizontal overflow`)
    assert(
      audit.layoutIssues.length === 0,
      `${viewport.name}: key controls must not overflow (${JSON.stringify(audit.layoutIssues)})`,
    )
    if (viewport.expectMobileRail) {
      assert(audit.mobileRailDisplay !== 'none', `${viewport.name}: mobile match rail must be visible`)
      assert(audit.mobileRailItems >= 2, `${viewport.name}: mobile match rail must include quick choices`)
    }
    assert(
      /^0px/.test(audit.heroBorderRadius) && /^0px/.test(audit.tailBorderRadius),
      `${viewport.name}: V5 command surfaces should use squared premium panels`,
    )

    await page.close()
  }

  for (const viewport of [
    { name: 'internal-desktop', width: 1440, height: 1200 },
    { name: 'internal-mobile', width: 390, height: 844 },
    { name: 'internal-narrow', width: 320, height: 740 },
  ]) {
    const page = await browser.newPage({ viewport })
    await page.goto(makeInternalUrl(), { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.internal-v4-detail-tabs', { timeout: 20000 })
    await page.waitForTimeout(600)

    const audit = await page.evaluate(() => {
      const shell = document.querySelector('.internal-v4-shell')
      const title = document.querySelector('.internal-v4-title-block')
      const tabs = document.querySelector('.internal-v4-detail-tabs')
      const summaryCards = document.querySelectorAll('.internal-v4-command-summary article')
      const commandCards = document.querySelectorAll('.internal-v4-command-card div')
      const matchButtons = document.querySelectorAll('.internal-v4-match-list button')
      const shellStyle = shell ? getComputedStyle(shell) : null
      const titleStyle = title ? getComputedStyle(title) : null
      const tabsStyle = tabs ? getComputedStyle(tabs) : null
      const overflowSelectors = [
        '.internal-v4-title-block',
        '.internal-v4-scope-bar button',
        '.internal-v4-action-deck button',
        '.internal-v4-filter button',
        '.internal-v4-match-list button',
        '.internal-v4-command-card div',
        '.internal-v4-detail-tabs button',
      ]
      const layoutIssues = overflowSelectors.flatMap((selector) =>
        [...document.querySelectorAll(selector)]
          .filter((element) => element.getClientRects().length > 0)
          .filter((element) => element.scrollWidth - element.clientWidth > 3)
          .map((element) => ({
            selector,
            clientWidth: element.clientWidth,
            scrollWidth: element.scrollWidth,
            text: String(element.innerText ?? '').slice(0, 80),
          })),
      )
      const selectedMatchName = document.querySelector('.internal-v4-detail-head h2')?.innerText ?? ''
      const bodyText = document.body.innerText

      return {
        activeTabs: document.querySelectorAll('.internal-v4-detail-tabs button.active').length,
        commandCards: commandCards.length,
        hasAutoPreview:
          bodyText.includes('全赛程预览') &&
          matchButtons.length > 0 &&
          !bodyText.includes('当前计划范围没有比赛'),
        hasShell: Boolean(shell),
        hasTitle: bodyText.includes('V5 内部资金引擎'),
        layoutIssues,
        matchButtons: matchButtons.length,
        overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        selectedMatchName,
        shellBackground: shellStyle?.backgroundImage ?? '',
        summaryCards: summaryCards.length,
        tabsBorderRadius: tabsStyle?.borderRadius ?? '',
        titleBorderRadius: titleStyle?.borderRadius ?? '',
      }
    })

    assert(audit.hasShell, `${viewport.name}: internal shell must render`)
    assert(audit.hasTitle, `${viewport.name}: internal title must render`)
    assert(audit.hasAutoPreview, `${viewport.name}: internal page must show a non-empty plan scope`)
    assert(audit.summaryCards >= 4, `${viewport.name}: internal summary cards missing`)
    assert(audit.commandCards >= 4, `${viewport.name}: internal command cards missing`)
    assert(audit.matchButtons >= 3, `${viewport.name}: internal match queue must show matches`)
    assert(audit.selectedMatchName !== '未选择比赛', `${viewport.name}: internal page must select a match`)
    assert(audit.activeTabs === 1, `${viewport.name}: exactly one internal tab must be active`)
    assert(audit.overflowX === 0, `${viewport.name}: internal page must not overflow horizontally`)
    assert(
      audit.layoutIssues.length === 0,
      `${viewport.name}: internal controls must not overflow (${JSON.stringify(audit.layoutIssues)})`,
    )
    assert(
      audit.shellBackground.includes('linear-gradient'),
      `${viewport.name}: internal shell must use the premium command background`,
    )
    assert(
      /^0px/.test(audit.titleBorderRadius) && /^0px/.test(audit.tabsBorderRadius),
      `${viewport.name}: internal command panels should use squared premium panels`,
    )

    await page.close()
  }

  const workbench = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  await workbench.goto(makeUrl('/codex-workbench.html'), { waitUntil: 'domcontentloaded' })
  const workbenchAudit = await workbench.evaluate(() => ({
    links: [...document.querySelectorAll('a')].map((link) => link.getAttribute('href')),
    text: document.body.innerText,
  }))
  assert(
    workbenchAudit.text.includes('外部公开页重做中'),
    'design workbench must describe the current redesign phase',
  )
  assert(workbenchAudit.links.includes('/'), 'design workbench must link back to the public page')
  assert(
    workbenchAudit.links.includes('/#internal-v4'),
    'design workbench must link to the internal engine',
  )
  await workbench.close()

  console.log('Public and internal V5 visual checks passed.')
} finally {
  await browser.close()
}
