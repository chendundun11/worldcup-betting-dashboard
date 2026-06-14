import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')
const workspaceRoot = path.resolve(projectRoot, '..')
const videoFactoryPath = path.join(workspaceRoot, 'video-factory')
const exportScriptPath = path.join(__dirname, 'export-video-package.mjs')
const exportReportPath = path.join(__dirname, 'video-package-export-report.json')
const buildReportPath = path.join(__dirname, 'douyin-video-build-report.json')
const finalVideoPath = path.join(videoFactoryPath, 'output', 'final_douyin.mp4')
const qualityReportPath = path.join(videoFactoryPath, 'output', 'quality_report.txt')
const packageDir = path.join(videoFactoryPath, 'input', 'package')
const requiredPackageFiles = [
  'poster.png',
  'shot_01.png',
  'shot_02.png',
  'shot_03.png',
  'meta.json',
]

function parseArgs(argv) {
  const options = {
    exportArgs: [],
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]

    if (arg === '--help' || arg === '-h') {
      console.log(
        [
          'Usage:',
          '  node .\\scripts\\build-douyin-video.mjs',
          '  node .\\scripts\\build-douyin-video.mjs --match "葡萄牙"',
          '  node .\\scripts\\build-douyin-video.mjs --index 0',
        ].join('\n'),
      )
      process.exit(0)
    }

    if (arg === '--match') {
      const value = String(argv[index + 1] ?? '').trim()
      if (!value) throw new Error('--match 需要一个比赛关键词。')
      options.exportArgs.push('--match', value)
      index += 1
      continue
    }

    if (arg.startsWith('--match=')) {
      const value = arg.slice('--match='.length).trim()
      if (!value) throw new Error('--match 需要一个比赛关键词。')
      options.exportArgs.push('--match', value)
      continue
    }

    if (arg === '--index') {
      const value = String(argv[index + 1] ?? '').trim()
      if (!/^\d+$/.test(value)) throw new Error('--index 必须是非负整数。')
      options.exportArgs.push('--index', value)
      index += 1
      continue
    }

    if (arg.startsWith('--index=')) {
      const value = arg.slice('--index='.length).trim()
      if (!/^\d+$/.test(value)) throw new Error('--index 必须是非负整数。')
      options.exportArgs.push('--index', value)
      continue
    }

    throw new Error(`无法识别参数：${arg}`)
  }

  return options
}

function quoteArg(value) {
  return /\s|"/.test(value) ? `"${value.replace(/"/g, '\\"')}"` : value
}

function commandText(argv) {
  return argv.map(quoteArg).join(' ')
}

function readJson(filePath, fallback = null) {
  if (!existsSync(filePath)) return fallback
  return JSON.parse(readFileSync(filePath, 'utf8'))
}

function fileInfo(filePath) {
  if (!existsSync(filePath)) {
    return {
      exists: false,
      path: filePath,
      sizeBytes: 0,
    }
  }

  return {
    exists: true,
    path: filePath,
    sizeBytes: statSync(filePath).size,
  }
}

function readRenderMode() {
  if (!existsSync(qualityReportPath)) return null
  const text = readFileSync(qualityReportPath, 'utf8')
  return text.match(/^render_mode=(.+)$/m)?.[1]?.trim() ?? null
}

function runCommand(command, args, options) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      PYTHONIOENCODING: 'utf-8',
    },
    stdio: 'inherit',
  })

  if (result.error) {
    throw result.error
  }

  if (result.status !== 0) {
    throw new Error(`${commandText([command, ...args])} 运行失败，退出码 ${result.status}`)
  }
}

function runPythonMakeDouyin() {
  try {
    runCommand('python', ['.\\scripts\\make_douyin.py'], { cwd: videoFactoryPath })
    return 'python .\\scripts\\make_douyin.py'
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
    runCommand('py', ['.\\scripts\\make_douyin.py'], { cwd: videoFactoryPath })
    return 'py .\\scripts\\make_douyin.py'
  }
}

