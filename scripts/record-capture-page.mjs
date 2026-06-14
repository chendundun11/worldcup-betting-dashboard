import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')

function parseArgs(argv) {
  const options = {
    durationSeconds: 30,
    match: '',
    output: '',
    port: 5173,
    url: '',
    viewportHeight: 1920,
    viewportWidth: 1080,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]

    if (arg === '--help' || arg === '-h') {
      console.log(
        [
          'Usage:',
          '  node .\\scripts\\record-capture-page.mjs --url "http://127.0.0.1:5173/?capture=1&match=葡萄牙" --output <capture_raw.mp4>',
        ].join('\n'),
      )
      process.exit(0)
    }

    if (arg === '--url') {
      options.url = String(argv[index + 1] ?? '').trim()
      index += 1
      continue
    }

    if (arg === '--match') {
      options.match = String(argv[index + 1] ?? '').trim()
      index += 1
      continue
    }

    if (arg === '--output') {
      options.output = String(argv[index + 1] ?? '').trim()
      index += 1
      continue
    }

    if (arg === '--duration') {
      options.durationSeconds = Number(argv[index + 1])
      index += 1
      continue
    }

    if (arg === '--port') {
      options.port = Number(argv[index + 1])
      index += 1
      continue
    }

    throw new Error(`无法识别参数：${arg}`)
  }

  if (!options.output) throw new Error('--output 是必填参数。')
  if (!Number.isFinite(options.durationSeconds) || options.durationSeconds < 5) {
    throw new Error('--duration 必须大于等于 5 秒。')
  }
  if (!options.url) {
    const params = new URLSearchParams({ capture: '1' })
    if (options.match) params.set('match', options.match)
    options.url = `http://127.0.0.1:${options.port}/?${params.toString()}`
  }
  return options
}

function requestOk(url) {
  return new Promise((resolve) => {
    const request = http.get(url, (response) => {
      response.resume()
      resolve(response.statusCode >= 200 && response.statusCode < 500)
    })
    request.on('error', () => resolve(false))
    request.setTimeout(850, () => {
      request.destroy()
      resolve(false)
    })
  })
}

async function waitForServer(baseUrl, timeoutMs = 18_000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    if (await requestOk(baseUrl)) return true
    await new Promise((resolve) => setTimeout(resolve, 450))
  }
  return false
}

function startVite(port) {
  const command = process.platform === 'win32' ? 'cmd.exe' : 'npm'
  const args =
    process.platform === 'win32'
      ? ['/d', '/s', '/c', `npm run dev -- --host 127.0.0.1 --port ${port}`]
      : ['run', 'dev', '--', '--host', '127.0.0.1', '--port', String(port)]
  return spawn(command, args, {
    cwd: projectRoot,
    env: {
      ...process.env,
      BROWSER: 'none',
    },
    stdio: 'ignore',
    windowsHide: true,
  })
}

function runCapture(command, args, cwd = projectRoot) {
  return spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      PYTHONIOENCODING: 'utf-8',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
}

function probeDuration(filePath) {
  if (!existsSync(filePath)) return 0
  const result = runCapture('ffprobe', [
    '-v',
    'error',
    '-show_entries',
    'format=duration',
    '-of',
    'default=nw=1:nk=1',
    filePath,
  ])
  if (result.status !== 0) return 0
  return Number.parseFloat(result.stdout.trim()) || 0
}

function convertToMp4(inputPath, outputPath) {
  mkdirSync(path.dirname(outputPath), { recursive: true })
  const result = runCapture('ffmpeg', [
    '-y',
    '-hide_banner',
    '-loglevel',
    'error',
    '-i',
    inputPath,
    '-vf',
    'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30,format=yuv420p',
    '-an',
    '-c:v',
    'libx264',
    '-preset',
    'medium',
    '-crf',
    '20',
    outputPath,
  ])
  if (result.status !== 0) {
    const detail = [result.stderr, result.stdout].filter(Boolean).join('\n').trim()
    throw new Error(`ffmpeg 转换 capture mp4 失败：${detail || `exit ${result.status}`}`)
  }
}

function newestFile(dir, extension) {
  if (!existsSync(dir)) return null
  return readdirSync(dir)
    .filter((name) => name.toLowerCase().endsWith(extension))
    .map((name) => path.join(dir, name))
    .sort((left, right) => statSync(right).mtimeMs - statSync(left).mtimeMs)
    .at(0) ?? null
}

function compareBuffers(left, right) {
  if (!left?.length || !right?.length) return 0
  const step = Math.max(Math.floor(Math.min(left.length, right.length) / 1400), 1)
  let changed = 0
  let sampled = 0
  for (let index = 0; index < Math.min(left.length, right.length); index += step) {
    sampled += 1
    if (Math.abs(left[index] - right[index]) > 12) changed += 1
  }
  return sampled ? changed / sampled : 0
}

