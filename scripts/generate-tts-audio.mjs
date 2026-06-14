import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)

function parseArgs(argv) {
  const options = {
    output: '',
    text: '',
    voice: 'zh-CN-XiaoxiaoNeural',
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]

    if (arg === '--help' || arg === '-h') {
      console.log(
        [
          'Usage:',
          '  node .\\scripts\\generate-tts-audio.mjs --text <voiceover.txt> --output <voice.mp3>',
        ].join('\n'),
      )
      process.exit(0)
    }

    if (arg === '--text') {
      options.text = String(argv[index + 1] ?? '').trim()
      index += 1
      continue
    }

    if (arg === '--output') {
      options.output = String(argv[index + 1] ?? '').trim()
      index += 1
      continue
    }

    if (arg === '--voice') {
      options.voice = String(argv[index + 1] ?? '').trim() || options.voice
      index += 1
      continue
    }

    throw new Error(`无法识别参数：${arg}`)
  }

  if (!options.text) throw new Error('--text 是必填参数。')
  if (!options.output) throw new Error('--output 是必填参数。')
  return options
}

function runCapture(command, args, cwd = process.cwd()) {
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

function commandText(command, args) {
  return [command, ...args].join(' ')
}

export function resolvePythonRunner() {
  const python = runCapture('python', ['--version'])
  if (python.status === 0) return { argsPrefix: [], command: 'python' }

  const py = runCapture('py', ['-3', '--version'])
  if (py.status === 0) return { argsPrefix: ['-3'], command: 'py' }

  throw new Error('找不到 Python，无法生成 TTS。')
}

function runPythonModule(runner, moduleName, args, cwd = process.cwd()) {
  return runCapture(runner.command, [...runner.argsPrefix, '-m', moduleName, ...args], cwd)
}

function edgeTtsAvailable(runner) {
  const result = runPythonModule(runner, 'edge_tts', ['--help'])
  return result.status === 0
}

export function ensureEdgeTts() {
  const runner = resolvePythonRunner()
  if (edgeTtsAvailable(runner)) {
    return {
      installed: false,
      runner,
    }
  }

  const install = runPythonModule(runner, 'pip', ['install', 'edge-tts'])
  if (install.status !== 0) {
    const detail = [install.stderr, install.stdout].filter(Boolean).join('\n').trim()
    throw new Error(`安装 edge-tts 失败：${detail || 'unknown error'}`)
  }

  if (!edgeTtsAvailable(runner)) {
    throw new Error('edge-tts 安装后仍不可用。')
  }

  return {
    installed: true,
    runner,
  }
}

export function probeMediaDuration(filePath) {
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

function runEdgeTts({ outputPath, rate, runner, textPath, voice }) {
  const result = runPythonModule(runner, 'edge_tts', [
    '--voice',
    voice,
    '--rate',
    rate,
    '--file',
    textPath,
    '--write-media',
    outputPath,
  ])

  if (result.status !== 0) {
    const detail = [result.stderr, result.stdout].filter(Boolean).join('\n').trim()
    throw new Error(
      `${commandText(runner.command, [...runner.argsPrefix, '-m', 'edge_tts'])} 生成失败：${
        detail || `exit ${result.status}`
      }`,
    )
  }
}

export function generateTtsAudio({
  outputPath,
  textPath,
  voice = 'zh-CN-XiaoxiaoNeural',
}) {
  if (!existsSync(textPath)) throw new Error(`找不到口播文本：${textPath}`)
  const text = readFileSync(textPath, 'utf8').trim()
  if (!text) throw new Error('口播文本为空，无法生成 TTS。')

  mkdirSync(path.dirname(outputPath), { recursive: true })
  const setup = ensureEdgeTts()
  const attempts = ['+4%', '+12%', '-8%']
  let lastDuration = 0
  let lastError = null

  for (const rate of attempts) {
    try {
      runEdgeTts({
        outputPath,
        rate,
        runner: setup.runner,
        textPath,
        voice,
      })
      lastDuration = probeMediaDuration(outputPath)
      if (lastDuration >= 15 && lastDuration <= 25) {
        return {
          durationSeconds: lastDuration,
          installedEdgeTts: setup.installed,
          ok: true,
          outputPath,
          rate,
          ttsEnabled: true,
          ttsEngine: 'edge-tts',
          voice,
        }
      }
    } catch (error) {
      lastError = error
    }
  }

  if (existsSync(outputPath) && statSync(outputPath).size > 0) {
    return {
      durationSeconds: lastDuration,
      installedEdgeTts: setup.installed,
      ok: true,
      outputPath,
      rate: attempts.at(-1),
      ttsEnabled: true,
      ttsEngine: 'edge-tts',
      voice,
      warning:
        lastDuration >= 15 && lastDuration <= 25
          ? null
          : `TTS 已生成，但时长 ${lastDuration.toFixed(2)} 秒不在 15~25 秒目标区间。`,
    }
  }

  throw lastError ?? new Error('edge-tts 未能生成 voice.mp3。')
}

function isMainModule() {
  return process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)
}

if (isMainModule()) {
  try {
    const options = parseArgs(process.argv.slice(2))
    const result = generateTtsAudio({
      outputPath: options.output,
      textPath: options.text,
      voice: options.voice,
    })
    console.log(JSON.stringify(result, null, 2))
  } catch (error) {
    console.error(error?.message ?? error)
    process.exit(1)
  }
}