function packageFilesStatus() {
  return Object.fromEntries(
    requiredPackageFiles.map((fileName) => [
      fileName,
      fileInfo(path.join(packageDir, fileName)),
    ]),
  )
}

function writeBuildReport(report) {
  writeFileSync(buildReportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
}

function buildReport({
  command,
  exportReport,
  finalVideo,
  packageFiles,
  pythonCommand,
  qualityReport,
  renderMode,
  warnings,
}) {
  const packageOk = Object.values(packageFiles).every((item) => item.exists)
  const ok =
    packageOk &&
    finalVideo.exists &&
    qualityReport.exists &&
    renderMode === 'package' &&
    exportReport?.usedFallback === false

  return {
    builtAt: new Date().toISOString(),
    command,
    selectedMatchName: exportReport?.selectedMatchName ?? null,
    selectedMatchId: exportReport?.selectedMatchId ?? null,
    matchKey: exportReport?.matchKey ?? null,
    exportReportPath,
    videoFactoryPath,
    finalVideoPath,
    finalVideoExists: finalVideo.exists,
    finalVideoSizeBytes: finalVideo.sizeBytes,
    qualityReportExists: qualityReport.exists,
    renderMode,
    usedFallback: exportReport?.usedFallback ?? null,
    fallbackFields: exportReport?.fallbackFields ?? [],
    packageFiles,
    pythonCommand,
    warnings,
    ok,
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2))
  const userCommand = commandText(['node', '.\\scripts\\build-douyin-video.mjs', ...process.argv.slice(2)])
  const warnings = []

  if (!existsSync(videoFactoryPath)) {
    throw new Error(`找不到 video-factory 目录：${videoFactoryPath}`)
  }

  const exportArgs = [exportScriptPath, ...options.exportArgs]
  runCommand(process.execPath, exportArgs, { cwd: projectRoot })
  const exportReport = readJson(exportReportPath, {})

  const pythonCommand = runPythonMakeDouyin()
  const packageFiles = packageFilesStatus()
  const finalVideo = fileInfo(finalVideoPath)
  const qualityReport = fileInfo(qualityReportPath)
  const renderMode = readRenderMode() ?? (packageFiles.meta?.exists ? 'package' : null)

  if (!qualityReport.exists) warnings.push('quality_report.txt 不存在。')
  if (!finalVideo.exists) warnings.push('final_douyin.mp4 不存在。')
  if (renderMode !== 'package') warnings.push(`renderMode 不是 package：${renderMode ?? 'unknown'}`)
  if (exportReport?.usedFallback) {
    warnings.push(`export-video-package 使用了 fallback：${(exportReport.fallbackFields ?? []).join(', ')}`)
  }

  const report = buildReport({
    command: userCommand,
    exportReport,
    finalVideo,
    packageFiles,
    pythonCommand,
    qualityReport,
    renderMode,
    warnings,
  })
  writeBuildReport(report)

  console.log(
    JSON.stringify(
      {
        finalVideoPath,
        ok: report.ok,
        reportPath: buildReportPath,
        selectedMatchName: report.selectedMatchName,
        usedFallback: report.usedFallback,
      },
      null,
      2,
    ),
  )

  if (!report.ok) process.exit(1)
}

try {
  main()
} catch (error) {
  const fallbackReport = buildReport({
    command: commandText(['node', '.\\scripts\\build-douyin-video.mjs', ...process.argv.slice(2)]),
    exportReport: readJson(exportReportPath, {}),
    finalVideo: fileInfo(finalVideoPath),
    packageFiles: packageFilesStatus(),
    pythonCommand: null,
    qualityReport: fileInfo(qualityReportPath),
    renderMode: readRenderMode(),
    warnings: [error?.message ?? String(error)],
  })
  writeBuildReport(fallbackReport)
  console.error(error?.message ?? error)
  process.exit(1)
}