async function loadPlaywright() {
  try {
    return await import('playwright')
  } catch {
    throw new Error(
      'Playwright 未安装，无法自动录屏。请先运行：npm install -D playwright',
    )
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const baseUrl = new URL(options.url).origin
  let startedServer = null

  if (!(await waitForServer(baseUrl, 1_200))) {
    startedServer = startVite(options.port)
    const ready = await waitForServer(baseUrl)
    if (!ready) throw new Error(`本地 Vite 页面未启动成功：${baseUrl}`)
  }

  const { chromium } = await loadPlaywright()
  const recordDir = path.join(path.dirname(path.resolve(options.output)), '.capture-recordings')
  mkdirSync(recordDir, { recursive: true })

  let browser = null
  let rawVideoPath = null
  let screenshotDiffRatio = 0
  let autoScrollDetected = false
  let captureModeEnabled = false
  let captureSceneAligned = false
  let engineeringCopyDetected = false
  let finalActiveScene = null
  let sceneHoldDetected = false
  let sceneFlowDetected = false
  let storyboardSceneCount = 0

  try {
    browser = await chromium.launch({ headless: true })
    const context = await browser.newContext({
      deviceScaleFactor: 1,
      recordVideo: {
        dir: recordDir,
        size: {
          height: options.viewportHeight,
          width: options.viewportWidth,
        },
      },
      viewport: {
        height: options.viewportHeight,
        width: options.viewportWidth,
      },
    })
    const page = await context.newPage()
    await page.goto(options.url, { waitUntil: 'networkidle', timeout: 60_000 })
    await page.waitForSelector('[data-capture-mode="true"]', { timeout: 15_000 })
    captureModeEnabled = await page.locator('[data-capture-mode="true"]').count().then(Boolean)
    storyboardSceneCount = await page.locator('[data-storyboard-scene]').count()
    sceneFlowDetected =
      storyboardSceneCount >= 6 &&
      (await page.locator('[data-capture-scene]').count()) >= 6 &&
      (await page.locator('[data-flow="v5-capture"]').count()) === 1

    const before = await page.screenshot({ fullPage: false, type: 'png' })
    await page.waitForTimeout(Math.min(Math.max(options.durationSeconds * 1000 * 0.46, 6_000), 14_000))
    const mid = await page.screenshot({ fullPage: false, type: 'png' })
    screenshotDiffRatio = compareBuffers(before, mid)
    await page.waitForTimeout(Math.max(options.durationSeconds * 1000 - 14_000, 6_000))
    autoScrollDetected = await page.evaluate(() => window.scrollY > 180)
    const pageAudit = await page.evaluate(() => {
      const root = document.querySelector('[data-capture-mode="true"]')
      const text = document.body.innerText || ''
      const activeScene = Number(root?.getAttribute('data-active-scene') || 0)
      const sceneCount = Number(root?.getAttribute('data-storyboard-scene-count') || 0)
      return {
        activeScene,
        engineeringCopyDetected: /raw response|provider error|api key|接口原文|错误原文/i.test(text),
        sceneCount,
        sceneHoldDetected: root?.getAttribute('data-scene-hold') === 'true',
      }
    })
    finalActiveScene = pageAudit.activeScene || null
    engineeringCopyDetected = pageAudit.engineeringCopyDetected
    sceneHoldDetected = pageAudit.sceneHoldDetected
    captureSceneAligned =
      captureModeEnabled &&
      sceneFlowDetected &&
      pageAudit.sceneCount >= 6 &&
      pageAudit.activeScene === pageAudit.sceneCount

    const video = page.video()
    await context.close()
    rawVideoPath = video ? await video.path() : newestFile(recordDir, '.webm')
  } finally {
    if (browser) await browser.close().catch(() => {})
    if (startedServer) startedServer.kill()
  }

  if (!rawVideoPath || !existsSync(rawVideoPath)) {
    throw new Error('Playwright 未生成录屏文件。')
  }

  const outputPath = path.resolve(options.output)
  convertToMp4(rawVideoPath, outputPath)
  const durationSeconds = probeDuration(outputPath)
  const result = {
    autoScrollDetected,
    captureSceneAligned,
    captureDurationSeconds: durationSeconds,
    captureLooksDynamic: screenshotDiffRatio > 0.02,
    captureModeEnabled,
    captureVideoPath: outputPath,
    engineeringCopyDetected,
    finalActiveScene,
    rawPlaywrightVideoPath: rawVideoPath,
    sceneHoldDetected,
    sceneFlowDetected,
    screenshotDiffRatio,
    storyboardSceneCount,
    url: options.url,
  }
  console.log(JSON.stringify(result, null, 2))
}

main().catch((error) => {
  console.error(error?.message ?? error)
  process.exit(1)
})
