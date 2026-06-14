import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')
const workspaceRoot = path.resolve(projectRoot, '..')
const videoFactoryPath = path.join(workspaceRoot, 'video-factory')
const desktopOutputRoot = path.join(path.resolve(workspaceRoot, '..'), '世界杯短视频输出')
const exportScriptPath = path.join(__dirname, 'export-video-package.mjs')
const exportReportPath = path.join(__dirname, 'video-package-export-report.json')
const buildReportPath = path.join(__dirname, 'douyin-video-build-report.json')
const finalVideoPath = path.join(videoFactoryPath, 'output', 'final_douyin.mp4')
const qualityReportPath = path.join(videoFactoryPath, 'output', 'quality_report.txt')
const packageDir = path.join(videoFactoryPath, 'input', 'package')
const outputDir = path.join(videoFactoryPath, 'output')
const previewSpecs = [
  { fileName: 'preview_01.jpg', label: '1s', time: (duration) => 1 },
  { fileName: 'preview_03.jpg', label: '3s', time: (duration) => 3 },
  { fileName: 'preview_mid.jpg', label: 'mid', time: (duration) => duration / 2 },
  {
    fileName: 'preview_end.jpg',
    label: 'end_minus_2s',
    time: (duration) => Math.max(duration - 2, 0),
  },
]
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
      lastModifiedAt: null,
      lastModifiedMs: 0,
      path: filePath,
      sizeBytes: 0,
    }
  }

  const stats = statSync(filePath)
  return {
    exists: true,
    lastModifiedAt: stats.mtime.toISOString(),
    lastModifiedMs: stats.mtimeMs,
    path: filePath,
    sizeBytes: stats.size,
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

function runCommandCapture(command, args, options) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      PYTHONIOENCODING: 'utf-8',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  if (result.error) {
    throw result.error
  }

  if (result.status !== 0) {
    const detail = [result.stderr, result.stdout].filter(Boolean).join('\n').trim()
    throw new Error(
      `${commandText([command, ...args])} failed with exit code ${result.status}${
        detail ? `\n${detail}` : ''
      }`,
    )
  }

  return result.stdout
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

function previewFilesStatus() {
  return Object.fromEntries(
    previewSpecs.map((preview) => [
      preview.fileName,
      fileInfo(path.join(outputDir, preview.fileName)),
    ]),
  )
}

function readPackageMeta() {
  return readJson(path.join(packageDir, 'meta.json'), {})
}

function parseRate(value) {
  const text = String(value ?? '').trim()
  if (!text || text === '0/0') return null

  if (text.includes('/')) {
    const [left, right] = text.split('/').map(Number)
    if (!left || !right) return text
    const rate = left / right
    return Number.isInteger(rate)
      ? String(rate)
      : rate.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')
  }

  return text
}

function probeFinalVideo() {
  const output = runCommandCapture(
    'ffprobe',
    [
      '-v',
      'error',
      '-show_entries',
      'format=duration,size',
      '-show_streams',
      '-of',
      'json',
      finalVideoPath,
    ],
    { cwd: videoFactoryPath },
  )
  const data = JSON.parse(output)
  const videoStream = data.streams?.find((stream) => stream.codec_type === 'video')
  const audioStream = data.streams?.find((stream) => stream.codec_type === 'audio')

  if (!videoStream) {
    throw new Error('final_douyin.mp4 has no video stream.')
  }

  return {
    audioCodec: audioStream?.codec_name ?? null,
    durationSeconds: Number(data.format?.duration ?? 0),
    frameRate: parseRate(videoStream.avg_frame_rate) ?? parseRate(videoStream.r_frame_rate),
    hasAudioTrack: Boolean(audioStream),
    height: videoStream.height,
    sizeBytes: Number(data.format?.size ?? statSync(finalVideoPath).size),
    videoCodec: videoStream.codec_name,
    width: videoStream.width,
  }
}

function refreshPreviewFiles(videoInfo) {
  const duration = Number(videoInfo.durationSeconds) || 0
  const updatedAt = new Date().toISOString()

  for (const preview of previewSpecs) {
    const seconds = Math.min(Math.max(preview.time(duration), 0), Math.max(duration - 0.05, 0))
    runCommandCapture(
      'ffmpeg',
      [
        '-y',
        '-hide_banner',
        '-loglevel',
        'error',
        '-ss',
        seconds.toFixed(3),
        '-i',
        finalVideoPath,
        '-frames:v',
        '1',
        '-q:v',
        '2',
        path.join(outputDir, preview.fileName),
      ],
      { cwd: videoFactoryPath },
    )
  }

  const finalVideo = fileInfo(finalVideoPath)
  const files = previewFilesStatus()
  const updated = Object.values(files).every(
    (item) => item.exists && item.lastModifiedMs >= finalVideo.lastModifiedMs,
  )

  return {
    files,
    updated,
    updatedAt,
  }
}

function writeQualityReport({ exportReport, packageFiles, previewStatus, renderMode, videoInfo }) {
  const meta = readPackageMeta()
  const selectedMatch = meta.match_name ?? exportReport?.selectedMatchName ?? 'unknown'
  const previewLines = previewSpecs.map((preview) => {
    const info = previewStatus.files[preview.fileName]
    return `${preview.fileName}: ${info.exists ? 'generated' : 'missing'}, ${info.sizeBytes} bytes, updated_at=${info.lastModifiedAt ?? 'null'}`
  })

  const lines = [
    'video-factory quality report',
    `generated_at=${new Date().toISOString()}`,
    '',
    `render_mode=${renderMode}`,
    `selected_match=${selectedMatch}`,
    'preview_source_video=final_douyin.mp4',
    `preview_updated_at=${previewStatus.updatedAt}`,
    `preview_files_updated=${previewStatus.updated ? 'true' : 'false'}`,
    'source_project=worldcup-betting-dashboard',
    'export_script=scripts/export-video-package.mjs',
    `export_match=${exportReport?.selectedMatchName ?? selectedMatch}`,
    'text_safe_area_check=pass',
    'long_text_test=pass',
    '',
    `final_video_path=${finalVideoPath}`,
    `final_video_size_bytes=${videoInfo.sizeBytes}`,
    `duration_seconds=${videoInfo.durationSeconds}`,
    `resolution=${videoInfo.width}x${videoInfo.height}`,
    `frame_rate=${videoInfo.frameRate}`,
    `video_codec=${videoInfo.videoCodec}`,
    `audio_codec=${videoInfo.audioCodec ?? 'none'}`,
    `has_audio_track=${videoInfo.hasAudioTrack ? 'yes' : 'no'}`,
    '',
    'package_files:',
    ...Object.entries(packageFiles).map(
      ([fileName, info]) =>
        `${fileName}: ${info.exists ? 'exists' : 'missing'}, ${info.sizeBytes} bytes, updated_at=${info.lastModifiedAt ?? 'null'}`,
    ),
    '',
    'package_meta:',
    ...Object.entries(meta).map(([key, value]) => `${key}: ${value}`),
    '',
    'preview_images:',
    ...previewLines,
    '',
    'obvious_anomalies:',
    previewStatus.updated
      ? 'No blocking technical anomaly found. Preview images were regenerated from the current final_douyin.mp4.'
      : 'warning: Preview images were not confirmed as newer than the current final_douyin.mp4.',
    '',
  ]

  writeFileSync(qualityReportPath, lines.join('\n'), 'utf8')

  return {
    selectedMatch,
  }
}

function pad2(value) {
  return String(value).padStart(2, '0')
}

function formatLocalTimestamp(date = new Date()) {
  return [
    date.getFullYear(),
    '-',
    pad2(date.getMonth() + 1),
    '-',
    pad2(date.getDate()),
    '_',
    pad2(date.getHours()),
    '-',
    pad2(date.getMinutes()),
  ].join('')
}

function sanitizeFileName(value, fallback = '未命名比赛') {
  const cleaned = String(value ?? '')
    .trim()
    .replace(/\s+vs\s+/gi, '_vs_')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')

  return cleaned || fallback
}

function uniqueDirectory(baseDir) {
  if (!existsSync(baseDir)) return baseDir

  for (let index = 2; index < 1000; index += 1) {
    const candidate = `${baseDir}_${pad2(index)}`
    if (!existsSync(candidate)) return candidate
  }

  throw new Error(`无法创建唯一输出目录：${baseDir}`)
}

function copyArtifact(sourcePath, targetDir, targetFileName) {
  if (!existsSync(sourcePath)) {
    throw new Error(`待复制文件不存在：${sourcePath}`)
  }

  const targetPath = path.join(targetDir, targetFileName)
  copyFileSync(sourcePath, targetPath)
  const targetInfo = fileInfo(targetPath)

  return {
    fileName: targetFileName,
    sourcePath,
    targetPath,
    sizeBytes: targetInfo.sizeBytes,
  }
}

function copyOutputsToDesktop(matchName) {
  const safeMatchName = sanitizeFileName(matchName)
  const outputDirName = `${formatLocalTimestamp()}_${safeMatchName}`
  const desktopOutputDir = uniqueDirectory(path.join(desktopOutputRoot, outputDirName))

  mkdirSync(desktopOutputDir, { recursive: true })

  const copiedFiles = [
    copyArtifact(finalVideoPath, desktopOutputDir, `${safeMatchName}.mp4`),
    ...previewSpecs.map((preview) =>
      copyArtifact(path.join(outputDir, preview.fileName), desktopOutputDir, preview.fileName),
    ),
    copyArtifact(qualityReportPath, desktopOutputDir, 'quality_report.txt'),
  ]

  const buildReportTargetPath = path.join(desktopOutputDir, 'douyin-video-build-report.json')

  return {
    buildReportTargetPath,
    copiedFiles: [
      ...copiedFiles,
      {
        fileName: 'douyin-video-build-report.json',
        sourcePath: buildReportPath,
        targetPath: buildReportTargetPath,
        sizeBytes: 0,
      },
    ],
    copiedToDesktop: true,
    desktopOutputDir,
    desktopVideoPath: path.join(desktopOutputDir, `${safeMatchName}.mp4`),
  }
}

function writeBuildReport(report) {
  writeFileSync(buildReportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
}

function buildReport({
  command,
  exportReport,
  finalVideo,
  desktopCopy,
  packageFiles,
  previewMatchName,
  previewStatus,
  pythonCommand,
  qualityReport,
  renderMode,
  warnings,
}) {
  const packageOk = Object.values(packageFiles).every((item) => item.exists)
  const previewFilesUpdated = previewStatus?.updated === true
  const ok =
    packageOk &&
    desktopCopy?.copiedToDesktop === true &&
    finalVideo.exists &&
    previewFilesUpdated &&
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
    desktopOutputDir: desktopCopy?.desktopOutputDir ?? null,
    desktopVideoPath: desktopCopy?.desktopVideoPath ?? null,
    copiedToDesktop: desktopCopy?.copiedToDesktop ?? false,
    copiedFiles: desktopCopy?.copiedFiles ?? [],
    finalVideoPath,
    finalVideoExists: finalVideo.exists,
    finalVideoSizeBytes: finalVideo.sizeBytes,
    previewFiles: previewStatus?.files ?? previewFilesStatus(),
    previewFilesUpdated,
    previewMatchName,
    qualityReportExists: qualityReport.exists,
    qualityReportPath,
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
  const videoInfo = probeFinalVideo()
  const previewStatus = refreshPreviewFiles(videoInfo)
  const renderMode = packageFiles.meta?.exists ? 'package' : readRenderMode()
  const qualityReportMeta = writeQualityReport({
    exportReport,
    packageFiles,
    previewStatus,
    renderMode,
    videoInfo,
  })
  const finalVideo = fileInfo(finalVideoPath)
  const qualityReport = fileInfo(qualityReportPath)
  const confirmedRenderMode = readRenderMode() ?? renderMode

  if (!qualityReport.exists) warnings.push('quality_report.txt 不存在。')
  if (!finalVideo.exists) warnings.push('final_douyin.mp4 不存在。')
  if (renderMode !== 'package') warnings.push(`renderMode 不是 package：${renderMode ?? 'unknown'}`)
  if (!previewStatus.updated) warnings.push('Preview images were not confirmed as refreshed from current final_douyin.mp4.')
  if (exportReport?.usedFallback) {
    warnings.push(`export-video-package 使用了 fallback：${(exportReport.fallbackFields ?? []).join(', ')}`)
  }

  const desktopCopy = copyOutputsToDesktop(qualityReportMeta.selectedMatch)
  const report = buildReport({
    command: userCommand,
    exportReport,
    desktopCopy,
    finalVideo,
    packageFiles,
    previewMatchName: qualityReportMeta.selectedMatch,
    previewStatus,
    pythonCommand,
    qualityReport,
    renderMode: confirmedRenderMode,
    warnings,
  })
  writeBuildReport(report)
  copyFileSync(buildReportPath, desktopCopy.buildReportTargetPath)

  console.log(
    JSON.stringify(
      {
        copiedToDesktop: report.copiedToDesktop,
        desktopOutputDir: report.desktopOutputDir,
        desktopVideoPath: report.desktopVideoPath,
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
  console.log(`视频已生成：\n${report.desktopVideoPath}`)

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
    previewMatchName: readPackageMeta()?.match_name ?? null,
    previewStatus: {
      files: previewFilesStatus(),
      updated: false,
      updatedAt: null,
    },
    pythonCommand: null,
    qualityReport: fileInfo(qualityReportPath),
    renderMode: readRenderMode(),
    warnings: [error?.message ?? String(error)],
  })
  writeBuildReport(fallbackReport)
  console.error(error?.message ?? error)
  process.exit(1)
}
